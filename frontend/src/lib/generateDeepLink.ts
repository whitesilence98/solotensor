/**
 * Pure parsing and snapping for `/generate` deep links.
 *
 * Deliberately free of React and `@/lib/api` imports so the mapping can be
 * exercised directly with Node's type stripping
 * (`node frontend/scripts/check-deep-link.mjs`). Everything here is a trust
 * boundary: values arrive from the URL and are only applied when they are
 * well-formed.
 */

export type DeepLinkTensorMode = "Text2Img" | "Img2Img" | "Edit" | "Video" | "Prime";
export type DeepLinkFormat = "1:1" | "16:9" | "9:16" | "4:3" | "3:2";
export type DeepLinkVideoSubMode = "text-to-video" | "image-to-video";
export type DeepLinkImg2ImgSubTab = "image_to_image" | "detailer" | "upscaler";

/** Must stay in lockstep with `ControlPanel.tsx`'s option lists. */
export const VIDEO_DURATION_OPTIONS = [3, 5, 10, 15] as const;
export const VIDEO_FPS_OPTIONS = [16, 24, 30, 49] as const;

/** Backend defaults for an omitted video duration / frame rate. */
export const DEFAULT_VIDEO_DURATION_SECONDS = 5;
export const DEFAULT_VIDEO_FPS = 24;

export const DEEP_LINK_FORMATS: readonly DeepLinkFormat[] = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:2",
];

/**
 * `mode` tokens used by the homepage tiles, the asset remix links and the
 * `/flow` shot cards. Unknown tokens leave the current tab untouched.
 */
export const DEEP_LINK_MODE: Record<string, DeepLinkTensorMode> = {
  "text-to-image": "Text2Img",
  text2img: "Text2Img",
  image: "Text2Img",
  character: "Text2Img",
  anime: "Text2Img",
  photoreal: "Text2Img",
  avatar: "Text2Img",
  brand: "Text2Img",
  pose: "Text2Img",
  "image-to-image": "Img2Img",
  img2img: "Img2Img",
  reference: "Img2Img",
  detailer: "Img2Img",
  upscale: "Img2Img",
  edit: "Edit",
  video: "Video",
  "text-to-video": "Video",
  "image-to-video": "Video",
};

const IMG2IMG_SUBTAB: Record<string, DeepLinkImg2ImgSubTab> = {
  "image-to-image": "image_to_image",
  img2img: "image_to_image",
  reference: "image_to_image",
  detailer: "detailer",
  upscale: "upscaler",
};

/** `mode=video` alone keeps the draft's sub-mode; the explicit tokens set it. */
const VIDEO_SUBMODE: Record<string, DeepLinkVideoSubMode> = {
  "text-to-video": "text-to-video",
  "image-to-video": "image-to-video",
};

const MAX_PROMPT_LENGTH = 50_000;
const MAX_SEED = 2 ** 32 - 1;

/**
 * The Video tab has no aspect-ratio selector: it sizes through LTX-aligned
 * preset resolutions (multiples of 32). A shot's aspect is mapped onto those
 * presets so the open card and the highlighted preset agree. 4:3 has no
 * preset, so it lands on a custom LTX-aligned box of the same shape.
 */
const VIDEO_ASPECT_PRESETS: Record<DeepLinkFormat, { width: number; height: number }> = {
  "16:9": { width: 1024, height: 576 },
  "9:16": { width: 576, height: 1024 },
  "1:1": { width: 704, height: 704 },
  "3:2": { width: 768, height: 512 },
  "4:3": { width: 768, height: 576 },
};

/** Preset boxes that the Video tab renders as selectable chips. */
const VIDEO_PRESET_CHIPS: readonly { width: number; height: number }[] = [
  { width: 1024, height: 576 },
  { width: 768, height: 512 },
  { width: 704, height: 704 },
  { width: 576, height: 1024 },
];

export function videoSizeForAspect(aspect: DeepLinkFormat): {
  width: number;
  height: number;
  isPresetChip: boolean;
} {
  const size = VIDEO_ASPECT_PRESETS[aspect];
  const isPresetChip = VIDEO_PRESET_CHIPS.some(
    (chip) => chip.width === size.width && chip.height === size.height,
  );
  return { ...size, isPresetChip };
}

export interface GenerateDeepLinkPlan {
  mode: DeepLinkTensorMode | null;
  img2imgSubTab: DeepLinkImg2ImgSubTab | null;
  videoSubMode: DeepLinkVideoSubMode | null;
  /** An explicit text-to-video target must not inherit a stale first/last frame. */
  clearVideoReferences: boolean;
  prompt: string | null;
  /** `null` means the parameter was absent; `""` means it was explicitly empty. */
  negativePrompt: string | null;
  seed: string | null;
  format: DeepLinkFormat | null;
  duration: number | null;
  fps: number | null;
  modelId: string | null;
  versionId: string | null;
  fileId: string | null;
  baseModelId: string | null;
  baseFileId: string | null;
  hasModelParam: boolean;
}

