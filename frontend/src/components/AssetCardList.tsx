"use client";

import React, { memo, useMemo } from "react";
import AssetCard from "@/components/AssetCard";
import type { AssetRecord, GalleryItem } from "@/lib/api";

/**
 * Responsive CSS Multi-Column Masonry Classes.
 * - Mobile (<640px): 1 column
 * - Small tablet (640px-1023px): 2 columns
 * - Standard Desktop @ 100% zoom (1024px-1535px): 3 columns
 * - Zoom-out / Wide (1536px-1919px): 4 columns
 * - 2K / Further zoom-out (1920px-2399px): 5 columns
 * - 4K Ultra-wide (2400px+): 6 columns
 * - Clean 14px gap (gap-3.5)
 */
export const MASONRY_COLUMNS_CLASSES =
  "columns-1 sm:columns-2 md:columns-3 lg:columns-3 xl:columns-3 2xl:columns-4 min-[1920px]:columns-5 min-[2400px]:columns-6 gap-3.5";

const SKELETON_ASPECTS = [
  "9 / 16",
  "16 / 10",
  "3 / 4",
  "1 / 1",
  "4 / 5",
  "2 / 3",
  "16 / 9",
  "3 / 4",
];

export interface AssetCardSkeletonProps {
  index?: number;
  aspectRatio?: string;
  className?: string;
}

/**
 * 1:1 Mirroring Skeleton for Masonry Asset Card (Zero-CLS)
 */
export function AssetCardSkeleton({
  index = 0,
  aspectRatio = "natural",
  className = "",
}: AssetCardSkeletonProps) {
  const aspectStyle =
    aspectRatio && aspectRatio !== "natural"
      ? aspectRatio.includes("/")
        ? aspectRatio
        : aspectRatio.replace(":", " / ")
      : SKELETON_ASPECTS[index % SKELETON_ASPECTS.length];

  return (
    <div
      style={{
        aspectRatio: aspectStyle,
        animationDelay: `${(index % 12) * 35}ms`,
      }}
      className={`relative flex w-full flex-col justify-end overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] select-none ${className}`}
    >
      {/* Background base shimmer */}
      <div className="absolute inset-0 shimmer opacity-60" />

      {/* Floating Top Badge Placeholder */}
      <div className="absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between pointer-events-none">
        <div className="h-4.5 w-12 rounded bg-white/10 shimmer backdrop-blur-md" />
        <div className="h-7 w-7 rounded-lg bg-white/10 shimmer backdrop-blur-md" />
      </div>

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 via-50% to-transparent" />

      {/* Bottom Typography Overlay Mirror */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3 space-y-1.5 pointer-events-none">
        <div className="h-3.5 w-3/4 rounded bg-white/20 shimmer" />
        <div className="h-2.5 w-1/2 rounded bg-white/10 shimmer" />
      </div>
    </div>
  );
}

export interface AssetCardListProps {
  /** Array of AssetRecord or GalleryItem objects */
  items: (AssetRecord | GalleryItem)[];
  /** Whether loading state is active */
  loading?: boolean;
  /** Number of skeleton cards to render when loading */
  skeletonCount?: number;
  /** Aspect ratio rule: "natural" (Civitai/Pinterest true masonry) or explicit e.g. "3/4" */
  aspectRatio?: string;
  /** Bookmarked keys set or array */
  savedKeys?: Set<string> | string[];
  /** Card inspection click handler */
  onOpen?: (asset: AssetRecord | GalleryItem, index: number) => void;
  /** Bookmark toggle handler */
  onBookmark?: (asset: AssetRecord | GalleryItem) => void;
  /** Asset deletion handler */
  onDelete?: (key: string) => void;
  /** Whether to show remix button on cards */
  showRemix?: boolean;
  /** Override model ID for remix workflow */
  remixModelId?: string;
  /** Optional custom container className */
  className?: string;
  /** Optional empty state node rendered when items is empty and not loading */
  emptyState?: React.ReactNode;
}

/**
 * Reusable True Masonry Gallery for Asset Cards (Civitai / Pinterest layout).
 * Images retain their natural proportions and pack tightly down columns.
 * Standardizes 3 columns on desktop with automatic responsive expansion when zooming out.
 */
function AssetCardListComponent({
  items,
  loading = false,
  skeletonCount = 12,
  aspectRatio = "natural",
  savedKeys,
  onOpen,
  onBookmark,
  onDelete,
  showRemix = true,
  remixModelId,
  className = "",
  emptyState,
}: AssetCardListProps) {
  const savedSet = useMemo(() => {
    if (!savedKeys) return null;
    return savedKeys instanceof Set ? savedKeys : new Set(savedKeys);
  }, [savedKeys]);

  if (loading) {
    return (
      <div
        className={`${MASONRY_COLUMNS_CLASSES} ${className}`}
        aria-label="Loading assets"
        aria-busy="true"
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="break-inside-avoid mb-3.5 inline-block w-full">
            <AssetCardSkeleton index={i} aspectRatio={aspectRatio} />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <div
      className={`${MASONRY_COLUMNS_CLASSES} animate-in fade-in duration-300 ease-out ${className}`}
    >
      {items.map((item, index) => {
        const itemKey = item.key || ("id" in item ? String((item as any).id) : String(index));
        const isSaved = savedSet ? savedSet.has(itemKey) : undefined;

        return (
          <div key={itemKey} className="break-inside-avoid mb-3.5 inline-block w-full">
            <AssetCard
              asset={item}
              aspectRatio={aspectRatio}
              saved={isSaved}
              onBookmark={onBookmark ? () => onBookmark(item) : undefined}
              onOpen={onOpen ? () => onOpen(item, index) : () => {}}
              onDelete={onDelete ? () => onDelete(itemKey) : undefined}
              showRemix={showRemix}
              remixModelId={remixModelId}
            />
          </div>
        );
      })}
    </div>
  );
}

export const AssetCardList = memo(AssetCardListComponent);
export default AssetCardList;
