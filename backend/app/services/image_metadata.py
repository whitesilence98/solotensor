"""Image generation metadata extraction service.

Extracts generation prompts, negative prompts, sampling parameters (seed, steps, CFG,
dimensions, sampler, model) from PNG text chunks (tEXt/iTXt/zTXt), ComfyUI graphs,
NovelAI/Fooocus comments, and EXIF UserComment/ImageDescription tags.
"""

from __future__ import annotations

import io
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class ExtractedMetadata:
    has_metadata: bool = False
    source: Optional[str] = None  # "a1111", "comfyui", "novelai", "fooocus", "exif"
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    steps: Optional[int] = None
    cfg: Optional[float] = None
    sampler_name: Optional[str] = None
    scheduler: Optional[str] = None
    model_name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    raw_parameters: Optional[str] = None
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "has_metadata": self.has_metadata,
            "source": self.source,
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
            "seed": self.seed,
            "steps": self.steps,
            "cfg": self.cfg,
            "sampler_name": self.sampler_name,
            "scheduler": self.scheduler,
            "model_name": self.model_name,
            "width": self.width,
            "height": self.height,
            "raw_parameters": self.raw_parameters,
        }


def tokenize_prompt_to_tags(prompt_text: Optional[str]) -> list[str]:
    """Tokenize a natural language or comma-separated prompt into clean Danbooru/tag keywords."""
    if not prompt_text:
        return []
    tags: list[str] = []
    seen: set[str] = set()
    # Split by comma or newline
    chunks = re.split(r"[,;\n]+", prompt_text)
    for raw in chunks:
        # Strip A1111 weights like (masterpiece:1.2) or [blur:0.8]
        cleaned = re.sub(r"[\(\)\[\]\{\}]", "", raw)
        cleaned = re.sub(r":\s*[-+]?[0-9]*\.?[0-9]+", "", cleaned)
        tag = cleaned.strip().replace("_", " ").lower()
        if tag and len(tag) > 1 and tag not in seen:
            seen.add(tag)
            tags.append(tag)
    return tags


def _parse_a1111_parameters(text: str) -> ExtractedMetadata:
    """Parse standard Automatic1111 / WebUI parameters text block."""
    pos = text
    neg: Optional[str] = None
    params: dict[str, str] = {}

    if "Negative prompt:" in text:
        parts = text.split("Negative prompt:", 1)
        pos = parts[0].strip()
        rest = parts[1]
    else:
        rest = ""

    if "Steps:" in rest:
        neg_parts = rest.split("Steps:", 1)
        neg = neg_parts[0].strip()
        param_str = "Steps:" + neg_parts[1]
    elif "Steps:" in pos:
        pos_parts = pos.split("Steps:", 1)
        pos = pos_parts[0].strip()
        param_str = "Steps:" + pos_parts[1]
    else:
        param_str = rest

    # Match key-value parameters e.g. "Steps: 20, Sampler: Euler a, CFG scale: 7, Seed: 12345"
    for match in re.finditer(r"([A-Za-z\s]+):\s*([^,]+)(?:,|$)", param_str):
        k, v = match.group(1).strip(), match.group(2).strip()
        params[k] = v

    steps = int(params["Steps"]) if "Steps" in params and params["Steps"].isdigit() else None
    cfg = float(params["CFG scale"]) if "CFG scale" in params and re.match(r"^[\d\.]+$", params["CFG scale"]) else None
    seed = int(params["Seed"]) if "Seed" in params and params["Seed"].isdigit() else None
    sampler = params.get("Sampler") or None
    scheduler = params.get("Schedule type") or params.get("Scheduler") or None
    model = params.get("Model") or None

    width, height = None, None
    if "Size" in params and "x" in params["Size"]:
        size_parts = params["Size"].split("x")
        if len(size_parts) == 2 and size_parts[0].isdigit() and size_parts[1].isdigit():
            width, height = int(size_parts[0]), int(size_parts[1])

    return ExtractedMetadata(
        has_metadata=True,
        source="a1111",
        prompt=pos or None,
        negative_prompt=neg or None,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler_name=sampler,
        scheduler=scheduler,
        model_name=model,
        width=width,
        height=height,
        raw_parameters=text,
        tags=tokenize_prompt_to_tags(pos),
    )