function read(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(params: URLSearchParams, key: string): number | null {
  const raw = read(params, key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Nearest member of a fixed option list; ties resolve to the lower option. */
export function snapToOptions(value: number, options: readonly number[]): number {
  let best = options[0];
  let bestDistance = Math.abs(value - best);
  for (const option of options) {
    const distance = Math.abs(value - option);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

export function snapVideoDuration(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return snapToOptions(value, VIDEO_DURATION_OPTIONS);
}

export function snapVideoFps(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return snapToOptions(value, VIDEO_FPS_OPTIONS);
}

/** Accepts a bare query string, `?query`, or a full `/generate?query` href. */
export function parseGenerateDeepLink(search: string): GenerateDeepLinkPlan {
  const withoutPath = search.includes("?") ? search.slice(search.indexOf("?") + 1) : search;
  const params = new URLSearchParams(withoutPath);

  const modeToken = read(params, "mode")?.toLowerCase() ?? null;
  const mode = modeToken ? DEEP_LINK_MODE[modeToken] ?? null : null;
  const img2imgSubTab =
    modeToken && mode === "Img2Img" ? IMG2IMG_SUBTAB[modeToken] ?? null : null;

  const videoModeToken = read(params, "video_mode")?.toLowerCase() ?? null;
  const explicitSubMode =
    videoModeToken === "text-to-video" || videoModeToken === "image-to-video"
      ? videoModeToken
      : null;
  const tokenSubMode = modeToken ? VIDEO_SUBMODE[modeToken] ?? null : null;
  const videoSubMode = explicitSubMode ?? tokenSubMode;

  const promptRaw = params.get("prompt");
  const prompt =
    promptRaw !== null && promptRaw.trim().length > 0
      ? promptRaw.slice(0, MAX_PROMPT_LENGTH)
      : null;

  const negativeRaw = params.get("negative_prompt");
  // Presence is meaningful: an empty value from /flow must clear the old one.
  const negativePrompt =
    negativeRaw === null ? null : negativeRaw.slice(0, MAX_PROMPT_LENGTH);

  const seedRaw = read(params, "seed");
  let seed: string | null = null;
  if (seedRaw !== null && /^\d+$/.test(seedRaw)) {
    const parsed = Number(seedRaw);
    if (Number.isSafeInteger(parsed) && parsed <= MAX_SEED) seed = String(parsed);
  }

  const formatRaw = read(params, "format");
  const format =
    formatRaw !== null && (DEEP_LINK_FORMATS as readonly string[]).includes(formatRaw)
      ? (formatRaw as DeepLinkFormat)
      : null;

  const modelId = read(params, "model_id");

  return {
    mode,
    img2imgSubTab,
    videoSubMode,
    clearVideoReferences: videoSubMode === "text-to-video",
    prompt,
    negativePrompt,
    seed,
    format,
    duration: snapVideoDuration(readNumber(params, "duration")),
    fps: snapVideoFps(readNumber(params, "fps")),
    modelId,
    versionId: read(params, "version_id"),
    fileId: read(params, "file_id"),
    baseModelId: read(params, "base_model_id"),
    baseFileId: read(params, "base_file_id"),
    hasModelParam: Boolean(modelId),
  };
}

export interface GenerateShotLinkInput {
  prompt: string;
  negative_prompt: string;
  media: "image" | "video";
  aspect: DeepLinkFormat;
  duration_seconds: number | null;
  fps: number | null;
  model_id: string | null;
  version_id: string | null;
  file_id: string | null;
}

/** The render call needs the full triple; a partial identity is not a model. */
export function hasCompleteModelIdentity(
  shot: Pick<GenerateShotLinkInput, "model_id" | "version_id" | "file_id">,
): boolean {
  return Boolean(shot.model_id && shot.version_id && shot.file_id);
}

/**
 * Builds the `/flow` shot-card handoff. Returns `null` when no installed model
 * is bound, so the card can render an honest disabled action.
 */
export function buildShotGenerateHref(shot: GenerateShotLinkInput): string | null {
  if (!hasCompleteModelIdentity(shot)) return null;
  const params = new URLSearchParams();
  params.set("model_id", shot.model_id as string);
  params.set("version_id", shot.version_id as string);
  params.set("file_id", shot.file_id as string);
  params.set("mode", shot.media === "video" ? "video" : "text-to-image");
  params.set("prompt", shot.prompt);
  // Always sent, even empty: an empty value deliberately clears the old negative.
  params.set("negative_prompt", shot.negative_prompt);
  params.set("format", shot.aspect);
  if (shot.media === "video") {
    // The bundled LTX graph has no reference-conditioned flow from /flow.
    params.set("video_mode", "text-to-video");
    // Mirror the backend's documented defaults (5 s / 24 fps) so the link and
    // the card always agree, even when the director omitted the fields.
    params.set(
      "duration",
      String(snapVideoDuration(shot.duration_seconds) ?? DEFAULT_VIDEO_DURATION_SECONDS),
    );
    params.set("fps", String(snapVideoFps(shot.fps) ?? DEFAULT_VIDEO_FPS));
  }
  return `/generate?${params.toString()}`;
}
