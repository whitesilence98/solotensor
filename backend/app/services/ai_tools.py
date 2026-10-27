"""AI Tool Studio workflow parsing, catalog, execution preparation, and storage."""

from __future__ import annotations

import copy
import json
import math
import random
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..config import Settings, get_settings
from ..schemas import (
    ToolAspectRatio,
    ToolControl,
    ToolDetail,
    ToolMode,
    ToolNodeInfo,
    ToolNodeInput,
    ToolParseResponse,
    ToolSummary,
)

Workflow = dict[str, dict[str, Any]]
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
TOOL_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MAX_NODES = 2_000
MAX_INPUTS_PER_NODE = 100
MAX_VALUE_DEPTH = 12
MAX_STRING_LENGTH = 50_000
# Every axis is a multiple of 32 so LTX-Video latents stay valid; 1344x576 is
# the exact 21:9 ratio (1344 / 576 == 21 / 9) inside the shared pixel budget.
ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
    "4:3": (1152, 864),
    "21:9": (1344, 576),
}
INFRASTRUCTURE_MARKERS = (
    "loader",
    "checkpoint",
    "lora",
    "upscalemodel",
    "unet",
    "vae",
    "clipvision",
    "encoder",
)
LOCKED_EXECUTION_MARKERS = ("sampler", "ksampler", "scheduler", "noise")
NON_INPUT_NODE_MARKERS = ("cleangpuused", "cleangpu", "ramclean")
TEXT_CLASSES = {
    "cliptextencode",
    "cliptextencodeflux",
    "cliptextencodecontrolnet",
    "cliptextencodesdxl",
    "cliptextencodesdxlrefiner",
}
VIDEO_NODE_MARKERS = (
    "video",
    "animatediff",
    "vhs",
    "svd",
    "wan",
    "cogvideo",
    "hunyuanvideo",
)
TERMINAL_NODE_MARKERS = (
    "saveimage",
    "videocombine",
    "savevideo",
    "previewimage",
)
STAGE1_NODE_MARKERS = (
    "stage1",
    "firststage",
    "firstpass",
    "pass1",
    "primary",
    "basepass",
)
STAGE2_NODE_MARKERS = (
    "stage2",
    "secondstage",
    "secondpass",
    "pass2",
    "refine",
    "refiner",
    "upscale",
    "hires",
    "highres",
    "detailer",
)
# Bound for the terminal fan-out used by auto-binding; real workflows expose a
# handful of Save nodes, this only keeps a hostile graph from multiplying walks.
MAX_BINDING_TERMINALS = 16
DEFAULT_DIMENSION_MULTIPLE = 8
LTX_DIMENSION_MULTIPLE = 32

SAMPLER_NAMES = [
    "euler",
    "euler_ancestral",
    "heun",
    "dpm_2",
    "dpm_2_ancestral",
    "lms",
    "dpm_fast",
    "dpm_adaptive",
    "dpmpp_2s_ancestral",
    "dpmpp_sde",
    "dpmpp_2m",
    "dpmpp_2m_sde",
    "ddim",
    "uni_pc",
]

SCHEDULER_NAMES = [
    "normal",
    "karras",
    "exponential",
    "sgm_uniform",
    "simple",
    "ddim_uniform",
]

UPSCALE_METHODS = [
    "bicubic",
    "bilinear",
    "nearest-exact",
    "lanczos",
    "area",
]


class AIToolError(RuntimeError):
    """Raised when an AI Tool workflow or input is invalid."""


class AIToolNotFound(AIToolError):
    """Raised when a requested stored tool does not exist."""


def _copy(value: Any) -> Any:
    return copy.deepcopy(value)


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _label(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("_", " ").strip()).title()


def _is_infrastructure(class_type: str) -> bool:
    normalized = _norm(class_type)
    if any(
        marker in normalized
        for marker in (
            "applycontrolnet",
            "controlnetapply",
            "applyipadapter",
            "ipadapterapply",
            "ipadapterfaceid",
        )
    ):
        return False
    if any(marker in normalized for marker in INFRASTRUCTURE_MARKERS):
        return True
    if normalized in {"controlnet", "ipadapter", "controlnetmodel"}:
        return True
    return False


def _validate_json_value(value: Any, depth: int = 0) -> None:
    if depth > MAX_VALUE_DEPTH:
        raise AIToolError("Workflow value nesting is too deep")
    if isinstance(value, str):
        if len(value) > MAX_STRING_LENGTH:
            raise AIToolError("Workflow text value is too long")
    elif isinstance(value, (list, tuple)):
        for item in value:
            _validate_json_value(item, depth + 1)
    elif isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 256:
                raise AIToolError("Workflow input key is invalid")
            _validate_json_value(item, depth + 1)
    elif value is not None and not isinstance(value, (bool, int, float)):
        raise AIToolError("Workflow contains an unsupported value")


def _meta_title(node: dict[str, Any]) -> str | None:
    """Human node title from the workflow editor, e.g. ``_meta: {title: "Face Detailer"}``."""
    meta = node.get("_meta")
    if isinstance(meta, dict):
        title = meta.get("title")
        if isinstance(title, str) and title.strip():
            return re.sub(r"\s+", " ", title.strip())
    return None


def _build_downstream_graph(
    workflow: Workflow,
) -> dict[str, list[tuple[str, str, dict[str, Any]]]]:
    """Map source_node_id -> list of (consumer_node_id, input_name, consumer_node)."""
    downstream: dict[str, list[tuple[str, str, dict[str, Any]]]] = {
        nid: [] for nid in workflow
    }
    for consumer_id, node in workflow.items():
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        for input_name, val in inputs.items():
            if isinstance(val, list) and val and isinstance(val[0], str):
                src_id = val[0]
                if src_id in downstream:
                    downstream[src_id].append((consumer_id, input_name, node))
    return downstream


def _is_terminal_node(node: dict[str, Any]) -> bool:
    """True for nodes that persist or preview a graph result."""
    normalized = _norm(str(node.get("class_type", "")))
    if any(marker in normalized for marker in TERMINAL_NODE_MARKERS):
        return True
    inputs = node.get("inputs", {})
    return isinstance(inputs, dict) and (
        "save_output" in inputs or "filename_prefix" in inputs
    )


def _terminal_nodes(workflow: Workflow) -> list[str]:
    """Output nodes used to score binding candidates, capped for hostile graphs."""
    terminals: list[str] = []
    for node_id in sorted(workflow):
        node = workflow[node_id]
        if not isinstance(node, dict) or not _is_terminal_node(node):
            continue
        terminals.append(node_id)
        if len(terminals) >= MAX_BINDING_TERMINALS:
            break
    return terminals


def _reachable_from(workflow: Workflow, root: str) -> set[str]:
    """Walk ``[node_id, slot]`` links upstream from root.

    Uses an explicit stack and a visited set so cycles cannot recurse or hang;
    the walk stops after MAX_NODES unique nodes and each node is scheduled once.
    """
    reachable: set[str] = set()
    scheduled = {root}
    stack = [root]
    while stack and len(reachable) < MAX_NODES:
        node_id = stack.pop()
        if node_id in reachable or node_id not in workflow:
            continue
        reachable.add(node_id)
        node = workflow[node_id]
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        for value in inputs.values():
            if (
                isinstance(value, list)
                and len(value) == 2
                and isinstance(value[0], str)
                and value[0] not in scheduled
            ):
                scheduled.add(value[0])
                stack.append(value[0])
                if len(scheduled) >= MAX_NODES:
                    break
    return reachable


def _terminal_reachability(workflow: Workflow) -> dict[str, set[str]]:
    """Map each terminal node id to the set of nodes it can reach upstream."""
    reachability: dict[str, set[str]] = {}
    for terminal in _terminal_nodes(workflow):
        reachability[terminal] = _reachable_from(workflow, terminal)
    return reachability


def _binding_support(node_id: str, reachability: dict[str, set[str]]) -> int:
    """How many output nodes depend on this node; higher means more primary."""
    return sum(1 for reachable in reachability.values() if node_id in reachable)


def _binding_preference(node_id: str, node: dict[str, Any], role: str) -> int:
    """Stage/role preference used to break ties between equally reachable nodes."""
    if not isinstance(node, dict):
        node = {}
    text = _norm(
        " ".join(
            (
                _meta_title(node) or "",
                str(node.get("class_type", "")),
                node_id,
            )
        )
    )
    score = 0
    if role and role in text:
        score += 2
    if any(marker in text for marker in STAGE1_NODE_MARKERS):
        score += 3
    if any(marker in text for marker in STAGE2_NODE_MARKERS):
        score -= 3
    return score


