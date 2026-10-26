/**
 * Framework-free faceted filter engine for the homepage Posts feed.
 *
 * Every facet is derived from metadata that the FastAPI backend actually
 * writes (see `backend/app/main.py`): prompt, negative_prompt, model_title,
 * model_type, model_filename, sampler_name, scheduler, width/height,
 * format_name, loras[], tags[], source/origin, tool_name, and the detailer
 * flags. Nothing here invents fields the API does not produce.
 *
 * Counts use true faceted-search semantics: an option's count is computed
 * against the result set filtered by every *other* active facet, excluding
 * its own selection. That keeps counts trustworthy when options are OR'd
 * within one facet.
 *
 * No React imports. Pure functions only, so this module is unit-testable.
 */

import type { AssetRecord, AssetType, GalleryMetadata } from "@/lib/api";

/* -------------------------------------------------------------------------- */
/* Facet value vocabulary                                                      */
/* -------------------------------------------------------------------------- */

export type PostMediaType = AssetType;

export type PostAspectRatio =
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "21:9"
  | "custom";

export type PostTimeRange = "all" | "today" | "week" | "month" | "year";

export type PostSource = "workspace" | "tool";

export type PostModelFamily =
  | "flux"
  | "sdxl"
  | "sd15"
  | "zimage"
  | "svd"
  | "other";

export type PostResolutionTier = "sd" | "hd" | "ultra" | "unknown";

export interface PostFilterOption<T extends string = string> {
  value: T;
  label: string;
}

/** Public taxonomy retained from the previous Posts header. */
export const POST_CATEGORY_PILLS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "character", label: "Character" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "illustration", label: "Illustration" },
  { id: "sci-fi", label: "Sci-Fi" },
  { id: "visual-design", label: "Visual Design" },
  { id: "space-design", label: "Space Design" },
  { id: "game-design", label: "Game Design" },
];

export const POST_MEDIA_TYPES: ReadonlyArray<PostFilterOption<PostMediaType>> = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "3d", label: "3D" },
];

export const POST_ASPECT_RATIOS: ReadonlyArray<PostFilterOption<PostAspectRatio>> = [
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "21:9", label: "21:9" },
  { value: "custom", label: "Custom" },
];

export const POST_TIME_RANGES: ReadonlyArray<PostFilterOption<PostTimeRange>> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "year", label: "This year" },
];

export const POST_SOURCES: ReadonlyArray<PostFilterOption<PostSource>> = [
  { value: "workspace", label: "Studio Canvas" },
  { value: "tool", label: "AI Tool Studio" },
];

export const POST_MODEL_FAMILIES: ReadonlyArray<PostFilterOption<PostModelFamily>> = [
  { value: "flux", label: "FLUX.1" },
  { value: "sdxl", label: "SDXL" },
  { value: "sd15", label: "SD 1.5" },
  { value: "zimage", label: "Z-Image / Turbo" },
  { value: "svd", label: "SVD" },
  { value: "other", label: "Other" },
];

export const POST_RESOLUTION_TIERS: ReadonlyArray<PostFilterOption<PostResolutionTier>> = [
  { value: "sd", label: "SD ≤1024" },
  { value: "hd", label: "HD ≤2048" },
  { value: "ultra", label: "Ultra >2048" },
  { value: "unknown", label: "Unknown" },
];

/* -------------------------------------------------------------------------- */
/* Filter state                                                               */
/* -------------------------------------------------------------------------- */

export interface PostFilters {
  query: string;
  categories: string[];
  mediaTypes: PostMediaType[];
  aspectRatios: PostAspectRatio[];
  timeRange: PostTimeRange;
  sources: PostSource[];
  modelFamilies: PostModelFamily[];
  modelTypes: string[];
  samplers: string[];
  schedulers: string[];
  resolutionTiers: PostResolutionTier[];
  loras: string[];
  tools: string[];
  tags: string[];
  detailerOnly: boolean;
  negativePromptOnly: boolean;
}

