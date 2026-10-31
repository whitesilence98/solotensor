#!/usr/bin/env python3
"""
Register all local models from D:\ComfyUI-master\models into SoloTensor catalog.
Ensures correct VAE and CLIP configuration for every architecture.
"""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import uuid

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db import get_db
from app.schemas import derive_supported_modes

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

COMFY_ROOT = Path(r"D:\ComfyUI-master\models")
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
DEFS_ROOT_WORKSPACE = WORKSPACE_ROOT / "models" / "definitions"
DEFS_ROOT_BACKEND = backend_dir / "models" / "definitions"
MODELS_ROOT_WORKSPACE = WORKSPACE_ROOT / "models"
MODELS_ROOT_BACKEND = backend_dir / "models"

DEFS_ROOT_WORKSPACE.mkdir(parents=True, exist_ok=True)
DEFS_ROOT_BACKEND.mkdir(parents=True, exist_ok=True)

NOW = datetime.now(timezone.utc).isoformat()

def normalize_rel_filename(fn: str) -> str:
    """Normalize path with forward slashes and stripped leading/trailing slashes."""
    return fn.replace("\\", "/").strip().lstrip("/")

# Existing IDs mapping to preserve existing references
EXISTING_DEFS_BY_FILENAME = {}
for folder in (DEFS_ROOT_WORKSPACE, DEFS_ROOT_BACKEND):
    if folder.is_dir():
        for p in folder.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                for v in data.get("versions", []):
                    for fl in v.get("files", []):
                        fn = fl.get("filename")
                        if fn:
                            clean_fn = normalize_rel_filename(fn)
                            base_name = Path(clean_fn).name
                            EXISTING_DEFS_BY_FILENAME[clean_fn] = data
                            EXISTING_DEFS_BY_FILENAME[clean_fn.lower()] = data
                            EXISTING_DEFS_BY_FILENAME[base_name] = data
                            EXISTING_DEFS_BY_FILENAME[base_name.lower()] = data
            except Exception:
                pass

KNOWN_MODEL_IDS = {
    # Checkpoints / Diffusion
    "diffusion_models/krea2/krea2_turbo_fp8_scaled.safetensors": "50721a0252d642348157b5bdba6a14c8",
    "diffusion_models/krea2/pornmasterKrea2_v2TurboBF16.safetensors": "ae55634e27db453a970434cbb6faab22",
    "diffusion_models/z-image/z_image_turbo_bf16.safetensors": "50b26a9b46fe455e8667f694bf328f5d",
    "diffusion_models/ltx-2.3-22b-distilled_transformer_only_fp8_scaled.safetensors": "5ec5c81c38c447faa3d9001c0f10e26a",
    "diffusion_models/DasiwaLTX23_dragonleapV4.safetensors": "66919a681f8244929e8b98c789a59256",
    # LoRAs
    "loras/krea2/concept/RealisticSnapshotKrea2.safetensors": "6af7f1654a0b4943ae6aaeec0f97464e",
    "loras/krea2/concept/Krea_2_zidiusArt_Melancholy_v2.safetensors": "b32416928ca44382afa84c317bb73ee9",
    "loras/krea2/character/asig2-krea2.safetensors": "e6249b3748f34bba9fe9970c27cf4435",
}

def get_file_sha256(filepath: Path) -> str:
    meta_path = filepath.with_suffix(".metadata.json")
    if meta_path.exists():
        try:
            d = json.loads(meta_path.read_text(encoding="utf-8", errors="ignore"))
            if d.get("sha256"):
                return d["sha256"].lower()
        except Exception:
            pass
    sha_path = filepath.with_suffix(".sha256")
    if sha_path.exists():
        try:
            parts = sha_path.read_text(encoding="utf-8", errors="ignore").strip().split()
            if parts:
                return parts[0].lower()
        except Exception:
            pass
    print(f"  Calculating SHA256 for {filepath.name}...")
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(4 * 1024 * 1024):
            h.update(chunk)
    return h.hexdigest().lower()

