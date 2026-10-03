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
    def test_zero_literal_and_random_seed_are_supported(self) -> None:
        workflow = {
            "seed": {"class_type": "Seed", "inputs": {"seed": 123}},
            "sampling": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": ["seed", 0],
                    "cfg": 7,
                    "denoise": 1,
                    "positive": ["text", 0],
                },
            },
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "model": {"class_type": "UNETLoader", "inputs": {"unet_name": "locked.safetensors"}},
        }
        response = self.service.create(json.dumps(workflow).encode(), "Sampler", ToolMode.TEXT_TO_IMAGE, ToolAspectRatio.SQUARE)
        controls = {control.id: control for control in self.service.detail(response.tool_id).controls}
        seed_id = "nodes.seed.inputs.seed"
        cfg_id = "nodes.sampling.inputs.cfg"
        denoise_id = "nodes.sampling.inputs.denoise"
        self.assertIn(seed_id, controls)
        self.assertIn(cfg_id, controls)
        self.assertIn(denoise_id, controls)
        self.assertNotIn("nodes.sampling.inputs.positive", controls)
        self.assertNotIn("nodes.model.inputs.unet_name", controls)
        graph, _ = self.service.build_graph(
            response.tool_id,
            "",
            ToolAspectRatio.SQUARE,
            values={seed_id: -1, cfg_id: 0},
        )
        self.assertGreaterEqual(graph["seed"]["inputs"]["seed"], 0)
        self.assertEqual(graph["sampling"]["inputs"]["cfg"], 0)
        self.assertEqual(graph["sampling"]["inputs"]["denoise"], 1)

    def test_unrelated_literal_inputs_are_not_exposed(self) -> None:
        workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "sampler": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 1,
                    "steps": 20,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "positive": ["text", 0],
                },
            },
            "clean": {
                "class_type": "easy cleanGpuUsed",
                "inputs": {"anything": ["sampler", 0]},
            },
            "custom": {
                "class_type": "CustomNode",
                "inputs": {"enabled": True, "shift": 1.2, "mode": {"options": ["a", "b"]}},
            },
        }
        controls, _ = extract_controls(workflow)
        paths = {control["path"] for control in controls}
        self.assertIn("nodes.sampler.inputs.seed", paths)
        self.assertIn("nodes.sampler.inputs.steps", paths)
        self.assertNotIn("nodes.sampler.inputs.sampler_name", paths)
        self.assertNotIn("nodes.sampler.inputs.scheduler", paths)
        self.assertNotIn("nodes.clean.inputs.anything", paths)
        self.assertNotIn("nodes.custom.inputs.enabled", paths)
        self.assertNotIn("nodes.custom.inputs.shift", paths)
        self.assertNotIn("nodes.custom.inputs.mode", paths)
    def test_primitive_boolean_is_exposed(self) -> None:
        workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "sampler": {
                "class_type": "KSampler",
                "inputs": {"seed": 1, "positive": ["text", 0]},
            },
            "flag": {"class_type": "PrimitiveBoolean", "inputs": {"value": True}},
        }
        controls, _ = extract_controls(workflow)
        paths = {control["path"] for control in controls}
        self.assertIn("nodes.flag.inputs.value", paths)
    def test_primitive_string_multiline_is_exposed(self) -> None:
        workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "sampler": {
                "class_type": "KSampler",
                "inputs": {"seed": 1, "positive": ["text", 0]},
            },
            "copy": {
                "class_type": "PrimitiveStringMultiline",
                "inputs": {"value": "line one\nline two"},
            },
            "linked": {
                "class_type": "PrimitiveStringMultiline",
                "inputs": {"value": ["copy", 0]},
            },
        }
        response = self.service.create(json.dumps(workflow).encode(), "Multiline", ToolMode.TEXT_TO_IMAGE, ToolAspectRatio.SQUARE)
        controls = {control.id: control for control in self.service.detail(response.tool_id).controls}
        control_id = "nodes.copy.inputs.value"
        self.assertEqual(controls[control_id].kind, "text")
        self.assertEqual(controls[control_id].value, "line one\nline two")
        self.assertNotIn("nodes.linked.inputs.value", controls)
        updated = "first line\nsecond line"
        graph, _ = self.service.build_graph(
            response.tool_id,
            "",
            ToolAspectRatio.SQUARE,
            values={control_id: updated},
        )
        self.assertEqual(graph["copy"]["inputs"]["value"], updated)


if __name__ == "__main__":
    unittest.main()
