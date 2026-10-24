# SoloTensor Studio: Multi-Tab Architecture & Isolated State Specification

This document provides the authoritative technical specification for the `/generate` Studio page in SoloTensor, detailing the multi-tab state isolation model, per-tab persistence, parametric control routing, and ComfyUI pipeline execution across all generation modes.

---

## 1. Executive Summary & Design Rationale

The SoloTensor Generation Studio (`/generate`) unifies 5 core generative paradigms:
1. **`Text2Img`** (Text-to-Image / Pure Latent Synthesis)
2. **`Img2Img`** (Image-to-Image / Style Transfer & Latent Variation)
3. **`Edit`** (Inpainting / Brush Masking / Regional Synthesis)
4. **`Video`** (Image-to-Video & Text-to-Video / SVD / WAN Diffusion)
5. **`Prime`** (Autonomous Multi-Stage Pro Pipeline: Base Latent + SeedVR2 DiT Upscale + Cascading YOLO Detailers)

### The State Isolation Problem
Prior to this architecture, parameters were shared across modes in a single flat state object. This caused parameter corruption when switching between paradigms:
- **Denoise Incompatibility**: `Text2Img` requires `denoise = 1.0` (generating completely from pure gaussian noise). Switching to `Img2Img` requires `denoise ≈ 0.50 – 0.75` (partial noise to preserve structure). Reverting to `Text2Img` previously inherited `0.65`, breaking full-canvas generation.
- **Guidance Scale (CFG) Incompatibility**: Diffusion video pipelines (e.g., SVD, Wan) diverge or burn when `cfg > 3.0` (optimal is `1.5 – 2.5`), whereas SDXL/SD1.5 requires `cfg = 7.0` and Flux operates best at `cfg = 3.5`.
- **Aspect Ratio & Geometry**: `Img2Img` and `Edit` frequently adapt to the uploaded source image dimensions (snapped to multiples of 8), whereas `Text2Img` uses standard aspect presets (`9:16`, `1:1`, `16:9`).
- **Prompt Specialization**: Prompts in `Edit` describe localized inpainting substitutions (e.g. *"embroidered leather jacket"*), while `Text2Img` prompts describe full scenes.

### Solution: Polymorphic Tab State Isolation
SoloTensor implements **strictly partitioned per-tab state models**. Switching tabs immediately snapshots the active tab's parameters, saves them to partitioned local storage, and hydrates the target tab's own dedicated parameters without cross-contamination.

---

## 2. State Topology: Global vs. Tab-Scoped State

```mermaid
graph TD
    subgraph Global Studio State ["Global Studio State (Shared Across All Tabs)"]
        G1["Gallery History (api.getMyGallery())"]
        G2["WebSocket Progress Stream (/api/v1/ws/progress)"]
        G3["Generation Queue Status (busy, progress, progressLabel)"]
        G4["Sidebar Collapse & UI Theme State"]
        G5["Model Options Cache (Checkpoints, LoRAs, VAEs)"]
    end

    subgraph Tab Isolation Matrix ["Tab-Scoped State Isolation (Partitioned per TensorMode)"]
        T1["Text2Img State"]
        T2["Img2Img State"]
        T3["Edit / Inpaint State"]
        T4["Video (SVD) State"]
        T5["Prime Pro State"]
    end

    Global Studio State --- Tab Isolation Matrix
```

### Global State (Never Reset on Tab Change)
- **Active Job Progress & WebSocket Stream**: Ongoing inference jobs, progress percentages (`progress`), and node labels (`progressLabel`) remain intact.
- **Creation Library / Canvas Gallery**: The generated output gallery, lightbox, and delete handlers are universal.
- **Model Registry Options**: Cached lists of installed gallery checkpoints, LoRAs, embeddings, and VAEs.
- **Layout States**: Left control panel collapse toggle (`isSidebarCollapsed`).

