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
    """Return the loaded base T2I, I2I, Detailer, or Upscaler workflow graph dict for the given request config."""
    if req.mode == "detailer":
        return load_workflow("workflow_detailer.json")
    elif req.mode == "upscale":
        return load_workflow("workflow_seedvr_upscaler.json")
    elif req.mode == "image-to-image":
        for candidate in ["workflow_generate_i2i.json", "workflow_generate_t2i.json", "workflow_api.json"]:
            try:
                return load_workflow(candidate)
            except (FileNotFoundError, RuntimeError):
                continue
    elif req.mode == "video":
        for candidate in ["workflow_generate_it2v.json"]:
            try:
                return load_workflow(candidate)
            except (FileNotFoundError, RuntimeError):
                continue
    else:
        for candidate in ["workflow_generate_t2i.json", "workflow_api.json"]:
            try:
                return load_workflow(candidate)
            except (FileNotFoundError, RuntimeError):
                continue
    raise RuntimeError(f"Could not find a valid base workflow template for mode '{req.mode}'")


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
    sampler_name: Optional[str] = None,
    scheduler: Optional[str] = None,
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

    # 3b. Sampler & Scheduler
    if sampler_name:
        if "1056" in graph:
            graph["1056"].setdefault("inputs", {})["sampler_name"] = str(sampler_name)
        if "1059" in graph:
            graph["1059"].setdefault("inputs", {})["sampler_name"] = str(sampler_name)
    if scheduler:
        if "1056" in graph:
            graph["1056"].setdefault("inputs", {})["scheduler"] = str(scheduler)
        if "1059" in graph:
            graph["1059"].setdefault("inputs", {})["scheduler"] = str(scheduler)

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


def patch_base_i2i_workflow(
    template: dict[str, Any],
    *,
    prompt: str,
    negative_prompt: str = "",
    seed: Optional[int] = None,
    steps: int = 10,
    cfg: float = 1.0,
    denoise: float = 0.72,
    unet_name: str = "krea2\\pornmasterKrea2_v2TurboBF16.safetensors",
    clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
    clip_type: str = "krea2",
    vae_name: str = "wan_2.1_vae.safetensors",
    source_image_filename: str,
    loras: Optional[list[dict[str, Any]]] = None,
    sampler_name: Optional[str] = None,
    scheduler: Optional[str] = None,
) -> dict[str, Any]:
    """Patch standard generator nodes in native workflow_generate_i2i.json."""
    graph = json.loads(json.dumps(template))

    # 1. Source Image input (node 30)
    if "30" in graph:
        graph["30"].setdefault("inputs", {})["image"] = str(source_image_filename)

    # 2. Positive & Negative Prompts (nodes 6 & 7)
    if "6" in graph:
        graph["6"].setdefault("inputs", {})["text"] = prompt
    if "7" in graph:
        graph["7"].setdefault("inputs", {})["text"] = negative_prompt

    # 3. KSampler parameters (node 3)
    final_seed = int(seed if seed is not None and seed >= 0 else 0)
    if "3" in graph:
        inputs = graph["3"].setdefault("inputs", {})
        inputs["seed"] = final_seed
        inputs["steps"] = int(steps)
        inputs["cfg"] = float(cfg)
        inputs["denoise"] = float(denoise)
        if sampler_name:
            inputs["sampler_name"] = str(sampler_name)
        if scheduler:
            inputs["scheduler"] = str(scheduler)

    # 4. Model Loaders (nodes 593:590, 593:589, 593:588)
    if "593:590" in graph and unet_name:
        graph["593:590"].setdefault("inputs", {})["unet_name"] = unet_name
    if "593:589" in graph and clip_name:
        inputs = graph["593:589"].setdefault("inputs", {})
        inputs["clip_name"] = clip_name
        if clip_type:
            inputs["type"] = clip_type
    if "593:588" in graph and vae_name:
        graph["593:588"].setdefault("inputs", {})["vae_name"] = vae_name

    # 5. LoRAs (chaining standard LoraLoader nodes)
    active_loras = [item for item in (loras or []) if item.get("on", True) and item.get("lora")]
    if active_loras:
        last_model_ref = ["593:590", 0]
        last_clip_ref = ["593:589", 0]
        for idx, item in enumerate(active_loras, start=1):
            lora_node_id = f"lora_loader_{idx}"
            strength = float(item.get("strength", 1.0))
            graph[lora_node_id] = {
                "class_type": "LoraLoader",
                "inputs": {
                    "model": last_model_ref,
                    "clip": last_clip_ref,
                    "lora_name": str(item["lora"]),
                    "strength_model": strength,
                    "strength_clip": strength,
                },
                "_meta": {"title": f"LoRA: {item.get('lora', '')}"},
            }
            last_model_ref = [lora_node_id, 0]
            last_clip_ref = [lora_node_id, 1]

        if "3" in graph:
            graph["3"]["inputs"]["model"] = last_model_ref
        if "6" in graph:
            graph["6"]["inputs"]["clip"] = last_clip_ref
        if "7" in graph:
            graph["7"]["inputs"]["clip"] = last_clip_ref

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
    cfg: float = 1.0,
    sampler_name: Optional[str] = None,
    scheduler: Optional[str] = None,
) -> dict[str, Any]:
    """Patch generator nodes and apply cascade bypass (supporting both modular and legacy graphs)."""
    if "30" in template and "32" in template and "3" in template and source_image_filename:
        return patch_base_i2i_workflow(
            template,
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed,
            steps=steps,
            cfg=cfg,
            denoise=denoise,
            unet_name=unet_name,
            clip_name=clip_name,
            clip_type=clip_type,
            vae_name=vae_name,
            source_image_filename=source_image_filename,
            loras=loras,
            sampler_name=sampler_name,
            scheduler=scheduler,
        )

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
        sampler_name=sampler_name,
        scheduler=scheduler,
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


