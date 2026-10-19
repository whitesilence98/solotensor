# SoloTensor Homepage (Tensor.Art Style) Implementation Plan

Reference Image: Tensor.Art Homepage Architecture & Feed

## 1. Top Promo / Ad Carousel
- 3-column banner display with ambient gradients, modern typography, badges, and smooth pagination/arrows.
- Highlighting FLUX.1 Klein, Video Engine (ComfyUI / MiniMax / SVD), and Local Performance.

## 2. "Featured" Section (AI Tools - 2x5 Grid)
- 2 rows × 5 columns of compact feature cards.
- Integrated with `api.getTools()` and curated AI tool actions:
  - OC Creator (New badge)
  - Design Agent (New badge)
  - Anime Lab
  - Photoreal Studio
  - Smart Edit
  - Create from Reference
  - Digital Avatar
  - Motion & Pose Ref
  - SNS Trends
  - Brand Design
- Direct routing to `/tools` or specific tool runners.

## 3. "Models" Section
- Header with "Models" title + "View More >" link to `/models`.
- Horizontal scrollable filter pill bar:
  - `Hot Trends`, `Manga`, `Niji Style`, `VTuber`, `Photography`, `E-commerce`, `3D & CGI`, `Chibi`, `Vintage Art`, `Cozy & Healing`.
- 4-column 3:4 portrait model cards:
  - Top tags: Type (`CHECKPOINT`, `LORA`) + Base Model (`SDXL`, `FLUX.1`, `SD 1.5`).
  - Overlay badges: `EXCLUSIVE`, `EARLY ACCESS`.
  - Footer: Model title, creator avatar + username, run count (`136K`), star count (`701`).

## 4. "Posts" Section (Latest Assets Feed)
- Filter Header:
  - Left: "Posts" title + `Explore ▾` dropdown selector (`Explore`, `Trending`, `Latest`).
  - Center: Category pill tags:
    - `All`, `Video`, `Character`, `Anime`, `Realistic`, `Illustration`, `Sci-Fi`, `Visual Design`, `Space Design`, `Game Design`.
  - Right: `Filters` button with sliders icon opening advanced filter drawer (aspect ratio, origin, time range).
- Fluid masonry layout (responsive 4 to 6 columns) matching Tensor.Art's true natural height grid.
- Hover interaction: Prompt excerpt, creator info, quick Remix button (`/generate`), bookmark, and full click modal via `AssetInspectionStage`.

## 5. Verification
- Production Next.js build verification with zero TypeScript or syntax warnings.
