# SoloTensor Frontend Agent & Developer Guidelines

This document outlines the architecture, design system, and coding standards for all frontend work in `frontend`.

---

## 1. Stack & Architecture
- **Framework**: Next.js 15 (App Router), React 19, TypeScript (strict mode).
- **Styling**: Tailwind CSS + CSS custom property tokens in `globals.css`.
- **Icons**: `lucide-react` only.
- **Backend Link**: Next.js `:3000` → FastAPI `:8000` (`/api/v1`) → ComfyUI `:8188`.
- **Assets**: Plain `<img>` tags for images loaded from FastAPI `/files/*`.

---

## 2. Design System: Obsidian & Acid Lime Brutalist Studio
- **Design Spec**: Refer to [`DESIGN.md`](DESIGN.md).
- **Core Tokens**:
  - `--ground`: `#0a0b0a` (Deep obsidian backdrop)
  - `--surface`: `#121412` (Panel and inspector surface)
  - `--surface-raised`: `#181b18` (Card and popover surface)
  - `--surface-sunken`: `#0e100e` (Input background, canvas frame backdrop)
  - `--line`: `#282c28` (Hairline dividers, borders)
  - `--accent`: `#d5f06f` (Acid lime accent)
  - `--accent-hover`: `#e2f88a` (Interactive hover glow)
  - `--accent-ink`: `#171b08` (Dark text on accent)
- **Token Rule**: No hardcoded hex values in component files. Use CSS variables or Tailwind utility classes.

---

## 3. Engineering Conventions
- **Client Components**: Only use `'use client'` where state, effects, or browser APIs are required.
- **API Requests**: Route all calls through `src/lib/api.ts`.
- **Prompt Composer**: Shared `PromptComposer.tsx` component used across both `Text2Img` and `Img2Img` generation tabs for consistent tag autocompletion and prompt crafting.
- **WebSockets**: Maintain clean event registration and unmount cleanup in `useEffect`.
- **State Resilience**: Provide clear states for idle, generating, empty, and error scenarios.

---

## 4. Model Taxonomy & Compatibility Stack
- **Architecture Spec**: Refer to [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`DESIGN.md`](DESIGN.md#L82).
- **16 Standardized Types**: Strictly use the `CreatorModelType` union defined in `src/lib/api.ts` (e.g. `Checkpoint`, `LoRA`, `VAE`, `ControlNet`, etc.).
- **Dual SafeTensors Extensions**: Always accept both `.safetensors` and `.sft` across all file inputs, drag-and-drop dropzones, and ComfyUI enclave model scanners.
- **Persistent Compatibility Container**: In `CreateModelDrawer.tsx`, keep the *Compatibility & Conditioning Stack* card persistently mounted. The internal components adapt polymorphically:
  - *Core Base (`Checkpoint`, `SVD`)*: Dual-source VAE Selector + Text Encoders + CLIP protocol.
  - *Adapters (`LoRA`, `DoRA`, etc.)*: Base Checkpoint gallery link + auto-inherited stack card + optional override.
  - *VAE*: Latent channel profile (16ch / 4ch) with zero redundant VAE selectors.
  - *Guidance (`ControlNet`, `Poses`)*: Preprocessor modality selector.
  - *Embeddings / Inversions*: Target vector space info + invocation syntax.
  - *Wildcards*: Universal engine badge + dynamic syntax expansion preview.

---

## 5. Verification Commands
Run from `frontend`:
```powershell
npx tsc --noEmit
npm run build
```
Both commands must complete with exit code `0`.
