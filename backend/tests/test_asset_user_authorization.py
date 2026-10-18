"""Security and regression audit tests for mandatory asset-user authorization rules.

Covers:
1. Strict HTTP 401 Unauthorized enforcement on:
   - POST /api/v1/generate
   - POST /api/tools/execute
   - POST /api/tools/{tool_id}/run
   When invoked without Authorization headers, with malformed tokens, or with invalid keys.
2. Mandatory asset-user attribution verification:
   - Authenticated generation records in SQLite database (`generations` table) must have
     a non-null `user_id` strictly matching the authenticated caller.
   - Storage metadata sidecar files (*.png.json) written to disk must have a non-null `user_id`
     matching the authenticated caller.
   - Cross-user isolation ensuring User A and User B cannot forge or contaminate asset attribution.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app
from app.schemas import ToolAspectRatio, ToolDetail, ToolMode
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.mailer_service import MailerService, set_mailer_service
from app.services.storage import StorageService


class TestAssetUserAuthorizationSecurity(unittest.TestCase):
    """Asserts strict HTTP 401 Unauthorized for unauthenticated, malformed, or invalid auth callers."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "auth_security.db")
        self.storage_dir = os.path.join(self.temp_dir.name, "storage")
        self.settings = Settings(
            DB_PATH=self.db_path,
            STORAGE_DIR=self.storage_dir,
            JWT_SECRET="auth-security-test-secret-key-32chars!",
        )
        self.db = Database(db_path=self.db_path, settings=self.settings)
        self.db.init_db()
        set_db(self.db)

        self.credits = CreditService(db=self.db, settings=self.settings)
        self.provider = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        self.mailer = MailerService(settings=self.settings)
        self.storage = StorageService(settings=self.settings)

        set_auth_provider(self.provider)
        set_credit_service(self.credits)
        set_mailer_service(self.mailer)

        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

        self.valid_generate_payload = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "prompt": "high quality oil painting",
        }
        self.valid_tool_payload = {
            "tool_id": "t" * 32,
            "prompt": "cyberpunk portrait",
            "aspect_ratio": "1:1",
        }

    def tearDown(self) -> None:
        set_auth_provider(None)
        set_credit_service(None)
        set_mailer_service(None)
        set_db(None)
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    # --- POST /api/v1/generate authorization enforcement --------------------

    def test_generate_without_authorization_header_returns_401(self) -> None:
        resp = self.client.post("/api/v1/generate", json=self.valid_generate_payload)
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    def test_generate_with_malformed_bearer_tokens_returns_401(self) -> None:
        malformed_headers = [
            {"Authorization": "Bearer "},
            {"Authorization": "Bearer not-a-jwt"},
            {"Authorization": "Bearer header.payload"},  # only 2 parts
            {"Authorization": "Bearer header.payload.signature.extra"},  # 4 parts
            {"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.invalid-payload.signature"},
            {"Authorization": "Basic dXNlcjpwYXNz"},  # wrong auth scheme
            {"Authorization": "Token 1234567890"},
        ]
        for headers in malformed_headers:
            with self.subTest(headers=headers):
                resp = self.client.post("/api/v1/generate", json=self.valid_generate_payload, headers=headers)
                self.assertEqual(resp.status_code, 401)
                self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    def test_generate_with_invalid_api_keys_returns_401(self) -> None:
        invalid_key_headers = [
            {"X-SoloTensor-Key": ""},
            {"X-SoloTensor-Key": "invalid_key_format"},
            {"X-SoloTensor-Key": "sk_live_1234567890"},
            {"X-SoloTensor-Key": "st_live_nonexistent_key_1234567890abcdef"},
            {"X-SoloTensor-Key": "bearer_token_in_key_header"},
        ]
        for headers in invalid_key_headers:
            with self.subTest(headers=headers):
                resp = self.client.post("/api/v1/generate", json=self.valid_generate_payload, headers=headers)
                self.assertEqual(resp.status_code, 401)
                self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    # --- POST /api/tools/execute authorization enforcement -------------------

    def test_tools_execute_without_authorization_header_returns_401(self) -> None:
        resp = self.client.post("/api/tools/execute", json=self.valid_tool_payload)
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    def test_tools_execute_with_malformed_bearer_tokens_returns_401(self) -> None:
        malformed_headers = [
            {"Authorization": "Bearer "},
            {"Authorization": "Bearer invalid.jwt.structure"},
            {"Authorization": "Bearer random_string_not_jwt"},
            {"Authorization": "Basic user:pass"},
        ]
        for headers in malformed_headers:
            with self.subTest(headers=headers):
                resp = self.client.post("/api/tools/execute", json=self.valid_tool_payload, headers=headers)
                self.assertEqual(resp.status_code, 401)
                self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    def test_tools_execute_with_invalid_api_keys_returns_401(self) -> None:
        invalid_key_headers = [
            {"X-SoloTensor-Key": "invalid_key_xyz"},
            {"X-SoloTensor-Key": "st_live_not_registered_in_database_hash"},
        ]
        for headers in invalid_key_headers:
            with self.subTest(headers=headers):
                resp = self.client.post("/api/tools/execute", json=self.valid_tool_payload, headers=headers)
                self.assertEqual(resp.status_code, 401)
                self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    # --- POST /api/tools/{tool_id}/run authorization enforcement ------------

    def test_tools_run_form_without_authorization_returns_401(self) -> None:
        resp = self.client.post(f"/api/tools/{'t' * 32}/run", data={"prompt": "test"})
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    def test_tools_run_form_with_invalid_auth_returns_401(self) -> None:
        resp = self.client.post(
            f"/api/tools/{'t' * 32}/run",
            data={"prompt": "test"},
            headers={"Authorization": "Bearer corrupted_token"},
        )
        self.assertEqual(resp.status_code, 401)