def copy_sample_image(src_img: Path, model_id: str, version_id: str, sample_id: str) -> dict:
    ext = src_img.suffix.lower()
    stored_name = f"{sample_id}{ext}"
    for root_dir in (MODELS_ROOT_WORKSPACE, MODELS_ROOT_BACKEND):
        dest_dir = root_dir / model_id / version_id / "samples"
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / stored_name
        shutil.copy2(src_img, dest_file)
    return {
        "sample_id": sample_id,
        "filename": src_img.name,
        "kind": "image",
        "stored_name": stored_name,
        "metadata": {
            "role": "showcase",
            "is_cover": True,
        },
    }

def find_preview_image(file_path: Path) -> Path | None:
    for ext in (".png", ".jpeg", ".jpg", ".webp"):
        cand = file_path.with_suffix(ext)
        if cand.is_file():
            return cand
    return None

def build_model_record(
    title: str,
    category_name: str,
    model_type: str,
    rel_filename: str,
    file_category: str,
    base_model: str,
    vae: str | None,
    text_encoder: str | None,
    text_encoder_2: str | None = None,
    clip_type: str | None = None,
    trigger_words: list[str] | None = None,
    sampler: str = "euler",
    steps_min: int = 20,
    steps_max: int = 30,
    cfg_min: float = 1.0,
    cfg_max: float = 7.0,
    base_model_ref: tuple[str, str, str] | None = None, # (model_id, version_id, file_id)
    description: str = "",
    tags: list[str] | None = None,
    supported_modes: list[str] | None = None,
) -> dict:
    norm_fn = normalize_rel_filename(rel_filename)
    base_name = Path(norm_fn).name
    lookup_key = f"{file_category}/{norm_fn}"
    existing_model_id = KNOWN_MODEL_IDS.get(lookup_key)

    existing_record = None
    if existing_model_id:
        p1 = DEFS_ROOT_WORKSPACE / f"{existing_model_id}.json"
        p2 = DEFS_ROOT_BACKEND / f"{existing_model_id}.json"
        target_p = p1 if p1.exists() else (p2 if p2.exists() else None)
        if target_p:
            try:
                existing_record = json.loads(target_p.read_text(encoding="utf-8"))
            except Exception:
                pass
    if not existing_record:
        existing_record = (
            EXISTING_DEFS_BY_FILENAME.get(norm_fn)
            or EXISTING_DEFS_BY_FILENAME.get(norm_fn.lower())
            or EXISTING_DEFS_BY_FILENAME.get(base_name)
            or EXISTING_DEFS_BY_FILENAME.get(base_name.lower())
        )

    if existing_record:
        model_id = existing_record["model_id"]
        version_id = existing_record["versions"][0]["version_id"]
        file_id = existing_record["versions"][0]["files"][0]["file_id"]
        created_at = existing_record.get("created_at", NOW)
        published_at = existing_record.get("published_at", NOW)
        samples = existing_record["versions"][0].get("samples", [])
    else:
        model_id = existing_model_id or uuid.uuid4().hex
        version_id = uuid.uuid4().hex
        file_id = uuid.uuid4().hex
        created_at = NOW
        published_at = NOW
        samples = []

    full_path = COMFY_ROOT / file_category / rel_filename
    if not full_path.exists():
        raise FileNotFoundError(f"Missing file: {full_path}")
    
    file_size = full_path.stat().st_size
    existing_sha = None
    if existing_record and existing_record.get("versions"):
        v_files = existing_record["versions"][0].get("files", [])
        if v_files and v_files[0].get("sha256"):
            existing_sha = v_files[0]["sha256"]
    sha256 = existing_sha or get_file_sha256(full_path)

    # If samples is empty, check for preview image
    if not samples:
        img_path = find_preview_image(full_path)
        if img_path:
            sample_id = uuid.uuid4().hex
            sample_obj = copy_sample_image(img_path, model_id, version_id, sample_id)
            samples.append(sample_obj)

    base_model_id = base_model_ref[0] if base_model_ref else None
    base_version_id = base_model_ref[1] if base_model_ref else None
    base_file_id = base_model_ref[2] if base_model_ref else None

    # Detect precision
    precision = "FP16"
    lower_name = rel_filename.lower()
    if "fp8" in lower_name:
        precision = "FP8"
    elif "bf16" in lower_name:
        precision = "BF16"
    elif "fp32" in lower_name:
        precision = "FP32"

    record = {
        "title": title,
        "category": category_name,
        "model_type": model_type,
        "description": description,
        "tags": tags or [],
        "compatibility": {
            "base_model": base_model,
            "base_model_id": base_model_id,
            "base_version_id": base_version_id,
            "base_file_id": base_file_id,
            "vae": vae,
            "text_encoder": text_encoder,
            "text_encoder_2": text_encoder_2,
            "clip_type": clip_type,
            "parent_model": None,
            "supported_modes": (
                supported_modes
                if supported_modes is not None
                else derive_supported_modes(
                    architecture=base_model,
                    model_type=model_type,
                    title=title,
                    filename=rel_filename,
                    tags=tags,
                )
            ),
        },
        "generation": {
            "trigger_words": trigger_words or [],
            "sampler": sampler,
            "steps_min": steps_min,
            "steps_max": steps_max,
            "cfg_min": cfg_min,
            "cfg_max": cfg_max,
            "clip_skip": 1,
            "prompt": "",
            "negative_prompt": "",
        },
        "permissions": {
            "commercial": True,
            "sell_model": True,
            "remix": True,
            "generation_services": True,
            "allow_download": True,
            "credit_required": True,
        },
        "visibility": "Public",
        "user_id": None,
        "model_id": model_id,
        "created_at": created_at,
        "updated_at": NOW,
        "published_at": published_at,
        "moderation_status": "approved",
        "moderation_notes": None,
        "versions": [
            {
                "version_id": version_id,
                "name": "v1.0",
                "created_at": created_at,
                "files": [
                    {
                        "file_id": file_id,
                        "filename": norm_fn,
                        "size": file_size,
                        "sha256": sha256,
                        "precision": precision,
                        "visible": True,
                        "stored_name": "",
                        "category": file_category,
                    }
                ],
                "samples": samples,
            }
        ],
    }

    # Save to both definitions folders
    content = json.dumps(record, ensure_ascii=False, indent=2)
    (DEFS_ROOT_WORKSPACE / f"{model_id}.json").write_text(content, encoding="utf-8")
    (DEFS_ROOT_BACKEND / f"{model_id}.json").write_text(content, encoding="utf-8")

    # Update in-memory lookup cache to prevent duplicate UUID creation in same run
    EXISTING_DEFS_BY_FILENAME[norm_fn] = record
    EXISTING_DEFS_BY_FILENAME[norm_fn.lower()] = record
    EXISTING_DEFS_BY_FILENAME[base_name] = record
    EXISTING_DEFS_BY_FILENAME[base_name.lower()] = record

    # Sync to DB
    try:
        get_db().upsert_model(record)
    except Exception as exc:
        print(f"  Warning: DB sync failed for {title}: {exc}")

    return record

