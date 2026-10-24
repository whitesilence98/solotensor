"""Unit tests for the modular workflow router and patchers."""
import json
import unittest
from pathlib import Path

from app.schemas import (
    DetailerConfig,
    DetailerItemConfig,
    GenerateRequest,
    UpscaleConfig,
)
from app.services.workflow_router import (
    build_enabled_features,
    load_workflow,
    patch_base_t2i_workflow,
    patch_detailer_workflow,
    patch_seedvr_upscaler_workflow,
    select_workflow,
)

WORKFLOW_DIR = Path(__file__).resolve().parents[1] / "workflows"


class TestWorkflowRouter(unittest.TestCase):

    def _make_req(self, upscale=False, detailer=False, enable_detailer=False, items=None):
        return GenerateRequest(
            model_id="a" * 32,
            version_id="b" * 32,
            file_id="c" * 32,
            prompt="test",
            upscale=UpscaleConfig(enabled=upscale),
            detailer=DetailerConfig(
                enabled=detailer,
                items=[DetailerItemConfig(type=t, enabled=True) for t in (items or [])],
            ),
            enable_detailer=enable_detailer,
        )

    def test_no_upscale_no_detailer_uses_base(self):
        req = self._make_req()
        graph = select_workflow(req)
        self.assertIsInstance(graph, dict)
        self.assertIn("1084", graph)

    def test_upscale_enabled_uses_t2i(self):
        req = self._make_req(upscale=True)
        features = build_enabled_features(req)
        self.assertIn("upscale_seedvr2", features)

    def test_detailer_items_build_features(self):
        req = self._make_req(detailer=True, items=["face", "hand"])
        features = build_enabled_features(req)
        self.assertIn("detailer_face", features)
        self.assertIn("detailer_hand", features)
        self.assertNotIn("detailer_foot", features)

    def test_no_items_enables_all(self):
        req = self._make_req(detailer=True)
        features = build_enabled_features(req)
        for name in (
            "detailer_face",
            "detailer_foot",
            "detailer_breast",
            "detailer_hand",
            "detailer_vagina",
        ):
            self.assertIn(name, features)

    def test_backward_compat_enable_detailer_bool(self):
        req = self._make_req(enable_detailer=True)
        features = build_enabled_features(req)
        self.assertIn("detailer_face", features)

    def test_patch_base_t2i_workflow(self):
        raw = load_workflow("workflow_generate_t2i.json")
        patched = patch_base_t2i_workflow(
            raw,
            prompt="cyberpunk city",
            negative_prompt="blurry",
            seed=42,
            steps=15,
            image_count=2,
            width=1024,
            height=1024,
            unet_name="custom_unet.safetensors",
        )
        self.assertEqual(patched["1051"]["inputs"]["prompt"], "cyberpunk city")
        self.assertEqual(patched["1050"]["inputs"]["text"], "blurry")
        self.assertEqual(patched["1052"]["inputs"]["seed"], 42)
        self.assertEqual(patched["1055"]["inputs"]["value"], 15)
        self.assertEqual(patched["1054"]["inputs"]["width"], 1024)
        self.assertEqual(patched["1054"]["inputs"]["batch_size"], 2)
        self.assertEqual(patched["1060:615"]["inputs"]["unet_name"], "custom_unet.safetensors")

    def test_patch_seedvr_upscaler_workflow(self):
        raw = load_workflow("workflow_seedvr_upscaler.json")
        upscale_cfg = UpscaleConfig(
            enabled=True,
            scale=2.0,
            dit_model="seedvr2_ema_7b_fp8_e4m3fn.safetensors",
            color_correction="lab",
        )
        patched = patch_seedvr_upscaler_workflow(
            raw,
            image_filename="source_frame.png",
            upscale_cfg=upscale_cfg,
            base_width=768,
            base_height=1344,
        )
        self.assertEqual(patched["1093"]["inputs"]["image"], "source_frame.png")
        self.assertEqual(
            patched["1091"]["inputs"]["model"], "seedvr2_ema_7b_fp8_e4m3fn.safetensors"
        )
        self.assertEqual(patched["1089"]["inputs"]["color_correction"], "lab")
        self.assertEqual(patched["1089"]["inputs"]["resolution"], 2688)

    def test_patch_detailer_workflow(self):
        raw = load_workflow("workflow_detailer.json")
        detailer_cfg = DetailerConfig(
            enabled=True,
            items=[
                DetailerItemConfig(type="face", enabled=True, steps=12),
                DetailerItemConfig(type="hand", enabled=True),
            ],
        )
        patched = patch_detailer_workflow(
            raw,
            image_filename="upscaled_frame.png",
            detailer_cfg=detailer_cfg,
            prompt="detailed face",
            negative_prompt="bad hands",
        )
        self.assertEqual(patched["1112"]["inputs"]["image"], "upscaled_frame.png")
        self.assertEqual(patched["1113"]["inputs"]["text"], "detailed face")
        self.assertEqual(patched["1114"]["inputs"]["text"], "bad hands")
        self.assertIn("1088:660", patched)
        self.assertEqual(patched["1088:660"]["inputs"]["steps"], 12)
        self.assertNotIn("1088:649", patched)  # foot pruned


    def test_patch_base_t2i_workflow_img2img(self):
        raw = load_workflow("workflow_generate_t2i.json")
        patched = patch_base_t2i_workflow(
            raw,
            prompt="cyberpunk portrait",
            source_image_filename="source_portrait.png",
            denoise=0.6,
            steps=20,
        )
        self.assertNotIn("1054", patched)
        self.assertIn("1054_load", patched)
        self.assertEqual(patched["1054_load"]["class_type"], "LoadImage")
        self.assertEqual(patched["1054_load"]["inputs"]["image"], "source_portrait.png")
        self.assertIn("1054_encode", patched)
        self.assertEqual(patched["1054_encode"]["inputs"]["pixels"], ["1054_load", 0])
        self.assertEqual(patched["1056"]["inputs"]["latent_image"], ["1054_encode", 0])
        self.assertEqual(patched["1059"]["inputs"]["denoise"], 0.6)

    def test_patch_full_t2i_workflow_img2img(self):
        from app.services.workflow_router import patch_full_t2i_workflow
        raw = load_workflow("workflow_generate_t2i.json")
        patched = patch_full_t2i_workflow(
            raw,
            prompt="futuristic city",
            source_image_filename="city_sketch.png",
            denoise=0.75,
        )
        self.assertNotIn("1054", patched)
        self.assertEqual(patched["1054_load"]["inputs"]["image"], "city_sketch.png")
        self.assertEqual(patched["1059"]["inputs"]["denoise"], 0.75)


if __name__ == "__main__":
    unittest.main()