/** List-valued facets, handy for generic toggle/removal helpers. */
export const POST_FILTER_LIST_FACETS = [
  "categories",
  "mediaTypes",
  "aspectRatios",
  "sources",
  "modelFamilies",
  "modelTypes",
  "samplers",
  "schedulers",
  "resolutionTiers",
  "loras",
  "tools",
  "tags",
] as const;

export type PostFilterListFacet = (typeof POST_FILTER_LIST_FACETS)[number];

export const POST_FILTER_FACETS = [
  "query",
  ...POST_FILTER_LIST_FACETS,
  "timeRange",
  "detailerOnly",
  "negativePromptOnly",
] as const;

export type PostFilterFacet = (typeof POST_FILTER_FACETS)[number];

export function createDefaultPostFilters(): PostFilters {
  return {
    query: "",
    categories: [],
    mediaTypes: [],
    aspectRatios: [],
    timeRange: "all",
    sources: [],
    modelFamilies: [],
    modelTypes: [],
    samplers: [],
    schedulers: [],
    resolutionTiers: [],
    loras: [],
    tools: [],
    tags: [],
    detailerOnly: false,
    negativePromptOnly: false,
  };
}

/** Number of independent narrowing controls currently engaged. */
export function countActivePostFilters(filters: PostFilters): number {
  let count = filters.query.trim() ? 1 : 0;
  for (const facet of POST_FILTER_LIST_FACETS) count += filters[facet].length;
  if (filters.timeRange !== "all") count += 1;
  if (filters.detailerOnly) count += 1;
  if (filters.negativePromptOnly) count += 1;
  return count;
}

export function hasActivePostFilters(filters: PostFilters): boolean {
  return countActivePostFilters(filters) > 0;
}

/* -------------------------------------------------------------------------- */
/* Per-asset derivation                                                       */
/* -------------------------------------------------------------------------- */

function metaOf(asset: AssetRecord): GalleryMetadata | null {
  return asset.metadata;
}

export function postAssetTimestamp(asset: AssetRecord): number | null {
  const raw = asset.last_modified || asset.metadata?.created_at;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}

