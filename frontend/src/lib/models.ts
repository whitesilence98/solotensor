import type { InstalledGalleryModel, PublicModelSummary } from "./api";

/**
 * Clean and normalize a model filename or identifier for fuzzy comparison.
 */
function cleanIdentifier(value: string): string {
  const base = value.split(/[/\\]/).pop() || value;
  return base
    .replace(/\.(safetensors|sft|ckpt|pt|pth|bin|gguf)$/i, "")
    .trim()
    .toLowerCase();
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

  // 2. Direct file_id match in installed models
  if (params.fileId && modelOptions && modelOptions.length > 0) {
    const matched = modelOptions.find((m) => m.file_id === params.fileId);
    if (matched?.model_id) {
      return `/models/${matched.model_id}`;
    }
  }

  const rawCandidates = [params.filename, params.title].filter(
    (item): item is string => Boolean(item && item.trim())
  );

  // 3. Match against installed gallery models
  if (rawCandidates.length > 0 && modelOptions && modelOptions.length > 0) {
    for (const raw of rawCandidates) {
      const rawLower = raw.toLowerCase().trim();
      const cleanedRaw = cleanIdentifier(raw);

      // Exact title, filename, or cleaned stem match
      const exact = modelOptions.find(
        (m) =>
          m.title.toLowerCase().trim() === rawLower ||
          m.filename.toLowerCase().trim() === rawLower ||
          cleanIdentifier(m.filename) === cleanedRaw ||
          cleanIdentifier(m.title) === cleanedRaw
      );
      if (exact?.model_id) {
        return `/models/${exact.model_id}`;
      }

      // Substring match
      const sub = modelOptions.find((m) => {
        const mClean = cleanIdentifier(m.filename);
        const mTitleClean = cleanIdentifier(m.title);
        return (
          (cleanedRaw && mClean && (mClean.includes(cleanedRaw) || cleanedRaw.includes(mClean))) ||
          (cleanedRaw && mTitleClean && (mTitleClean.includes(cleanedRaw) || cleanedRaw.includes(mTitleClean)))
        );
      });
      if (sub?.model_id) {
        return `/models/${sub.model_id}`;
      }
    }
  }

  // 4. Match against public model summaries (if available)
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

  // 5. Fallback query if human-readable and not generic placeholder
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
