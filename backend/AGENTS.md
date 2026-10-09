# SoloTensor Backend Agent Directory

This document outlines the specialized backend agent suite available for SoloTensor.

---

## 1. Agent Roster

| Agent Name | Spec File | Primary Scope | Typical Tasks |
| :--- | :--- | :--- | :--- |
| **`comfy-pipeline`** | [`.claude/agents/comfy-pipeline.md`](file:///c:/Users/kenko/Desktop/priject/my-ai-generate/solotensor/.claude/agents/comfy-pipeline.md) | `services/comfy_client.py`, ComfyUI WebSocket | ComfyUI node graphs, LoRA splicing, latent bounds, live progress streaming |
| **`api-contracts`** | [`.claude/agents/api-contracts.md`](file:///c:/Users/kenko/Desktop/priject/my-ai-generate/solotensor/.claude/agents/api-contracts.md) | `schemas.py`, `main.py`, `frontend/src/lib/api.ts` | Pydantic v2 schemas, status codes, error handling, TypeScript parity |
| **`model-manager`** | [`.claude/agents/model-manager.md`](file:///c:/Users/kenko/Desktop/priject/my-ai-generate/solotensor/.claude/agents/model-manager.md) | `services/models.py`, `models/` dir | Checkpoint/LoRA discovery, Civitai API integration, trigger word parsing |
| **`tool-engine`** | [`.claude/agents/tool-engine.md`](file:///c:/Users/kenko/Desktop/priject/my-ai-generate/solotensor/.claude/agents/tool-engine.md) | `services/ai_tools.py`, `tool_data/` | Parametric `workflow_api.json` tools, dynamic inputs, custom tool runner |
| **`backend-qa`** | [`.claude/agents/backend-qa.md`](file:///c:/Users/kenko/Desktop/priject/my-ai-generate/solotensor/.claude/agents/backend-qa.md) | `tests/` directory | Python unit tests, mocks, path traversal fuzzing, regression tests |
| **`backend`** *(General)* | [`.claude/agents/backend.md`](file:///c:/Users/kenko/Desktop/priject/my-ai-generate/solotensor/.claude/agents/backend.md) | Full `solotensor/backend` | Cross-module orchestration, general refactors, full-stack sync |

---

## 2. How to Call Backend Agents

### In Chat / Prompting
Prefix your prompt with the specific agent persona:
- *"As `@comfy-pipeline`, add support for Flux latent format and check dimensions divisible by 16."*
- *"As `@api-contracts`, add an optional negative_prompt field and update frontend API types."*
- *"As `@model-manager`, implement trigger word caching in a sidecar JSON file."*
- *"As `@tool-engine`, validate that tool image inputs accept PNG and WEBP formats."*
- *"As `@backend-qa`, run the test suite and add a test case for invalid image aspect ratios."*

### In Claude Code CLI
```bash
claude "@comfy-pipeline fix the WebSocket reconnection timeout logic"
claude "@backend-qa run tests and verify zero regressions"
```

---

## 3. General Verification Protocol
All backend agents must run before finishing:
```powershell
python -m unittest discover -s tests
```
Must result in **OK** (0 failures, 0 errors).
