import unittest

from pydantic import ValidationError

from app.schemas import AssistantRequest, GenerateRequest, ModelCompatibility, ModelGenerationSettings, SUPPORTED_BASE_MODELS


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

    def test_rejects_legacy_model_fields(self) -> None:
        for field, value in (
            ("model", "sdxl"),
            ("unet_name", "model.safetensors"),
            ("clip_name", "clip.safetensors"),
            ("vae_name", "vae.safetensors"),
            ("loras", []),
        ):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                GenerateRequest(prompt="test", **IDS, **{field: value})


class ModelCompatibilityValidationTests(unittest.TestCase):
    def test_accepts_exact_supported_base_models(self) -> None:
        self.assertEqual({ModelCompatibility(base_model=model).base_model for model in SUPPORTED_BASE_MODELS}, set(SUPPORTED_BASE_MODELS))

    def test_normalizes_legacy_sdxl_base_model(self) -> None:
        self.assertEqual(ModelCompatibility(base_model="SDXL 1.0").base_model, "Stable Diffusion XL (SDXL)")

    def test_rejects_unsupported_base_model(self) -> None:
        with self.assertRaises(ValidationError):
            ModelCompatibility(base_model="arbitrary")

    def test_allows_no_vae_and_empty_lists(self) -> None:
        compatibility = ModelCompatibility(vae=None, text_encoders=[])
        generation = ModelGenerationSettings(trigger_words=[])
        self.assertEqual(compatibility.base_model, "Stable Diffusion XL (SDXL)")
        self.assertIsNone(compatibility.vae)
        self.assertEqual(compatibility.text_encoders, [])
        self.assertEqual(generation.trigger_words, [])


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
