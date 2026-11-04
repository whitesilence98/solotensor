---
name: run-local
description: >-
  Standard operating procedure to launch, inspect, and manage SoloTensor local development services.
  Use when the user asks to "run local", "start local", "start server", "run dev", "start project", or troubleshoot local startup latency and performance.
---

> **Note:** The "PostgreSQL / Supabase Session pooler" and four-service descriptions below may not match the current local-only, filesystem-backed architecture. `CLAUDE.md` is authoritative.

# SoloTensor Local Run & Lifecycle Skill

This skill defines the canonical workflow for starting, validating, benchmarking, and troubleshooting the SoloTensor full-stack platform locally.

---

## 1. Architecture & Port Allocation

SoloTensor consists of four primary services:

| Service | Technology | Port | Default URL | Health/Inspect Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API** | FastAPI + Uvicorn | `8000` | `http://127.0.0.1:8000` | `http://127.0.0.1:8000/docs` or `GET /api/v1/models/public` |
| **Frontend UI** | Next.js 15 (React 19) | `3000` | `http://localhost:3000` | `http://localhost:3000` |
| **ComfyUI (Optional)**| Local ComfyUI Server | `8188` | `http://127.0.0.1:8188` | `http://127.0.0.1:8188/system_stats` |
| **Local LLM** | llama-server (Qwen2.5-Coder-3B) | `8085` | `http://127.0.0.1:8085` | `http://127.0.0.1:8085/v1/models` |

---

## 2. Pre-Flight Port & Process Verification

Before launching services, check for orphaned processes or occupied ports:

```powershell
# Check if ports 3000, 8000, 8085, or 8188 are currently in use
Get-NetTCPConnection -LocalPort 3000, 8000, 8085, 8188 -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, State, OwningProcess
```

If old instances need to be terminated:
```powershell
Get-Process -Name node, python -ErrorAction SilentlyContinue | Where-Object { $_.Path -match "solotensor" } | Stop-Process -Force
```

---

## 3. Starting the Services

### A. FastAPI Backend (Port 8000)

Run the backend as a background process from the `backend` directory (relative to the repo root):

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
- **Initial Startup Check**: Uvicorn initializes PostgreSQL schemas via Supabase Session pooler and syncs filesystem models on boot (~10-15s first connect).

### B. Next.js Frontend (Port 3000)

Depending on the user's need (Development vs. High-Performance Preview):

#### Option 1: Development Server (Hot-Reloading & Component Iteration)
Run from the `frontend` directory (relative to the repo root):
```powershell
npm run dev
```
- **Note on Lag**: In `dev` mode, Next.js compiles routes on-demand when clicked (e.g. compiling `/models` takes ~1-2s upon first navigation).

#### Option 2: Production Server (Zero-Lag & Instant Route Transitions)
If the user reports lagging or sluggish route loads, run the pre-compiled production server from the `frontend` directory (relative to the repo root):
```powershell
npm run build
npm run start
```
- **Benefit**: Eliminates all on-demand compiler pauses. Page transitions take ~0ms.

---

## 4. Health & Latency Verification

Once both services are launched, verify HTTP 200 responses and latency:

```powershell
# Test Backend latency (< 10ms expected)
curl.exe -o NUL -s -w "Backend: %{http_code} in %{time_total}s\n" http://127.0.0.1:8000/docs

# Test Frontend HTTP response
curl.exe -o NUL -s -w "Frontend: %{http_code} in %{time_total}s\n" http://localhost:3000
```

---

## 5. Troubleshooting Local Lag & Latency

If the user reports that local execution is lagging:

1. **Check Route Compilation Status**:
   Inspect the frontend task logs:
   - If lines show `○ Compiling /path ...`, the delay is standard Next.js on-demand bundle compilation.
   - Once compiled, subsequent requests to the same route take <70ms.
2. **Switch to `npm run start` for Fluid Benchmarking**:
   If fluid UI testing is desired without development compilation pauses, build and run via production mode (`npm run start`).
3. **Hardware Acceleration**:
   Ensure browser hardware acceleration is enabled in Chrome/Edge (`Settings` -> `System` -> `Use hardware acceleration when available`) to handle Masonry gallery layout renders with blur filters efficiently.
4. **Duplicate API Fetches**:
   Ensure React `useEffect` hooks do not perform duplicate parallel fetches on initial page mount.
