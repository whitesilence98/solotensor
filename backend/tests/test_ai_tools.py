import copy
import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.schemas import ToolAspectRatio, ToolMode
from app.services.ai_tools import (
    AIToolError,
    AIToolNotFound,
    AIToolService,
    extract_controls,
)


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
        self.assertIn("nodes.sampler.inputs.sampler_name", paths)
        self.assertIn("nodes.sampler.inputs.scheduler", paths)
        self.assertNotIn("nodes.clean.inputs.anything", paths)
        self.assertNotIn("nodes.custom.inputs.enabled", paths)
        self.assertNotIn("nodes.custom.inputs.shift", paths)
        self.assertNotIn("nodes.custom.inputs.mode", paths)
        sampler_ctrl = next(c for c in controls if c["path"] == "nodes.sampler.inputs.sampler_name")
        self.assertEqual(sampler_ctrl["kind"], "select")
        self.assertIn("euler", sampler_ctrl["options"])
        self.assertIn("dpmpp_2m", sampler_ctrl["options"])

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

    def test_multi_image_disambiguation_with_downstream_graph(self) -> None:
        workflow = {
            "source_img": {"class_type": "LoadImage", "inputs": {"image": "src.png"}},
            "pose_img": {"class_type": "LoadImage", "inputs": {"image": "pose.png"}},
            "custom_img": {
                "class_type": "LoadImage",
                "inputs": {"image": "face.png"},
                "_meta": {"title": "Actor Face"},
            },
            "vae": {"class_type": "VAEEncode", "inputs": {"pixels": ["source_img", 0]}},
            "cnet_loader": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": "openpose.safetensors"}},
            "cnet_apply": {
                "class_type": "ApplyControlNet",
                "inputs": {
                    "image": ["pose_img", 0],
                    "control_net": ["cnet_loader", 0],
                    "strength": 0.8,
                },
            },
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "masterpiece"}},
            "sampler": {
                "class_type": "KSampler",
                "inputs": {"positive": ["cnet_apply", 0], "latent_image": ["vae", 0]},
            },
        }
        controls, locked = extract_controls(workflow)
        by_node = {c["node_id"]: c for c in controls if c["kind"] == "image"}
        self.assertEqual(by_node["source_img"]["label"], "Input Image (Img2Img)")
        self.assertEqual(by_node["source_img"]["role"], "img2img")
        self.assertEqual(by_node["pose_img"]["label"], "ControlNet Reference Image")
        self.assertEqual(by_node["pose_img"]["role"], "controlnet")
        self.assertEqual(by_node["custom_img"]["label"], "Actor Face")
        self.assertIn("cnet_loader", [l["id"] for l in locked])

    def test_multi_image_ordinal_fallback_when_ambiguous(self) -> None:
        workflow = {
            "img_a": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
            "img_b": {"class_type": "LoadImage", "inputs": {"image": "b.png"}},
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
        }
        controls, _ = extract_controls(workflow)
        labels = [c["label"] for c in controls if c["kind"] == "image"]
        self.assertIn("Input Image 1 (Source)", labels)
        self.assertIn("Input Image 2 (Input)", labels)

    def test_selective_controlnet_and_ipadapter_unlocking(self) -> None:
        workflow = {
            "cnet_loader": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": "canny.pth"}},
            "cnet_apply": {
                "class_type": "ApplyControlNet",
                "inputs": {
                    "control_net": ["cnet_loader", 0],
                    "strength": 0.75,
                    "start_percent": 0.1,
                    "end_percent": 0.9,
                },
            },
            "ipa_loader": {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": "ip-adapter.bin"}},
            "ipa_apply": {
                "class_type": "IPAdapterApply",
                "inputs": {
                    "ipadapter": ["ipa_loader", 0],
                    "weight": 1.2,
                    "noise": 0.3,
                },
            },
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "art"}},
        }
        controls, locked = extract_controls(workflow)
        locked_ids = {l["id"] for l in locked}
        self.assertIn("cnet_loader", locked_ids)
        self.assertIn("ipa_loader", locked_ids)
        self.assertNotIn("cnet_apply", locked_ids)
        self.assertNotIn("ipa_apply", locked_ids)

        c_map = {c["path"]: c for c in controls}
        self.assertIn("nodes.cnet_apply.inputs.strength", c_map)
        self.assertEqual(c_map["nodes.cnet_apply.inputs.strength"]["minimum"], 0.0)
        self.assertEqual(c_map["nodes.cnet_apply.inputs.strength"]["maximum"], 2.0)
        self.assertEqual(c_map["nodes.cnet_apply.inputs.strength"]["step"], 0.05)

        self.assertIn("nodes.cnet_apply.inputs.start_percent", c_map)
        self.assertEqual(c_map["nodes.cnet_apply.inputs.start_percent"]["maximum"], 1.0)

        self.assertIn("nodes.ipa_apply.inputs.weight", c_map)
        self.assertEqual(c_map["nodes.ipa_apply.inputs.weight"]["value"], 1.2)
        self.assertEqual(c_map["nodes.ipa_apply.inputs.weight"]["maximum"], 2.0)

        self.assertIn("nodes.ipa_apply.inputs.noise", c_map)
        self.assertEqual(c_map["nodes.ipa_apply.inputs.noise"]["maximum"], 1.0)

    def test_dropdown_and_upscale_select_controls(self) -> None:
        workflow = {
            "sampler": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 42,
                    "sampler_name": "euler",
                    "scheduler": "karras",
                    "positive": ["text", 0],
                },
            },
            "upscale": {
                "class_type": "ImageScaleBy",
                "inputs": {
                    "upscale_method": "bicubic",
                    "scale_by": 2.0,
                },
            },
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "photo"}},
        }
        resp = self.service.create(json.dumps(workflow).encode(), "Upscaler", ToolMode.TEXT_TO_IMAGE, ToolAspectRatio.SQUARE)
        detail = self.service.detail(resp.tool_id)
        c_map = {c.id: c for c in detail.controls}

        sampler_ctrl = c_map["nodes.sampler.inputs.sampler_name"]
        self.assertEqual(sampler_ctrl.kind, "select")
        self.assertIn("euler", sampler_ctrl.options)
        self.assertIn("dpmpp_2m", sampler_ctrl.options)

        scheduler_ctrl = c_map["nodes.sampler.inputs.scheduler"]
        self.assertEqual(scheduler_ctrl.kind, "select")
        self.assertIn("karras", scheduler_ctrl.options)

        upscale_ctrl = c_map["nodes.upscale.inputs.upscale_method"]
        self.assertEqual(upscale_ctrl.kind, "select")
        self.assertIn("bicubic", upscale_ctrl.options)
        self.assertIn("lanczos", upscale_ctrl.options)

        # Build graph with valid selection
        graph, _ = self.service.build_graph(
            resp.tool_id,
            "",
            ToolAspectRatio.SQUARE,
            values={"nodes.sampler.inputs.sampler_name": "dpmpp_2m", "nodes.upscale.inputs.upscale_method": "lanczos"},
        )
        self.assertEqual(graph["sampler"]["inputs"]["sampler_name"], "dpmpp_2m")
        self.assertEqual(graph["upscale"]["inputs"]["upscale_method"], "lanczos")

        # Rejects invalid options
        with self.assertRaises(AIToolError):
            self.service.build_graph(
                resp.tool_id,
                "",
                ToolAspectRatio.SQUARE,
                values={"nodes.sampler.inputs.sampler_name": "not_a_real_sampler"},
            )

    def test_sdxl_and_universal_text_node_detection(self) -> None:
        workflow = {
            "sdxl_prompt": {
                "class_type": "CLIPTextEncodeSDXL",
                "inputs": {
                    "text_g": "cinematic hero",
                    "text_l": "sharp focus 8k",
                },
                "_meta": {"title": "Main Prompt"},
            },
            "sdxl_negative": {
                "class_type": "CLIPTextEncodeSDXL",
                "inputs": {
                    "text_g": "blurry low quality",
                    "text_l": "bad anatomy",
                },
                "_meta": {"title": "Negative Prompt"},
            },
            "wildcard": {
                "class_type": "WildcardPrompt",
                "inputs": {"prompt": "{red|blue} coat"},
            },
        }
        controls, _ = extract_controls(workflow)
        c_map = {c["path"]: c for c in controls}

        self.assertIn("nodes.sdxl_prompt.inputs.text_g", c_map)
        self.assertEqual(c_map["nodes.sdxl_prompt.inputs.text_g"]["kind"], "prompt")
        self.assertEqual(c_map["nodes.sdxl_prompt.inputs.text_g"]["role"], "prompt")
        self.assertIn("(CLIP G)", c_map["nodes.sdxl_prompt.inputs.text_g"]["label"])

        self.assertIn("nodes.sdxl_prompt.inputs.text_l", c_map)
        self.assertIn("(CLIP L)", c_map["nodes.sdxl_prompt.inputs.text_l"]["label"])

        self.assertIn("nodes.sdxl_negative.inputs.text_g", c_map)
        self.assertEqual(c_map["nodes.sdxl_negative.inputs.text_g"]["role"], "negative_prompt")

        self.assertIn("nodes.wildcard.inputs.prompt", c_map)
        self.assertEqual(c_map["nodes.wildcard.inputs.prompt"]["kind"], "prompt")

    def test_video_parameter_extraction(self) -> None:
        workflow = {
            "svd": {
                "class_type": "SVD_img2vid_Conditioning",
                "inputs": {
                    "fps": 16,
                    "video_frames": 25,
                    "motion_bucket_id": 127,
                },
            },
            "vhs": {
                "class_type": "VHS_VideoCombine",
                "inputs": {
                    "frame_rate": 24,
                },
            },
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "video prompt"}},
        }
        controls, _ = extract_controls(workflow)
        c_map = {c["path"]: c for c in controls}

        fps_ctrl = c_map["nodes.svd.inputs.fps"]
        self.assertEqual(fps_ctrl["kind"], "number")
        self.assertEqual(fps_ctrl["minimum"], 8)
        self.assertEqual(fps_ctrl["maximum"], 60)
        self.assertEqual(fps_ctrl["role"], "fps")

        frames_ctrl = c_map["nodes.svd.inputs.video_frames"]
        self.assertEqual(frames_ctrl["kind"], "number")
        self.assertEqual(frames_ctrl["minimum"], 8)
        self.assertEqual(frames_ctrl["maximum"], 120)
        self.assertEqual(frames_ctrl["role"], "frame_count")

        motion_ctrl = c_map["nodes.svd.inputs.motion_bucket_id"]
        self.assertEqual(motion_ctrl["minimum"], 1)
        self.assertEqual(motion_ctrl["maximum"], 255)
        self.assertEqual(motion_ctrl["role"], "motion_bucket")

    def test_two_stage_import_with_custom_controls(self) -> None:
        workflow = {
            "prompt": {"class_type": "CLIPTextEncode", "inputs": {"text": "default prompt"}},
            "sampler": {
                "class_type": "KSampler",
                "inputs": {"seed": 100, "steps": 20, "cfg": 7.5, "positive": ["prompt", 0]},
            },
        }
        # Stage 1: Parse candidate controls
        parse_resp = self.service.parse(json.dumps(workflow).encode(), "Parsed Tool")
        self.assertGreaterEqual(len(parse_resp.controls), 3)
        for ctrl in parse_resp.controls:
            self.assertTrue(hasattr(ctrl, "recommended"))
            self.assertTrue(hasattr(ctrl, "role"))

        # Stage 2: Create with customized controls (rename label, adjust step bounds, omit cfg)
        custom = [
            {
                "id": "nodes.prompt.inputs.text",
                "path": "nodes.prompt.inputs.text",
                "label": "My Custom Creative Prompt",
                "kind": "prompt",
                "value": "customized starting prompt",
                "node_id": "prompt",
                "input_name": "text",
                "role": "prompt",
            },
            {
                "id": "nodes.sampler.inputs.steps",
                "path": "nodes.sampler.inputs.steps",
                "label": "Denoise Iterations",
                "kind": "number",
                "value": 15,
                "numeric": True,
                "minimum": 5,
                "maximum": 50,
                "step": 1,
                "node_id": "sampler",
                "input_name": "steps",
                "role": "steps",
            },
        ]
        created = self.service.create(
            json.dumps(workflow).encode(),
            "Custom Tool",
            ToolMode.TEXT_TO_IMAGE,
            ToolAspectRatio.SQUARE,
            custom_controls=custom,
        )
        detail = self.service.detail(created.tool_id)
        saved_ids = {c.id for c in detail.controls}
        self.assertEqual(saved_ids, {"nodes.prompt.inputs.text", "nodes.sampler.inputs.steps"})
        self.assertNotIn("nodes.sampler.inputs.cfg", saved_ids)

        steps_ctrl = next(c for c in detail.controls if c.id == "nodes.sampler.inputs.steps")
        self.assertEqual(steps_ctrl.label, "Denoise Iterations")
        self.assertEqual(steps_ctrl.minimum, 5)
        self.assertEqual(steps_ctrl.maximum, 50)

        # Build graph respects the custom minimum
        with self.assertRaises(AIToolError):
            self.service.build_graph(
                created.tool_id,
                "",
                ToolAspectRatio.SQUARE,
                values={"nodes.sampler.inputs.steps": 2},  # Below custom minimum of 5
            )

        graph, _ = self.service.build_graph(
            created.tool_id,
            "overridden prompt",
            ToolAspectRatio.SQUARE,
            values={"nodes.sampler.inputs.steps": 30},
        )
        self.assertEqual(graph["prompt"]["inputs"]["text"], "overridden prompt")
        self.assertEqual(graph["sampler"]["inputs"]["steps"], 30)

    def test_delete_tool_cleans_up_files_and_directories(self) -> None:
        created = self.service.create(
            json.dumps(self.workflow).encode(),
            "Deletable Tool",
            ToolMode.TEXT_TO_IMAGE,
            ToolAspectRatio.SQUARE,
        )
        tool_id = created.tool_id
        thumb_dir = self.service.root / "thumbnails" / tool_id
        thumb_dir.mkdir(parents=True, exist_ok=True)
        (thumb_dir / "preview.png").write_bytes(b"thumb")

        output_dir = self.service.outputs / tool_id
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "gen.png").write_bytes(b"output")

        self.assertTrue((self.service.definitions / f"{tool_id}.json").exists())
        self.assertTrue(thumb_dir.exists())
        self.assertTrue(output_dir.exists())

        result = self.service.delete(tool_id)
        self.assertTrue(result)

        self.assertFalse((self.service.definitions / f"{tool_id}.json").exists())
        self.assertFalse(thumb_dir.exists())
        self.assertFalse(output_dir.exists())

        with self.assertRaises(AIToolNotFound):
            self.service.delete(tool_id)

    def test_delete_tool_rejects_path_traversal(self) -> None:
        with self.assertRaises(AIToolNotFound):
            self.service.delete("../../../etc/passwd")



class ToolApiEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.workflow = {
            "prompt": {"class_type": "CLIPTextEncode", "inputs": {"text": "cyberpunk city"}},
            "sampler": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 42,
                    "steps": 25,
                    "cfg": 7.0,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "positive": ["prompt", 0],
                },
            },
        }

    def test_post_tools_parse_returns_candidate_controls(self) -> None:
        files = {"workflow_api": ("workflow_api.json", json.dumps(self.workflow).encode(), "application/json")}
        resp = self.client.post("/api/tools/parse", files=files, data={"name": "Cyber City"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("controls", data)
        self.assertIn("locked_nodes", data)
        for ctrl in data["controls"]:
            self.assertIn("recommended", ctrl)
            self.assertIn("role", ctrl)
            self.assertIn("default", ctrl)

    def test_post_tools_json_creates_with_custom_controls(self) -> None:
        custom_controls = [
            {
                "id": "nodes.prompt.inputs.text",
                "path": "nodes.prompt.inputs.text",
                "label": "Custom Prompt",
                "kind": "prompt",
                "value": "initial prompt",
                "node_id": "prompt",
                "input_name": "text",
                "role": "prompt",
            }
        ]
        payload = {
            "workflow_api": self.workflow,
            "name": "Customized Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
            "controls": custom_controls,
        }
        resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["name"], "Customized Tool")
        self.assertEqual(len(data["controls"]), 1)
        self.assertEqual(data["controls"][0]["label"], "Custom Prompt")

    def test_post_tools_create_multipart_with_custom_controls(self) -> None:
        custom_controls = [
            {
                "id": "nodes.prompt.inputs.text",
                "path": "nodes.prompt.inputs.text",
                "label": "Multipart Custom Prompt",
                "kind": "prompt",
                "value": "initial prompt",
                "node_id": "prompt",
                "input_name": "text",
                "role": "prompt",
            }
        ]
        files = {"workflow_api": ("workflow_api.json", json.dumps(self.workflow).encode(), "application/json")}
        data = {
            "name": "Multipart Custom Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
            "controls": json.dumps(custom_controls),
        }
        resp = self.client.post("/api/tools/create", files=files, data=data)
        self.assertEqual(resp.status_code, 200)
        resp_data = resp.json()
        self.assertEqual(resp_data["name"], "Multipart Custom Tool")
        self.assertEqual(len(resp_data["controls"]), 1)
        self.assertEqual(resp_data["controls"][0]["label"], "Multipart Custom Prompt")

    def test_post_tools_json_fallback_auto_extracts_when_controls_omitted(self) -> None:
        payload = {
            "workflow_api": self.workflow,
            "name": "Default Extracted Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
        }
        resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["name"], "Default Extracted Tool")
        self.assertGreaterEqual(len(data["controls"]), 3)

    def test_delete_tool_endpoint_lifecycle(self) -> None:
        payload = {
            "workflow_api": self.workflow,
            "name": "To Be Deleted",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
        }
        create_resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(create_resp.status_code, 200)
        tool_id = create_resp.json()["tool_id"]

        get_resp = self.client.get(f"/api/tools/{tool_id}")
        self.assertEqual(get_resp.status_code, 200)

        del_resp = self.client.delete(f"/api/tools/{tool_id}")
        self.assertEqual(del_resp.status_code, 200)
        del_data = del_resp.json()
        self.assertTrue(del_data["deleted"])
        self.assertEqual(del_data["tool_id"], tool_id)

        del_resp_again = self.client.delete(f"/api/tools/{tool_id}")
        self.assertEqual(del_resp_again.status_code, 404)

        get_resp_after = self.client.get(f"/api/tools/{tool_id}")
        self.assertEqual(get_resp_after.status_code, 404)

    def test_delete_tool_endpoint_rejects_invalid_id(self) -> None:
        resp = self.client.delete("/api/tools/invalid-id-not-hex")
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()


