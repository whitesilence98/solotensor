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
from typing import Any, Literal, Optional, Set, TYPE_CHECKING

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
    negative_prompt: str = "",
    seed: int = 1,
    duration_seconds: int = 3,
    video_fps: int = 25,
    width: int = 1024,
    height: int = 576,
    steps: int = 8,
    cfg: float = 1.0,
    sampler_name: Optional[str] = None,
    scheduler: Optional[str] = None,
    loras: Optional[list[dict[str, Any]]] = None,
    source_image_filename: Optional[str] = None,
    last_frame_filename: Optional[str] = None,
    video_mode: Optional[Literal["text-to-video", "image-to-video"]] = None,
    stage2_upscale: bool = False,
    audio_mode: Literal["silent", "voice_clone"] = "silent",
    reference_audio_filename: Optional[str] = None,
    extract_voice: bool = True,
    resize_mode: Literal["preset", "source"] = "source",
    video_megapixels: float = 2.1,
    first_frame_strength: float = 1.0,
    last_frame_strength: float = 1.0,
    rife_multiplier: int = 2,
    high_fps: bool = False,
    film_grain: bool = False,
    match_color: bool = True,
    tiled_vae_decode: bool = False,
) -> dict[str, Any]:
    """Patch the 320-node LTX-Video 2.3 workflow (workflow_generate_it2v.json).

    Node ``1883`` ("false = Clone Voice, true = Audio to Video") is the AUDIO
    switch, NOT the last-frame switch. It drives ``1884:1698`` (positive),
    ``1884:1699`` (model) and ``1887:1702`` (audio trim duration).

    Audio modes. LTX-2.3 always produces an audio track, so neither mode is
    digitally silent; both keep the model-generated ``LTXVEmptyLatentAudio``
    latent (``389:377``) selected on ``389:1103``.

    * ``audio_mode="silent"`` (native audio) — ``1883=True`` routes the Positive
      and Model switches to the plain prompt ``1879`` and the clean model
      ``1880``, i.e. no ID-LoRA identity lock. ``389:1103`` is pinned to its
      ``on_false`` branch so the model generates its own audio instead of
      encoding the bundled reference MP3 on ``1888``.
    * ``audio_mode="voice_clone"`` — ``1883=False`` routes those switches to
      ``1884:1697`` ``LTXVReferenceAudio`` (ID-LoRA
      ``ltx-2.3-id-lora-talkvid-3k``), which attaches the speaker identity from
      the reference audio. ``1888`` receives ``reference_audio_filename`` and
      ``1889:1706`` honours ``extract_voice`` (Mel-Band RoFormer vocal
      separation applied to that reference). The audio latent is still the
      model-generated one, so the model speaks in the cloned voice.

    Note: ``389:1104`` is inert. rgthree "Any Switch" (``389:1105``) returns its
    first non-empty input, and ``1883`` is always a boolean, so ``any_01`` always
    wins over ``389:1104``; the real selector is ``389:1103``, which is patched
    directly.

    Sizing: ``resize_mode="source"`` writes ``389:956`` (megapixels) so the source
    image is scaled to ``video_megapixels``; ``"preset"`` writes ``0`` so the
    ``389:828``/``389:830`` width/height pair wins instead.

    Stage-2 levers (RIFE multiplier, high FPS, film grain, colour match, Stage-2
    tiled VAE) only exist when ``stage2_upscale=True``; in fast mode those nodes
    are pruned from the graph and the levers are therefore no-ops. The Stage-1
    tiled VAE switch (``1693:1689``) survives pruning and is always honoured.

    The Stage-2 seed stays at the template value; only the Stage-1 seed is patched.

    Branch selection (``video_mode``). An explicit ``video_mode="text-to-video"``
    or ``"image-to-video"`` makes the T2V/I2V choice deterministic: the first and
    last frame inputs are derived once from ``source_image_filename`` /
    ``last_frame_filename`` (T2V drops both defensively; I2V raises when neither
    is supplied), the ``1875`` LoRA/CLIP flag is set from the mode itself, and
    the two "Use First/Last Frame?" compares are re-pointed at small force
    primitives so each frame axis is decided by the presence of that specific
    image rather than by the size heuristic. T2V also pins ``389:956`` to ``0``
    because there is no source image to scale (``389:1928:1113`` tests
    ``megapixels > 0``). Omitting ``video_mode`` keeps the legacy inference,
    byte-for-byte: the OR gate and the ``1875`` flag are derived from whichever
    frames were supplied.

    The OR gates ``389:1929:1111`` (Stage 1) and its clone ``1194:1669``
    (Stage 2) are DERIVED nodes: they combine the two per-frame compares and fan
    out to the sampler, sigmas, step counts, Stage-1 dimensions and the whole
    Stage-2 mirror. Never write them directly; change the compares that feed
    them so both stages stay consistent. Forcing is per-frame, not per-mode: a
    last-frame-only I2V request keeps ``1875_force_first = 0`` and
    ``1875_force_last = 2``, which is the path the ``389:1928:1112`` Image
    Switch depends on.

    ``1875`` is a SEPARATE axis (I2V vs T2V LoRA and CLIP via ``1874`` ->
    ``1878``/``1880``). It must agree with the conditioning branch; an explicit
    ``video_mode`` sets it directly, while legacy calls OR the supplied frames.
    """
    graph = json.loads(json.dumps(workflow))

    def inputs_of(node_id: str) -> Optional[dict[str, Any]]:
        """Return the node's mutable inputs dict, or None when the node is absent."""
        node = graph.get(node_id)
        if not isinstance(node, dict):
            return None
        return node.setdefault("inputs", {})

    # 1. Positive Prompt: Node 1879 CLIPTextEncode (feeds 1884:1698 via the switches)
    if (inputs := inputs_of("1879")) is not None:
        inputs["text"] = prompt

    # 2. Seed: Node 2019 SeedNode -> Node 389:363 RandomNoise (uint32 bounds)
    final_seed = max(0, min(0xFFFFFFFF, int(seed)))
    if (inputs := inputs_of("2019")) is not None:
        inputs["seed"] = final_seed
    if (inputs := inputs_of("389:363")) is not None:
        inputs["noise_seed"] = ["2019", 0]

    # 3. Length & Duration: 389:387 (Stage 1 frames) and 1887:1704 (A2V audio trim)
    duration = max(1, min(30, int(duration_seconds)))
    if (inputs := inputs_of("389:387")) is not None:
        inputs["value"] = duration
    if (inputs := inputs_of("1887:1704")) is not None:
        inputs["value"] = float(duration)

    # 4. Frame rate: video follows the request, audio is pinned to 24 fps.
    #    Node 389:877 documents that ComfyUI needs audio at 24 fps and video at
    #    25 fps to keep them in sync, so 389:384 must not follow video_fps.
    fps = max(8, min(60, int(video_fps)))
    if (inputs := inputs_of("389:825")) is not None:
        inputs["value"] = fps
    if (inputs := inputs_of("389:384")) is not None:
        inputs["value"] = 24

    # 5. Dimensions (Snapped to multiples of 32 for LTX-Video)
    snapped_w = max(64, (int(width) // 32) * 32)
    snapped_h = max(64, (int(height) // 32) * 32)
    if (inputs := inputs_of("389:828")) is not None:
        inputs["value"] = snapped_w
    if (inputs := inputs_of("389:830")) is not None:
        inputs["value"] = snapped_h

    # 6. Steps: Stage 1 (389:1986/389:973) and Stage 2 (1194:1191/1194:1988)
    step_val = max(1, min(100, int(steps)))
    for node_id in ("389:1986", "389:973", "1194:1191", "1194:1988"):
        if (inputs := inputs_of(node_id)) is not None:
            inputs["value"] = step_val

    # 7. CFG: Stage 1 (389:366) and Stage 2 (1194:1170) CFGGuider
    cfg_val = max(0.0, min(30.0, float(cfg)))
    for node_id in ("389:366", "1194:1170"):
        if (inputs := inputs_of(node_id)) is not None:
            inputs["cfg"] = cfg_val

    # 8. Sampler: Stage 1 (389:372 T2V, 389:974 I2V), Stage 2 (1194:1168/1194:1173)
    if sampler_name:
        for node_id in ("389:372", "389:974", "1194:1168", "1194:1173"):
            if (inputs := inputs_of(node_id)) is not None:
                inputs["sampler_name"] = str(sampler_name)

    # 9. Scheduler: Stage 1 (389:754/389:975), Stage 2 (1194:1172/1194:1174).
    #    NOTE: 389:1440/389:1649 and 1194:1468/1194:1677 default to their "on"
    #    branch, so the tuned VideoFlow sigma chain shadows these BasicSchedulers
    #    unless the caller disables it in the UI.
    if scheduler:
        for node_id in ("389:754", "389:975", "1194:1172", "1194:1174"):
            if (inputs := inputs_of(node_id)) is not None:
                inputs["scheduler"] = str(scheduler)

    # 10. LoRAs: nodes 2022 (I2V) and 2023 (T2V) are rgthree Power Lora Loaders.
    #     Same contract as 1061 in workflow_generate_t2i.json: drop lora_* keys,
    #     then write lora_{i} = {"on", "lora", "strength"}.
    for node_id in ("2022", "2023"):
        if (inputs := inputs_of(node_id)) is None:
            continue
        for key in list(inputs):
            if key.lower().startswith("lora_"):
                del inputs[key]
        for index, selection in enumerate(loras or [], start=1):
            inputs[f"lora_{index}"] = {
                "on": bool(selection.get("on", True)),
                "lora": str(selection["lora"]),
                "strength": float(selection.get("strength", 1.0)),
            }

    # 11. Negative Prompt: replace 389:362 ConditioningZeroOut in place with a real
    #     CLIPTextEncode only when a negative prompt is supplied AND CFG > 1. The
    #     node id and output slot stay identical (389:376 consumes ["389:362", 0]).
    #     At CFG 1 a negative prompt has no effect, so the zero-out is preserved.
    if negative_prompt and cfg_val > 1.0 and "389:362" in graph:
        graph["389:362"] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative_prompt, "clip": ["1878", 0]},
            "_meta": {"title": "Negative Prompt"},
        }

    # 12. First Frame Image Conditioning (Image-to-Video vs Text-to-Video).
    #     Effective frames are resolved once from video_mode: T2V drops any leaked
    #     image inputs, I2V requires at least one frame, legacy (None) is raw.
    effective_source = source_image_filename
    effective_last = last_frame_filename
    if video_mode == "text-to-video":
        effective_source = None
        effective_last = None          # defensive; the schema rejects these upstream
    elif video_mode == "image-to-video" and not (effective_source or effective_last):
        raise ValueError(
            "video_mode='image-to-video' requires a first or last frame"
        )

    if effective_source:
        graph["1875_load_first"] = {
            "class_type": "LoadImage",
            "inputs": {"image": str(source_image_filename)},
            "_meta": {"title": "Load First Frame Image"},
        }
        if (inputs := inputs_of("389:1929:1905")) is not None:
            inputs["any_01"] = ["1875_load_first", 0]
    else:
        graph.pop("1875_load_first", None)
        if (inputs := inputs_of("389:1929:1905")) is not None:
            inputs.pop("any_01", None)

    # 13. Last Frame Image Conditioning (interpolation). 389:1929:1903 derives
    #     "Use Last Frame?" from the image size, so linking a real image is enough;
    #     node 1883 must NOT be touched here (it is the audio switch).
    if effective_last:
        graph["1875_load_last"] = {
            "class_type": "LoadImage",
            "inputs": {"image": str(last_frame_filename)},
            "_meta": {"title": "Load Last Frame Image"},
        }
        if (inputs := inputs_of("389:1929:1901")) is not None:
            inputs["any_01"] = ["1875_load_last", 0]
    else:
        graph.pop("1875_load_last", None)
        if (inputs := inputs_of("389:1929:1901")) is not None:
            inputs.pop("any_01", None)

    # 14. I2V flag: 1874 reads only 1875, and it drives the I2V/T2V LoRA + CLIP
    #     switches (1878/1880), so OR both conditioning images. An explicit mode
    #     wins over the derived OR so the separate LoRA/CLIP axis always agrees
    #     with the conditioning branch.
    i2v_flag = (
        bool(effective_source or effective_last)
        if video_mode is None
        else video_mode == "image-to-video"
    )
    if (inputs := inputs_of("1875")) is not None:
        inputs["value"] = i2v_flag

    # 14b. Deterministic branch forcing (only when the caller passes a mode).
    #      The OR gates 389:1929:1111 / 1194:1669 are derived and fan out to
    #      Stage 1 and Stage 2, so never write them. Instead re-point the two
    #      per-frame compares at force primitives keyed on the presence of THAT
    #      frame, which keeps last-frame-only I2V (389:1928:1112) intact.
    if video_mode is not None:
        graph["1875_force_first"] = {
            "class_type": "PrimitiveInt",
            "inputs": {"value": 2 if effective_source else 0},
            "_meta": {"title": "Force First Frame Branch"},
        }
        graph["1875_force_last"] = {
            "class_type": "PrimitiveInt",
            "inputs": {"value": 2 if effective_last else 0},
            "_meta": {"title": "Force Last Frame Branch"},
        }
        forced = [
            ("389:1929:1907", "1875_force_first"),
            ("389:1929:1903", "1875_force_last"),
        ]
        for compare_id, force_id in forced:
            if (inputs := inputs_of(compare_id)) is not None:
                inputs["a"] = [force_id, 0]
        if (inputs := inputs_of("389:1929:1914")) is not None:
            inputs["value"] = 1

    # 15. Source sizing: 389:1928:1113 tests "megapixels > 0". A positive value
    #     selects 389:1928:957 (scale to megapixels); 0 falls through to
    #     389:1928:1115, which reads the 389:828/389:830 width/height pair.
    megapixels = max(0.0, min(8.0, float(video_megapixels)))
    if (inputs := inputs_of("389:956")) is not None:
        inputs["value"] = megapixels if resize_mode == "source" else 0

    # 15b. T2V has no source image, so the megapixel scaling path must not be
    #      selectable: 389:1928:1113 compares "a > 0" and would otherwise scale
    #      a latent that has no source dimensions.
    if video_mode == "text-to-video":
        if (inputs := inputs_of("389:956")) is not None:
            inputs["value"] = 0

    # 16. Guide strengths: 389:984 (first frame) and 389:1066 (last frame)
    if (inputs := inputs_of("389:984")) is not None:
        inputs["value"] = max(0.0, min(1.0, float(first_frame_strength)))
    if (inputs := inputs_of("389:1066")) is not None:
        inputs["value"] = max(0.0, min(1.0, float(last_frame_strength)))

    # 17. Audio mode. Node 1883 is "false = Clone Voice, true = Audio to Video".
    #     rgthree "Any Switch" 389:1105 returns its FIRST non-empty input, so
    #     389:1104 is inert while 1883 is linked; 389:1103 is the node that really
    #     selects the audio latent (on_false = 389:377 empty latent,
    #     on_true = 389:1079 encoded reference audio).
    if audio_mode == "voice_clone":
        if not reference_audio_filename:
            raise ValueError("audio_mode='voice_clone' requires reference_audio_filename")
        if (inputs := inputs_of("1883")) is not None:
            inputs["value"] = False
        if (inputs := inputs_of("1888")) is not None:
            inputs["audio"] = str(reference_audio_filename)
            inputs.pop("audioUI", None)
        if (inputs := inputs_of("1889:1706")) is not None:
            inputs["value"] = bool(extract_voice)
        if (inputs := inputs_of("389:1103")) is not None:
            inputs["switch"] = ["389:1105", 0]
    else:
        if (inputs := inputs_of("1883")) is not None:
            inputs["value"] = True
        # Pin the empty-latent audio branch so the bundled reference MP3 on 1888
        # is neither encoded nor played; the model generates its own track.
        if (inputs := inputs_of("389:1103")) is not None:
            inputs["switch"] = False

    # 18. Stage-2 quality levers. All of these nodes live on the Stage-2 branch, so
    #     they are no-ops once fast mode prunes them. The Stage-1 tiled VAE switch
    #     (1693:1689) DOES survive pruning and is therefore always honoured.
    if (inputs := inputs_of("1693:1689")) is not None:  # Stage 1 Tiled VAE Decode
        inputs["switch"] = bool(tiled_vae_decode)
    if stage2_upscale:
        if (inputs := inputs_of("668:1041")) is not None:  # RIFE Frame Multiplier
            inputs["value"] = max(1, min(4, int(rife_multiplier)))
        if (inputs := inputs_of("668:1042")) is not None:  # "50 fps?"
            inputs["value"] = bool(high_fps)
        if (inputs := inputs_of("668:876")) is not None:  # "Add Film Grain?"
            inputs["switch"] = bool(film_grain)
        if (inputs := inputs_of("668:838")) is not None:  # Match Color/Light
            inputs["value"] = bool(match_color)
        if (inputs := inputs_of("668:655")) is not None:  # Stage 2 Tiled VAE Decode
            inputs["switch"] = bool(tiled_vae_decode)

    # 19. Fast Mode vs Pro Mode (Stage 1 only vs Stage 1 + Stage 2 Upscale).
    #     Recursive dependency prune from the Stage-1 VHS_VideoCombine node 172.
    if not stage2_upscale:
        visited: set[str] = set()

        def collect_deps(node_id: str) -> None:
            if node_id in visited:
                return
            visited.add(node_id)
            node_def = graph.get(node_id)
            if not isinstance(node_def, dict):
                return
            for value in node_def.get("inputs", {}).values():
                if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str):
                    collect_deps(value[0])

        collect_deps("172")
        graph = {key: value for key, value in graph.items() if key in visited}

    return graph
