"""Utility for extensible workflow bypasses and detailer/upscale graph patching.

This module provides:
1. A lightweight, generic BypassEngine that can prune or replace nodes in any
   ComfyUI workflow graph based on feature flags and rule files.
2. `apply_detailer_pipeline`: Specializes in cascading FaceDetailerPipe cascades
   (face, foot, breast, hand, vagina) on `workflow_detailer.json`, with dynamic
   input rewiring and parameter injection.
3. `apply_t2i_pipeline`: High-level pipeline patcher supporting both legacy monolithic
   graphs and modular workflow passes.
"""

from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Dict, Set, Mapping, Optional, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from ..schemas import GenerateRequest, UpscaleConfig, DetailerConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
class BypassRule:
    """Represents a single bypass rule."""

    def __init__(self, name: str, node_ids: Set[str], replacement: Optional[str] = None):
        self.name = name
        self.node_ids = set(node_ids)
        self.replacement = replacement

    def __repr__(self) -> str:
        return f"BypassRule(name={self.name!r}, nodes={self.node_ids}, repl={self.replacement})"


# ---------------------------------------------------------------------------
# Generic Engine implementation
# ---------------------------------------------------------------------------
class BypassEngine:
    """Manage a collection of :class:`BypassRule` objects and apply them to graphs."""

    _CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "bypass_rules.json"

    def __init__(self):
        self.rules: Dict[str, BypassRule] = {}
        self._load_from_file()

    def register_rule(
        self, name: str, node_ids: Set[str] | list[str], replacement: Optional[str] = None
    ) -> None:
        """Add or replace a rule at runtime."""
        self.rules[name] = BypassRule(name, set(node_ids), replacement)

    def _load_from_file(self) -> None:
        """Load static rules from ``bypass_rules.json`` if present."""
        if not self._CONFIG_PATH.is_file():
            return
        try:
            raw = json.loads(self._CONFIG_PATH.read_text(encoding="utf-8"))
            for name, spec in raw.items():
                if name.startswith("_"):
                    continue
                nodes = set(spec.get("nodes", []))
                repl = spec.get("replacement")
                self.register_rule(name, nodes, repl)
        except Exception as exc:
            logger.warning(f"Failed to load bypass rules from {self._CONFIG_PATH}: {exc}")

    def apply(
        self,
        graph: Mapping[str, Any],
        enabled_features: Set[str] | list[str],
        fallback_node: Optional[str] = None,
    ) -> dict[str, Any]:
        """Return a new graph with disabled rules removed and references rewired."""
        enabled = set(enabled_features)
        patched = json.loads(json.dumps(graph))

        to_remove: Set[str] = set()
        replacement_map: Dict[str, str] = {}
        for name, rule in self.rules.items():
            if name not in enabled:
                to_remove.update(rule.node_ids)
                if rule.replacement:
                    for nid in rule.node_ids:
                        replacement_map[nid] = rule.replacement
                elif fallback_node:
                    for nid in rule.node_ids:
                        replacement_map[nid] = fallback_node

        for nid in to_remove:
            patched.pop(nid, None)

        for nid, node in list(patched.items()):
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs", {})
            for key, val in list(inputs.items()):
                if isinstance(val, list) and isinstance(val[0], str):
                    target = val[0]
                    if target in to_remove:
                        new_target = replacement_map.get(target, fallback_node)
                        if new_target:
                            inputs[key] = [new_target, 0]
                        else:
                            inputs.pop(key, None)
        return patched


engine = BypassEngine()


# ---------------------------------------------------------------------------
# Detailer Chain Definitions
# ---------------------------------------------------------------------------
# Modular workflow_detailer.json node definitions
DETAILER_CHAIN_DEFS_MODULAR = [
    ("face", "1088:660", ["1088:654", "1088:659"]),
    ("foot", "1088:649", ["1088:655", "1088:676"]),
    ("breast", "1088:650", ["1088:656", "1088:646"]),
    ("hand", "1088:653", ["1088:657", "1088:678"]),
    ("vagina", "1088:651", ["1088:658", "1088:648"]),
]

# Legacy monolithic node definitions (for backward compatibility)
DETAILER_CHAIN_DEFS_LEGACY = [
    ("face", "1080:660", ["1080:654", "1080:659"]),
    ("foot", "1080:649", ["1080:655", "1080:676"]),
    ("breast", "1080:650", ["1080:656", "1080:646"]),
    ("hand", "1080:653", ["1080:657", "1080:678"]),
    ("vagina", "1080:651", ["1080:658", "1080:648"]),
]


