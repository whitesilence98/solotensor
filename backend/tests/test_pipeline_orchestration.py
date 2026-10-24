"""Tests for sequential multi-stage pipeline orchestration in SoloTensor generation API."""

import asyncio
import json
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app
from app.schemas import (
    DetailerConfig,
    DetailerItemConfig,
    GenerateRequest,
    UpscaleConfig,
)
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.mailer_service import MailerService, set_mailer_service
from app.services.storage import StorageService


class TestPipelineOrchestration(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_pipeline.db")
        self.storage_dir = os.path.join(self.temp_dir.name, "storage")
        self.settings = Settings(
            DB_PATH=self.db_path,
            STORAGE_DIR=self.storage_dir,
            JWT_SECRET="pipeline-test-secret-key-32chars!",
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
        self.user = self.provider.create_user("orch@test.com", "orchestrator", "Password123!", "Orchestrator")
        token = self.provider.create_token(self.user)
        self.headers = {"Authorization": f"Bearer {token}"}

        # Mock model storage
        self.mock_model_storage = MagicMock()
        self.mock_model_storage.resolve_installed_gallery_file.return_value = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "title": "Krea2 Turbo",
            "model_type": "Diffusion Model",
            "version_name": "v1.0",
            "category": "diffusion_models",
            "filename": "krea2_turbo.safetensors",
            "text_encoder": "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
            "clip_type": "krea2",
            "vae": "wan_2.1_vae.safetensors",
        }

    def tearDown(self):
        set_auth_provider(None)
        set_credit_service(None)
        set_mailer_service(None)
        set_db(None)
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def test_pipeline_stage1_only(self):
        """When neither upscale nor detailer is enabled, only Stage 1 (Base T2I) runs."""
        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(side_effect=lambda cat, name: name)
        mock_comfy.resolve_clip_type = AsyncMock(return_value="krea2")
        mock_comfy.build_gallery_workflow = MagicMock(return_value={"1084": {"class_type": "SaveImage"}})
        mock_comfy.queue_prompt = AsyncMock(return_value="prompt-stage1-uuid")
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_images = AsyncMock(return_value=[{"filename": "base_t2i_001.png"}])
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"PNG_BASE_DATA")

        with patch("app.main.get_comfy_client", return_value=mock_comfy), \
             patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.storage", self.storage):
            res = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": "a" * 32,
                    "version_id": "b" * 32,
                    "file_id": "c" * 32,
                    "prompt": "serene mountain lake",
                    "upscale": {"enabled": False},
                    "detailer": {"enabled": False},
                },
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "completed")
            self.assertEqual(len(data["images"]), 1)
            self.assertEqual(data["images"][0]["filename"], "base_t2i_001.png")
            self.assertIsNone(data["images"][0]["before_detailer_url"])

            # Exactly 1 queue_prompt call
            self.assertEqual(mock_comfy.queue_prompt.call_count, 1)

    def test_pipeline_stage1_and_stage2_upscale(self):
        """When upscale is enabled, Stage 1 runs then Stage 2 SeedVR2 upscaler runs."""
        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(side_effect=lambda cat, name: name)
        mock_comfy.resolve_clip_type = AsyncMock(return_value="krea2")
        mock_comfy.build_gallery_workflow = MagicMock(return_value={"1084": {"class_type": "SaveImage"}})
        mock_comfy.load_seedvr_upscaler_template = MagicMock(return_value={"1089": {"inputs": {}}, "1090": {}})
        mock_comfy.upload_image = AsyncMock(return_value="uploaded_input.png")

        prompt_ids = ["prompt-stage1-uuid", "prompt-stage2-uuid"]
        mock_comfy.queue_prompt = AsyncMock(side_effect=prompt_ids)
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")

        def mock_list(pid):
            if pid == "prompt-stage1-uuid":
                return [{"filename": "base_t2i_001.png"}]
            return [{"filename": "seedvr2_upscaled_001.png"}]

        mock_comfy.list_images = AsyncMock(side_effect=mock_list)
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"PNG_IMAGE_DATA")

        with patch("app.main.get_comfy_client", return_value=mock_comfy), \
             patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.storage", self.storage):
            res = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": "a" * 32,
                    "version_id": "b" * 32,
                    "file_id": "c" * 32,
                    "prompt": "serene mountain lake",
                    "upscale": {"enabled": True, "scale": 2.0},
                    "detailer": {"enabled": False},
                },
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "completed")
            self.assertEqual(len(data["images"]), 1)
            self.assertEqual(data["images"][0]["filename"], "seedvr2_upscaled_001.png")
            self.assertIsNotNone(data["images"][0]["before_detailer_url"])

            # Exactly 2 queue_prompt calls
            self.assertEqual(mock_comfy.queue_prompt.call_count, 2)

    def test_pipeline_all_three_stages(self):
        """When upscale and detailer are both enabled, all 3 stages execute sequentially."""
        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(side_effect=lambda cat, name: name)
        mock_comfy.resolve_clip_type = AsyncMock(return_value="krea2")
        mock_comfy.build_gallery_workflow = MagicMock(return_value={"1084": {"class_type": "SaveImage"}})
        mock_comfy.load_seedvr_upscaler_template = MagicMock(return_value={"1089": {"inputs": {}}, "1090": {}})
        mock_comfy.load_modular_detailer_template = MagicMock(return_value={"1088:660": {"inputs": {}}, "1087": {}})
        mock_comfy.upload_image = AsyncMock(return_value="uploaded_input.png")

        prompt_ids = ["prompt-stage1-uuid", "prompt-stage2-uuid", "prompt-stage3-uuid"]
        mock_comfy.queue_prompt = AsyncMock(side_effect=prompt_ids)
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")

        def mock_list(pid):
            if pid == "prompt-stage1-uuid":
                return [{"filename": "base_t2i_001.png"}]
            elif pid == "prompt-stage2-uuid":
                return [{"filename": "seedvr2_upscaled_001.png"}]
            else:
                return [{"filename": "detailed_styled_001.png"}]

        mock_comfy.list_images = AsyncMock(side_effect=mock_list)
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"PNG_IMAGE_DATA")

        with patch("app.main.get_comfy_client", return_value=mock_comfy), \
             patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.storage", self.storage):
            res = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": "a" * 32,
                    "version_id": "b" * 32,
                    "file_id": "c" * 32,
                    "prompt": "cyberpunk portrait",
                    "upscale": {"enabled": True, "scale": 2.0},
                    "detailer": {
                        "enabled": True,
                        "items": [{"type": "face", "enabled": True}],
                    },
                },
                headers=self.headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "completed")
            self.assertEqual(len(data["images"]), 1)
            self.assertEqual(data["images"][0]["filename"], "detailed_styled_001.png")
            self.assertIsNotNone(data["images"][0]["before_detailer_url"])

            # Exactly 3 queue_prompt calls
            self.assertEqual(mock_comfy.queue_prompt.call_count, 3)


if __name__ == "__main__":
    unittest.main()
