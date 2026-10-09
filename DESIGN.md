# SoloTensor Design System

## Aesthetic: Obsidian & Acid Lime Brutalist Studio
SoloTensor uses a disciplined, high-density AI creation studio aesthetic designed for professional solo artists and engineers. The atmosphere is defined by deep obsidian darkroom surfaces, hairline precision dividers, editorial display typography, and laser acid-lime status indicators.

---

## 1. Color System (Semantic Tokens)

All UI elements must consume semantic CSS variables or Tailwind tokens. Hardcoded hex values outside token definitions are prohibited.

| Token | CSS Variable | Hex / Value | Semantic Role |
| :--- | :--- | :--- | :--- |
| `ground` | `var(--ground)` | `#0a0b0a` | Deep obsidian backdrop & base canvas ground |
| `surface` | `var(--surface)` | `#121412` | Sidebar rail, inspector panel, tool panels |
| `surface-raised` | `var(--surface-raised)` | `#181b18` | Cards, popovers, dropdowns, active selections |
| `surface-sunken` | `var(--surface-sunken)` | `#0e100e` | Textareas, text inputs, canvas frame background |
| `line` | `var(--line)` | `#282c28` | Hairline dividers, panel boundaries, idle borders |
| `line-strong` | `var(--line-strong)` | `#383d38` | Hover borders, emphasized dividers |
| `accent` | `var(--accent)` | `#d5f06f` | Primary acid-lime accent, active pills, badges |
| `accent-hover` | `var(--accent-hover)` | `#e2f88a` | Interactive hover glow on buttons and toggles |
| `accent-ink` | `var(--accent-ink)` | `#171b08` | Deep high-contrast dark text on lime accent |
| `danger` | `var(--danger)` | `#f43f5e` | Error states, delete buttons, critical alerts |
| `danger-surface` | `var(--danger-surface)` | `#261117` | Error banner background |
| `danger-line` | `var(--danger-line)` | `#5c1d2e` | Error border highlight |

---

## 2. Typography & Hierarchy

### Display & Hero Headlines
- **Purpose**: Main empty states, hero titles, marquee copy (e.g., *"Give the model something to see."*).
- **Style**: Heavy, confident display typography with tight letter spacing (`font-sans font-bold tracking-tight text-neutral-100` or editorial serif accent).

### Technical Microcopy & Metadata
- **Purpose**: Section badges, character counts, status indicators, seed/dimension readouts.
- **Style**: Monospace uppercase with wide tracking:
  ```css
  font-mono text-[10px] tracking-widest text-[#8a8e87] uppercase
  ```
  *Examples*: `WORKSPACE / 01`, `BLANK CANVAS`, `00 OUTPUTS`, `LOCAL`, `~28 SEC`.

### Interface Body & Control Labels
- **Purpose**: Parameter names, prompt inputs, tool descriptions, buttons.
- **Style**: Clean, highly legible sans-serif (`Inter` or `Geist`) at `text-xs` (12px) to `text-sm` (14px).

---

## 3. Layout & Spatial Geometry

- **Left Icon Rail (48px)**: Compact vertical navigation containing top app icon, route icons (Workspace, Tools, Models, Assets, Assist, Settings). Active route highlighted with a vertical acid-lime pill on the left border.
- **Sticky Control Inspector (320px–360px)**: Left-aligned panel hosting mode tabs, prompt textareas, preset chips, aspect ratios, model loaders, and generation actions.
- **Main Canvas Viewport**: Expansive work area enclosed in a hairline frame (`border border-[var(--line)] rounded-xl bg-[var(--surface-sunken)]`). Features a top utility bar with live status dot (`Canvas ready`) and output counter (`00 OUTPUTS`).
- **Radius Scale**:
  - `rounded-md` (6px) for small chips, badges, and icon buttons.
  - `rounded-lg` (8px) for inputs, aspect-ratio selectors, and dropdowns.
  - `rounded-xl` (12px) for canvas frames, cards, and modal dialogs.
  - `rounded-full` for status dots and empty state icon badge.

---

## 4. Component Patterns

### Mode Tabs & Toggles
- Minimalist text tabs with an active acid-lime bottom border (`border-b-2 border-[var(--accent)] text-white`). Idle tabs stay muted (`text-[#8a8e87] hover:text-neutral-200`).

### Preset & Aspect Ratio Chips
- Muted outline buttons (`border border-[var(--line)] bg-[var(--surface)] text-[#8a8e87]`).
- Selected state activates a crisp lime border and text (`border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/5`).

### Generation Action CTA
- High-visibility button with lightning icon and estimated duration:
  ```tsx
  <button className="flex w-full items-center justify-between rounded-lg bg-[var(--accent)] px-4 py-3 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition">
    <span>Generate image</span>
    <span className="font-mono text-[10px] opacity-80">⚡ ~28 SEC</span>
  </button>
  ```

---

## 5. Absolute Anti-Patterns & Bans

- ❌ **No generic gradients or glassmorphism**: Avoid rainbow/purple gradient buttons and heavy backdrop blurs.
- ❌ **No hardcoded hex codes**: Never introduce arbitrary hex codes directly in components (`#ef8c79`, `#d5f06f`, etc.). Always reference semantic CSS variables (`var(--...)`) or Tailwind semantic color classes.
- ❌ **No layout shifts (CLS)**: Always reserve image aspect ratio boxes prior to asset load.
- ❌ **No apologetic empty states**: Frame empty states as intentional, instructional moments (e.g. *"Give the model something to see"*).
