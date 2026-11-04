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
# Query credentials that must never reach an access log. Only the value is
# replaced, so the path and status stay useful for diagnostics.
_SENSITIVE_QUERY = re.compile(r"(?i)([?&](?:cap|ticket)=)[^&\s\"']*")
_REDACTED = "[redacted]"


def redact_sensitive_query(message: str) -> str:
    """Strip ``cap``/``ticket`` values from a rendered log line."""
    return _SENSITIVE_QUERY.sub(lambda match: match.group(1) + _REDACTED, message)


class SecretQueryFilter(logging.Filter):
    """Redact media capabilities and progress tickets from access records.

    Uvicorn's ``AccessFormatter.formatMessage`` unpacks ``record.args`` as the
    five-tuple ``(client_addr, method, full_path, http_version, status_code)``.
    Rewriting ``msg``/``args`` would break that formatter, so the standard shape
    is redacted in place: only the ``full_path`` element changes and the tuple,
    ``msg`` and status stay intact for uvicorn to format.

    Any other record falls back to redacting its rendered message, which keeps
    the filter useful for plain ``logging`` calls without changing the shape
    uvicorn expects.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            args = record.args
            if isinstance(args, tuple) and len(args) == 5:
                client_addr, method, full_path, http_version, status_code = args
                if not isinstance(full_path, str):
                    return True
                redacted_path = redact_sensitive_query(full_path)
                if redacted_path != full_path:
                    record.args = (
                        client_addr,
                        method,
                        redacted_path,
                        http_version,
                        status_code,
                    )
                return True
            rendered = record.getMessage()
            redacted = redact_sensitive_query(rendered)
            if redacted != rendered:
                record.msg = redacted
                record.args = None
        except Exception:  # noqa: BLE001 - logging must never raise
            return True
        return True


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True


def configure_access_log_redaction() -> None:
    """Attach the redaction filter to the uvicorn loggers exactly once.

    ``uvicorn.access`` carries HTTP access lines; ``uvicorn.error`` carries the
    WebSocket handshake lines (``"WebSocket <path> [accepted]"``, 403 and
    status lines) with a ``(client, path[, status])`` argument shape, which the
    filter's rendered-message fallback redacts. Both are needed because a
    logger's filters do not run for records propagated from a child logger.
    The filter sits on the logger, not a handler, so it keeps applying when
    uvicorn replaces handlers during its own logging configuration.
    """
    for name in ("uvicorn.access", "uvicorn.error"):
        logger = logging.getLogger(name)
        if not any(isinstance(item, SecretQueryFilter) for item in logger.filters):
            logger.addFilter(SecretQueryFilter())


def configure_request_logging() -> None:
    configure_access_log_redaction()
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
