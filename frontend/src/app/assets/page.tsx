"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Box,
  Film,
  ImageIcon,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import AssetCard from "@/components/AssetCard";
import EmptyState from "@/components/EmptyState";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import WorkspaceModal from "@/components/WorkspaceModal";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import {
  api,
  withTypes,
  type AssetRecord,
  type AssetType,
  type GalleryItem,
  type InstalledGalleryModel,
  type TagSummary,
} from "@/lib/api";
import { usePersistentState, STORAGE_KEYS } from "@/lib/storage";

const PAGE_SIZE = 24;

const TABS: { id: AssetType; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video", label: "Videos", icon: Film },
  { id: "3d", label: "3D Assets", icon: Box },
];

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function AssetCardSkeleton({ index }: { index: number }) {
  const height = 280 + ((index * 40) % 140);
  return (
    <div
      style={{ height, animationDelay: `${index * 30}ms` }}
      className="relative flex w-full flex-col justify-end overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)]"
    >
      {/* Background base shimmer */}
      <div className="absolute inset-0 shimmer opacity-60" />

      {/* Floating Top Badge Mirror */}
      <div className="absolute left-3.5 top-3.5 z-10 pointer-events-none">
        <div className="h-5 w-16 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
      </div>

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 via-50% to-transparent" />

      {/* Bottom Typography Overlay Mirror */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5 space-y-2 pointer-events-none">
        <div className="h-5 w-3/4 rounded-lg bg-white/20 shimmer" />
        <div className="h-3.5 w-1/2 rounded-md bg-white/10 shimmer mt-1.5" />
      </div>
    </div>
  );
}

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = usePersistentState<AssetType>(STORAGE_KEYS.ASSETS_TAB, "image");
  const [origin, setOrigin] = usePersistentState<"all" | "workspace" | "ai_tool_studio">(
    STORAGE_KEYS.ASSETS_SOURCE,
    "all"
  );
  const [query, setQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [savedKeyList, setSavedKeyList] = usePersistentState<string[]>(
    STORAGE_KEYS.ASSETS_BOOKMARKS,
    []
  );
  const savedKeys = useMemo(() => new Set(savedKeyList), [savedKeyList]);
  const [retryKey, setRetryKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Shallow Modal Inspection Stage
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);

  // Tags Filter State
  const [popularTags, setPopularTags] = useState<TagSummary[]>([]);
  const [selectedTags, setSelectedTags] = usePersistentState<string[]>(
    STORAGE_KEYS.ASSETS_TAGS,
    []
  );

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

  useEffect(() => {
    let cancelled = false;
    void api
      .getPopularTags(40)
      .then((items) => {
        if (!cancelled) setPopularTags(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync initial query params (?tags=... or ?tag=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tagParam = params.get("tag");
    const tagsParam = params.get("tags");
    if (tagsParam) {
      const parsed = tagsParam
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      setSelectedTags(parsed);
    } else if (tagParam) {
      setSelectedTags([tagParam.trim().toLowerCase()]);
    }
  }, []);

  const toggleTag = useCallback((tagName: string) => {
    const norm = tagName.trim().toLowerCase();
    setSelectedTags((prev) => {
      const next = prev.includes(norm) ? prev.filter((t) => t !== norm) : [...prev, norm];
      try {
        const url = new URL(window.location.href);
        if (next.length > 0) {
          url.searchParams.set("tags", next.join(","));
          url.searchParams.delete("tag");
        } else {
          url.searchParams.delete("tags");
          url.searchParams.delete("tag");
        }
        window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
      } catch {
        // ignore
      }
      return next;
    });
    setVisible(PAGE_SIZE);
  }, []);

  const clearTags = useCallback(() => {
    setSelectedTags([]);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("tags");
      url.searchParams.delete("tag");
      window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
    } catch {
      // ignore
    }
    setVisible(PAGE_SIZE);
  }, []);

  const openAsset = useCallback((asset: AssetRecord) => {
    setSelectedAsset(asset);
    try {
      const encoded = asset.key.split("/").map(encodeURIComponent).join("/");
      window.history.pushState({ assetKey: asset.key }, "", `/assets/${encoded}`);
    } catch {
      // Ignore in restricted environments
    }
  }, []);

  const closeAsset = useCallback(() => {
    setSelectedAsset(null);
    try {
      window.history.pushState(null, "", "/assets");
    } catch {
      // Ignore
    }
  }, []);

  const selectAssetInCarousel = useCallback((item: GalleryItem) => {
    setSelectedAsset(item as AssetRecord);
    try {
      const encoded = item.key.split("/").map(encodeURIComponent).join("/");
      window.history.replaceState({ assetKey: item.key }, "", `/assets/${encoded}`);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.assetKey) {
        const match = assets.find((a) => a.key === e.state.assetKey);
        if (match) {
          setSelectedAsset(match);
          return;
        }
      }
      setSelectedAsset(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [assets]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAsset(deleteTarget);
      setAssets((prev) => prev.filter((a) => a.key !== deleteTarget));
      if (selectedAsset?.key === deleteTarget) {
        closeAsset();
      }
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete asset");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, selectedAsset, closeAsset]);

  useEffect(() => {
    let cancelled = false;
    api
      .getGallery(200, origin === "all" ? {} : { origin })
      .then((items) => {
        if (!cancelled) setAssets(withTypes(items));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not reach the asset library."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origin, retryKey]);

  // "/" focuses search, like every gallery tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const byType = useMemo(() => {
    const counts: Record<AssetType, AssetRecord[]> = { image: [], video: [], "3d": [] };
    for (const a of assets) counts[a.type].push(a);
    return counts;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = byType[tab];
    if (selectedTags.length > 0) {
      list = list.filter((a) => {
        const itemTags = (a.metadata?.tags || []).map((t) => t.toLowerCase());
        return selectedTags.every((st) => itemTags.includes(st));
      });
    }
    if (!q) return list;
    return list.filter((a) => a.key.toLowerCase().includes(q));
  }, [byType, tab, query, selectedTags]);

  const shown = filtered.slice(0, visible);

  const commitSearch = useCallback(() => {
    setQuery(searchDraft);
    setVisible(PAGE_SIZE);
  }, [searchDraft]);

  const clearSearch = useCallback(() => {
    setSearchDraft("");
    setQuery("");
    setVisible(PAGE_SIZE);
  }, []);

  const toggleSaved = useCallback((key: string) => {
    setSavedKeyList((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, [setSavedKeyList]);

  const counts: Record<AssetType, number> = {
    image: byType.image.length,
    video: byType.video.length,
    "3d": byType["3d"].length,
  };

  return (
    <main id="main-content" className="assets-root workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)] antialiased">
      {/* ---------------- Integrated In-Grid Toolbar ---------------- */}
      <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Control Bar: Type Switcher + Search + Source Selector + New Render */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
          {/* Segmented Type Switcher (Images / Videos / 3D) */}
          <div
            role="tablist"
            aria-label="Asset type"
            className="flex items-center rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5 gap-0.5 shrink-0"
          >
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTab(id);
                    setVisible(PAGE_SIZE);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-[var(--surface-raised)] text-[var(--ink)] shadow-sm border border-[var(--line-strong)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                >
                  <Icon className={`h-3 w-3 ${active ? "text-[var(--accent)]" : ""}`} />
                  <span>{label}</span>
                  <span
                    className={`font-mono text-[9px] tabular-nums rounded px-1 py-0.2 ${
                      active ? "bg-[var(--accent)]/15 text-[var(--accent)] font-bold" : "text-[var(--ink-faint)]"
                    }`}
                  >
                    {formatCount(counts[id])}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 lg:justify-end">
            {/* Search Field */}
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
              <input
                ref={searchRef}
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitSearch();
                }}
                onBlur={commitSearch}
                placeholder="Search local filenames…"
                aria-label="Search local filenames"
                className="workspace-field h-7.5 w-full pl-8 pr-14 text-xs placeholder:text-[var(--ink-faint)]"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 border border-[var(--line)] bg-[var(--surface-raised)] px-1 py-0.5 text-[9px] font-mono text-[var(--ink-faint)] sm:block">
                /
              </kbd>
              {searchDraft && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear asset search"
                  className="workspace-action-quiet absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center sm:right-8 text-xs"
                >
                  <span aria-hidden>×</span>
                </button>
              )}
            </div>

            {/* Source Filter Group */}
            <div
              className="flex items-center shrink-0 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5 gap-0.5"
              aria-label="Asset source"
            >
              {(["all", "workspace", "ai_tool_studio"] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  aria-pressed={origin === source}
                  onClick={() => {
                    setOrigin(source);
                    setVisible(PAGE_SIZE);
                    setLoading(true);
                    setError(null);
                  }}
                  className={`whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[9px] uppercase font-semibold transition ${
                    origin === source
                      ? "border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] shadow-sm"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                >
                  {source === "all" ? "All Sources" : source === "workspace" ? "Studio" : "Tools"}
                </button>
              ))}
            </div>

            {/* New Render CTA */}
            <Link
              href="/"
              className="inline-flex h-7.5 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)]"
            >
              <Sparkles className="h-3 w-3" />
              <span>New Render ⚡</span>
            </Link>
          </div>
        </div>

        {/* Popular Tags Rail (if available) */}
        {popularTags.length > 0 && (
          <div
            className="flex items-center gap-1.5 overflow-x-auto w-full pt-2.5 no-scrollbar"
            aria-label="Tag filters"
          >
            <button
              type="button"
              onClick={clearTags}
              className={`min-h-5 shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] font-semibold transition ${
                selectedTags.length === 0
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              All tags
            </button>
            {popularTags.map(({ name, count }) => {
              const active = selectedTags.includes(name.toLowerCase());
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleTag(name)}
                  className={`min-h-5 shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                  }`}
                >
                  <span className={active ? "text-[var(--accent-ink)]" : "text-[var(--accent)]"}>#</span>
                  <span>{name}</span>
                  <span className="ml-1 opacity-60">({count})</span>
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={clearTags}
                className="workspace-action-quiet min-h-5 shrink-0 whitespace-nowrap px-1.5 text-[9px] font-mono text-[var(--danger)] hover:underline"
              >
                Clear tags ({selectedTags.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Grid ---------------- */}
      <section className="workspace-bezel mx-auto mt-4 max-w-[1600px] px-5 pb-[calc(var(--mobile-nav-height)+2rem)] pt-6 sm:px-6 sm:pb-8" aria-label="Asset results">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-[var(--ink-faint)]">
          <div className="flex items-center gap-2 flex-wrap">
            <p aria-live="polite">
              {loading
                ? "Loading assets…"
                : `Showing ${formatCount(shown.length)} of ${formatCount(filtered.length)} ${
                    tab === "3d" ? "3D assets" : `${tab}${filtered.length === 1 ? "" : "s"}`
                  }`}
            </p>
            {selectedTags.length > 0 && (
              <span className="font-mono text-[11px] text-[var(--accent)]">
                filtered by: {selectedTags.map((t) => `#${t}`).join(", ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={clearTags}
                className="workspace-action-quiet min-h-9 px-2 text-xs text-[var(--danger)]"
              >
                Reset tags
              </button>
            )}
            {!loading && query && (
              <button
                type="button"
                onClick={clearSearch}
                className="workspace-action-quiet min-h-9 px-2 text-xs"
              >
                Clear search
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-label="Loading assets" aria-busy="true">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <AssetCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : error ? (
          <div className="workspace-empty flex min-h-[420px] flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
            <p className="mt-1.5 text-sm text-[var(--ink-faint)]">Check that the local API is running, then retry.</p>
            <button type="button" onClick={() => { setLoading(true); setError(null); setRetryKey((key) => key + 1); }} className="workspace-action-secondary mt-4 px-3 py-2 text-xs">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          query ? (
            <EmptyState kind="image" onClearSearch={clearSearch} />
          ) : (
            <EmptyState kind={tab} />
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 animate-in fade-in duration-300 ease-out">
              {shown.map((asset) => (
                <AssetCard
                  key={asset.key}
                  asset={asset}
                  saved={savedKeys.has(asset.key)}
                  onBookmark={() => toggleSaved(asset.key)}
                  onOpen={() => openAsset(asset)}
                  onDelete={() => setDeleteTarget(asset.key)}
                />
              ))}
            </div>
            {filtered.length > shown.length && (
              <div className="mt-6 flex flex-col items-center gap-2 pb-4">
                <p className="text-xs text-[var(--ink-faint)]">Showing {shown.length} of {formatCount(filtered.length)}</p>
                <button type="button" onClick={() => setVisible((value) => value + PAGE_SIZE)} className="workspace-action-primary gap-2 px-5 py-3 text-xs"><ArrowDown className="h-4 w-4" />Load more</button>
              </div>
            )}
          </>
        )}
        <WorkspaceFooter />
      </section>

      {/* Shallow History Inspection Modal */}
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
            items={filtered}
            modelOptions={modelOptions}
            onSelectAsset={selectAssetInCarousel}
            onClose={closeAsset}
            onDeleteOutput={(key) => {
              setAssets((prev) => prev.filter((a) => a.key !== key));
              closeAsset();
            }}
          />
        )}
      </WorkspaceModal>

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ground)]/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger)]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="delete-dialog-title" className="text-base font-bold text-[var(--ink)]">
                  Delete asset permanently?
                </h3>
                <p className="mt-1 break-all font-mono text-xs text-[var(--ink-faint)]">
                  {deleteTarget}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">
                  This media file and its metadata sidecar will be permanently removed from disk. This action cannot be undone.
                </p>
                {deleteError && (
                  <p className="mt-2 text-xs font-semibold text-[var(--danger)]" role="alert">
                    {deleteError}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--line)] pt-4">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleting}
                className="workspace-action-secondary px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--danger)]/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete asset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}