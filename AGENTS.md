# SoloTensor Agent Orchestration & Subagent Guide

This project's agent configuration targets **Claude Code**, the supported harness. (Google Antigravity support is retired; see §2.)

---

## 1. Available Subagents & Specialists

**Claude Code** is the supported harness. The 7 specialized agents below live in `.claude/agents/`. Claude Code additionally provides the skills `run-local`, `git-push`, `impeccable`, and `design-taste-frontend` under `.claude/skills/`.

| Agent Name | Primary Scope | Typical Responsibilities | Verification Command |
| :--- | :--- | :--- | :--- |
| **`frontend`** | `frontend` | Next.js 15, React 19, TypeScript, Tailwind CSS, Brutalist Obsidian UI, Lucide icons, client-side WebSocket and API client. | `npx tsc --noEmit` & `npm run build` |
| **`backend`** | `backend` | FastAPI routes, Pydantic v2 schemas, async ComfyUI client, asset storage, sidecars, and unit tests. | `$env:PYTHONPATH='backend'; python -m unittest discover -s tests` |
| **`comfy-pipeline`** | `backend` | ComfyUI workflow graph construction, latent space math (multiple-of-8), node linking, WebSocket streaming frames. | `python -m unittest tests/test_workflow_patch.py` |
| **`api-contracts`** | `backend` & `frontend` | Schema parity between `backend/app/schemas.py` and `frontend/src/lib/api.ts`, error envelope standardization, thin routes. | `python -m unittest tests/test_schema_validation.py` & `npx tsc --noEmit` |
| **`model-manager`** | `backend` | Checkpoint, LoRA, embedding, VAE scanning, Civitai metadata caching, trigger words, download sanitization, path containment. | `python -m unittest tests/test_models.py` |
| **`tool-engine`** | `backend` | Parametric workflow tools, `workflow_api.json` graph interpolation, dynamic schema generation, tool manifest persistence. | `python -m unittest tests/test_ai_tools.py` |
| **`backend-qa`** | `backend` | Mock isolation fixtures, regression testing, filesystem boundary safety, fuzzing, 100% test pass rate. | `$env:PYTHONPATH='backend'; python -m unittest discover -s tests` |

---

## 2. Platform-Specific Calling Conventions

### In Claude Code
- **Slash Commands**: Type `/agent <name>` or `/frontend`, `/backend`, etc.
- **Agent Mentions**: Type `@frontend`, `@backend`, etc., in your prompt.
- **Agent Discovery Location**: `.claude/agents/*.md`
- **Skill Discovery Location**: `.claude/skills/<name>/SKILL.md` — `run-local`, `git-push`, `impeccable`, `design-taste-frontend`.

> **Historical note:** Google Antigravity support was retired. Its workspace skills were migrated into `.claude/skills/`; the legacy `.agent/` directory is ignored and no longer used.

---

## 3. Core Architectural Rules
1. **Zero External API Leaks in Browser**:
   Never call Anthropic, ComfyUI, or third-party AI endpoints directly from client-side Next.js code. All requests must route through FastAPI (`:8000`).
2. **Strict Filesystem Boundaries**:
   All user uploads, generated assets, and models must remain within their designated directories with path containment checks.
3. **Pydantic & TypeScript Sync**:
   Any change to `backend/app/schemas.py` must be immediately mirrored in `frontend/src/lib/api.ts`.
4. **Isolated Test Execution**:
   Backend unit tests must run offline without requiring a live ComfyUI instance or GPU.
