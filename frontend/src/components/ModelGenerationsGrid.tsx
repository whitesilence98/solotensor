"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { api, type GalleryItem, type GenerationRecord } from "@/lib/api";
import WorkspaceModal from "@/components/WorkspaceModal";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import AssetCardList from "@/components/AssetCardList";

export interface ModelGenerationsGridProps {
  modelId: string;
  modelTitle?: string;
}

export function generationRecordToGalleryItem(record: GenerationRecord): GalleryItem {
  return {
    key: record.key || record.url || record.id,
    url: record.url,
    size: 0,
    last_modified: record.created_at,
    metadata: {
      prompt_id: record.prompt_id,
      prompt: record.prompt || "",
      negative_prompt: record.negative_prompt || undefined,
      seed: record.seed,
      steps: record.steps,
      cfg: record.cfg,
      denoise: record.denoise,
      width: record.width,
      height: record.height,
      format_name: (record.format_name as any) || "1:1",
      model_id: record.model_id || undefined,
      version_id: record.version_id || undefined,
      file_id: record.file_id || undefined,
      model_title: record.model_title || undefined,
      created_at: record.created_at,
      elapsed_ms: record.elapsed_ms || 0,
      source_filename: record.filename,
      loras: (record.loras || []).map((l) => ({
        lora: l.lora_name,
        on: true,
        model_id: l.lora_model_id || undefined,
        version_id: l.lora_version_id || undefined,
        strength: l.strength,
      })),
      tags: Array.isArray((record.metadata as any)?.tags) ? (record.metadata as any).tags : [],
    },
  };
}

