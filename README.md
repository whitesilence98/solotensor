# SoloTensor (Comfy Studio)

A local, privacy-first generative AI studio designed to replace fragile node graphs with a pro-grade creative workspace: Obsidian brutalist Next.js 15 UI → FastAPI wrapper → local headless ComfyUI → local disk asset storage.

```text
Browser (Next.js :3000) ──► FastAPI (:8000) ──► ComfyUI (:8188, HTTP + WS)
                                   │
                                   └──► disk (STORAGE_DIR) — served at /files
```

No cloud dependencies, no MinIO — generated assets and models stay strictly on your local disk and are served directly by FastAPI.

---

## Key Features

- **Multi-Tab Generation Studio (`/`)**:
  - **Text2Img**: Pure latent synthesis via decoupled base workflow (`workflow_generate_t2i.json`).
  - **Img2Img**: Native image variation & style transfer via dedicated workflow (`workflow_generate_i2i.json`) with native `LoadImage`, `VAEEncode`, `KSampler`, UNET/CLIP/VAE loaders, and dynamic LoRA chaining.
  - **Edit & Inpaint**: Regional mask conditioning and inpainting.
  - **Video**: Stable Video Diffusion (SVD) and Wan video diffusion.
  - **Prime Pro Pipeline**: Sequential chaining across Base generation → SeedVR2 DiT Upscale → Cascading YOLO Detailers.
  - **Tab State Isolation**: Zero cross-contamination between modes (isolated prompts, denoise, steps, CFG, aspect ratios, and draft persistence).
  - **Prompt Composer**: Shared prompt structuring and tag composition across Text2Img and Img2Img.

- **Decoupled Multi-Stage Pipeline**:
  - **Stage 1 (Base T2I/I2I)**: High-speed base synthesis saving immediately to terminal storage.
  - **Stage 2 (SeedVR2 DiT Upscaler)**: Generative super-resolution (1.5x–4x) with LAB color correction and latent noise control.
  - **Stage 3 (ADetailer Cascade)**: Sequential multi-target detection & repair (Face, Hands, Body) with automatic bypass pruning.
  - **API Engine Resilience**: Automatic `extra_pnginfo` fallback injection in ComfyUI `/prompt` queue to prevent crashes from custom inspection nodes (`Show Text`, `Inspire-Pack`, `Easy-Use`).

- **Model Management (`/models`)**:
  - Authoritative 16-type taxonomy (`Checkpoint`, `LoRA`, `LoKr`, `VAE`, `ControlNet`, `Wildcards`, etc.).
  - Dual `.safetensors` and `.sft` weight format support.
  - Civitai metadata fetching, trigger word extraction, and sidecar caching.
  - Persistent polymorphic Compatibility & Conditioning Stack.

- **Parametric AI Tools Engine (`/tools`)**:
  - Convert any ComfyUI `workflow_api.json` graph into a reusable, parameter-bound tool.
  - Dynamic schema generation, input interpolation, and standalone tool execution.

- **Asset Library & Interrogation (`/assets`)**:
  - Searchable lightbox gallery with full prompt metadata and generation parameters.
  - Automated deep tagging via WD14 / BLIP tagger interrogation.
  - SQLite metadata attribution and user credit tracking.

---

## Prerequisites

- **ComfyUI** installed locally (Windows portable build or standard git clone).
- **Node.js 18+** for the frontend.
- **Python 3.11+** for the backend.
- Model checkpoints in `ComfyUI/models/checkpoints/` (e.g. `sd_xl_base_1.0.safetensors`, `flux1-dev.safetensors`, or custom weights).

---

## Quickstart

### 1. Start ComfyUI in Headless Mode

```powershell
cd C:\path\to\ComfyUI
python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
```

`--listen` exposes HTTP on `:8188` and WebSocket on `ws://127.0.0.1:8188/ws` without opening the browser GUI. Verify with:
```powershell
curl http://127.0.0.1:8188/system_stats
```