def _parse_comfyui_prompt(prompt_json_str: str) -> ExtractedMetadata:
    """Parse ComfyUI prompt JSON graph nodes."""
    try:
        graph = json.loads(prompt_json_str)
        if not isinstance(graph, dict):
            return ExtractedMetadata(has_metadata=False)
    except Exception:
        return ExtractedMetadata(has_metadata=False)

    pos_candidates: list[str] = []
    neg_candidates: list[str] = []
    seed: Optional[int] = None
    steps: Optional[int] = None
    cfg: Optional[float] = None
    sampler: Optional[str] = None
    scheduler: Optional[str] = None
    model_name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None

    for nid, node in graph.items():
        if not isinstance(node, dict):
            continue
        ctype = node.get("class_type", "")
        inputs = node.get("inputs", {})
        meta = node.get("_meta", {})
        title = meta.get("title", "").lower()

        # Text encode / prompt nodes
        if ctype in ("CLIPTextEncode", "CR Prompt Text", "ShowText", "Text Multiline") or "prompt" in title:
            text_val = inputs.get("text") or inputs.get("prompt")
            if isinstance(text_val, str) and text_val.strip() and not text_val.startswith("["):
                clean_text = text_val.strip()
                if "neg" in title or "negative" in title:
                    neg_candidates.append(clean_text)
                else:
                    pos_candidates.append(clean_text)

        # Sampler nodes
        if "sampler" in ctype.lower() or ctype in ("KSampler", "KSamplerAdvanced", "ClownsharKSampler_Beta"):
            if "seed" in inputs and isinstance(inputs["seed"], int):
                seed = inputs["seed"]
            elif "noise_seed" in inputs and isinstance(inputs["noise_seed"], int):
                seed = inputs["noise_seed"]

            if "steps" in inputs and isinstance(inputs["steps"], int):
                steps = inputs["steps"]
            if "cfg" in inputs and isinstance(inputs["cfg"], (int, float)):
                cfg = float(inputs["cfg"])
            if "sampler_name" in inputs and isinstance(inputs["sampler_name"], str):
                sampler = inputs["sampler_name"]
            if "scheduler" in inputs and isinstance(inputs["scheduler"], str):
                scheduler = inputs["scheduler"]

        # Empty Latent Image
        if ctype == "EmptyLatentImage":
            if "width" in inputs and isinstance(inputs["width"], int):
                width = inputs["width"]
            if "height" in inputs and isinstance(inputs["height"], int):
                height = inputs["height"]

        # Model Loaders
        if ctype in ("UNETLoader", "CheckpointLoaderSimple"):
            m_val = inputs.get("unet_name") or inputs.get("ckpt_name")
            if isinstance(m_val, str):
                model_name = m_val

    # Resolve primary prompt & negative
    pos = " ".join(pos_candidates).strip() if pos_candidates else None
    neg = " ".join(neg_candidates).strip() if neg_candidates else None

    if not pos and not neg and seed is None:
        return ExtractedMetadata(has_metadata=False)

    return ExtractedMetadata(
        has_metadata=True,
        source="comfyui",
        prompt=pos,
        negative_prompt=neg,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler_name=sampler,
        scheduler=scheduler,
        model_name=model_name,
        width=width,
        height=height,
        raw_parameters=prompt_json_str,
        tags=tokenize_prompt_to_tags(pos),
    )


def _parse_novelai_comment(comment_json_str: str) -> ExtractedMetadata:
    """Parse NovelAI / Fooocus Comment JSON string."""
    try:
        data = json.loads(comment_json_str)
        if not isinstance(data, dict):
            return ExtractedMetadata(has_metadata=False)
    except Exception:
        return ExtractedMetadata(has_metadata=False)

    pos = data.get("prompt") or data.get("positive")
    neg = data.get("uc") or data.get("negative") or data.get("negative_prompt")
    steps = data.get("steps")
    cfg = data.get("scale") or data.get("cfg")
    seed = data.get("seed")

    if not pos and not neg and seed is None:
        return ExtractedMetadata(has_metadata=False)

    return ExtractedMetadata(
        has_metadata=True,
        source="novelai" if "uc" in data else "fooocus",
        prompt=str(pos) if pos else None,
        negative_prompt=str(neg) if neg else None,
        seed=int(seed) if seed is not None and str(seed).isdigit() else None,
        steps=int(steps) if steps is not None and str(steps).isdigit() else None,
        cfg=float(cfg) if cfg is not None else None,
        raw_parameters=comment_json_str,
        tags=tokenize_prompt_to_tags(pos),
    )


def extract_image_metadata(image_bytes: bytes) -> ExtractedMetadata:
    """Inspect and extract generation metadata from PNG/EXIF/WebP image bytes."""
    if not image_bytes:
        return ExtractedMetadata(has_metadata=False)

    try:
        im = Image.open(io.BytesIO(image_bytes))
    except Exception as exc:
        logger.debug("PIL failed to parse image bytes for metadata: %s", exc)
        return ExtractedMetadata(has_metadata=False)

    info = getattr(im, "info", {})

    # 1. Automatic1111 / WebUI "parameters" chunk (also used by ComfyUI ImageSaver)
    if "parameters" in info and isinstance(info["parameters"], (str, bytes)):
        param_str = info["parameters"]
        if isinstance(param_str, bytes):
            param_str = param_str.decode("utf-8", errors="ignore")
        if param_str.strip():
            return _parse_a1111_parameters(param_str)

    # 2. ComfyUI "prompt" JSON chunk
    if "prompt" in info and isinstance(info["prompt"], (str, bytes)):
        prompt_str = info["prompt"]
        if isinstance(prompt_str, bytes):
            prompt_str = prompt_str.decode("utf-8", errors="ignore")
        if prompt_str.strip():
            res = _parse_comfyui_prompt(prompt_str)
            if res.has_metadata:
                return res

    # 3. NovelAI / Fooocus "Comment" chunk
    if "Comment" in info and isinstance(info["Comment"], (str, bytes)):
        comment_str = info["Comment"]
        if isinstance(comment_str, bytes):
            comment_str = comment_str.decode("utf-8", errors="ignore")
        if comment_str.strip():
            res = _parse_novelai_comment(comment_str)
            if res.has_metadata:
                return res

    # 4. EXIF UserComment / ImageDescription
    exif = getattr(im, "getexif", None)
    if callable(exif):
        try:
            exif_dict = im.getexif()
            # 0x9286 = UserComment, 0x010E = ImageDescription
            for tag_id in (0x9286, 0x010E):
                val = exif_dict.get(tag_id)
                if isinstance(val, bytes):
                    val = val.decode("utf-8", errors="ignore")
                if isinstance(val, str) and val.strip():
                    if "Steps:" in val or "Negative prompt:" in val:
                        return _parse_a1111_parameters(val)
                    if val.strip().startswith("{") and val.strip().endswith("}"):
                        res = _parse_novelai_comment(val)
                        if res.has_metadata:
                            return res
        except Exception:
            pass

    return ExtractedMetadata(has_metadata=False)
