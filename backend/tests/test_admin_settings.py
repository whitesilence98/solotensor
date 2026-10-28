"""Admin provider-settings tests. No network, no real key, no real settings file."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

import app.main as main_module
from app.config import Settings
from app.main import app
from app.routers.auth import get_current_user
from app.schemas import UserResponse
from app.services.app_settings import AppSettingsService, proxy_for
from app.services.director import DirectorService, DirectorUnavailable
from app.services.rbac_service import get_rbac_service


def _user(user_id: str = "admin_1") -> UserResponse:
    return UserResponse(
        id=user_id,
        username="admin",
        email="admin@test.com",
        role="admin",
        created_at="2026-01-01T00:00:00Z",
    )


def _settings(**overrides: object) -> Settings:
    base = {
        "ANTHROPIC_API_KEY": None,
        "LOCAL_LLM_API_KEY": None,
        "LOCAL_LLM_URL": "http://127.0.0.1:11434",
        "LOCAL_LLM_MODEL": "llama3",
        "PROXY_URL": "",
        "PROXY_BYPASS_LOCAL": True,
    }
    base.update(overrides)
    return Settings(**base)


class AppSettingsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "app_settings.json"
        self.settings = _settings()
        self.service = AppSettingsService(self.settings, path=self.path)

    def tearDown(self) -> None:
        self.temp.cleanup()

    # --- masking ---------------------------------------------------------
    def test_snapshot_masks_keys_and_never_leaks_them(self) -> None:
        self.service.update({"anthropic_api_key": "sk-ant-secret-7f2a"})
        snapshot = self.service.snapshot()
        self.assertTrue(snapshot["anthropic_api_key_set"])
        self.assertEqual(snapshot["anthropic_api_key_hint"], "…7f2a")
        self.assertNotIn("sk-ant-secret-7f2a", json.dumps(snapshot))

    def test_short_key_is_fully_masked(self) -> None:
        self.service.update({"anthropic_api_key": "abc"})
        self.assertEqual(self.service.snapshot()["anthropic_api_key_hint"], "••••")

    def test_no_key_reports_not_set(self) -> None:
        snapshot = self.service.snapshot()
        self.assertFalse(snapshot["anthropic_api_key_set"])
        self.assertIsNone(snapshot["anthropic_api_key_hint"])

    # --- update semantics -------------------------------------------------
    def test_blank_key_leaves_existing_unchanged(self) -> None:
        self.service.update({"anthropic_api_key": "sk-ant-first"})
        self.service.update({"anthropic_api_key": ""})
        self.assertEqual(self.settings.ANTHROPIC_API_KEY, "sk-ant-first")

    def test_none_key_leaves_existing_unchanged(self) -> None:
        self.service.update({"anthropic_api_key": "sk-ant-first"})
        self.service.update({"anthropic_api_key": None})
        self.assertEqual(self.settings.ANTHROPIC_API_KEY, "sk-ant-first")

    def test_clear_flag_deletes_key(self) -> None:
        self.service.update({"anthropic_api_key": "sk-ant-first"})
        snapshot = self.service.update({"clear_anthropic_api_key": True})
        self.assertFalse(snapshot["anthropic_api_key_set"])
        self.assertIsNone(self.settings.ANTHROPIC_API_KEY)
        self.assertNotIn("anthropic_api_key", json.loads(self.path.read_text()))

    def test_update_persists_and_marks_source_file(self) -> None:
        snapshot = self.service.update({"anthropic_api_key": "sk-ant-new", "director_enabled": True})
        self.assertEqual(snapshot["sources"]["anthropic_api_key"], "file")
        self.assertTrue(self.settings.DIRECTOR_ENABLED)
        stored = json.loads(self.path.read_text())
        self.assertEqual(stored["anthropic_api_key"], "sk-ant-new")

    def test_socks_proxy_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.service.update({"proxy_url": "socks5://127.0.0.1:1080"})
        self.assertEqual(self.settings.PROXY_URL, "")

    def test_http_proxy_accepted(self) -> None:
        self.service.update({"proxy_url": "http://proxy.example.com:8080"})
        self.assertEqual(self.settings.PROXY_URL, "http://proxy.example.com:8080")

    def test_corrupt_file_is_ignored(self) -> None:
        self.path.write_text("{not json", encoding="utf-8")
        self.service.load()
        self.assertEqual(self.service.snapshot()["director_model"], self.settings.DIRECTOR_MODEL)

    def test_load_reapplies_file_onto_fresh_settings(self) -> None:
        self.service.update({"director_model": "claude-opus-5-5", "local_llm_model": "qwen"})
        fresh = _settings(DIRECTOR_MODEL="ignored", LOCAL_LLM_MODEL="ignored")
        AppSettingsService(fresh, path=self.path).load()
        self.assertEqual(fresh.DIRECTOR_MODEL, "claude-opus-5-5")
        self.assertEqual(fresh.LOCAL_LLM_MODEL, "qwen")

    def test_env_source_reported(self) -> None:
        with patch.dict("os.environ", {"DIRECTOR_MODEL": "from-env"}):
            self.assertEqual(self.service.snapshot()["sources"]["director_model"], "env")


class ProxyForTests(unittest.TestCase):
    def test_returns_proxy_for_remote_target(self) -> None:
        settings = _settings(PROXY_URL="http://proxy.local:3128")
        self.assertEqual(proxy_for("https://api.anthropic.com", settings), "http://proxy.local:3128")

    def test_bypasses_local_target(self) -> None:
        settings = _settings(PROXY_URL="http://proxy.local:3128")
        self.assertIsNone(proxy_for("http://127.0.0.1:11434", settings))
        self.assertIsNone(proxy_for("http://localhost:8188", settings))

    def test_local_target_uses_proxy_when_bypass_off(self) -> None:
        settings = _settings(PROXY_URL="http://proxy.local:3128", PROXY_BYPASS_LOCAL=False)
        self.assertEqual(proxy_for("http://127.0.0.1:11434", settings), "http://proxy.local:3128")

    def test_no_proxy_configured(self) -> None:
        self.assertIsNone(proxy_for("https://api.anthropic.com", _settings()))


class ClientResetTests(unittest.IsolatedAsyncioTestCase):
    async def test_director_reset_closes_and_discards_client(self) -> None:
        client = MagicMock()
        client.close = AsyncMock()
        service = DirectorService(_settings(), anthropic_client=client)
        self.assertIsNotNone(service._anthropic)
        await service.reset_client()
        client.close.assert_awaited_once()
        self.assertIsNone(service._anthropic)

    async def test_assistant_reset_closes_and_discards_client(self) -> None:
        from app.services.code_assistant import CodeAssistantService

        client = MagicMock()
        client.close = AsyncMock()
        service = CodeAssistantService(_settings(), client=client)
        await service.reset_client()
        client.close.assert_awaited_once()
        self.assertIsNone(service.client)


class AppSettingsRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "app_settings.json"
        self.settings = _settings()
        self.service = AppSettingsService(self.settings, path=self.path)
        self.rbac = MagicMock()
        self.rbac.has_permission = AsyncMock(return_value=True)
        self.rbac.log_audit = AsyncMock(return_value="audit_1")
        app.dependency_overrides[get_rbac_service] = lambda: self.rbac
        app.dependency_overrides[get_current_user] = lambda: _user()
        self.patch = patch(
            "app.routers.admin_settings.get_app_settings_service", lambda: self.service
        )
        self.patch.start()

    def tearDown(self) -> None:
        self.patch.stop()
        app.dependency_overrides.pop(get_rbac_service, None)
        app.dependency_overrides.pop(get_current_user, None)
        self.temp.cleanup()

    def _forbid(self):
        denied = MagicMock()
        denied.has_permission = AsyncMock(return_value=False)
        return denied

    def test_unauthenticated_is_401(self) -> None:
        from fastapi import HTTPException

        def _deny() -> None:
            raise HTTPException(status_code=401, detail="INVALID_OR_MISSING_AUTHENTICATION")

        app.dependency_overrides[get_current_user] = _deny
        self.assertEqual(self.client.get("/api/admin/settings").status_code, 401)

    def test_without_permission_is_403(self) -> None:
        app.dependency_overrides[get_rbac_service] = lambda: self._forbid()
        self.assertEqual(self.client.get("/api/admin/settings").status_code, 403)

    def test_get_masks_keys(self) -> None:
        self.service.update({"anthropic_api_key": "sk-ant-secret-7f2a"})
        body = self.client.get("/api/admin/settings").json()
        self.assertEqual(body["anthropic_api_key_hint"], "…7f2a")
        self.assertNotIn("sk-ant-secret-7f2a", json.dumps(body))

    def test_patch_writes_file_and_resets_clients(self) -> None:
        with patch.object(
            main_module.code_assistant, "reset_client", AsyncMock()
        ) as reset_a, patch.object(
            main_module.director, "reset_client", AsyncMock()
        ) as reset_d:
            response = self.client.patch(
                "/api/admin/settings", json={"anthropic_api_key": "sk-ant-new-key", "director_enabled": True}
            )
            reset_a.assert_awaited_once()
            reset_d.assert_awaited_once()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sources"]["anthropic_api_key"], "file")
        self.assertEqual(json.loads(self.path.read_text())["anthropic_api_key"], "sk-ant-new-key")

    def test_patch_audit_never_contains_key_value(self) -> None:
        self.client.patch("/api/admin/settings", json={"anthropic_api_key": "sk-ant-leak-me"})
        details = json.dumps(self.rbac.log_audit.await_args.kwargs["details"])
        self.assertNotIn("sk-ant-leak-me", details)
        self.assertIn("anthropic_api_key", details)

    def test_patch_socks_proxy_is_422(self) -> None:
        response = self.client.patch("/api/admin/settings", json={"proxy_url": "socks5://x:1"})
        self.assertEqual(response.status_code, 422)

    def test_delete_key_removes_it(self) -> None:
        self.service.update({"anthropic_api_key": "sk-ant-secret-7f2a"})
        response = self.client.delete("/api/admin/settings/keys/anthropic")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["anthropic_api_key_set"])

    def test_delete_unknown_provider_is_404(self) -> None:
        self.assertEqual(
            self.client.delete("/api/admin/settings/keys/bogus").status_code, 404
        )

    def test_probe_error_is_200_with_ok_false(self) -> None:
        with patch.object(
            main_module.director,
            "_reply_local",
            AsyncMock(side_effect=DirectorUnavailable("no model")),
        ):
            response = self.client.post("/api/admin/settings/test", json={"provider": "local"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["ok"])
        self.assertIn("no model", body["detail"])

    def test_probe_success_is_ok(self) -> None:
        reply = MagicMock()
        with patch.object(main_module.director, "_reply_anthropic", AsyncMock(return_value=reply)):
            response = self.client.post(
                "/api/admin/settings/test", json={"provider": "anthropic"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])


if __name__ == "__main__":
    unittest.main()