export function matchPostQuery(asset: AssetRecord, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const meta = metaOf(asset);
  if (!meta) return false;
  const haystack = [
    meta.prompt,
    meta.negative_prompt,
    meta.model_title,
    ...(meta.tags ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();
  return haystack.includes(query);
}

export function matchPostCategory(asset: AssetRecord, categoryId: string): boolean {
  if (categoryId === "all") return true;
  if (categoryId === "video") {
    return asset.type === "video" || /\.(mp4|webm|mov|mkv)$/i.test(asset.key || "");
  }

  const meta = metaOf(asset);
  const prompt = (meta?.prompt ?? "").toLowerCase();
  const modelTitle = (meta?.model_title ?? "").toLowerCase();
  const tags = (meta?.tags ?? []).map((tag) => tag.toLowerCase());

  if (categoryId === "visual-design") {
    return (
      prompt.includes("design") ||
      prompt.includes("graphic") ||
      prompt.includes("logo") ||
      tags.some((tag) => tag.includes("design"))
    );
  }
  if (categoryId === "space-design") {
    return (
      prompt.includes("architecture") ||
      prompt.includes("interior") ||
      prompt.includes("room") ||
      prompt.includes("space") ||
      tags.some((tag) => tag.includes("space") || tag.includes("arch"))
    );
  }
  if (categoryId === "game-design") {
    return (
      prompt.includes("game") ||
      prompt.includes("concept") ||
      prompt.includes("rpg") ||
      tags.some((tag) => tag.includes("game"))
    );
  }

  const keyword = categoryId.replace("-", " ");
  return (
    prompt.includes(keyword) ||
    modelTitle.includes(keyword) ||
    tags.some((tag) => tag.includes(keyword))
  );
}

export function postSourceOf(asset: AssetRecord): PostSource {
  const meta = metaOf(asset);
  if (meta?.source === "tool" || meta?.origin === "ai_tool_studio") return "tool";
  return "workspace";
}

export function matchPostTimeRange(asset: AssetRecord, range: PostTimeRange): boolean {
  if (range === "all") return true;
  const timestamp = postAssetTimestamp(asset);
  if (timestamp == null) return false;

  const now = Date.now();
  if (range === "today") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return timestamp >= startOfDay.getTime();
  }
  if (range === "week") return now - timestamp <= 7 * 24 * 60 * 60 * 1000;
  if (range === "month") return now - timestamp <= 30 * 24 * 60 * 60 * 1000;

  const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
  return timestamp >= startOfYear;
}

export function postModelFamilyOf(asset: AssetRecord): PostModelFamily | null {
  const meta = metaOf(asset);
  if (!meta) return null;
  const haystack = `${meta.model_title ?? ""} ${meta.model_filename ?? ""}`
    .trim()
    .toLowerCase();
  if (!haystack) return null;

  if (/flux/.test(haystack)) return "flux";
  if (/sdxl|sd[_ -]?xl|pony/.test(haystack)) return "sdxl";
  if (/sd[_ -]?1[._-]?5|sd15|v1[._-]?5/.test(haystack)) return "sd15";
  if (/z[_ -]?image|zimage/.test(haystack)) return "zimage";
  if (/\bsvd\b|stable[_ -]?video/.test(haystack)) return "svd";
  return "other";
}

const ASPECT_TARGETS: ReadonlyArray<{ value: PostAspectRatio; ratio: number }> = [
  { value: "1:1", ratio: 1 },
  { value: "4:3", ratio: 4 / 3 },
  { value: "3:4", ratio: 3 / 4 },
  { value: "16:9", ratio: 16 / 9 },
  { value: "9:16", ratio: 9 / 16 },
  { value: "21:9", ratio: 21 / 9 },
];

const ASPECT_RELATIVE_TOLERANCE = 0.04;

const NAMED_ASPECTS: Record<string, PostAspectRatio> = {
  "1:1": "1:1",
  "4:3": "4:3",
  "3:4": "3:4",
  "16:9": "16:9",
  "9:16": "9:16",
  "21:9": "21:9",
};

function bucketFromDimensions(width: number, height: number): PostAspectRatio {
  const ratio = width / height;
  let best: PostAspectRatio = "custom";
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const target of ASPECT_TARGETS) {
    const diff = Math.abs(ratio - target.ratio) / target.ratio;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = target.value;
    }
  }

  return bestDiff <= ASPECT_RELATIVE_TOLERANCE ? best : "custom";
}

/**
 * Prefers backend `format_name`, then tool `aspect_ratio`, then derives a
 * bucket from width/height. Returns null when nothing usable is recorded so
 * value-derived facets never count phantom "unknown" entries.
 */
export function postAspectRatioOf(asset: AssetRecord): PostAspectRatio | null {
  const meta = metaOf(asset);
  if (!meta) return null;

  const explicit = meta.format_name || meta.aspect_ratio;
  if (explicit) {
    const named = NAMED_ASPECTS[explicit];
    if (named) return named;
    // An explicit non-standard format (e.g. 3:2) still carries real
    // dimensions — bucket those rather than discarding the asset.
    if (meta.width && meta.height) return bucketFromDimensions(meta.width, meta.height);
    return "custom";
  }

  if (meta.width && meta.height) return bucketFromDimensions(meta.width, meta.height);
  return null;
}

export function postResolutionTierOf(asset: AssetRecord): PostResolutionTier {
  const meta = metaOf(asset);
  const width = meta?.width;
  const height = meta?.height;
  if (!width || !height) return "unknown";

  const longEdge = Math.max(width, height);
  if (longEdge <= 1024) return "sd";
  if (longEdge <= 2048) return "hd";
  return "ultra";
}

export function postHasDetailer(asset: AssetRecord): boolean {
  const meta = metaOf(asset);
  return Boolean(meta?.has_detailer || meta?.enable_detailer || asset.has_detailer || asset.enable_detailer);
}