### Tab-Scoped State (Partitioned per Mode)
Each tab maintains an isolated `TabState` structure:
```typescript
export interface TabState {
  prompt: string;
  negativePrompt: string;
  selection: ModelIdentity | null;
  baseSelection: ModelIdentity | null;
  loras: ActiveLora[];
  embeddings: ActiveEmbedding[];
  seed: string;
  steps: string;
  imageCount: string;
  cfg: string;
  denoise: string;
  format: FormatKey;
  customWidth: string;
  customHeight: string;
  referenceImage: string | null;
  isPrivate: boolean;
  enableDetailer: boolean;
  upscaleConfig: UpscaleConfig;
  detailerConfig: DetailerConfig;
  // Edit Tab Specifics
  maskImage?: string | null;
  maskBlur?: number;
  inpaintFill?: "original" | "latent_noise" | "latent_zero";
  // Video Tab Specifics
  motionBucketId?: number;
  videoFrames?: number;
  videoFps?: number;
  // Prime Tab Specifics
  primePreset?: string;
}
```

---

## 3. Storage Partitioning & Hydration Lifecycle

Each generation mode persists to a dedicated `localStorage` key namespace:

| Mode | Storage Key | Default Denoise | Default CFG | Default Steps | Mode-Specific Defaults |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Text2Img`** | `solotensor:studio:draft:text2img` | `1.0` (Fixed) | `7.0` | `25` | `format: "9:16"` |
| **`Img2Img`** | `solotensor:studio:draft:img2img` | `0.65` | `7.0` | `25` | `referenceImage: null` |
| **`Edit`** | `solotensor:studio:draft:edit` | `0.75` | `7.0` | `30` | `maskBlur: 8`, `inpaintFill: "original"` |
| **`Video`** | `solotensor:studio:draft:video` | `1.0` | `2.5` | `25` | `motionBucketId: 127`, `frames: 25`, `fps: 16` |
| **`Prime`** | `solotensor:studio:draft:prime` | `1.0` | `7.0` | `30` | `enableDetailer: true`, `upscale.enabled: true` |

### Tab Switching Transition Protocol
When the user clicks a tab button in `ControlPanel.tsx`:
1. `handleTensorModeChange(targetMode)` is invoked.
2. Current active tab's parameters are gathered and stored in memory in `tabStates[currentMode]`.
3. The state is serialized and persisted to `localStorage.setItem(storageKey(currentMode), JSON.stringify(currentState))`.
4. The target tab's state is fetched from `tabStates[targetMode]`.
5. Active UI inputs (prompt, negative prompt, model selection, steps, denoise, etc.) are synchronously updated to the target tab's values.
6. The active mode is lifted to `activeTensorMode = targetMode`.

---

## 4. Tab Mode Specifications & Control Panel Mapping

### 4.1 Tab 1: Text2Img (Pure Latent Synthesis)
- **Primary Generator**: ComfyUI `EmptyLatentImage` node + `KSampler`.
- **Denoise**: Fixed to `1.0` (pure gaussian noise generation).
- **Controls**:
  - Checkpoint Model Picker & LoRA Stacker.
  - Aspect Ratio Selector (`9:16`, `1:1`, `16:9`, `4:3`, `3:2`, `custom`).
  - Prompt Composer with Auto-Complete & Negative Prompt.
  - Sampling Parameters (Steps: 1–100, CFG: 1.0–30.0, Seed: -1/Random).
  - Optional Secondary Passes (Super-Resolution Upscale, Cascading Detailer).

### 4.2 Tab 2: Img2Img (Latent Variation & Style Transfer)
- **Primary Generator**: ComfyUI `LoadImage` + `VAEEncode` feeding into `KSampler`.
- **Denoise**: Configurable slider (`0.05` to `1.0`, default `0.65`).
  - Low values (`0.20 – 0.45`): Subtle color shifts and texture variations.
  - Medium values (`0.50 – 0.70`): Style transfer while retaining spatial composition.
  - High values (`0.75 – 0.95`): Radical re-imagining guided by input geometry.
- **Controls**:
  - Drag & Drop Source Image Uploader with instant thumbnail preview and clear action.
  - "Auto-Prompt" Tag Interrogator (deep-extracts prompts and settings from PNG metadata).
  - "Match Source Dimensions" button (reads natural image resolution and sets custom width/height snapped to multiples of 8).
  - Full access to Model picker, LoRAs, and Sampling parameters.

### 4.3 Tab 3: Edit (Inpainting & Regional Replacement)
- **Primary Generator**: ComfyUI `LoadImage` + Mask Conditioning / `VAEEncodeForInpaint`.
- **Denoise**: Configurable slider (`0.10` to `1.0`, default `0.75`).
- **Controls**:
  - Source Image Dropzone + Canvas Mask Trigger.
  - **Mask Blur / Feathering**: Slider (`0px` to `32px`, default `8px`) for seamless boundary blending.
  - **Inpaint Fill Mode**:
    - `Original`: Retains source colors under the mask for targeted refinement.
    - `Latent Noise`: Replaces masked region with pure noise for complete object replacement.
    - `Latent Zero`: Fills with neutral tone for clean removal / erasing.
  - Dedicated Inpainting Prompt (e.g. *"gold watch on wrist, hyperdetailed"*).

### 4.4 Tab 4: Video (Image-to-Video & SVD Diffusion)
- **Primary Generator**: Stable Video Diffusion (`SVD_img2vid_Conditioning`) + `VideoLinearCFGGuidance`.
- **CFG Scale**: Auto-tuned to `2.5` (range `1.0 – 5.0`).
- **Controls**:
  - Source Image Input (for Image-to-Video) or Text Prompt (for Text-to-Video).
  - **Motion Bucket ID**: Slider (`1` to `255`, default `127`) controlling motion magnitude and camera velocity.
  - **Frame Count**: Segmented selector (`14 frames`, `25 frames`, `49 frames`).
  - **Frame Rate**: Segmented selector (`6 fps`, `12 fps`, `16 fps`, `24 fps`).
  - Checkpoint Selector (filters to video-capable weights: SVD, Wan2.1, CogVideoX).

### 4.5 Tab 5: Prime (Autonomous Multi-Stage Pro Pipeline)
- **Primary Generator**: Multi-stage chained execution:
  - `Stage 1`: Base Latent Generation (Text2Img or Img2Img base synthesis).
  - `Stage 2`: SeedVR2 DiT Super-Resolution Upscaling (1.5x – 4.0x).
  - `Stage 3`: Cascading YOLOv11 Detailers (Face, Eyes, Hands, Anatomical mesh).
- **Controls**:
  - **Prime Recipe Presets**:
    - *Photoreal Studio Portrait*: SDXL/Flux + 1.5x DiT Upscale + YOLO Face Detailer.
    - *Cinematic Masterpiece*: Atmospheric haze + DiT Texture Sharpener + Color Correction.
    - *Hyper-Detail Anime*: Animagine XL + Hand/Face Mesh Fix.
  - Visual stage progression indicators with one-click toggles.

---

## 5. Backend Pipeline Routing & Schema Synchronization

### Route Dispatching (`backend/app/main.py`)
Requests to `/api/v1/generate` are validated by `GenerateRequest` in `backend/app/schemas.py`:
```python
class GenerateRequest(BaseModel):
    model_id: str
    version_id: str
    file_id: str
    mode: Literal["text-to-image", "image-to-image"] = "text-to-image"
    prompt: str
    negative_prompt: str = ""
    denoise: float = Field(1.0, ge=0.0, le=1.0)
    reference_images: list[str] = Field(default_factory=list)
    # ...
