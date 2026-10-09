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
from typing import Any

from ..config import Settings, get_settings
from ..schemas import (
    ToolAspectRatio,
    ToolControl,
    ToolDetail,
    ToolMode,
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
ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
    "4:3": (1152, 864),
    "21:9": (1536, 656),
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
    "randomnoise",
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
    ) -> None:
        path = f"nodes.{node_id}.inputs.{input_name}"
        raw = node.get("inputs", {}).get(input_name)
        if path in seen or isinstance(raw, list):
            return
        val = raw if value is None else value
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

        # 5. EmptyLatent dimensions
        if "emptylatent" in normalized:
            for input_name in ("width", "height"):
                if isinstance(inputs.get(input_name), (int, float)) and not isinstance(
                    inputs[input_name], bool
                ):
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
        tool_id = uuid.uuid4().hex
        clean_name = re.sub(r"\s+", " ", name.strip())[:120] or "Untitled tool"
        record = {
            "tool_id": tool_id,
            "name": clean_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "workflow": _copy(workflow),
            "controls": controls,
            "locked_nodes": locked,
        }
        self._write_record(record)
        return ToolParseResponse(
            tool_id=tool_id, name=clean_name, controls=controls, locked_nodes=locked
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
        """Find an optional server-controlled latent/video size target."""
        for node_id in sorted(workflow):
            node = workflow[node_id]
            normalized = _norm(str(node.get("class_type", "")))
            inputs = node["inputs"]
            if (
                "latent" in normalized
                and "width" in inputs
                and "height" in inputs
                and isinstance(inputs["width"], (int, float))
                and isinstance(inputs["height"], (int, float))
            ):
                return {"node_id": node_id, "width": "width", "height": "height"}
        return {}

    @staticmethod
    def _find_step_binding(workflow: Workflow) -> dict[str, str] | None:
        for node_id in sorted(workflow):
            inputs = workflow[node_id]["inputs"]
            for input_name, value in inputs.items():
                if (
                    input_name.lower() == "steps"
                    and isinstance(value, (int, float))
                    and not isinstance(value, bool)
                ):
                    return {"node_id": node_id, "input_name": input_name}
        return None

    def create(
        self,
        payload: bytes,
        name: str,
        mode: ToolMode,
        aspect_ratio: ToolAspectRatio,
        thumbnail_data: bytes | None = None,
        thumbnail_ext: str | None = None,
        custom_controls: list[ToolControl | dict[str, Any]] | None = None,
    ) -> ToolSummary:
        parsed = self.parse(payload, name, require_controls=(custom_controls is None))
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
        requires_image = mode in {ToolMode.IMAGE_TO_IMAGE, ToolMode.IMAGE_TO_VIDEO}
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
        record.update(
            {
                "mode": mode.value,
                "default_aspect_ratio": aspect_ratio.value,
                "supported_aspect_ratios": list(ASPECT_DIMENSIONS),
                "prompt_binding": prompt_binding,
                "image_bindings": image_bindings,
                "image_binding": image_bindings[0] if image_bindings else None,
                "step_binding": step_binding,
                "dimension_bindings": dimension_bindings,
                "requires_image": requires_image,
                "output_kind": "video"
                if mode in {ToolMode.TEXT_TO_VIDEO, ToolMode.IMAGE_TO_VIDEO}
                else "image",
                "thumbnail": thumbnail_name,
            }
        )
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
        )

    def list_public(self) -> list[ToolSummary]:
        items: list[ToolSummary] = []
        for path in self.definitions.glob("*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                if record.get("mode") and record.get("default_aspect_ratio"):
                    items.append(self._summary(record))
            except (OSError, json.JSONDecodeError, KeyError, ValueError):
                continue
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def detail(self, tool_id: str) -> ToolDetail:
        record = self.get(tool_id)
        return ToolDetail(
            **self._summary(record).model_dump(),
            supported_aspect_ratios=record.get(
                "supported_aspect_ratios", list(ASPECT_DIMENSIONS)
            ),
            output_kind=record.get("output_kind", "image"),
            controls=record.get("controls", []),
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


def get_ai_tool_service() -> AIToolService:
    return AIToolService()


__all__ = [
    "ASPECT_DIMENSIONS",
    "AIToolError",
    "AIToolNotFound",
    "AIToolService",
    "extract_controls",
    "get_ai_tool_service",
]
