"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import AssetCard from "@/components/AssetCard";
import type { AssetRecord, GalleryItem } from "@/lib/api";

export const MASONRY_COLUMNS_CLASSES = "flex items-start gap-3.5";
export const GRID_COLUMNS_CLASSES = MASONRY_COLUMNS_CLASSES;

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

function getMasonryColumns(width: number): number {
  if (width < 600) return 1;
  if (width < 900) return 2;
  if (width < 1400) return 3;
  if (width < 1850) return 4;
  if (width < 2300) return 5;
  return 6;
}

/**
 * True Row-First Masonry Gallery for Asset Cards (Civitai / Pinterest layout).
 * Distributes items round-robin across columns (1 2 3 / 4 5 6 / 7 8 9),
 * while allowing images with varying natural heights to pack tightly down columns
 * with zero vertical gaps.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() => {
    if (typeof window === "undefined") return 3;
    return getMasonryColumns(window.innerWidth);
  });

  useEffect(() => {
    const updateColumns = () => {
      const el = containerRef.current;
      if (el && el.clientWidth > 0) {
        setColumns(getMasonryColumns(el.clientWidth));
      } else if (typeof window !== "undefined") {
        setColumns(getMasonryColumns(window.innerWidth));
      }
    };

    updateColumns();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => {
        updateColumns();
      });
      ro.observe(containerRef.current);
    }

    window.addEventListener("resize", updateColumns, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateColumns);
    };
  }, []);

  const savedSet = useMemo(() => {
    if (!savedKeys) return null;
    return savedKeys instanceof Set ? savedKeys : new Set(savedKeys);
  }, [savedKeys]);

  // Distribute items round-robin across columns so Row 1 is [1, 2, 3], Row 2 is [4, 5, 6]
  const columnBuckets = useMemo(() => {
    const safeCols = Math.max(1, columns);
    const buckets: Array<
      Array<{
        item: AssetRecord | GalleryItem;
        index: number;
        key: string;
      }>
    > = Array.from({ length: safeCols }, () => []);

    items.forEach((item, index) => {
      const key =
        item.key || ("id" in item ? String((item as any).id) : String(index));
      buckets[index % safeCols].push({ item, index, key });
    });

    return buckets;
  }, [items, columns]);

  // Distribute skeletons round-robin during loading state
  const skeletonBuckets = useMemo(() => {
    const safeCols = Math.max(1, columns);
    const buckets: number[][] = Array.from({ length: safeCols }, () => []);
    Array.from({ length: skeletonCount }).forEach((_, i) => {
      buckets[i % safeCols].push(i);
    });
    return buckets;
  }, [skeletonCount, columns]);

  if (loading) {
    return (
      <div
        ref={containerRef}
        className={`flex items-start gap-3.5 ${className}`}
        aria-label="Loading assets"
        aria-busy="true"
      >
        {skeletonBuckets.map((indices, colIdx) => (
          <div key={colIdx} className="flex flex-1 flex-col gap-3.5 min-w-0">
            {indices.map((i) => (
              <AssetCardSkeleton key={i} index={i} aspectRatio={aspectRatio} />
            ))}
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
      ref={containerRef}
      className={`flex items-start gap-3.5 animate-in fade-in duration-300 ease-out ${className}`}
    >
      {columnBuckets.map((bucket, colIdx) => (
        <div key={colIdx} className="flex flex-1 flex-col gap-3.5 min-w-0">
          {bucket.map(({ item, index, key }) => {
            const isSaved = savedSet ? savedSet.has(key) : undefined;

            return (
              <AssetCard
                key={key}
                asset={item}
                aspectRatio={aspectRatio}
                saved={isSaved}
                onBookmark={onBookmark ? () => onBookmark(item) : undefined}
                onOpen={onOpen ? () => onOpen(item, index) : () => {}}
                onDelete={onDelete ? () => onDelete(key) : undefined}
                showRemix={showRemix}
                remixModelId={remixModelId}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const AssetCardList = memo(AssetCardListComponent);
export default AssetCardList;
