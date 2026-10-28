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
- **Core Tokens** (authority: [`src/app/globals.css`](src/app/globals.css)):
  - `--ground`: `#0b0d0c` (Deep obsidian backdrop)
  - `--surface`: `#111411` (Panel and inspector surface)
  - `--surface-raised`: `#181c18` (Card, popover, tooltip surface)
  - `--surface-soft`: `#242924` (Hover wash, secondary chips)
  - `--surface-sunken`: `#080a09` (Input background, canvas frame backdrop)
  - `--core`: `rgba(15,18,15,0.96)` (Navigation rail / desktop shell core)
  - `--line`: `rgba(226,232,221,0.09)` (Hairline dividers, borders)
  - `--ink` / `--ink-soft` / `--ink-faint`: `#f2f5ef` / `#b0b8ad` / `#858e82`
  - `--accent`: `#c7e36a` (Acid lime accent)
  - `--accent-hover`: `#d4ec87` (Interactive hover glow)
  - `--accent-ink`: `#12170d` (Dark text/glyphs on accent)
  - `--accent-ambient`: `rgba(170,205,80,0.14)` (Ambient accent bloom)
- **Token Rule**: No hardcoded hex values in component files. Use CSS variables or Tailwind utility classes. The left rail (`SidebarNav.tsx`) is the worked example: every surface, tooltip, idle icon and active/hover treatment resolves from tokens, including the **Generate** flourish.

---

## 3. Engineering Conventions
- **Client Components**: Only use `'use client'` where state, effects, or browser APIs are required.
- **API Requests**: Route all calls through `src/lib/api.ts`.
- **Prompt Bar**: `StudioPromptBar.tsx` is the single prompt surface for every `/generate` mode (positive prompt, optional one-line negative prompt, batch count, primary Generate action). `PromptComposer.tsx` is retained only for the tool runner (`src/app/tools/[tool_id]/page.tsx`) and is no longer mounted in `/generate`.
- **WebSockets**: Maintain clean event registration and unmount cleanup in `useEffect`.
- **State Resilience**: Provide clear states for idle, generating, empty, and error scenarios.

---

## 4. Model Taxonomy & Compatibility Stack
- **Architecture Spec**: Refer to [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`DESIGN.md`](DESIGN.md#L82).
- **16 Standardized Types**: Strictly use the `CreatorModelType` union defined in `src/lib/api.ts` (e.g. `Checkpoint`, `LoRA`, `VAE`, `ControlNet`, etc.).
- **Dual SafeTensors Extensions**: Always accept both `.safetensors` and `.sft` across all file inputs, drag-and-drop dropzones, and ComfyUI enclave model scanners.
- **Persistent Compatibility Container**: In `src/app/models/create/page.tsx` (and `EditModelDrawer.tsx` for existing models), keep the *Compatibility & Conditioning Stack* card persistently mounted. The internal components adapt polymorphically:
  - *Core Base (`Checkpoint`, `SVD`)*: Dual-source VAE Selector + Text Encoders + CLIP protocol. When the base architecture resolves to a video engine (`videoFamilyOf()`), the banner switches to a `[VIDEO BACKBONE · <ENGINE>]` pill and the same selectors gain video quick-picks — auto-detected, never a toggle.
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