export function postHasNegativePrompt(asset: AssetRecord): boolean {
  const negative = metaOf(asset)?.negative_prompt;
  return Boolean(negative && negative.trim());
}

function postModelTypeOf(asset: AssetRecord): string[] {
  const value = metaOf(asset)?.model_type;
  return value ? [value] : [];
}

function postSamplerOf(asset: AssetRecord): string[] {
  const value = metaOf(asset)?.sampler_name;
  return value ? [value] : [];
}

function postSchedulerOf(asset: AssetRecord): string[] {
  const value = metaOf(asset)?.scheduler;
  return value ? [value] : [];
}

function postLorasOf(asset: AssetRecord): string[] {
  return (metaOf(asset)?.loras ?? [])
    .map((lora) => lora.lora)
    .filter((value): value is string => Boolean(value));
}

function postToolOf(asset: AssetRecord): string[] {
  const value = metaOf(asset)?.tool_name;
  return value ? [value] : [];
}

function postTagsOf(asset: AssetRecord): string[] {
  return (metaOf(asset)?.tags ?? []).filter((tag): tag is string => Boolean(tag));
}

/* -------------------------------------------------------------------------- */
/* Predicate assembly                                                         */
/* -------------------------------------------------------------------------- */

type Predicate = (asset: AssetRecord) => boolean;

function buildPredicates(filters: PostFilters): Partial<Record<PostFilterFacet, Predicate>> {
  const predicates: Partial<Record<PostFilterFacet, Predicate>> = {};

  const query = filters.query.trim();
  if (query) predicates.query = (asset) => matchPostQuery(asset, query);

  if (filters.categories.length) {
    predicates.categories = (asset) =>
      filters.categories.some((category) => matchPostCategory(asset, category));
  }
  if (filters.mediaTypes.length) {
    predicates.mediaTypes = (asset) => filters.mediaTypes.includes(asset.type);
  }
  if (filters.aspectRatios.length) {
    predicates.aspectRatios = (asset) => {
      const ratio = postAspectRatioOf(asset);
      return ratio != null && filters.aspectRatios.includes(ratio);
    };
  }
  if (filters.timeRange !== "all") {
    predicates.timeRange = (asset) => matchPostTimeRange(asset, filters.timeRange);
  }
  if (filters.sources.length) {
    predicates.sources = (asset) => filters.sources.includes(postSourceOf(asset));
  }
  if (filters.modelFamilies.length) {
    predicates.modelFamilies = (asset) => {
      const family = postModelFamilyOf(asset);
      return family != null && filters.modelFamilies.includes(family);
    };
  }
  if (filters.modelTypes.length) {
    predicates.modelTypes = (asset) =>
      postModelTypeOf(asset).some((value) => filters.modelTypes.includes(value));
  }
  if (filters.samplers.length) {
    predicates.samplers = (asset) =>
      postSamplerOf(asset).some((value) => filters.samplers.includes(value));
  }
  if (filters.schedulers.length) {
    predicates.schedulers = (asset) =>
      postSchedulerOf(asset).some((value) => filters.schedulers.includes(value));
  }
  if (filters.resolutionTiers.length) {
    predicates.resolutionTiers = (asset) =>
      filters.resolutionTiers.includes(postResolutionTierOf(asset));
  }
  if (filters.loras.length) {
    predicates.loras = (asset) =>
      postLorasOf(asset).some((value) => filters.loras.includes(value));
  }
  if (filters.tools.length) {
    predicates.tools = (asset) =>
      postToolOf(asset).some((value) => filters.tools.includes(value));
  }
  if (filters.tags.length) {
    predicates.tags = (asset) =>
      postTagsOf(asset).some((value) => filters.tags.includes(value));
  }
  if (filters.detailerOnly) {
    predicates.detailerOnly = postHasDetailer;
  }
  if (filters.negativePromptOnly) {
    predicates.negativePromptOnly = postHasNegativePrompt;
  }

  return predicates;
}

