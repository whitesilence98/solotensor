# SoloTensor (Comfy Studio) - Developer & Agent Instructions

This repository houses **SoloTensor** (Comfy Studio), a local, privacy-first generative AI studio:
`Next.js 15 (:3000) -> FastAPI (:8000) -> ComfyUI (:8188, HTTP + WS)`

---

## 1. Authoritative References (Single Source of Truth)

Before modifying backend or frontend code, inspect and follow these ground-truth specifications:
- **System Architecture & 16 Model Types**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  - Strict 16 model taxonomy (`CreatorModelType`), dual `.safetensors` and `.sft` extension support, dynamic conditioning stack.
- **Design System**: [`DESIGN.md`](DESIGN.md)
  - Obsidian (`#0b0d0c`) & Acid Lime (`#c7e36a`) brutalist design tokens — `frontend/src/app/globals.css` is the authority. One signal accent: no second palette, no hardcoded hex values in UI components.
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
- `@flow-ai-engineer` ([`.claude/agents/flow-ai-engineer.md`](.claude/agents/flow-ai-engineer.md)): `/flow` creative-director LLM work — provider adapters, prompt design, cost/latency budgets, provider-agnostic tests.
- `@frontend` ([`.claude/agents/frontend.md`](.claude/agents/frontend.md)): Next.js 15, React 19, Tailwind CSS.

### 2a. Mandatory Subagent Usage

**Always delegate through subagents.** The primary agent routes work; it does not implement it directly.

- **New feature tasks:** use *several* subagents, not one. Decompose the feature by layer and run the independent layers **in parallel in a single message**:
  - Backend graph/latent work → `@comfy-pipeline`
  - Schema + `api.ts` parity → `@api-contracts`
  - FastAPI routes and orchestration → `@backend`
  - Model scanning / capability tagging → `@model-manager`
  - Tool runner and `workflow_api.json` tools → `@tool-engine`
  - Next.js components and state → `@frontend`
  - Tests, mocks, regression coverage → `@backend-qa`
- **Sequencing rule:** contracts and graph work are independent and go first, together. Route/orchestration agents depend on both. Frontend may start once contracts are settled. QA runs last, after implementation.
- A feature touching two or more layers is not done with a single agent. If a task genuinely fits one layer only — a copy fix, a one-file tweak — one agent is fine.
- Direct edits by the primary agent are reserved for: reading/investigating, verifying results, resolving a subagent's mistakes, and trivial mechanical fixes discovered during verification.
- Always relay each subagent's findings to the user; the user does not see subagent reports.

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
- **Video Tab UI is Frozen:** The `/generate` Video tab (`ControlPanel.tsx` video branch) is in a state the user explicitly approves. Multi-engine or capability work must be structurally additive: LTX-selected must render identically to today, and existing controls are shown/hidden by capability — never relocated, restyled, or supplemented with new drawers, tabs, or wizards. A visual diff on this tab is a regression unless the user asked for it. (Sanctioned exceptions, both explicitly user-requested: the Text-to-Video / Image-to-Video sub-mode pill, and the removal of the duplicate sidebar Prompt Composer — prompt and negative-prompt editing now happen only in the shared `StudioPromptBar` above the canvas, together with the standard `GENERATION MODEL` card. Do not reintroduce a sidebar prompt editor in this branch.)