def _select_binding_candidate(
    workflow: Workflow,
    candidates: list[tuple[str, str]],
    role: str,
    fallback: list[tuple[str, str]] | None = None,
) -> dict[str, str] | None:
    """Pick the most output-aware candidate from an ordered legacy scan.

    Candidates reachable from more terminals win, then Stage-1/role hints, then
    the scan order. With no terminal analysis the first ``fallback`` candidate
    wins so workflows without output nodes keep their historical bindings.
    """
    unique: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            unique.append(candidate)
    if not unique:
        return None
    reachability = _terminal_reachability(workflow)
    support = {
        candidate: _binding_support(candidate[0], reachability)
        for candidate in unique
    }
    if not reachability or not any(support.values()):
        # No usable output topology (or every candidate is orphaned): keep the
        # historical first-match order so existing tools never regress.
        if fallback is not None:
            if not fallback:
                return None
            node_id, input_name = fallback[0]
        else:
            node_id, input_name = unique[0]
        return {"node_id": node_id, "input_name": input_name}
    ranked = sorted(
        unique,
        key=lambda item: (
            -support[item],
            -_binding_preference(item[0], workflow.get(item[0], {}), role),
            item[0],
            item[1],
        ),
    )
    node_id, input_name = ranked[0]
    return {"node_id": node_id, "input_name": input_name}


def _is_latent_dimension_node(class_type: str) -> bool:
    """True for the empty-latent families that own their own pixel size."""
    normalized = _norm(class_type)
    return (
        "latent" in normalized
        or "emptylatent" in normalized
        or "empty" in normalized
    )


def _has_literal_size(value: Any) -> bool:
    """A positive scalar dimension. Zero is KJ-resize's 'inherit source' sentinel."""
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value > 0
    )


def _find_dimension_node(workflow: Workflow) -> dict[str, str]:
    """Find the node that owns the output pixel size, if the graph has one.

    Empty-latent nodes win: they own the output size, whereas a resize node may
    sit downstream of it and only rescale the result. Literal-size resize nodes
    count as owners too, which is how an img2img graph that resizes its input
    gets a size control at all.
    """
    fallback: dict[str, str] = {}
    for node_id in sorted(workflow):
        node = workflow[node_id]
        if not isinstance(node, dict):
            continue
        normalized = _norm(str(node.get("class_type", "")))
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        if _is_latent_dimension_node(str(node.get("class_type", ""))) and (
            "width" in inputs and "height" in inputs
        ):
            w_val = inputs["width"]
            h_val = inputs["height"]
            if (
                isinstance(w_val, (int, float))
                and not isinstance(w_val, bool)
                and isinstance(h_val, (int, float))
                and not isinstance(h_val, bool)
            ):
                return {"node_id": node_id, "width": "width", "height": "height"}
            if (
                isinstance(w_val, list)
                and len(w_val) == 2
                and isinstance(w_val[0], str)
                and isinstance(h_val, list)
                and len(h_val) == 2
                and isinstance(h_val[0], str)
                and w_val[0] == h_val[0]
            ):
                src = workflow.get(w_val[0], {})
                src_inputs = src.get("inputs", {}) if isinstance(src, dict) else {}
                if "width" in src_inputs and "height" in src_inputs:
                    return {"node_id": w_val[0], "width": "width", "height": "height"}
            continue
        if (
            not fallback
            and not _is_infrastructure(str(node.get("class_type", "")))
            and _has_literal_size(inputs.get("width"))
            and _has_literal_size(inputs.get("height"))
        ):
            fallback = {"node_id": node_id, "width": "width", "height": "height"}
    return fallback


def _snap_dimension(value: Any, multiple: int) -> Any:
    """Floor a numeric dimension to a multiple so latent grids stay valid."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    return max(multiple, (int(value) // multiple) * multiple)


def _snap_dimensions(width: Any, height: Any, multiple: int) -> tuple[Any, Any]:
    return _snap_dimension(width, multiple), _snap_dimension(height, multiple)


def _required_dimension_multiple(workflow: Workflow) -> int:
    """LTX-Video needs multiples of 32; every other family uses ComfyUI's minimum."""
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        normalized = _norm(str(node.get("class_type", "")))
        if "ltxv" in normalized or normalized.startswith("ltx"):
            return LTX_DIMENSION_MULTIPLE
    return DEFAULT_DIMENSION_MULTIPLE


def _trace_image_role(
    node_id: str,
    workflow: Workflow,
    downstream: dict[str, list[tuple[str, str, dict[str, Any]]]],
) -> tuple[str, str]:
    """Return (role, default_label) by inspecting reachable downstream nodes."""
    queue = [node_id]
    visited = {node_id}

    while queue:
        curr_id = queue.pop(0)
        for consumer_id, _input_name, consumer_node in downstream.get(curr_id, []):
            c_class = str(consumer_node.get("class_type", ""))
            c_norm = _norm(c_class)
            c_meta = _meta_title(consumer_node) or ""
            c_meta_norm = _norm(c_meta)

            # 1. ControlNet
            if "controlnet" in c_norm or "controlnet" in c_meta_norm:
                hint = ""
                for h in (
                    "openpose",
                    "pose",
                    "depth",
                    "canny",
                    "lineart",
                    "scribble",
                    "tile",
                    "inpaint",
                ):
                    if h in c_norm or h in c_meta_norm:
                        hint = h.title()
                        break
                label = (
                    f"ControlNet {hint} Image".replace("  ", " ").strip()
                    if hint
                    else "ControlNet Reference Image"
                )
                return "controlnet", label

            # 2. IP-Adapter / FaceID / InstantID / Reactor / FaceDetailer
            if any(
                k in c_norm or k in c_meta_norm
                for k in (
                    "ipadapter",
                    "instantid",
                    "reactor",
                    "facedetailer",
                    "faceid",
                    "photomaker",
                )
            ):
                if any(
                    f in c_norm or f in c_meta_norm for f in ("face", "head", "portrait")
                ):
                    return "face_reference", "Face Reference Image"
                return "style_reference", "Style Reference Image"

            # 3. Inpaint / Mask
            if any(
                k in c_norm or k in c_meta_norm
                for k in (
                    "inpaint",
                    "mask",
                    "vaeencodeforinpaint",
                    "setlatentnoisemask",
                )
            ):
                return "inpaint", "Inpaint Base Image"

            # 4. Standard VAEEncode (Img2Img)
            if "vaeencode" in c_norm:
                return "img2img", "Input Image (Img2Img)"

            # 5. Video input
            if any(
                k in c_norm
                for k in ("vhs", "animatediff", "wanvideo", "cogvideo", "svd")
            ):
                return "video_input", "Input Video / Frames"

            # Pass-through preprocessors or scalers
            if consumer_id not in visited and any(
                p in c_norm
                for p in (
                    "image",
                    "scale",
                    "resize",
                    "crop",
                    "preprocess",
                    "canny",
                    "depth",
                    "rembg",
                    "blur",
                )
            ):
                visited.add(consumer_id)
                queue.append(consumer_id)

    return "image", "Image"


def _disambiguate_image_labels(
    image_nodes: list[tuple[str, dict[str, Any]]],
    workflow: Workflow,
    downstream: dict[str, list[tuple[str, str, dict[str, Any]]]],
) -> dict[str, tuple[str, str]]:
    raw_results: dict[str, tuple[str, str]] = {}
    for node_id, node in image_nodes:
        meta = _meta_title(node)
        role, detected_label = _trace_image_role(node_id, workflow, downstream)
        final_label = meta if meta else detected_label
        raw_results[node_id] = (final_label, role)

    if len(image_nodes) <= 1:
        return raw_results

    label_counts: dict[str, int] = {}
    for label, _ in raw_results.values():
        label_counts[label] = label_counts.get(label, 0) + 1

    has_duplicates = any(count > 1 for count in label_counts.values())
    has_plain_image = any(label.lower() == "image" for label, _ in raw_results.values())

    if not has_duplicates and not has_plain_image:
        return raw_results

    final_results: dict[str, tuple[str, str]] = {}
    seen_roles: dict[str, int] = {}
    for idx, (node_id, node) in enumerate(image_nodes, 1):
        meta = _meta_title(node)
        base_label, role = raw_results[node_id]
        if meta:
            final_results[node_id] = (meta, role)
            continue

        seen_roles[role] = seen_roles.get(role, 0) + 1
        role_num = seen_roles[role]

        if label_counts.get(base_label, 0) > 1:
            if base_label.lower() == "image":
                role_hint = (
                    "Source"
                    if (role == "img2img" or (role == "image" and idx == 1))
                    else "ControlNet"
                    if role == "controlnet"
                    else "Style Reference"
                    if role == "style_reference"
                    else "Face Reference"
                    if role == "face_reference"
                    else "Inpaint"
                    if role == "inpaint"
                    else "Input"
                )
                label = f"Input Image {idx} ({role_hint})"
            else:
                label = f"{base_label} {role_num}"
        elif base_label.lower() == "image":
            role_hint = (
                "Source"
                if (role == "img2img" or (role == "image" and idx == 1))
                else "ControlNet"
                if role == "controlnet"
                else "Style Reference"
                if role == "style_reference"
                else "Face Reference"
                if role == "face_reference"
                else "Inpaint"
                if role == "inpaint"
                else "Input"
            )
            label = f"Input Image {idx} ({role_hint})"
        else:
            label = base_label

        final_results[node_id] = (label, role)

    return final_results


