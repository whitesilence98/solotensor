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
            unet_name="custom\\model.safetensors",
            clip_name="custom_clip.safetensors",
            vae_name="custom_vae.safetensors",
            seed=123,
            steps=17,
            width=1024,
            height=768,
        )
        self.assertEqual(graph["621"]["inputs"]["prompt"], "a red fox")
        self.assertEqual(graph["618:615"]["inputs"]["unet_name"], "custom\\model.safetensors")
        self.assertEqual(graph["618:616"]["inputs"]["clip_name"], "custom_clip.safetensors")
        self.assertEqual(graph["618:617"]["inputs"]["vae_name"], "custom_vae.safetensors")
        self.assertEqual(graph["867"]["inputs"]["seed"], 123)
        self.assertEqual(graph["897"]["inputs"]["value"], 17)
        self.assertEqual(graph["903"]["inputs"]["width"], 1024)
        self.assertEqual(graph["903"]["inputs"]["height"], 768)
        self.assertEqual(self.template, original)

    def test_builtin_workflow_uses_explicit_dimensions(self) -> None:
        graph = self.client._build_builtin_workflow(
            prompt="test",
            width=1536,
            height=640,
        )
        self.assertEqual(graph["4"]["inputs"]["width"], 1536)
        self.assertEqual(graph["4"]["inputs"]["height"], 640)

    def test_missing_required_node_fails(self) -> None:
        template = json.loads(json.dumps(self.template))
        del template["621"]
        with self.assertRaises(ComfyClientError):
            self.client.patch_workflow_template(template, prompt="test")

    def test_omitted_seed_is_generated(self) -> None:
        graph = self.client.patch_workflow_template(self.template, prompt="test")
        seed = graph["867"]["inputs"]["seed"]
        self.assertIsInstance(seed, int)
        self.assertGreaterEqual(seed, 0)
        self.assertLessEqual(seed, 2**32 - 1)


if __name__ == "__main__":
    unittest.main()
