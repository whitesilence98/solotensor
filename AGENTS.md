# SoloTensor Agent Orchestration & Subagent Guide

This project is configured for dual-agent operation across both **Google Antigravity** and **Claude Code**.

---

## 1. Available Subagents & Specialists

Both Antigravity and Claude Code have access to the exact same 7 specialized agents:

| Agent Name | Primary Scope | Typical Responsibilities | Verification Command |
| :--- | :--- | :--- | :--- |
| **`frontend`** | `solotensor/frontend` | Next.js 15, React 19, TypeScript, Tailwind CSS, Brutalist Obsidian UI, Lucide icons, client-side WebSocket and API client. | `npx tsc --noEmit` & `npm run build` |
| **`backend`** | `solotensor/backend` | FastAPI routes, Pydantic v2 schemas, async ComfyUI client, asset storage, sidecars, and unit tests. | `python -m unittest discover -s tests` |
| **`comfy-pipeline`** | `solotensor/backend` | ComfyUI workflow graph construction, latent space math (multiple-of-8), node linking, WebSocket streaming frames. | `python -m unittest tests/test_workflow_patch.py` |
| **`api-contracts`** | `backend` & `frontend` | Schema parity between `backend/app/schemas.py` and `frontend/src/lib/api.ts`, error envelope standardization, thin routes. | `python -m unittest tests/test_schema_validation.py` & `npx tsc --noEmit` |
| **`model-manager`** | `solotensor/backend` | Checkpoint, LoRA, embedding, VAE scanning, Civitai metadata caching, trigger words, download sanitization, path containment. | `python -m unittest tests/test_models.py` |
| **`tool-engine`** | `solotensor/backend` | Parametric workflow tools, `workflow_api.json` graph interpolation, dynamic schema generation, tool manifest persistence. | `python -m unittest tests/test_ai_tools.py` |
| **`backend-qa`** | `solotensor/backend` | Mock isolation fixtures, regression testing, filesystem boundary safety, fuzzing, 100% test pass rate. | `python -m unittest discover -s tests` |

---

## 2. Platform-Specific Calling Conventions

### In Claude Code
- **Slash Commands**: Type `/agent <name>` or `/frontend`, `/backend`, etc.
- **Agent Mentions**: Type `@frontend`, `@backend`, etc., in your prompt.
- **Discovery Location**: `.claude/agents/*.md` (mirrored at both workspace root and `solotensor/.claude/agents/`).

### In Google Antigravity
- **Direct Subagent Spawning (`invoke_subagent`)**:
  Antigravity can spawn background subagents at any time:
  ```json
  {
    "TypeName": "frontend",
    "Role": "Frontend Specialist",
    "Prompt": "Implement the requested UI component..."
  }
  ```
  All 7 subagents (`frontend`, `backend`, `comfy-pipeline`, `api-contracts`, `model-manager`, `tool-engine`, `backend-qa`) are registered.
- **Workspace Skills**:
  Each subagent is also available as an on-demand skill under `.agent/skills/<name>/SKILL.md`. Type `/<name>` (e.g. `/frontend`, `/backend`) in the chat box or invoke the skill.
- **Mentions**:
  Type `@frontend`, `@backend`, etc., to reference the skill context in Antigravity chat.

---

## 3. Core Architectural Rules
1. **Zero External API Leaks in Browser**:
   Never call Anthropic, ComfyUI, or third-party AI endpoints directly from client-side Next.js code. All requests must route through FastAPI (`:8000`).
2. **Strict Filesystem Boundaries**:
   All user uploads, generated assets, and models must remain within their designated directories with path containment checks.
3. **Pydantic & TypeScript Sync**:
   Any change to `solotensor/backend/app/schemas.py` must be immediately mirrored in `solotensor/frontend/src/lib/api.ts`.
4. **Isolated Test Execution**:
   Backend unit tests must run offline without requiring a live ComfyUI instance or GPU.
