import unittest

from pydantic import ValidationError

from app.schemas import (
    AssistantRequest,
    GenerateRequest,
    LoraAdapterSelection,
    ModelCompatibility,
    ModelGenerationSettings,
    SUPPORTED_BASE_MODELS,
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
        self.assertEqual({ModelCompatibility(base_model=model).base_model for model in SUPPORTED_BASE_MODELS}, set(SUPPORTED_BASE_MODELS))

    def test_normalizes_legacy_sdxl_base_model(self) -> None:
        self.assertEqual(ModelCompatibility(base_model="SDXL 1.0").base_model, "Stable Diffusion XL (SDXL)")

    def test_rejects_unsupported_base_model(self) -> None:
        with self.assertRaises(ValidationError):
            ModelCompatibility(base_model="arbitrary")

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


if __name__ == "__main__":
    unittest.main()
