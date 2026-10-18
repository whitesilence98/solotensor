"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
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
import {
  api,
  assetTypeOf,
  resolveMediaUrl,
  type GalleryItem,
  type GalleryMetadata,
  type InstalledGalleryModel,
} from "@/lib/api";
import { resolveModelGalleryUrl } from "@/lib/models";
import { useAuth } from "@/lib/auth-context";

export const SAVED_INPUTS_KEY = "solotensor:last-successful-inputs:v4";

/**
 * Stores remix parameters into localStorage so navigating to / hydrates Studio automatically.
 */
export function saveRemixToStorage(meta: GalleryMetadata, modelOptions?: InstalledGalleryModel[]) {
  if (typeof window === "undefined" || !meta) return;
  try {
    const matchedModel = modelOptions?.find(
      (m) =>
        (meta.model_id && m.model_id === meta.model_id) ||
        m.title === meta.model_title ||
        m.filename === meta.model_filename
    );

    const activeLoras = Array.isArray(meta.loras)
      ? meta.loras.map((l, index) => {
        const matchedLora = modelOptions?.find(
          (m) =>
            (l.model_id && m.model_id === l.model_id) ||
            m.filename === l.lora ||
            m.title === l.lora ||
            l.lora.includes(m.filename) ||
            m.filename.includes(l.lora)
        );
        return {
          id: `remix-${index}-${l.lora}`,
          title: matchedLora?.title || l.lora,
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
  backLabel?: string;
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
  backLabel = "Back to Studio",
}: AssetInspectionStageProps) {
  const router = useRouter();
  const [isZoomed, setIsZoomed] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Tagging State
  const [tags, setTags] = useState<string[]>(Array.isArray(asset.metadata?.tags) ? asset.metadata.tags : []);
  const [isTagging, setIsTagging] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [newTagDraft, setNewTagDraft] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagToast, setTagToast] = useState<string | null>(null);

  // Moderation Governance State
  const { isMod, isAdmin, hasPermission } = useAuth();
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

  const handleAutoTag = async () => {
    if (isTagging) return;
    setIsTagging(true);
    setTagError(null);
    try {
      const updated = await api.autoTagAsset(asset.key);
      const newTags = Array.isArray(updated.metadata?.tags) ? updated.metadata.tags : [];
      setTags(newTags);
      if (asset.metadata) {
        asset.metadata.tags = newTags;
      }
      setTagToast("WD14 tags detected!");
      setTimeout(() => setTagToast(null), 2500);
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "Auto-tagging failed");
    } finally {
      setIsTagging(false);
    }
  };

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
  const rawMediaUrl = asset.url;

  const effectiveItems = items.length > 0 ? items : [asset];
  const activeIndex =
    currentIndex !== undefined && currentIndex >= 0
      ? currentIndex
      : effectiveItems.findIndex(
          (item) => item.key === asset.key || (item.url && item.url === asset.url)
        );
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
  const currentNum = String(resolvedIndex + 1).padStart(2, "0");
  const totalNum = String(effectiveItems.length).padStart(2, "0");
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
      saveRemixToStorage(meta, modelOptions);
      router.push("/");
    }
  };

  const modelUrl = resolveModelGalleryUrl(
    {
      modelId: meta?.model_id,
      title: meta?.model_title,
      filename: meta?.model_filename,
      fileId: meta?.file_id,
    },
    modelOptions
  );

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

        {/* Top Floating Output Counter Pill */}
        <div className="absolute top-3.5 left-3.5 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md shadow-md">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="font-mono text-[10px] tracking-widest text-[var(--accent)] uppercase font-semibold">
            {currentNum} / {totalNum} OUTPUTS
          </span>
        </div>

        {/* Top Floating Stage Controls */}
        <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-1.5">
          {!isVideo && (
            <button
              type="button"
              onClick={() => setIsZoomed((z) => !z)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition hover:border-white/30 hover:bg-black/90 hover:text-white"
              title={isZoomed ? "Fit to view (Esc)" : "100% 1:1 Pixel Scale"}
              aria-label={isZoomed ? "Fit to view" : "100% Pixel Scale"}
            >
              {isZoomed ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <a
            href={rawMediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition hover:border-white/30 hover:bg-black/90 hover:text-white"
            title="Open uncompressed raw file in new tab"
            aria-label="Open raw file"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

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
          className={`relative z-10 flex h-full w-full items-center justify-center ${isZoomed ? "overflow-auto cursor-grab active:cursor-grabbing p-4" : "p-2"
            }`}
        >
          {isVideo ? (
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
      </div>

      {/* Right Column: Parameter Inspector Panel */}
      <div className="w-full shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-[var(--line)] bg-[var(--surface-raised)] max-h-[88vh] overflow-y-auto workspace-scroll">
        {/* Header */}
        <div className="relative p-5 border-b border-[var(--line)] pr-12">
          <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase block mb-1">
            ASSET RECORD // INSPECTOR
          </span>
          <h2
            className="font-mono text-sm font-bold text-[var(--ink)] truncate"
            title={meta?.source_filename || asset.key.split("/").pop() || "Untitled Asset"}
          >
            {meta?.source_filename || asset.key.split("/").pop() || "Untitled Asset"}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--ink-faint)] font-mono">
            <span>
              {meta?.created_at
                ? new Date(meta.created_at).toLocaleDateString()
                : asset.last_modified
                  ? new Date(asset.last_modified).toLocaleDateString()
                  : "Recent"}
            </span>
            <span>•</span>
            <span className="uppercase text-[var(--ink-soft)]">{meta?.format_name || "PNG"}</span>
            <span>•</span>
            <span>
              {meta?.elapsed_ms
                ? `${(meta.elapsed_ms / 1000).toFixed(1)}s`
                : asset.size
                  ? formatBytes(asset.size)
                  : "Standard"}
            </span>
            {meta?.model_title && (
              <>
                <span>•</span>
                {modelUrl ? (
                  <a
                    href={modelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ink)] hover:text-[var(--accent)] transition truncate max-w-[130px] inline-block align-bottom"
                    title={`View ${meta.model_title} in gallery`}
                  >
                    {meta.model_title}
                  </a>
                ) : (
                  <span className="text-[var(--ink)] truncate max-w-[130px] inline-block align-bottom">
                    {meta.model_title}
                  </span>
                )}
              </>
            )}
          </div>

          {modToast && (
            <div className="mb-2 rounded border border-[#0c4a6e]/50 bg-[#082f49]/50 px-2.5 py-1 text-[11px] font-mono text-[#38bdf8] flex items-center gap-1.5 animate-in fade-in duration-150">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span>{modToast}</span>
            </div>
          )}

          {/* Standalone Breadcrumb / Modal Close Button / Mod Actions */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {canModerate && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModMenuOpen((v) => !v)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-[#0c4a6e] bg-[#082f49] px-2.5 font-mono text-[11px] font-bold tracking-wider text-[#38bdf8] hover:bg-[#0c4a6e]/60 transition-colors shadow-sm"
                  title="Moderator Actions & Governance"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>Mod Actions</span>
                </button>

                {modMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-[#0c4a6e]/60 bg-[var(--surface-raised)] p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 pb-1.5 border-b border-[var(--line)]">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#38bdf8] block">
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-mono text-[var(--ink-soft)] hover:text-[var(--accent)] hover:border-[var(--line-strong)] transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{backLabel}</span>
              </Link>
            ) : null}
          </div>
        </div>

        {/* Body Content */}
        {meta?.prompt &&
          <div className="p-5 space-y-4 flex-1">
            {/* Prompt Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                  PROMPT
                </span>
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
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed text-[var(--ink)] select-text break-words">
                {meta.prompt}
              </div>
            </div>

            {/* Negative Prompt Section */}
            {meta?.negative_prompt && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                    NEGATIVE PROMPT
                  </span>
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
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed text-[var(--ink-soft)] select-text break-words max-h-24 overflow-y-auto workspace-scroll">
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
              </div>
            </div>

            {/* LoRA Stack */}
            {Array.isArray(meta?.loras) && meta.loras.length > 0 && (
              <div>
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase block mb-2">
                  ATTACHED LORAS ({meta.loras.length})
                </span>
                <div className="space-y-1.5">
                  {meta.loras.map((item, idx) => {
                    const loraUrl = resolveModelGalleryUrl(
                      {
                        modelId: (item as any).model_id || (item as any).modelId,
                        fileId: (item as any).file_id || (item as any).fileId,
                        filename: item.lora,
                        title: item.lora,
                      },
                      modelOptions
                    );

                    const displayTitle = (() => {
                      const matched = modelOptions.find(
                        (m) =>
                          m.filename === item.lora ||
                          m.title === item.lora ||
                          item.lora.includes(m.filename) ||
                          m.filename.includes(item.lora)
                      );
                      if (matched?.title) return matched.title;
                      const base = item.lora.split(/[/\\]/).pop() || item.lora;
                      return base.replace(/\.(safetensors|sft|ckpt|pt|pth|bin|gguf)$/i, "");
                    })();

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Layers className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                          {loraUrl ? (
                            <a
                              href={loraUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-[var(--ink)] hover:text-[var(--accent)] transition"
                              title={`View ${displayTitle} in gallery`}
                            >
                              {displayTitle}
                            </a>
                          ) : (
                            <span className="truncate text-[var(--ink)]">{displayTitle}</span>
                          )}
                        </div>
                        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] border border-[var(--line)] shrink-0 ml-2">
                          {item.strength}x
                        </span>
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
                <button
                  type="button"
                  onClick={handleAutoTag}
                  disabled={isTagging}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)] hover:border-[var(--line-strong)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition disabled:opacity-50"
                  title="Run WD14 Tagger workflow to auto-detect tags"
                >
                  {isTagging ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span>{isTagging ? "Detecting…" : "Auto-tag (WD14)"}</span>
                </button>
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
          </div>
        }
        {/* Action CTAs Footer */}
        <div className="p-5 border-t border-[var(--line)] bg-[var(--surface)] space-y-2.5 mt-auto">
          {/* Dominant Primary Remix CTA */}
          <button
            type="button"
            onClick={handleRemixClick}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(213,240,111,0.25)]"
          >
            <Zap className="h-4 w-4 fill-current stroke-current" />
            <span>REMIX</span>
          </button>

          {/* Secondary Action Row */}
          <div className="flex items-center gap-2">
            {/* Use as Reference button */}
            {onSetReferenceImage && (
              <button
                type="button"
                onClick={() => {
                  onSetReferenceImage(mediaUrl);
                  onClose?.();
                }}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] hover:border-[var(--line-strong)] transition-colors"
                title="Set as reference image"
              >
                <Layers className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Reference</span>
              </button>
            )}

            {/* Copy Prompt */}
            <button
              type="button"
              onClick={() => copyText(meta?.prompt ?? "", "footer-prompt")}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] hover:border-[var(--line-strong)] transition-colors"
              title="Copy prompt"
            >
              {copiedKey === "footer-prompt" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Prompt</span>
                </>
              )}
            </button>

            {/* Download Output */}
            <a
              href={mediaUrl}
              download={meta?.source_filename || asset.key.split("/").pop() || "output.png"}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] hover:border-[var(--line-strong)] transition-colors text-center"
              title="Download image"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Save</span>
            </a>

            {/* Delete Output with Safe Inline Confirm */}
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
                className={`flex h-9 items-center justify-center rounded-lg border px-2.5 font-mono text-xs font-semibold transition-colors shrink-0 ${confirmDelete
                  ? "border-[var(--danger)] bg-[var(--danger)] text-white shadow-md animate-pulse"
                  : "border-[var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
                  }`}
                title={confirmDelete ? "Click again to confirm delete" : "Delete output"}
                aria-label="Delete output"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDelete && <span className="ml-1 font-bold">Confirm</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
