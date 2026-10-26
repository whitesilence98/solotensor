"""Integration tests for Video generation pipeline using workflow_generate_it2v.json (LTX-Video 2.3)."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.mailer_service import MailerService, set_mailer_service
from app.services.storage import StorageService
from app.services.workflow_router import patch_video_it2v_workflow


class TestVideoGeneration(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_video.db")
        self.storage_dir = os.path.join(self.temp_dir.name, "storage")
        self.settings = Settings(
            DB_PATH=self.db_path,
            STORAGE_DIR=self.storage_dir,
            JWT_SECRET="video-test-secret-key-32chars!!",
            FILES_PUBLIC_BASE="http://localhost:8000",
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

        # Create authenticated test user
        self.user = self.provider.create_user("video@test.com", "video_user", "Password123!", "Video User")
        token = self.provider.create_token(self.user)
        self.headers = {"Authorization": f"Bearer {token}"}

        # Mock model storage
        self.mock_model_storage = MagicMock()
        self.mock_model_storage.resolve_installed_gallery_file.return_value = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "title": "LTX-Video 2.3 22B",
            "model_type": "Checkpoint",
            "category": "checkpoints",
            "filename": "ltx-2.3-22b-distilled_transformer_only_fp8_scaled.safetensors",
            "version_name": "v2.3",
            "base_model": "LTX-Video 2.3",
            "text_encoder": None,
            "clip_type": None,
            "vae": None,
        }

        fixture_path = Path(__file__).parent / "fixtures" / "workflow_generate_it2v.json"
        self.template = json.loads(fixture_path.read_text(encoding="utf-8"))

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_patch_video_it2v_t2v_fast_mode(self):
        """Test patching LTX-Video workflow in pure Text-to-Video mode with Stage 1 fast mode."""
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="Cinematic drone shot of an emerald ocean",
            seed=42,
            duration_seconds=5,
            video_fps=24,
            width=1024,
            height=576,
            steps=8,
            source_image_filename=None,
            stage2_upscale=False,
        )

        # Prompt & Seed verified
        self.assertEqual(patched["1879"]["inputs"]["text"], "Cinematic drone shot of an emerald ocean")
        self.assertEqual(patched["2019"]["inputs"]["seed"], 42)

        # Duration & FPS verified
        self.assertEqual(patched["389:387"]["inputs"]["value"], 5)
        self.assertEqual(patched["389:825"]["inputs"]["value"], 24)

        # Dimensions snapped to 32 verified
        self.assertEqual(patched["389:828"]["inputs"]["value"], 1024)
        self.assertEqual(patched["389:830"]["inputs"]["value"], 576)

        # T2V flag verified (no source image)
        self.assertFalse(patched["1875"]["inputs"]["value"])
        self.assertNotIn("1875_load_first", patched)

        # Fast mode: Node 172 exists, Node 678 pruned
        self.assertIn("172", patched)
        self.assertNotIn("678", patched)
        self.assertNotIn("681", patched)

    def test_patch_video_it2v_i2v_pro_mode(self):
        """Test patching LTX-Video workflow in Image-to-Video mode with Stage 2 Pro mode."""
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="Camera tracking a car speeding along mountain road",
            seed=999,
            duration_seconds=3,
            video_fps=25,
            width=768,
            height=512,
            steps=4,
            source_image_filename="starter_car.png",
            stage2_upscale=True,
        )

        # Image node injected & linked
        self.assertIn("1875_load_first", patched)
        self.assertEqual(patched["1875_load_first"]["inputs"]["image"], "starter_car.png")
        self.assertEqual(patched["389:1929:1905"]["inputs"]["any_01"], ["1875_load_first", 0])
        self.assertTrue(patched["1875"]["inputs"]["value"])

        # Pro mode: both Stage 1 (172) and Stage 2 (678) exist
        self.assertIn("172", patched)
        self.assertIn("678", patched)

    def test_video_generation_api_endpoint(self):
        """Test end-to-end API execution of video generation with MP4 output harvesting."""
        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(return_value="ltx-2.3-22b-distilled_transformer_only_fp8_scaled.safetensors")
        mock_comfy.resolve_clip_type = AsyncMock(return_value="ltxv")
        mock_comfy.upload_image = AsyncMock(return_value="input_video_starter.png")
        mock_comfy.load_video_it2v_template = lambda: json.loads(json.dumps(self.template))
        mock_comfy.queue_prompt = AsyncMock(return_value="prompt-video-uuid-12345")
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_output_files = AsyncMock(
            return_value=[{"filename": "VideoFlow-LTX23-small_00001.mp4", "subfolder": "video", "folder_type": "output"}]
        )
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")

        with (
            patch("app.main.model_storage", self.mock_model_storage),
            patch("app.main.storage", self.storage),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            payload = {
                "model_id": "a" * 32,
                "version_id": "b" * 32,
                "file_id": "c" * 32,
                "mode": "video",
                "prompt": "Hyperdetailed ocean wave crashing in slow motion",
                "negative_prompt": "",
                "seed": 12345,
                "steps": 8,
                "width": 1024,
                "height": 576,
                "video_duration_seconds": 3,
                "video_fps": 24,
                "stage2_upscale": False,
            }
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 200, resp.text)
            data = resp.json()

            self.assertEqual(data["status"], "completed")
            self.assertEqual(len(data["images"]), 1)
            video_obj = data["images"][0]
            self.assertEqual(video_obj["kind"], "video")
            video_url = video_obj["url"]
            self.assertTrue(video_url.endswith(".mp4"), f"Expected .mp4 URL, got {video_url}")


if __name__ == "__main__":
    unittest.main()
