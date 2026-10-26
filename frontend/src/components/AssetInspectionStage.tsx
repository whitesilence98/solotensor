"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  Shield,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
  Eye,
  EyeOff,
} from "lucide-react";
import { formatBytes } from "@/components/AssetCard";
import UserAvatar from "@/components/UserAvatar";
import ComparisonSlider from "@/components/ComparisonSlider";
import {
  api,
  assetTypeOf,
  resolveMediaUrl,
  type GalleryItem,
  type GalleryMetadata,
  type InstalledGalleryModel,
} from "@/lib/api";
import {
  findMatchingModel,
  resolveLoraDisplayName,
  resolveModelGalleryUrl,
} from "@/lib/models";
import { useAuth } from "@/lib/auth-context";

/**
 * Formats timestamp into exact string: 'Published: MMM d, yyyy h:mm a'
 * e.g., 'Published: Sep 18, 2026 6:44 AM'
 */
export function formatPublishedDate(rawDate?: string | number | null): string {
  if (!rawDate) return "Published: Just now";
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return "Published: Just now";
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    const year = d.getFullYear();
    const time = d
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\u202f/g, " ");
    return `Published: ${month} ${day}, ${year} ${time}`;
  } catch {
    return "Published: Just now";
  }
}

export const SAVED_INPUTS_KEY = "solotensor:last-successful-inputs:v4";

/**
 * Stores remix parameters into localStorage so navigating to / hydrates Studio automatically.
 */
export function saveRemixToStorage(meta: GalleryMetadata, modelOptions?: InstalledGalleryModel[]) {
  if (typeof window === "undefined" || !meta) return;
  try {
    const matchedModel = findMatchingModel(
      {
        modelId: meta.model_id,
        fileId: meta.file_id,
        filename: meta.model_filename || meta.unet_name,
        title: meta.model_title,
      },
      modelOptions
    );

    const activeLoras = Array.isArray(meta.loras)
      ? meta.loras.map((l, index) => {
        const matchedLora = findMatchingModel(
          {
            modelId: (l as any).model_id || (l as any).modelId,
            fileId: (l as any).file_id || (l as any).fileId,
            filename: l.lora,
            title: (l as any).title,
          },
          modelOptions
        );
        const resolvedTitle = matchedLora?.title || resolveLoraDisplayName(l, modelOptions);
        return {
          id: `remix-${index}-${l.lora}`,
          title: resolvedTitle,
          baseModel: matchedLora?.version_name || "SDXL",
          weight: l.strength,
          enabled: l.on,
          modelId: l.model_id || matchedLora?.model_id,
          versionId: l.version_id || matchedLora?.version_id,
          fileId: l.file_id || matchedLora?.file_id,
        };
      })
      : [];

    const draft = {
      prompt: meta.prompt || "",
      negativePrompt: typeof meta.negative_prompt === "string" ? meta.negative_prompt : "",
      seed: meta.seed !== undefined && meta.seed !== null ? String(meta.seed) : "",
      steps: meta.steps !== undefined && meta.steps !== null ? String(meta.steps) : "25",
      cfg: meta.cfg !== undefined && meta.cfg !== null ? String(meta.cfg) : "7.0",
      samplerName: meta.sampler_name || "euler",
      scheduler: meta.scheduler || "normal",
      denoise: meta.denoise !== undefined && meta.denoise !== null ? String(meta.denoise) : "1",
      format: meta.format_name || "1:1",
      modelId: meta.model_id || matchedModel?.model_id || "",
      versionId: meta.version_id || matchedModel?.version_id || "",
      fileId: meta.file_id || matchedModel?.file_id || "",
      loras: activeLoras,
    };

    localStorage.setItem(SAVED_INPUTS_KEY, JSON.stringify(draft));
  } catch {
    /* ignore storage errors */
  }
}

export interface AssetInspectionStageProps {
  mode: "modal" | "standalone";
  asset: GalleryItem;
  items?: GalleryItem[];
  currentIndex?: number;
  onSelectAsset?: (asset: GalleryItem) => void;
  onClose?: () => void;
  modelOptions?: InstalledGalleryModel[];
  onRemix?: (meta: GalleryMetadata) => void;
  onSetReferenceImage?: (url: string) => void;
  onDeleteOutput?: (key: string) => void;
  backHref?: string;
}

