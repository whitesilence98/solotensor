import asyncio
import json
import unittest
from pathlib import Path

from app.services.comfy_client import ComfyClient, ComfyClientError


class WorkflowPatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        path = Path(__file__).parents[1] / "workflows" / "workflow_api.json"
        cls.template = json.loads(path.read_text(encoding="utf-8"))
        cls.client = ComfyClient()

    def test_patches_exported_node_mappings_without_mutating_template(self) -> None:
        original = json.loads(json.dumps(self.template))
        graph = self.client.patch_workflow_template(
            self.template,
            prompt="a red fox",
            negative_prompt="blurry",
            unet_name="custom\\model.safetensors",
            clip_name="custom_clip.safetensors",
            clip_type="custom_type",
            vae_name="custom_vae.safetensors",
            seed=123,
            steps=17,
            image_count=3,
            cfg=1.5,
            denoise=0.8,
            loras=[
                {"lora": "style\\first.safetensors", "on": True, "strength": 0.8},
                {"lora": "second.safetensors", "on": False, "strength": -0.25},
            ],
            width=1024,
            height=768,
        )
        self.assertEqual(graph["621"]["inputs"]["prompt"], "a red fox")
        self.assertEqual(graph["700"]["inputs"]["text"], "blurry")
        self.assertEqual(graph["618:615"]["inputs"]["unet_name"], "custom\\model.safetensors")
        self.assertEqual(graph["618:616"]["inputs"]["clip_name"], "custom_clip.safetensors")
        self.assertEqual(graph["618:616"]["inputs"]["type"], "custom_type")
        self.assertEqual(graph["618:617"]["inputs"]["vae_name"], "custom_vae.safetensors")
        self.assertEqual(graph["867"]["inputs"]["seed"], 123)
        self.assertEqual(graph["1028"]["inputs"]["noise_seed"], 123)
        self.assertEqual(graph["1028"]["inputs"]["cfg"], 1.5)
        self.assertEqual(graph["1029"]["inputs"]["cfg"], 1.5)
        self.assertEqual(graph["1029"]["inputs"]["denoise"], 0.8)
        self.assertEqual(graph["1025:2"]["inputs"]["modelname"], "custom\\model.safetensors")
        self.assertEqual(graph["1025:2"]["inputs"]["positive"], "a red fox")
        self.assertEqual(graph["1025:2"]["inputs"]["negative"], "blurry")
        self.assertEqual(graph["1025:2"]["inputs"]["seed_value"], 123)
        self.assertEqual(graph["1025:2"]["inputs"]["steps"], 17)
        self.assertEqual(graph["1025:2"]["inputs"]["cfg"], 1.5)
        self.assertEqual(graph["1025:2"]["inputs"]["denoise"], 0.8)
        self.assertEqual(graph["1025:2"]["inputs"]["sampler_name"], "exponential/ddim")
        self.assertEqual(graph["1025:2"]["inputs"]["scheduler_name"], "beta57")
        self.assertEqual(graph["1025:2"]["inputs"]["positive"], "a red fox")
        self.assertEqual(graph["1025:1"]["inputs"]["metadata"], ["1025:2", 0])
        self.assertEqual(graph["903"]["inputs"]["width"], 1024)
        self.assertEqual(graph["903"]["inputs"]["height"], 768)
        self.assertEqual(graph["903"]["inputs"]["batch_size"], 3)
        self.assertEqual(graph["1043"]["inputs"]["lora_1"], {"on": True, "lora": "style\\first.safetensors", "strength": 0.8})
        self.assertEqual(graph["1043"]["inputs"]["lora_2"], {"on": False, "lora": "second.safetensors", "strength": -0.25})
        self.assertEqual(self.template, original)

    def test_empty_loras_clear_baked_template_rows(self) -> None:
        graph = self.client.patch_workflow_template(self.template, prompt="test", loras=[])
        self.assertFalse(any(key.lower().startswith("lora_") for key in graph["1043"]["inputs"]))
        self.assertEqual(graph["1043"]["inputs"]["➕ Add Lora"], "")

        graph = self.client._build_builtin_workflow(
            prompt="test",
            image_count=4,
            denoise=0.65,
            width=1536,
            height=640,
        )
        self.assertEqual(graph["4"]["inputs"]["width"], 1536)
        self.assertEqual(graph["4"]["inputs"]["height"], 640)
        self.assertEqual(graph["4"]["inputs"]["batch_size"], 4)
        self.assertEqual(graph["5"]["inputs"]["denoise"], 0.65)

    def test_resolve_model_name_matches_comfyui_enumeration(self) -> None:
        async def run() -> str:
            async def fake_list(category: str) -> list[str]:
                self.assertEqual(category, "diffusion_models")
                return [
                    "krea2\\krea2_turbo_fp8_scaled.safetensors",
                    "z-image\\z_image_turbo_bf16.safetensors",
                ]

            client = ComfyClient()
            client.list_models = fake_list  # type: ignore[method-assign]
            return await client.resolve_model_name(
                "diffusion_models", "z-image/z_image_turbo_bf16.safetensors"
            )

        self.assertEqual(asyncio.run(run()), "z-image\\z_image_turbo_bf16.safetensors")

        async def run_missing() -> None:
            async def fake_list(category: str) -> list[str]:
                return ["other\\model.safetensors"]

            client = ComfyClient()
            client.list_models = fake_list  # type: ignore[method-assign]
            await client.resolve_model_name(
                "diffusion_models", "z-image/z_image_turbo_bf16.safetensors"
            )

        with self.assertRaises(ComfyClientError):
            asyncio.run(run_missing())

    def test_gallery_workflows_use_resolved_filename(self) -> None:
        checkpoint = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="nested/checkpoint.safetensors",
            prompt="test",
        )
        self.assertEqual(checkpoint["1"]["inputs"]["ckpt_name"], "nested/checkpoint.safetensors")

        unet = self.client.build_gallery_workflow(
            model_type="Diffusion Model",
            filename="nested/unet.safetensors",
            prompt="test",
        )
        self.assertEqual(unet["618:615"]["inputs"]["unet_name"], "nested/unet.safetensors")
        self.assertFalse(any(key.lower().startswith("lora_") for key in unet["1043"]["inputs"]))

        with self.assertRaises(ComfyClientError):
            self.client.build_gallery_workflow(model_type="LoRA", filename="adapter.safetensors", prompt="test")

    def test_lora_workflows_use_selected_base_and_adapter(self) -> None:
        diffusion = self.client.build_lora_workflow(
            base_model_type="Diffusion Model",
            base_filename="base\\model.safetensors",
            lora_filename="style\\adapter.safetensors",
            clip_name="encoder.safetensors",
            clip_type="custom_type",
            vae_name="vae.safetensors",
            prompt="test",
        )
        self.assertEqual(diffusion["618:615"]["inputs"]["unet_name"], "base\\model.safetensors")
        self.assertEqual(diffusion["1043"]["inputs"]["lora_1"]["lora"], "style\\adapter.safetensors")
        self.assertEqual(diffusion["1043"]["inputs"]["lora_1"]["strength"], 1.0)

        checkpoint = self.client.build_lora_workflow(
            base_model_type="Checkpoint",
            base_filename="base.safetensors",
            lora_filename="adapter.safetensors",
            prompt="test",
        )
        self.assertEqual(checkpoint["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertEqual(checkpoint["1"]["inputs"]["ckpt_name"], "base.safetensors")
        self.assertEqual(checkpoint["2"]["class_type"], "LoraLoader")
        self.assertEqual(checkpoint["2"]["inputs"]["lora_name"], "adapter.safetensors")

    def test_lora_builder_rejects_non_base_model(self) -> None:
        with self.assertRaises(ComfyClientError):
            self.client.build_lora_workflow(
                base_model_type="LoRA",
                base_filename="base.safetensors",
                lora_filename="adapter.safetensors",
                prompt="test",
            )

    def test_missing_required_node_fails(self) -> None:
        template = json.loads(json.dumps(self.template))
        del template["621"]
        with self.assertRaises(ComfyClientError):
            self.client.patch_workflow_template(template, prompt="test")

    def test_omitted_seed_is_generated(self) -> None:
        graph = self.client.patch_workflow_template(self.template, prompt="test")
        seed = graph["867"]["inputs"]["seed"]
        self.assertEqual(graph["1028"]["inputs"]["noise_seed"], seed)
        self.assertIsInstance(seed, int)
        self.assertGreaterEqual(seed, 0)
        self.assertLessEqual(seed, 2**32 - 1)

    def test_missing_lora_node_fails(self) -> None:
        template = json.loads(json.dumps(self.template))
        del template["1043"]
        with self.assertRaises(ComfyClientError):
            self.client.patch_workflow_template(template, prompt="test")

    def test_multi_lora_checkpoint_chaining(self) -> None:
        loras = [
            {"lora": "style\\cyberpunk.safetensors", "strength": 0.7, "on": True},
            {"lora": "character\\hero.safetensors", "strength": 0.5, "on": True},
        ]
        graph = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="base.safetensors",
            clip_name="",
            clip_type="",
            vae_name="",
            prompt="cyber hero",
            negative_prompt="blurry",
            loras=loras,
        )
        self.assertEqual(graph["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertEqual(graph["lora_1"]["class_type"], "LoraLoader")
        self.assertEqual(graph["lora_1"]["inputs"]["lora_name"], "style\\cyberpunk.safetensors")
        self.assertEqual(graph["lora_1"]["inputs"]["strength_model"], 0.7)
        self.assertEqual(graph["lora_1"]["inputs"]["model"], ["1", 0])
        self.assertEqual(graph["lora_1"]["inputs"]["clip"], ["1", 1])

        self.assertEqual(graph["lora_2"]["class_type"], "LoraLoader")
        self.assertEqual(graph["lora_2"]["inputs"]["lora_name"], "character\\hero.safetensors")
        self.assertEqual(graph["lora_2"]["inputs"]["strength_model"], 0.5)
        self.assertEqual(graph["lora_2"]["inputs"]["model"], ["lora_1", 0])
        self.assertEqual(graph["lora_2"]["inputs"]["clip"], ["lora_1", 1])

        self.assertEqual(graph["3"]["inputs"]["clip"], ["lora_2", 1])
        self.assertEqual(graph["4"]["inputs"]["clip"], ["lora_2", 1])
        self.assertEqual(graph["6"]["inputs"]["model"], ["lora_2", 0])

    def test_gallery_workflow_with_loras_diffusion_model(self) -> None:
        loras = [
            {"lora": "style\\anime.safetensors", "strength": 0.8, "on": True},
            {"lora": "concept\\lighting.safetensors", "strength": 0.6, "on": True},
        ]
        graph = self.client.build_gallery_workflow(
            model_type="Diffusion Model",
            filename="flux_unet.safetensors",
            clip_name="clip_l.safetensors",
            clip_type="flux",
            vae_name="ae.safetensors",
            prompt="anime girl",
            negative_prompt="",
            loras=loras,
        )
        self.assertEqual(graph["1043"]["inputs"]["lora_1"], {"on": True, "lora": "style\\anime.safetensors", "strength": 0.8})
        self.assertEqual(graph["1043"]["inputs"]["lora_2"], {"on": True, "lora": "concept\\lighting.safetensors", "strength": 0.6})



if __name__ == "__main__":
    unittest.main()
