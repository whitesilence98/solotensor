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
import AssetCard from "@/components/AssetCard";

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
          <Link
            href={`/?model_id=${encodeURIComponent(modelId)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 font-mono text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Generate with Model</span>
          </Link>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="relative aspect-[3/4] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] overflow-hidden"
            >
              <div
                className="absolute inset-0 shimmer opacity-60"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            </div>
          ))}
        </div>
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

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-8 text-center max-w-lg mx-auto my-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--accent)] mb-4 shadow-sm">
            <Sparkles className="h-7 w-7" />
          </div>
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--ink)]">
            NO OUTPUTS RECORDED YET
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-[var(--ink-faint)]">
            Be the first creator to synthesize an image using {modelTitle || "this model"}. Generations will automatically be cataloged here.
          </p>
          <div className="mt-5">
            <Link
              href={`/?model_id=${encodeURIComponent(modelId)}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all shadow-[0_0_16px_rgba(213,240,111,0.2)]"
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              <span>Generate First Output</span>
            </Link>
          </div>
        </div>
      )}

      {/* Grid of Generation Cards */}
      {!loading && items.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {items.map((item, index) => (
              <AssetCard
                key={item.id || galleryItems[index].key}
                asset={galleryItems[index]}
                aspectRatio="3/4"
                remixModelId={modelId}
                onOpen={() => openAsset(galleryItems[index])}
              />
            ))}
          </div>

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