```

When `mode == "image-to-image"`:
1. `main.py` decodes the reference image bytes (base64 data URI or asset storage key).
2. Uploads the image to ComfyUI via `comfy.upload_image()`.
3. Invokes `comfy.build_gallery_workflow(..., source_image_filename=filename, denoise=req.denoise)`.
4. `workflow_router.py` replaces `EmptyLatentImage` (`node 1054`) with:
   - `node 1054_load` (`LoadImage`)
   - `node 1054_encode` (`VAEEncode`)
5. Links `VAEEncode` to `KSampler` latent input and configures `denoise` and `start_at_step`.

---

## 6. Verification and Regression Checklist

1. **Frontend Type Safety**:
   - `cd frontend; ./node_modules/.bin/tsc --noEmit` must return 0 errors.
2. **Backend Unit Test Isolation**:
   - `cd backend; python -m unittest discover -s tests` must pass 100% of tests.
3. **State Preservation Verification**:
   - Enter a distinct prompt and select a LoRA in `Text2Img`.
   - Switch to `Img2Img`, upload an image, and set denoise to `0.55`.
   - Switch back to `Text2Img`: Verify denoise is `1.0`, the original prompt is preserved, and the LoRA is intact.
   - Switch back to `Img2Img`: Verify denoise is `0.55` and the uploaded image is preserved.
