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
| `/` | **Workspace** | `Operate` & `Experience` | Primary creation studio. Enter prompt, select aspect ratio/visual preset, configure seeds/LoRAs, and generate onto live canvas. |
| `/tools` | **Tools Suite** | `Operate` | Browse and execute specialized single-purpose pipeline tools (Upscale, Inpaint, Remove BG). |
| `/tools/create` | **Tool Builder** | `Operate` | Author and save custom pipeline presets with pinned parameters. |
| `/models` | **Model Manager** | `Operate` | Inspect local checkpoints, LoRAs, and embeddings; trigger downloads and configure triggers. |
| `/assets` | **Asset Library** | `Operate` | Search, filter, and inspect generated assets. Lightbox view, copy metadata/prompt, download originals. |
| `/assist` | **AI Assist** | `Read` & `Operate` | Conversational persona-based assistant to optimize prompts and troubleshoot workflow issues. |
| `/settings` | **Settings** | `Operate` | Engine connectivity (FastAPI :8000, ComfyUI :8188), storage paths, and default generation parameters. |

---

## 4. Product Boundaries & Constraints
- **Honest Attribution**: All local generations are authored by `"You"`. No fabricated user metrics, public upvotes, or fake social feeds.
- **Local Runtime Guarantee**: Frontend runs on `:3000`, communicating exclusively with local FastAPI `:8000` via typed endpoints.
- **Hardware Awareness**: Generation parameters enforce hardware bounds (dimensions divisible by 8, steps 1–100, CFG 0–30, LoRA strength -10.0 to 10.0).
