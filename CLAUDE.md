# SoloTensor (Comfy Studio) - Developer & Agent Instructions

This repository houses **SoloTensor** (Comfy Studio), a local, privacy-first generative AI studio:
`Next.js 15 (:3000) -> FastAPI (:8000) -> ComfyUI (:8188, HTTP + WS)`

---

## 1. Authoritative References (Single Source of Truth)

Before modifying backend or frontend code, inspect and follow these ground-truth specifications:
- **System Architecture & 16 Model Types**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  - Strict 16 model taxonomy (`CreatorModelType`), dual `.safetensors` and `.sft` extension support, dynamic conditioning stack.
- **Design System**: [`DESIGN.md`](DESIGN.md)
  - Obsidian (`#0a0b0a`) & Acid Lime (`#d5f06f`) brutalist design tokens. No hardcoded hex values in UI components.
- **Product Scope & Limits**: [`PRODUCT.md`](PRODUCT.md)
- **Backend Agents & Personas**: [`backend/AGENTS.md`](backend/AGENTS.md)
- **Frontend Guidelines**: [`frontend/FRONTEND.md`](frontend/FRONTEND.md)
- **Dual-Agent Coordination**: [`AGENTS.md`](AGENTS.md)

---

## 2. Specialized Subagent Roster

Claude Code subagents are located in `.claude/agents/` and can be invoked with `@<agent-name>` or `/agent <agent-name>`:
- `@comfy-pipeline` ([`.claude/agents/comfy-pipeline.md`](.claude/agents/comfy-pipeline.md)): ComfyUI graph generation, WebSocket streaming, latent dimensions.
- `@api-contracts` ([`.claude/agents/api-contracts.md`](.claude/agents/api-contracts.md)): `backend/app/schemas.py`, FastAPI route status codes, TypeScript parity in `frontend/src/lib/api.ts`.
- `@model-manager` ([`.claude/agents/model-manager.md`](.claude/agents/model-manager.md)): Local model scanner, Civitai metadata, triggers, and compatibility tagging.
- `@tool-engine` ([`.claude/agents/tool-engine.md`](.claude/agents/tool-engine.md)): Parametric `workflow_api.json` tools, dynamic inputs, execution runner.
- `@backend-qa` ([`.claude/agents/backend-qa.md`](.claude/agents/backend-qa.md)): Python unit tests, mocks, path traversal fuzzing.
- `@backend` ([`.claude/agents/backend.md`](.claude/agents/backend.md)): Full FastAPI service orchestration.
- `@frontend` ([`.claude/agents/frontend.md`](.claude/agents/frontend.md)): Next.js 15, React 19, Tailwind CSS.

---

## 3. Verification Protocol

All agents must run and pass relevant verification before finishing a task:

### Backend Verification (from project root)
Always run tests using the project virtualenv (`backend/.venv`) with `PYTHONPATH=backend`:
```powershell
$env:PYTHONPATH='backend'; .\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests
```
*(Or if current working directory is `backend`: `.\.venv\Scripts\python.exe -m unittest discover -s tests`)*

To run a single test module:
```powershell
$env:PYTHONPATH='backend'; .\backend\.venv\Scripts\python.exe -m unittest backend/tests/test_workflow_patch.py
```
*Requirement:* Must return `OK` (0 failures, 0 errors). Tests mock external boundaries; never require live ComfyUI or network.

### Frontend Verification (from `frontend/`)
```powershell
cd frontend
npx tsc --noEmit
npm run build
```
*Requirement:* Must exit with code `0`.

---

## 4. Engineering & Safety Invariants

- **API Contracts:** `backend/app/schemas.py` is the contract authority. Never introduce breaking schema changes without updating `frontend/src/lib/api.ts` and `backend/tests/`.
- **Zero External API Leaks in Browser:** Never call Anthropic, ComfyUI, or third-party AI endpoints directly from client-side Next.js code. All requests must route through FastAPI (`:8000`).
- **Filesystem Boundaries:** All local disk storage uses `STORAGE_DIR` and `/files`. Enforce path traversal containment (`..` rejection).
- **Service Separation:** Routes in `main.py` remain thin; place domain logic in `backend/app/services/`.
- **ComfyUI Integration:** Do not modify exported node IDs or graph expectations without updating unit tests.
- **Antigravity / Claude Co-Pilot Etiquette:** Keep `main` in a releasable state. Never overwrite unstaged work from the other agent without confirming. Avoid dirty unstaged collisions across sessions.
