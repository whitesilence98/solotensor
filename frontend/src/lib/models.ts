import type { InstalledGalleryModel, PublicModelSummary, ModelPrecision } from "./api";

/**
 * Clean and normalize a model filename or identifier for fuzzy comparison.
 */
export function cleanIdentifier(value: string): string {
  const base = value.split(/[/\\]/).pop() || value;
  return base
    .replace(/\.(safetensors|sft|ckpt|pt|pth|bin|gguf)$/i, "")
    .trim()
    .toLowerCase();
}

/**
 * Normalize file paths across Windows and POSIX separators and case.
 */
export function normalizeModelPath(path: string): string {
  return path.replace(/\\/g, "/").trim().toLowerCase();
}

/**
 * Find matching InstalledGalleryModel using multi-stage matching:
 * 1. Exact model_id
 * 2. Exact file_id
 * 3. Exact normalized path or exact title match
 * 4. Cleaned stem match (ignoring extensions and directories)
 * 5. Normalized path substring containment
 * 6. Cleaned stem substring containment
 */
export function findMatchingModel(
  params: {
    modelId?: string | null;
    fileId?: string | null;
    filename?: string | null;
    title?: string | null;
  },
  modelOptions?: InstalledGalleryModel[]
): InstalledGalleryModel | null {
  if (!modelOptions || modelOptions.length === 0) return null;

  // 1. Direct model_id match
  if (params.modelId) {
    const cleanId = params.modelId.trim().toLowerCase();
    const matched = modelOptions.find((m) => m.model_id.toLowerCase() === cleanId);
    if (matched) return matched;
  }

  // 2. Direct file_id match
  if (params.fileId) {
    const cleanFileId = params.fileId.trim().toLowerCase();
    const matched = modelOptions.find((m) => m.file_id.toLowerCase() === cleanFileId);
    if (matched) return matched;
  }

  const rawCandidates = [params.filename, params.title].filter(
    (item): item is string => Boolean(item && item.trim())
  );
  if (rawCandidates.length === 0) return null;

  for (const raw of rawCandidates) {
    const rawLower = raw.toLowerCase().trim();
    const rawNorm = normalizeModelPath(raw);
    const cleanedRaw = cleanIdentifier(raw);

    // 3. Exact normalized path or exact title match
    const exact = modelOptions.find((m) => {
      const mNorm = normalizeModelPath(m.filename);
      const mTitle = m.title.toLowerCase().trim();
      return (
        mTitle === rawLower ||
        mNorm === rawNorm ||
        m.filename.toLowerCase().trim() === rawLower
      );
    });
    if (exact) return exact;

    // 4. Cleaned stem match
    if (cleanedRaw) {
      const stemMatch = modelOptions.find((m) => {
        const mStem = cleanIdentifier(m.filename);
        const mTitleStem = cleanIdentifier(m.title);
        return mStem === cleanedRaw || mTitleStem === cleanedRaw;
      });
      if (stemMatch) return stemMatch;
    }

    // 5. Normalized path substring containment
    if (rawNorm.length > 3) {
      const pathSubMatch = modelOptions.find((m) => {
        const mNorm = normalizeModelPath(m.filename);
        return mNorm.includes(rawNorm) || rawNorm.includes(mNorm);
      });
      if (pathSubMatch) return pathSubMatch;
    }

    // 6. Stem substring containment
    if (cleanedRaw.length > 3) {
      const stemSubMatch = modelOptions.find((m) => {
        const mStem = cleanIdentifier(m.filename);
        const mTitleStem = cleanIdentifier(m.title);
        return (
          (mStem.length > 3 && (mStem.includes(cleanedRaw) || cleanedRaw.includes(mStem))) ||
          (mTitleStem.length > 3 && (mTitleStem.includes(cleanedRaw) || cleanedRaw.includes(mTitleStem)))
        );
      });
      if (stemSubMatch) return stemSubMatch;
    }
  }

  return null;
}

/**
 * Resolves the user-facing display name for a LoRA item.
 * Prefers the curated gallery model title, falling back to item-level title or cleaned stem.
 */
