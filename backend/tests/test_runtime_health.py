"""Runtime probes, readiness status, safe request correlation; no live services."""

import asyncio
import importlib
import logging
from pathlib import Path
import sqlite3
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, PropertyMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database
from app.services.runtime_health import (
    RequestIDFilter, RequestIDMiddleware, RuntimeHealth, configure_request_logging, request_id,
)


class RuntimeHealthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.storage = SimpleNamespace(root=root, ensure_root=lambda: None, is_s3_enabled=False)
        self.db = Database(root / "test.db", settings=Settings(_env_file=None))
        self.probes = RuntimeHealth(self.storage, self.db)

    async def test_pending_then_initialized_real_database_and_storage(self):
        self.assertEqual((await self.probes.core())["status"], "not_ready")
        with self.db.get_connection() as connection:
            connection.execute("CREATE TABLE users (id TEXT)")
        self.probes.initialized = True
        self.assertEqual((await self.probes.core())["status"], "ready")
        self.assertEqual(sorted(path.name for path in self.storage.root.iterdir()), ["test.db"])
        with self.db.get_connection() as connection:
            connection.execute("DROP TABLE users")
        self.assertEqual((await self.probes.core())["database"], "down")

    async def test_postgres_sqlite_fallback_is_not_ready(self):
        self.probes.initialized = True
        self.probes.database = SimpleNamespace(is_postgres=True, get_connection=self.db.get_connection)
        self.assertEqual((await self.probes.core())["database"], "down")

    async def test_postgres_failure_logs_no_credentials_or_paths(self):
        psycopg = SimpleNamespace(connect=Mock(side_effect=RuntimeError("secret-password /private")))
        with patch.object(Database, "is_postgres", new_callable=PropertyMock, return_value=True), \
             patch.dict("sys.modules", {"psycopg": psycopg,
                                        "psycopg.rows": SimpleNamespace(dict_row=object())}), \
             self.assertLogs("solotensor.db", "WARNING") as logs:
            with self.db.get_connection() as connection:
                connection.execute("SELECT 1").fetchone()
        self.assertNotIn("secret-password", str(logs.output))
        self.assertNotIn(str(self.db.db_path), str(logs.output))

    async def test_engine_timeout_safe_errors_and_driver_preserved(self):
        async def slow_ping():
            await asyncio.sleep(10)
        self.probes.core = AsyncMock(return_value={"status": "ready", "storage": "up",
                                                  "database": "up", "details": {}})
        with patch("app.services.runtime_health.PROBE_TIMEOUT", 0.02):
            started = time.monotonic()
            result = await self.probes.health(SimpleNamespace(ping=slow_ping),
                                              SimpleNamespace(ping=lambda: False, is_enabled=False))
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["database"], "sqlite")
        self.assertEqual(result["database_status"], "up")
        self.storage.ensure_root = Mock(side_effect=OSError("secret /private host:5432"))
        self.probes.core = RuntimeHealth.core.__get__(self.probes)
        result = await self.probes.core()
        self.assertNotIn("secret", str(result))
        self.assertNotIn("/private", str(result))

    async def test_blocking_probe_does_not_hold_event_loop(self):
        def slow():
            time.sleep(0.15)
            return True
        with patch("app.services.runtime_health.PROBE_TIMEOUT", 0.01):
            started = time.monotonic()
            self.assertFalse(await self.probes.blocking_check(slow))
            self.assertLess(time.monotonic() - started, 0.1)