/* -------------------------------------------------------------------------- */
/* Applying filters                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns assets matching every active facet. Selected options within one
 * facet are OR'd; facets compose with AND. Unknown metadata is never dropped
 * unless a facet genuinely cannot evaluate it.
 */
export function applyPostFilters(
  assets: AssetRecord[],
  filters: PostFilters
): AssetRecord[] {
  const predicates = buildPredicates(filters);
  const active = Object.values(predicates).filter(
    (predicate): predicate is Predicate => Boolean(predicate)
  );
  if (active.length === 0) return assets.slice();
  return assets.filter((asset) => active.every((predicate) => predicate(asset)));
}

/* -------------------------------------------------------------------------- */
/* Facet counts                                                               */
/* -------------------------------------------------------------------------- */

export interface PostFacetCounts {
  categories: Record<string, number>;
  mediaTypes: Record<PostMediaType, number>;
  aspectRatios: Record<PostAspectRatio, number>;
  timeRanges: Record<PostTimeRange, number>;
  sources: Record<PostSource, number>;
  modelFamilies: Record<PostModelFamily, number>;
  modelTypes: Record<string, number>;
  samplers: Record<string, number>;
  schedulers: Record<string, number>;
  resolutionTiers: Record<PostResolutionTier, number>;
  loras: Record<string, number>;
  tools: Record<string, number>;
  tags: Record<string, number>;
  detailerOnly: number;
  negativePromptOnly: number;
  total: number;
}

function zeroRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const key of keys) out[key] = 0;
  return out;
}

function collectValues(
  assets: AssetRecord[],
  valuesOf: (asset: AssetRecord) => string[]
): string[] {
  const set = new Set<string>();
  for (const asset of assets) {
    for (const value of valuesOf(asset)) set.add(value);
  }
  return Array.from(set);
}

function countValues(
  assets: AssetRecord[],
  keys: string[],
  valuesOf: (asset: AssetRecord) => string[]
): Record<string, number> {
  const counts = zeroRecord(keys);
  for (const asset of assets) {
    for (const value of new Set(valuesOf(asset))) {
      if (value in counts) counts[value] += 1;
    }
  }
  return counts;
}

/**
 * Computes option counts with true faceted-search semantics: each facet is
 * counted against the assets matching every other active facet (its own
 * selection ignored). With ≤60 assets in memory this full recomputation is
 * cheap and far easier to trust than incremental memoization.
 */