### 2. Start the FastAPI Backend

```powershell
cd backend
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

- API Interactive Docs: `http://localhost:8000/docs`
- Generated images land in `backend/generated/` and are served at `http://localhost:8000/files/...`

### 3. Start the Next.js Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Architecture & Codebase Map

For detailed architecture contracts, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/generate_studio_architecture.md`](docs/generate_studio_architecture.md), and [`DESIGN.md`](DESIGN.md).

| Path | Role |
|---|---|
| `docs/ARCHITECTURE.md` | System taxonomy, 16 model types, conditioning stack contracts |
| `docs/generate_studio_architecture.md` | Multi-tab studio state isolation and workflow routing specification |
| `DESIGN.md` | Obsidian & acid-lime brutalist design tokens and UI component rules |
| `PRODUCT.md` | Product boundaries, persona definitions, and feature scopes |
| `backend/app/config.py` | Pydantic-settings configuration, environment variables |
| `backend/app/schemas.py` | Typed request/response models (`GenerateRequest`, `UpscaleConfig`, `DetailerConfig`) |
| `backend/app/services/workflow_router.py` | Dynamic workflow selection (`T2I`, `I2I`, `Detailer`, `Upscaler`) & graph patcher |
| `backend/app/services/workflow_bypass.py` | Extensible `BypassEngine` & sequential cascade rewiring |
| `backend/app/services/comfy_client.py` | Workflow builder, `/prompt` queue with `extra_pnginfo` safeguard, WS progress streaming |
| `backend/app/services/models.py` | 16-type model catalog scanner, Civitai metadata, path containment |
| `backend/app/services/ai_tools.py` | Parametric workflow tools builder and runner |
| `backend/app/services/storage.py` | Local disk asset writes, public `/files` endpoints, gallery indexing |
| `backend/app/main.py` | FastAPI route definitions and thin endpoint dispatchers |
| `frontend/src/app/page.tsx` | Main Generation Studio page |
| `frontend/src/components/ControlPanel.tsx` | Multi-tab generation controls (`Text2Img`, `Img2Img`, `Edit`, `Video`, `Prime`) |
| `frontend/src/components/PromptComposer.tsx` | Shared prompt composition & tag component |
| `frontend/src/components/UpscalePanel.tsx` | SeedVR2 DiT AI & model upscaler controls |
| `frontend/src/components/DetailerPanel.tsx` | Cascading multi-target YOLO detailer controls |
| `frontend/src/lib/api.ts` | Typed frontend API client & WebSocket progress listener |

---

## Verification & Testing

Both frontend and backend are covered by automated verification suites:

### Backend Test Suite
Run from `backend/`:
```powershell
$env:PYTHONPATH='backend'; python -m unittest discover -s tests
```
*Status:* **324 tests passing** (`OK`, 0 errors, 0 failures). Tests use mock isolation fixtures and do not require a live GPU.

### Frontend Typecheck & Build
Run from `frontend/`:
```powershell
npx tsc --noEmit
npm run build
```
*Status:* TypeScript compilation passes with **0 errors**.

---

## Configuration (`backend/.env`)

| Variable | Default | Note |
|---|---|---|
| `COMFY_HOST` | `127.0.0.1:8188` | ComfyUI HTTP + WebSocket host |
| `STORAGE_DIR` | `generated` | Local directory where generated assets are stored |
| `FILES_PUBLIC_BASE` | `http://localhost:8000` | Base URL used to construct asset links |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS permitted origins |
| `ALLOWED_ORIGIN_REGEX` | local ports `3000`–`3999` | Localhost dynamic port regex |
| `COMFY_TIMEOUT` | `300` | Generation timeout in seconds |

---

## License & Privacy

SoloTensor is built for **100% local, private operation**. Your prompts, generated images, weights, and workflow graphs never leave your local machine.
