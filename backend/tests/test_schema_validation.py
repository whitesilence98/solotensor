import unittest

from pydantic import ValidationError

from app.schemas import (
    AssistantRequest,
    GenerateRequest,
    GeneratedAsset,
    LoraAdapterSelection,
    ModelCompatibility,
    ModelGenerationSettings,
    SUPPORTED_BASE_MODELS,
    UploadedAsset,
)


IDS = {
    "model_id": "a" * 32,
    "version_id": "b" * 32,
    "file_id": "c" * 32,
}


class PromptValidationTests(unittest.TestCase):
    def test_accepts_one_thousand_words(self) -> None:
        request = GenerateRequest(prompt="word " * 1_000, **IDS)
        self.assertEqual(len(request.prompt.split()), 1_000)

    def test_accepts_is_private_flag(self) -> None:
        req_public = GenerateRequest(prompt="test", is_private=False, **IDS)
        self.assertFalse(req_public.is_private)
        req_private = GenerateRequest(prompt="test", is_private=True, **IDS)
        self.assertTrue(req_private.is_private)

    def test_accepts_enable_detailer_flag(self) -> None:
        req_default = GenerateRequest(prompt="test", **IDS)
        self.assertFalse(req_default.enable_detailer)
        req_enabled = GenerateRequest(prompt="test", enable_detailer=True, **IDS)
        self.assertTrue(req_enabled.enable_detailer)
        req_disabled = GenerateRequest(prompt="test", enable_detailer=False, **IDS)
        self.assertFalse(req_disabled.enable_detailer)

    def test_rejects_more_than_one_thousand_words(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(prompt="word " * 1_001, **IDS)

    def test_requires_gallery_identity(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(prompt="test")

    def test_accepts_optional_lora_base_identity(self) -> None:
        request = GenerateRequest(
            prompt="test",
            base_model_id="d" * 32,
            base_version_id="e" * 32,
            base_file_id="f" * 32,
            **IDS,
        )
        self.assertEqual(request.base_model_id, "d" * 32)

    def test_rejects_partial_lora_base_identity(self) -> None:
        for fields in (
            {"base_model_id": "d" * 32},
            {"base_model_id": "d" * 32, "base_version_id": "e" * 32},
            {"base_version_id": "e" * 32, "base_file_id": "f" * 32},
        ):
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                GenerateRequest(prompt="test", **IDS, **fields)

    def test_rejects_partial_model_compatibility_base_identity(self) -> None:
        with self.assertRaises(ValidationError):
            ModelCompatibility(base_model_id="d" * 32)

    def test_rejects_legacy_model_fields(self) -> None:
        for field, value in (
            ("model", "sdxl"),
            ("unet_name", "model.safetensors"),
            ("vae_name", "vae.safetensors"),
            ("loras", []),
        ):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                GenerateRequest(prompt="test", **IDS, **{field: value})

    def test_accepts_lora_adapters(self) -> None:
        req = GenerateRequest(
            prompt="test",
            **IDS,
            lora_adapters=[
                LoraAdapterSelection(
                    model_id="d" * 32,
                    version_id="e" * 32,
                    file_id="f" * 32,
                    strength=0.75,
                    on=True,
                ),
                LoraAdapterSelection(
                    lora="style/detail.safetensors",
                    strength=0.6,
                    on=False,
                ),
            ],
        )
        self.assertEqual(len(req.lora_adapters), 2)
        self.assertEqual(req.lora_adapters[0].strength, 0.75)
        self.assertEqual(req.lora_adapters[1].lora, "style/detail.safetensors")

    def test_rejects_invalid_lora_adapters(self) -> None:
        # Neither lora nor gallery file provided
        with self.assertRaises(ValidationError):
            LoraAdapterSelection()
        # Incomplete gallery identity
        with self.assertRaises(ValidationError):
            LoraAdapterSelection(model_id="d" * 32, version_id="e" * 32)


    def test_accepts_exact_supported_base_models(self) -> None:
        for model in SUPPORTED_BASE_MODELS:
            compat = ModelCompatibility(base_model=model)
            self.assertTrue(compat.base_model)

    def test_normalizes_legacy_sdxl_base_model(self) -> None:
        self.assertEqual(ModelCompatibility(base_model="SDXL 1.0").base_model, "Stable Diffusion XL (SDXL)")
        self.assertEqual(ModelCompatibility(base_model="sdxl").base_model, "Stable Diffusion XL (SDXL)")
        self.assertEqual(ModelCompatibility(base_model="sd 1.5").base_model, "Stable Diffusion 1.5 (SD 1.5)")
        self.assertEqual(ModelCompatibility(base_model="hunyuandit").base_model, "Hunyuan-DiT")

    def test_accepts_krea_2_cleanly(self) -> None:
        compat = ModelCompatibility(base_model="Krea-2")
        self.assertEqual(compat.base_model, "Krea-2")

    def test_normalizes_krea_2_legacy_and_aliases(self) -> None:
        self.assertEqual(ModelCompatibility(base_model="KREA_2").base_model, "Krea-2")
        self.assertEqual(ModelCompatibility(base_model="krea_2").base_model, "Krea-2")
        self.assertEqual(ModelCompatibility(base_model="krea-2").base_model, "Krea-2")

    def test_accepts_frontend_architectures(self) -> None:
        self.assertEqual(ModelCompatibility(base_model="Allegro").base_model, "Allegro")
        self.assertEqual(ModelCompatibility(base_model="Wan2.1").base_model, "Wan 2.1 / Wan 2.8")

    def test_accepts_custom_architectures(self) -> None:
        self.assertEqual(ModelCompatibility(base_model="Lumina-Next").base_model, "Lumina-Next")
        self.assertEqual(ModelCompatibility(base_model="Playground v2.5").base_model, "Playground v2.5")
        self.assertEqual(ModelCompatibility(base_model="  Custom-Architecture  ").base_model, "Custom-Architecture")

    def test_rejects_blank_or_invalid_base_models(self) -> None:
        for invalid_val in ("", "   ", "a" * 81, None, 12345):
            with self.subTest(invalid=invalid_val), self.assertRaises(ValidationError):
                ModelCompatibility(base_model=invalid_val)

    def test_allows_no_vae_and_empty_lists(self) -> None:
        compatibility = ModelCompatibility(vae=None, text_encoder=None, clip_type=None)
        generation = ModelGenerationSettings(trigger_words=[])
        self.assertEqual(compatibility.base_model, "Stable Diffusion XL (SDXL)")
        self.assertIsNone(compatibility.vae)
        self.assertIsNone(compatibility.text_encoder)
        self.assertIsNone(compatibility.clip_type)
        self.assertEqual(generation.trigger_words, [])

    def test_migrates_legacy_encoder_list(self) -> None:
        compatibility = ModelCompatibility(text_encoders=["encoder.safetensors"], clip_type="krea2")
        self.assertEqual(compatibility.text_encoder, "encoder.safetensors")

    def test_requires_encoder_and_clip_type_together(self) -> None:
        with self.assertRaises(ValidationError):
            ModelCompatibility(text_encoder="encoder.safetensors")
        with self.assertRaises(ValidationError):
            ModelCompatibility(clip_type="krea2")

    def test_tier_specific_compatibilities(self) -> None:
        # VAE: standalone, no VAE or text encoder needed
        vae_compat = ModelCompatibility(base_model="FLUX.1", vae=None, text_encoder=None, clip_type=None)
        self.assertEqual(vae_compat.base_model, "FLUX.1")
        self.assertIsNone(vae_compat.vae)

        # Checkpoint: supports ae.sft and modular text encoder
        ckpt_compat = ModelCompatibility(
            base_model="FLUX.1",
            vae="ae.sft",
            text_encoder="t5xxl_fp8.sft",
            clip_type="flux2",
        )
        self.assertEqual(ckpt_compat.vae, "ae.sft")
        self.assertEqual(ckpt_compat.text_encoder, "t5xxl_fp8.sft")

        # LoRA: binds to installed base model, no VAE/encoder required
        lora_compat = ModelCompatibility(
            base_model="Stable Diffusion XL (SDXL)",
            base_model_id="a" * 32,
            base_version_id="b" * 32,
            base_file_id="c" * 32,
            vae=None,
            text_encoder=None,
            clip_type=None,
        )
        self.assertEqual(lora_compat.base_model_id, "a" * 32)
        self.assertIsNone(lora_compat.vae)

        # Wildcards: universal base, no encoders
        wildcard_compat = ModelCompatibility(base_model="Universal", vae=None, text_encoder=None, clip_type=None)
        self.assertEqual(wildcard_compat.base_model, "Universal")


class VideoModeValidationTests(unittest.TestCase):
    """Explicit video sub-mode contract on GenerateRequest."""

    def _video(self, **overrides) -> GenerateRequest:
        return GenerateRequest(mode="video", prompt="test", **IDS, **overrides)

    def test_legacy_video_omits_video_mode(self) -> None:
        req = self._video()
        self.assertIsNone(req.video_mode)

    def test_explicit_t2v_accepted(self) -> None:
        req = self._video(video_mode="text-to-video")
        self.assertEqual(req.video_mode, "text-to-video")

    def test_explicit_t2v_rejects_reference_images(self) -> None:
        with self.assertRaises(ValidationError):
            self._video(video_mode="text-to-video", reference_images=["frame.png"])

    def test_explicit_t2v_rejects_last_frame(self) -> None:
        with self.assertRaises(ValidationError):
            self._video(video_mode="text-to-video", last_frame_image="data:image/png;base64,AAAA")

    def test_explicit_i2v_requires_a_frame(self) -> None:
        with self.assertRaises(ValidationError):
            self._video(video_mode="image-to-video")

    def test_explicit_i2v_accepts_reference_image(self) -> None:
        req = self._video(video_mode="image-to-video", reference_images=["frame.png"])
        self.assertEqual(req.reference_images, ["frame.png"])

    def test_explicit_i2v_accepts_last_frame(self) -> None:
        req = self._video(
            video_mode="image-to-video",
            last_frame_image="data:image/png;base64,AAAA",
        )
        self.assertEqual(req.last_frame_image, "data:image/png;base64,AAAA")

    def test_legacy_last_frame_only_still_accepted(self) -> None:
        req = self._video(last_frame_image="data:image/png;base64,AAAA")
        self.assertIsNone(req.video_mode)
        self.assertIsNotNone(req.last_frame_image)

    def test_video_mode_rejected_on_non_video_mode(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(
                mode="text-to-image",
                video_mode="text-to-video",
                prompt="test",
                **IDS,
            )


class InstalledGalleryModelSchemaTests(unittest.TestCase):
    def test_installed_gallery_model_category_acceptance(self) -> None:
        from app.schemas import InstalledGalleryModel, ModelFileResponse, ModelPrecision

        for cat in ("checkpoints", "diffusion_models", "loras", "custom_folder"):
            model = InstalledGalleryModel(
                model_id="a" * 32,
                version_id="b" * 32,
                file_id="c" * 32,
                title="Title",
                model_type="Checkpoint",
                version_name="v1.0",
                filename="model.safetensors",
                category=cat,
                sha256="d" * 64,
            )
            self.assertEqual(model.category, cat)

    def test_installed_gallery_model_video_family(self) -> None:
        from app.schemas import InstalledGalleryModel

        base = dict(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            title="Title",
            model_type="Checkpoint",
            version_name="v1.0",
            filename="model.safetensors",
            category="checkpoints",
            sha256="d" * 64,
        )

        # Omitted -> defaults to None (old payloads/serialized records still valid)
        self.assertIsNone(InstalledGalleryModel(**base).video_family)

        # Explicit value is preserved
        declared = InstalledGalleryModel(**base, video_family="ltx")
        self.assertEqual(declared.video_family, "ltx")

        # Explicit null round-trips
        nulled = InstalledGalleryModel(**base, video_family=None)
        self.assertIsNone(nulled.video_family)

    def test_model_file_response_category(self) -> None:
        from app.schemas import ModelFileResponse, ModelPrecision

        file_with_cat = ModelFileResponse(
            file_id="c" * 32,
            filename="model.safetensors",
            size=1000,
            sha256="d" * 64,
            precision=ModelPrecision.FP16,
            visible=True,
            download_url="http://test",
            category="diffusion_models",
        )
        self.assertEqual(file_with_cat.category, "diffusion_models")

        file_without_cat = ModelFileResponse(
            file_id="c" * 32,
            filename="model.safetensors",
            size=1000,
            sha256="d" * 64,
            precision=ModelPrecision.FP16,
            visible=True,
            download_url="http://test",
        )
        self.assertIsNone(file_without_cat.category)


class CodeAssistantSchemaTests(unittest.TestCase):
    def test_accepts_backend_and_frontend_personas(self) -> None:
        self.assertEqual(AssistantRequest(persona="backend", message="Add a route").persona.value, "backend")
        self.assertEqual(AssistantRequest(persona="frontend", message="Add a page").persona.value, "frontend")

    def test_trims_and_rejects_invalid_messages(self) -> None:
        self.assertEqual(AssistantRequest(persona="backend", message="  Hello  ").message, "Hello")
        for payload in (
            {"persona": "backend", "message": "   "},
            {"persona": "backend", "message": "x" * 12_001},
            {"persona": "other", "message": "Hello"},
            {"persona": "backend", "message": "Hello", "model": "anything"},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                AssistantRequest(**payload)


class ModelModerationSchemaTests(unittest.TestCase):
    def test_model_moderation_status_enum(self) -> None:
        from app.schemas import ModelModerationStatus

        self.assertEqual(ModelModerationStatus.DRAFT.value, "draft")
        self.assertEqual(ModelModerationStatus.PENDING_REVIEW.value, "pending_review")
        self.assertEqual(ModelModerationStatus.APPROVED.value, "approved")
        self.assertEqual(ModelModerationStatus.REJECTED.value, "rejected")

    def test_model_review_request_validation(self) -> None:
        from app.schemas import ModelReviewRequest, ModelReviewAction

        req = ModelReviewRequest(
            action=ModelReviewAction.APPROVE,
            notes="Looks solid and compliant.",
            install_to_comfy=True,
            version_id="b" * 32,
            file_id="c" * 32,
        )
        self.assertEqual(req.action, ModelReviewAction.APPROVE)
        self.assertTrue(req.install_to_comfy)

        with self.assertRaises(ValidationError):
            ModelReviewRequest(action="invalid_action")


class GeneratedAssetSchemaTests(unittest.TestCase):
    def test_generated_asset_before_detailer_url(self) -> None:
        asset_default = GeneratedAsset(filename="output.png", url="/static/output.png")
        self.assertIsNone(asset_default.before_detailer_url)

        asset_with_url = GeneratedAsset(
            filename="output.png",
            url="/static/output.png",
            before_detailer_url="/static/before_detailer.png",
        )
        self.assertEqual(asset_with_url.before_detailer_url, "/static/before_detailer.png")

    def test_uploaded_asset_alias_before_detailer_url(self) -> None:
        asset_default = UploadedAsset(filename="output.png", url="/static/output.png")
        self.assertIsNone(asset_default.before_detailer_url)

        asset_with_url = UploadedAsset(
            filename="output.png",
            url="/static/output.png",
            before_detailer_url="/static/before_detailer.png",
        )
        self.assertEqual(asset_with_url.before_detailer_url, "/static/before_detailer.png")

    def test_gallery_item_detailer_metadata(self) -> None:
        from app.schemas import GalleryItem, GenerationMetadata

        item_default = GalleryItem(
            key="workspace/test/image.png",
            url="/static/image.png",
            size=1024,
            last_modified="2026-10-23T00:00:00Z",
        )
        self.assertIsNone(item_default.before_detailer_url)
        self.assertIsNone(item_default.has_detailer)
        self.assertIsNone(item_default.enable_detailer)

        item_detailed = GalleryItem(
            key="workspace/test/image.png",
            url="/static/image.png",
            size=1024,
            last_modified="2026-10-23T00:00:00Z",
            before_detailer_url="/static/before.png",
            has_detailer=True,
            enable_detailer=True,
        )
        self.assertEqual(item_detailed.before_detailer_url, "/static/before.png")
        self.assertTrue(item_detailed.has_detailer)
        self.assertTrue(item_detailed.enable_detailer)

        meta = GenerationMetadata(
            enable_detailer=True,
            has_detailer=True,
            before_detailer_url="/static/before.png",
        )
        self.assertTrue(meta.enable_detailer)
        self.assertTrue(meta.has_detailer)
        self.assertEqual(meta.before_detailer_url, "/static/before.png")


if __name__ == "__main__":
    unittest.main()
