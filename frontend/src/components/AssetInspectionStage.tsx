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
  Maximize2,
  Minimize2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { formatBytes } from "@/components/AssetCard";
import {
  assetTypeOf,
  resolveMediaUrl,
  type GalleryItem,
  type GalleryMetadata,
  type InstalledGalleryModel,
} from "@/lib/api";
import { resolveModelGalleryUrl } from "@/lib/models";

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

  const meta = asset.metadata;
  const mediaUrl = resolveMediaUrl(asset.url) || asset.url;
  const rawMediaUrl = asset.url;

  const effectiveItems = items.length > 0 ? items : [asset];
  const activeIndex =
    currentIndex !== undefined
      ? currentIndex
      : effectiveItems.findIndex((item) => item.key === asset.key);
  const resolvedIndex = Math.max(0, activeIndex);
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
      ? "relative grid max-h-[85vh] min-h-0 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[minmax(0,1fr)_24.5rem] shadow-2xl"
      : "relative grid min-h-[580px] overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[minmax(0,1fr)_24.5rem] shadow-2xl";

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
        className={`relative flex flex-col items-center justify-center overflow-hidden bg-[var(--surface-sunken)] p-4 sm:p-6 select-none ${
          mode === "modal" ? "min-h-[380px] lg:min-h-[580px]" : "min-h-[460px] lg:min-h-[640px]"
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
          className={`relative z-10 flex h-full w-full items-center justify-center ${
            isZoomed ? "overflow-auto cursor-grab active:cursor-grabbing p-4" : "p-2"
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
              className={`rounded-xl drop-shadow-2xl transition-[max-height,transform] duration-200 ${
                isZoomed
                  ? "max-h-none max-w-none object-none shadow-2xl cursor-zoom-out"
                  : "max-h-[78vh] max-w-full object-contain cursor-zoom-in"
              }`}
            />
          )}
        </div>
      </div>

      {/* Right Column: Deep Recipe & Parameter Inspector */}
      <div className="workspace-scroll flex w-full flex-col justify-between border-t border-[var(--line)] bg-[var(--surface)] p-5 lg:w-[24.5rem] lg:border-l lg:border-t-0 overflow-y-auto max-h-[85vh]">
        <div className="space-y-4">
          {/* Header & Model Strip */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
            {modelUrl ? (
              <a
                href={modelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex items-center gap-2 group cursor-pointer hover:opacity-85 transition"
                title={`View ${meta?.model_title ?? "model"} in gallery`}
              >
                <span className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)]/30 shrink-0">
                  {meta?.model_category ? meta.model_category.toUpperCase() : "SDXL"}
                </span>
                <h3
                  className="text-xs font-bold text-[var(--ink)] truncate group-hover:text-[var(--accent)] transition"
                  title={meta?.model_title ?? "Standard Model"}
                >
                  {meta?.model_title ?? "Standard Model"}
                </h3>
              </a>
            ) : (
              <div className="min-w-0 flex items-center gap-2">
                <span className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)]/30 shrink-0">
                  {meta?.model_category ? meta.model_category.toUpperCase() : "SDXL"}
                </span>
                <h3
                  className="text-xs font-bold text-[var(--ink)] truncate"
                  title={meta?.model_title ?? "Standard Model"}
                >
                  {meta?.model_title ?? "Standard Model"}
                </h3>
              </div>
            )}

            {/* Standalone Breadcrumb / Modal Close Button */}
            {mode === "modal" && onClose ? (
              <button
                type="button"
                onClick={() => {
                  setIsZoomed(false);
                  setConfirmDelete(false);
                  onClose();
                }}
                className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[var(--surface-raised)] text-[var(--ink-soft)] hover:border-white/20 hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition shrink-0 active:scale-95"
                aria-label="Close dialog"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            ) : mode === "standalone" ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--accent)] transition shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{backLabel}</span>
              </Link>
            ) : null}
          </div>

          {/* Applied LoRA Stack if present */}
          {Array.isArray(meta?.loras) && meta.loras.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {meta.loras.map((lora, idx) => {
                const loraUrl = resolveModelGalleryUrl(
                  {
                    modelId: (lora as any).model_id || (lora as any).modelId,
                    fileId: (lora as any).file_id || (lora as any).fileId,
                    filename: lora.lora,
                    title: lora.lora,
                  },
                  modelOptions
                );

                const displayTitle = (() => {
                  const matched = modelOptions.find(
                    (m) =>
                      m.filename === lora.lora ||
                      m.title === lora.lora ||
                      lora.lora.includes(m.filename) ||
                      m.filename.includes(lora.lora)
                  );
                  if (matched?.title) return matched.title;
                  const base = lora.lora.split(/[/\\]/).pop() || lora.lora;
                  return base.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "");
                })();

                if (loraUrl) {
                  return (
                    <a
                      key={idx}
                      href={loraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`View ${displayTitle} in gallery`}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink)] cursor-pointer hover:border-[var(--line-strong)] hover:text-[var(--accent)] transition"
                    >
                      <span className="text-[var(--accent)]">#</span>
                      <span className="truncate max-w-[140px]">{displayTitle}</span>
                      <span className="text-[var(--ink-faint)] font-bold">({lora.strength})</span>
                    </a>
                  );
                }

                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink)]"
                  >
                    <span className="text-[var(--accent)]">#</span>
                    <span className="truncate max-w-[140px]">{displayTitle}</span>
                    <span className="text-[var(--ink-faint)] font-bold">({lora.strength})</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Positive Prompt */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Positive Prompt
              </span>
              <button
                type="button"
                onClick={() => copyText(meta?.prompt ?? "", "positive-prompt")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
              >
                {copiedKey === "positive-prompt" ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <div className="workspace-scroll max-h-32 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-xs leading-relaxed text-[var(--ink)] select-text">
              {meta?.prompt ? (
                meta.prompt
              ) : (
                <span className="text-[var(--ink-faint)] italic">No prompt recorded</span>
              )}
            </div>
          </div>

          {/* Negative Prompt */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Negative Prompt
              </span>
              {meta?.negative_prompt && (
                <button
                  type="button"
                  onClick={() => copyText(meta.negative_prompt ?? "", "negative-prompt")}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
                >
                  {copiedKey === "negative-prompt" ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="workspace-scroll max-h-20 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-xs leading-relaxed text-[var(--ink)] select-text">
              {meta?.negative_prompt ? (
                meta.negative_prompt
              ) : (
                <span className="text-[var(--ink-faint)] italic">None</span>
              )}
            </div>
          </div>

          {/* 2x3 Specs Matrix */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            {/* Seed */}
            <div
              onClick={() =>
                meta?.seed !== undefined &&
                meta.seed !== null &&
                copyText(String(meta.seed), "seed")
              }
              className="group cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)]"
              title="Click to copy seed"
            >
              <div className="flex items-center justify-between">
                <span className="block text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                  Seed
                </span>
                {copiedKey === "seed" ? (
                  <Check className="h-3 w-3 text-[var(--accent)]" />
                ) : (
                  <Copy className="h-3 w-3 text-[var(--ink-faint)] opacity-0 transition group-hover:opacity-100" />
                )}
              </div>
              <span className="mt-1 block truncate font-bold text-[var(--ink)]">
                {meta?.seed ?? "N/A"}
              </span>
            </div>

            {/* Steps */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
              <span className="block text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Steps
              </span>
              <span className="mt-1 block font-bold text-[var(--ink)]">
                {meta?.steps ?? "25"}
              </span>
            </div>

            {/* CFG */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
              <span className="block text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                CFG Scale
              </span>
              <span className="mt-1 block font-bold text-[var(--ink)]">{meta?.cfg ?? "7.0"}</span>
            </div>

            {/* Dimensions */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
              <span className="block text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Dimensions
              </span>
              <span className="mt-1 block font-bold text-[var(--ink)] truncate">
                {meta?.width && meta?.height
                  ? `${meta.width} × ${meta.height}`
                  : meta?.format_name ?? "1024 × 1024"}
              </span>
            </div>

            {/* Denoise or Duration */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
              <span className="block text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                {meta?.denoise !== undefined ? "Denoise" : "Duration"}
              </span>
              <span className="mt-1 block font-bold text-[var(--ink)]">
                {meta?.denoise !== undefined
                  ? meta.denoise
                  : meta?.elapsed_ms
                  ? `~${(meta.elapsed_ms / 1000).toFixed(1)}s`
                  : "1.0"}
              </span>
            </div>

            {/* Size & Format */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
              <span className="block text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Size / Format
              </span>
              <span className="mt-1 block font-bold text-[var(--ink)] truncate">
                {asset.size ? formatBytes(asset.size) : "PNG"} · {meta?.format_name ?? "1:1"}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="mt-4 space-y-2 pt-3.5 border-t border-[var(--line)]">
          {/* Dominant Primary Remix CTA */}
          <button
            type="button"
            onClick={handleRemixClick}
            className="workspace-action-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold text-[var(--accent-ink)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition shadow-lg active:scale-[0.99]"
          >
            <Sparkles className="h-4 w-4" />
            <span>Remix</span>
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
                className="workspace-action-secondary flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-raised)] transition"
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
              className="workspace-action-secondary flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-raised)] transition"
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
              download
              className="workspace-action-secondary flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-raised)] transition text-center"
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
                className={`flex h-9 items-center justify-center rounded-xl border transition px-2.5 text-xs font-medium ${
                  confirmDelete
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
