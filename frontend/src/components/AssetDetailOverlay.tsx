"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import WorkspaceModal from "@/components/WorkspaceModal";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import RelatedPostsSection from "@/components/RelatedPostsSection";
import { useAuth } from "@/lib/auth-context";
import type { GalleryItem, GalleryMetadata, InstalledGalleryModel } from "@/lib/api";

export interface AssetDetailOverlayProps {
  asset: GalleryItem | null;
  items: GalleryItem[];
  onSelectAsset?: (asset: GalleryItem) => void;
  onClose: () => void;
  modelOptions?: InstalledGalleryModel[];
  onRemix?: (meta: GalleryMetadata) => void;
  onSetReferenceImage?: (url: string) => void;
  onDeleteOutput?: (key: string) => void;
  title?: string;
}

// Next.js still renders client components on the server; a bare
// useLayoutEffect would warn there.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * What a key change means for the overlay's one scroll surface.
 * Focus is only taken on an in-place swap: on first open WorkspaceModal's rAF
 * has to win, or closing would no longer restore the card that opened it.
 */
export function overlayTransition(
  previousKey: string | null,
  nextKey: string | null
): { resetScroll: boolean; focusScroller: boolean } {
  return {
    resetScroll: previousKey !== nextKey,
    focusScroller: previousKey !== null && nextKey !== null && previousKey !== nextKey,
  };
}

export default function AssetDetailOverlay({
  asset,
  items,
  onSelectAsset,
  onClose,
  modelOptions,
  onRemix,
  onSetReferenceImage,
  onDeleteOutput,
  title,
}: AssetDetailOverlayProps) {
  const { isAuthenticated } = useAuth();
  const open = asset !== null;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const previousKeyRef = useRef<string | null>(null);

  // One in-place swap resets the scroll surface. Focus moves only on a swap:
  // on first open WorkspaceModal's own rAF focus must win so closing returns
  // focus to the card that opened the overlay.
  useIsomorphicLayoutEffect(() => {
    const key = asset?.key ?? null;
    const { resetScroll, focusScroller } = overlayTransition(previousKeyRef.current, key);
    if (!resetScroll) return;
    previousKeyRef.current = key;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = 0;
    if (focusScroller) scroller.focus({ preventScroll: true });
  }, [asset?.key]);

  // A related asset that is not in the host's list leaves the chevrons on an
  // unrelated index; falling back to the singleton keeps them consistent.
  const carouselItems =
    asset && !items.some((item) => item.key === asset.key) ? [asset] : items;

  return (
    <WorkspaceModal
      open={open}
      onClose={onClose}
      headless
      size="media"
      title={title ?? asset?.key ?? "Asset Details"}
    >
      <div className="relative">
        {asset && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
            className="absolute right-3 top-3 z-40 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--overlay)] text-[var(--ink-soft)] shadow-md backdrop-blur-md transition hover:border-[var(--accent)] hover:text-[var(--ink)] active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {asset && (
          <div
            ref={scrollerRef}
            tabIndex={-1}
            className="workspace-scroll max-h-[calc(100vh_-_4rem)] overflow-y-auto overscroll-contain rounded-[var(--radius-panel)] bg-[var(--ground)] outline-none supports-[height:100svh]:max-h-[calc(100svh_-_4rem)]"
          >
            <AssetInspectionStage
              key={asset.key}
              mode="overlay"
              asset={asset}
              items={carouselItems}
              onSelectAsset={onSelectAsset}
              onClose={onClose}
              modelOptions={modelOptions}
              onRemix={onRemix}
              onSetReferenceImage={onSetReferenceImage}
              onDeleteOutput={onDeleteOutput}
            />
            <RelatedPostsSection
              key={asset.key}
              anchorKey={asset.key}
              scrollRootRef={scrollerRef}
              variant="panel"
              onOpen={onSelectAsset}
              enabled={isAuthenticated}
            />
          </div>
        )}
      </div>
    </WorkspaceModal>
  );
}
