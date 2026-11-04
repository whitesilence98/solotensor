"""Bounded runtime probes and request correlation; no public infrastructure details."""

import asyncio
from contextvars import ContextVar
import logging
from pathlib import Path
import re
import tempfile
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from ..db import PostgresConnectionWrapper

PROBE_TIMEOUT = 1.0
request_id: ContextVar[str] = ContextVar("request_id", default="-")
_REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True


def configure_request_logging() -> None:
    for handler in logging.getLogger().handlers:
        if not any(isinstance(item, RequestIDFilter) for item in handler.filters):
            handler.addFilter(RequestIDFilter())
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s]: %(message)s"
        ))


class RequestIDMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        incoming = next((value.decode("latin-1") for key, value in scope["headers"]
                         if key.lower() == b"x-request-id"), "")
        value = incoming if _REQUEST_ID.fullmatch(incoming) else uuid4().hex
        token = request_id.set(value)
        response_started = False

        async def correlated_send(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                message["headers"] = [(key, val) for key, val in message.get("headers", [])
                                      if key.lower() != b"x-request-id"]
                message["headers"].append((b"x-request-id", value.encode("ascii")))
                logging.getLogger("comfy_studio.requests").info(
                    "HTTP response status=%s", message["status"]
                )
            await send(message)

        try:
            await self.app(scope, receive, correlated_send)
        except Exception:
            # An unhandled route exception is normally answered by the outer
            # ServerErrorMiddleware, which would bypass this correlation wrapper.
            # Emit the same generic 500 here so the error response stays correlated.
            if not response_started:
                body = b"Internal Server Error"
                await correlated_send({
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"text/plain; charset=utf-8"),
                        (b"content-length", str(len(body)).encode("ascii")),
                    ],
                })
                await correlated_send({"type": "http.response.body", "body": body})
            raise
        finally:
            request_id.reset(token)


class RuntimeHealth:
    def __init__(self, storage, database):
        self.storage = storage
        self.database = database
        self.initialized = False

    def check_storage(self) -> bool:
        # Read, write, delete a unique private probe; never touch existing assets.
        self.storage.ensure_root()
        with tempfile.TemporaryFile(dir=Path(self.storage.root)) as probe:
            probe.write(b"ready")
            probe.flush()
            probe.seek(0)
            return probe.read() == b"ready"

    def check_database(self) -> bool:
        if not self.initialized:
            return False
        with self.database.get_connection() as connection:
            if self.database.is_postgres and not isinstance(connection, PostgresConnectionWrapper):
                return False
            # Query a required table, not merely a live socket or SELECT 1.
            connection.execute("SELECT id FROM users LIMIT 1").fetchone()
        return True

    @staticmethod
    async def blocking_check(check) -> bool:
        try:
            return bool(await asyncio.wait_for(run_in_threadpool(check), PROBE_TIMEOUT))
        except Exception:
            return False

    async def core(self) -> dict:
        storage_ok, database_ok = await asyncio.gather(
            self.blocking_check(self.check_storage), self.blocking_check(self.check_database)
        )
        details = {}
        if not storage_ok:
            details["storage"] = "Storage is unavailable"
        if not database_ok:
            details["database"] = "Database is unavailable or initializing"
        return {"status": "ready" if storage_ok and database_ok else "not_ready",
                "storage": "up" if storage_ok else "down",
                "database": "up" if database_ok else "down", "details": details}

    async def health(self, comfy, redis_service) -> dict:
        async def engine_check():
            try:
                return bool(await asyncio.wait_for(comfy.ping(), PROBE_TIMEOUT))
            except Exception:
                return False

        core, comfy_ok, redis_ok = await asyncio.gather(
            self.core(), engine_check(), self.blocking_check(redis_service.ping)
        )
        details = dict(core["details"])
        if not comfy_ok:
            details["comfy"] = "Generation engine is unavailable"
        return {"status": "ok" if core["status"] == "ready" and comfy_ok else "degraded",
                "comfy": "up" if comfy_ok else "down", "storage": core["storage"],
                "database": "postgresql" if self.database.is_postgres else "sqlite",
                "database_status": core["database"],
                "redis": "up" if redis_ok else ("down" if redis_service.is_enabled else "disabled"),
                "s3": "enabled" if self.storage.is_s3_enabled else "disabled",
                "details": details}