export function computePostFacetCounts(
  assets: AssetRecord[],
  filters: PostFilters
): PostFacetCounts {
  const active = buildPredicates(filters);
  const baseFor = (exclude?: PostFilterFacet): AssetRecord[] => {
    const activePredicates = Object.entries(active).filter(
      ([facet, predicate]) => facet !== exclude && Boolean(predicate)
    ) as Array<[PostFilterFacet, Predicate]>;
    if (activePredicates.length === 0) return assets;
    return assets.filter((asset) =>
      activePredicates.every(([, predicate]) => predicate(asset))
    );
  };

  const categoryBase = baseFor("categories");
  const categories: Record<string, number> = { all: categoryBase.length };
  for (const pill of POST_CATEGORY_PILLS) {
    if (pill.id === "all") continue;
    categories[pill.id] = categoryBase.filter((asset) =>
      matchPostCategory(asset, pill.id)
    ).length;
  }

  const mediaBase = baseFor("mediaTypes");
  const mediaTypes = zeroRecord(POST_MEDIA_TYPES.map((option) => option.value));
  for (const asset of mediaBase) mediaTypes[asset.type] += 1;

  const aspectBase = baseFor("aspectRatios");
  const aspectRatios = zeroRecord(POST_ASPECT_RATIOS.map((option) => option.value));
  for (const asset of aspectBase) {
    const ratio = postAspectRatioOf(asset);
    if (ratio) aspectRatios[ratio] += 1;
  }

  const timeBase = baseFor("timeRange");
  const timeRanges = zeroRecord(POST_TIME_RANGES.map((option) => option.value));
  timeRanges.all = timeBase.length;
  for (const option of POST_TIME_RANGES) {
    if (option.value === "all") continue;
    timeRanges[option.value] = timeBase.filter((asset) =>
      matchPostTimeRange(asset, option.value)
    ).length;
  }

  const sourceBase = baseFor("sources");
  const sources = zeroRecord(POST_SOURCES.map((option) => option.value));
  for (const asset of sourceBase) sources[postSourceOf(asset)] += 1;

  const familyBase = baseFor("modelFamilies");
  const modelFamilies = zeroRecord(POST_MODEL_FAMILIES.map((option) => option.value));
  for (const asset of familyBase) {
    const family = postModelFamilyOf(asset);
    if (family) modelFamilies[family] += 1;
  }

  const modelTypes = countValues(
    baseFor("modelTypes"),
    collectValues(assets, postModelTypeOf),
    postModelTypeOf
  );
  const samplers = countValues(
    baseFor("samplers"),
    collectValues(assets, postSamplerOf),
    postSamplerOf
  );
  const schedulers = countValues(
    baseFor("schedulers"),
    collectValues(assets, postSchedulerOf),
    postSchedulerOf
  );
  const loras = countValues(
    baseFor("loras"),
    collectValues(assets, postLorasOf),
    postLorasOf
  );
  const tools = countValues(
    baseFor("tools"),
    collectValues(assets, postToolOf),
    postToolOf
  );
  const tags = countValues(
    baseFor("tags"),
    collectValues(assets, postTagsOf),
    postTagsOf
  );

  const resolutionBase = baseFor("resolutionTiers");
  const resolutionTiers = zeroRecord(
    POST_RESOLUTION_TIERS.map((option) => option.value)
  );
  for (const asset of resolutionBase) {
    resolutionTiers[postResolutionTierOf(asset)] += 1;
  }

  const detailerBase = baseFor("detailerOnly");
  const negativeBase = baseFor("negativePromptOnly");

  return {
    categories,
    mediaTypes,
    aspectRatios,
    timeRanges,
    sources,
    modelFamilies,
    modelTypes,
    samplers,
    schedulers,
    resolutionTiers,
    loras,
    tools,
    tags,
    detailerOnly: detailerBase.filter(postHasDetailer).length,
    negativePromptOnly: negativeBase.filter(postHasNegativePrompt).length,
    total: applyPostFilters(assets, filters).length,
  };
}

/**
 * Alphabetical option ordering for data-derived facets. Ordering must stay
 * stable across selections — sorting by the live count would reshuffle the
 * list every time a facet changes, which is disorienting in a filter panel.
 */
