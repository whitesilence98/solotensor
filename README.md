# SoloTensor (Comfy Studio)

A local-first creative workspace: Next.js 15 UI, FastAPI API, local disk assets, and an external ComfyUI rendering engine.

```text
Browser (Next.js :3000) -> FastAPI (:8000) -> ComfyUI (:8188, HTTP + WS)
                                |
                                +-> database + disk (STORAGE_DIR, served at /files)
```

## Current capabilities and limits

- **Studio (`/generate`)**: isolated Text2Img, Img2Img, Edit, Video and Prime tabs; shared `StudioPromptBar` for prompts and generation actions.
- **Image workflows**: bundled text-to-image and image-to-image graphs; optional SeedVR2 upscaling and detailer stages. Rendering requires compatible models and the graph's ComfyUI custom nodes, not just a catalog entry.
- **Edit**: the current client submits `mode: "edit"`, a source image and an optional second reference. The backend uploads both and patches a dedicated edit graph; without a second reference it reuses the source. This is implemented workflow plumbing, not a no-op. Arbitrary mask-based regional inpainting and successful live renders are not established by this documentation; do not infer them from the Edit label or mask-related UI state.
- **Video**: the bundled **LTX-Video 2.3** graph supports text-to-video and image-to-video inputs. SVD, Wan and other video taxonomy labels do **not** mean live rendering support. The backend rejects non-LTX selections; the gallery selection labels/gates the bundled workflow rather than replacing its transformer, VAE or encoder weights.
- **Models (`/models`)**: catalog, local scanning, metadata and compatibility records using the authoritative 16-type taxonomy, including `.safetensors` and `.sft`. Taxonomy coverage is not an execution compatibility matrix.
- **Tools (`/tools`)**: browse saved tools and author parameter-bound workflow definitions. Tool execution needs the external engine, required nodes and weights.
- **Assets (`/assets`)**: browse stored assets and inspect metadata without a running ComfyUI engine.

Browsing existing **assets, models and tools** needs the API, database and local storage, but not ComfyUI. Live engine model discovery and rendering do need ComfyUI; local filesystem discovery needs a configured accessible model root. No GPU or local LLM is started by this repository's launcher.

## Local quickstart (Windows)

Prerequisites: Python 3.11+, a Node.js version compatible with Next.js 15, and npm. Run once from the repository root:

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
# Only create .env if you do not already have one; preserve existing configuration.
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
Push-Location frontend
npm ci
Pop-Location
```

Then run:

```powershell
.\run-local.bat
```

The launcher checks dependencies before opening service windows, uses **`backend/.venv`** (no global-Python fallback), and starts only:

- FastAPI/Uvicorn at `http://127.0.0.1:8000`, bound to loopback.
- Next.js dev at `http://127.0.0.1:3000`, explicitly bound to loopback on port 3000.

It polls `GET /api/v1/ready` until HTTP 200 with `status: "ready"`, then polls the frontend HTTP root before opening **`http://127.0.0.1:3000/generate`**. API readiness means core database and storage are ready; it returns 503 otherwise and is independent of ComfyUI availability. Each service gets at most 60 attempts with a two-second request timeout and one-second retry intervals, not a fixed startup sleep.

A dependency or readiness failure exits nonzero. Read the service window's error, check `.env`, DB/storage permissions and port conflicts; close any spawned service windows before retrying. The launcher does not silently install dependencies, kill existing processes, or automatically clean up windows after a failed startup. Close both windows to stop the successful run. API docs: `http://127.0.0.1:8000/docs`.

### Enable generation separately

Install ComfyUI, the custom nodes required by the selected bundled workflow, and its exact model weights. From your **separate ComfyUI installation**:

```powershell
python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
```

Set `COMFY_HOST` in `backend/.env` if that address differs. Merely starting ComfyUI does not install workflow dependencies or verify model compatibility. This setup guide does not certify GPU inference or live Edit/Video output.

## Configuration (`backend/.env`)

See `backend/app/config.py` and `backend/.env.example` for the full configuration.

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | Set explicitly to `production` outside local development |
| `COMFY_HOST` | `127.0.0.1:8188` | External ComfyUI HTTP/WS host |
| `STORAGE_DIR` | `generated` | Asset storage; under `backend` when launched by the batch file |
| `FILES_PUBLIC_BASE` | `http://localhost:8000` | Base for generated `/files` links |
| `COMFY_MODEL_ROOT` | unset | Optional same-host ComfyUI model directory for filesystem discovery/install |
| `DB_PATH` | `solotensor.db` | Local SQLite fallback when `DATABASE_URL` is unset |
| `COMFY_TIMEOUT` | `1800` | Generation timeout, seconds |

For production configuration, explicitly set `APP_ENV=production`, supply a unique random `JWT_SECRET` of at least 32 characters, set `ALLOWED_ORIGIN_REGEX` to empty, and list permitted origins explicitly in `ALLOWED_ORIGINS`. Production startup rejects a blank, short or publicly known default JWT secret. These configuration checks do **not** establish public-hosting readiness. The unregistered `st_agent_*` authentication bypass and hardcoded username promotion have been removed, and unknown user IDs now resolve to no roles, but the following remain open before any public deployment: the unauthenticated `/files` static mount and asset tag/save mutations, `?user_id=` gallery exposure, the unauthenticated progress WebSocket, credit refund/idempotency gaps, missing rate limiting, and browser bearer-token storage exposed to same-origin XSS.

Removing the bypass does not demote accounts already granted elevated roles: existing `user_roles` and `users.role` rows survive the code change. Operators must audit any privileged or demo accounts created under the old behaviour and decide manually; nothing auto-clears production rows.

Local-first is a deployment choice, not a guarantee of zero outbound traffic. PostgreSQL (`DATABASE_URL`) and S3-compatible storage settings also exist; inspect your configuration rather than assuming every deployment is filesystem-only. Metadata/download integrations and configured AI providers can contact external services. Review enabled features and credentials before sending sensitive data. The current browser bearer-token storage is exposed to same-origin XSS; this development setup is **not a production-safe multi-tenant deployment**. See [frontend security notes](frontend/FRONTEND.md#security-boundary).

## Architecture references

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`PRODUCT.md`](PRODUCT.md), [`DESIGN.md`](DESIGN.md), and [`CLAUDE.md`](CLAUDE.md). Where older route descriptions differ, the current studio implementation is `frontend/src/app/generate/page.tsx`, not the root page.

| Path | Role |
|---|---|
| `backend/app/schemas.py` | API contract authority |
| `backend/app/main.py` | Routes and generation orchestration |
| `backend/app/services/workflow_router.py` | Bundled workflow patching, including Edit and LTX |
| `backend/app/services/comfy_client.py` | ComfyUI HTTP/WS and workflow templates |
| `backend/app/services/models.py` | Catalog and model discovery |
| `backend/app/services/ai_tools.py` | Parametric tool workflows |
| `backend/app/services/storage.py` | Local asset storage |
| `frontend/src/app/generate/page.tsx` | Studio state and request construction |
| `frontend/src/components/StudioPromptBar.tsx` | Shared studio prompt surface |
| `frontend/src/lib/api.ts` | Typed API client and bearer-token handling |

## Verification

Run backend checks from the repository root, using the project virtualenv:

```powershell
$env:PYTHONPATH='backend'
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests
```

Run frontend checks from `frontend/`:

```powershell
npx tsc --noEmit
npm run build
```

Tests should mock engine/network boundaries. Passing unit tests or a build does not establish live ComfyUI inference. No fixed test count or previously observed build result is a guarantee for your checkout.
