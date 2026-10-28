import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.schemas import ToolAspectRatio, ToolMode
from app.services.ai_tools import (
    ASPECT_DIMENSIONS,
    AIToolError,
    AIToolNotFound,
    AIToolService,
    _required_dimension_multiple,
    _snap_dimensions,
    extract_controls,
    set_ai_tool_service,
)


def _multi_stage_workflow() -> dict:
    """Stage-2 nodes that lexicographically sort before the real Stage-1 sources."""
    return {
        "0:stage2_seed": {"class_type": "RandomNoise", "inputs": {"noise_seed": 100000}},
        "0:stage2_steps": {
            "class_type": "BasicScheduler",
            "inputs": {"steps": 100, "model": ["0:model", 0]},
        },
        "0:stage2_cfg": {
            "class_type": "CFGGuider",
            "inputs": {"cfg": 2.5, "model": ["0:model", 0]},
        },
        "0:model": {"class_type": "UNETLoader", "inputs": {"unet_name": "x.safetensors"}},
        "0:stage2_vae": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["9:stage1_sampler", 0]},
        },
        "0:stage2_sampler": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["0:stage2_seed", 0],
                "guider": ["0:stage2_cfg", 0],
                "sigmas": ["0:stage2_steps", 0],
                "latent_image": ["0:stage2_vae", 0],
            },
        },
        "9:seed_source": {"class_type": "SeedNode", "inputs": {"seed": 1}},
        "9:stage1_noise": {
            "class_type": "RandomNoise",
            "inputs": {"noise_seed": ["9:seed_source", 0]},
        },
        "9:stage1_steps": {"class_type": "easy int", "inputs": {"value": 8}},
        "9:stage1_sched": {
            "class_type": "BasicScheduler",
            "inputs": {"steps": ["9:stage1_steps", 0], "model": ["0:model", 0]},
        },
        "9:stage1_cfg": {
            "class_type": "CFGGuider",
            "inputs": {"cfg": 1.0, "model": ["0:model", 0]},
        },
        "9:stage1_sampler": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["9:stage1_noise", 0],
                "guider": ["9:stage1_cfg", 0],
                "sigmas": ["9:stage1_sched", 0],
            },
        },
        "a:stage1_out": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["9:stage1_sampler", 0],
                "filename_prefix": "stage1",
            },
        },
        "z:stage2_out": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["0:stage2_sampler", 0],
                "filename_prefix": "stage2",
            },
        },
    }


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


class AspectDimensionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.service = AIToolService(Settings(TOOLS_DIR=self.temp.name))

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_all_aspect_presets_are_latent_grid_aligned(self) -> None:
        self.assertEqual(ASPECT_DIMENSIONS["21:9"], (1344, 576))
        self.assertEqual(1344 / 576, 21 / 9)
        for ratio, (width, height) in ASPECT_DIMENSIONS.items():
            with self.subTest(ratio=ratio):
                self.assertEqual(width % 32, 0)
                self.assertEqual(height % 32, 0)

    def test_snap_helpers_target_ltx_32_and_default_8(self) -> None:
        ltx = {"1": {"class_type": "EmptyLTXVLatentVideo", "inputs": {}}}
        plain = {"1": {"class_type": "EmptyLatentImage", "inputs": {}}}
        self.assertEqual(_required_dimension_multiple(ltx), 32)
        self.assertEqual(_required_dimension_multiple(plain), 8)
        self.assertEqual(_snap_dimensions(1536, 656, 32), (1536, 640))
        self.assertEqual(_snap_dimensions(65, 1000, 8), (64, 1000))
        # Non-numeric dimensions are passed through untouched.
        self.assertEqual(_snap_dimensions(["src", 0], 1000, 8), (["src", 0], 1000))

    def test_build_graph_snaps_resolved_dimensions_to_model_multiple(self) -> None:
        workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "latent": {
                "class_type": "EmptyLTXVLatentVideo",
                "inputs": {"width": 768, "height": 512},
            },
            "sampler": {
                "class_type": "KSampler",
                "inputs": {"seed": 1, "positive": ["text", 0]},
            },
        }
        created = self.service.create(
            json.dumps(workflow).encode(),
            "LTX Tool",
            ToolMode.TEXT_TO_VIDEO,
            ToolAspectRatio.ULTRAWIDE,
        )
        # 21:9 preset is already /32; an explicit off-grid override is snapped.
        graph, resolved = self.service.build_graph(
            created.tool_id, "", ToolAspectRatio.ULTRAWIDE
        )
        self.assertEqual(
            (graph["latent"]["inputs"]["width"], graph["latent"]["inputs"]["height"]),
            (1344, 576),
        )
        self.assertEqual((resolved["width"], resolved["height"]), (1344, 576))
        graph, resolved = self.service.build_graph(
            created.tool_id,
            "",
            ToolAspectRatio.SQUARE,
            values={"nodes.latent.inputs.width": 1000, "nodes.latent.inputs.height": 656},
        )
        self.assertEqual(
            (graph["latent"]["inputs"]["width"], graph["latent"]["inputs"]["height"]),
            (992, 640),
        )
        self.assertEqual((resolved["width"], resolved["height"]), (992, 640))

    def test_detail_exposes_aspect_dimensions_and_grid_multiple(self) -> None:
        """The client renders presets from the server table, so it must be served."""
        ltx = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "latent": {
                "class_type": "EmptyLTXVLatentVideo",
                "inputs": {"width": 768, "height": 512},
            },
            "sampler": {"class_type": "KSampler", "inputs": {"seed": 1}},
        }
        plain = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "latent": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 768, "height": 512},
            },
            "sampler": {"class_type": "KSampler", "inputs": {"seed": 1}},
        }
        for name, workflow, expected_multiple in (
            ("ltx", ltx, 32),
            ("plain", plain, 8),
        ):
            with self.subTest(workflow=name):
                created = self.service.create(
                    json.dumps(workflow).encode(),
                    f"{name} tool",
                    ToolMode.TEXT_TO_VIDEO,
                    ToolAspectRatio.SQUARE,
                )
                detail = self.service.detail(created.tool_id)
                self.assertEqual(detail.dimension_multiple, expected_multiple)
                # Every preset is served, and each matches ASPECT_DIMENSIONS.
                self.assertEqual(
                    detail.aspect_dimensions,
                    {
                        ratio: [width, height]
                        for ratio, (width, height) in ASPECT_DIMENSIONS.items()
                    },
                )
                for ratio, (width, height) in ASPECT_DIMENSIONS.items():
                    with self.subTest(ratio=ratio):
                        self.assertEqual(
                            detail.aspect_dimensions[ratio], [width, height]
                        )

    def test_custom_dimensions_round_trip_between_controls_and_graph(self) -> None:
        """A custom size sent through the width/height controls is what runs."""
        workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "latent": {
                "class_type": "EmptyLTXVLatentVideo",
                "inputs": {"width": 768, "height": 512},
            },
            "sampler": {"class_type": "KSampler", "inputs": {"seed": 1}},
        }
        created = self.service.create(
            json.dumps(workflow).encode(),
            "LTX Tool",
            ToolMode.TEXT_TO_VIDEO,
            ToolAspectRatio.SQUARE,
        )
        graph, resolved = self.service.build_graph(
            created.tool_id,
            "",
            ToolAspectRatio.SQUARE,
            values={"nodes.latent.inputs.width": 1280, "nodes.latent.inputs.height": 704},
        )
        # 1280 and 704 are already /32, so nothing is floored and the caller's
        # explicit size survives both the graph and the reported metadata.
        self.assertEqual(
            (graph["latent"]["inputs"]["width"], graph["latent"]["inputs"]["height"]),
            (1280, 704),
        )
        self.assertEqual((resolved["width"], resolved["height"]), (1280, 704))

    def test_text_only_tools_expose_size_when_any_node_owns_a_literal_size(self) -> None:
        """A T2I graph without an empty-latent node still has a settable size.

        Resize nodes (ImageResizeKJv2 and friends) carry literal width/height,
        so a text-to-image graph that sizes by resizing must offer the same
        aspect presets and Custom pill as one built on EmptyLatentImage.
        """
        workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "resize": {
                "class_type": "ImageResizeKJv2",
                "inputs": {"width": 1024, "height": 768, "image": ["text", 0]},
            },
            "save": {"class_type": "SaveImage", "inputs": {"images": ["resize", 0]}},
        }
        created = self.service.create(
            json.dumps(workflow).encode(),
            "Resize T2I",
            ToolMode.TEXT_TO_IMAGE,
            ToolAspectRatio.SQUARE,
        )
        detail = self.service.detail(created.tool_id)
        dims = {c.role: c.id for c in detail.controls if c.role in {"width", "height"}}
        self.assertEqual(
            dims,
            {
                "width": "nodes.resize.inputs.width",
                "height": "nodes.resize.inputs.height",
            },
        )
        # Preset and custom both land on the node the user can edit, and the
        # reported size is the size that runs.
        graph, resolved = self.service.build_graph(
            created.tool_id, "", ToolAspectRatio.LANDSCAPE
        )
        self.assertEqual(
            (graph["resize"]["inputs"]["width"], graph["resize"]["inputs"]["height"]),
            ASPECT_DIMENSIONS["16:9"],
        )
        graph, resolved = self.service.build_graph(
            created.tool_id,
            "",
            ToolAspectRatio.SQUARE,
            values={
                "nodes.resize.inputs.width": 1280,
                "nodes.resize.inputs.height": 704,
            },
        )
        self.assertEqual(
            (graph["resize"]["inputs"]["width"], graph["resize"]["inputs"]["height"]),
            (1280, 704),
        )
        self.assertEqual((resolved["width"], resolved["height"]), (1280, 704))

    def test_resize_zero_means_inherit_and_offers_no_size_control(self) -> None:
        """KJ resize at 0×0 inherits the source, so there is nothing to size."""
        workflow = {
            "image": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
            "resize": {
                "class_type": "ImageResizeKJv2",
                "inputs": {"width": 0, "height": 0, "image": ["image", 0]},
            },
            "save": {"class_type": "SaveImage", "inputs": {"images": ["resize", 0]}},
        }
        created = self.service.create(
            json.dumps(workflow).encode(),
            "Inherit Tool",
            ToolMode.IMAGE_TO_IMAGE,
            ToolAspectRatio.SQUARE,
        )
        detail = self.service.detail(created.tool_id)
        self.assertEqual(
            [c.id for c in detail.controls if c.role in {"width", "height"}], []
        )

    def test_empty_latent_wins_over_a_downstream_resize_node(self) -> None:
        """Only one width/height pair is offered, and it is the latent's."""
        workflow = {
            "text": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
            "latent": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 512, "height": 512},
            },
            "resize": {
                "class_type": "ImageResizeKJv2",
                "inputs": {"width": 1024, "height": 1024, "image": ["latent", 0]},
            },
            "sampler": {
                "class_type": "KSampler",
                "inputs": {"seed": 1, "latent_image": ["latent", 0]},
            },
        }
        created = self.service.create(
            json.dumps(workflow).encode(),
            "Both Tool",
            ToolMode.TEXT_TO_IMAGE,
            ToolAspectRatio.SQUARE,
        )
        detail = self.service.detail(created.tool_id)
        self.assertEqual(
            sorted(c.id for c in detail.controls if c.role in {"width", "height"}),
            ["nodes.latent.inputs.height", "nodes.latent.inputs.width"],
        )
        graph, _ = self.service.build_graph(
            created.tool_id, "", ToolAspectRatio.SQUARE
        )
        self.assertEqual(
            (graph["latent"]["inputs"]["width"], graph["latent"]["inputs"]["height"]),
            ASPECT_DIMENSIONS["1:1"],
        )
        # The resize node keeps its own literal, which is downstream of sizing.
        self.assertEqual(
            (graph["resize"]["inputs"]["width"], graph["resize"]["inputs"]["height"]),
            (1024, 1024),
        )


