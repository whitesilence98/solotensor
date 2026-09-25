# Comfy Studio

A full-stack AI generation studio: dark-themed Next.js UI → FastAPI wrapper → local headless ComfyUI → local-disk asset storage served by FastAPI.

```text
Browser (Next.js :3000) ──► FastAPI (:8000) ──► ComfyUI (:8188, HTTP + WS)
                                   │
                                   └──► disk (STORAGE_DIR) — served at /files
```

No MinIO, no object storage — generated images are plain files on disk, served statically by the API itself.

## Prerequisites

- **ComfyUI** installed locally (Windows portable build works fine)
- **Node.js 18+** for the frontend
- **Python 3.11+** (or Docker, optional)
- Model checkpoints in `ComfyUI/models/checkpoints/`:
  - `sd_xl_base_1.0.safetensors` (SDXL)
  - `flux1-dev.safetensors` (FLUX.1) — optional
  - or adjust `MODEL_PRESETS` in `backend/app/services/comfy_client.py` to whatever you have

## 1. Start ComfyUI in headless/listen mode

```powershell
cd C:\path\to\ComfyUI
python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
```

`--listen` exposes the API (HTTP on `:8188` and WebSocket on `ws://:8188/ws`) without opening the UI. Verify: `curl http://127.0.0.1:8188/system_stats`.

## 2. Start the backend (no Docker needed)

```powershell
cd comfy-studio-app/backend
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`. Images land in `backend/generated/` and are served at `http://localhost:8000/files/...`.

Prefer Docker? `docker compose up --build` still works (images go to a named volume instead of `backend/generated/`).

## 3. Start the frontend

```powershell
cd comfy-studio-app/frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

## Architecture

| Path | Role |
|---|---|
| `backend/app/config.py` | pydantic-settings, all env-tunable |
| `backend/app/schemas.py` | Typed request/response models |
| `backend/app/services/comfy_client.py` | Workflow builder, `/prompt` queue, WS progress stream, `/history` + `/view` fetch |
| `backend/app/services/storage.py` | Disk writes under `STORAGE_DIR`, public `/files` URLs, gallery listing |
| `backend/app/main.py` | `POST /api/v1/generate`, `WS /api/v1/ws/progress/{client_id}`, `GET /api/v1/gallery`, `GET /api/v1/health`, `/files` static mount |
| `frontend/src/components/` | `SidebarNav`, `ControlPanel`, `ImageUpload`, `CanvasPreview` |
| `frontend/src/lib/api.ts` | Typed fetch + WebSocket client |

## How a generation flows

1. UI opens a relay WS: `ws://localhost:8000/api/v1/ws/progress/{client_id}` (the backend forwards ComfyUI's `/ws` frames, including binary preview thumbnails).
2. UI POSTs the prompt to `/api/v1/generate` with that `client_id`.
3. Backend builds the API-format graph (checkpoint → CLIP encode → KSampler → VAE decode → SaveImage), queues it at `POST /prompt`.
4. Progress events stream back through the relay; the UI renders a live progress bar.
5. On completion the backend reads `/history/{prompt_id}`, downloads each output from `/view`, writes it to disk under `{prompt_id}/{hash}.png`, and returns `http://localhost:8000/files/...` URLs.
6. The gallery (`GET /api/v1/gallery`) lists recent files from disk, newest first.

## Configuration

Copy `backend/.env.example` to `backend/.env`. Key variables:

| Var | Default | Note |
|---|---|---|
| `COMFY_HOST` | `127.0.0.1:8188` | Use `host.docker.internal:8188` from containers |
| `STORAGE_DIR` | `generated` | Where images are written (relative to backend cwd) |
| `FILES_PUBLIC_BASE` | `http://localhost:8000` | Base URL handed to the browser for `/files` |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins; match scheme, host, and port exactly |
| `ALLOWED_ORIGIN_REGEX` | local ports `3000`–`3999` | Development fallback for `localhost` and `127.0.0.1`; clear it in production |

If the frontend is opened through a LAN address, append that exact origin to `ALLOWED_ORIGINS`, for example `http://192.168.1.50:3000`. Restart Uvicorn after changing `.env`; CORS settings are read at startup.

## Troubleshooting

- **Health shows `comfy: down`** — ComfyUI isn't running with `--listen`, or the container can't reach `host.docker.internal`.
- **Images 404 in gallery** — `FILES_PUBLIC_BASE` must match how your browser reaches the backend (`localhost:8000`), not the internal container address.
- **Generation times out** — raise `COMFY_TIMEOUT` in `config.py` for slow GPUs.
- **Checkpoint not found errors** — the name in `MODEL_PRESETS` must exactly match the filename in `ComfyUI/models/checkpoints/`.