"""Tests for gallery authentication, authorization, and multi-tenant user asset isolation."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app
import app.main as main_mod
from app.services.ai_tools import AIToolService, set_ai_tool_service
from app.services.auth_service import LocalAuthProvider, hash_password, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.storage import StorageService


class TestGalleryAuthAndIsolation(unittest.TestCase):
    """Asserts authentication requirements and tenant isolation on private gallery endpoints."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root_path = Path(self.temp_dir.name)
        self.db_path = str(self.root_path / "test_gallery_auth.db")
        self.storage_dir = str(self.root_path / "storage")
        self.tools_dir = str(self.root_path / "tools")

        self.settings = Settings(
            DB_PATH=self.db_path,
            STORAGE_DIR=self.storage_dir,
            TOOLS_DIR=self.tools_dir,
            JWT_SECRET="gallery-auth-test-secret-key-32chars!",
            FILES_PUBLIC_BASE="http://testserver",
        )

        # Database
        self.db = Database(db_path=self.db_path, settings=self.settings)
        self.db.init_db()
        set_db(self.db)

        # Credits & Auth
        self.credits = CreditService(db=self.db, settings=self.settings)
        self.provider = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        set_auth_provider(self.provider)
        set_credit_service(self.credits)

        # Isolated Storage
        self.orig_storage = main_mod.storage
        self.storage = StorageService(settings=self.settings)
        self.storage.ensure_root()
        main_mod.storage = self.storage

        # Isolated AI Tools
        self.tools_service = AIToolService(self.settings)
        set_ai_tool_service(self.tools_service)

        # FastAPI Client
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

        # Seed Users: user_alpha & user_beta
        alpha_row = self.db.create_user(
            user_id="user_alpha",
            email="alpha@test.com",
            username="user_alpha",
            hashed_password=hash_password("password_alpha_123"),
            display_name="User Alpha",
        )
        self.credits.init_user_credits(user_id="user_alpha")
        self.user_alpha = self.provider._build_user_response(alpha_row)
        self.token_alpha = self.provider.create_token(self.user_alpha)

        beta_row = self.db.create_user(
            user_id="user_beta",
            email="beta@test.com",
            username="user_beta",
            hashed_password=hash_password("password_beta_123"),
            display_name="User Beta",
        )
        self.credits.init_user_credits(user_id="user_beta")
        self.user_beta = self.provider._build_user_response(beta_row)
        self.token_beta = self.provider.create_token(self.user_beta)

    def tearDown(self) -> None:
        main_mod.storage = self.orig_storage
        set_ai_tool_service(None)
        set_auth_provider(None)
        set_credit_service(None)
        set_db(None)
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def _seed_asset(
        self,
        namespace: str,
        prompt_id: str,
        filename: str,
        user_id: str,
        prompt_text: str = "test prompt",
        gallery_saved: bool = True,
    ) -> Path:
        asset_dir = Path(self.storage_dir) / namespace / prompt_id
        asset_dir.mkdir(parents=True, exist_ok=True)
        media_path = asset_dir / filename
        media_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"fake-png-content")
        sidecar_path = asset_dir / f"{filename}.json"
        metadata = {
            "prompt": prompt_text,
            "user_id": user_id,
            "gallery_saved": gallery_saved,
            "origin": "generation",
        }
        sidecar_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        return media_path

    # --- Test 1: GET /api/v1/gallery/me without Auth -------------------------

    def test_get_gallery_me_without_authorization_header_returns_401(self) -> None:
        """Calling GET /api/v1/gallery/me without Authorization header must return HTTP 401 Unauthorized."""
        resp = self.client.get("/api/v1/gallery/me")
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

    def test_get_gallery_me_with_malformed_token_returns_401(self) -> None:
        """Calling GET /api/v1/gallery/me with invalid or malformed token must return HTTP 401 Unauthorized."""
        bad_headers = [
            {"Authorization": "Bearer invalid.jwt.token"},
            {"Authorization": "Bearer "},
            {"Authorization": "Basic dXNlcjpwYXNz"},
        ]
        for headers in bad_headers:
            with self.subTest(headers=headers):
                resp = self.client.get("/api/v1/gallery/me", headers=headers)
                self.assertEqual(resp.status_code, 401)

    # --- Test 2: GET /api/v1/gallery?user_id=me without Auth -----------------

    def test_get_gallery_with_user_id_me_without_authorization_header_returns_401(self) -> None:
        """Calling GET /api/v1/gallery?user_id=me without Authorization header must return HTTP 401 Unauthorized."""
        resp = self.client.get("/api/v1/gallery?user_id=me")
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json().get("detail"), "Authentication required for user_id='me'")

    # --- Test 3: User Asset Isolation & Privacy ------------------------------

    def test_user_asset_isolation_and_privacy(self) -> None:
        """Assert strict asset isolation between user_alpha and user_beta.

        - Seed assets for user_alpha and user_beta.
        - GET /api/v1/gallery/me with user_alpha's token must ONLY return user_alpha's assets.
        - GET /api/v1/gallery/me with user_beta's token must ONLY return user_beta's assets.
        - GET /api/v1/gallery?user_id=me with user_alpha's token must return identical user_alpha assets.
        - GET /api/v1/gallery?user_id=me with user_beta's token must return identical user_beta assets.
        """
        # Seed 2 assets for user_alpha
        self._seed_asset(
            namespace="user_alpha",
            prompt_id="prompt_alpha_1",
            filename="alpha_img1.png",
            user_id="user_alpha",
            prompt_text="majestic lion in twilight",
        )
        self._seed_asset(
            namespace="user_alpha",
            prompt_id="prompt_alpha_2",
            filename="alpha_img2.png",
            user_id="user_alpha",
            prompt_text="cyberpunk skyline with neon rain",
        )

        # Seed 2 assets for user_beta
        self._seed_asset(
            namespace="user_beta",
            prompt_id="prompt_beta_1",
            filename="beta_img1.png",
            user_id="user_beta",
            prompt_text="serene mountain landscape",
        )
        self._seed_asset(
            namespace="user_beta",
            prompt_id="prompt_beta_2",
            filename="beta_img2.png",
            user_id="user_beta",
            prompt_text="steampunk clockwork workshop",
        )

        # 1. GET /api/v1/gallery/me as user_alpha
        headers_alpha = {"Authorization": f"Bearer {self.token_alpha}"}
        resp_a = self.client.get("/api/v1/gallery/me", headers=headers_alpha)
        self.assertEqual(resp_a.status_code, 200)
        items_a = resp_a.json().get("items", [])
        self.assertEqual(len(items_a), 2)

        # Assert every returned item belongs exclusively to user_alpha
        for item in items_a:
            self.assertEqual(item["metadata"]["user_id"], "user_alpha")
            self.assertIn("user_alpha", item["key"])
            self.assertNotIn("user_beta", item["key"])

        # Assert user_beta's assets are completely absent
        keys_a = [item["key"] for item in items_a]
        self.assertFalse(any("user_beta" in k for k in keys_a))

        # 2. GET /api/v1/gallery/me as user_beta
        headers_beta = {"Authorization": f"Bearer {self.token_beta}"}
        resp_b = self.client.get("/api/v1/gallery/me", headers=headers_beta)
        self.assertEqual(resp_b.status_code, 200)
        items_b = resp_b.json().get("items", [])
        self.assertEqual(len(items_b), 2)

        # Assert every returned item belongs exclusively to user_beta
        for item in items_b:
            self.assertEqual(item["metadata"]["user_id"], "user_beta")
            self.assertIn("user_beta", item["key"])
            self.assertNotIn("user_alpha", item["key"])

        # Assert user_alpha's assets are completely absent
        keys_b = [item["key"] for item in items_b]
        self.assertFalse(any("user_alpha" in k for k in keys_b))

        # 3. GET /api/v1/gallery?user_id=me as user_alpha
        resp_me_a = self.client.get("/api/v1/gallery?user_id=me", headers=headers_alpha)
        self.assertEqual(resp_me_a.status_code, 200)
        items_me_a = resp_me_a.json().get("items", [])
        self.assertEqual(len(items_me_a), 2)

        for item in items_me_a:
            self.assertEqual(item["metadata"]["user_id"], "user_alpha")
            self.assertIn("user_alpha", item["key"])
            self.assertNotIn("user_beta", item["key"])

        # 4. GET /api/v1/gallery?user_id=me as user_beta
        resp_me_b = self.client.get("/api/v1/gallery?user_id=me", headers=headers_beta)
        self.assertEqual(resp_me_b.status_code, 200)
        items_me_b = resp_me_b.json().get("items", [])
        self.assertEqual(len(items_me_b), 2)

        for item in items_me_b:
            self.assertEqual(item["metadata"]["user_id"], "user_beta")
            self.assertIn("user_beta", item["key"])
            self.assertNotIn("user_alpha", item["key"])

    def test_unsaved_assets_excluded_from_user_gallery(self) -> None:
        """Assert assets marked gallery_saved=False are excluded from /api/v1/gallery/me."""
        self._seed_asset(
            namespace="user_alpha",
            prompt_id="prompt_saved",
            filename="saved.png",
            user_id="user_alpha",
            gallery_saved=True,
        )
        self._seed_asset(
            namespace="user_alpha",
            prompt_id="prompt_unsaved",
            filename="unsaved.png",
            user_id="user_alpha",
            gallery_saved=False,
        )

        headers = {"Authorization": f"Bearer {self.token_alpha}"}
        resp = self.client.get("/api/v1/gallery/me", headers=headers)
        self.assertEqual(resp.status_code, 200)
        items = resp.json().get("items", [])
        self.assertEqual(len(items), 1)
        self.assertIn("saved.png", items[0]["key"])