export default function ModelGenerationsGrid({
  modelId,
  modelTitle,
}: ModelGenerationsGridProps) {
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<GalleryItem | null>(null);

  const galleryItems = useMemo(() => items.map(generationRecordToGalleryItem), [items]);

  const openAsset = useCallback((asset: GalleryItem) => {
    setSelectedAsset(asset);
    if (typeof window !== "undefined") {
      const encodedKey = asset.key.split("/").map(encodeURIComponent).join("/");
      window.history.pushState({ assetKey: asset.key }, "", `/assets/${encodedKey}`);
    }
  }, []);

  const selectAssetInCarousel = useCallback((asset: GalleryItem) => {
    setSelectedAsset(asset);
    if (typeof window !== "undefined") {
      const encodedKey = asset.key.split("/").map(encodeURIComponent).join("/");
      window.history.replaceState({ assetKey: asset.key }, "", `/assets/${encodedKey}`);
    }
  }, []);

  const closeAsset = useCallback(() => {
    setSelectedAsset(null);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `/models/${encodeURIComponent(modelId)}`);
    }
  }, [modelId]);

  // Listen for browser Back button to dismiss modal smoothly
  useEffect(() => {
    const onPopState = () => {
      if (selectedAsset) {
        setSelectedAsset(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedAsset]);

  const fetchGenerations = async (pageNum: number, isInitial = false) => {
    if (isInitial) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const data = await api.getModelGenerations(modelId, pageNum, 20);
      if (pageNum === 1) {
        setItems(data.items || []);
      } else {
        setItems((prev) => [...prev, ...(data.items || [])]);
      }
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load generations for this model",
      );
    } finally {
      if (isInitial) setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (modelId) {
      void fetchGenerations(1, true);
    }
  }, [modelId]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      void fetchGenerations(page + 1, false);
    }
  };

  return (
    <section className="mt-10 pt-8 border-t border-[var(--line)]">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase block mb-1">
            CREATIONS // GALLERY
          </span>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold tracking-tight text-[var(--ink)]">
              Generated with this model
            </h2>
            {total > 0 && (
              <span className="rounded border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent)]">
                {total}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--ink-faint)]">
            Explore outputs, prompts, and inference recipes created with {modelTitle || "this model"}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {total > 0 && (
            <Link
              href={`/?model_id=${encodeURIComponent(modelId)}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 font-mono text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Generate with Model</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => void fetchGenerations(1, true)}
            disabled={loading}
            aria-label="Refresh creations"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <AssetCardList loading skeletonCount={10} aspectRatio="natural" items={[]} />
      )}

      {/* Error Banner */}
      {!loading && error && (
        <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-5 text-center">
          <p className="font-mono text-xs text-[var(--danger)]">{error}</p>
          <button
            type="button"
            onClick={() => void fetchGenerations(1, true)}
            className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--surface-raised)] px-3 py-1 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Studio Empty State (Full-Width Atmospheric Stage) */}
      {!loading && !error && items.length === 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)]/60 px-6 py-12 sm:px-12 sm:py-16 text-center my-2">
          {/* Subtle Atmospheric Studio Backdrop */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(213,240,111,0.05),transparent_70%)]" />

          {/* Technical Corner Crosshairs */}
          <div className="pointer-events-none absolute left-3.5 top-3 font-mono text-xs text-[var(--line-strong)] select-none">
            +
          </div>
          <div className="pointer-events-none absolute right-3.5 top-3 font-mono text-xs text-[var(--line-strong)] select-none">
            +
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3.5 font-mono text-xs text-[var(--line-strong)] select-none">
            +
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3.5 font-mono text-xs text-[var(--line-strong)] select-none">
            +
          </div>

          <div className="relative z-10 mx-auto max-w-xl">
            {/* Visual Wireframe Preview Dock */}
            <div className="mb-7 flex items-center justify-center gap-3 opacity-80">
              <div className="hidden sm:flex h-20 w-14 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)]/40 text-[var(--ink-faint)]">
                <span className="font-mono text-[9px] text-[var(--ink-faint)]">9:16</span>
              </div>
              <div className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--accent)]/50 bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm">
                <Sparkles className="h-6 w-6 stroke-[1.5]" />
                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[var(--accent)]">
                  Canvas
                </span>
              </div>
              <div className="hidden sm:flex h-20 w-28 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)]/40 text-[var(--ink-faint)]">
                <span className="font-mono text-[9px] text-[var(--ink-faint)]">16:9</span>
              </div>
            </div>

            {/* Status Pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 font-mono text-[11px] text-[var(--ink-soft)] mb-3 shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>STUDIO CANVAS READY</span>
            </div>

            {/* Headline */}
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink)]">
              Be the first to synthesize with this model
            </h3>

            {/* Explanatory Body */}
            <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-[var(--ink-faint)] max-w-md mx-auto">
              Run inference with <span className="font-medium text-[var(--ink-soft)]">{modelTitle || "this model"}</span> in Solo Studio. Every generation is automatically cataloged here with full prompt recipes, seeds, and sampling telemetry.
            </p>

            {/* Feature Highlights Row */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 font-mono text-[11px] text-[var(--ink-soft)]">
              <div className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-raised)]/80 px-2.5 py-1">
                <Zap className="h-3 w-3 text-[var(--accent)]" />
                <span>Instant Studio Load</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-raised)]/80 px-2.5 py-1">
                <Box className="h-3 w-3 text-[var(--accent)]" />
                <span>Recipe & Seed Logged</span>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="mt-7">
              <Link
                href={`/?model_id=${encodeURIComponent(modelId)}`}
                className="inline-flex h-11 items-center gap-2.5 rounded-xl bg-[var(--accent)] px-6 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all duration-200 hover:bg-[var(--accent-hover)] hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_24px_rgba(213,240,111,0.25)]"
              >
                <Zap className="h-4 w-4 fill-current" />
                <span>Launch Studio with Model</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Grid of Generation Cards */}
      {!loading && items.length > 0 && (
        <>
          <AssetCardList
            items={galleryItems}
            aspectRatio="natural"
            remixModelId={modelId}
            onOpen={(asset) => openAsset(asset as GalleryItem)}
          />

          {/* Load More Button */}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] px-5 font-mono text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                    <span>Loading outputs…</span>
                  </>
                ) : (
                  <>
                    <span>Load more outputs ({items.length} of {total})</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox Inspector Modal */}
      <WorkspaceModal
        open={Boolean(selectedAsset)}
        onClose={closeAsset}
        headless
        size="media"
      >
        {selectedAsset && (
          <AssetInspectionStage
            mode="modal"
            asset={selectedAsset}
            items={galleryItems}
            onSelectAsset={selectAssetInCarousel}
            onClose={closeAsset}
          />
        )}
      </WorkspaceModal>
    </section>
  );
}
