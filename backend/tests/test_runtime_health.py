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