export default function AssetInspectionStage({
  mode,
  asset,
  items = [],
  currentIndex,
  onSelectAsset,
  onClose,
  modelOptions = [],
  onRemix,
  onSetReferenceImage,
  onDeleteOutput,
  backHref = "/",
}: AssetInspectionStageProps) {
  const router = useRouter();
  const [internalModelOptions, setInternalModelOptions] = useState<InstalledGalleryModel[]>(modelOptions);

  useEffect(() => {
    if (modelOptions && modelOptions.length > 0) {
      setInternalModelOptions(modelOptions);
    } else {
      let cancelled = false;
      void api
        .listSelectableModels()
        .then((items) => {
          if (!cancelled && items && items.length > 0) {
            setInternalModelOptions(items);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [modelOptions]);

  const effectiveModelOptions = internalModelOptions.length > 0 ? internalModelOptions : modelOptions;

  const [isZoomed, setIsZoomed] = useState(false);
  const detailerBeforeUrl = (asset as any)?.before_detailer_url || asset.metadata?.before_detailer_url || null;
  const isDetailer = Boolean(
    detailerBeforeUrl ||
    (asset as any)?.has_detailer ||
    (asset as any)?.enable_detailer ||
    asset.metadata?.has_detailer ||
    (asset.metadata as any)?.enable_detailer
  );
  const [showComparison, setShowComparison] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Prompt Clamping & Expansion State (compact 5-6 lines collapsed)
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isPromptOverflowing, setIsPromptOverflowing] = useState(false);
  const promptTextRef = useRef<HTMLDivElement>(null);

  const [isNegExpanded, setIsNegExpanded] = useState(false);
  const [isNegOverflowing, setIsNegOverflowing] = useState(false);
  const negTextRef = useRef<HTMLDivElement>(null);

  // Tagging State
  const [tags, setTags] = useState<string[]>(Array.isArray(asset.metadata?.tags) ? asset.metadata.tags : []);
  const [tagError, setTagError] = useState<string | null>(null);
  const [newTagDraft, setNewTagDraft] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagToast, setTagToast] = useState<string | null>(null);

  // Moderation Governance State
  const { user, isMod, isAdmin, hasPermission } = useAuth();
  const canModerate = isMod || isAdmin || hasPermission("moderation:review_queue") || hasPermission("generation:delete_any");
  const [modMenuOpen, setModMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isNsfw, setIsNsfw] = useState(
    Array.isArray(asset.metadata?.tags) && asset.metadata.tags.some((t) => t.toLowerCase() === "nsfw" || t.toLowerCase() === "mature")
  );
  const [modToast, setModToast] = useState<string | null>(null);

  const handleModAction = async (action: "hide" | "toggle_nsfw" | "takedown") => {
    try {
      if (action === "hide") {
        const next = !isHidden;
        setIsHidden(next);
        await api.takeModerationAction({
          target_type: "post",
          target_id: asset.key,
          action: "hide",
          notes: next ? "Asset hidden by moderator" : "Asset unhidden by moderator",
        });
        setModToast(next ? "[Mod] Output hidden from gallery" : "[Mod] Output restored to gallery");
      } else if (action === "toggle_nsfw") {
        const next = !isNsfw;
        setIsNsfw(next);
        const updatedTags = next
          ? [...tags, "nsfw"]
          : tags.filter((t) => t.toLowerCase() !== "nsfw" && t.toLowerCase() !== "mature");
        setTags(updatedTags);
        if (asset.metadata) {
          asset.metadata.tags = updatedTags;
        }
        await api.takeModerationAction({
          target_type: "post",
          target_id: asset.key,
          action: "toggle_nsfw",
          notes: next ? "Marked NSFW/Mature" : "Cleared NSFW/Mature flag",
        });
        setModToast(next ? "[Mod] Marked as NSFW/Mature" : "[Mod] NSFW tag removed");
      } else if (action === "takedown") {
        await api.takeModerationAction({
          target_type: "post",
          target_id: asset.key,
          action: "takedown",
          notes: "Moderator emergency takedown",
        });
        setModToast("[Mod] Asset taken down");
        setTimeout(() => {
          onDeleteOutput?.(asset.key);
          onClose?.();
        }, 1200);
      }
      setTimeout(() => setModToast(null), 3500);
      setModMenuOpen(false);
    } catch {
      setModToast("[Mod] Action could not be recorded");
      setTimeout(() => setModToast(null), 3000);
    }
  };

  useEffect(() => {
    setTags(Array.isArray(asset.metadata?.tags) ? asset.metadata.tags : []);
    setTagError(null);
  }, [asset.key, asset.metadata?.tags]);

  const handleRemoveTag = async (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    setTags(nextTags);
    if (asset.metadata) {
      asset.metadata.tags = nextTags;
    }
    try {
      await api.updateAssetTags(asset.key, nextTags);
    } catch {
      setTags(tags);
    }
  };

  const handleAddTagSubmit = async () => {
    const trimmed = newTagDraft.trim().toLowerCase();
    if (!trimmed) {
      setIsAddingTag(false);
      return;
    }
    if (tags.includes(trimmed)) {
      setNewTagDraft("");
      setIsAddingTag(false);
      return;
    }
    const nextTags = [...tags, trimmed];
    setTags(nextTags);
    setNewTagDraft("");
    setIsAddingTag(false);
    if (asset.metadata) {
      asset.metadata.tags = nextTags;
    }
    try {
      await api.updateAssetTags(asset.key, nextTags);
    } catch {
      setTags(tags);
    }
  };


  const meta = asset.metadata;
  const mediaUrl = resolveMediaUrl(asset.url) || asset.url;

  // Resolve Author Profile & Publication Metadata
  const rawMeta = (meta || {}) as Record<string, any>;
  const rawAsset = asset as Record<string, any>;

  const authorUsername: string =
    rawMeta.author_username ||
    rawAsset.author_username ||
    rawMeta.author ||
    rawAsset.author ||
    user?.username ||
    "Crea2re";

  const authorDisplayName: string =
    rawMeta.author_display_name ||
    rawAsset.author_display_name ||
    (rawMeta.author_username ? rawMeta.author_username : null) ||
    (rawAsset.author_username ? rawAsset.author_username : null) ||
    user?.displayName ||
    user?.username ||
    "Crea2re";

  const authorAvatarUrl: string | null =
    rawMeta.author_avatar_url ||
    rawMeta.author_avatar ||
    rawAsset.author_avatar_url ||
    rawAsset.author_avatar ||
    (user?.username && authorUsername === user.username ? user.avatarUrl : null);

  const authorRole: string | undefined =
    rawMeta.author_role ||
    rawAsset.author_role ||
    (user?.username && authorUsername === user.username ? user.role : undefined);

  const publishedDate = useMemo(() => {
    return formatPublishedDate(meta?.created_at || asset.last_modified);
  }, [meta?.created_at, asset.last_modified]);

  // Auto-measure prompt overflow against compact limit (~5-6 lines, 130px) & reset state on asset change
  useEffect(() => {
    setIsPromptExpanded(false);
    setIsNegExpanded(false);

    const checkOverflow = () => {
      if (promptTextRef.current) {
        setIsPromptOverflowing(promptTextRef.current.scrollHeight > 132);
      }
      if (negTextRef.current) {
        setIsNegOverflowing(negTextRef.current.scrollHeight > 132);
      }
    };

    checkOverflow();
    const timer = setTimeout(checkOverflow, 60);
    window.addEventListener("resize", checkOverflow);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [asset.key, meta?.prompt, meta?.negative_prompt]);

  const effectiveItems = items.length > 0 ? items : [asset];
  const activeIndex =
    currentIndex !== undefined && currentIndex >= 0
      ? currentIndex
      : effectiveItems.findIndex(
        (item) => item.key === asset.key || (item.url && item.url === asset.url)
      );
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
  const hasCarousel = effectiveItems.length > 1;

  const isVideo =
    assetTypeOf(asset) === "video" ||
    asset.url.endsWith(".mp4") ||
    asset.url.endsWith(".webm") ||
    asset.url.endsWith(".mov");

  const copyText = useCallback((text: string, key: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  }, []);

  const handlePrev = useCallback(() => {
    if (!hasCarousel || !onSelectAsset) return;
    const prevIdx = (resolvedIndex - 1 + effectiveItems.length) % effectiveItems.length;
    setIsZoomed(false);
    setConfirmDelete(false);
    onSelectAsset(effectiveItems[prevIdx]);
  }, [hasCarousel, onSelectAsset, resolvedIndex, effectiveItems]);

  const handleNext = useCallback(() => {
    if (!hasCarousel || !onSelectAsset) return;
    const nextIdx = (resolvedIndex + 1) % effectiveItems.length;
    setIsZoomed(false);
    setConfirmDelete(false);
    onSelectAsset(effectiveItems[nextIdx]);
  }, [hasCarousel, onSelectAsset, resolvedIndex, effectiveItems]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Escape") {
        if (isZoomed) {
          e.preventDefault();
          setIsZoomed(false);
        } else if (mode === "modal" && onClose) {
          e.preventDefault();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext, isZoomed, mode, onClose]);

  const handleRemixClick = () => {
    if (!meta) return;
    if (onRemix) {
      onRemix(meta);
      onClose?.();
    } else {
      saveRemixToStorage(meta, effectiveModelOptions);
      router.push("/generate");
    }
  };

  const matchedBaseModel = findMatchingModel(
    {
      modelId: meta?.model_id,
      fileId: meta?.file_id,
      filename:
        meta?.model_filename ||
        meta?.unet_name ||
        ((meta as Record<string, unknown> | null | undefined)?.model as string | undefined),
      title: meta?.model_title,
    },
    effectiveModelOptions
  );

  const baseModelTitle = (() => {
    if (meta?.model_title && meta.model_title.trim()) return meta.model_title.trim();
    if (matchedBaseModel?.title) return matchedBaseModel.title;
    const raw =
      meta?.model_filename ||
      meta?.unet_name ||
      (meta as Record<string, unknown> | null | undefined)?.model ||
      (meta as Record<string, unknown> | null | undefined)?.model_name;
    if (typeof raw === "string" && raw.trim()) {
      const base = raw.split(/[/\\]/).pop() || raw;
      return base.replace(/\.(safetensors|sft|ckpt|pt|pth|bin|gguf)$/i, "").trim();
    }
    return null;
  })();

  const baseModelVersion = meta?.model_version || matchedBaseModel?.version_name || null;

  const modelUrl = resolveModelGalleryUrl(
    {
      modelId: meta?.model_id || matchedBaseModel?.model_id,
      title: meta?.model_title || baseModelTitle,
      filename:
        meta?.model_filename ||
        meta?.unet_name ||
        ((meta as Record<string, unknown> | null | undefined)?.model as string | undefined) ||
        matchedBaseModel?.filename,
      fileId: meta?.file_id || matchedBaseModel?.file_id,
    },
    effectiveModelOptions
  );

  const activeLoras = Array.isArray(meta?.loras) ? meta.loras : [];
  const hasBaseModel = Boolean(baseModelTitle);
  const totalModelsCount = (hasBaseModel ? 1 : 0) + activeLoras.length;

  const containerClasses =
    mode === "modal"
      ? "relative grid max-h-[88vh] min-h-0 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-raised)] lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] shadow-2xl"
      : "relative grid min-h-[580px] overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-raised)] lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] shadow-2xl";

  return (
    <div className={containerClasses}>
      {/* Floating Close Button in Modal Mode (Mobile) */}
      {mode === "modal" && onClose && (
        <button
          type="button"
          onClick={() => {
            setIsZoomed(false);
            setConfirmDelete(false);
            onClose();
          }}
          className="absolute top-3.5 right-3.5 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition hover:border-white/30 hover:bg-black/90 hover:text-white active:scale-95 shadow-md lg:hidden"
          aria-label="Close dialog"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Left Column: Atmospheric Media Stage */}
      <div
        className={`relative flex flex-col items-center justify-center overflow-hidden bg-[var(--surface-sunken)] p-4 sm:p-6 select-none ${mode === "modal" ? "min-h-[380px] lg:min-h-[580px]" : "min-h-[460px] lg:min-h-[640px]"
          }`}
      >
        {/* Ambient blurred backdrop scrim mirroring artwork palette */}
        <div
          className="pointer-events-none absolute inset-0 -z-0 opacity-25 blur-3xl scale-125 transition-opacity duration-700 overflow-hidden"
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
        </div>


        {/* Detailer Badge on Stage */}
        {isDetailer && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-md bg-black/75 backdrop-blur-md border border-[var(--accent)]/40 px-2.5 py-1 font-mono text-[10px] font-semibold text-[var(--accent)] shadow-md pointer-events-none">
            <Sparkles className="h-3 w-3 fill-current" />
            <span>2-Pass Face Detailer</span>
          </div>
        )}

        {/* Previous / Next Floating Chevrons */}
        {hasCarousel && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/80 backdrop-blur-md hover:border-white/30 hover:bg-black/90 hover:text-white transition active:scale-95 shadow-2xl"
              title="Previous output (← Arrow Left)"
              aria-label="Previous output"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/80 backdrop-blur-md hover:border-white/30 hover:bg-black/90 hover:text-white transition active:scale-95 shadow-2xl"
              title="Next output (→ Arrow Right)"
              aria-label="Next output"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Active Stage Media */}
        <div
          className={`relative z-10 flex h-full w-full items-center justify-center ${isZoomed
              ? "overflow-auto cursor-grab active:cursor-grabbing p-4"
              : "p-2 sm:p-4"
            }`}
        >
          {showComparison && detailerBeforeUrl && !isVideo ? (
            <ComparisonSlider
              before={resolveMediaUrl(detailerBeforeUrl) || detailerBeforeUrl}
              after={mediaUrl}
              beforeLabel="Original Base"
              afterLabel="Detailed"
              className="w-full max-h-[78vh]"
            />
          ) : isVideo ? (
            <video
              src={mediaUrl}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[78vh] max-w-full rounded-xl object-contain drop-shadow-2xl"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl}
              alt={meta?.prompt ?? "Generated artwork"}
              onClick={() => setIsZoomed((z) => !z)}
              className={`rounded-xl drop-shadow-2xl transition-[max-height,transform] duration-200 ${isZoomed
                  ? "max-h-none max-w-none object-none shadow-2xl cursor-zoom-out"
                  : "max-h-[78vh] max-w-full object-contain cursor-zoom-in"
                }`}
            />
          )}
        </div>

        {/* Bottom-Right Media Viewport Action Controls */}
        <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 flex items-center gap-2 drop-shadow-md">
          {/* Before/After Detailer Compare Toggle */}
          {detailerBeforeUrl && !isVideo && (
            <button
              type="button"
              onClick={() => setShowComparison((s) => !s)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur-md transition shadow-md ${
                showComparison
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-white/10 bg-black/60 text-white/90 hover:border-white/30 hover:bg-black/80 hover:text-white"
              }`}
              title="Toggle Before/After Face Detailer comparison slider"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{showComparison ? "Exit Compare" : "Compare Before/After"}</span>
            </button>
          )}
          {/* Reference Image CTA */}
          {onSetReferenceImage && (
            <button
              type="button"
              onClick={() => {
                onSetReferenceImage(mediaUrl);
                onClose?.();
              }}
              className="p-1.5 rounded text-white/40 hover:text-white transition-all active:scale-95"
              title="Use as reference"
              aria-label="Use as reference"
            >
              <Layers className="h-4 w-4" />
            </button>
          )}


          {/* Download / Save */}
          <a
            href={mediaUrl}
            download={meta?.source_filename || asset.key.split("/").pop() || "output.png"}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded text-white/40 hover:text-white transition-all active:scale-95"
            title="Download asset"
            aria-label="Download asset"
          >
            <Download className="h-4 w-4" />
          </a>

          {/* Delete Action with Safe Confirmation */}
          {onDeleteOutput && (
            <button
              type="button"
              onClick={() => {
                if (confirmDelete) {
                  onDeleteOutput(asset.key);
                  onClose?.();
                } else {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3500);
                }
              }}
              className={`p-1.5 rounded transition-all active:scale-95 flex items-center ${confirmDelete
                  ? "gap-1 px-2 text-red-400 bg-red-500/20 hover:bg-red-500/30 font-mono text-[11px] font-medium animate-pulse"
                  : "text-white/40 hover:text-red-400"
                }`}
              title={confirmDelete ? "Click again to permanently delete" : "Delete asset"}
              aria-label={confirmDelete ? "Confirm delete asset" : "Delete asset"}
            >
              <Trash2 className="h-4 w-4" />
              {confirmDelete && <span>Confirm?</span>}
            </button>
          )}
        </div>
      </div>

      {/* Right Column: Parameter Inspector Panel */}
      <div className="w-full shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-[var(--line)] bg-[var(--surface-raised)] max-h-[88vh] overflow-y-auto workspace-scroll relative">
        {/* Header: Author Profile & Inspection Meta */}
        <div className="sticky top-0 z-20 shrink-0 p-4 sm:p-5 border-b border-[var(--line)] bg-[var(--surface-raised)]/95 backdrop-blur-md">
          {/* Top Row: Author Profile Card + Close / Mod Controls */}
          <div className="flex items-center justify-between gap-3 min-w-0">
            {/* Author Info */}
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href={`/user/${encodeURIComponent(authorUsername)}`}
                className="shrink-0 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-full"
                title={`View @${authorUsername}'s profile`}
              >
                <UserAvatar
                  src={authorAvatarUrl}
                  username={authorUsername}
                  name={authorDisplayName}
                  role={authorRole}
                  size="md"
                  shape="circle"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/user/${encodeURIComponent(authorUsername)}`}
                  className="font-bold text-sm text-[var(--ink)] hover:text-[var(--accent)] transition-colors truncate block leading-snug focus:outline-none focus-visible:underline"
                  title={`@${authorUsername}`}
                >
                  {authorDisplayName}
                </Link>
                <p
                  suppressHydrationWarning
                  className="text-[12px] text-[var(--ink-faint)] font-normal leading-tight mt-0.5 truncate select-none"
                >
                  {publishedDate}
                </p>
              </div>
            </div>

            {/* Standalone Breadcrumb / Modal Close Button / Mod Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {canModerate && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setModMenuOpen((v) => !v)}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[11px] font-bold tracking-wider text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--surface-soft)] transition-colors shadow-sm"
                    title="Moderator Actions & Governance"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Mod Actions</span>
                  </button>

                  {modMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2 py-1 pb-1.5 border-b border-[var(--line)]">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] block">
                          🛡 Mod Controls
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-faint)] truncate block">
                          {asset.key.split("/").pop()}
                        </span>
                      </div>

                      <div className="py-1 space-y-0.5">
                        <button
                          type="button"
                          onClick={() => handleModAction("hide")}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-left text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
                        >
                          {isHidden ? <Eye className="h-3.5 w-3.5 text-[var(--accent)]" /> : <EyeOff className="h-3.5 w-3.5 text-[var(--ink-faint)]" />}
                          <span>{isHidden ? "Unhide from Gallery" : "Hide from Gallery"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleModAction("toggle_nsfw")}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-left text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
                        >
                          <ShieldAlert className={`h-3.5 w-3.5 ${isNsfw ? "text-amber-400" : "text-[var(--ink-faint)]"}`} />
                          <span>{isNsfw ? "Remove NSFW Tag" : "Flag as NSFW / Mature"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleModAction("takedown")}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-left text-[var(--danger)] hover:bg-[var(--danger-surface)] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Takedown / Delete Asset</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mode === "modal" && onClose ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsZoomed(false);
                    setConfirmDelete(false);
                    setModMenuOpen(false);
                    onClose();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors active:scale-95"
                  aria-label="Close dialog"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : mode === "standalone" ? (
                <Link
                  href={backHref}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors active:scale-95"
                  aria-label="Back"
                  title="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>

          {modToast && (
            <div className="mt-2.5 rounded border border-[#0c4a6e]/50 bg-[#082f49]/50 px-2.5 py-1 text-[11px] font-mono text-[#38bdf8] flex items-center gap-1.5 animate-in fade-in duration-150">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span>{modToast}</span>
            </div>
          )}
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 flex-1 pb-6">
          {/* Models & LoRAs Stack */}
          {totalModelsCount > 0 && (
            <div>
              <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase block mb-2">
                MODELS ({totalModelsCount})
              </span>
              <div className="space-y-1.5">
                {/* Primary / Checkpoint Base Model */}
                {hasBaseModel && (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-xs font-mono group hover:border-[var(--line-strong)] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <Box className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                      {modelUrl ? (
                        <a
                          href={modelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate font-medium text-[var(--ink)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-1.5"
                          title={`View ${baseModelTitle} in gallery`}
                        >
                          <span className="truncate">{baseModelTitle}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-70 transition-opacity" />
                        </a>
                      ) : (
                        <span className="truncate font-medium text-[var(--ink)]" title={baseModelTitle || undefined}>
                          {baseModelTitle}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {baseModelVersion && (
                        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-soft)] border border-[var(--line)]">
                          {baseModelVersion}
                        </span>
                      )}
                      <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] border border-[var(--accent)]/20">
                        Checkpoint
                      </span>
                    </div>
                  </div>
                )}

                {/* Attached LoRAs */}
                {activeLoras.map((item, idx) => {
                  const matched = findMatchingModel(
                    {
                      modelId: (item as any).model_id || (item as any).modelId,
                      fileId: (item as any).file_id || (item as any).fileId,
                      filename: item.lora,
                      title: (item as any).title,
                    },
                    effectiveModelOptions
                  );

                  const displayTitle = resolveLoraDisplayName(item, effectiveModelOptions);

                  const loraUrl = resolveModelGalleryUrl(
                    {
                      modelId: (item as any).model_id || (item as any).modelId || matched?.model_id,
                      fileId: (item as any).file_id || (item as any).fileId || matched?.file_id,
                      filename: item.lora,
                      title: matched?.title || (item as any).title || displayTitle,
                    },
                    effectiveModelOptions
                  );

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-xs font-mono group hover:border-[var(--line-strong)] transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className="h-3.5 w-3.5 text-[var(--ink-soft)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
                        {loraUrl ? (
                          <a
                            href={loraUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-[var(--ink)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-1.5"
                            title={`View ${displayTitle} in gallery`}
                          >
                            <span className="truncate">{displayTitle}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-70 transition-opacity" />
                          </a>
                        ) : (
                          <span className="truncate text-[var(--ink)]" title={displayTitle}>
                            {displayTitle}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {matched?.version_name && (
                          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-soft)] border border-[var(--line)]">
                            {matched.version_name}
                          </span>
                        )}
                        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-faint)] border border-[var(--line)]">
                          LoRA
                        </span>
                        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] border border-[var(--line)]">
                          {item.strength}x
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags Deck (WD14 Interrogation & Curation) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-[var(--accent)]" />
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                  TAGS ({tags.length})
                </span>
                {tagToast && (
                  <span className="font-mono text-[9px] text-[var(--accent)] animate-pulse">
                    {tagToast}
                  </span>
                )}
              </div>
            </div>

            {tagError && (
              <p className="mb-2 text-[10px] font-mono text-[var(--danger)]" role="alert">
                {tagError}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto workspace-scroll rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="group inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink)] hover:border-[var(--line-strong)] transition"
                >
                  <a
                    href={`/assets?tags=${encodeURIComponent(tag)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--accent)] transition"
                    title={`Browse assets with #${tag}`}
                  >
                    <span className="text-[var(--accent)]">#</span>
                    <span>{tag}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    title="Remove tag"
                    className="opacity-0 group-hover:opacity-100 text-[var(--ink-faint)] hover:text-[var(--danger)] transition px-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}

              {isAddingTag ? (
                <div className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={newTagDraft}
                    onChange={(e) => setNewTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTagSubmit();
                      if (e.key === "Escape") setIsAddingTag(false);
                    }}
                    onBlur={handleAddTagSubmit}
                    autoFocus
                    placeholder="tag name…"
                    className="h-5 w-24 rounded border border-[var(--accent)] bg-[var(--surface-raised)] px-1.5 text-[10px] font-mono text-[var(--ink)] outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-[var(--line)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition"
                  title="Add tag"
                >
                  <Plus className="h-2.5 w-2.5" />
                  <span>tag</span>
                </button>
              )}
            </div>
          </div>

          {/* Prompt Section */}
          {meta?.prompt && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                  PROMPT
                </span>
                <div className="flex items-center gap-2.5">
                  {isPromptOverflowing && (
                    <button
                      type="button"
                      onClick={() => setIsPromptExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                      title={isPromptExpanded ? "Collapse prompt" : "Expand full prompt"}
                    >
                      {isPromptExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          <span>Collapse</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          <span>Expand</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => copyText(meta.prompt ?? "", "positive-prompt")}
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                  >
                    {copiedKey === "positive-prompt" ? (
                      <>
                        <Check className="h-3 w-3 text-[var(--accent)]" />
                        <span className="text-[var(--accent)]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div
                ref={promptTextRef}
                className={`rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed text-[var(--ink)] select-text break-words transition-[max-height] duration-200 ${isPromptExpanded
                    ? "max-h-none"
                    : "max-h-[130px] overflow-y-auto workspace-scroll"
                  }`}
              >
                {meta.prompt}
              </div>
            </div>
          )}

          {/* Negative Prompt Section */}
          {meta?.negative_prompt && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                  NEGATIVE PROMPT
                </span>
                <div className="flex items-center gap-2.5">
                  {isNegOverflowing && (
                    <button
                      type="button"
                      onClick={() => setIsNegExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                      title={isNegExpanded ? "Collapse negative prompt" : "Expand full negative prompt"}
                    >
                      {isNegExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          <span>Collapse</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          <span>Expand</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => copyText(meta.negative_prompt ?? "", "negative-prompt")}
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                  >
                    {copiedKey === "negative-prompt" ? (
                      <>
                        <Check className="h-3 w-3 text-[var(--accent)]" />
                        <span className="text-[var(--accent)]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div
                ref={negTextRef}
                className={`rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed text-[var(--ink-soft)] select-text break-words transition-[max-height] duration-200 ${isNegExpanded
                    ? "max-h-none"
                    : "max-h-[130px] overflow-y-auto workspace-scroll"
                  }`}
              >
                {meta.negative_prompt}
              </div>
            </div>
          )}

          {/* Inference Parameters Matrix */}
          <div>
            <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase block mb-2">
              INFERENCE SPECS
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 col-span-2">
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                  PIPELINE
                </span>
                <div className="mt-0.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {isDetailer ? (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                          Base + Face Detailer (2-Pass)
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-xs font-semibold text-[var(--ink)]">
                        Standard Single-Pass
                      </span>
                    )}
                  </div>
                  {isDetailer && detailerBeforeUrl && !isVideo && (
                    <button
                      type="button"
                      onClick={() => setShowComparison((s) => !s)}
                      className="font-mono text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
                      title="Toggle comparison slider"
                    >
                      <span>{showComparison ? "View Detailed" : "Compare Before/After"}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                  SEED
                </span>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--ink)] truncate">
                    {meta?.seed !== undefined && meta.seed !== null ? meta.seed : "Random"}
                  </span>
                  {meta?.seed !== undefined && meta.seed !== null && (
                    <button
                      type="button"
                      onClick={() => copyText(String(meta.seed), "seed")}
                      className="text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors ml-1"
                      title="Copy seed"
                    >
                      {copiedKey === "seed" ? (
                        <Check className="h-3 w-3 text-[var(--accent)]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                  RESOLUTION
                </span>
                <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block truncate">
                  {meta?.width && meta?.height
                    ? `${meta.width} × ${meta.height}`
                    : meta?.format_name ?? "Standard"}
                </span>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                  STEPS
                </span>
                <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block truncate">
                  {meta?.steps ?? "25"}
                </span>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                  CFG SCALE
                </span>
                <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block truncate">
                  {meta?.cfg !== undefined && meta.cfg !== null ? meta.cfg : "7.0"}
                </span>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                  SAMPLER
                </span>
                <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block truncate">
                  {meta?.sampler_name ?? "euler"}
                </span>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                  SCHEDULER
                </span>
                <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block truncate">
                  {meta?.scheduler ?? "normal"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action CTAs Footer */}
        <div className="sticky bottom-0 z-20 mt-auto shrink-0 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md p-4 sm:p-5 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
          {/* Dominant Primary Remix CTA */}
          <button
            type="button"
            onClick={handleRemixClick}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(213,240,111,0.25)]"
          >
            <Zap className="h-4 w-4 fill-current stroke-current" />
            <span>REMIX</span>
          </button>
        </div>
      </div>
    </div>
  );
}