export function resolveLoraDisplayName(
  item: {
    lora: string;
    model_id?: string | null;
    modelId?: string | null;
    file_id?: string | null;
    fileId?: string | null;
    title?: string | null;
    name?: string | null;
  },
  modelOptions?: InstalledGalleryModel[]
): string {
  if (item.title && item.title.trim()) return item.title.trim();
  if (item.name && item.name.trim()) return item.name.trim();

  const matched = findMatchingModel(
    {
      modelId: item.model_id || item.modelId,
      fileId: item.file_id || item.fileId,
      filename: item.lora,
      title: item.title,
    },
    modelOptions
  );

  if (matched?.title && matched.title.trim()) {
    return matched.title.trim();
  }

  const raw = item.lora || "";
  const base = raw.split(/[/\\]/).pop() || raw;
  return base.replace(/\.(safetensors|sft|ckpt|pt|pth|bin|gguf)$/i, "").trim();
}

/**
 * Resolves a direct URL to a Model / LoRA detail page in `/models/[model_id]`.
 * Matches direct modelId, fileId, or matches filename/title against installed and public models.
 */
export function resolveModelGalleryUrl(
  params: {
    modelId?: string | null;
    title?: string | null;
    filename?: string | null;
    fileId?: string | null;
  },
  modelOptions?: InstalledGalleryModel[],
  publicModels?: PublicModelSummary[]
): string | null {
  // 1. Direct valid 32-character hexadecimal model_id
  if (params.modelId && /^[0-9a-f]{32}$/i.test(params.modelId.trim())) {
    return `/models/${params.modelId.trim()}`;
  }

  // 2. Match against installed gallery models
  const matched = findMatchingModel(params, modelOptions);
  if (matched?.model_id) {
    return `/models/${matched.model_id}`;
  }

  const rawCandidates = [params.filename, params.title].filter(
    (item): item is string => Boolean(item && item.trim())
  );

  // 3. Match against public model summaries (if available)
  if (rawCandidates.length > 0 && publicModels && publicModels.length > 0) {
    for (const raw of rawCandidates) {
      const rawLower = raw.toLowerCase().trim();
      const cleanedRaw = cleanIdentifier(raw);

      const exact = publicModels.find(
        (p) =>
          p.title.toLowerCase().trim() === rawLower ||
          cleanIdentifier(p.title) === cleanedRaw
      );
      if (exact?.model_id) {
        return `/models/${exact.model_id}`;
      }

      const sub = publicModels.find((p) => {
        const pClean = cleanIdentifier(p.title);
        return cleanedRaw && pClean && (pClean.includes(cleanedRaw) || cleanedRaw.includes(pClean));
      });
      if (sub?.model_id) {
        return `/models/${sub.model_id}`;
      }
    }
  }

  // 4. Fallback query if human-readable and not generic placeholder
  const fallbackQuery = params.title || (params.filename ? cleanIdentifier(params.filename) : "");
  if (
    fallbackQuery &&
    fallbackQuery !== "Standard Model" &&
    fallbackQuery !== "ComfyUI" &&
    !fallbackQuery.startsWith("custom")
  ) {
    return `/models?q=${encodeURIComponent(fallbackQuery)}`;
  }

  return null;
}

export const SUPPORTED_MODEL_PRECISIONS: ModelPrecision[] = [
  "FP8",
  "FP16",
  "BF16",
  "FP32",
  "Quantized",
];

/**
 * Heuristically detects floating point precision from file naming patterns
 * (e.g. krea2_turbo_fp8_scaled.safetensors -> "FP8", model_bf16.safetensors -> "BF16").
 */
export function detectPrecisionFromFilename(
  filename?: string | null,
  fallback: ModelPrecision = "FP16"
): ModelPrecision {
  if (!filename) return fallback;
  const lower = filename.toLowerCase();

  // FP8 patterns: fp8, e4m3, e5m2, fp8_scaled, etc.
  if (
    lower.includes("fp8") ||
    lower.includes("e4m3") ||
    lower.includes("e5m2") ||
    lower.includes("-fp8") ||
    lower.includes("_fp8")
  ) {
    return "FP8";
  }

  // BF16 patterns: bf16, bfloat16
  if (lower.includes("bf16") || lower.includes("bfloat16")) {
    return "BF16";
  }

  // FP32 patterns: fp32, float32
  if (lower.includes("fp32") || lower.includes("float32")) {
    return "FP32";
  }

  // Quantized patterns: gguf, q8, q4, q5, int8, int4, awq, exl2
  if (
    lower.includes("gguf") ||
    lower.includes("quantized") ||
    /\b(q4|q5|q8|int4|int8|awq|exl2)\b/i.test(lower)
  ) {
    return "Quantized";
  }

  // FP16 patterns
  if (lower.includes("fp16") || lower.includes("float16")) {
    return "FP16";
  }

  return fallback;
}
