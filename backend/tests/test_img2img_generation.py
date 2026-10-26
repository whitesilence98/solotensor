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

    def test_detailer_missing_reference_image_fails(self):
        """Detailer mode without reference image must return 400."""
        payload = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "mode": "detailer",
            "prompt": "",
            "reference_images": [],
        }
        with patch("app.main.model_storage", self.mock_model_storage):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 400)
            self.assertIn("detailer mode requires at least one reference image", resp.json()["detail"])

    def test_upscale_missing_reference_image_fails(self):
        """Upscale mode without reference image must return 400."""
        payload = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "mode": "upscale",
            "prompt": "",
            "reference_images": [],
        }
        with patch("app.main.model_storage", self.mock_model_storage):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 400)
            self.assertIn("upscale mode requires at least one reference image", resp.json()["detail"])

    def test_standalone_detailer_execution(self):
        """Standalone Detailer mode patches workflow_detailer.json directly on the reference image and costs 1 credit."""
        sample_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        queued_graphs = []

        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(side_effect=lambda cat, name: name)
        mock_comfy.resolve_clip_type = AsyncMock(side_effect=lambda t: t)
        mock_comfy.upload_image = AsyncMock(return_value="uploaded_detailer_ref.png")

        real_comfy = ComfyClient()
        mock_comfy.load_modular_detailer_template = MagicMock(side_effect=real_comfy.load_modular_detailer_template)
        mock_comfy.load_detailer_template = MagicMock(side_effect=real_comfy.load_detailer_template)

        async def fake_queue_prompt(graph, client_id=None):
            queued_graphs.append(graph)
            return "prompt-detailer-uuid"

        mock_comfy.queue_prompt = AsyncMock(side_effect=fake_queue_prompt)
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_images = AsyncMock(return_value=[{"filename": "out_detailer.png", "subfolder": "", "type": "output"}])
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"\x89PNG\r\n\x1a\ndetailerbytes")

        initial_credits = self.credits.get_user_credits(self.user.id).balance

        payload = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "mode": "detailer",
            "prompt": "high detail portrait face",
            "reference_images": [sample_b64],
            "detailer": {
                "enabled": True,
                "items": [
                    {
                        "type": "face",
                        "enabled": True,
                        "steps": 25,
                        "denoising_strength": 0.35,
                        "prompt": "perfect face, 8k",
                        "negative_prompt": "blurry",
                        "cfg_scale": 7.0,
                        "inpaint_mask_blur": 4,
                        "inpaint_only_masked": True,
                        "bbox_threshold": 0.5,
                        "bbox_dilation": 10,
                    }
                ],
            },
        }

        with patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.get_comfy_client", return_value=mock_comfy), \
             patch("app.main.storage", self.storage):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "completed")

            # Check reduced cost of 1 credit for standalone feature
            new_credits = self.credits.get_user_credits(self.user.id).balance
            self.assertEqual(new_credits, initial_credits - 1)

            # Verify image was injected into Node 1112 of workflow_detailer.json
            self.assertEqual(len(queued_graphs), 1)
            graph = queued_graphs[0]
            self.assertIn("1112", graph)
            self.assertEqual(graph["1112"]["inputs"]["image"], "uploaded_detailer_ref.png")

    def test_standalone_upscale_execution(self):
        """Standalone Upscale mode patches workflow_seedvr_upscaler.json directly on the reference image and costs 1 credit."""
        sample_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        queued_graphs = []

        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(side_effect=lambda cat, name: name)
        mock_comfy.resolve_clip_type = AsyncMock(side_effect=lambda t: t)
        mock_comfy.upload_image = AsyncMock(return_value="uploaded_upscale_ref.png")

        real_comfy = ComfyClient()
        mock_comfy.load_seedvr_upscaler_template = MagicMock(side_effect=real_comfy.load_seedvr_upscaler_template)

        async def fake_queue_prompt(graph, client_id=None):
            queued_graphs.append(graph)
            return "prompt-upscale-uuid"

        mock_comfy.queue_prompt = AsyncMock(side_effect=fake_queue_prompt)
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_images = AsyncMock(return_value=[{"filename": "out_upscale.png", "subfolder": "", "type": "output"}])
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"\x89PNG\r\n\x1a\nupscalebytes")

        initial_credits = self.credits.get_user_credits(self.user.id).balance

        payload = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "mode": "upscale",
            "prompt": "",
            "reference_images": [sample_b64],
            "upscale": {
                "enabled": True,
                "scale": 2,
                "dit_model": "seedvr2_dit_fast.safetensors",
                "color_correction": "lab",
            },
        }

        with patch("app.main.model_storage", self.mock_model_storage), \
             patch("app.main.get_comfy_client", return_value=mock_comfy), \
             patch("app.main.storage", self.storage):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "completed")

            # Check reduced cost of 1 credit for standalone feature
            new_credits = self.credits.get_user_credits(self.user.id).balance
            self.assertEqual(new_credits, initial_credits - 1)

            # Verify image was injected into Node 1093 of workflow_seedvr_upscaler.json
            self.assertEqual(len(queued_graphs), 1)
            graph = queued_graphs[0]
            self.assertIn("1093", graph)
            self.assertEqual(graph["1093"]["inputs"]["image"], "uploaded_upscale_ref.png")

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

            # Verify the queued graph used native workflow_generate_i2i.json nodes
            self.assertEqual(len(queued_graphs), 1)
            stage1_graph = queued_graphs[0]
            self.assertIn("30", stage1_graph)
            self.assertEqual(stage1_graph["30"]["inputs"]["image"], "uploaded_source_input.png")
            self.assertIn("32", stage1_graph)
            self.assertEqual(stage1_graph["32"]["inputs"]["pixels"], ["30", 0])
            self.assertIn("3", stage1_graph)
            self.assertEqual(stage1_graph["3"]["inputs"]["latent_image"], ["32", 0])
            self.assertEqual(stage1_graph["3"]["inputs"]["denoise"], 0.65)
            self.assertEqual(stage1_graph["6"]["inputs"]["text"], "cyberpunk portrait")

    def test_patch_base_i2i_workflow_unit(self):
        """Unit test for patch_base_i2i_workflow with model loaders and LoRA chaining."""
        from app.services.workflow_router import load_workflow, patch_base_i2i_workflow

        template = load_workflow("workflow_generate_i2i.json")
        patched = patch_base_i2i_workflow(
            template,
            prompt="neon cyberpunk street",
            negative_prompt="blurry, ugly",
            seed=42,
            steps=15,
            cfg=2.0,
            denoise=0.55,
            unet_name="custom_model.safetensors",
            clip_name="custom_clip.safetensors",
            clip_type="sdxl",
            vae_name="custom_vae.safetensors",
            source_image_filename="source_ref.png",
            loras=[{"lora": "cyber_detail.safetensors", "strength": 0.85, "on": True}],
        )

        self.assertEqual(patched["30"]["inputs"]["image"], "source_ref.png")
        self.assertEqual(patched["6"]["inputs"]["text"], "neon cyberpunk street")
        self.assertEqual(patched["7"]["inputs"]["text"], "blurry, ugly")
        self.assertEqual(patched["3"]["inputs"]["seed"], 42)
        self.assertEqual(patched["3"]["inputs"]["steps"], 15)
        self.assertEqual(patched["3"]["inputs"]["cfg"], 2.0)
        self.assertEqual(patched["3"]["inputs"]["denoise"], 0.55)
        self.assertEqual(patched["593:590"]["inputs"]["unet_name"], "custom_model.safetensors")
        self.assertEqual(patched["593:589"]["inputs"]["clip_name"], "custom_clip.safetensors")
        self.assertEqual(patched["593:588"]["inputs"]["vae_name"], "custom_vae.safetensors")

        # Verify LoRA loader node was chained
        self.assertIn("lora_loader_1", patched)
        self.assertEqual(patched["lora_loader_1"]["inputs"]["lora_name"], "cyber_detail.safetensors")
        self.assertEqual(patched["lora_loader_1"]["inputs"]["strength_model"], 0.85)
        self.assertEqual(patched["3"]["inputs"]["model"], ["lora_loader_1", 0])
        self.assertEqual(patched["6"]["inputs"]["clip"], ["lora_loader_1", 1])


if __name__ == "__main__":
    unittest.main()