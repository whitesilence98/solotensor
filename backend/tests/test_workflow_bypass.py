"""Unit tests for workflow bypass engine, detailer rewiring, and modular pipeline validation."""

import json
import unittest
from pathlib import Path

from app.schemas import DetailerConfig, DetailerItemConfig, UpscaleConfig
from app.services.workflow_bypass import (
    BypassEngine,
    apply_detailer_pipeline,
    apply_t2i_pipeline,
    engine as bypass_engine,
)

WORKFLOW_DIR = Path(__file__).resolve().parents[1] / "workflows"


class TestWorkflowBypass(unittest.TestCase):
    def setUp(self):
        t2i_path = WORKFLOW_DIR / "workflow_generate_t2i.json"
        self.assertTrue(t2i_path.exists(), "workflow_generate_t2i.json must exist")
        self.raw_t2i = json.loads(t2i_path.read_text(encoding="utf-8"))

        detailer_path = WORKFLOW_DIR / "workflow_detailer.json"
        self.assertTrue(detailer_path.exists(), "workflow_detailer.json must exist")
        self.raw_detailer = json.loads(detailer_path.read_text(encoding="utf-8"))

        upscaler_path = WORKFLOW_DIR / "workflow_seedvr_upscaler.json"
        self.assertTrue(upscaler_path.exists(), "workflow_seedvr_upscaler.json must exist")
        self.raw_upscaler = json.loads(upscaler_path.read_text(encoding="utf-8"))

    def _check_no_dangling_references(self, graph: dict) -> None:
        """Verify that every link in graph points to an existing node."""
        for nid, node in graph.items():
            inputs = node.get("inputs", {})
            for key, val in inputs.items():
                if isinstance(val, list) and len(val) == 2 and isinstance(val[0], str):
                    target = val[0]
                    self.assertIn(
                        target,
                        graph,
                        f"Dangling link in node {nid} input '{key}' pointing to missing node '{target}'",
                    )

    def test_detailer_pipeline_all_enabled(self):
        detailer = DetailerConfig(
            enabled=True,
            items=[
                DetailerItemConfig(type="face", enabled=True, steps=20),
                DetailerItemConfig(type="foot", enabled=True),
                DetailerItemConfig(type="breast", enabled=True),
                DetailerItemConfig(type="hand", enabled=True),
                DetailerItemConfig(type="vagina", enabled=True),
            ],
        )
        patched = apply_detailer_pipeline(self.raw_detailer, detailer_cfg=detailer)
        self.assertIn("1088:660", patched)  # face
        self.assertIn("1088:649", patched)  # foot
        self.assertIn("1088:650", patched)  # breast
        self.assertIn("1088:653", patched)  # hand
        self.assertIn("1088:651", patched)  # vagina
        self.assertEqual(patched["1088:660"]["inputs"]["steps"], 20)
        self._check_no_dangling_references(patched)

    def test_detailer_pipeline_only_face_and_hand(self):
        detailer = DetailerConfig(
            enabled=True,
            items=[
                DetailerItemConfig(type="face", enabled=True),
                DetailerItemConfig(type="hand", enabled=True),
            ],
        )
        patched = apply_detailer_pipeline(self.raw_detailer, detailer_cfg=detailer)
        # Disabled detailers pruned
        self.assertNotIn("1088:649", patched)  # foot
        self.assertNotIn("1088:650", patched)  # breast
        self.assertNotIn("1088:651", patched)  # vagina
        # Enabled detailers kept
        self.assertIn("1088:660", patched)  # face
        self.assertIn("1088:653", patched)  # hand
        # Face takes directly from source image (1112)
        self.assertEqual(patched["1088:660"]["inputs"]["image"], ["1112", 0])
        # Hand takes from face (1088:660)
        self.assertEqual(patched["1088:653"]["inputs"]["image"], ["1088:660", 0])
        # Post-process takes from hand
        self.assertEqual(patched["1088:661"]["inputs"]["image"], ["1088:653", 0])
        self._check_no_dangling_references(patched)

    def test_detailer_pipeline_all_bypassed(self):
        detailer = DetailerConfig(enabled=False)
        patched = apply_detailer_pipeline(self.raw_detailer, detailer_cfg=detailer)
        for nid in ("1088:660", "1088:649", "1088:650", "1088:653", "1088:651"):
            self.assertNotIn(nid, patched)
        # Post-processing node takes directly from source image (1112)
        self.assertEqual(patched["1088:661"]["inputs"]["image"], ["1112", 0])
        self._check_no_dangling_references(patched)

    def test_base_t2i_pipeline_has_single_save_image(self):
        patched = apply_t2i_pipeline(self.raw_t2i)
        save_nodes = [nid for nid, n in patched.items() if n.get("class_type") == "SaveImage"]
        self.assertEqual(save_nodes, ["1084"])
        self._check_no_dangling_references(patched)

    def test_modular_workflows_each_have_single_terminal_save_node(self):
        """Verify each of the 3 modular workflows has exactly one SaveImage node."""
        t2i_saves = [nid for nid, n in self.raw_t2i.items() if n.get("class_type") == "SaveImage"]
        self.assertEqual(t2i_saves, ["1084"])

        upscaler_saves = [
            nid for nid, n in self.raw_upscaler.items() if n.get("class_type") == "SaveImage"
        ]
        self.assertEqual(upscaler_saves, ["1090"])

        detailer_saves = [
            nid for nid, n in self.raw_detailer.items() if n.get("class_type") == "SaveImage"
        ]
        self.assertEqual(detailer_saves, ["1087"])

    def test_generic_bypass_engine_rule_registration(self):
        engine = BypassEngine()
        engine.register_rule("custom_tagger", ["1082"], replacement="1086")
        dummy = {
            "1082": {"inputs": {}, "class_type": "WD14Tagger"},
            "1083": {"inputs": {"text": ["1082", 0]}, "class_type": "ShowText"},
        }
        # Disable rule
        pruned = engine.apply(dummy, enabled_features=set())
        self.assertNotIn("1082", pruned)
        self.assertEqual(pruned["1083"]["inputs"]["text"], ["1086", 0])


if __name__ == "__main__":
    unittest.main()