export function sortedFacetEntries(
  counts: Record<string, number>
): Array<[string, number]> {
  return Object.entries(counts).sort(
    (a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" })
  );
}

/* -------------------------------------------------------------------------- */
/* Active-filter descriptors (shared with chips + empty state)                */
/* -------------------------------------------------------------------------- */

export interface PostFilterDescriptor {
  id: string;
  facet: PostFilterFacet;
  value: string | null;
  prefix: string;
  label: string;
}

function categoryLabel(id: string): string {
  return POST_CATEGORY_PILLS.find((pill) => pill.id === id)?.label ?? id;
}

function optionLabel<T extends string>(
  options: ReadonlyArray<PostFilterOption<T>>,
  value: T
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function getActivePostFilterDescriptors(
  filters: PostFilters
): PostFilterDescriptor[] {
  const descriptors: PostFilterDescriptor[] = [];

  const query = filters.query.trim();
  if (query) {
    descriptors.push({
      id: "query",
      facet: "query",
      value: null,
      prefix: "Search",
      label: `"${query}"`,
    });
  }

  for (const value of filters.categories) {
    descriptors.push({
      id: `category:${value}`,
      facet: "categories",
      value,
      prefix: "Category",
      label: categoryLabel(value),
    });
  }
  for (const value of filters.mediaTypes) {
    descriptors.push({
      id: `media:${value}`,
      facet: "mediaTypes",
      value,
      prefix: "Type",
      label: optionLabel(POST_MEDIA_TYPES, value),
    });
  }
  for (const value of filters.aspectRatios) {
    descriptors.push({
      id: `aspect:${value}`,
      facet: "aspectRatios",
      value,
      prefix: "Ratio",
      label: value,
    });
  }
  if (filters.timeRange !== "all") {
    descriptors.push({
      id: "timeRange",
      facet: "timeRange",
      value: filters.timeRange,
      prefix: "Time",
      label: optionLabel(POST_TIME_RANGES, filters.timeRange),
    });
  }
  for (const value of filters.sources) {
    descriptors.push({
      id: `source:${value}`,
      facet: "sources",
      value,
      prefix: "Source",
      label: optionLabel(POST_SOURCES, value),
    });
  }
  for (const value of filters.modelFamilies) {
    descriptors.push({
      id: `family:${value}`,
      facet: "modelFamilies",
      value,
      prefix: "Family",
      label: optionLabel(POST_MODEL_FAMILIES, value),
    });
  }
  for (const value of filters.modelTypes) {
    descriptors.push({
      id: `modelType:${value}`,
      facet: "modelTypes",
      value,
      prefix: "Model",
      label: value,
    });
  }
  for (const value of filters.samplers) {
    descriptors.push({
      id: `sampler:${value}`,
      facet: "samplers",
      value,
      prefix: "Sampler",
      label: value,
    });
  }
  for (const value of filters.schedulers) {
    descriptors.push({
      id: `scheduler:${value}`,
      facet: "schedulers",
      value,
      prefix: "Scheduler",
      label: value,
    });
  }
  for (const value of filters.resolutionTiers) {
    descriptors.push({
      id: `resolution:${value}`,
      facet: "resolutionTiers",
      value,
      prefix: "Resolution",
      label: optionLabel(POST_RESOLUTION_TIERS, value),
    });
  }
  for (const value of filters.loras) {
    descriptors.push({
      id: `lora:${value}`,
      facet: "loras",
      value,
      prefix: "LoRA",
      label: value.split(/[\\/]/).pop() ?? value,
    });
  }
  for (const value of filters.tools) {
    descriptors.push({
      id: `tool:${value}`,
      facet: "tools",
      value,
      prefix: "Tool",
      label: value,
    });
  }
  for (const value of filters.tags) {
    descriptors.push({
      id: `tag:${value}`,
      facet: "tags",
      value,
      prefix: "Tag",
      label: value,
    });
  }
  if (filters.detailerOnly) {
    descriptors.push({
      id: "detailerOnly",
      facet: "detailerOnly",
      value: null,
      prefix: "",
      label: "Detailer applied",
    });
  }
  if (filters.negativePromptOnly) {
    descriptors.push({
      id: "negativePromptOnly",
      facet: "negativePromptOnly",
      value: null,
      prefix: "",
      label: "Has negative prompt",
    });
  }

  return descriptors;
}

/** Returns new filter state with one descriptor's selection removed. */
export function removeActivePostFilter(
  filters: PostFilters,
  descriptor: PostFilterDescriptor
): PostFilters {
  switch (descriptor.facet) {
    case "query":
      return { ...filters, query: "" };
    case "timeRange":
      return { ...filters, timeRange: "all" };
    case "detailerOnly":
      return { ...filters, detailerOnly: false };
    case "negativePromptOnly":
      return { ...filters, negativePromptOnly: false };
    default: {
      const facet = descriptor.facet as PostFilterListFacet;
      const current = filters[facet] as readonly string[];
      const next = current.filter((value) => value !== descriptor.value);
      return { ...filters, [facet]: next } as PostFilters;
    }
  }
}

/** Adds/removes a value from a list facet without mutating the input. */
export function togglePostFilterValue<T extends string>(
  list: readonly T[],
  value: T
): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}
