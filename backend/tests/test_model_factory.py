import unittest

from app.services.model_factory import ModelHandlerFactory, ModelTier


class TestModelHandlerFactory(unittest.TestCase):
    def test_all_sixteen_types_registered(self) -> None:
        types = ModelHandlerFactory.all_types()
        self.assertEqual(len(types), 16)
        for m_type in types:
            handler = ModelHandlerFactory.get_handler(m_type)
            self.assertIsNotNone(handler)
            self.assertEqual(handler.model_type, m_type)

    def test_tier_classifications(self) -> None:
        self.assertEqual(ModelHandlerFactory.get_tier("Checkpoint"), ModelTier.CORE_BASE)
        self.assertEqual(ModelHandlerFactory.get_tier("SVD"), ModelTier.CORE_BASE)

        for adapter in ("LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"):
            self.assertEqual(ModelHandlerFactory.get_tier(adapter), ModelTier.ADAPTER)
            self.assertTrue(ModelHandlerFactory.is_adapter(adapter))
            self.assertFalse(ModelHandlerFactory.is_base_model(adapter))

        self.assertEqual(ModelHandlerFactory.get_tier("VAE"), ModelTier.AUTOENCODER)
        for guidance in ("ControlNet", "Poses", "StyleModel"):
            self.assertEqual(ModelHandlerFactory.get_tier(guidance), ModelTier.GUIDANCE)

        for inversion in ("Embedding", "Aesthetic Gradient", "Hyper Network"):
            self.assertEqual(ModelHandlerFactory.get_tier(inversion), ModelTier.INVERSION)

        self.assertEqual(ModelHandlerFactory.get_tier("Wildcards"), ModelTier.PROMPT_ASSET)

    def test_category_folder_mappings(self) -> None:
        self.assertEqual(ModelHandlerFactory.install_category("Checkpoint"), "checkpoints")
        self.assertEqual(ModelHandlerFactory.install_category("SVD"), "checkpoints")
        self.assertEqual(ModelHandlerFactory.install_category("LoRA"), "loras")
        self.assertEqual(ModelHandlerFactory.install_category("DoRA"), "loras")
        self.assertEqual(ModelHandlerFactory.install_category("VAE"), "vae")
        self.assertEqual(ModelHandlerFactory.install_category("ControlNet"), "controlnet")
        self.assertEqual(ModelHandlerFactory.install_category("Poses"), "poses")
        self.assertEqual(ModelHandlerFactory.install_category("Wildcards"), "wildcards")
        self.assertEqual(ModelHandlerFactory.install_category("Embedding"), "embeddings")
        self.assertEqual(ModelHandlerFactory.install_category("Hyper Network"), "hypernetworks")
        self.assertEqual(ModelHandlerFactory.install_category("StyleModel"), "style_models")

    def test_sanitize_compatibility_by_tier(self) -> None:
        raw = {
            "base_model": "FLUX.1",
            "vae": "ae.sft",
            "text_encoder": "t5xxl.safetensors",
            "clip_type": "flux2",
        }

        # Checkpoint retains VAE and Text Encoder
        cleaned_ckpt = ModelHandlerFactory.sanitize_compatibility("Checkpoint", raw)
        self.assertEqual(cleaned_ckpt["vae"], "ae.sft")
        self.assertEqual(cleaned_ckpt["text_encoder"], "t5xxl.safetensors")

        # VAE strips VAE and Text Encoder (it operates standalone in pixel/latent space)
        cleaned_vae = ModelHandlerFactory.sanitize_compatibility("VAE", raw)
        self.assertIsNone(cleaned_vae["vae"])
        self.assertIsNone(cleaned_vae["text_encoder"])
        self.assertIsNone(cleaned_vae["clip_type"])
        self.assertEqual(cleaned_vae["base_model"], "FLUX.1")

        # Wildcards strips VAE and Text Encoder
        cleaned_wildcards = ModelHandlerFactory.sanitize_compatibility("Wildcards", raw)
        self.assertIsNone(cleaned_wildcards["vae"])
        self.assertIsNone(cleaned_wildcards["text_encoder"])

        # ControlNet strips VAE and Text Encoder
        cleaned_control = ModelHandlerFactory.sanitize_compatibility("ControlNet", raw)
        self.assertIsNone(cleaned_control["vae"])
        self.assertIsNone(cleaned_control["text_encoder"])

    def test_sanitize_compatibility_text_encoder_2(self) -> None:
        raw = {
            "base_model": "LTX-Video 2.3",
            "text_encoder": "gemma_3_12B_it_fp8_e4m3fn.safetensors",
            "text_encoder_2": "ltx-2.3_text_projection_bf16.safetensors",
            "clip_type": "ltxv",
        }

        cleaned_ckpt = ModelHandlerFactory.sanitize_compatibility("Checkpoint", raw)
        self.assertEqual(
            cleaned_ckpt["text_encoder_2"], "ltx-2.3_text_projection_bf16.safetensors"
        )

        for model_type in ("VAE", "Wildcards", "ControlNet"):
            with self.subTest(model_type=model_type):
                cleaned = ModelHandlerFactory.sanitize_compatibility(model_type, raw)
                self.assertIsNone(cleaned["text_encoder_2"])
                self.assertIsNone(cleaned["text_encoder"])

    def test_checkpoint_dual_folder_resolution(self) -> None:
        handler = ModelHandlerFactory.get_handler("Checkpoint")
        self.assertEqual(handler.candidate_categories, ("checkpoints", "diffusion_models"))
        self.assertEqual(
            ModelHandlerFactory.candidate_categories("Checkpoint"),
            ("checkpoints", "diffusion_models"),
        )
        self.assertIn("dual folder", handler.__doc__.lower())


if __name__ == "__main__":
    unittest.main()