def main():
    print("=== SoloTensor Model Catalog Registration ===")
    created_bases = {}

    # ---------------------------------------------------------
    # 1. LTX-Video 2.3 Base Models
    # ---------------------------------------------------------
    print("\n1. Registering/Updating LTX-Video Models...")
    ltx_rec = build_model_record(
        title="LTX-Video 2.3",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="ltx-2.3-22b-distilled_transformer_only_fp8_scaled.safetensors",
        file_category="diffusion_models",
        base_model="LTX-Video 2.3",
        vae="LTX23_video_vae_bf16.safetensors",
        text_encoder="gemma_3_12B_it_fp8_e4m3fn.safetensors",
        text_encoder_2="ltx-2.3_text_projection_bf16.safetensors",
        clip_type="ltxv",
        sampler="DPM++ 2M Karras",
        steps_min=20,
        steps_max=35,
        cfg_min=3.0,
        cfg_max=7.0,
    )
    created_bases["ltx"] = (
        ltx_rec["model_id"],
        ltx_rec["versions"][0]["version_id"],
        ltx_rec["versions"][0]["files"][0]["file_id"],
    )
    print(f"  Registered {ltx_rec['title']} ({ltx_rec['model_id']}) with VAE: {ltx_rec['compatibility']['vae']} and CLIP: {ltx_rec['compatibility']['text_encoder']}")

    dasiwa_rec = build_model_record(
        title="Dasiwa LTX-2.3 DragonLeap V4",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="DasiwaLTX23_dragonleapV4.safetensors",
        file_category="diffusion_models",
        base_model="LTX-Video 2.3",
        vae="LTX23_video_vae_bf16.safetensors",
        text_encoder="gemma_3_12B_it_fp8_e4m3fn.safetensors",
        text_encoder_2="ltx-2.3_text_projection_bf16.safetensors",
        clip_type="ltxv",
        sampler="DPM++ 2M Karras",
        steps_min=20,
        steps_max=35,
        cfg_min=3.0,
        cfg_max=7.0,
    )
    print(f"  Registered {dasiwa_rec['title']} ({dasiwa_rec['model_id']}) with VAE: {dasiwa_rec['compatibility']['vae']} and CLIP: {dasiwa_rec['compatibility']['text_encoder']}")

    # ---------------------------------------------------------
    # 2. Krea 2 Base Models
    # ---------------------------------------------------------
    print("\n2. Registering/Updating Krea 2 Models...")
    krea_rec = build_model_record(
        title="Krea 2 Turbo",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="krea2/krea2_turbo_fp8_scaled.safetensors",
        file_category="diffusion_models",
        base_model="Krea-2",
        vae="wan_2.1_vae.safetensors",
        text_encoder="qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        clip_type="krea2",
        sampler="euler",
        steps_min=20,
        steps_max=30,
        cfg_min=1.0,
        cfg_max=1.0,
    )
    created_bases["krea"] = (
        krea_rec["model_id"],
        krea_rec["versions"][0]["version_id"],
        krea_rec["versions"][0]["files"][0]["file_id"],
    )
    print(f"  Registered {krea_rec['title']} ({krea_rec['model_id']}) with VAE: {krea_rec['compatibility']['vae']} and CLIP: {krea_rec['compatibility']['text_encoder']}")

    pornmaster_rec = build_model_record(
        title="NSFW Porn Master Krea 2",
        category_name="Concept",
        model_type="Checkpoint",
        rel_filename="krea2/pornmasterKrea2_v2TurboBF16.safetensors",
        file_category="diffusion_models",
        base_model="Krea-2",
        vae="wan_2.1_vae.safetensors",
        text_encoder="qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        clip_type="krea2",
        sampler="euler",
        steps_min=20,
        steps_max=30,
        cfg_min=1.0,
        cfg_max=1.0,
    )
    print(f"  Registered {pornmaster_rec['title']} ({pornmaster_rec['model_id']}) with VAE: {pornmaster_rec['compatibility']['vae']} and CLIP: {pornmaster_rec['compatibility']['text_encoder']}")

    # ---------------------------------------------------------
    # 3. Z-Image Models
    # ---------------------------------------------------------
    print("\n3. Registering/Updating Z-Image Models...")
    zimage_rec = build_model_record(
        title="Z Image Turbo",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="z-image/z_image_turbo_bf16.safetensors",
        file_category="diffusion_models",
        base_model="Z-Image-Turbo",
        vae="z-image_turbo_vae.safetensors",
        text_encoder="qwen_3_4b.safetensors",
        clip_type="lumina2",
        sampler="euler",
        steps_min=20,
        steps_max=30,
        cfg_min=1.0,
        cfg_max=1.0,
    )
    created_bases["zimage"] = (
        zimage_rec["model_id"],
        zimage_rec["versions"][0]["version_id"],
        zimage_rec["versions"][0]["files"][0]["file_id"],
    )
    print(f"  Registered {zimage_rec['title']} ({zimage_rec['model_id']}) with VAE: {zimage_rec['compatibility']['vae']} and CLIP: {zimage_rec['compatibility']['text_encoder']}")

    beyond_rec = build_model_record(
        title="Beyond Reality v3.0 (Z-Image)",
        category_name="Style",
        model_type="Checkpoint",
        rel_filename="z-image/beyondREALITY_V30.safetensors",
        file_category="diffusion_models",
        base_model="Z-Image-Turbo",
        vae="z-image_turbo_vae.safetensors",
        text_encoder="qwen_3_4b.safetensors",
        clip_type="lumina2",
        sampler="euler",
        steps_min=20,
        steps_max=30,
        cfg_min=1.0,
        cfg_max=1.0,
    )
    print(f"  Registered {beyond_rec['title']} ({beyond_rec['model_id']}) with VAE: {beyond_rec['compatibility']['vae']} and CLIP: {beyond_rec['compatibility']['text_encoder']}")

    z_gguf_rec = build_model_record(
        title="Z-Image Turbo Q8 GGUF",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="z-image/z-image-turbo-q8_0.gguf",
        file_category="unet",
        base_model="Z-Image-Turbo",
        vae="z-image_turbo_vae.safetensors",
        text_encoder="qwen_3_4b.safetensors",
        clip_type="lumina2",
        sampler="euler",
        steps_min=20,
        steps_max=30,
        cfg_min=1.0,
        cfg_max=1.0,
    )
    print(f"  Registered {z_gguf_rec['title']} ({z_gguf_rec['model_id']}) with VAE: {z_gguf_rec['compatibility']['vae']} and CLIP: {z_gguf_rec['compatibility']['text_encoder']}")

    # ---------------------------------------------------------
    # 4. Qwen-Image Models
    # ---------------------------------------------------------
    print("\n4. Registering/Updating Qwen-Image Models...")
    qwen_edit_rec = build_model_record(
        title="Qwen Image Edit 2511",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="qwen/qwen_image_edit_2511_fp8mixed.safetensors",
        file_category="diffusion_models",
        base_model="Qwen-Image",
        vae="qwen_image_vae.safetensors",
        text_encoder="qwen_2.5_vl_7b_fp8_scaled.safetensors",
        clip_type="qwen2_5_vl",
        sampler="euler",
        steps_min=20,
        steps_max=35,
        cfg_min=1.0,
        cfg_max=3.5,
    )
    created_bases["qwen"] = (
        qwen_edit_rec["model_id"],
        qwen_edit_rec["versions"][0]["version_id"],
        qwen_edit_rec["versions"][0]["files"][0]["file_id"],
    )
    print(f"  Registered {qwen_edit_rec['title']} ({qwen_edit_rec['model_id']}) with VAE: {qwen_edit_rec['compatibility']['vae']} and CLIP: {qwen_edit_rec['compatibility']['text_encoder']}")

    qwen_anime_rec = build_model_record(
        title="Qwen Image Edit - Anime to Real Characters",
        category_name="Style",
        model_type="Checkpoint",
        rel_filename="qwen/Qwen-image Edit Anything to Real Characters动漫转真人.safetensors",
        file_category="diffusion_models",
        base_model="Qwen-Image",
        vae="qwen_image_vae.safetensors",
        text_encoder="qwen_2.5_vl_7b_fp8_scaled.safetensors",
        clip_type="qwen2_5_vl",
        sampler="euler",
        steps_min=20,
        steps_max=35,
        cfg_min=1.0,
        cfg_max=3.5,
    )
    print(f"  Registered {qwen_anime_rec['title']} ({qwen_anime_rec['model_id']}) with VAE: {qwen_anime_rec['compatibility']['vae']} and CLIP: {qwen_anime_rec['compatibility']['text_encoder']}")

    white_qwen_rec = build_model_record(
        title="White QWEN Alpha 01 FP8",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="qwen/whiteQWEN_alpha01-fp8_e4m3fn.safetensors",
        file_category="diffusion_models",
        base_model="Qwen-Image",
        vae="qwen_image_vae.safetensors",
        text_encoder="qwen_2.5_vl_7b_fp8_scaled.safetensors",
        clip_type="qwen2_5_vl",
        sampler="euler",
        steps_min=20,
        steps_max=35,
        cfg_min=1.0,
        cfg_max=3.5,
    )
    print(f"  Registered {white_qwen_rec['title']} ({white_qwen_rec['model_id']}) with VAE: {white_qwen_rec['compatibility']['vae']} and CLIP: {white_qwen_rec['compatibility']['text_encoder']}")

    qwen_aio_rec = build_model_record(
        title="Qwen Rapid AIO NSFW v11.4",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="qwen/Qwen-Rapid-AIO-NSFW-v11.4.safetensors",
        file_category="checkpoints",
        base_model="Qwen-Image",
        vae="qwen_image_vae.safetensors",
        text_encoder="qwen_2.5_vl_7b_fp8_scaled.safetensors",
        clip_type="qwen2_5_vl",
        sampler="euler",
        steps_min=20,
        steps_max=35,
        cfg_min=1.0,
        cfg_max=3.5,
    )
    print(f"  Registered {qwen_aio_rec['title']} ({qwen_aio_rec['model_id']}) with VAE: {qwen_aio_rec['compatibility']['vae']} and CLIP: {qwen_aio_rec['compatibility']['text_encoder']}")

    # ---------------------------------------------------------
    # 5. Stable Diffusion & SDXL Checkpoints
    # ---------------------------------------------------------
    print("\n5. Registering SD / SDXL Models...")
    albedo_rec = build_model_record(
        title="AlbedoBase XL v3.1 Large",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="sd/albedobaseXL_v31Large.safetensors",
        file_category="checkpoints",
        base_model="SDXL 1.0",
        vae=None,  # baked-in SDXL VAE
        text_encoder=None,  # baked-in SDXL CLIP
        sampler="DPM++ 2M Karras",
        steps_min=25,
        steps_max=35,
        cfg_min=5.0,
        cfg_max=7.5,
    )
    created_bases["sdxl"] = (
        albedo_rec["model_id"],
        albedo_rec["versions"][0]["version_id"],
        albedo_rec["versions"][0]["files"][0]["file_id"],
    )
    print(f"  Registered {albedo_rec['title']} ({albedo_rec['model_id']})")

    illustrious_rec = build_model_record(
        title="Realism Illustrious v5.5 FP16",
        category_name="Style",
        model_type="Checkpoint",
        rel_filename="sd/realismIllustriousBy_v55FP16.safetensors",
        file_category="checkpoints",
        base_model="Illustrious",
        vae=None,
        text_encoder=None,
        sampler="Euler a",
        steps_min=20,
        steps_max=28,
        cfg_min=4.5,
        cfg_max=6.5,
    )
    print(f"  Registered {illustrious_rec['title']} ({illustrious_rec['model_id']})")

    rev_rec = build_model_record(
        title="ReV Animated v2 Rebirth",
        category_name="Style",
        model_type="Checkpoint",
        rel_filename="sd/revAnimated_v2Rebirth.safetensors",
        file_category="checkpoints",
        base_model="SD 1.5",
        vae=None,
        text_encoder=None,
        sampler="DPM++ 2M Karras",
        steps_min=20,
        steps_max=30,
        cfg_min=6.0,
        cfg_max=8.0,
    )
    created_bases["sd15"] = (
        rev_rec["model_id"],
        rev_rec["versions"][0]["version_id"],
        rev_rec["versions"][0]["files"][0]["file_id"],
    )
    print(f"  Registered {rev_rec['title']} ({rev_rec['model_id']})")

    sam_rec = build_model_record(
        title="SAM 3.1 Multiplex FP16",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="sam3.1_multiplex_fp16.safetensors",
        file_category="checkpoints",
        base_model="SAM",
        vae=None,
        text_encoder=None,
    )
    print(f"  Registered {sam_rec['title']} ({sam_rec['model_id']})")

    melband_rec = build_model_record(
        title="MelBand Roformer FP16",
        category_name="General",
        model_type="Checkpoint",
        rel_filename="MelBandRoformer_fp16.safetensors",
        file_category="diffusion_models",
        base_model="Audio-Separator",
        vae=None,
        text_encoder=None,
    )
    print(f"  Registered {melband_rec['title']} ({melband_rec['model_id']})")

    # ---------------------------------------------------------
    # 6. LoRAs (All 44 LoRAs mapped to their base models)
    # ---------------------------------------------------------
    print("\n6. Registering LoRAs...")
    lora_root = COMFY_ROOT / "loras"
    lora_files = list(lora_root.rglob("*.safetensors"))
    print(f"Found {len(lora_files)} LoRAs in {lora_root}")

    for lora_path in lora_files:
        rel_filename = str(lora_path.relative_to(lora_root)).replace("\\", "/")
        norm_rel = rel_filename.lower()

        # Determine architecture and base model
        base_arch = "General"
        base_ref = None
        category = "Style"

        if "krea" in norm_rel:
            base_arch = "Krea-2"
            base_ref = created_bases["krea"]
        elif "ltx" in norm_rel:
            base_arch = "LTX-Video 2.3"
            base_ref = created_bases["ltx"]
        elif "z-image" in norm_rel or "zit" in norm_rel:
            base_arch = "Z-Image-Turbo"
            base_ref = created_bases["zimage"]
        elif "qwen" in norm_rel or "qe25" in norm_rel:
            base_arch = "Qwen-Image"
            base_ref = created_bases["qwen"]
        elif "sdxl" in norm_rel or "pony" in norm_rel or "illustrious" in norm_rel:
            base_arch = "SDXL 1.0"
            base_ref = created_bases["sdxl"]
        else:
            base_arch = "Krea-2"
            base_ref = created_bases["krea"]

        # Category detection
        if "character" in norm_rel:
            category = "Character"
        elif "concept" in norm_rel:
            category = "Concept"
        elif "training" in norm_rel:
            category = "General"

        # Check for sidecar metadata for display title & triggers
        meta_file = lora_path.with_suffix(".metadata.json")
        title = lora_path.stem.replace("_", " ").replace("-", " ")
        triggers = []
        tags = []
        if meta_file.exists():
            try:
                mdata = json.loads(meta_file.read_text(encoding="utf-8", errors="ignore"))
                if mdata.get("model_name"):
                    title = mdata["model_name"]
                triggers = mdata.get("trainedWords", []) or []
                tags = mdata.get("tags", []) or []
            except Exception:
                pass

        lora_rec = build_model_record(
            title=title,
            category_name=category,
            model_type="LoRA",
            rel_filename=rel_filename,
            file_category="loras",
            base_model=base_arch,
            vae=None,
            text_encoder=None,
            trigger_words=triggers,
            base_model_ref=base_ref,
            tags=tags,
        )
        sys.stdout.buffer.write(
            f"  Registered LoRA: {lora_rec['title']} ({lora_rec['model_id']}) -> Base: {base_arch}\n".encode("utf-8", errors="replace")
        )

    print("\n=== All Models & LoRAs Successfully Registered! ===")

if __name__ == "__main__":
    main()
