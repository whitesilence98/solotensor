"""Select and patch workflows for the modular SoloTensor generation pipeline.

Workflow components:
  1. Base T2I (Stage 1): workflow_generate_t2i.json (17 nodes)
  2. SeedVR2 Upscaler (Stage 2): workflow_seedvr_upscaler.json (5 nodes)
  3. Cascading Detailer (Stage 3): workflow_detailer.json (26 nodes)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional, Set, TYPE_CHECKING

from .workflow_bypass import apply_t2i_pipeline, apply_detailer_pipeline

if TYPE_CHECKING:
    from ..schemas import GenerateRequest, UpscaleConfig, DetailerConfig

logger = logging.getLogger(__name__)
WORKFLOW_DIR = Path(__file__).resolve().parents[2] / "workflows"
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures"


def load_workflow(name: str) -> dict[str, Any]:
    """Load a workflow JSON from backend/workflows or test fixtures fallback."""
    for base in [WORKFLOW_DIR, FIXTURES_DIR]:
        path = base / name
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"Could not load workflow from {path.name}: {exc}") from exc
    raise FileNotFoundError(f"Workflow file '{name}' not found in {WORKFLOW_DIR} or {FIXTURES_DIR}")


def select_workflow(req: "GenerateRequest") -> dict[str, Any]:
    """Return the loaded base T2I workflow graph dict for the given request config."""
    for candidate in ["workflow_generate_t2i.json", "workflow_api.json"]:
        try:
            return load_workflow(candidate)
        except (FileNotFoundError, RuntimeError):
            continue
    raise RuntimeError("Could not find a valid base T2I workflow template")


def build_enabled_features(req: "GenerateRequest") -> set[str]:
    """Build the set of feature names to pass to BypassEngine.apply()."""
    features: set[str] = set()

    if req.upscale and req.upscale.enabled:
        features.add("upscale_seedvr2")

    if (req.detailer and req.detailer.enabled) or req.enable_detailer:
        if not req.detailer or not req.detailer.items:
            features.update(
                {
                    "detailer_face",
                    "detailer_foot",
                    "detailer_breast",
                    "detailer_hand",
                    "detailer_vagina",
                }
            )
        else:
            for item in req.detailer.items:
                if item.enabled and item.type in ("face", "foot", "breast", "hand", "vagina"):
                    features.add(f"detailer_{item.type}")

    return features


def patch_base_t2i_workflow(
    template: dict[str, Any],
    *,
    prompt: str,
    negative_prompt: str = "",
    seed: Optional[int] = None,
    steps: int = 10,
    image_count: int = 1,
    width: int = 768,
    height: int = 1344,
    unet_name: str = "krea2\\krea2_turbo_fp8_scaled.safetensors",
    clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
    clip_type: str = "krea2",
    vae_name: str = "wan_2.1_vae.safetensors",
    loras: Optional[list[dict[str, Any]]] = None,
    source_image_filename: Optional[str] = None,
    denoise: float = 1.0,
) -> dict[str, Any]:
    """Patch standard generator nodes in workflow_generate_t2i.json (supporting both T2I and Img2Img)."""
    graph = json.loads(json.dumps(template))

    # 1. Prompt & Negative Prompt
    if "1051" in graph:
        graph["1051"].setdefault("inputs", {})["prompt"] = prompt
    if "1050" in graph:
        graph["1050"].setdefault("inputs", {})["text"] = negative_prompt

    # 2. Seed
    final_seed = int(seed if seed is not None and seed >= 0 else 0)
    if "1052" in graph:
        graph["1052"].setdefault("inputs", {})["seed"] = final_seed
    if "1056" in graph:
        graph["1056"].setdefault("inputs", {})["noise_seed"] = final_seed

    # 3. Steps
    if "1055" in graph:
        graph["1055"].setdefault("inputs", {})["value"] = int(steps)

    # 4. Latent Image / Img2Img Source
    if source_image_filename:
        # Img2Img Mode: Replace EmptyLatentImage (1054) with LoadImage and VAEEncode
        graph.pop("1054", None)
        graph["1054_load"] = {
            "class_type": "LoadImage",
            "inputs": {"image": str(source_image_filename)},
            "_meta": {"title": "Load Img2Img Source"},
        }
        graph["1054_encode"] = {
            "class_type": "VAEEncode",
            "inputs": {
                "pixels": ["1054_load", 0],
                "vae": ["1060:617", 0],
            },
            "_meta": {"title": "VAE Encode Img2Img"},
        }
        if "1056" in graph:
            graph["1056"].setdefault("inputs", {})["latent_image"] = ["1054_encode", 0]
            start_step = int(steps * (1.0 - max(0.01, min(1.0, denoise))))
            graph["1056"]["inputs"]["start_at_step"] = max(0, min(steps - 1, start_step))
        if "1059" in graph:
            graph["1059"].setdefault("inputs", {})["denoise"] = float(denoise)
    elif "1054" in graph:
        inputs = graph["1054"].setdefault("inputs", {})
        inputs["width"] = int(width)
        inputs["height"] = int(height)
        inputs["batch_size"] = int(image_count)

    # 5. Model Loaders
    if "1060:615" in graph:
        graph["1060:615"].setdefault("inputs", {})["unet_name"] = unet_name
    if "1060:616" in graph:
        inputs = graph["1060:616"].setdefault("inputs", {})
        inputs["clip_name"] = clip_name
        inputs["type"] = clip_type
    if "1060:617" in graph:
        graph["1060:617"].setdefault("inputs", {})["vae_name"] = vae_name

    # 6. LoRAs (rgthree Power Lora Loader)
    if "1061" in graph:
        lora_inputs = graph["1061"].setdefault("inputs", {})
        for key in list(lora_inputs):
            if key.lower().startswith("lora_"):
                del lora_inputs[key]
        for index, selection in enumerate(loras or [], start=1):
            lora_inputs[f"lora_{index}"] = {
                "on": bool(selection.get("on", True)),
                "lora": str(selection["lora"]),
                "strength": float(selection.get("strength", 1.0)),
            }

    return graph


def patch_seedvr_upscaler_workflow(
    template: dict[str, Any],
    *,
    image_filename: str,
    upscale_cfg: Optional["UpscaleConfig"] = None,
    base_width: int = 768,
    base_height: int = 1344,
) -> dict[str, Any]:
    """Patch workflow_seedvr_upscaler.json with source image filename and SeedVR2 parameters."""
    graph = json.loads(json.dumps(template))

    # 1. Source Image Node (1093 LoadImage)
    if "1093" in graph:
        graph["1093"].setdefault("inputs", {})["image"] = str(image_filename)

    # 2. DiT Model Loader (1091 SeedVR2LoadDiTModel)
    if upscale_cfg and getattr(upscale_cfg, "dit_model", None) and "1091" in graph:
        graph["1091"].setdefault("inputs", {})["model"] = str(upscale_cfg.dit_model)

    # 3. SeedVR2 Video Upscaler (1089 SeedVR2VideoUpscaler)
    if "1089" in graph and upscale_cfg:
        inputs = graph["1089"].setdefault("inputs", {})
        if getattr(upscale_cfg, "color_correction", None):
            inputs["color_correction"] = str(upscale_cfg.color_correction)
        if getattr(upscale_cfg, "input_noise_scale", None) is not None:
            inputs["input_noise_scale"] = float(upscale_cfg.input_noise_scale)
        if getattr(upscale_cfg, "latent_noise_scale", None) is not None:
            inputs["latent_noise_scale"] = float(upscale_cfg.latent_noise_scale)
        if getattr(upscale_cfg, "scale", None):
            max_dim = max(base_width, base_height)
            target_res = int(min(4096, max(1024, max_dim * upscale_cfg.scale)))
            inputs["resolution"] = target_res
            inputs["max_resolution"] = target_res

    return graph


def patch_detailer_workflow(
    template: dict[str, Any],
    *,
    image_filename: str,
    detailer_cfg: Optional["DetailerConfig"] = None,
    prompt: str = "",
    negative_prompt: str = "",
    unet_name: str = "krea2\\krea2_turbo_fp8_scaled.safetensors",
    clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
    clip_type: str = "krea2",
    vae_name: str = "wan_2.1_vae.safetensors",
    loras: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Patch workflow_detailer.json with source image and apply selective detailer cascade."""
    graph = json.loads(json.dumps(template))

    # 1. Source Image Node (1112 LoadImage)
    if "1112" in graph:
        graph["1112"].setdefault("inputs", {})["image"] = str(image_filename)

    # 2. Prompts
    if "1113" in graph:
        graph["1113"].setdefault("inputs", {})["text"] = prompt
    if "1114" in graph:
        graph["1114"].setdefault("inputs", {})["text"] = negative_prompt

    # 3. Model Loaders
    if "1111:615" in graph:
        graph["1111:615"].setdefault("inputs", {})["unet_name"] = unet_name
    if "1111:616" in graph:
        inputs = graph["1111:616"].setdefault("inputs", {})
        inputs["clip_name"] = clip_name
        inputs["type"] = clip_type
    if "1111:617" in graph:
        graph["1111:617"].setdefault("inputs", {})["vae_name"] = vae_name

    # 4. LoRAs (rgthree Power Lora Loader 1110)
    if "1110" in graph:
        lora_inputs = graph["1110"].setdefault("inputs", {})
        for key in list(lora_inputs):
            if key.lower().startswith("lora_"):
                del lora_inputs[key]
        for index, selection in enumerate(loras or [], start=1):
            lora_inputs[f"lora_{index}"] = {
                "on": bool(selection.get("on", True)),
                "lora": str(selection["lora"]),
                "strength": float(selection.get("strength", 1.0)),
            }

    # 5. Apply selective detailer bypass & param injection
    graph = apply_detailer_pipeline(
        graph,
        detailer_cfg=detailer_cfg,
        base_image_node="1112",
        post_process_node="1088:661",
    )

    return graph


