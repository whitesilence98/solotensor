# SoloTensor Product Context

## 1. Product Vision
SoloTensor is a local, privacy-first generative AI studio connecting directly to ComfyUI. It replaces complex, fragile node graphs with an elegant, pro-grade studio interface designed for solo artists, designers, and AI creators.

---

## 2. Target Audience & Core Personas
- **The Solo Creator**: Independent designers and digital artists who generate high-fidelity imagery and video assets on their local GPU.
- **The Workflow Engineer**: Creators who train custom LoRAs, fine-tune prompts, and integrate specialized workflows (Face Restore, Upscaling, Background Removal).
- **Core Value Proposition**: 
  - Complete data privacy (100% local inference).
  - Frictionless ComfyUI integration without visual spaghetti nodes.
  - Studio-grade curation, tagging, and asset management.

---

## 3. Surface Definitions & Operational Modes

| Route | Name | Mode | User Job |
| :--- | :--- | :--- | :--- |
| `/` | **Workspace** | `Operate` & `Experience` | Primary creation studio with 5 isolated tabs (`Text2Img`, `Img2Img`, `Edit`, `Video`, `Prime`), Prompt Composer, and live canvas preview. |
| `/tools` | **Tools Suite** | `Operate` | Browse and execute specialized single-purpose pipeline tools (Upscale, Inpaint, Remove BG). |
| `/tools/create` | **Tool Builder** | `Operate` | Author and save custom pipeline presets with dynamic schema interpolation. |
| `/models` | **Model Manager** | `Operate` | Full catalog supporting 16 standardized model types (Checkpoints, Adapters, VAEs, Guidance, Inversions, Wildcards). Dual `.safetensors` & `.sft` support. |
| `/assets` | **Asset Library** | `Operate` | Search, filter, and inspect generated assets. Lightbox view, copy metadata/prompt, automated WD14/BLIP tagging, download originals. |
| `/assist` | **AI Assist** | `Read` | Code-only Q&A for the backend, workflows, and API contracts. Prompt writing and media planning live elsewhere. |
| `/flow` | **Creative Director** | `Read` & `Operate` | Describe a shot; the director returns shot cards you open in `/generate`. |
| `/settings` | **Settings** | `Operate` | Engine connectivity (FastAPI :8000, ComfyUI :8188), storage paths, and default generation parameters. |

---

## 4. Product Boundaries & Constraints
- **Honest Attribution**: All local generations are authored by `"You"`. No fabricated user metrics, public upvotes, or fake social feeds.
- **Local Runtime Guarantee**: Frontend runs on `:3000`, communicating exclusively with local FastAPI `:8000` via typed endpoints.
- **Hardware Awareness**: Generation parameters enforce hardware bounds (dimensions divisible by 8, steps 1–100, CFG 0–30, LoRA strength -10.0 to 10.0).
- **Architecture & Technical Contracts**: See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`DESIGN.md`](DESIGN.md).

---

## 5. Current Studio Capabilities: Decoupled Multi-Stage Modular Workflows

The generation architecture is cleanly decoupled into specialized ComfyUI workflows in [`backend/workflows/`](backend/workflows):

### 1. Stage 1: Pure Base Generation (T2I & Native I2I)
- **Text-to-Image (`workflow_generate_t2i.json`)**:
  - High-speed, focused text-to-image generator using Krea2 / Wan 2.1 DiT, Qwen3-VL CLIP, Wan VAE, and ClownsharKSampler.
  - **Terminal Save**: Node `1084` (`SaveImage`). The base image is saved to storage immediately upon completion, ensuring artwork is never lost if downstream stages fail.
- **Native Image-to-Image (`workflow_generate_i2i.json`)**:
  - Replaces synthetic ad-hoc node injection with a verified, native Image-to-Image ComfyUI graph.
  - **Core Nodes**: Node `30` (`LoadImage`), Node `32` (`VAEEncode`), Node `3` (`KSampler` with native `denoise`, `seed`, `steps`, `cfg`), and Nodes `6`/`7` (`CLIPTextEncode`).
  - **Model Loaders**: Node `593:590` (`UNETLoader`), Node `593:589` (`CLIPLoader`), Node `593:588` (`VAELoader`).
  - **Dynamic LoRA Injection**: Automatically splices chained `LoraLoader` nodes between the model loaders and the sampler/encoders.
  - **Terminal Save**: Node `9` (`SaveImage`) and Node `8` (`VAEDecode`), feeding cleanly into downstream Detailer and Upscaler passes.

### 2. Stage 2: SeedVR2 DiT Super-Resolution (`workflow_seedvr_upscaler.json`)
- **5 Nodes**: Dedicated generative upscaling using `seedvr2_ema_3b_fp8_e4m3fn.safetensors` or `seedvr2_ema_7b_fp8_e4m3fn.safetensors`.
- **Features**: Multiplier pills (`1x`, `1.5x`, `2x`, `3x`, `4x`), live target dimension preview, LAB color correction mode, and input/latent noise scale sliders. Zero ESRGAN dependencies.
- **Terminal Save**: Node `1090` (`SaveImage`). Reusable across `/generate`, `/tools`, and Asset Gallery.

### 3. Stage 3: Cascading Detailers & Styling (`workflow_detailer.json`)
- **26 Nodes**: Dedicated multi-target detection & inpainting suite with 5 passes: **Face** (yolov11l-face), **Foot** (adetailerFootYolov8x), **Breast** (female-breast-v4.7), **Hand** (hand_yolov9c), and **Vagina** (vagina-v4.2), followed by noise addition and image style filter.
- **Selective Bypass**: `apply_detailer_pipeline` prunes disabled passes and cleanly rewires image links directly from source image `1112` through active detailers to `1088:661`.
- **Terminal Save**: Node `1087` (`SaveImage`). Reusable across `/generate` and `/tools`.

### Sequential Orchestration & VRAM Isolation
- The FastAPI backend queues each stage sequentially, allowing ComfyUI to swap models cleanly between stages, completely eliminating monolithic graph VRAM spikes and out-of-memory crashes.
- Each stage produces exactly one terminal image, eliminating multi-image output bugs and maintaining a 100% test pass rate.

### Headless API Resilience
- The backend's ComfyUI client (`backend/app/services/comfy_client.py`) automatically injects a fallback `extra_data.extra_pnginfo.workflow` payload when queuing workflows. This prevents headless generation crashes caused by custom inspection nodes (e.g., `Show Text`, `Inspire-Pack`, `Easy-Use`) expecting UI canvas metadata.

### Unified Prompt Composer
- A reusable Prompt Composer component is integrated across both `Text2Img` and `Img2Img` studio tabs, offering tag-based prompt generation, style presets, and negative prompt management with identical UX.