def _prompt_roles(workflow: Workflow) -> dict[str, str]:
    roles: dict[str, str] = {}
    for node in workflow.values():
        if "sampler" not in _norm(str(node.get("class_type", ""))):
            continue
        for key, role in (("positive", "Positive"), ("negative", "Negative")):
            ref = node.get("inputs", {}).get(key)
            if isinstance(ref, list) and ref and isinstance(ref[0], str):
                src_id = ref[0]
                roles.setdefault(src_id, role)
                # Trace upstream through conditioning modifiers
                queue = [src_id]
                visited = {src_id}
                while queue:
                    curr_id = queue.pop(0)
                    curr_node = workflow.get(curr_id)
                    if not isinstance(curr_node, dict):
                        continue
                    inputs = curr_node.get("inputs", {})
                    for _inp_name, inp_val in inputs.items():
                        if isinstance(inp_val, list) and inp_val and isinstance(inp_val[0], str):
                            up_id = inp_val[0]
                            if up_id not in visited and up_id in workflow:
                                visited.add(up_id)
                                roles.setdefault(up_id, role)
                                queue.append(up_id)
    return roles


def detect_workflow_modality(workflow: Workflow) -> dict[str, Any]:
    """
    Analyzes ComfyUI workflow_api graph to detect:
    - detected_mode (ToolMode)
    - detected_output_type ("image" | "video")
    - detected_inputs (list of human-readable input capability identifiers)
    - archetype (e.g. "Text-to-Image Generation", "Image-to-Image Transformation", etc.)
    - node_count (int)
    """
    node_count = len(workflow)
    has_video_output = False
    has_image_input = False
    has_mask_input = False
    has_upscaler = False
    has_sampler = False
    detected_inputs: list[str] = []

    for _nid, node in workflow.items():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type", ""))
        normalized = _norm(class_type)
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            inputs = {}

        # 1. Video outputs / processors
        if any(marker in normalized for marker in (
            "vhs", "videocombine", "animate", "animatediff", "wanvideo", "cogvideo", "svd", "hunyuanvideo"
        )):
            has_video_output = True

        # 2. Image inputs
        if "loadimage" in normalized and "image" in inputs:
            has_image_input = True
            if "Starter Image" not in detected_inputs:
                detected_inputs.append("Starter Image")

        # 3. Mask inputs / Inpainting
        if any(m in normalized for m in ("loadmask", "loadimagemask", "inpaint", "inpaintmodelconditioning")):
            has_mask_input = True
            if "Inpaint Mask" not in detected_inputs:
                detected_inputs.append("Inpaint Mask")

        # 4. Upscaler
        if any(u in normalized for u in ("upscalemodelloader", "imageupscalewithmodel", "iterativeupscale")):
            has_upscaler = True

        # 5. Sampler
        if "sampler" in normalized or "ksampler" in normalized:
            has_sampler = True
            if "Sampling Settings" not in detected_inputs:
                detected_inputs.append("Sampling Settings")

        # 6. Prompts
        if any(p in normalized for p in ("cliptextencode", "prompt")):
            if "Creative Prompt" not in detected_inputs:
                detected_inputs.append("Creative Prompt")

    detected_output_type = "video" if has_video_output else "image"

    if has_video_output:
        detected_mode = ToolMode.IMAGE_TO_VIDEO if has_image_input else ToolMode.TEXT_TO_VIDEO
    else:
        detected_mode = ToolMode.IMAGE_TO_IMAGE if has_image_input else ToolMode.TEXT_TO_IMAGE

    if has_mask_input:
        archetype = "Inpainting & Mask Editing"
    elif has_upscaler and not has_sampler:
        archetype = "AI Upscaler & Restorer"
    elif has_video_output and has_image_input:
        archetype = "Image-to-Video Motion"
    elif has_video_output:
        archetype = "Text-to-Video Synthesis"
    elif has_image_input:
        archetype = "Image-to-Image Transformation"
    else:
        archetype = "Text-to-Image Generation"

    return {
        "detected_mode": detected_mode,
        "detected_output_type": detected_output_type,
        "detected_inputs": detected_inputs,
        "archetype": archetype,
        "node_count": node_count,
    }


