"""Integration tests for Image-to-Image (Img2Img) generation workflow."""

import base64
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
from app.services.comfy_client import ComfyClient
from app.services.credit_service import CreditService, set_credit_service
from app.services.mailer_service import MailerService, set_mailer_service
from app.services.storage import StorageService


class TestImg2ImgGeneration(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_img2img.db")
        self.storage_dir = os.path.join(self.temp_dir.name, "storage")
        self.settings = Settings(
            DB_PATH=self.db_path,
            STORAGE_DIR=self.storage_dir,
            JWT_SECRET="img2img-test-secret-key-32chars!",
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
        self.user = self.provider.create_user("img2img@test.com", "img2img_user", "Password123!", "Img2Img")
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
            "category": "diffusion_models",
            "filename": "krea2/krea2_turbo_fp8_scaled.safetensors",
            "version_name": "v1.0",
            "base_model": "Krea2",
            "text_encoder": "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
            "clip_type": "krea2",
            "vae": "wan_2.1_vae.safetensors",
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_img2img_missing_reference_image_fails(self):
        """Img2Img mode without reference image must return 400."""
        payload = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "mode": "image-to-image",
            "prompt": "futuristic city portrait",
            "reference_images": [],
        }
        with patch("app.main.model_storage", self.mock_model_storage):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 400)
            self.assertIn("image-to-image mode requires at least one reference image", resp.json()["detail"])

    def test_img2img_successful_execution(self):
        """Img2Img mode replaces EmptyLatentImage with LoadImage and VAEEncode, applying denoise."""
        sample_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

        queued_graphs = []

        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(side_effect=lambda cat, name: name)
        mock_comfy.resolve_clip_type = AsyncMock(side_effect=lambda t: t)
        mock_comfy.upload_image = AsyncMock(return_value="uploaded_source_input.png")

        real_comfy = ComfyClient()
        mock_comfy.build_gallery_workflow = MagicMock(side_effect=real_comfy.build_gallery_workflow)
        mock_comfy.build_lora_workflow = MagicMock(side_effect=real_comfy.build_lora_workflow)

        async def fake_queue_prompt(graph, client_id=None):
            queued_graphs.append(graph)
            return "prompt-img2img-uuid"

        mock_comfy.queue_prompt = AsyncMock(side_effect=fake_queue_prompt)
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_images = AsyncMock(return_value=[{"filename": "gen_img2img_out.png", "subfolder": "", "type": "output"}])
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"\x89PNG\r\n\x1a\nfakeimagebytes")

        payload = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "mode": "image-to-image",
            "prompt": "cyberpunk portrait",
            "denoise": 0.65,
            "reference_images": [sample_b64],
        }

        with patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.get_comfy_client", return_value=mock_comfy), \
             patch("app.main.storage", self.storage):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "completed")
            self.assertEqual(len(data["images"]), 1)

            # Verify ComfyUI received the uploaded image
            mock_comfy.upload_image.assert_called_once()

            # Verify the queued graph had Img2Img nodes injected
            self.assertEqual(len(queued_graphs), 1)
            stage1_graph = queued_graphs[0]
            self.assertNotIn("1054", stage1_graph)
            self.assertIn("1054_load", stage1_graph)
            self.assertEqual(stage1_graph["1054_load"]["inputs"]["image"], "uploaded_source_input.png")
            self.assertIn("1054_encode", stage1_graph)
            self.assertEqual(stage1_graph["1056"]["inputs"]["latent_image"], ["1054_encode", 0])
            self.assertEqual(stage1_graph["1059"]["inputs"]["denoise"], 0.65)


if __name__ == "__main__":
    unittest.main()