class OutputAwareBindingTests(unittest.TestCase):
    def test_seed_steps_and_cfg_bind_to_nodes_reachable_from_every_output(self) -> None:
        workflow = _multi_stage_workflow()
        self.assertEqual(
            AIToolService._find_seed_binding(workflow),
            {"node_id": "9:seed_source", "input_name": "seed"},
        )
        self.assertEqual(
            AIToolService._find_step_binding(workflow),
            {"node_id": "9:stage1_steps", "input_name": "value"},
        )
        self.assertEqual(
            AIToolService._find_cfg_binding(workflow),
            {"node_id": "9:stage1_cfg", "input_name": "cfg"},
        )

    def test_stage1_title_breaks_ties_between_equally_reachable_nodes(self) -> None:
        workflow = {
            "sampler_a": {"class_type": "KSampler", "inputs": {"seed": 1}},
            "sampler_b": {
                "class_type": "KSampler",
                "inputs": {"seed": 2, "latent_image": ["sampler_a", 0]},
                "_meta": {"title": "Stage 2 Refine Sampler"},
            },
            "out": {
                "class_type": "SaveImage",
                "inputs": {"images": ["sampler_b", 0], "filename_prefix": "x"},
            },
        }
        # Both are reachable from the only terminal; Stage 2 must lose.
        self.assertEqual(
            AIToolService._find_seed_binding(workflow),
            {"node_id": "sampler_a", "input_name": "seed"},
        )

    def test_cycle_safe_binding_without_output_nodes(self) -> None:
        cyclic = {
            "A": {"class_type": "KSampler", "inputs": {"positive": ["B", 0], "seed": 1}},
            "B": {"class_type": "CLIPTextEncode", "inputs": {"text": ["A", 0]}},
        }
        # Degenerate topology falls back to legacy first-match without hanging.
        self.assertEqual(
            AIToolService._find_seed_binding(cyclic),
            {"node_id": "A", "input_name": "seed"},
        )

    def test_cyclic_reachability_does_not_hang(self) -> None:
        cyclic = {
            "A": {"class_type": "SaveImage", "inputs": {"images": ["B", 0]}},
            "B": {"class_type": "KSampler", "inputs": {"latent_image": ["A", 0], "seed": 1}},
        }
        self.assertEqual(
            AIToolService._find_seed_binding(cyclic),
            {"node_id": "B", "input_name": "seed"},
        )



class ToolApiEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tools_temp = tempfile.TemporaryDirectory()
        self.test_tools_service = AIToolService(Settings(TOOLS_DIR=self.tools_temp.name))
        set_ai_tool_service(self.test_tools_service)

        from unittest.mock import AsyncMock, MagicMock
        from app.routers.auth import get_current_user
        from app.schemas import UserResponse
        from app.services.rbac_service import get_rbac_service

        self.mock_user = UserResponse(
            id="tool-test-creator-id",
            email="tool_creator@test.com",
            username="tool_creator",
            role="creator",
            created_at="2026-10-18T00:00:00Z",
        )
        self.mock_rbac = MagicMock()
        self.mock_rbac.has_permission = AsyncMock(return_value=True)
        app.dependency_overrides[get_current_user] = lambda: self.mock_user
        app.dependency_overrides[get_rbac_service] = lambda: self.mock_rbac

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

    def tearDown(self) -> None:
        set_ai_tool_service(None)
        self.tools_temp.cleanup()
        from app.routers.auth import get_current_user
        from app.services.rbac_service import get_rbac_service
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_rbac_service, None)

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

    def test_execute_tool_requires_authentication(self) -> None:
        from app.routers.auth import get_current_user
        app.dependency_overrides.pop(get_current_user, None)
        try:
            resp = self.client.post("/api/tools/execute", json={"tool_id": "tool123", "prompt": "a sunset"})
            self.assertEqual(resp.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.mock_user

    def test_run_tool_endpoint_requires_authentication(self) -> None:
        from app.routers.auth import get_current_user
        app.dependency_overrides.pop(get_current_user, None)
        try:
            resp = self.client.post("/api/tools/tool123/run", data={"prompt": "a sunset"})
            self.assertEqual(resp.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.mock_user

    @patch("app.main._run_tool")
    def test_execute_tool_authenticated_passes_user_id(self, mock_run_tool: MagicMock) -> None:
        from app.routers.auth import get_current_user
        from app.schemas import UserResponse, ToolExecutionResult
        mock_user = UserResponse(id="user-auth-123", email="user@test.com", username="testuser", created_at="2026-10-18T00:00:00Z")
        mock_run_tool.return_value = ToolExecutionResult(
            tool_id="a" * 32,
            prompt_id="prompt123",
            status="completed",
            images=[],
            error=None,
            elapsed_ms=100,
            tool_mode=ToolMode.TEXT_TO_IMAGE,
            aspect_ratio=ToolAspectRatio.SQUARE,
        )
        app.dependency_overrides[get_current_user] = lambda: mock_user
        try:
            resp = self.client.post(
                "/api/tools/execute",
                json={"tool_id": "a" * 32, "prompt": "a sunset", "aspect_ratio": "1:1"},
            )
            self.assertEqual(resp.status_code, 200)
            mock_run_tool.assert_called_once()
            _, kwargs = mock_run_tool.call_args
            self.assertEqual(kwargs.get("user_id"), "user-auth-123")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    @patch("app.main.get_db")
    @patch("app.main.storage")
    @patch("app.main.get_comfy_client")
    @patch("app.main.get_ai_tool_service")
    def test_run_tool_records_generation_with_user_attribution(
        self, mock_get_tools: MagicMock, mock_get_comfy: MagicMock, mock_storage: MagicMock, mock_get_db: MagicMock
    ) -> None:
        import asyncio
        from app.main import _run_tool
        from app.schemas import ToolDetail

        mock_tools = MagicMock()
        mock_tools.get.return_value = {"default_aspect_ratio": "1:1"}
        mock_detail = MagicMock(spec=ToolDetail)
        mock_detail.controls = []
        mock_detail.requires_image = False
        mock_detail.output_kind = "image"
        mock_detail.name = "Test Tool"
        mock_detail.mode = ToolMode.TEXT_TO_IMAGE
        mock_tools.detail.return_value = mock_detail
        mock_tools.build_graph.return_value = ({}, {"width": 512, "height": 512})
        mock_get_tools.return_value = mock_tools

        mock_comfy = MagicMock()
        mock_comfy.queue_prompt = AsyncMock(return_value="prompt-abc")
        mock_comfy.wait_until_done = AsyncMock(return_value="completed")
        mock_comfy.list_output_files = AsyncMock(return_value=[{"filename": "out.png"}])
        mock_comfy.fetch_image_bytes = AsyncMock(return_value=b"fake-png-bytes")
        mock_get_comfy.return_value = mock_comfy

        mock_storage.upload_asset = AsyncMock(return_value="http://localhost:8000/files/tools/tool123/prompt-abc/out.png")
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        result = asyncio.run(_run_tool(
            tool_id="tool123",
            prompt="cyberpunk car",
            aspect_ratio=ToolAspectRatio.SQUARE,
            input_image=None,
            user_id="user-456",
            save_to_gallery=True,
        ))

        self.assertEqual(result.status, "completed")
        mock_storage.upload_asset.assert_called_once()
        _, s_kwargs = mock_storage.upload_asset.call_args
        self.assertEqual(s_kwargs["metadata"]["user_id"], "user-456")
        self.assertEqual(s_kwargs["metadata"]["origin"], "ai_tool_studio")

        mock_db.insert_generation.assert_called_once()
        gen_payload = mock_db.insert_generation.call_args[0][0]
        self.assertEqual(gen_payload["user_id"], "user-456")
        self.assertEqual(gen_payload["origin"], "ai_tool_studio")
        self.assertEqual(gen_payload["prompt_id"], "prompt-abc")
        self.assertEqual(gen_payload["gallery_saved"], 1)

    def test_workflow_modality_autodetection(self) -> None:
        from app.services.ai_tools import detect_workflow_modality

        # 1. Text-to-Image graph
        meta_t2i = detect_workflow_modality(self.workflow)
        self.assertEqual(meta_t2i["detected_mode"], ToolMode.TEXT_TO_IMAGE)
        self.assertEqual(meta_t2i["detected_output_type"], "image")
        self.assertEqual(meta_t2i["archetype"], "Text-to-Image Generation")
        self.assertIn("Creative Prompt", meta_t2i["detected_inputs"])
        self.assertIn("Sampling Settings", meta_t2i["detected_inputs"])

        # 2. Image-to-Image graph (with LoadImage)
        img2img_workflow = dict(self.workflow)
        img2img_workflow["input_img"] = {
            "class_type": "LoadImage",
            "inputs": {"image": "starter.png"}
        }
        meta_i2i = detect_workflow_modality(img2img_workflow)
        self.assertEqual(meta_i2i["detected_mode"], ToolMode.IMAGE_TO_IMAGE)
        self.assertEqual(meta_i2i["detected_output_type"], "image")
        self.assertEqual(meta_i2i["archetype"], "Image-to-Image Transformation")
        self.assertIn("Starter Image", meta_i2i["detected_inputs"])

        # 3. Video graph
        video_workflow = dict(img2img_workflow)
        video_workflow["video_out"] = {
            "class_type": "VHS_VideoCombine",
            "inputs": {"images": ["sampler", 0]}
        }
        meta_vid = detect_workflow_modality(video_workflow)
        self.assertEqual(meta_vid["detected_mode"], ToolMode.IMAGE_TO_VIDEO)
        self.assertEqual(meta_vid["detected_output_type"], "video")
        self.assertEqual(meta_vid["archetype"], "Image-to-Video Motion")

        # 4. Verify parse endpoint returns these fields
        files = {"workflow_api": ("custom_pipeline.json", json.dumps(img2img_workflow).encode(), "application/json")}
        resp = self.client.post("/api/tools/parse", files=files, data={"name": "Auto Tool"})
        self.assertEqual(resp.status_code, 200)
        parsed = resp.json()
        self.assertEqual(parsed["detected_mode"], "image-to-image")
        self.assertEqual(parsed["detected_output_type"], "image")
        self.assertEqual(parsed["archetype"], "Image-to-Image Transformation")
        self.assertIn("Starter Image", parsed["detected_inputs"])
        self.assertGreater(parsed["node_count"], 0)
        self.assertIn("available_nodes", parsed)
        self.assertGreater(len(parsed["available_nodes"]), 0)

    def test_available_nodes_and_custom_controller(self) -> None:
        """Verify node parameter explorer returns all graph nodes and allows creating custom controllers."""
        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        resp = self.client.post("/api/tools/parse", files=files, data={"name": "Explorer Tool"})
        self.assertEqual(resp.status_code, 200)
        parsed = resp.json()
        self.assertIn("available_nodes", parsed)
        avail = parsed["available_nodes"]
        self.assertTrue(any(n["class_type"] == "KSampler" for n in avail))
        sampler_node = next(n for n in avail if n["class_type"] == "KSampler")
        inputs = {inp["name"]: inp for inp in sampler_node["inputs"]}
        self.assertIn("cfg", inputs)
        self.assertFalse(inputs["cfg"]["is_linked"])
        self.assertEqual(inputs["cfg"]["type_hint"], "number")

        # Now test creating tool with a custom controller from available nodes
        custom_ctrl = {
            "id": f"nodes.{sampler_node['id']}.inputs.cfg",
            "path": f"nodes.{sampler_node['id']}.inputs.cfg",
            "node_id": sampler_node["id"],
            "input_name": "cfg",
            "label": "Custom CFG Controller",
            "kind": "number",
            "value": 8.5,
            "default": 8.5,
            "numeric": True,
            "minimum": 1.0,
            "maximum": 20.0,
            "step": 0.5,
            "exposed": True,
        }
        create_files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        create_resp = self.client.post(
            "/api/tools/create",
            files=create_files,
            data={
                "name": "Custom Controller Tool",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
                "controls": json.dumps([custom_ctrl]),
            },
        )
        self.assertEqual(create_resp.status_code, 200)
        created = create_resp.json()
        self.assertEqual(len(created["controls"]), 1)
        self.assertEqual(created["controls"][0]["label"], "Custom CFG Controller")
        self.assertEqual(created["controls"][0]["value"], 8.5)


    def test_post_tools_rbac_guard_and_attribution(self) -> None:
        from app.routers.auth import get_current_user

        payload = {
            "workflow_api": self.workflow,
            "name": "RBAC Tested Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
        }

        # 1. Unauthenticated -> 401
        app.dependency_overrides.pop(get_current_user, None)
        try:
            resp = self.client.post("/api/tools", json=payload)
            self.assertEqual(resp.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.mock_user

        # 2. Authenticated but lacking tool:publish -> 403
        self.mock_rbac.has_permission = AsyncMock(return_value=False)
        resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("tool:publish", resp.json().get("detail", ""))

        # 3. Authenticated with tool:publish -> 200 with proper user attribution
        self.mock_rbac.has_permission = AsyncMock(
            side_effect=lambda uid, perm: perm == "tool:publish"
        )
        resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(resp.status_code, 200)
        tool_data = resp.json()
        self.assertEqual(tool_data["user_id"], self.mock_user.id)
        self.assertEqual(tool_data["author_username"], self.mock_user.username)

    def test_post_tools_create_multipart_rbac_guard_and_attribution(self) -> None:
        from app.routers.auth import get_current_user

        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        form_data = {
            "name": "Multipart RBAC Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
            "user_id": "spoofed-user-id",  # Attempt to spoof owner
        }

        # 1. Unauthenticated -> 401
        app.dependency_overrides.pop(get_current_user, None)
        try:
            resp = self.client.post("/api/tools/create", files=files, data=form_data)
            self.assertEqual(resp.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.mock_user

        # 2. Authenticated but lacking tool:publish -> 403
        self.mock_rbac.has_permission = AsyncMock(return_value=False)
        resp = self.client.post("/api/tools/create", files=files, data=form_data)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("tool:publish", resp.json().get("detail", ""))

        # 3. Authenticated with tool:publish -> 200 with user attribution ignoring spoofed user_id
        self.mock_rbac.has_permission = AsyncMock(
            side_effect=lambda uid, perm: perm == "tool:publish"
        )
        resp = self.client.post("/api/tools/create", files=files, data=form_data)
        self.assertEqual(resp.status_code, 200)
        tool_data = resp.json()
        self.assertEqual(tool_data["user_id"], self.mock_user.id)
        self.assertNotEqual(tool_data["user_id"], "spoofed-user-id")
        self.assertEqual(tool_data["author_username"], self.mock_user.username)

    def test_delete_tool_rbac_ownership_and_moderation(self) -> None:
        from app.routers.auth import get_current_user
        from app.schemas import UserResponse

        # Create tool owned by self.mock_user
        self.mock_rbac.has_permission = AsyncMock(return_value=True)
        payload = {
            "workflow_api": self.workflow,
            "name": "RBAC Deletion Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
        }
        create_resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(create_resp.status_code, 200)
        tool_id = create_resp.json()["tool_id"]

        stranger_user = UserResponse(
            id="stranger-user-id",
            email="stranger@test.com",
            username="stranger",
            role="creator",
            created_at="2026-10-18T00:00:00Z",
        )
        moderator_user = UserResponse(
            id="moderator-user-id",
            email="moderator@test.com",
            username="moderator",
            role="moderator",
            created_at="2026-10-18T00:00:00Z",
        )

        # 1. Unauthenticated -> 401
        app.dependency_overrides.pop(get_current_user, None)
        try:
            resp = self.client.delete(f"/api/tools/{tool_id}")
            self.assertEqual(resp.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.mock_user

        # 2. Stranger without tool:delete_any -> 403 Forbidden
        app.dependency_overrides[get_current_user] = lambda: stranger_user
        self.mock_rbac.has_permission = AsyncMock(return_value=False)
        resp = self.client.delete(f"/api/tools/{tool_id}")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Requires ownership or 'tool:delete_any'", resp.json().get("detail", ""))

        # 3. Moderator with tool:delete_any -> 200 OK (Moderator override)
        app.dependency_overrides[get_current_user] = lambda: moderator_user
        self.mock_rbac.has_permission = AsyncMock(
            side_effect=lambda uid, perm: perm == "tool:delete_any"
        )
        resp = self.client.delete(f"/api/tools/{tool_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["deleted"])

        # 4. Re-create and test owner deletion
        app.dependency_overrides[get_current_user] = lambda: self.mock_user
        self.mock_rbac.has_permission = AsyncMock(return_value=True)
        create_resp2 = self.client.post("/api/tools", json=payload)
        self.assertEqual(create_resp2.status_code, 200)
        tool_id2 = create_resp2.json()["tool_id"]

        # Owner deletes own tool -> 200 OK
        resp = self.client.delete(f"/api/tools/{tool_id2}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["deleted"])

    def test_put_tool_updates_graph_and_control_default(self) -> None:
        payload = {
            "workflow_api": self.workflow,
            "name": "Editable Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
        }
        create_resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(create_resp.status_code, 200)
        tool_id = create_resp.json()["tool_id"]

        edited = copy.deepcopy(self.workflow)
        edited["sampler"]["inputs"]["steps"] = 40
        controls = [
            {
                "id": "nodes.sampler.inputs.steps",
                "path": "nodes.sampler.inputs.steps",
                "label": "Steps",
                "kind": "number",
                "value": 40,
                "default": 40,
                "numeric": True,
                "node_id": "sampler",
                "input_name": "steps",
                "role": "steps",
            }
        ]
        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(edited).encode(),
                "application/json",
            )
        }
        resp = self.client.put(
            f"/api/tools/{tool_id}",
            files=files,
            data={
                "name": "Editable Tool",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
                "controls": json.dumps(controls),
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["controls"][0]["default"], 40)

        graph, _ = self.test_tools_service.build_graph(
            tool_id, "", ToolAspectRatio.SQUARE
        )
        self.assertEqual(graph["sampler"]["inputs"]["steps"], 40)

    def test_put_tool_preserves_identity_and_sets_updated_at(self) -> None:
        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "Identity Tool",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]
        before = self.test_tools_service.get(tool_id)

        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        resp = self.client.put(
            f"/api/tools/{tool_id}",
            files=files,
            data={"name": "Renamed Tool", "aspect_ratio": "16:9"},
        )
        self.assertEqual(resp.status_code, 200)
        after = self.test_tools_service.get(tool_id)
        self.assertEqual(after["created_at"], before["created_at"])
        self.assertEqual(after["user_id"], before["user_id"])
        self.assertEqual(after["author_username"], before["author_username"])
        self.assertIn("updated_at", after)
        self.assertEqual(after["name"], "Renamed Tool")
        self.assertEqual(after["default_aspect_ratio"], "16:9")
        self.assertFalse(after["is_draft"])

    def test_put_tool_rejects_changed_node_set(self) -> None:
        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "Fixed Nodes",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]
        edited = copy.deepcopy(self.workflow)
        edited["extra"] = {"class_type": "SaveImage", "inputs": {"images": ["sampler", 0]}}
        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(edited).encode(),
                "application/json",
            )
        }
        resp = self.client.put(
            f"/api/tools/{tool_id}", files=files, data={"name": "Nope"}
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Node set cannot change", resp.json()["detail"])

    def test_put_tool_rejects_control_on_linked_input(self) -> None:
        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "Linked Target",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]
        controls = [
            {
                "id": "nodes.sampler.inputs.positive",
                "path": "nodes.sampler.inputs.positive",
                "label": "Linked",
                "kind": "number",
                "value": 1,
                "node_id": "sampler",
                "input_name": "positive",
            }
        ]
        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        resp = self.client.put(
            f"/api/tools/{tool_id}",
            files=files,
            data={"name": "Linked Target", "controls": json.dumps(controls)},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("literal input", resp.json()["detail"])

    def test_put_tool_rejects_duplicate_control_ids(self) -> None:
        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "Dupes",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]
        dup_control = {
            "id": "same-id",
            "path": "nodes.sampler.inputs.steps",
            "label": "Steps",
            "kind": "number",
            "value": 20,
            "node_id": "sampler",
            "input_name": "steps",
        }
        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        resp = self.client.put(
            f"/api/tools/{tool_id}",
            files=files,
            data={"name": "Dupes", "controls": json.dumps([dup_control, dup_control])},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Duplicate control id", resp.json()["detail"])

    def test_put_tool_rbac_ownership_and_moderation(self) -> None:
        from app.routers.auth import get_current_user
        from app.schemas import UserResponse

        self.mock_rbac.has_permission = AsyncMock(return_value=True)
        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "RBAC Update Tool",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]
        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        stranger = UserResponse(
            id="stranger-user-id",
            email="stranger@test.com",
            username="stranger",
            role="creator",
            created_at="2026-10-18T00:00:00Z",
        )
        moderator = UserResponse(
            id="moderator-user-id",
            email="moderator@test.com",
            username="moderator",
            role="moderator",
            created_at="2026-10-18T00:00:00Z",
        )

        app.dependency_overrides.pop(get_current_user, None)
        try:
            resp = self.client.put(
                f"/api/tools/{tool_id}", files=files, data={"name": "Anon"}
            )
            self.assertEqual(resp.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.mock_user

        app.dependency_overrides[get_current_user] = lambda: stranger
        self.mock_rbac.has_permission = AsyncMock(return_value=False)
        resp = self.client.put(
            f"/api/tools/{tool_id}", files=files, data={"name": "Stranger"}
        )
        self.assertEqual(resp.status_code, 403)

        app.dependency_overrides[get_current_user] = lambda: moderator
        self.mock_rbac.has_permission = AsyncMock(
            side_effect=lambda uid, perm: perm == "tool:delete_any"
        )
        resp = self.client.put(
            f"/api/tools/{tool_id}", files=files, data={"name": "Moderated"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Moderated")

    def test_put_tool_thumbnail_replaced_only_when_supplied(self) -> None:
        from app.schemas import ToolControl

        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "Thumbnail Tool",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]
        record = self.test_tools_service.get(tool_id)
        record["thumbnail"] = self.test_tools_service._save_thumbnail(
            tool_id, b"old-thumb", ".png"
        )
        self.test_tools_service._write_record(record)

        files = {
            "workflow_api": (
                "workflow_api.json",
                json.dumps(self.workflow).encode(),
                "application/json",
            )
        }
        resp = self.client.put(
            f"/api/tools/{tool_id}", files=files, data={"name": "Thumbnail Tool"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            self.test_tools_service.thumbnail_path(tool_id).read_bytes(), b"old-thumb"
        )

        files["thumbnail"] = ("thumb.png", b"new-thumb", "image/png")
        resp = self.client.put(
            f"/api/tools/{tool_id}", files=files, data={"name": "Thumbnail Tool"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            self.test_tools_service.thumbnail_path(tool_id).read_bytes(), b"new-thumb"
        )

    def test_get_tool_for_edit_returns_workflow_api_for_owner_only(self) -> None:
        from app.routers.auth import get_current_user
        from app.schemas import UserResponse

        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "Editor Tool",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]

        resp = self.client.get(f"/api/tools/{tool_id}/edit")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["workflow_api"], self.workflow)
        self.assertIn("controls", data)
        self.assertNotIn("locked_nodes", data)
        self.assertNotIn("available_nodes", data)
        self.assertNotIn("essential_summary", data)

        stranger = UserResponse(
            id="stranger-user-id",
            email="stranger@test.com",
            username="stranger",
            role="creator",
            created_at="2026-10-18T00:00:00Z",
        )
        app.dependency_overrides[get_current_user] = lambda: stranger
        self.mock_rbac.has_permission = AsyncMock(return_value=False)
        resp = self.client.get(f"/api/tools/{tool_id}/edit")
        self.assertEqual(resp.status_code, 403)

        app.dependency_overrides.pop(get_current_user, None)
        try:
            resp = self.client.get(f"/api/tools/{tool_id}/edit")
            self.assertEqual(resp.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.mock_user

    def test_public_tool_detail_never_exposes_workflow_api(self) -> None:
        create_resp = self.client.post(
            "/api/tools",
            json={
                "workflow_api": self.workflow,
                "name": "Public Tool",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
        )
        tool_id = create_resp.json()["tool_id"]
        resp = self.client.get(f"/api/tools/{tool_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("workflow_api", resp.json())

    def test_edit_and_update_routes_reject_traversal_tool_ids(self) -> None:
        for bad_id in ("..%2f..%2fetc%2fpasswd", "%2e%2e%2fetc"):
            with self.subTest(tool_id=bad_id):
                resp = self.client.get(f"/api/tools/{bad_id}/edit")
                self.assertEqual(resp.status_code, 404)
                files = {
                    "workflow_api": (
                        "workflow_api.json",
                        json.dumps(self.workflow).encode(),
                        "application/json",
                    )
                }
                resp = self.client.put(
                    f"/api/tools/{bad_id}", files=files, data={"name": "x"}
                )
                self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()




