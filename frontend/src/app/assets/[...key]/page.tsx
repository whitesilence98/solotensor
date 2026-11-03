"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ImageIcon, Sparkles } from "lucide-react";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import RelatedPostsSection from "@/components/RelatedPostsSection";
import { api, type AssetRecord, type GalleryItem, type InstalledGalleryModel } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/rbac";

interface AssetResult {
  /** Key this result belongs to; prevents a stale frame after navigation. */
  key: string;
  item: GalleryItem | null;
  error: string | null;
}

// Before-paint on the client, plain effect during SSR (avoids the
// useLayoutEffect-on-server warning).
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

export default function AssetDetailPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const params = useParams<{ key?: string[] | string }>();
  const rawKey = params?.key;
  const key = Array.isArray(rawKey)
    ? rawKey.map(decodeURIComponent).join("/")
    : typeof rawKey === "string"
    ? decodeURIComponent(rawKey)
    : "";

  const mainRef = useRef<HTMLElement | null>(null);
  // Keyed by the requested asset key so a new navigation never shows the
  // previous asset's frame (and a stale response is discarded outright).
  const [result, setResult] = useState<AssetResult | null>(null);
  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  const asset = result && result.key === key ? result.item : null;
  const loading = !result || result.key !== key;
  const error = result && result.key === key ? result.error : null;

  // Each asset navigation starts at the top of the page's own scrollport.
  // Layout effect so the previous asset's scroll offset is gone before paint.
  useIsomorphicLayoutEffect(() => {
    const scroller = mainRef.current;
    if (scroller) {
      scroller.scrollTo({ top: 0, behavior: "instant" });
      scroller.scrollTop = 0;
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [key, asset?.key]);

  // Load asset
  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setResult({ key, item: null, error: "Could not load asset details." });
      return;
    }
    if (!isAuthenticated) return;

    // If we already have the result for this exact key (e.g. from optimistic related selection), keep it!
    if (result && result.key === key && result.item) {
      return;
    }

    setResult(null);

    api
      .getAsset(key)
      .then((item) => {
        if (!cancelled) setResult({ key, item, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            key,
            item: null,
            error:
              err instanceof Error ? err.message : "Could not load asset details.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key, retryKey, isAuthenticated, result]);

  // Load selectable models for LoRA / model name resolution
  useEffect(() => {
    let cancelled = false;
    void api
      .listSelectableModels()
      .then((items) => {
        if (!cancelled) setModelOptions(items);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectRelatedAsset = useCallback(
    (item: GalleryItem | AssetRecord) => {
      // 1. Defocus clicked card to prevent browser anchor/focus scrolling
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // 2. Force immediate scroll to top on container and window
      const scroller = mainRef.current;
      if (scroller) {
        scroller.scrollTo({ top: 0, behavior: "instant" });
        scroller.scrollTop = 0;
      }
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
      }

      // 3. Immediately set the clicked asset in state (0ms delay, zero blank frame)
      setResult({ key: item.key, item: item as GalleryItem, error: null });

      // 4. Update the URL cleanly
      const encoded = item.key.split("/").map(encodeURIComponent).join("/");
      router.push(`/assets/${encoded}`);

      // 5. Multi-pass RAF to guarantee scroll position remains locked at y = 0
      requestAnimationFrame(() => {
        if (mainRef.current) {
          mainRef.current.scrollTo({ top: 0, behavior: "instant" });
          mainRef.current.scrollTop = 0;
        }
        window.scrollTo({ top: 0, behavior: "instant" });
        setTimeout(() => {
          if (mainRef.current) {
            mainRef.current.scrollTo({ top: 0, behavior: "instant" });
            mainRef.current.scrollTop = 0;
          }
        }, 60);
      });
    },
    [router]
  );

  const handleDelete = async (targetKey: string) => {
    try {
      await api.deleteAsset(targetKey);
      router.push("/assets");
    } catch {
      // Handled gracefully
    }
  };

  const filename = key ? basename(key) : "";

  return (
    <ProtectedRoute
      requireAuth={true}
      title="Asset Access"
      description="Sign in to view asset details and reproduction parameters."
    >
      <main
        id="main-content"
        ref={mainRef}
        className="flex min-h-full w-full flex-1 flex-col bg-[var(--ground)]"
      >
        {/* Pinned Top Navigation Breadcrumbs */}
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_90%,transparent)] px-4 sm:px-6 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link
              href="/assets"
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-soft)] transition hover:text-[var(--accent)]"
              title="Return to asset library"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Library</span>
            </Link>
            <span className="text-[var(--ink-faint)] select-none">/</span>
            <Link
              href="/generate"
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-faint)] transition hover:text-[var(--accent)]"
              title="Return to Studio"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="hidden sm:inline">Studio</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 max-w-[50vw]">
            <span
              className="truncate font-mono text-[10px] text-[var(--ink-faint)]"
              title={key}
            >
              {filename || key}
            </span>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="mx-auto flex w-full max-w-[1600px] 2xl:max-w-[1720px] flex-1 flex-col p-2.5 sm:p-4 lg:p-5">
          {/*
            First-screen band. <main> is a size container, so 100cqh is exactly
            the visible scrollport. Subtracting the h-12 header and this
            container's vertical padding makes the wrapper as tall as the space
            the panel had before; shrink-0 keeps the related section after it.
            The panel's own 580/640px minima are a floor, so short screens grow
            the page instead of clipping the panel.
          */}
          <div className="flex shrink-0 flex-col justify-center min-h-[calc(100cqh_-_3.5rem)] sm:min-h-[calc(100cqh_-_4.5rem)] lg:min-h-[calc(100cqh_-_5rem)]">
            {loading ? (
              <div
                className="relative grid min-h-[580px] w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] lg:grid-cols-[minmax(0,1fr)_24.5rem] shadow-2xl"
                aria-busy="true"
                aria-label="Loading asset details"
              >
                <div className="flex min-h-[460px] items-center justify-center bg-[var(--surface-sunken)] p-6">
                  <div className="h-48 w-48 rounded-xl shimmer opacity-40" />
                </div>
                <div className="p-5 space-y-4 border-t border-[var(--line)] lg:border-t-0 lg:border-l">
                  <div className="h-6 w-3/4 rounded-md shimmer" />
                  <div className="h-20 w-full rounded-xl shimmer" />
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="h-12 rounded-xl shimmer" />
                    <div className="h-12 rounded-xl shimmer" />
                    <div className="h-12 rounded-xl shimmer" />
                    <div className="h-12 rounded-xl shimmer" />
                  </div>
                  <div className="h-11 w-full rounded-xl shimmer mt-4" />
                </div>
              </div>
            ) : error ? (
              <section
                className="mx-auto my-auto flex max-w-md flex-col items-center justify-center p-8 text-center"
                role="alert"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger)]">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <h1 className="mt-4 text-xl font-bold text-[var(--ink)]">
                  Asset unavailable
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">
                  {error}
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <Link
                    href="/assets"
                    className="workspace-action-secondary px-4 py-2 text-xs"
                  >
                    Back to library
                  </Link>
                  <button
                    type="button"
                    onClick={() => setRetryKey((v) => v + 1)}
                    className="workspace-action-primary px-4 py-2 text-xs font-bold"
                  >
                    Try again
                  </button>
                </div>
              </section>
            ) : asset ? (
              asset.metadata?.user_id &&
              user?.id &&
              asset.metadata.user_id !== user.id ? (
                <section
                  className="mx-auto my-auto flex max-w-md flex-col items-center justify-center p-8 text-center"
                  role="alert"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-soft)] text-[var(--accent)]">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <h1 className="mt-4 text-xl font-bold text-[var(--ink)]">
                    Private Asset
                  </h1>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">
                    This asset belongs to another account or is private to its
                    creator.
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <Link
                      href="/assets"
                      className="workspace-action-primary px-4 py-2 text-xs font-bold"
                    >
                      Back to library
                    </Link>
                  </div>
                </section>
              ) : (
                <AssetInspectionStage
                  mode="standalone"
                  asset={asset}
                  items={[asset]}
                  modelOptions={modelOptions}
                  backHref="/assets"
                  onDeleteOutput={handleDelete}
                />
              )
            ) : null}
          </div>

          {!loading && !error && asset && (
            <RelatedPostsSection
              key={asset.key}
              anchorKey={asset.key}
              scrollRootRef={mainRef}
              onOpen={handleSelectRelatedAsset}
            />
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
