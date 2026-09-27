import copy
import json
import tempfile
import unittest
from pathlib import Path

from app.config import Settings
from app.schemas import ToolAspectRatio, ToolMode
from app.services.ai_tools import AIToolError, AIToolService, extract_controls


class AIToolServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.service = AIToolService(Settings(TOOLS_DIR=self.temp.name))
        self.workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "negative": {"class_type": "CLIPTextEncode", "inputs": {"text": "blur"}},
            "seed": {"class_type": "Seed (rgthree)", "inputs": {"seed": 123}},
            "steps": {"class_type": "Int", "inputs": {"value": 12}},
            "latent": {"class_type": "EmptyLatentImage", "inputs": {"width": 768, "height": 512}},
            "sampler": {
                "class_type": "KSamplerAdvanced",
                "inputs": {
                    "seed": ["seed", 0],
                    "steps": ["steps", 0],
                    "sampler_name": "euler",
                    "scheduler": "simple",
                    "positive": ["text", 0],
                    "negative": ["negative", 0],
                },
            },
            "model": {"class_type": "UNETLoader", "inputs": {"unet_name": "locked.safetensors"}},
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_extracts_controls_and_locks_infrastructure(self) -> None:
        controls, locked = extract_controls(self.workflow)
        paths = {control["path"] for control in controls}
        self.assertIn("nodes.text.inputs.text", paths)
        self.assertIn("nodes.seed.inputs.seed", paths)
        self.assertIn("nodes.steps.inputs.value", paths)
        self.assertIn("nodes.latent.inputs.width", paths)
        self.assertIn("nodes.latent.inputs.height", paths)
        self.assertNotIn("nodes.model.inputs.unet_name", paths)
        self.assertEqual(locked, [{"id": "model", "class_type": "UNETLoader"}])

    def test_parse_persists_and_inject_does_not_mutate_definition(self) -> None:
        response = self.service.parse(json.dumps(self.workflow).encode(), "Demo")
        original = copy.deepcopy(self.workflow)
        graph = self.service.inject(response.tool_id, {"nodes.text.inputs.text": "new prompt"})
        self.assertEqual(graph["text"]["inputs"]["text"], "new prompt")
        self.assertEqual(self.service.get(response.tool_id)["workflow"], original)

    def test_rejects_unknown_locked_and_invalid_values(self) -> None:
        response = self.service.parse(json.dumps(self.workflow).encode())
        cases = [
            {"nodes.model.inputs.unet_name": "other.safetensors"},
            {"nodes.nope.inputs.value": 1},
            {"nodes.latent.inputs.width": 65},
            {"nodes.steps.inputs.value": 0},
            {"nodes.text.inputs.text": {"bad": True}},
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(AIToolError):
                self.service.inject(response.tool_id, values)

    def test_rejects_invalid_graph_shape(self) -> None:
        with self.assertRaises(AIToolError):
            self.service.parse(b"[]")
        with self.assertRaises(AIToolError):
            self.service.parse(json.dumps({"1": {"inputs": {}}}).encode())
    def test_image_tool_uses_reference_without_empty_latent(self) -> None:
        workflow = {
            "image": {"class_type": "LoadImage", "inputs": {"image": "source.png"}},
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "sampler": {"class_type": "KSampler", "inputs": {"positive": ["text", 0]}},
        }
        response = self.service.create(json.dumps(workflow).encode(), "Reference", ToolMode.IMAGE_TO_IMAGE, ToolAspectRatio.SQUARE)
        graph, resolved = self.service.build_graph(response.tool_id, "new", ToolAspectRatio.LANDSCAPE, "uploaded.png")
        self.assertEqual(graph["image"]["inputs"]["image"], "uploaded.png")
        self.assertEqual(graph["text"]["inputs"]["text"], "new")
        self.assertEqual(resolved["width"], 1344)
        self.assertEqual(resolved["height"], 768)

    def test_image_tool_requires_load_image_binding(self) -> None:
        workflow = {"text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}}}
        with self.assertRaisesRegex(AIToolError, "LoadImage"):
            self.service.create(json.dumps(workflow).encode(), "Reference", ToolMode.IMAGE_TO_VIDEO, ToolAspectRatio.SQUARE)


if __name__ == "__main__":
    unittest.main()

