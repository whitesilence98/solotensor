"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Images, Loader2, RefreshCw } from "lucide-react";
import { AssetCardList } from "@/components/AssetCardList";
import { api, type AssetRecord, type GalleryItem } from "@/lib/api";

export const RELATED_PAGE_SIZE = 12;

const DEFAULT_ERROR = "Could not load related posts.";

/** Append a page of related assets, dropping keys that are already present. */
export function mergeRelatedItems(
  current: GalleryItem[],
  incoming: GalleryItem[]
): GalleryItem[] {
  const seen = new Set(current.map((item) => item.key));
  const merged = [...current];
  for (const item of incoming || []) {
    if (!item || !item.key || seen.has(item.key)) continue;
    seen.add(item.key);
    merged.push(item);
  }
  return merged;
}

/** A response is only applied when neither its sequence nor its anchor has moved on. */
export function shouldApplyResponse(
  responseSeq: number,
  activeSeq: number,
  responseAnchor: string,
  liveAnchor: string
): boolean {
  return responseSeq === activeSeq && responseAnchor === liveAnchor;
}

export interface RelatedPageResponse {
  items?: GalleryItem[] | null;
  total?: number;
  total_pages?: number;
  has_more?: boolean;
}

export interface RelatedPageOutcome {
  items: GalleryItem[];
  total: number;
  hasMore: boolean;
  /** False when the page added no new asset — paging must stop. */
  progressed: boolean;
}

/**
 * Fold one server page into the running list. Pages are sequential, so page 1
 * replaces the list and later pages append. Paging terminates on a page that
 * makes no progress, so an inconsistent envelope can never loop forever.
 */
export function computeRelatedPageOutcome(
  pageNum: number,
  base: GalleryItem[],
  data: RelatedPageResponse
): RelatedPageOutcome {
  const startingItems = pageNum === 1 ? [] : base;
  const merged = mergeRelatedItems(startingItems, data.items || []);
  const progressed = merged.length > startingItems.length;
  const total = Number.isFinite(data.total)
    ? Math.max(Number(data.total), merged.length)
    : merged.length;
  const totalPages = Number.isFinite(data.total_pages)
    ? Math.max(1, Number(data.total_pages))
    : 1;
  const hasMore =
    Boolean(data.has_more) &&
    progressed &&
    pageNum < totalPages &&
    merged.length < total;
  return { items: merged, total, hasMore, progressed };
}

type LoadStatus = "idle" | "loading" | "ready" | "error";