def patch_full_t2i_workflow(
    template: dict[str, Any],
    *,
    prompt: str,
    negative_prompt: str = "",
    seed: Optional[int] = None,
    steps: int = 10,
    image_count: int = 1,
    width: int = 768,
    height: int = 1344,
    unet_name: str = "krea2\\krea2_turbo_fp8_scaled.safetensors",
    clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
    clip_type: str = "krea2",
    vae_name: str = "wan_2.1_vae.safetensors",
    loras: Optional[list[dict[str, Any]]] = None,
    upscale_cfg: Optional[Any] = None,
    detailer_cfg: Optional[Any] = None,
    source_image_filename: Optional[str] = None,
    denoise: float = 1.0,
) -> dict[str, Any]:
    """Patch generator nodes and apply cascade bypass (supporting both modular and legacy graphs)."""
    # Base T2I node patching
    graph = patch_base_t2i_workflow(
        template,
        prompt=prompt,
        negative_prompt=negative_prompt,
        seed=seed,
        steps=steps,
        image_count=image_count,
        width=width,
        height=height,
        unet_name=unet_name,
        clip_name=clip_name,
        clip_type=clip_type,
        vae_name=vae_name,
        loras=loras,
        source_image_filename=source_image_filename,
        denoise=denoise,
    )

    # Apply pipeline bypass if graph contains multi-stage nodes
    graph = apply_t2i_pipeline(
        graph,
        upscale_cfg=upscale_cfg,
        detailer_cfg=detailer_cfg,
        base_image_node="1064",
        post_process_node="1080:661",
    )

    return graph
