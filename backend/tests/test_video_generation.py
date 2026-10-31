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

    # ------------------------------------------------------------------
    # Explicit video_mode (text-to-video / image-to-video) coverage.
    # ------------------------------------------------------------------

    def test_patch_explicit_t2v_forces_branch(self):
        """Explicit T2V with no frames: force primitives pin both compares to 0."""
        original = json.loads(json.dumps(self.template))
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="Cinematic drone shot of an emerald ocean",
            video_mode="text-to-video",
            stage2_upscale=False,
        )

        self.assertIs(patched["1875"]["inputs"]["value"], False)
        self.assertNotIn("1875_load_first", patched)
        self.assertNotIn("1875_load_last", patched)
        self.assertEqual(patched["1875_force_first"]["inputs"]["value"], 0)
        self.assertEqual(patched["1875_force_last"]["inputs"]["value"], 0)
        self.assertEqual(patched["389:1929:1907"]["inputs"]["a"], ["1875_force_first", 0])
        self.assertEqual(patched["389:1929:1903"]["inputs"]["a"], ["1875_force_last", 0])
        self.assertEqual(patched["389:1929:1914"]["inputs"]["value"], 1)
        self.assertEqual(patched["389:956"]["inputs"]["value"], 0)

        # The patcher must not mutate the template it was handed.
        self.assertEqual(self.template, original)

    def test_patch_explicit_t2v_drops_leaked_frames(self):
        """T2V drops frame filenames even when supplied directly (schema bypassed)."""
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="Pure text scene",
            video_mode="text-to-video",
            source_image_filename="leaked_first.png",
            last_frame_filename="leaked_last.png",
            stage2_upscale=False,
        )

        self.assertNotIn("1875_load_first", patched)
        self.assertNotIn("1875_load_last", patched)
        self.assertNotIn("any_01", patched["389:1929:1905"]["inputs"])
        self.assertNotIn("any_01", patched["389:1929:1901"]["inputs"])
        self.assertEqual(patched["1875_force_first"]["inputs"]["value"], 0)
        self.assertEqual(patched["1875_force_last"]["inputs"]["value"], 0)
        self.assertIs(patched["1875"]["inputs"]["value"], False)

    def test_patch_explicit_i2v_forces_branch(self):
        """Explicit I2V with only a first frame forces first=2, last=0."""
        original = json.loads(json.dumps(self.template))
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="Camera tracking a car",
            video_mode="image-to-video",
            source_image_filename="starter_car.png",
            stage2_upscale=False,
        )

        self.assertIs(patched["1875"]["inputs"]["value"], True)
        self.assertEqual(
            patched["389:1929:1905"]["inputs"]["any_01"], ["1875_load_first", 0]
        )
        self.assertEqual(patched["1875_force_first"]["inputs"]["value"], 2)
        self.assertEqual(patched["1875_force_last"]["inputs"]["value"], 0)
        self.assertNotIn("1875_load_last", patched)

        self.assertEqual(self.template, original)

    def test_patch_explicit_i2v_first_and_last(self):
        """Explicit I2V with both frames forces both axes to 2."""
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="Interpolate between frames",
            video_mode="image-to-video",
            source_image_filename="first.png",
            last_frame_filename="last.png",
            stage2_upscale=False,
        )

        self.assertEqual(patched["1875_force_first"]["inputs"]["value"], 2)
        self.assertEqual(patched["1875_force_last"]["inputs"]["value"], 2)
        self.assertEqual(
            patched["389:1929:1901"]["inputs"]["any_01"], ["1875_load_last", 0]
        )

    def test_patch_explicit_i2v_last_frame_only(self):
        """Last-frame-only I2V keeps force_first=0; the 389:1928:1112 switch depends on it."""
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="End on this frame",
            video_mode="image-to-video",
            last_frame_filename="last.png",
            stage2_upscale=False,
        )

        self.assertEqual(patched["1875_force_first"]["inputs"]["value"], 0)
        self.assertEqual(patched["1875_force_last"]["inputs"]["value"], 2)
        self.assertEqual(patched["389:1929:1907"]["inputs"]["a"], ["1875_force_first", 0])
        self.assertNotIn("1875_load_first", patched)

    def test_patch_explicit_i2v_requires_a_frame(self):
        """I2V without either frame is rejected by the patcher itself."""
        with self.assertRaises(ValueError):
            patch_video_it2v_workflow(
                self.template,
                prompt="No frame supplied",
                video_mode="image-to-video",
                stage2_upscale=False,
            )

    def test_patch_legacy_mode_adds_no_force_nodes(self):
        """Omitting video_mode preserves the legacy inference path exactly."""
        patched = patch_video_it2v_workflow(
            self.template,
            prompt="Legacy image-to-video",
            source_image_filename="legacy_first.png",
            stage2_upscale=False,
        )

        self.assertNotIn("1875_force_first", patched)
        self.assertNotIn("1875_force_last", patched)
        self.assertIs(patched["1875"]["inputs"]["value"], True)
        self.assertIn("1875_load_first", patched)
        self.assertEqual(patched["1875_load_first"]["inputs"]["image"], "legacy_first.png")
        self.assertEqual(
            patched["389:1929:1905"]["inputs"]["any_01"], ["1875_load_first", 0]
        )

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

    def _video_payload(self, **overrides):
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
        payload.update(overrides)
        return payload

    def test_video_api_rejects_explicit_i2v_without_frame(self):
        """Validation rejects image-to-video with neither reference nor last frame (422)."""
        resp = self.client.post(
            "/api/v1/generate",
            json=self._video_payload(video_mode="image-to-video"),
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 422, resp.text)

    def test_video_api_rejects_explicit_t2v_with_last_frame(self):
        """Validation rejects text-to-video carrying a last frame (422)."""
        resp = self.client.post(
            "/api/v1/generate",
            json=self._video_payload(
                video_mode="text-to-video",
                last_frame_image="data:image/png;base64,AAAA",
            ),
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 422, resp.text)

    def test_video_api_accepts_explicit_t2v(self):
        """A valid explicit text-to-video request executes end-to-end."""
        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(return_value="ltx-2.3-22b-distilled_transformer_only_fp8_scaled.safetensors")
        mock_comfy.resolve_clip_type = AsyncMock(return_value="ltxv")
        mock_comfy.upload_image = AsyncMock(return_value="input_video_starter.png")
        mock_comfy.load_video_it2v_template = lambda: json.loads(json.dumps(self.template))
        mock_comfy.queue_prompt = AsyncMock(return_value="prompt-video-uuid-t2v")
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_output_files = AsyncMock(
            return_value=[{"filename": "VideoFlow-LTX23-t2v_00001.mp4", "subfolder": "video", "folder_type": "output"}]
        )
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")

        with (
            patch("app.main.model_storage", self.mock_model_storage),
            patch("app.main.storage", self.storage),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            resp = self.client.post(
                "/api/v1/generate",
                json=self._video_payload(video_mode="text-to-video"),
                headers=self.headers,
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            data = resp.json()
            self.assertEqual(data["status"], "completed")
            self.assertEqual(len(data["images"]), 1)
            self.assertEqual(data["images"][0]["kind"], "video")

        # The patched graph handed to ComfyUI must be the forced T2V branch.
        queued_graph = mock_comfy.queue_prompt.call_args.args[0]
        self.assertIs(queued_graph["1875"]["inputs"]["value"], False)
        self.assertNotIn("1875_load_first", queued_graph)
        self.assertEqual(queued_graph["1875_force_first"]["inputs"]["value"], 0)
        self.assertEqual(queued_graph["1875_force_last"]["inputs"]["value"], 0)


    def _mock_comfy_success(self, suffix: str = "gate") -> AsyncMock:
        """ComfyUI mock that completes a video job without touching the network."""
        mock_comfy = AsyncMock()
        mock_comfy.resolve_model_name = AsyncMock(
            return_value="ltx-2.3-22b-distilled_transformer_only_fp8_scaled.safetensors"
        )
        mock_comfy.resolve_clip_type = AsyncMock(return_value="ltxv")
        mock_comfy.upload_image = AsyncMock(return_value="input_video_starter.png")
        mock_comfy.load_video_it2v_template = lambda: json.loads(json.dumps(self.template))
        mock_comfy.queue_prompt = AsyncMock(return_value=f"prompt-video-{suffix}")
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_output_files = AsyncMock(
            return_value=[
                {
                    "filename": f"VideoFlow-LTX23-{suffix}_00001.mp4",
                    "subfolder": "video",
                    "folder_type": "output",
                }
            ]
        )
        mock_comfy.fetch_image_bytes = AsyncMock(
            return_value=b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
        )
        return mock_comfy

    # ------------------------------------------------------------------
    # _ensure_video_capable — the LTX hard gate.
    # ------------------------------------------------------------------

    def test_video_gate_rejects_non_ltx_architecture_and_refunds_credits(self):
        """A non-LTX checkpoint is rejected with 409 and the deducted credits refunded."""
        self.mock_model_storage.resolve_installed_gallery_file.return_value = {
            **self.mock_model_storage.resolve_installed_gallery_file.return_value,
            "title": "SDXL Photoreal",
            "base_model": "Stable Diffusion XL (SDXL)",
            "filename": "sdxl_photoreal.safetensors",
        }
        mock_comfy = self._mock_comfy_success("non-ltx")
        initial_credits = self.credits.get_user_credits(self.user.id).balance

        with (
            patch("app.main.model_storage", self.mock_model_storage),
            patch("app.main.storage", self.storage),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            resp = self.client.post(
                "/api/v1/generate", json=self._video_payload(), headers=self.headers
            )

        self.assertEqual(resp.status_code, 409, resp.text)
        detail = resp.json()["detail"]
        self.assertIn("LTX", detail)
        self.assertIn("SDXL Photoreal", detail)
        # The gate fires before any graph is queued.
        mock_comfy.queue_prompt.assert_not_awaited()

        refunded = self.credits.get_user_credits(self.user.id).balance
        self.assertEqual(refunded, initial_credits)

    def test_video_gate_fails_open_without_base_model(self):
        """An unrecorded architecture is treated as compatible (fail-open)."""
        self.mock_model_storage.resolve_installed_gallery_file.return_value = {
            **self.mock_model_storage.resolve_installed_gallery_file.return_value,
            "base_model": None,
        }
        mock_comfy = self._mock_comfy_success("missing-arch")

        with (
            patch("app.main.model_storage", self.mock_model_storage),
            patch("app.main.storage", self.storage),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            resp = self.client.post(
                "/api/v1/generate", json=self._video_payload(), headers=self.headers
            )

        # Not rejected by the LTX gate; the fixture can complete the request.
        self.assertNotEqual(resp.status_code, 409, resp.text)
        if resp.status_code != 200:
            self.assertNotIn("is not an LTX model", resp.text)
        else:
            self.assertEqual(resp.json()["status"], "completed")

    def test_video_gate_fails_open_with_empty_base_model(self):
        """An empty-string architecture is likewise not rejected by the gate."""
        self.mock_model_storage.resolve_installed_gallery_file.return_value = {
            **self.mock_model_storage.resolve_installed_gallery_file.return_value,
            "base_model": "",
        }
        mock_comfy = self._mock_comfy_success("empty-arch")

        with (
            patch("app.main.model_storage", self.mock_model_storage),
            patch("app.main.storage", self.storage),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            resp = self.client.post(
                "/api/v1/generate", json=self._video_payload(), headers=self.headers
            )

        self.assertNotEqual(resp.status_code, 409, resp.text)
        if resp.status_code != 200:
            self.assertNotIn("is not an LTX model", resp.text)
        else:
            self.assertEqual(resp.json()["status"], "completed")

    def test_video_gate_accepts_ltx_aliases(self):
        """Every LTX alias family the picker can produce passes the gate."""
        for architecture in ("LTX Video", "LTX-2.3", "ltx-2.5"):
            with self.subTest(architecture=architecture):
                self.mock_model_storage.resolve_installed_gallery_file.return_value = {
                    **self.mock_model_storage.resolve_installed_gallery_file.return_value,
                    "title": f"{architecture} model",
                    "base_model": architecture,
                }
                mock_comfy = self._mock_comfy_success(
                    "alias-" + architecture.replace(" ", "-").lower()
                )

                with (
                    patch("app.main.model_storage", self.mock_model_storage),
                    patch("app.main.storage", self.storage),
                    patch("app.main.get_comfy_client", return_value=mock_comfy),
                ):
                    resp = self.client.post(
                        "/api/v1/generate",
                        json=self._video_payload(),
                        headers=self.headers,
                    )

                self.assertNotEqual(resp.status_code, 409, resp.text)
                if resp.status_code != 200:
                    self.assertNotIn("is not an LTX model", resp.text)
                else:
                    self.assertEqual(resp.json()["status"], "completed")

    def test_video_generation_with_diffusion_model_without_external_vae(self):
        """A Diffusion Model category without external VAE/clip passes for video generation."""
        self.mock_model_storage.resolve_installed_gallery_file.return_value = {
            **self.mock_model_storage.resolve_installed_gallery_file.return_value,
            "title": "LTX-Video 2.3 DiT",
            "base_model": "LTX-Video 2.3",
            "model_type": "Diffusion Model",
            "category": "diffusion_models",
            "text_encoder": None,
            "vae": None,
        }
        mock_comfy = self._mock_comfy_success("diffusion-model-ltx")

        with (
            patch("app.main.model_storage", self.mock_model_storage),
            patch("app.main.storage", self.storage),
            patch("app.main.get_comfy_client", return_value=mock_comfy),
        ):
            resp = self.client.post(
                "/api/v1/generate",
                json=self._video_payload(),
                headers=self.headers,
            )

        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["status"], "completed")

    # ------------------------------------------------------------------
    # workflow_template_info(mode=...) selects the graph source.
    # ------------------------------------------------------------------

    def test_template_info_default_reads_image_template(self):
        """No mode param keeps the historical image-template source."""
        mock_comfy = MagicMock()
        mock_comfy.load_workflow_template = MagicMock(
            return_value={"1": {"class_type": "KSampler", "inputs": {"seed": 1}}}
        )
        mock_comfy.load_video_it2v_template = MagicMock(return_value={})

        with patch("app.main.get_comfy_client", return_value=mock_comfy):
            resp = self.client.get("/api/v1/workflow/template-info")

        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertTrue(resp.json()["has_template"])
        mock_comfy.load_workflow_template.assert_called_once_with()
        mock_comfy.load_video_it2v_template.assert_not_called()

    def test_template_info_video_mode_reads_video_template(self):
        """mode=video swaps the template source but keeps the node scan."""
        mock_comfy = MagicMock()
        mock_comfy.load_workflow_template = MagicMock(return_value={})
        mock_comfy.load_video_it2v_template = MagicMock(
            return_value=json.loads(json.dumps(self.template))
        )

        with patch("app.main.get_comfy_client", return_value=mock_comfy):
            resp = self.client.get(
                "/api/v1/workflow/template-info", params={"mode": "video"}
            )

        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertTrue(resp.json()["has_template"])
        mock_comfy.load_video_it2v_template.assert_called_once_with()
        mock_comfy.load_workflow_template.assert_not_called()

    def test_template_info_video_mode_reports_dual_clip_and_decode_vae(self):
        """DualCLIPLoader exposes slot 2; preview/audio VAEs are skipped."""
        mock_comfy = MagicMock()
        mock_comfy.load_video_it2v_template = MagicMock(
            return_value=json.loads(json.dumps(self.template))
        )

        with patch("app.main.get_comfy_client", return_value=mock_comfy):
            resp = self.client.get(
                "/api/v1/workflow/template-info", params={"mode": "video"}
            )

        self.assertEqual(resp.status_code, 200, resp.text)
        info = resp.json()
        self.assertEqual(info["clip_name"], "gemma_3_12B_it_fp8_e4m3fn.safetensors")
        self.assertEqual(info["clip_name2"], "ltx-2.3_text_projection_bf16.safetensors")
        self.assertEqual(info["clip_type"], "ltxv")
        self.assertEqual(info["vae_name"], "LTX23_video_vae_bf16.safetensors")
        self.assertNotEqual(info["vae_name"], "taeltx2_3.safetensors")

    def test_template_info_image_mode_has_no_second_clip(self):
        """Single CLIPLoader graph reports clip_name2 as None."""
        mock_comfy = MagicMock()
        mock_comfy.load_workflow_template = MagicMock(
            return_value={
                "616": {
                    "class_type": "CLIPLoader",
                    "inputs": {
                        "clip_name": "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
                        "type": "krea2",
                    },
                },
                "617": {
                    "class_type": "VAELoader",
                    "inputs": {"vae_name": "wan_2.1_vae.safetensors"},
                },
            }
        )

        with patch("app.main.get_comfy_client", return_value=mock_comfy):
            resp = self.client.get("/api/v1/workflow/template-info")

        self.assertEqual(resp.status_code, 200, resp.text)
        info = resp.json()
        self.assertIsNone(info["clip_name2"])
        self.assertEqual(info["vae_name"], "wan_2.1_vae.safetensors")


if __name__ == "__main__":
    unittest.main()