class RequestCorrelationTests(unittest.TestCase):
    def test_success_handled_errors_invalid_ids_and_context_reset(self):
        app = FastAPI()
        app.add_middleware(RequestIDMiddleware)
        logger = logging.getLogger("runtime-test")
        correlation_filter = RequestIDFilter()
        logger.addFilter(correlation_filter)
        self.addCleanup(logger.removeFilter, correlation_filter)

        @app.get("/probe")
        async def probe(fail: bool = False):
            logger.info("probe")
            if fail:
                raise HTTPException(503, "Unavailable")
            return {"id": request_id.get()}

        client = TestClient(app)
        for incoming in ("valid_123-abc", "bad value", "x" * 65, ""):
            with self.subTest(incoming=incoming), self.assertLogs(logger, "INFO") as captured:
                response = client.get("/probe", headers={"X-Request-ID": incoming})
            outgoing = response.headers["X-Request-ID"]
            self.assertEqual(response.json()["id"], outgoing)
            self.assertEqual(captured.records[0].request_id, outgoing)
            if incoming == "valid_123-abc":
                self.assertEqual(outgoing, incoming)
            else:
                self.assertRegex(outgoing, r"^[a-f0-9]{32}$")
            # The same filter used by installed handlers annotates the active request.
            self.assertEqual(request_id.get(), "-")
        with self.assertLogs("comfy_studio.requests", "INFO") as captured:
            response = client.get("/probe?fail=true", headers={"X-Request-ID": "error-id"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers["X-Request-ID"], "error-id")
        self.assertNotIn("fail", captured.output[0])

    def test_unhandled_error_response_is_correlated_and_generic(self):
        app = FastAPI()
        app.add_middleware(RequestIDMiddleware)

        @app.get("/explode")
        async def explode():
            raise RuntimeError("secret /private host:5432")

        client = TestClient(app, raise_server_exceptions=False)
        with self.assertLogs("comfy_studio.requests", "INFO") as captured:
            response = client.get("/explode", headers={"X-Request-ID": "error-id"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.headers["X-Request-ID"], "error-id")
        self.assertEqual(response.text, "Internal Server Error")
        self.assertNotIn("secret", response.text)
        self.assertIn("status=500", captured.output[0])
        self.assertEqual(request_id.get(), "-")

    def test_logging_filter_matches_context_without_duplicate_handlers(self):
        handler = logging.StreamHandler()
        root = logging.getLogger()
        root.addHandler(handler)
        self.addCleanup(root.removeHandler, handler)
        before = len(root.handlers)
        configure_request_logging()
        configure_request_logging()
        self.assertEqual(len(root.handlers), before)
        self.assertEqual(sum(isinstance(item, RequestIDFilter) for item in handler.filters), 1)
        token = request_id.set("correlated-id")
        try:
            record = logging.makeLogRecord({"msg": "safe"})
            handler.filter(record)
            self.assertIn("correlated-id", handler.format(record))
        finally:
            request_id.reset(token)

    def test_access_log_filter_redacts_capability_and_ticket_values(self):
        from app.services.runtime_health import (
            SecretQueryFilter,
            configure_access_log_redaction,
            redact_sensitive_query,
        )

        logger = logging.getLogger("uvicorn.access")

        def _drop_secret_filters() -> None:
            for item in list(logger.filters):
                if isinstance(item, SecretQueryFilter):
                    logger.filters.remove(item)

        self.addCleanup(_drop_secret_filters)
        configure_access_log_redaction()
        configure_access_log_redaction()
        self.assertEqual(
            sum(isinstance(item, SecretQueryFilter) for item in logger.filters), 1
        )

        record = logging.LogRecord(
            name="uvicorn.access",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg='%s - "%s %s HTTP/%s" %d',
            args=(
                "127.0.0.1:5555",
                "GET",
                "/files/owner/p1/private.png?cap=secret-token&size=2",
                "1.1",
                200,
            ),
            exc_info=None,
        )
        secret_filter = next(
            item for item in logger.filters if isinstance(item, SecretQueryFilter)
        )
        self.assertTrue(secret_filter.filter(record))
        rendered = record.getMessage()
        self.assertIn("/files/owner/p1/private.png?cap=[redacted]&size=2", rendered)
        self.assertIn("200", rendered)
        self.assertNotIn("secret-token", rendered)

        ticket = redact_sensitive_query(
            'GET /api/v1/ws/progress?ticket=abc123&x=1 HTTP/1.1" 101'
        )
        self.assertEqual(
            ticket, 'GET /api/v1/ws/progress?ticket=[redacted]&x=1 HTTP/1.1" 101'
        )
        # Non-credential query values are untouched.
        self.assertEqual(
            redact_sensitive_query("GET /api/v1/gallery/me?limit=20 HTTP/1.1"),
            "GET /api/v1/gallery/me?limit=20 HTTP/1.1",
        )

    def test_real_uvicorn_access_formatter_still_formats_redacted_record(self):
        """The real uvicorn formatter must keep working after redaction.

        ``AccessFormatter.formatMessage`` unpacks ``record.args``; a filter that
        cleared them would raise and lose the log line. The filtered record must
        therefore still format, with the secret gone and path/status intact.
        """
        from uvicorn.logging import AccessFormatter

        from app.services.runtime_health import SecretQueryFilter

        record = logging.LogRecord(
            name="uvicorn.access",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg='%s - "%s %s HTTP/%s" %d',
            args=(
                "127.0.0.1:5555",
                "GET",
                "/files/owner/p1/private.png?cap=secret-token&size=2",
                "1.1",
                200,
            ),
            exc_info=None,
        )
        self.assertTrue(SecretQueryFilter().filter(record))
        self.assertIsInstance(record.args, tuple)
        self.assertEqual(len(record.args), 5)
        self.assertNotIn("secret-token", record.args[2])

        formatter = AccessFormatter(fmt="%(client_addr)s - %(request_line)s %(status_code)s")
        output = formatter.format(record)
        self.assertNotIn("secret-token", output)
        self.assertIn("/files/owner/p1/private.png?cap=[redacted]&size=2", output)
        self.assertIn("GET /files/owner/p1/private.png", output)
        self.assertIn("200 OK", output)

        ticket_record = logging.LogRecord(
            name="uvicorn.access",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg='%s - "%s %s HTTP/%s" %d',
            args=("127.0.0.1:5555", "GET", "/api/v1/ws/progress?ticket=abc123", "1.1", 101),
            exc_info=None,
        )
        self.assertTrue(SecretQueryFilter().filter(ticket_record))
        ticket_output = formatter.format(ticket_record)
        self.assertNotIn("abc123", ticket_output)
        self.assertIn("ticket=[redacted]", ticket_output)
        self.assertIn("101", ticket_output)

    def test_websocket_handshake_ticket_is_redacted_on_uvicorn_error(self):
        """uvicorn logs WS handshakes from ``uvicorn.error``, not access.

        The record shape there is ``(client, path)`` (or a 3-tuple with status),
        so the rendered-message fallback must redact it once the filter is
        attached to that logger too.
        """
        from app.services.runtime_health import (
            SecretQueryFilter,
            configure_access_log_redaction,
        )

        error_logger = logging.getLogger("uvicorn.error")
        access_logger = logging.getLogger("uvicorn.access")

        def _drop_secret_filters() -> None:
            for logger in (error_logger, access_logger):
                for item in list(logger.filters):
                    if isinstance(item, SecretQueryFilter):
                        logger.filters.remove(item)

        self.addCleanup(_drop_secret_filters)
        configure_access_log_redaction()
        configure_access_log_redaction()
        for logger in (access_logger, error_logger):
            self.assertEqual(
                sum(isinstance(item, SecretQueryFilter) for item in logger.filters),
                1,
                logger.name,
            )

        record = logging.LogRecord(
            name="uvicorn.error",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg='%s - "WebSocket %s" [accepted]',
            args=(
                ("127.0.0.1", 55299),
                "/api/v1/ws/progress?ticket=SECRETTICKETVALUE-abc123",
            ),
            exc_info=None,
        )
        secret_filter = next(
            item for item in error_logger.filters if isinstance(item, SecretQueryFilter)
        )
        self.assertTrue(secret_filter.filter(record))
        rendered = record.getMessage()
        self.assertNotIn("SECRETTICKETVALUE", rendered)
        self.assertIn("/api/v1/ws/progress?ticket=[redacted]", rendered)
        self.assertIn("[accepted]", rendered)

        # The 3-tuple form (status lines) is redacted the same way.
        status_record = logging.LogRecord(
            name="uvicorn.error",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg='%s - "WebSocket %s" %d',
            args=("127.0.0.1", "/api/v1/ws/progress?ticket=SECRETTICKETVALUE-abc123", 200),
            exc_info=None,
        )
        self.assertTrue(secret_filter.filter(status_record))
        status_rendered = status_record.getMessage()
        self.assertNotIn("SECRETTICKETVALUE", status_rendered)
        self.assertIn("ticket=[redacted]", status_rendered)
        self.assertIn("200", status_rendered)

        # The real uvicorn error formatter must still produce a line.
        from uvicorn.logging import DefaultFormatter

        formatter = DefaultFormatter(
            fmt="%(levelprefix)s %(message)s", use_colors=False
        )
        output = formatter.format(record)
        self.assertNotIn("SECRETTICKETVALUE", output)
        self.assertIn("/api/v1/ws/progress?ticket=[redacted]", output)
        self.assertIn("[accepted]", output)

    def test_filter_falls_back_to_rendered_message_for_plain_records(self):
        from app.services.runtime_health import SecretQueryFilter

        record = logging.LogRecord(
            name="some.other.logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="fetch /files/a/b.png?cap=leak",
            args=(),
            exc_info=None,
        )
        self.assertTrue(SecretQueryFilter().filter(record))
        self.assertNotIn("leak", record.getMessage())
        self.assertIn("cap=[redacted]", record.getMessage())

        filtered_record = logging.LogRecord(
            name="uvicorn.access",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg='%s - "%s %s HTTP/%s" %d',
            args=("127.0.0.1:5555", "GET", "/files/a/b.png?cap=leak", "1.1", 200),
            exc_info=None,
        )
        self.assertTrue(SecretQueryFilter().filter(filtered_record))
        self.assertNotIn("leak", filtered_record.args[2])
        self.assertEqual(filtered_record.msg, '%s - "%s %s HTTP/%s" %d')

        safe = logging.LogRecord(
            name="some.other.logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="fetch /api/v1/gallery/me?limit=20",
            args=(),
            exc_info=None,
        )
        self.assertTrue(SecretQueryFilter().filter(safe))
        self.assertEqual(safe.msg, "fetch /api/v1/gallery/me?limit=20")


class RuntimeRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.services.app_settings import AppSettingsService
        cls.directory = tempfile.TemporaryDirectory()
        root = Path(cls.directory.name)
        settings = Settings(_env_file=None, STORAGE_DIR=str(root / "storage"),
                            MODELS_DIR=str(root / "models"), TOOLS_DIR=str(root / "tools"),
                            DB_PATH=str(root / "test.db"))
        with patch("app.config.get_settings", return_value=settings), \
             patch.object(AppSettingsService, "load"):
            cls.main = importlib.import_module("app.main")

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_health_remains_200_when_engine_unavailable(self):
        result = {"status": "degraded", "comfy": "down", "storage": "up",
                  "database": "sqlite", "database_status": "up", "details": {}}
        service = SimpleNamespace(health=AsyncMock(return_value=result))
        with patch.object(self.main, "runtime_health", service), \
             patch.object(self.main, "get_comfy_client"):
            response = TestClient(self.main.app).get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["database"], "sqlite")
        self.assertEqual(response.json()["comfy"], "down")

    def test_bootstrap_keeps_readiness_pending_until_tables_initialized(self):
        captured = []
        database = Mock()
        service = SimpleNamespace(initialized=True)
        def initialize():
            self.assertFalse(service.initialized)
        database.init_db.side_effect = initialize
        def sync(**kwargs):
            self.assertTrue(service.initialized)
        database.sync_filesystem_to_db.side_effect = sync
        def thread(*, target, **kwargs):
            captured.append(target)
            return Mock()
        with patch.object(self.main, "db", database), \
             patch.object(self.main, "runtime_health", service), \
             patch("threading.Thread", side_effect=thread):
            asyncio.run(self.main._on_startup_bootstrap())
            self.assertFalse(service.initialized)
            captured[0]()
            self.assertTrue(service.initialized)
            service.initialized = False
            database.init_db.side_effect = RuntimeError("secret host /private")
            with self.assertLogs(self.main.logger, "WARNING") as logs:
                captured[0]()
            self.assertFalse(service.initialized)
            self.assertNotIn("secret", str(logs.output))

    def test_ready_status_mapping_and_no_engine_call(self):
        client = TestClient(self.main.app)
        for ready in (True, False):
            result = {"status": "ready" if ready else "not_ready", "storage": "up",
                      "database": "up" if ready else "down", "details": {}}
            service = SimpleNamespace(core=AsyncMock(return_value=result))
            with patch.object(self.main, "runtime_health", service), \
                 patch.object(self.main, "get_comfy_client") as comfy:
                response = client.get("/api/v1/ready")
            self.assertEqual(response.status_code, 200 if ready else 503)
            self.assertEqual(response.json(), result)
            self.assertIn("X-Request-ID", response.headers)
            comfy.assert_not_called()


if __name__ == "__main__":
    unittest.main()