def extract_controls(
    workflow: Workflow,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Expose only generation parameters that affect the output graph."""
    controls: list[dict[str, Any]] = []
    locked: list[dict[str, str]] = []
    seen: set[str] = set()
    roles = _prompt_roles(workflow)
    downstream = _build_downstream_graph(workflow)
    sampler_fields = {"seed", "noise_seed", "steps", "cfg", "denoise"}
    # Empty-latent nodes own the output size; resize nodes only rescale it.
    # Only the node _find_dimension_node picked contributes width/height
    # controls, otherwise the panel shows two competing size pairs and the
    # preset lands on a different node than the one the user edited.
    dimension_node_id = (_find_dimension_node(workflow) or {}).get("node_id")

    def add(
        node_id: str,
        node: dict[str, Any],
        input_name: str,
        *,
        kind: str,
        label: str,
        value: Any = None,
        options: list[Any] | None = None,
        numeric: bool = False,
        seed: bool = False,
        minimum: float | None = None,
        maximum: float | None = None,
        step: float | None = None,
        role: str | None = None,
        recommended: bool = True,
        is_essential: bool = False,
    ) -> None:
        path = f"nodes.{node_id}.inputs.{input_name}"
        raw = node.get("inputs", {}).get(input_name)
        if path in seen or isinstance(raw, list):
            return
        val = raw if value is None else value
        is_ess = (
            is_essential
            or seed
            or (role in {"seed", "width", "height", "cfg", "steps"})
            or (kind == "seed")
            or (input_name in {"seed", "noise_seed", "cfg", "guidance", "steps", "width", "height"})
        )
        controls.append(
            {
                "id": path,
                "path": path,
                "label": label,
                "meta_title": _meta_title(node),
                "kind": kind,
                "value": val,
                "default": val,
                "numeric": numeric,
                "seed": seed,
                "options": options or [],
                "minimum": minimum,
                "maximum": maximum,
                "min": minimum,
                "max": maximum,
                "step": step,
                "node_id": node_id,
                "input_name": input_name,
                "role": role,
                "recommended": recommended,
                "is_essential": is_ess,
            }
        )
        seen.add(path)

    def add_sampler_value(
        node_id: str,
        node: dict[str, Any],
        input_name: str,
        raw: Any,
    ) -> None:
        is_seed = input_name in {"seed", "noise_seed"}
        if input_name == "steps":
            minimum, maximum, step = 1, 100, 1
        elif input_name == "cfg":
            minimum, maximum, step = 0, 30, 0.1
        elif input_name == "denoise":
            minimum, maximum, step = 0, 1, 0.01
        else:
            minimum, maximum, step = (-1, 2**32 - 1, 1)
        kind = "seed" if is_seed else "number"
        role = "seed" if is_seed else input_name
        if not isinstance(raw, list):
            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                add(
                    node_id,
                    node,
                    input_name,
                    kind=kind,
                    label="Seed" if is_seed else _label(input_name),
                    numeric=True,
                    seed=is_seed,
                    minimum=minimum,
                    maximum=maximum,
                    step=step,
                    role=role,
                    recommended=True,
                )
            return
        if not raw or not isinstance(raw[0], str):
            return
        source = workflow.get(raw[0])
        if not isinstance(source, dict) or not isinstance(source.get("inputs"), dict):
            return
        source_inputs = source["inputs"]
        source_input_name = input_name if input_name in source_inputs else "value"
        source_value = source_inputs.get(source_input_name)
        if isinstance(source_value, (int, float)) and not isinstance(
            source_value, bool
        ):
            add(
                raw[0],
                source,
                source_input_name,
                kind=kind,
                label="Seed" if is_seed else _label(input_name),
                numeric=True,
                seed=is_seed,
                minimum=minimum,
                maximum=maximum,
                step=step,
                role=role,
                recommended=True,
            )

    image_nodes = [
        (nid, node)
        for nid, node in sorted(workflow.items())
        if "loadimage" in _norm(str(node.get("class_type", "")))
        and isinstance(node.get("inputs", {}).get("image"), str)
    ]
    image_labels_and_roles = _disambiguate_image_labels(
        image_nodes, workflow, downstream
    )

    for node_id in sorted(workflow):
        node = workflow[node_id]
        class_type = str(node.get("class_type", ""))
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        normalized = _norm(class_type)
        is_sampler = "sampler" in normalized or "ksampler" in normalized

        if any(marker in normalized for marker in NON_INPUT_NODE_MARKERS):
            continue

        if _is_infrastructure(class_type) and not (
            "loadimage" in normalized and "image" in inputs
        ):
            locked.append({"id": node_id, "class_type": class_type})
            continue

        # 1. Image input nodes
        if "loadimage" in normalized and isinstance(inputs.get("image"), str):
            label, role = image_labels_and_roles.get(node_id, ("Image", "image"))
            add(
                node_id,
                node,
                "image",
                kind="image",
                label=label,
                role=role,
                recommended=True,
            )
            continue

        # 2. ControlNet apply nodes (selective unlocking)
        is_controlnet_apply = any(
            m in normalized for m in ("applycontrolnet", "controlnetapply")
        )
        if is_controlnet_apply:
            for param in (
                "strength",
                "start_percent",
                "end_percent",
                "start_at",
                "end_at",
            ):
                val = inputs.get(param)
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    is_strength = param in ("strength", "weight")
                    min_v = 0.0
                    max_v = 2.0 if is_strength else 1.0
                    prefix = _meta_title(node) or "ControlNet"
                    add(
                        node_id,
                        node,
                        param,
                        kind="number",
                        label=f"{prefix} {_label(param)}",
                        numeric=True,
                        minimum=min_v,
                        maximum=max_v,
                        step=0.05,
                        role=f"controlnet_{param}",
                        recommended=True,
                    )

        # 3. IP-Adapter apply nodes (selective unlocking)
        is_ipadapter_apply = any(
            m in normalized
            for m in ("ipadapterapply", "applyipadapter", "ipadapterfaceid")
        )
        if is_ipadapter_apply:
            for param in (
                "weight",
                "noise",
                "start_at",
                "end_at",
                "start_percent",
                "end_percent",
            ):
                val = inputs.get(param)
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    is_weight = param == "weight"
                    min_v = 0.0
                    max_v = 2.0 if is_weight else 1.0
                    prefix = _meta_title(node) or "IP-Adapter"
                    add(
                        node_id,
                        node,
                        param,
                        kind="number",
                        label=f"{prefix} {_label(param)}",
                        numeric=True,
                        minimum=min_v,
                        maximum=max_v,
                        step=0.05,
                        role=f"ipadapter_{param}",
                        recommended=True,
                    )

        # 4. Sampler parameters
        if is_sampler:
            for input_name in sampler_fields:
                if input_name in inputs:
                    add_sampler_value(node_id, node, input_name, inputs[input_name])
            if "sampler_name" in inputs and isinstance(inputs["sampler_name"], str):
                curr = inputs["sampler_name"]
                opts = list(SAMPLER_NAMES)
                if curr not in opts:
                    opts.insert(0, curr)
                add(
                    node_id,
                    node,
                    "sampler_name",
                    kind="select",
                    label="Sampler",
                    value=curr,
                    options=opts,
                    role="sampler_name",
                    recommended=True,
                )
            if "scheduler" in inputs and isinstance(inputs["scheduler"], str):
                curr = inputs["scheduler"]
                opts = list(SCHEDULER_NAMES)
                if curr not in opts:
                    opts.insert(0, curr)
                add(
                    node_id,
                    node,
                    "scheduler",
                    kind="select",
                    label="Scheduler",
                    value=curr,
                    options=opts,
                    role="scheduler",
                    recommended=True,
                )
            continue

        # 4b. Modular Sampler Sub-nodes (CFGGuider, FluxGuidance, RandomNoise, Standalone Seed, Schedulers)
        is_guider = any(m in normalized for m in ("cfgguider", "dualcfgguider", "fluxguidance", "guidance"))
        if is_guider:
            for g_param in ("cfg", "guidance"):
                if g_param in inputs:
                    val = inputs[g_param]
                    if isinstance(val, (int, float)) and not isinstance(val, bool):
                        add(
                            node_id,
                            node,
                            g_param,
                            kind="number",
                            label="Guidance (CFG)" if g_param == "guidance" else "CFG Scale",
                            numeric=True,
                            minimum=0.0,
                            maximum=30.0,
                            step=0.1,
                            role="cfg",
                            recommended=True,
                            is_essential=True,
                        )

        is_noise_or_seed = any(m in normalized for m in ("randomnoise", "noise_randomnoise", "seed")) and not is_sampler
        if is_noise_or_seed:
            for s_param in ("noise_seed", "seed", "value"):
                if s_param in inputs:
                    add_sampler_value(node_id, node, s_param, inputs[s_param])

        is_scheduler_node = "scheduler" in normalized and not is_sampler
        if is_scheduler_node:
            if "steps" in inputs:
                add_sampler_value(node_id, node, "steps", inputs["steps"])
            if "denoise" in inputs:
                add_sampler_value(node_id, node, "denoise", inputs["denoise"])

        # 5. Dimensions. Empty-latent nodes (EmptyLatentImage,
        #    EmptyLTXVLatentVideo, …) own the output pixel size outright, and
        #    resize nodes (ImageResizeKJv2 and friends) do too once given a
        #    literal size. Both expose the same width/height controls; a resize
        #    node left at 0 means "inherit the source image", which is the
        #    documented way to say the user is not sizing anything.
        #
        #    Latent nodes are matched by class, not by _find_dimension_node:
        #    their width/height may link to bare Int primitives, which no single
        #    node can be sized through but which are still editable controls.
        #    A resize node only contributes when it *is* the chosen size target,
        #    so a graph that has both offers exactly one size pair.
        is_latent_dim = _is_latent_dimension_node(class_type) and (
            "width" in inputs or "height" in inputs
        )
        is_resize_dim = (
            not _is_latent_dimension_node(class_type)
            and node_id == dimension_node_id
        )
        if is_latent_dim or is_resize_dim:
            for input_name in ("width", "height"):
                raw_dim = inputs.get(input_name)
                if isinstance(raw_dim, (int, float)) and not isinstance(raw_dim, bool):
                    add(
                        node_id,
                        node,
                        input_name,
                        kind="number",
                        label=_label(input_name),
                        numeric=True,
                        minimum=64,
                        maximum=4096,
                        step=8,
                        role=input_name,
                        recommended=True,
                        is_essential=True,
                    )
                elif isinstance(raw_dim, list) and len(raw_dim) == 2 and isinstance(raw_dim[0], str):
                    src_node = workflow.get(raw_dim[0])
                    if isinstance(src_node, dict) and isinstance(src_node.get("inputs"), dict):
                        src_inputs = src_node["inputs"]
                        src_name = input_name if input_name in src_inputs else "value"
                        src_val = src_inputs.get(src_name)
                        if isinstance(src_val, (int, float)) and not isinstance(src_val, bool):
                            add(
                                raw_dim[0],
                                src_node,
                                src_name,
                                kind="number",
                                label=_label(input_name),
                                numeric=True,
                                minimum=64,
                                maximum=4096,
                                step=8,
                                role=input_name,
                                recommended=True,
                                is_essential=True,
                            )
            continue

        # 6. Upscaler nodes
        if any(
            u in normalized for u in ("upscale", "scale", "imagescale", "rescale")
        ) and not _is_infrastructure(class_type):
            if "upscale_method" in inputs and isinstance(inputs["upscale_method"], str):
                curr = inputs["upscale_method"]
                opts = list(UPSCALE_METHODS)
                if curr not in opts:
                    opts.insert(0, curr)
                add(
                    node_id,
                    node,
                    "upscale_method",
                    kind="select",
                    label="Upscale Method",
                    value=curr,
                    options=opts,
                    role="upscale_method",
                    recommended=True,
                )

        # 7. Video parameters
        is_video_node = any(m in normalized for m in VIDEO_NODE_MARKERS) or any(
            k in inputs for k in ("motion_bucket_id", "fps", "video_frames")
        )
        if is_video_node and not _is_infrastructure(class_type):
            if "fps" in inputs and isinstance(inputs["fps"], (int, float)) and not isinstance(inputs["fps"], bool):
                add(
                    node_id,
                    node,
                    "fps",
                    kind="number",
                    label="FPS",
                    numeric=True,
                    minimum=8,
                    maximum=60,
                    step=1,
                    role="fps",
                    recommended=True,
                )
            elif "frame_rate" in inputs and isinstance(inputs["frame_rate"], (int, float)) and not isinstance(inputs["frame_rate"], bool):
                add(
                    node_id,
                    node,
                    "frame_rate",
                    kind="number",
                    label="Frame Rate (FPS)",
                    numeric=True,
                    minimum=8,
                    maximum=60,
                    step=1,
                    role="fps",
                    recommended=True,
                )
            for frame_field in ("video_frames", "frame_count", "num_frames", "length"):
                if frame_field in inputs and isinstance(inputs[frame_field], (int, float)) and not isinstance(inputs[frame_field], bool):
                    add(
                        node_id,
                        node,
                        frame_field,
                        kind="number",
                        label="Frame Count",
                        numeric=True,
                        minimum=8,
                        maximum=120,
                        step=1,
                        role="frame_count",
                        recommended=True,
                    )
                    break
            if "motion_bucket_id" in inputs and isinstance(inputs["motion_bucket_id"], (int, float)) and not isinstance(inputs["motion_bucket_id"], bool):
                add(
                    node_id,
                    node,
                    "motion_bucket_id",
                    kind="number",
                    label="Motion Bucket ID",
                    numeric=True,
                    minimum=1,
                    maximum=255,
                    step=1,
                    role="motion_bucket",
                    recommended=True,
                )

        # 8. Text & Prompt nodes
        node_text = (normalized + " " + (_norm(_meta_title(node) or ""))).lower()
        is_negative = (
            any(neg in node_text for neg in ("negative", "neg", "bad"))
            or roles.get(node_id) == "Negative"
        )
        role_type = "negative_prompt" if is_negative else "prompt"
        polarity_label = "Negative Prompt" if is_negative else "Positive Prompt"
        meta = _meta_title(node)

        if normalized in {"cliptextencodesdxl", "cliptextencodesdxlrefiner"}:
            if "text_g" in inputs and isinstance(inputs["text_g"], str):
                add(
                    node_id,
                    node,
                    "text_g",
                    kind="prompt",
                    label=f"{meta or polarity_label} (CLIP G)",
                    role=role_type,
                    recommended=True,
                )
            if "text_l" in inputs and isinstance(inputs["text_l"], str):
                add(
                    node_id,
                    node,
                    "text_l",
                    kind="prompt",
                    label=f"{meta or polarity_label} (CLIP L)",
                    role=role_type,
                    recommended=True,
                )
            continue

        if normalized in TEXT_CLASSES and isinstance(inputs.get("text"), str):
            prompt_label = meta or (
                f"{roles[node_id]} prompt" if node_id in roles else polarity_label
            )
            add(
                node_id,
                node,
                "text",
                kind="prompt",
                label=prompt_label,
                role=role_type,
                recommended=True,
            )
            continue

        if normalized == "primitiveboolean":
            input_name = next(
                (name for name, value in inputs.items() if isinstance(value, bool)),
                None,
            )
            if input_name is not None:
                add(
                    node_id,
                    node,
                    input_name,
                    kind="boolean",
                    label=meta or _label(input_name),
                    role="boolean",
                    recommended=False,
                )
            continue

        if normalized == "primitivestringmultiline":
            input_name = next(
                (name for name, value in inputs.items() if isinstance(value, str)),
                None,
            )
            if input_name is not None:
                add(
                    node_id,
                    node,
                    input_name,
                    kind="text",
                    label=meta or _label(input_name),
                    role="text",
                    recommended=True,
                )
            continue

        # Custom wildcard, string or prompt nodes
        if (
            any(
                m in normalized
                for m in ("prompt", "string", "caption", "wildcard", "text")
            )
            and not _is_infrastructure(class_type)
        ):
            for input_name, val in inputs.items():
                if isinstance(val, str) and input_name.lower() in (
                    "text",
                    "prompt",
                    "value",
                    "string",
                    "caption",
                    "wildcard",
                    "clip_l",
                    "t5xxl",
                ):
                    is_prompt_kind = any(
                        pk in input_name.lower() or pk in normalized
                        for pk in ("prompt", "caption")
                    )
                    lbl = meta or _label(input_name)
                    add(
                        node_id,
                        node,
                        input_name,
                        kind="prompt" if is_prompt_kind else "text",
                        label=lbl,
                        role=role_type if is_prompt_kind else "text",
                        recommended=True,
                    )

    if not controls:
        raise AIToolError("Workflow contains no supported editable controls")
    return controls, locked


class AIToolService:
    """Owns immutable tool definitions and private output files."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.root = Path(self.settings.TOOLS_DIR).resolve()
        self.definitions = self.root / "definitions"
        self.outputs = self.root / "outputs"
        self.definitions.mkdir(parents=True, exist_ok=True)
        self.outputs.mkdir(parents=True, exist_ok=True)

    def _thumbnail_path(self, tool_id: str, filename: str = "thumbnail.png") -> Path:
        if not TOOL_ID_RE.fullmatch(tool_id) or Path(filename).name != filename:
            raise AIToolNotFound("Invalid tool thumbnail path")
        path = (self.root / "thumbnails" / tool_id / filename).resolve()
        try:
            path.relative_to(self.root.resolve())
        except ValueError as exc:
            raise AIToolNotFound("Invalid tool thumbnail path") from exc
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def thumbnail_path(self, tool_id: str) -> Path:
        record = self.get(tool_id)
        filename = record.get("thumbnail")
        if not isinstance(filename, str):
            raise AIToolNotFound("Tool thumbnail not found")
        path = self._thumbnail_path(tool_id, filename)
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise AIToolNotFound("Tool thumbnail not found")
        return path

    def thumbnail_url(
        self, tool_id: str, record: dict[str, Any] | None = None
    ) -> str | None:
        record = record or self.get(tool_id)
        filename = record.get("thumbnail")
        if not isinstance(filename, str):
            return None
        return f"{self.settings.FILES_PUBLIC_BASE}/api/tools/{tool_id}/thumbnail"

    def _path(self, tool_id: str) -> Path:
        if not TOOL_ID_RE.fullmatch(tool_id):
            raise AIToolNotFound("Invalid tool id")
        return self.definitions / f"{tool_id}.json"

    def _write_record(self, record: dict[str, Any]) -> None:
        path = self._path(record["tool_id"])
        temp = path.with_suffix(".tmp")
        temp.write_text(
            json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        temp.replace(path)

    @staticmethod
    def _safe_controls(
        workflow: Workflow,
    ) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
        locked = [
            {"id": node_id, "class_type": str(node.get("class_type", ""))}
            for node_id, node in sorted(workflow.items())
            if _is_infrastructure(str(node.get("class_type", "")))
        ]
        return [], locked

    def parse(
        self,
        payload: bytes,
        name: str = "Untitled tool",
        *,
        require_controls: bool = True,
    ) -> ToolParseResponse:
        try:
            workflow = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AIToolError("Workflow must be valid UTF-8 JSON") from exc
        if not isinstance(workflow, dict) or not workflow:
            raise AIToolError("Workflow must be a non-empty API-format object")
        if len(workflow) > MAX_NODES:
            raise AIToolError("Workflow contains too many nodes")
        for node_id, node in workflow.items():
            if not isinstance(node_id, str) or not node or len(node_id) > 128:
                raise AIToolError("Workflow node id is invalid")
            if (
                not isinstance(node, dict)
                or not isinstance(node.get("class_type"), str)
                or not isinstance(node.get("inputs"), dict)
            ):
                raise AIToolError(
                    "Workflow nodes must contain class_type and inputs objects"
                )
            if len(node["inputs"]) > MAX_INPUTS_PER_NODE:
                raise AIToolError("Workflow node has too many inputs")
            _validate_json_value(node)
        controls, locked = (
            extract_controls(workflow)
            if require_controls
            else self._safe_controls(workflow)
        )
        meta = detect_workflow_modality(workflow)
        tool_id = uuid.uuid4().hex
        clean_name = re.sub(r"\s+", " ", name.strip())[:120] or "Untitled tool"
        mode_val = (
            meta["detected_mode"].value
            if hasattr(meta["detected_mode"], "value")
            else str(meta["detected_mode"])
        )
        available_nodes: list[dict[str, Any]] = []
        for n_id, n_data in sorted(workflow.items()):
            c_type = str(n_data.get("class_type", ""))
            raw_inputs = n_data.get("inputs", {})
            if not isinstance(raw_inputs, dict):
                continue
            inputs_summary: list[dict[str, Any]] = []
            for inp_name, inp_val in raw_inputs.items():
                is_link = (
                    isinstance(inp_val, list)
                    and len(inp_val) == 2
                    and isinstance(inp_val[0], str)
                )
                if isinstance(inp_val, (int, float)) and not isinstance(inp_val, bool):
                    t_hint = "number"
                elif isinstance(inp_val, bool):
                    t_hint = "boolean"
                elif isinstance(inp_val, str):
                    t_hint = "string"
                else:
                    t_hint = "unknown"
                inputs_summary.append(
                    {
                        "name": inp_name,
                        "value": inp_val if not is_link else None,
                        "type_hint": t_hint,
                        "is_linked": is_link,
                        "options": [],
                    }
                )
            available_nodes.append(
                {
                    "id": n_id,
                    "class_type": c_type,
                    "title": _meta_title(n_data) or _label(c_type),
                    "inputs": inputs_summary,
                }
            )
        record = {
            "tool_id": tool_id,
            "name": clean_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "workflow": _copy(workflow),
            "controls": controls,
            "locked_nodes": locked,
            "mode": mode_val,
            "default_aspect_ratio": "1:1",
            "supported_aspect_ratios": list(ASPECT_DIMENSIONS),
            "detected_mode": mode_val,
            "detected_output_type": meta["detected_output_type"],
            "detected_inputs": meta["detected_inputs"],
            "archetype": meta["archetype"],
            "node_count": meta["node_count"],
            "prompt_binding": self._find_prompt_binding(workflow),
            "requires_image": meta["detected_mode"] in (ToolMode.IMAGE_TO_IMAGE, ToolMode.IMAGE_TO_VIDEO),
            "output_kind": meta["detected_output_type"],
            "is_draft": True,
            "available_nodes": available_nodes,
        }
        dim_binding = self._find_dimension_bindings(workflow)
        has_seed = any(c.get("seed") or c.get("role") == "seed" for c in controls)
        seed_id = next((c["id"] for c in controls if c.get("seed") or c.get("role") == "seed"), None)
        has_aspect_ratio = bool(dim_binding) or any(c.get("role") in {"width", "height"} for c in controls)
        width_id = next((c["id"] for c in controls if c.get("role") == "width" or c.get("input_name") == "width"), None)
        height_id = next((c["id"] for c in controls if c.get("role") == "height" or c.get("input_name") == "height"), None)
        has_cfg = any(c.get("role") == "cfg" or c.get("input_name") in {"cfg", "guidance"} for c in controls)
        cfg_id = next((c["id"] for c in controls if c.get("role") == "cfg" or c.get("input_name") in {"cfg", "guidance"}), None)
        has_steps = any(c.get("role") == "steps" or c.get("input_name") == "steps" for c in controls)
        steps_id = next((c["id"] for c in controls if c.get("role") == "steps" or c.get("input_name") == "steps"), None)
        essential_summary = {
            "has_seed": has_seed,
            "seed_control_id": seed_id,
            "has_aspect_ratio": has_aspect_ratio,
            "width_control_id": width_id,
            "height_control_id": height_id,
            "has_cfg": has_cfg,
            "cfg_control_id": cfg_id,
            "has_steps": has_steps,
            "steps_control_id": steps_id,
        }
        record["essential_summary"] = essential_summary
        self._write_record(record)
        return ToolParseResponse(
            tool_id=tool_id,
            name=clean_name,
            controls=controls,
            locked_nodes=locked,
            detected_mode=meta["detected_mode"],
            detected_output_type=meta["detected_output_type"],
            detected_inputs=meta["detected_inputs"],
            archetype=meta["archetype"],
            node_count=meta["node_count"],
            available_nodes=[ToolNodeInfo.model_validate(n) for n in available_nodes],
            essential_summary=essential_summary,
        )

    @staticmethod
    def _find_prompt_binding(workflow: Workflow) -> dict[str, str] | None:
        roles = _prompt_roles(workflow)
        for node_id, role in roles.items():
            if role == "Positive" and node_id in workflow:
                node = workflow[node_id]
                for text_field in ("text", "text_g", "prompt", "value"):
                    if isinstance(node.get("inputs", {}).get(text_field), str):
                        return {"node_id": node_id, "input_name": text_field}
        for node_id in sorted(workflow):
            node = workflow[node_id]
            normalized = _norm(str(node.get("class_type", "")))
            if any(k in normalized for k in ("cliptextencode", "prompt", "sdxl")):
                for text_field in ("text", "text_g", "prompt", "value"):
                    if isinstance(node.get("inputs", {}).get(text_field), str):
                        return {"node_id": node_id, "input_name": text_field}
        return None

    @staticmethod
    def _find_image_binding(workflow: Workflow) -> dict[str, str] | None:
        for node_id in sorted(workflow):
            node = workflow[node_id]
            if "loadimage" in _norm(str(node.get("class_type", ""))) and isinstance(
                node["inputs"].get("image"), str
            ):
                return {"node_id": node_id, "input_name": "image"}
        return None

    @staticmethod
    def _find_dimension_bindings(workflow: Workflow) -> dict[str, str]:
        """Find an optional server-controlled size target.

        Delegates to ``_find_dimension_node`` so the preset is applied to
        exactly the node whose width/height controls the UI exposes.
        """
        return _find_dimension_node(workflow)

    @staticmethod
    def _find_step_binding(workflow: Workflow) -> dict[str, str] | None:
        # Literal ``steps`` values keep the legacy scan as the no-terminal
        # fallback; linked primitives are also resolved so modular schedulers
        # (BasicScheduler fed by an Int node) bind to the editable source.
        fallback: list[tuple[str, str]] = []
        candidates: list[tuple[str, str]] = []
        for node_id in sorted(workflow):
            inputs = workflow[node_id].get("inputs", {})
            for input_name, value in inputs.items():
                if input_name.lower() != "steps":
                    continue
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    fallback.append((node_id, input_name))
                    candidates.append((node_id, input_name))
                elif isinstance(value, list) and len(value) == 2 and isinstance(
                    value[0], str
                ):
                    source = workflow.get(value[0], {})
                    source_inputs = source.get("inputs", {})
                    for source_param in ("steps", "value"):
                        source_value = source_inputs.get(source_param)
                        if isinstance(source_value, (int, float)) and not isinstance(
                            source_value, bool
                        ):
                            candidates.append((value[0], source_param))
                            break
        return _select_binding_candidate(
            workflow, candidates, "steps", fallback=fallback
        )

    @staticmethod
    def _find_seed_binding(workflow: Workflow) -> dict[str, str] | None:
        candidates: list[tuple[str, str]] = []
        for node_id in sorted(workflow):
            inputs = workflow[node_id].get("inputs", {})
            for s_name in ("seed", "noise_seed"):
                if s_name not in inputs:
                    continue
                val = inputs[s_name]
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    candidates.append((node_id, s_name))
                elif isinstance(val, list) and len(val) == 2 and isinstance(val[0], str):
                    src = workflow.get(val[0], {})
                    src_inputs = src.get("inputs", {})
                    for src_param in (s_name, "value"):
                        if (
                            src_param in src_inputs
                            and isinstance(src_inputs[src_param], (int, float))
                            and not isinstance(src_inputs[src_param], bool)
                        ):
                            candidates.append((val[0], src_param))
                            break
        return _select_binding_candidate(workflow, candidates, "seed")

    @staticmethod
    def _find_cfg_binding(workflow: Workflow) -> dict[str, str] | None:
        candidates: list[tuple[str, str]] = []
        for node_id in sorted(workflow):
            inputs = workflow[node_id].get("inputs", {})
            for g_name in ("cfg", "guidance"):
                if g_name not in inputs:
                    continue
                val = inputs[g_name]
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    candidates.append((node_id, g_name))
        return _select_binding_candidate(workflow, candidates, "cfg")

    def create(
        self,
        payload: bytes,
        name: str,
        mode: ToolMode | None = None,
        aspect_ratio: ToolAspectRatio = ToolAspectRatio.SQUARE,
        thumbnail_data: bytes | None = None,
        thumbnail_ext: str | None = None,
        custom_controls: list[ToolControl | dict[str, Any]] | None = None,
        user_id: str | None = None,
        author_username: str | None = None,
    ) -> ToolSummary:
        parsed = self.parse(payload, name, require_controls=(custom_controls is None))
        effective_mode = mode if mode is not None else parsed.detected_mode
        record = self.get(parsed.tool_id)
        workflow = record["workflow"]
        if custom_controls is not None:
            validated_controls: list[dict[str, Any]] = []
            for item in custom_controls:
                c_dict = (
                    item.model_dump() if hasattr(item, "model_dump") else dict(item)
                )
                node_id = c_dict.get("node_id")
                input_name = c_dict.get("input_name")
                if not node_id or node_id not in workflow:
                    raise AIToolError(
                        f"Custom control references invalid node_id: {node_id}"
                    )
                if not input_name or input_name not in workflow[node_id].get(
                    "inputs", {}
                ):
                    raise AIToolError(
                        f"Custom control references invalid input: {node_id}.{input_name}"
                    )
                path = c_dict.get("path") or f"nodes.{node_id}.inputs.{input_name}"
                c_dict["path"] = path
                c_dict["id"] = c_dict.get("id") or path
                if "default" not in c_dict and "value" in c_dict:
                    c_dict["default"] = c_dict["value"]
                if "value" not in c_dict and "default" in c_dict:
                    c_dict["value"] = c_dict["default"]
                if "min" not in c_dict and "minimum" in c_dict:
                    c_dict["min"] = c_dict["minimum"]
                if "minimum" not in c_dict and "min" in c_dict:
                    c_dict["minimum"] = c_dict["min"]
                if "max" not in c_dict and "maximum" in c_dict:
                    c_dict["max"] = c_dict["maximum"]
                if "maximum" not in c_dict and "max" in c_dict:
                    c_dict["maximum"] = c_dict["max"]
                validated_controls.append(c_dict)
            if not validated_controls:
                raise AIToolError("Tool must have at least one editable control")
            controls = validated_controls
            locked = parsed.locked_nodes
        else:
            controls, locked = extract_controls(workflow)
        record["controls"] = controls
        record["locked_nodes"] = locked
        prompt_binding = None
        for c in controls:
            if c.get("kind") == "prompt" or c.get("role") in {
                "prompt",
                "positive_prompt",
            }:
                prompt_binding = {
                    "node_id": c["node_id"],
                    "input_name": c["input_name"],
                    "id": c["id"],
                }
                break
        if prompt_binding is None:
            prompt_binding = self._find_prompt_binding(workflow)
        image_bindings = [
            {
                "node_id": control["node_id"],
                "input_name": control["input_name"],
                "id": control["id"],
            }
            for control in controls
            if control["kind"] == "image"
        ]
        dimension_bindings = self._find_dimension_bindings(workflow)
        step_binding = self._find_step_binding(workflow)
        requires_image = effective_mode in {ToolMode.IMAGE_TO_IMAGE, ToolMode.IMAGE_TO_VIDEO}
        if requires_image and not image_bindings:
            raise AIToolError("Image-based tools require a LoadImage input node")
        thumbnail_name = None
        if thumbnail_data is not None:
            if thumbnail_ext not in IMAGE_EXTENSIONS:
                raise AIToolError("Unsupported thumbnail image type")
            thumbnail_name = f"thumbnail{thumbnail_ext}"
            thumbnail_path = self._thumbnail_path(parsed.tool_id, thumbnail_name)
            temp = thumbnail_path.with_suffix(".tmp")
            try:
                temp.write_bytes(thumbnail_data)
                temp.replace(thumbnail_path)
            except OSError as exc:
                raise AIToolError("Could not save tool thumbnail") from exc
        has_seed = any(c.get("seed") or c.get("role") == "seed" for c in controls)
        seed_id = next((c["id"] for c in controls if c.get("seed") or c.get("role") == "seed"), None)
        has_aspect_ratio = bool(dimension_bindings) or any(c.get("role") in {"width", "height"} for c in controls)
        width_id = next((c["id"] for c in controls if c.get("role") == "width" or c.get("input_name") == "width"), None)
        height_id = next((c["id"] for c in controls if c.get("role") == "height" or c.get("input_name") == "height"), None)
        has_cfg = any(c.get("role") == "cfg" or c.get("input_name") in {"cfg", "guidance"} for c in controls)
        cfg_id = next((c["id"] for c in controls if c.get("role") == "cfg" or c.get("input_name") in {"cfg", "guidance"}), None)
        has_steps = any(c.get("role") == "steps" or c.get("input_name") == "steps" for c in controls)
        steps_id = next((c["id"] for c in controls if c.get("role") == "steps" or c.get("input_name") == "steps"), None)
        essential_summary = {
            "has_seed": has_seed,
            "seed_control_id": seed_id,
            "has_aspect_ratio": has_aspect_ratio,
            "width_control_id": width_id,
            "height_control_id": height_id,
            "has_cfg": has_cfg,
            "cfg_control_id": cfg_id,
            "has_steps": has_steps,
            "steps_control_id": steps_id,
        }
        record.update(
            {
                "is_draft": False,
                "mode": effective_mode.value if hasattr(effective_mode, "value") else str(effective_mode),
                "default_aspect_ratio": aspect_ratio.value,
                "supported_aspect_ratios": list(ASPECT_DIMENSIONS),
                "prompt_binding": prompt_binding,
                "image_bindings": image_bindings,
                "image_binding": image_bindings[0] if image_bindings else None,
                "step_binding": step_binding,
                "dimension_bindings": dimension_bindings,
                "requires_image": requires_image,
                "output_kind": "video"
                if effective_mode in {ToolMode.TEXT_TO_VIDEO, ToolMode.IMAGE_TO_VIDEO}
                else "image",
                "thumbnail": thumbnail_name,
                "essential_summary": essential_summary,
            }
        )
        if user_id is not None:
            record["user_id"] = user_id
        if author_username is not None:
            record["author_username"] = author_username
        self._write_record(record)
        return self._summary(record)

    def inject(self, tool_id: str, values: dict[str, Any]) -> dict[str, Any]:
        """Compatibility path for the legacy parser endpoint.

        New Tool Studio runs use ``build_graph`` and never accept arbitrary paths.
        """
        record = self.get(tool_id)
        controls = {control["path"]: control for control in record.get("controls", [])}
        graph = _copy(record["workflow"])
        for path, value in values.items():
            control = controls.get(path)
            if control is None:
                raise AIToolError(f"Unknown or locked control: {path}")
            if isinstance(value, bool) or not isinstance(value, (str, int, float)):
                raise AIToolError(f"Invalid value for {path}")
            if isinstance(value, float) and not math.isfinite(value):
                raise AIToolError(f"Invalid value for {path}")
            minimum = control.get("minimum")
            maximum = control.get("maximum")
            if minimum is not None and value < minimum:
                raise AIToolError(f"Value below minimum for {path}")
            if maximum is not None and value > maximum:
                raise AIToolError(f"Value above maximum for {path}")
            if control.get("numeric"):
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    raise AIToolError(f"Value must be numeric for {path}")
                if isinstance(value, float) and not value.is_integer():
                    raise AIToolError(f"Value must be an integer for {path}")
                step = control.get("step")
                if step == 8 and int(value) % 8:
                    raise AIToolError(f"Value must be divisible by 8 for {path}")
            node_id = control["node_id"]
            input_name = control["input_name"]
            if control.get("seed") and value == -1:
                value = random.randint(0, 2**32 - 1)
            graph[node_id]["inputs"][input_name] = value
        return graph

    def get(self, tool_id: str) -> dict[str, Any]:
        path = self._path(tool_id)
        if not path.is_file():
            raise AIToolNotFound("Tool not found")
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise AIToolError("Stored tool is unreadable") from exc
        if record.get("tool_id") != tool_id or not isinstance(
            record.get("workflow"), dict
        ):
            raise AIToolError("Stored tool is invalid")
        return record

    def delete(self, tool_id: str) -> bool:
        """Atomically delete a tool definition, thumbnails, and generated outputs."""
        if not TOOL_ID_RE.fullmatch(tool_id):
            raise AIToolNotFound("Invalid tool id")
        path = self._path(tool_id)
        if not path.is_file():
            raise AIToolNotFound("Tool not found")
        try:
            path.unlink()
        except OSError as exc:
            raise AIToolError("Could not delete tool definition") from exc

        # Clean up thumbnails directory if exists
        thumb_dir = self.root / "thumbnails" / tool_id
        if thumb_dir.is_dir():
            shutil.rmtree(thumb_dir, ignore_errors=True)

        # Clean up outputs directory if exists
        output_dir = self.outputs / tool_id
        if output_dir.is_dir():
            shutil.rmtree(output_dir, ignore_errors=True)

        return True

    def _summary(self, record: dict[str, Any]) -> ToolSummary:
        return ToolSummary(
            tool_id=record["tool_id"],
            name=record["name"],
            mode=record["mode"],
            default_aspect_ratio=record["default_aspect_ratio"],
            requires_image=bool(record.get("requires_image")),
            has_prompt=record.get("prompt_binding") is not None,
            created_at=record["created_at"],
            thumbnail_url=self.thumbnail_url(record["tool_id"], record),
            user_id=record.get("user_id"),
            author_username=record.get("author_username"),
        )

    def list_public(self, user_id: str | None = None) -> list[ToolSummary]:
        items: list[ToolSummary] = []
        for path in self.definitions.glob("*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                if record.get("is_draft"):
                    continue
                if user_id and record.get("user_id") != user_id:
                    continue
                if record.get("mode") and record.get("default_aspect_ratio"):
                    items.append(self._summary(record))
            except (OSError, json.JSONDecodeError, KeyError, ValueError):
                continue
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def detail(self, tool_id: str) -> ToolDetail:
        record = self.get(tool_id)
        workflow = record.get("workflow")
        multiple = (
            _required_dimension_multiple(workflow)
            if isinstance(workflow, dict)
            else DEFAULT_DIMENSION_MULTIPLE
        )
        return ToolDetail(
            **self._summary(record).model_dump(),
            supported_aspect_ratios=record.get(
                "supported_aspect_ratios", list(ASPECT_DIMENSIONS)
            ),
            output_kind=record.get("output_kind", "image"),
            controls=record.get("controls", []),
            essential_summary=record.get("essential_summary"),
            aspect_dimensions={
                ratio: [width, height]
                for ratio, (width, height) in ASPECT_DIMENSIONS.items()
            },
            dimension_multiple=multiple,
        )

    def build_graph(
        self,
        tool_id: str,
        prompt: str,
        aspect_ratio: ToolAspectRatio,
        image_filename: str | None = None,
        values: dict[str, Any] | None = None,
        images: dict[str, str] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        record = self.get(tool_id)
        graph = _copy(record["workflow"])
        submitted = dict(values or {})
        controls = {control["id"]: control for control in record.get("controls", [])}
        unknown = set(submitted) - set(controls)
        if unknown:
            raise AIToolError(f"Unknown or locked control: {sorted(unknown)[0]}")
        submitted_images = dict(images or {})
        unknown_images = set(submitted_images) - set(controls)
        if unknown_images:
            raise AIToolError(
                f"Unknown or locked image control: {sorted(unknown_images)[0]}"
            )
        non_image_values = set(submitted_images) - {
            control_id
            for control_id, control in controls.items()
            if control["kind"] == "image"
        }
        if non_image_values:
            raise AIToolError(f"Invalid image control: {sorted(non_image_values)[0]}")
        if prompt and record.get("prompt_binding"):
            binding = record["prompt_binding"]
            submitted[
                binding["id"]
                if "id" in binding
                else f"nodes.{binding['node_id']}.inputs.{binding['input_name']}"
            ] = prompt
        for control in record.get("controls", []):
            control_id = control["id"]
            if control["kind"] == "image":
                filename = submitted_images.get(control_id)
                if filename:
                    graph[control["node_id"]]["inputs"][control["input_name"]] = (
                        filename
                    )
                continue
            if control_id not in submitted:
                continue
            value = submitted[control_id]
            if control["kind"] in {"number", "seed"}:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise AIToolError(f"Invalid numeric value for {control_id}")
                if isinstance(value, float) and not math.isfinite(value):
                    raise AIToolError(f"Invalid numeric value for {control_id}")
                if control.get("minimum") is not None and value < control["minimum"]:
                    raise AIToolError(f"Value below minimum for {control_id}")
                if control.get("maximum") is not None and value > control["maximum"]:
                    raise AIToolError(f"Value above maximum for {control_id}")
                if control.get("step") == 8 and int(value) % 8:
                    raise AIToolError(f"Value must be divisible by 8 for {control_id}")
            if control["kind"] == "select" and value not in control.get("options", []):
                raise AIToolError(f"Invalid option for {control_id}")
            if control["kind"] == "boolean" and not isinstance(value, bool):
                raise AIToolError(f"Invalid boolean value for {control_id}")
            if control["kind"] in {"text", "prompt"} and (
                not isinstance(value, str) or len(value) > MAX_STRING_LENGTH
            ):
                raise AIToolError(f"Invalid text value for {control_id}")
            if control.get("seed") and value == -1:
                value = random.randint(0, 2**32 - 1)
            graph[control["node_id"]]["inputs"][control["input_name"]] = value
        if image_filename:
            binding = record.get("image_binding")
            if binding:
                graph[binding["node_id"]]["inputs"][binding["input_name"]] = (
                    image_filename
                )
        dimensions = ASPECT_DIMENSIONS.get(aspect_ratio.value)
        if not dimensions:
            raise AIToolError("Unsupported aspect ratio")
        dimension = record.get("dimension_bindings") or {}
        if not dimension:
            # Records written before bindings were persisted still expose
            # width/height controls. Point the preset at the node those
            # controls describe, so the reported size is the graph's size in
            # both directions: an explicit override wins, and an untouched tool
            # still receives its preset instead of silently keeping old values.
            width_control = next(
                (
                    control
                    for control in record.get("controls", [])
                    if control.get("role") == "width"
                ),
                None,
            )
            height_control = next(
                (
                    control
                    for control in record.get("controls", [])
                    if control.get("role") == "height"
                ),
                None,
            )
            if (
                width_control
                and height_control
                and width_control["node_id"] == height_control["node_id"]
                and width_control["input_name"] == "width"
                and height_control["input_name"] == "height"
            ):
                dimension = {
                    "node_id": width_control["node_id"],
                    "width": "width",
                    "height": "height",
                }
        dimension_overridden = False
        if dimension:
            dimension_overridden = any(
                control["node_id"] == dimension["node_id"]
                and control["input_name"] in {dimension["width"], dimension["height"]}
                and control["id"] in submitted
                for control in record.get("controls", [])
            )
            if not dimension_overridden:
                (
                    graph[dimension["node_id"]]["inputs"][dimension["width"]],
                    graph[dimension["node_id"]]["inputs"][dimension["height"]],
                ) = dimensions
            resolved_dimensions = (
                graph[dimension["node_id"]]["inputs"][dimension["width"]],
                graph[dimension["node_id"]]["inputs"][dimension["height"]],
            )
        else:
            resolved_dimensions = dimensions
        # Latent-space models reject off-grid sizes: LTX-Video needs multiples
        # of 32, everything else at least ComfyUI's 8, including explicit
        # width/height control overrides.
        snapped_dimensions = _snap_dimensions(
            resolved_dimensions[0],
            resolved_dimensions[1],
            _required_dimension_multiple(graph),
        )
        if dimension and snapped_dimensions != resolved_dimensions:
            graph[dimension["node_id"]]["inputs"][dimension["width"]] = (
                snapped_dimensions[0]
            )
            graph[dimension["node_id"]]["inputs"][dimension["height"]] = (
                snapped_dimensions[1]
            )
        resolved_dimensions = snapped_dimensions
        return graph, {
            "width": resolved_dimensions[0],
            "height": resolved_dimensions[1],
            "seed": None,
        }

    async def save_output(
        self,
        data: bytes,
        tool_id: str,
        prompt_id: str,
        filename: str,
        metadata: dict[str, Any],
    ) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix not in IMAGE_EXTENSIONS:
            raise AIToolError("Tool output is not an approved image type")
        safe_prompt = re.sub(r"[^a-zA-Z0-9_-]", "", prompt_id)[:80] or "result"
        dest_dir = self.outputs / tool_id / safe_prompt
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{uuid.uuid4().hex[:12]}{suffix}"
        dest.write_bytes(data)
        dest.with_suffix(dest.suffix + ".json").write_text(
            json.dumps(metadata, ensure_ascii=False), encoding="utf-8"
        )
        relative = dest.relative_to(self.outputs).as_posix()
        return f"{self.settings.FILES_PUBLIC_BASE}/api/tools/{tool_id}/files/{relative}"

    def output_path(self, tool_id: str, relative_path: str) -> Path:
        if not TOOL_ID_RE.fullmatch(tool_id):
            raise AIToolNotFound("Invalid tool id")
        root = (self.outputs / tool_id).resolve()
        path = (root / relative_path).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise AIToolNotFound("Invalid tool output path") from exc
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise AIToolNotFound("Tool output not found")
        return path


_ai_tool_service: Optional[AIToolService] = None


def get_ai_tool_service(settings: Optional[Settings] = None) -> AIToolService:
    global _ai_tool_service
    if settings is not None:
        return AIToolService(settings)
    if _ai_tool_service is None:
        _ai_tool_service = AIToolService()
    return _ai_tool_service


def set_ai_tool_service(service: Optional[AIToolService]) -> None:
    global _ai_tool_service
    _ai_tool_service = service


AIToolStorage = AIToolService

__all__ = [
    "ASPECT_DIMENSIONS",
    "AIToolError",
    "AIToolNotFound",
    "AIToolService",
    "AIToolStorage",
    "extract_controls",
    "get_ai_tool_service",
    "set_ai_tool_service",
]
