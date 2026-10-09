# SoloTensor Frontend Agent & Developer Guidelines

This document outlines the architecture, design system, and coding standards for all frontend work in `solotensor/frontend`.

---

## 1. Stack & Architecture
- **Framework**: Next.js 15 (App Router), React 19, TypeScript (strict mode).
- **Styling**: Tailwind CSS + CSS custom property tokens in `globals.css`.
- **Icons**: `lucide-react` only.
- **Backend Link**: Next.js `:3000` → FastAPI `:8000` (`/api/v1`) → ComfyUI `:8188`.
- **Assets**: Plain `<img>` tags for images loaded from FastAPI `/files/*`.

---

## 2. Design System: Obsidian & Acid Lime Brutalist Studio
- **Design Spec**: Refer to [`solotensor/DESIGN.md`](file:///c:/Users/kenko/Desktop/priject/my-ai-generate/solotensor/DESIGN.md).
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
- **WebSockets**: Maintain clean event registration and unmount cleanup in `useEffect`.
- **State Resilience**: Provide clear states for idle, generating, empty, and error scenarios.

---

## 4. Verification Commands
Run from `solotensor/frontend`:
```powershell
cmd /c npx tsc --noEmit
cmd /c npm run build
```
Both commands must complete with exit code `0`.