def patch_video_it2v_workflow(
    workflow: dict[str, Any],
    *,
    prompt: str = "",
    seed: int = 1,
    duration_seconds: int = 3,
    video_fps: int = 25,
    width: int = 1024,
    height: int = 576,
    steps: int = 8,
    source_image_filename: str | None = None,
    last_frame_filename: str | None = None,
    stage2_upscale: bool = False,
) -> dict[str, Any]:
    """Patch the 320-node LTX-Video 2.3 workflow (workflow_generate_it2v.json).

    Supports both Text-to-Video and Image-to-Video (First Frame conditioning),
    and prunes Stage 2 nodes when stage2_upscale=False for fast generation.
    """
    graph = json.loads(json.dumps(workflow))

    # 1. Positive Prompt: Node 1879 CLIPTextEncode
    if "1879" in graph and "inputs" in graph["1879"]:
        graph["1879"]["inputs"]["text"] = prompt

    # 2. Seed: Node 2019 SeedNode & Node 389:363
    if "2019" in graph and "inputs" in graph["2019"]:
        graph["2019"]["inputs"]["seed"] = int(seed)
    if "389:363" in graph and "inputs" in graph["389:363"]:
        graph["389:363"]["inputs"]["noise_seed"] = ["2019", 0]

    # 3. Length & Duration: Node 389:387 easy int Length in Seconds
    duration = max(1, min(30, int(duration_seconds)))
    if "389:387" in graph and "inputs" in graph["389:387"]:
        graph["389:387"]["inputs"]["value"] = duration

    # 4. Frame rate: Node 389:825 & 389:384
    fps = max(8, min(60, int(video_fps)))
    if "389:825" in graph and "inputs" in graph["389:825"]:
        graph["389:825"]["inputs"]["value"] = fps
    if "389:384" in graph and "inputs" in graph["389:384"]:
        graph["389:384"]["inputs"]["value"] = fps

    # 5. Dimensions (Snapped to multiples of 32 for LTX-Video)
    snapped_w = max(64, (width // 32) * 32)
    snapped_h = max(64, (height // 32) * 32)
    if "389:828" in graph and "inputs" in graph["389:828"]:
        graph["389:828"]["inputs"]["value"] = snapped_w
    if "389:830" in graph and "inputs" in graph["389:830"]:
        graph["389:830"]["inputs"]["value"] = snapped_h

    # 6. Steps: T2V (8) / I2V (4)
    step_val = max(1, min(50, int(steps)))
    if "389:1986" in graph and "inputs" in graph["389:1986"]:
        graph["389:1986"]["inputs"]["value"] = step_val
    if "389:973" in graph and "inputs" in graph["389:973"]:
        graph["389:973"]["inputs"]["value"] = step_val
    if "1194:1191" in graph and "inputs" in graph["1194:1191"]:
        graph["1194:1191"]["inputs"]["value"] = step_val
    if "1194:1988" in graph and "inputs" in graph["1194:1988"]:
        graph["1194:1988"]["inputs"]["value"] = step_val

    # 7. First Frame Image Conditioning (Image-to-Video vs Text-to-Video)
    if source_image_filename:
        graph["1875_load_first"] = {
            "class_type": "LoadImage",
            "inputs": {"image": source_image_filename},
            "_meta": {"title": "Load First Frame Image"}
        }
        if "389:1929:1905" in graph and "inputs" in graph["389:1929:1905"]:
            graph["389:1929:1905"]["inputs"]["any_01"] = ["1875_load_first", 0]
        if "1875" in graph and "inputs" in graph["1875"]:
            graph["1875"]["inputs"]["value"] = True
    else:
        if "1875" in graph and "inputs" in graph["1875"]:
            graph["1875"]["inputs"]["value"] = False
        if "389:1929:1905" in graph and "inputs" in graph["389:1929:1905"]:
            graph["389:1929:1905"]["inputs"].pop("any_01", None)

    # 8. Last Frame Image Conditioning (Interpolation)
    if last_frame_filename:
        graph["1875_load_last"] = {
            "class_type": "LoadImage",
            "inputs": {"image": last_frame_filename},
            "_meta": {"title": "Load Last Frame Image"}
        }
        if "389:1929:1901" in graph and "inputs" in graph["389:1929:1901"]:
            graph["389:1929:1901"]["inputs"]["any_01"] = ["1875_load_last", 0]
        if "1883" in graph and "inputs" in graph["1883"]:
            graph["1883"]["inputs"]["value"] = True
    else:
        if "1883" in graph and "inputs" in graph["1883"]:
            graph["1883"]["inputs"]["value"] = False
        if "389:1929:1901" in graph and "inputs" in graph["389:1929:1901"]:
            graph["389:1929:1901"]["inputs"].pop("any_01", None)

    # 9. Fast Mode vs Pro Mode (Stage 1 only vs Stage 1 + Stage 2 Upscale)
    if not stage2_upscale:
        visited = set()
        def collect_deps(nid: str):
            if nid in visited:
                return
            visited.add(nid)
            node_def = graph.get(nid)
            if not node_def or not isinstance(node_def, dict):
                return
            for v in node_def.get("inputs", {}).values():
                if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                    collect_deps(v[0])

        collect_deps("172")
        graph = {k: v for k, v in graph.items() if k in visited}

    return graph