def apply_detailer_pipeline(
    graph: dict[str, Any],
    detailer_cfg: Optional["DetailerConfig"] = None,
    base_image_node: Optional[str] = None,
    post_process_node: Optional[str] = None,
) -> dict[str, Any]:
    """Prune disabled detailers and rewire sequential image cascade.
    
    Supports both modular `workflow_detailer.json` (1088:... nodes, input 1112)
    and legacy monolithic workflows (1080:... nodes, input 1064).
    """
    patched = json.loads(json.dumps(graph))

    # Detect whether modular or legacy
    is_modular = any(nid.startswith("1088:") for nid in patched)
    if is_modular:
        chain_defs = DETAILER_CHAIN_DEFS_MODULAR
        current_img = base_image_node or ("1112" if "1112" in patched else "1064")
        pp_node = post_process_node or "1088:661"
        terminal_save = "1087"
        style_node = "1088:662"
    else:
        chain_defs = DETAILER_CHAIN_DEFS_LEGACY
        current_img = base_image_node or "1064"
        pp_node = post_process_node or "1080:661"
        terminal_save = "1086"
        style_node = "1080:662"

    enabled_detailer_names: Set[str] = set()
    detailer_items_map: Dict[str, Any] = {}

    if detailer_cfg and detailer_cfg.enabled:
        if not detailer_cfg.items:
            # Default: enable all
            enabled_detailer_names = {name for name, _, _ in chain_defs}
        else:
            for item in detailer_cfg.items:
                if item.enabled:
                    enabled_detailer_names.add(item.type)
                    detailer_items_map[item.type] = item

    for name, main_node, aux_nodes in chain_defs:
        if name in enabled_detailer_names and main_node in patched:
            node = patched[main_node]
            node.setdefault("inputs", {})["image"] = [current_img, 0]
            current_img = main_node

            # Inject per-detailer parameters
            item = detailer_items_map.get(name)
            if item:
                inputs = node.get("inputs", {})
                if hasattr(item, "steps") and item.steps:
                    inputs["steps"] = item.steps
                if hasattr(item, "cfg_scale") and item.cfg_scale:
                    inputs["cfg"] = item.cfg_scale
                if hasattr(item, "denoising_strength") and item.denoising_strength is not None:
                    inputs["denoise"] = item.denoising_strength
                if hasattr(item, "bbox_threshold") and item.bbox_threshold is not None:
                    inputs["bbox_threshold"] = item.bbox_threshold
                if hasattr(item, "bbox_dilation") and item.bbox_dilation is not None:
                    inputs["bbox_dilation"] = item.bbox_dilation

                if hasattr(item, "detector_model") and item.detector_model:
                    detector_nid = aux_nodes[0]
                    if detector_nid in patched:
                        patched[detector_nid].setdefault("inputs", {})["model_name"] = item.detector_model
        else:
            # Bypass and prune
            patched.pop(main_node, None)
            for a in aux_nodes:
                patched.pop(a, None)

    # Post-Processing Stage (ImageAddNoise)
    if pp_node in patched:
        patched[pp_node].setdefault("inputs", {})["image"] = [current_img, 0]

    # Ensure terminal SaveImage links to active terminal output
    if terminal_save in patched:
        if style_node not in patched:
            if pp_node in patched:
                patched[terminal_save].setdefault("inputs", {})["images"] = [pp_node, 0]
            else:
                patched[terminal_save].setdefault("inputs", {})["images"] = [current_img, 0]

    return patched


def apply_t2i_pipeline(
    graph: dict[str, Any],
    upscale_cfg: Optional["UpscaleConfig"] = None,
    detailer_cfg: Optional["DetailerConfig"] = None,
    base_image_node: str = "1064",
    post_process_node: str = "1080:661",
) -> dict[str, Any]:
    """Prune disabled stages and rewire graph.

    Works with both full monolithic workflows and pure base workflows.
    """
    patched = json.loads(json.dumps(graph))

    # If this is pure base T2I without upscaler/detailer nodes, return with 1084 save
    has_seedvr = "1075" in patched
    has_legacy_detailers = any(nid.startswith("1080:") for nid in patched)
    has_modular_detailers = any(nid.startswith("1088:") for nid in patched)

    if not has_seedvr and not has_legacy_detailers and not has_modular_detailers:
        return patched

    # 1. Upscaler Stage (SeedVR2) if present
    upscale_enabled = bool(upscale_cfg and upscale_cfg.enabled)
    current_img = base_image_node

    if has_seedvr:
        if upscale_enabled:
            node_1075 = patched["1075"]
            node_1075.setdefault("inputs", {})["image"] = [current_img, 0]
            current_img = "1075"

            if upscale_cfg:
                inputs = node_1075["inputs"]
                if hasattr(upscale_cfg, "color_correction") and upscale_cfg.color_correction:
                    inputs["color_correction"] = upscale_cfg.color_correction
                if hasattr(upscale_cfg, "input_noise_scale") and upscale_cfg.input_noise_scale is not None:
                    inputs["input_noise_scale"] = upscale_cfg.input_noise_scale
                if hasattr(upscale_cfg, "latent_noise_scale") and upscale_cfg.latent_noise_scale is not None:
                    inputs["latent_noise_scale"] = upscale_cfg.latent_noise_scale
                if hasattr(upscale_cfg, "scale") and upscale_cfg.scale:
                    target_res = int(min(4096, max(1024, 1024 * upscale_cfg.scale)))
                    inputs["resolution"] = target_res
                    inputs["max_resolution"] = target_res

                if hasattr(upscale_cfg, "dit_model") and upscale_cfg.dit_model and "1073" in patched:
                    patched["1073"].setdefault("inputs", {})["model"] = str(upscale_cfg.dit_model)
        else:
            for nid in ("1073", "1074", "1075", "1085"):
                patched.pop(nid, None)

    # 2. Detailer Stages
    if has_legacy_detailers or has_modular_detailers:
        patched = apply_detailer_pipeline(
            patched,
            detailer_cfg=detailer_cfg,
            base_image_node=current_img,
            post_process_node=post_process_node,
        )

    # 3. Prune intermediate SaveImage nodes in monolithic graph
    if "1086" in patched:
        patched.pop("1084", None)
        patched.pop("1085", None)

    return patched