/** Router fallback used when no `onOpen` is supplied (standalone page). */
export function relatedAssetPath(key: string): string {
  return `/assets/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Should the sentinel observer exist at all? Guests and stopped pages: no. */
export function shouldObserveRelated(
  enabled: boolean,
  status: LoadStatus,
  hasMore: boolean
): boolean {
  if (!enabled) return false;
  if (status === "error") return false;
  if (status === "ready" && !hasMore) return false;
  return true;
}

/** Only render the related-posts status band when it actually has a status. */
export function shouldRenderRelatedFooter(
  variant: "page" | "panel",
  enabled: boolean,
  status: LoadStatus,
  itemsLength: number,
  total: number,
  showLoadMore: boolean
): boolean {
  if (!enabled) return false;
  if (variant === "page") return true; // today's page footer always renders
  if (showLoadMore) return true;
  if (status === "loading" && itemsLength > 0) return true;
  if (status === "ready" && total > 0) return true;
  return false;
}

export interface RelatedPostsSectionProps {
  anchorKey: string;
  /** The page's actual scroll container (`<main>`), never the window. */
  scrollRootRef: React.RefObject<HTMLElement | null>;
  className?: string;
  /** When supplied, a card click opens in place instead of navigating. */
  onOpen?: (asset: GalleryItem | AssetRecord) => void;
  /** `page` is the standalone detail section; `panel` is the overlay's grid. */
  variant?: "page" | "panel";
  /** False for guests: no request is made and a sign-in hint is shown. */
  enabled?: boolean;
  /** Widening is opt-in here; the API client still defaults to `own`. */
  scope?: "own" | "public";
}

export const VARIANT_CLASSES = {
  page: "mt-10 shrink-0 border-t border-[var(--line)] pt-8",
  panel:
    "mt-3 mb-4 shrink-0 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-2xl",
} as const;

export function RelatedPostsSection({
  anchorKey,
  scrollRootRef,
  className = "",
  onOpen,
  variant = "page",
  enabled = true,
  scope = "public",
}: RelatedPostsSectionProps) {
  const router = useRouter();
  const headingId = useId();

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState(DEFAULT_ERROR);

  const itemsRef = useRef<GalleryItem[]>([]);
  const loadedPageRef = useRef(0);
  const loadingRef = useRef(false);
  const requestSeqRef = useRef(0);
  const failedPageRef = useRef<number | null>(null);
  const anchorRef = useRef(anchorKey);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset all pagination state on anchor change; the cleanup also invalidates
  // in-flight responses (StrictMode double-invocation safe).
  useEffect(() => {
    anchorRef.current = anchorKey;
    requestSeqRef.current += 1;
    loadingRef.current = false;
    itemsRef.current = [];
    loadedPageRef.current = 0;
    failedPageRef.current = null;
    setItems([]);
    setTotal(0);
    setHasMore(false);
    setStatus("idle");
    setErrorMessage(DEFAULT_ERROR);
    setFailedPage(null);

    return () => {
      requestSeqRef.current += 1;
      loadingRef.current = false;
    };
  }, [anchorKey, enabled, scope]);

  const loadPage = useCallback(
    (pageNum: number) => {
      if (!enabled) return;
      if (!Number.isFinite(pageNum) || pageNum < 1) return;
      if (loadingRef.current) return;
      const anchor = anchorRef.current;
      if (!anchor) return;

      loadingRef.current = true;
      const seq = ++requestSeqRef.current;
      setStatus("loading");

      void api
        .getRelatedGallery({
          key: anchor,
          page: pageNum,
          limit: RELATED_PAGE_SIZE,
          mode: "all",
          scope,
        })
        .then((data) => {
          if (!shouldApplyResponse(seq, requestSeqRef.current, anchor, anchorRef.current)) {
            return;
          }
          const outcome = computeRelatedPageOutcome(
            pageNum,
            itemsRef.current,
            data
          );
          itemsRef.current = outcome.items;
          loadedPageRef.current = pageNum;
          failedPageRef.current = null;
          setItems(outcome.items);
          setTotal(outcome.total);
          setFailedPage(null);
          setHasMore(outcome.hasMore);
          setStatus("ready");
        })
        .catch((err: unknown) => {
          if (!shouldApplyResponse(seq, requestSeqRef.current, anchor, anchorRef.current)) {
            return;
          }
          failedPageRef.current = pageNum;
          setFailedPage(pageNum);
          setErrorMessage(
            err instanceof Error && err.message ? err.message : DEFAULT_ERROR
          );
          setStatus("error");
        })
        .finally(() => {
          if (seq === requestSeqRef.current) loadingRef.current = false;
        });
    },
    [enabled, scope]
  );

  // Lazy pagination: the first page loads only once the sentinel is actually
  // visible. A small prefetch margin applies to later pages only, so nothing is
  // fetched while the detail panel still fills the first screen.
  useEffect(() => {
    if (!shouldObserveRelated(enabled, status, hasMore)) return;
    const root = scrollRootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    if (typeof IntersectionObserver === "undefined") return;

    const prefetch = items.length > 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (failedPageRef.current !== null) return;
        if (loadingRef.current) return;
        if (!entries.some((entry) => entry.isIntersecting)) return;
        loadPage(loadedPageRef.current + 1);
      },
      { root, rootMargin: prefetch ? "240px 0px" : "0px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRootRef, anchorKey, enabled, status, hasMore, items.length, loadPage]);

  const handleOpen = useCallback(
    (asset: GalleryItem | AssetRecord) => {
      // Defocus clicked card to prevent browser from keeping scroll pinned to it
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // Immediately reset scroll on the parent scroll container so the user instantly sees the primary view at the top
      const root = scrollRootRef?.current;
      if (root) {
        root.scrollTo({ top: 0, behavior: "instant" });
        root.scrollTop = 0;
      }
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
      }

      if (onOpen) {
        onOpen(asset);
        return;
      }
      router.push(relatedAssetPath(asset.key));
    },
    [onOpen, router, scrollRootRef]
  );

  const isPanel = variant === "panel";
  const showSkeleton = enabled && status === "loading" && items.length === 0;
  const showEmpty = enabled && status === "ready" && total === 0 && items.length === 0;
  const showLoadMore =
    !enabled
      ? false
      :
    status === "error"
      ? false
      : items.length === 0
      ? status === "idle"
      : status === "ready" && hasMore;

  return (
    <section
      aria-labelledby={headingId}
      className={`${VARIANT_CLASSES[variant]} ${className}`}
    >
      <div
        className={
          isPanel
            ? "flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-4 pb-4 pt-5 sm:px-5"
            : "mb-6 flex flex-wrap items-center justify-between gap-4"
        }
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              id={headingId}
              className="text-lg font-bold tracking-tight text-[var(--ink)]"
            >
              Related posts
            </h2>
            {total > 0 && (
              <span
                className={
                  isPanel
                    ? "rounded border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent)]"
                    : "rounded border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent)]"
                }
              >
                {total}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={isPanel ? "px-4 py-4 sm:px-5" : undefined}>
        {!enabled && (
          <p className="workspace-empty mx-auto max-w-md px-4 py-6 text-center text-xs leading-relaxed text-[var(--ink-soft)]">
            Sign in to see related posts.
          </p>
        )}

        {showSkeleton && (
          <AssetCardList
            items={[]}
            loading
            skeletonCount={RELATED_PAGE_SIZE}
            aspectRatio="natural"
            showRemix={false}
          />
        )}

        {items.length > 0 && (
          <AssetCardList
            items={items}
            aspectRatio="natural"
            showRemix={false}
            onOpen={(asset) => handleOpen(asset)}
          />
        )}

        {status === "error" && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] px-4 py-3 text-xs text-[var(--danger)] sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="leading-relaxed">{errorMessage || DEFAULT_ERROR}</span>
            <button
              type="button"
              onClick={() => loadPage(failedPage ?? 1)}
              className="workspace-action-secondary shrink-0 px-3 py-1.5 text-[11px] font-semibold"
            >
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        {showEmpty && (
          <div className="workspace-empty mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10">
            <Images className="h-5 w-5 text-[var(--ink-faint)]" />
            <h3 className="mt-3 text-sm font-semibold text-[var(--ink)]">
              No related posts yet
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-soft)]">
              Generations that share this asset&rsquo;s model, LoRA, or tags will
              collect here.
            </p>
          </div>
        )}
      </div>

      {/* Sentinel: starts the lazy first page and continues sequential pages */}
      {enabled && (
        <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      )}

      {shouldRenderRelatedFooter(variant, enabled, status, items.length, total, showLoadMore) && (
      <div
        className={
          isPanel
            ? "flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3.5 sm:px-5"
            : "mt-5 flex flex-wrap items-center justify-between gap-3"
        }
      >
        <p
          aria-live="polite"
          className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink-faint)]"
        >
          {status === "loading" && items.length > 0
            ? "Loading more"
            : status === "ready" && total > 0
            ? `Showing ${items.length} of ${total}`
            : ""}
        </p>

        {status === "loading" && items.length > 0 && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Fetching
          </span>
        )}

        {status === "ready" && !hasMore && items.length > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">
            End of related posts
          </span>
        )}

        {showLoadMore && (
          <button
            type="button"
            onClick={() => loadPage(loadedPageRef.current + 1)}
            className="workspace-action-secondary px-3 py-1.5 text-[11px] font-semibold"
          >
            {items.length === 0 ? "Load related posts" : "Load more"}
          </button>
        )}
      </div>
      )}
    </section>
  );
}

export default RelatedPostsSection;
