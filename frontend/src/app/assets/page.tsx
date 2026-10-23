"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Box,
  ChevronLeft,
  ChevronRight,
  Film,
  ImageIcon,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import AssetCardList from "@/components/AssetCardList";
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
import { useAuth } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/rbac";

const PAGE_SIZE = 24;

const TABS: { id: AssetType; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video", label: "Videos", icon: Film },
  { id: "3d", label: "3D Assets", icon: Box },
];

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}


export default function AssetsPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
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

  // Tags Horizontal Scroll Rail State
  const tagsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollTagsLeft, setCanScrollTagsLeft] = useState(false);
  const [canScrollTagsRight, setCanScrollTagsRight] = useState(false);

  const checkTagsScrollLimits = useCallback(() => {
    const el = tagsScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollTagsLeft(scrollLeft > 6);
    setCanScrollTagsRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = tagsScrollRef.current;
    if (!el) return;

    checkTagsScrollLimits();
    el.addEventListener("scroll", checkTagsScrollLimits, { passive: true });
    window.addEventListener("resize", checkTagsScrollLimits);
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => checkTagsScrollLimits())
        : null;
    if (ro) ro.observe(el);

    return () => {
      el.removeEventListener("scroll", checkTagsScrollLimits);
      window.removeEventListener("resize", checkTagsScrollLimits);
      if (ro) ro.disconnect();
    };
  }, [checkTagsScrollLimits, popularTags]);

  const scrollTags = (direction: "left" | "right") => {
    const el = tagsScrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.6;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    setTimeout(checkTagsScrollLimits, 350);
  };

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
    if (!isAuthenticated) return;
    void api
      .getPopularTags(40, user?.id)
      .then((items) => {
        if (!cancelled) setPopularTags(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

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
    if (!isAuthenticated) return;
    setLoading(true);
    api
      .getMyGallery(500, origin === "all" ? {} : { origin })
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
  }, [isAuthenticated, origin, retryKey]);

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
    <ProtectedRoute
      requireAuth={true}
      title="Asset Library Access"
      description="Sign in to view, search, and manage your personal creations and asset history."
    >
      <main id="main-content" className="assets-root workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)] antialiased">
      {/* ---------------- Integrated In-Grid Toolbar ---------------- */}
      <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Command Bar Toolbar: Type Switcher + Search + Source Selector + New Render */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]/70 backdrop-blur-md p-2.5 shadow-sm mb-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
            {/* Segmented Type Switcher (Images / Videos / 3D) */}
            <div
              role="tablist"
              aria-label="Asset type"
              className="flex items-center rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-1 gap-1 shrink-0 h-9"
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
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "bg-[var(--surface-raised)] text-[var(--ink)] shadow-xs border border-[var(--line-strong)]/40 font-medium"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-[var(--accent)]" : ""}`} />
                    <span>{label}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums rounded px-1.5 py-0.5 ${
                        active ? "bg-[var(--accent)]/15 text-[var(--accent)] font-semibold" : "text-[var(--ink-faint)]"
                      }`}
                    >
                      {formatCount(counts[id])}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 lg:justify-end">
              {/* Ergonomic Search Field */}
              <div className="relative flex-1 min-w-[240px] max-w-md group">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)] group-focus-within:text-[var(--accent)] transition-colors duration-150" />
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
                  className="h-9 w-full rounded-lg border border-[var(--line-strong)]/40 bg-[var(--surface-sunken)] pl-9 pr-12 text-xs text-[var(--ink)] placeholder:text-[var(--ink-soft)]/60 outline-none transition-all duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 focus:bg-[var(--surface)]"
                />
                {searchDraft ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Clear asset search"
                    className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors text-xs"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--line-strong)]/60 bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-faint)] group-focus-within:opacity-0 transition-opacity select-none sm:block">
                    /
                  </kbd>
                )}
              </div>

              {/* Source Filter Group */}
              <div
                className="flex items-center shrink-0 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-1 gap-1 h-9"
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
                    className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition ${
                      origin === source
                        ? "border border-[var(--line-strong)]/40 bg-[var(--surface-raised)] text-[var(--ink)] shadow-xs font-medium"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {source === "all" ? "All Sources" : source === "workspace" ? "Studio" : "Tools"}
                  </button>
                ))}
              </div>

              {/* New Render CTA */}
              <Link
                href="/generate"
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>New Render</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Popular Tags Rail (if available) */}
        {popularTags.length > 0 && (
          <div className="relative group/tags w-full pt-1 pb-1">
            {/* Left Chevron Button & Edge Scrim */}
            {canScrollTagsLeft && (
              <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center pr-4 bg-gradient-to-r from-[var(--ground)] via-[var(--ground)]/90 to-transparent">
                <button
                  type="button"
                  onClick={() => scrollTags("left")}
                  aria-label="Scroll tags left"
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 text-[var(--ink)] shadow-md backdrop-blur-md transition-all duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:scale-110 active:scale-95"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Right Chevron Button & Edge Scrim */}
            {canScrollTagsRight && (
              <div className="absolute right-0 top-0 bottom-0 z-20 flex items-center pl-4 bg-gradient-to-l from-[var(--ground)] via-[var(--ground)]/90 to-transparent">
                <button
                  type="button"
                  onClick={() => scrollTags("right")}
                  aria-label="Scroll tags right"
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 text-[var(--ink)] shadow-md backdrop-blur-md transition-all duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:scale-110 active:scale-95"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Horizontal Scroll Track */}
            <div
              ref={tagsScrollRef}
              className="flex flex-wrap items-center gap-1.5 w-full py-0.5"
              
              aria-label="Tag filters"
            >
              <button
                type="button"
                onClick={clearTags}
                className={`h-6 shrink-0 rounded-md border px-2.5 py-0.5 text-[11px] font-medium transition-all duration-150 select-none ${
                  selectedTags.length === 0
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-xs"
                    : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                }`}
              >
                All tags
              </button>
              {popularTags.map(({ name }) => {
                const active = selectedTags.includes(name.toLowerCase());
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleTag(name)}
                    className={`h-6 shrink-0 rounded-md border px-2.5 py-0.5 text-[11px] font-medium transition-all duration-150 select-none ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-xs scale-[1.01]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className={active ? "text-[var(--accent-ink)] font-bold mr-0.5" : "text-[var(--accent)] mr-0.5"}>
                      #
                    </span>
                    <span>{name}</span>
                  </button>
                );
              })}
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={clearTags}
                  className="h-6 shrink-0 rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--danger)] hover:bg-[var(--danger)]/20 hover:border-[var(--danger)]/50 transition-colors whitespace-nowrap"
                >
                  Clear tags ({selectedTags.length})
                </button>
              )}
            </div>
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
          <AssetCardList loading skeletonCount={PAGE_SIZE} aspectRatio="natural" items={[]} />
        ) : error ? (
          <div className="workspace-empty flex min-h-[420px] flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
            <p className="mt-1.5 text-sm text-[var(--ink-faint)]">Check that the local API is running, then retry.</p>
            <button type="button" onClick={() => { setLoading(true); setError(null); setRetryKey((key) => key + 1); }} className="workspace-action-secondary mt-4 px-3 py-2 text-xs">Try again</button>
          </div>
        ) : assets.length === 0 ? (
          <div className="workspace-empty workspace-bezel flex min-h-[420px] flex-col items-center justify-center p-1.5 text-center">
            <div className="workspace-core flex h-full w-full flex-col items-center justify-center px-6 py-16">
              <div className="workspace-icon-island h-16 w-16 border border-[var(--accent-ambient)] text-[var(--accent)] shadow-ambient-glow rounded-2xl bg-[var(--surface-soft)]">
                <Sparkles className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <div className="workspace-kicker mt-8">Your private gallery</div>
              <h3 className="workspace-heading mt-3 text-xl font-semibold text-[var(--ink)]">No creations yet</h3>
              <p className="mt-3 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
                Every artwork, upscale, and design you generate in the studio will be curated in your private library.
              </p>
              <Link href="/generate" className="workspace-action-primary mt-7 gap-2 px-5 py-2.5 text-sm">
                <Sparkles className="h-4.5 w-4.5" strokeWidth={1.5} />
                Open Studio &rarr;
              </Link>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          query ? (
            <EmptyState kind="image" onClearSearch={clearSearch} />
          ) : (
            <EmptyState kind={tab} />
          )
        ) : (
          <>
            <AssetCardList
              items={shown}
              aspectRatio="natural"
              savedKeys={savedKeys}
              onBookmark={(asset) => toggleSaved(asset.key)}
              onOpen={(asset) => openAsset(asset as AssetRecord)}
              onDelete={(key) => setDeleteTarget(key)}
            />
            {filtered.length > shown.length && (
              <div className="mt-6 flex flex-col items-center gap-2 pb-4">
                <p className="text-xs text-[var(--ink-faint)]">Showing {shown.length} of {formatCount(filtered.length)}</p>
                <button type="button" onClick={() => setVisible((value) => value + PAGE_SIZE)} className="workspace-action-primary gap-2 px-5 py-3 text-xs"><ArrowDown className="h-4 w-4" />Load more</button>
              </div>
            )}
          </>
        )}
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
      <WorkspaceFooter />
      </main>
    </ProtectedRoute>
  );
}