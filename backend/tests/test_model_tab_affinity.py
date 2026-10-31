import os
import tempfile
import unittest
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app, _ensure_generation_mode_compatibility
from app.schemas import (
    GenerateRequest,
    ModelCompatibility,
    InstalledGalleryModel,
    PublicModelSummary,
    ModelResponse,
    derive_supported_modes,
    media_type,
    video_family,
)
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.mailer_service import MailerService, set_mailer_service
from app.services.model_storage import ModelConflict, ModelNotFound
from app.services.storage import StorageService


class ModelTabAffinityTests(unittest.TestCase):
    def test_derive_supported_modes_video(self) -> None:
        # LTX models
        self.assertEqual(
            derive_supported_modes(architecture="LTX-Video 2.3", model_type="Checkpoint"),
            ["video"],
        )
        self.assertEqual(
            derive_supported_modes(architecture="Wan 2.1", model_type="Checkpoint"),
            ["video"],
        )
        self.assertEqual(
            derive_supported_modes(architecture=None, model_type="SVD"),
            ["video"],
        )

    def test_derive_supported_modes_edit(self) -> None:
        # Qwen Edit models
        self.assertEqual(
            derive_supported_modes(
                architecture="Qwen-Image",
                model_type="Checkpoint",
                title="Qwen Image Edit 2511",
                filename="qwen/qwen_image_edit_2511_fp8mixed.safetensors",
            ),
            ["edit"],
        )
        self.assertEqual(
            derive_supported_modes(
                architecture="Qwen-Image",
                model_type="LoRA",
                title="Consistence Edit Lora",
                filename="qwen/qe2511_consis_alpha_patched.safetensors",
            ),
            ["edit"],
        )
        self.assertEqual(
            derive_supported_modes(
                architecture="Qwen-Image",
                model_type="LoRA",
                title="Qwen-Image-Edit-2511-Lightning-4steps-V1.0-fp32",
                filename="qwen/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-fp32.safetensors",
            ),
            ["edit"],
        )

    def test_derive_supported_modes_foundation_image(self) -> None:
        # Krea-2
        self.assertEqual(
            derive_supported_modes(
                architecture="Krea-2",
                model_type="Checkpoint",
                title="Krea 2 Turbo",
                filename="krea2/krea2_turbo_fp8_scaled.safetensors",
            ),
            ["text-to-image", "image-to-image", "prime"],
        )
        # Z-Image-Turbo
        self.assertEqual(
            derive_supported_modes(
                architecture="Z-Image-Turbo",
                model_type="Checkpoint",
                title="Z Image Turbo",
                filename="z-image/z_image_turbo_bf16.safetensors",
            ),
            ["text-to-image", "image-to-image", "prime"],
        )
        # SDXL
        self.assertEqual(
            derive_supported_modes(
                architecture="SDXL 1.0",
                model_type="Checkpoint",
                title="AlbedoBase XL v3.1 Large",
                filename="sd/albedobaseXL_v31Large.safetensors",
            ),
            ["text-to-image", "image-to-image", "prime"],
        )
        # Qwen Image generative checkpoint
        self.assertEqual(
            derive_supported_modes(
                architecture="Qwen-Image",
                model_type="Checkpoint",
                title="White QWEN Alpha 01 FP8",
                filename="qwen/whiteQWEN_alpha01-fp8_e4m3fn.safetensors",
            ),
            ["text-to-image", "image-to-image", "prime"],
        )

    def test_derive_supported_modes_sd15(self) -> None:
        self.assertEqual(
            derive_supported_modes(
                architecture="SD 1.5",
                model_type="Checkpoint",
                title="ReV Animated v2 Rebirth",
                filename="sd/revAnimated_v2Rebirth.safetensors",
            ),
            ["text-to-image", "image-to-image"],
        )

    def test_derive_supported_modes_specialized_tools(self) -> None:
        # SAM tool
        self.assertEqual(
            derive_supported_modes(
                architecture="SAM",
                model_type="Checkpoint",
                title="SAM 3.1 Multiplex FP16",
                filename="sam3.1_multiplex_fp16.safetensors",
            ),
            [],
        )
        # Audio separator tool
        self.assertEqual(
            derive_supported_modes(
                architecture="Audio-Separator",
                model_type="Checkpoint",
                title="MelBand Roformer FP16",
                filename="MelBandRoformer_fp16.safetensors",
            ),
            [],
        )

    def test_schema_model_compatibility_supported_modes(self) -> None:
        compat = ModelCompatibility(
            base_model="Krea-2",
            supported_modes=["text-to-image", "image-to-image", "prime"],
        )
        self.assertEqual(
            compat.supported_modes,
            ["text-to-image", "image-to-image", "prime"],
        )
        dumped = compat.model_dump()
        self.assertIn("supported_modes", dumped)
        restored = ModelCompatibility(**dumped)
        self.assertEqual(restored.supported_modes, compat.supported_modes)

    def test_schema_installed_gallery_model_supported_modes(self) -> None:
        model = InstalledGalleryModel(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            title="Qwen Image Edit 2511",
            model_type="Checkpoint",
            version_name="v1.0",
            filename="qwen/qwen_image_edit_2511_fp8mixed.safetensors",
            category="checkpoints",
            sha256="d" * 64,
            supported_modes=["edit"],
        )
        self.assertEqual(model.supported_modes, ["edit"])
        dumped = model.model_dump()
        self.assertEqual(dumped["supported_modes"], ["edit"])

    def test_schema_public_model_summary_supported_modes(self) -> None:
        summary = PublicModelSummary(
            model_id="a" * 32,
            title="LTX-Video 2.3",
            category="General",
            model_type="Checkpoint",
            tags=["video", "ltx"],
            base_model="LTX-Video 2.3",
            published_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
            version_count=1,
            file_count=1,
            sample_count=1,
            supported_modes=["video"],
        )
        self.assertEqual(summary.supported_modes, ["video"])

    def test_gatekeeping_video_model_in_t2i_rejected(self) -> None:
        req = GenerateRequest(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            mode="text-to-image",
            prompt="A sunset",
        )
        video_model = {
            "title": "LTX-Video 2.3",
            "model_type": "Checkpoint",
            "base_model": "LTX-Video 2.3",
            "media_type": "video",
            "supported_modes": ["video"],
        }
        with self.assertRaises(ModelConflict) as ctx:
            _ensure_generation_mode_compatibility(
                req=req,
                selected_model=video_model,
                base_model=video_model,
                is_lora=False,
            )
        self.assertIn("video generation model", str(ctx.exception))

    def test_gatekeeping_edit_model_in_t2i_rejected(self) -> None:
        req = GenerateRequest(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            mode="text-to-image",
            prompt="Make her hair blonde",
        )
        edit_model = {
            "title": "Qwen Image Edit 2511",
            "model_type": "Checkpoint",
            "base_model": "Qwen-Image",
            "filename": "qwen/qwen_image_edit_2511_fp8mixed.safetensors",
            "supported_modes": ["edit"],
        }
        with self.assertRaises(ModelConflict) as ctx:
            _ensure_generation_mode_compatibility(
                req=req,
                selected_model=edit_model,
                base_model=edit_model,
                is_lora=False,
            )
        self.assertIn("instruction edit model", str(ctx.exception))

    def test_gatekeeping_image_model_in_video_rejected(self) -> None:
        req = GenerateRequest(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            mode="video",
            prompt="A running cat",
        )
        image_model = {
            "title": "Krea 2 Turbo",
            "model_type": "Checkpoint",
            "base_model": "Krea-2",
            "filename": "krea2/krea2_turbo_fp8_scaled.safetensors",
            "supported_modes": ["text-to-image", "image-to-image", "prime"],
        }
        with self.assertRaises(ModelConflict) as ctx:
            _ensure_generation_mode_compatibility(
                req=req,
                selected_model=image_model,
                base_model=image_model,
                is_lora=False,
            )
        self.assertIn("not an LTX model", str(ctx.exception))

    def test_gatekeeping_valid_pairings_accepted(self) -> None:
        # 1. Video model in video mode
        req_video = GenerateRequest(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            mode="video",
            prompt="A running cat",
        )
        video_model = {
            "title": "LTX-Video 2.3",
            "model_type": "Checkpoint",
            "base_model": "LTX-Video 2.3",
            "media_type": "video",
            "supported_modes": ["video"],
        }
        # Should not raise
        _ensure_generation_mode_compatibility(req_video, video_model, video_model, False)

        # 2. Image model in text-to-image mode
        req_t2i = GenerateRequest(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            mode="text-to-image",
            prompt="A cyberpunk city",
        )
        image_model = {
            "title": "Krea 2 Turbo",
            "model_type": "Checkpoint",
            "base_model": "Krea-2",
            "media_type": "image",
            "supported_modes": ["text-to-image", "image-to-image", "prime"],
        }
        # Should not raise
        _ensure_generation_mode_compatibility(req_t2i, image_model, image_model, False)

        # 3. Edit model in image-to-image mode (with reference image)
        req_i2i = GenerateRequest(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            mode="image-to-image",
            prompt="Turn hair blonde",
            reference_images=["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
        )
        edit_model = {
            "title": "Qwen Image Edit 2511",
            "model_type": "Checkpoint",
            "base_model": "Qwen-Image",
            "supported_modes": ["edit"],
        }
        # Should not raise
        _ensure_generation_mode_compatibility(req_i2i, edit_model, edit_model, False)



class ModelTabAffinityEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_affinity.db")
        self.storage_dir = os.path.join(self.temp_dir.name, "storage")
        self.settings = Settings(
            DB_PATH=self.db_path,
            STORAGE_DIR=self.storage_dir,
            JWT_SECRET="affinity-test-secret-key-32chars!",
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

        # Authenticated test user with 100 credits
        self.user = self.provider.create_user("tester@example.com", "affinity_user", "SecretPass123!", "Affinity Tester")
        token = self.provider.create_token(self.user)
        self.headers = {"Authorization": f"Bearer {token}"}

        # Model Definitions for registry
        self.sdxl_checkpoint = {
            "model_id": "1" * 32,
            "version_id": "2" * 32,
            "file_id": "3" * 32,
            "title": "SDXL Base 1.0",
            "model_type": "Checkpoint",
            "version_name": "v1.0",
            "category": "checkpoints",
            "filename": "sd_xl_base_1.0.safetensors",
            "base_model": "SDXL 1.0",
            "media_type": "image",
            "supported_modes": ["text-to-image", "image-to-image", "prime"],
        }
        self.krea2_checkpoint = {
            "model_id": "4" * 32,
            "version_id": "5" * 32,
            "file_id": "6" * 32,
            "title": "Krea 2 Turbo",
            "model_type": "Checkpoint",
            "version_name": "v1.0",
            "category": "checkpoints",
            "filename": "krea2_turbo.safetensors",
            "base_model": "Krea-2",
            "media_type": "image",
            "supported_modes": ["text-to-image", "image-to-image", "prime"],
        }
        self.ltx_checkpoint = {
            "model_id": "7" * 32,
            "version_id": "8" * 32,
            "file_id": "9" * 32,
            "title": "LTX-Video 2.3 22B",
            "model_type": "Checkpoint",
            "version_name": "v1.0",
            "category": "checkpoints",
            "filename": "ltx_video_2.3.safetensors",
            "base_model": "LTX-Video 2.3",
            "media_type": "video",
            "supported_modes": ["video"],
        }
        self.qwen_edit_checkpoint = {
            "model_id": "a" * 32,
            "version_id": "b" * 32,
            "file_id": "c" * 32,
            "title": "Qwen Image Edit 2511",
            "model_type": "Checkpoint",
            "version_name": "v1.0",
            "category": "checkpoints",
            "filename": "qwen_image_edit_2511.safetensors",
            "base_model": "Qwen-Image",
            "supported_modes": ["edit"],
        }
        self.qwen_gen_checkpoint = {
            "model_id": "d" * 32,
            "version_id": "e" * 32,
            "file_id": "f" * 32,
            "title": "Qwen Image Generative",
            "model_type": "Checkpoint",
            "version_name": "v1.0",
            "category": "checkpoints",
            "filename": "qwen_image_gen.safetensors",
            "base_model": "Qwen-Image",
            "supported_modes": ["text-to-image", "image-to-image", "prime"],
        }
        self.sdxl_video_lora = {
            "model_id": "10" + "a" * 30,
            "version_id": "20" + "b" * 30,
            "file_id": "30" + "c" * 30,
            "title": "SDXL Video Animator LoRA",
            "model_type": "LoRA",
            "version_name": "v1.0",
            "category": "loras",
            "filename": "sdxl_video_animator.safetensors",
            "base_model": "SDXL 1.0",
            "media_type": "video",
            "supported_modes": ["video"],
        }
        self.qwen_edit_lora = {
            "model_id": "40" + "a" * 30,
            "version_id": "50" + "b" * 30,
            "file_id": "60" + "c" * 30,
            "title": "Qwen Consistent Edit LoRA",
            "model_type": "LoRA",
            "version_name": "v1.0",
            "category": "loras",
            "filename": "qwen_edit_lora.safetensors",
            "base_model": "Qwen-Image",
            "supported_modes": ["edit"],
        }
        self.ltx_image_lora = {
            "model_id": "70" + "a" * 30,
            "version_id": "80" + "b" * 30,
            "file_id": "90" + "c" * 30,
            "title": "LTX Still Style LoRA",
            "model_type": "LoRA",
            "version_name": "v1.0",
            "category": "loras",
            "filename": "ltx_still_style.safetensors",
            "base_model": "LTX-Video 2.3",
            "supported_modes": ["text-to-image"],
        }
        self.sdxl_style_lora = {
            "model_id": "a0" + "1" * 30,
            "version_id": "b0" + "2" * 30,
            "file_id": "c0" + "3" * 30,
            "title": "SDXL Anime Style LoRA",
            "model_type": "LoRA",
            "version_name": "v1.0",
            "category": "loras",
            "filename": "sdxl_anime_style.safetensors",
            "base_model": "SDXL 1.0",
            "supported_modes": ["text-to-image", "image-to-image"],
        }

        self.model_registry = {
            (m["model_id"], m["version_id"], m["file_id"]): m
            for m in [
                self.sdxl_checkpoint,
                self.krea2_checkpoint,
                self.ltx_checkpoint,
                self.qwen_edit_checkpoint,
                self.qwen_gen_checkpoint,
                self.sdxl_video_lora,
                self.qwen_edit_lora,
                self.ltx_image_lora,
                self.sdxl_style_lora,
            ]
        }

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def _mock_resolve(self, model_id: str, version_id: str, file_id: str, **kwargs: Any) -> dict[str, Any]:
        key = (model_id, version_id, file_id)
        if key in self.model_registry:
            return dict(self.model_registry[key])
        raise ModelNotFound(f"Model file {model_id}/{version_id}/{file_id} not found")

    def _mock_comfy(self) -> AsyncMock:
        comfy = AsyncMock()
        comfy.resolve_model_name = AsyncMock(side_effect=lambda cat, fn: fn)
        comfy.resolve_clip_type = AsyncMock(return_value="")
        comfy.build_gallery_workflow = MagicMock(return_value={})
        comfy.build_lora_workflow = MagicMock(return_value={})
        comfy.queue_prompt = AsyncMock(return_value="test-prompt-id")
        comfy.wait_until_done = AsyncMock(return_value="completed")
        comfy.list_images = AsyncMock(return_value=[])
        return comfy

    def test_generate_video_model_in_t2i_rejected_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.ltx_checkpoint["model_id"],
            "version_id": self.ltx_checkpoint["version_id"],
            "file_id": self.ltx_checkpoint["file_id"],
            "mode": "text-to-image",
            "prompt": "A beautiful landscape",
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("video generation model", resp.json()["detail"])
        # Credit refund guarantee: balance restored to initial 100
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_generate_edit_model_in_t2i_rejected_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.qwen_edit_checkpoint["model_id"],
            "version_id": self.qwen_edit_checkpoint["version_id"],
            "file_id": self.qwen_edit_checkpoint["file_id"],
            "mode": "text-to-image",
            "prompt": "A beautiful landscape",
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("instruction edit model", resp.json()["detail"])
        # Credit refund guarantee: balance restored to initial 100
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_generate_image_model_in_video_rejected_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.krea2_checkpoint["model_id"],
            "version_id": self.krea2_checkpoint["version_id"],
            "file_id": self.krea2_checkpoint["file_id"],
            "mode": "video",
            "prompt": "A galloping horse",
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("not an LTX model", resp.json()["detail"])
        # Credit refund guarantee: balance restored to initial 100
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_generate_video_model_in_detailer_rejected_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.ltx_checkpoint["model_id"],
            "version_id": self.ltx_checkpoint["version_id"],
            "file_id": self.ltx_checkpoint["file_id"],
            "mode": "detailer",
            "prompt": "Enhance portrait details",
            "reference_images": ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("video generation model and cannot be used for detailer", resp.json()["detail"])
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_generate_primary_video_lora_in_t2i_rejected_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.sdxl_video_lora["model_id"],
            "version_id": self.sdxl_video_lora["version_id"],
            "file_id": self.sdxl_video_lora["file_id"],
            "base_model_id": self.sdxl_checkpoint["model_id"],
            "base_version_id": self.sdxl_checkpoint["version_id"],
            "base_file_id": self.sdxl_checkpoint["file_id"],
            "mode": "text-to-image",
            "prompt": "A futuristic city",
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("video adapter and cannot generate text-to-image", resp.json()["detail"])
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_generate_primary_edit_lora_in_t2i_rejected_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.qwen_edit_lora["model_id"],
            "version_id": self.qwen_edit_lora["version_id"],
            "file_id": self.qwen_edit_lora["file_id"],
            "base_model_id": self.qwen_gen_checkpoint["model_id"],
            "base_version_id": self.qwen_gen_checkpoint["version_id"],
            "base_file_id": self.qwen_gen_checkpoint["file_id"],
            "mode": "text-to-image",
            "prompt": "A cozy cottage in the woods",
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("instruction edit adapter", resp.json()["detail"])
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_secondary_lora_video_adapter_rejected_in_t2i_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.sdxl_checkpoint["model_id"],
            "version_id": self.sdxl_checkpoint["version_id"],
            "file_id": self.sdxl_checkpoint["file_id"],
            "mode": "text-to-image",
            "prompt": "An astronaut floating in deep cosmos",
            "lora_adapters": [
                {
                    "model_id": self.sdxl_video_lora["model_id"],
                    "version_id": self.sdxl_video_lora["version_id"],
                    "file_id": self.sdxl_video_lora["file_id"],
                    "on": True,
                    "strength": 0.8,
                }
            ],
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("video adapter and cannot be used in Text-to-Image", resp.json()["detail"])
        # Credit refund guarantee
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_secondary_lora_edit_adapter_rejected_in_t2i_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.qwen_gen_checkpoint["model_id"],
            "version_id": self.qwen_gen_checkpoint["version_id"],
            "file_id": self.qwen_gen_checkpoint["file_id"],
            "mode": "text-to-image",
            "prompt": "A modern architectural villa",
            "lora_adapters": [
                {
                    "model_id": self.qwen_edit_lora["model_id"],
                    "version_id": self.qwen_edit_lora["version_id"],
                    "file_id": self.qwen_edit_lora["file_id"],
                    "on": True,
                    "strength": 0.8,
                }
            ],
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("instruction edit adapter and cannot be used in Text-to-Image", resp.json()["detail"])
        # Credit refund guarantee
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_secondary_lora_non_video_adapter_rejected_in_video_mode_with_409_and_refunds_credits(self) -> None:
        payload = {
            "model_id": self.ltx_checkpoint["model_id"],
            "version_id": self.ltx_checkpoint["version_id"],
            "file_id": self.ltx_checkpoint["file_id"],
            "mode": "video",
            "prompt": "Ocean waves crashing on dark rocks",
            "lora_adapters": [
                {
                    "model_id": self.ltx_image_lora["model_id"],
                    "version_id": self.ltx_image_lora["version_id"],
                    "file_id": self.ltx_image_lora["file_id"],
                    "on": True,
                    "strength": 0.8,
                }
            ],
        }
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 409)
        self.assertIn("is not a video adapter. In Video mode, only video LoRAs can be used.", resp.json()["detail"])
        # Credit refund guarantee
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

    def test_secondary_lora_disabled_adapter_bypasses_check_and_succeeds(self) -> None:
        payload = {
            "model_id": self.sdxl_checkpoint["model_id"],
            "version_id": self.sdxl_checkpoint["version_id"],
            "file_id": self.sdxl_checkpoint["file_id"],
            "mode": "text-to-image",
            "prompt": "An astronaut exploring new worlds",
            "lora_adapters": [
                {
                    "model_id": self.sdxl_video_lora["model_id"],
                    "version_id": self.sdxl_video_lora["version_id"],
                    "file_id": self.sdxl_video_lora["file_id"],
                    "on": False,
                    "strength": 0.8,
                }
            ],
        }
        mock_comfy = self._mock_comfy()
        with (
            patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            resp = self.client.post("/api/v1/generate", json=payload, headers=self.headers)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "completed")
        # On success, credits are deducted (100 - 2 = 98)
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 98)

    def test_credit_refund_guarantee_after_multiple_conflicts_followed_by_success(self) -> None:
        # 1. Initial balance check
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

        # 2. Conflict 1: Video model in T2I
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            r1 = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": self.ltx_checkpoint["model_id"],
                    "version_id": self.ltx_checkpoint["version_id"],
                    "file_id": self.ltx_checkpoint["file_id"],
                    "mode": "text-to-image",
                    "prompt": "Mismatch 1",
                },
                headers=self.headers,
            )
        self.assertEqual(r1.status_code, 409)
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

        # 3. Conflict 2: Secondary edit LoRA in T2I
        with patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve):
            r2 = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": self.qwen_gen_checkpoint["model_id"],
                    "version_id": self.qwen_gen_checkpoint["version_id"],
                    "file_id": self.qwen_gen_checkpoint["file_id"],
                    "mode": "text-to-image",
                    "prompt": "Mismatch 2",
                    "lora_adapters": [
                        {
                            "model_id": self.qwen_edit_lora["model_id"],
                            "version_id": self.qwen_edit_lora["version_id"],
                            "file_id": self.qwen_edit_lora["file_id"],
                            "on": True,
                            "strength": 0.8,
                        }
                    ],
                },
                headers=self.headers,
            )
        self.assertEqual(r2.status_code, 409)
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 100)

        # 4. Success: Compatible SDXL checkpoint + compatible secondary style LoRA
        mock_comfy = self._mock_comfy()
        with (
            patch("app.main.model_storage.resolve_installed_gallery_file", side_effect=self._mock_resolve),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            r3 = self.client.post(
                "/api/v1/generate",
                json={
                    "model_id": self.sdxl_checkpoint["model_id"],
                    "version_id": self.sdxl_checkpoint["version_id"],
                    "file_id": self.sdxl_checkpoint["file_id"],
                    "mode": "text-to-image",
                    "prompt": "Valid anime portrait",
                    "lora_adapters": [
                        {
                            "model_id": self.sdxl_style_lora["model_id"],
                            "version_id": self.sdxl_style_lora["version_id"],
                            "file_id": self.sdxl_style_lora["file_id"],
                            "on": True,
                            "strength": 0.8,
                        }
                    ],
                },
                headers=self.headers,
            )
        self.assertEqual(r3.status_code, 200)
        self.assertEqual(r3.json()["status"], "completed")
        self.assertEqual(self.credits.get_user_credits(self.user.id).balance, 98)


if __name__ == "__main__":
    unittest.main()