class TestAssetUserAttributionAndSidecarPersistence(unittest.TestCase):
    """Asserts non-null matching user_id in SQLite generations table and storage sidecars."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "asset_attrib.db")
        self.storage_dir = os.path.join(self.temp_dir.name, "storage")
        self.settings = Settings(
            DB_PATH=self.db_path,
            STORAGE_DIR=self.storage_dir,
            JWT_SECRET="asset-attrib-jwt-secret-key-32chars!",
        )
        self.db = Database(db_path=self.db_path, settings=self.settings)
        self.db.init_db()
        set_db(self.db)

        self.credits = CreditService(db=self.db, settings=self.settings)
        self.provider = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        self.mailer = MailerService(settings=self.settings)
        self.storage = StorageService(settings=self.settings)

        set_auth_provider(self.provider)
        set_credit_service(self.credits)
        set_mailer_service(self.mailer)

        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

        # Mock ComfyUI client
        self.mock_comfy = AsyncMock()
        self.mock_comfy.resolve_model_name = AsyncMock(return_value="sd_model.safetensors")
        self.mock_comfy.build_gallery_workflow = MagicMock(return_value={})
        self.mock_comfy.queue_prompt = AsyncMock(return_value="prompt-gen-uuid-12345")
        self.mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        self.mock_comfy.list_images = AsyncMock(return_value=[{"filename": "gen_image_output.png"}])
        self.mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"\x89PNG\r\n\x1a\nfake-image-bytes")

        # Mock model_storage service
        self.mock_model_storage = MagicMock()
        self.mock_model_storage.resolve_installed_gallery_file.return_value = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "title": "SD Checkpoint",
            "model_type": "Checkpoint",
            "version_name": "v1.0",
            "category": "checkpoints",
            "filename": "sd_model.safetensors",
        }

        # Mock AI tool service
        self.mock_tool_svc = MagicMock()
        mock_detail = MagicMock(spec=ToolDetail)
        mock_detail.controls = []
        mock_detail.requires_image = False
        mock_detail.output_kind = "image"
        mock_detail.name = "Test Generator Tool"
        mock_detail.mode = ToolMode.TEXT_TO_IMAGE
        self.mock_tool_svc.get.return_value = {"default_aspect_ratio": "1:1"}
        self.mock_tool_svc.detail.return_value = mock_detail
        self.mock_tool_svc.build_graph.return_value = ({}, {"width": 512, "height": 512})

    def tearDown(self) -> None:
        set_auth_provider(None)
        set_credit_service(None)
        set_mailer_service(None)
        set_db(None)
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def test_generate_authenticated_persists_user_id_in_sqlite_and_sidecar(self) -> None:
        # 1. Create authenticated creator user
        user = self.provider.create_user("creator_alpha@test.com", "alpha_creator", "SecretPass123!", "Alpha Creator")
        token = self.provider.create_token(user)

        with patch("app.main.get_comfy_client", return_value=self.mock_comfy), \
             patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.storage", self.storage):

            resp = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": "a" * 32,
                    "version_id": "b" * 32,
                    "file_id": "c" * 32,
                    "prompt": "sunset mountain landscape",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(resp.status_code, 200)

        # 2. Verify SQLite generations record
        with self.db.get_connection() as conn:
            row = conn.execute(
                "SELECT id, prompt_id, user_id, filename, key, origin, metadata_json FROM generations WHERE prompt_id = ?",
                ("prompt-gen-uuid-12345",),
            ).fetchone()
            self.assertIsNotNone(row, "Generation record must be present in SQLite database")
            self.assertIsNotNone(row["user_id"], "user_id in generations table must not be null")
            self.assertEqual(row["user_id"], user.id, "user_id in generations table must match authenticated caller")
            self.assertEqual(row["origin"], "generation")

            metadata_dict = json.loads(row["metadata_json"])
            self.assertEqual(metadata_dict.get("user_id"), user.id)

        # 3. Verify storage metadata sidecar file on disk
        sidecars = list(self.storage.root.rglob("*.json"))
        self.assertGreaterEqual(len(sidecars), 1, "At least one metadata sidecar file must be written")

        for sidecar_path in sidecars:
            sidecar_data = json.loads(sidecar_path.read_text(encoding="utf-8"))
            self.assertIsNotNone(sidecar_data.get("user_id"), "Sidecar metadata user_id must not be null")
            self.assertEqual(
                sidecar_data.get("user_id"),
                user.id,
                f"Sidecar metadata user_id must match authenticated caller {user.id}",
            )

    def test_tools_execute_authenticated_persists_user_id_in_sqlite_and_sidecar(self) -> None:
        # 1. Create authenticated tool user and generate an API key
        user = self.provider.create_user("tool_artist@test.com", "tool_artist", "SecretPass123!", "Tool Artist")
        _, raw_key = self.provider.create_api_key(user_id=user.id, name="Test Studio API Key")

        # Mock comfy outputs for tools
        mock_tool_comfy = AsyncMock()
        mock_tool_comfy.queue_prompt = AsyncMock(return_value="prompt-tool-uuid-67890")
        mock_tool_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_tool_comfy.list_output_files = AsyncMock(return_value=[{"filename": "tool_rendered.png"}])
        mock_tool_comfy.fetch_image_bytes = AsyncMock(return_value=b"\x89PNG\r\n\x1a\nrendered-bytes")

        with patch("app.main.get_comfy_client", return_value=mock_tool_comfy), \
             patch("app.main.get_ai_tool_service", return_value=self.mock_tool_svc), \
             patch("app.main.storage", self.storage):

            resp = self.client.post(
                "/api/tools/execute",
                json={
                    "tool_id": "t" * 32,
                    "prompt": "cyberpunk street with rain",
                    "aspect_ratio": "1:1",
                },
                headers={"X-SoloTensor-Key": raw_key},
            )
            self.assertEqual(resp.status_code, 200)

        # 2. Verify SQLite generations record
        with self.db.get_connection() as conn:
            row = conn.execute(
                "SELECT id, prompt_id, user_id, filename, key, origin, metadata_json FROM generations WHERE prompt_id = ?",
                ("prompt-tool-uuid-67890",),
            ).fetchone()
            self.assertIsNotNone(row, "Tool generation record must be saved in SQLite database")
            self.assertIsNotNone(row["user_id"], "user_id in generations table must not be null")
            self.assertEqual(row["user_id"], user.id, "user_id in generations table must match authenticated caller")
            self.assertEqual(row["origin"], "ai_tool_studio")

            metadata_dict = json.loads(row["metadata_json"])
            self.assertEqual(metadata_dict.get("user_id"), user.id)

        # 3. Verify storage metadata sidecar file on disk
        sidecars = list(self.storage.root.rglob("*.json"))
        self.assertGreaterEqual(len(sidecars), 1)

        for sidecar_path in sidecars:
            sidecar_data = json.loads(sidecar_path.read_text(encoding="utf-8"))
            self.assertIsNotNone(sidecar_data.get("user_id"), "Sidecar metadata user_id must not be null")
            self.assertEqual(
                sidecar_data.get("user_id"),
                user.id,
                f"Sidecar metadata user_id must match authenticated caller {user.id}",
            )

    def test_multi_user_isolation_attribution(self) -> None:
        """Verifies distinct callers receive correct, isolated user_id attribution in DB and storage."""
        # User Alpha
        user_alpha = self.provider.create_user("user_a@test.com", "usera", "Pass123!", "User Alpha")
        token_alpha = self.provider.create_token(user_alpha)

        # User Beta
        user_beta = self.provider.create_user("user_b@test.com", "userb", "Pass123!", "User Beta")
        token_beta = self.provider.create_token(user_beta)

        # Execute generation for User Alpha
        self.mock_comfy.queue_prompt = AsyncMock(return_value="prompt-user-alpha-1")
        with patch("app.main.get_comfy_client", return_value=self.mock_comfy), \
             patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.storage", self.storage):

            resp_a = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": "a" * 32,
                    "version_id": "b" * 32,
                    "file_id": "c" * 32,
                    "prompt": "user alpha artwork",
                },
                headers={"Authorization": f"Bearer {token_alpha}"},
            )
            self.assertEqual(resp_a.status_code, 200)

        # Execute generation for User Beta
        self.mock_comfy.queue_prompt = AsyncMock(return_value="prompt-user-beta-2")
        with patch("app.main.get_comfy_client", return_value=self.mock_comfy), \
             patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.storage", self.storage):

            resp_b = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": "a" * 32,
                    "version_id": "b" * 32,
                    "file_id": "c" * 32,
                    "prompt": "user beta artwork",
                },
                headers={"Authorization": f"Bearer {token_beta}"},
            )
            self.assertEqual(resp_b.status_code, 200)

        # Verify DB queries
        with self.db.get_connection() as conn:
            row_a = conn.execute("SELECT user_id FROM generations WHERE prompt_id = ?", ("prompt-user-alpha-1",)).fetchone()
            row_b = conn.execute("SELECT user_id FROM generations WHERE prompt_id = ?", ("prompt-user-beta-2",)).fetchone()

            self.assertIsNotNone(row_a)
            self.assertIsNotNone(row_b)
            self.assertEqual(row_a["user_id"], user_alpha.id)
            self.assertEqual(row_b["user_id"], user_beta.id)
            self.assertNotEqual(row_a["user_id"], row_b["user_id"])

        # Verify storage folder separation (namespace=user.id)
        alpha_dir = Path(self.storage_dir) / user_alpha.id
        beta_dir = Path(self.storage_dir) / user_beta.id
        self.assertTrue(alpha_dir.exists(), "User Alpha directory must exist in storage")
        self.assertTrue(beta_dir.exists(), "User Beta directory must exist in storage")

        # Verify sidecars in respective directories
        alpha_sidecars = list(alpha_dir.rglob("*.json"))
        beta_sidecars = list(beta_dir.rglob("*.json"))
        self.assertGreaterEqual(len(alpha_sidecars), 1)
        self.assertGreaterEqual(len(beta_sidecars), 1)

        for sc in alpha_sidecars:
            meta = json.loads(sc.read_text(encoding="utf-8"))
            self.assertEqual(meta.get("user_id"), user_alpha.id)

        for sc in beta_sidecars:
            meta = json.loads(sc.read_text(encoding="utf-8"))
            self.assertEqual(meta.get("user_id"), user_beta.id)


if __name__ == "__main__":
    unittest.main()
