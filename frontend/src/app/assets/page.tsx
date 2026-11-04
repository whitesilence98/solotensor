"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  FolderPlus,
  ImageIcon,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import AssetCardList from "@/components/AssetCardList";
import EmptyState from "@/components/EmptyState";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import AssetDetailOverlay from "@/components/AssetDetailOverlay";
import {
  api,
  withTypes,
  type AssetRecord,
  type AssetType,
  type CollectionRecord,
  type GalleryItem,
  type InstalledGalleryModel,
  type TagSummary,
} from "@/lib/api";
import {
  filterLibrary,
  parseLibraryUrl,
  sortLibrary,
  type LibrarySort,
  type LibrarySource,
} from "@/lib/assetLibrary";
import { usePersistentState, STORAGE_KEYS } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/rbac";

const PAGE_SIZE = 24;
const SOURCE_VALUES: readonly LibrarySource[] = ["all", "workspace", "ai_tool_studio"];
type SourceOrigin = LibrarySource;
/** The gallery endpoint caps one page at 500; search/sort only ever see those. */
const LOADED_LIMIT = 500;
const BULK_ADD_LIMIT = 100;

const TABS: { id: AssetType; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video", label: "Videos", icon: Film },
  { id: "3d", label: "3D Assets", icon: Box },
];

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function sourceLabel(source: SourceOrigin): string {
  return source === "all" ? "All Sources" : source === "workspace" ? "Studio" : "Tools";
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function AssetsPage() {
  const { user, isAuthenticated } = useAuth();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = usePersistentState<AssetType>(STORAGE_KEYS.ASSETS_TAB, "image");
  const [origin, setOrigin] = usePersistentState<SourceOrigin>(
    STORAGE_KEYS.ASSETS_SOURCE,
    "all"
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("newest");
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

  // Tags Filter State (URL-backed; localStorage remains the fallback default)
  const [popularTags, setPopularTags] = useState<TagSummary[]>([]);
  const [selectedTags, setSelectedTags] = usePersistentState<string[]>(
    STORAGE_KEYS.ASSETS_TAGS,
    []
  );

  // Collections + bulk selection
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [collectionsKey, setCollectionsKey] = useState(0);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [collectionItemKeys, setCollectionItemKeys] = useState<Set<string>>(new Set());
  const [collectionItemsKey, setCollectionItemsKey] = useState(0);
  const [collectionNameDraft, setCollectionNameDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkNewName, setBulkNewName] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Tags Horizontal Scroll Rail State
  const tagsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollTagsLeft, setCanScrollTagsLeft] = useState(false);
  const [canScrollTagsRight, setCanScrollTagsRight] = useState(false);

  // Single URL<->state bridge. Inspection pushes `/assets/<key>` and restores the
  // exact same query string, so q/sort/source/tags survive back navigation.
  // First mount keeps stored fallbacks; history navigation resets absent params
  // to their canonical defaults instead of inheriting the previous page's state.
  const urlReady = useRef(false);
  const applyUrlState = useCallback(
    (resetMissing: boolean) => {
      if (typeof window === "undefined") return;
      const state = parseLibraryUrl(window.location.search, resetMissing);
      if (state.query !== undefined) {
        setQuery(state.query);
        setSearchDraft(state.query);
      }
      if (state.sort !== undefined) setSort(state.sort);
      if (state.source !== undefined) setOrigin(state.source);
      if (state.tags !== undefined) setSelectedTags(state.tags);
    },
    [setOrigin, setSelectedTags]
  );

  useEffect(() => {
    applyUrlState(false);
    urlReady.current = true;
  }, [applyUrlState]);

  useEffect(() => {
    if (!urlReady.current || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const write = (key: string, value: string | null) => {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      };
      write("q", query.trim() ? query : null);
      write("sort", sort === "newest" ? null : sort);
      write("source", origin === "all" ? null : origin);
      write("tags", selectedTags.length ? selectedTags.join(",") : null);
      url.searchParams.delete("tag");
      const next = url.pathname + (url.search ? url.search : "");
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", next);
      }
    } catch {
      // Ignore in restricted environments.
    }
  }, [query, sort, origin, selectedTags]);

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

  // Identity change: drop every account-owned surface immediately. Sources that
  // are no longer visible must not linger, and an in-flight request from the
  // previous account is ignored by the identity token below.
  const identityToken = useRef(0);
  useEffect(() => {
    identityToken.current += 1;
    setAssets([]);
    setPopularTags([]);
    setLoading(Boolean(isAuthenticated));
    setError(null);
    setRetryKey(0);
    setCollections([]);
    setActiveCollectionId(null);
    setCollectionItemKeys(new Set());
    setSelectedKeys(new Set());
    setSelectMode(false);
    setBulkTarget("");
    setBulkNewName("");
    setBulkBusy(false);
    setBulkMessage(null);
    setBulkError(null);
    setCollectionError(null);
    setCollectionNameDraft("");
    setRenamingId(null);
    setRenameDraft("");
    setSelectedAsset(null);
    setDeleteTarget(null);
    setDeleting(false);
    setDeleteError(null);
  }, [user?.id, isAuthenticated]);

  // Mutations that started under the previous identity must not paint results
  // into the new account's view.
  const isCurrentIdentity = useCallback(
    (token: number) => identityToken.current === token,
    []
  );

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) return;
    void api
      .getCollections()
      .then((items) => {
        if (!cancelled) setCollections(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setCollectionError(errorMessage(err, "Could not load collections."));
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, collectionsKey]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !activeCollectionId) {
      setCollectionItemKeys(new Set());
      return;
    }
    void api
      .getCollectionItems(activeCollectionId)
      .then((keys) => {
        if (!cancelled) setCollectionItemKeys(new Set(keys));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCollectionItemKeys(new Set());
          setCollectionError(errorMessage(err, "Could not load collection items."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, activeCollectionId, collectionItemsKey]);

  const toggleTag = useCallback((tagName: string) => {
    const norm = tagName.trim().toLowerCase();
    setSelectedTags((prev) =>
      prev.includes(norm) ? prev.filter((t) => t !== norm) : [...prev, norm]
    );
    setVisible(PAGE_SIZE);
  }, [setSelectedTags]);

  const clearTags = useCallback(() => {
    setSelectedTags([]);
    setVisible(PAGE_SIZE);
  }, [setSelectedTags]);

  const openAsset = useCallback((asset: AssetRecord) => {
    setSelectedAsset(asset);
    try {
      const encoded = asset.key.split("/").map(encodeURIComponent).join("/");
      const search = window.location.search;
      window.history.pushState({ assetKey: asset.key }, "", `/assets/${encoded}${search}`);
    } catch {
      // Ignore in restricted environments
    }
  }, []);

  const closeAsset = useCallback(() => {
    setSelectedAsset(null);
    try {
      window.history.pushState(null, "", `/assets${window.location.search}`);
    } catch {
      // Ignore
    }
  }, []);

  const selectAssetInCarousel = useCallback((item: GalleryItem) => {
    setSelectedAsset(item as AssetRecord);
    try {
      const encoded = item.key.split("/").map(encodeURIComponent).join("/");
      const search = window.location.search;
      window.history.replaceState({ assetKey: item.key }, "", `/assets/${encoded}${search}`);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      applyUrlState(true);
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
  }, [assets, applyUrlState]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    const token = identityToken.current;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAsset(deleteTarget);
      if (!isCurrentIdentity(token)) return;
      setAssets((prev) => prev.filter((a) => a.key !== deleteTarget));
      if (selectedAsset?.key === deleteTarget) {
        closeAsset();
      }
      setDeleteTarget(null);
    } catch (err) {
      if (!isCurrentIdentity(token)) return;
      setDeleteError(err instanceof Error ? err.message : "Failed to delete asset");
    } finally {
      if (isCurrentIdentity(token)) setDeleting(false);
    }
  }, [deleteTarget, deleting, selectedAsset, closeAsset, isCurrentIdentity]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    api
      .getMyGallery(LOADED_LIMIT, origin === "all" ? {} : { origin })
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
  }, [isAuthenticated, user?.id, origin, retryKey]);

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
    const inCollection = activeCollectionId ? collectionItemKeys : null;
    return sortLibrary(
      filterLibrary(byType[tab], {
        query,
        tags: selectedTags,
        keys: inCollection,
      }),
      sort
    );
  }, [byType, tab, query, selectedTags, activeCollectionId, collectionItemKeys, sort]);

  const shown = filtered.slice(0, visible);
  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null;

  const commitSearch = useCallback(() => {
    setQuery(searchDraft.trim());
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

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedKeys(new Set());
      return !prev;
    });
    setBulkMessage(null);
    setBulkError(null);
  }, []);

  // Selection belongs to one view; switching tab/source drops it.
  useEffect(() => {
    setSelectedKeys(new Set());
    setBulkMessage(null);
    setBulkError(null);
  }, [tab, origin]);

  const createCollection = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = collectionNameDraft.trim();
      if (!name) return;
      const token = identityToken.current;
      setCollectionError(null);
      try {
        const created = await api.createCollection({ name });
        if (!isCurrentIdentity(token)) return;
        setCollections((prev) => [created, ...prev]);
        setCollectionNameDraft("");
        setActiveCollectionId(created.id);
        setBulkTarget(created.id);
        setVisible(PAGE_SIZE);
      } catch (err) {
        if (!isCurrentIdentity(token)) return;
        setCollectionError(errorMessage(err, "Could not create collection."));
      }
    },
    [collectionNameDraft, isCurrentIdentity]
  );

  const renameCollection = useCallback(
    async (id: string) => {
      const name = renameDraft.trim();
      if (!name) return;
      const token = identityToken.current;
      setCollectionError(null);
      try {
        const updated = await api.updateCollection(id, { name });
        if (!isCurrentIdentity(token)) return;
        setCollections((prev) => prev.map((c) => (c.id === id ? updated : c)));
        setRenamingId(null);
        setRenameDraft("");
      } catch (err) {
        if (!isCurrentIdentity(token)) return;
        setCollectionError(errorMessage(err, "Could not rename collection."));
      }
    },
    [renameDraft, isCurrentIdentity]
  );

  const deleteCollection = useCallback(async (collection: CollectionRecord) => {
    if (!window.confirm(`Delete the collection "${collection.name}"? Media files are not deleted.`)) {
      return;
    }
    const token = identityToken.current;
    setCollectionError(null);
    try {
      await api.deleteCollection(collection.id);
      if (!isCurrentIdentity(token)) return;
      setCollections((prev) => prev.filter((c) => c.id !== collection.id));
      setActiveCollectionId((current) => (current === collection.id ? null : current));
      setBulkTarget((current) => (current === collection.id ? "" : current));
    } catch (err) {
      if (!isCurrentIdentity(token)) return;
      setCollectionError(errorMessage(err, "Could not delete collection."));
    }
  }, [isCurrentIdentity]);

  const addSelectedToCollection = useCallback(async () => {
    const allKeys = Array.from(selectedKeys);
    if (allKeys.length === 0) {
      setBulkError("Select at least one asset.");
      return;
    }
    const keys = allKeys.slice(0, BULK_ADD_LIMIT);
    const token = identityToken.current;
    setBulkBusy(true);
    setBulkMessage(null);
    setBulkError(null);
    try {
      let targetId = bulkTarget;
      if (!targetId) {
        const name = bulkNewName.trim();
        if (!name) {
          setBulkError("Choose a collection, or name a new one.");
          return;
        }
        const created = await api.createCollection({ name });
        if (!isCurrentIdentity(token)) return;
        setCollections((prev) => [created, ...prev]);
        setBulkNewName("");
        targetId = created.id;
      }
      const result = await api.addCollectionItems(targetId, keys);
      if (!isCurrentIdentity(token)) return;
      const capped =
        allKeys.length > keys.length
          ? ` Only the first ${BULK_ADD_LIMIT} were sent.`
          : "";
      setBulkMessage(
        `Added ${result.added.length} of ${keys.length}. Skipped ${result.skipped.length} (already in the collection, missing, or not owned).${capped}`
      );
      setBulkTarget(targetId);
      setSelectedKeys(new Set());
      setCollectionsKey((k) => k + 1);
      if (activeCollectionId === targetId) setCollectionItemsKey((k) => k + 1);
    } catch (err) {
      if (!isCurrentIdentity(token)) return;
      setBulkError(errorMessage(err, "Could not add assets to the collection."));
    } finally {
      if (isCurrentIdentity(token)) setBulkBusy(false);
    }
  }, [selectedKeys, bulkTarget, bulkNewName, activeCollectionId, isCurrentIdentity]);

  const removeSelectedFromCollection = useCallback(async () => {
    if (!activeCollectionId || selectedKeys.size === 0) return;
    const keys = Array.from(selectedKeys);
    const token = identityToken.current;
    setBulkBusy(true);
    setBulkMessage(null);
    setBulkError(null);
    try {
      const results = await Promise.all(
        keys.map((key) =>
          api
            .removeCollectionItem(activeCollectionId, key)
            .catch(() => false)
        )
      );
      if (!isCurrentIdentity(token)) return;
      const removed = results.filter(Boolean).length;
      setBulkMessage(
        `Removed ${removed} of ${keys.length} from this collection. Media files were not deleted.`
      );
      setSelectedKeys(new Set());
      setCollectionItemsKey((k) => k + 1);
      setCollectionsKey((k) => k + 1);
    } catch (err) {
      if (!isCurrentIdentity(token)) return;
      setBulkError(errorMessage(err, "Could not remove assets from the collection."));
    } finally {
      if (isCurrentIdentity(token)) setBulkBusy(false);
    }
  }, [activeCollectionId, selectedKeys, isCurrentIdentity]);

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
      <main id="main-content" className="assets-root flex min-h-full w-full flex-1 flex-col bg-[var(--ground)] antialiased">
        <div className="flex-1 flex flex-col">
      {/* ---------------- Integrated In-Grid Toolbar ---------------- */}
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 sm:pt-6">
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
                  placeholder="Search loaded library (up to 500 assets)…"
                  aria-label="Search loaded asset filenames (up to 500 assets)"
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

              {/* Sort */}
              <label className="sr-only" htmlFor="asset-sort">Sort assets</label>
              <select
                id="asset-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as LibrarySort);
                  setVisible(PAGE_SIZE);
                }}
                className="h-9 shrink-0 rounded-lg border border-[var(--line-strong)]/40 bg-[var(--surface-sunken)] px-2.5 text-xs font-medium text-[var(--ink)] outline-none hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A–Z</option>
              </select>

              {/* Select mode */}
              <button
                type="button"
                onClick={toggleSelectMode}
                aria-pressed={selectMode}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
                  selectMode
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-[var(--line-strong)]/40 bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                <span>{selectMode ? "Selecting" : "Select"}</span>
              </button>

              {/* Source Filter Group */}
              <div
                className="flex items-center shrink-0 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-1 gap-1 h-9"
                aria-label="Asset source"
              >
                {SOURCE_VALUES.map((source) => (
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
                    {sourceLabel(source)}
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

        {/* Collections filter + inline create */}
        <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]/50 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Collections">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">
              Collections
            </span>
            <button
              type="button"
              aria-pressed={activeCollectionId === null}
              onClick={() => {
                setActiveCollectionId(null);
                setVisible(PAGE_SIZE);
              }}
              className={`h-6 shrink-0 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                activeCollectionId === null
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              All assets
            </button>
            {collections.map((collection) =>
              renamingId === collection.id ? (
                <form
                  key={collection.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void renameCollection(collection.id);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    aria-label={`Rename collection ${collection.name}`}
                    maxLength={120}
                    autoFocus
                    className="h-6 w-36 rounded-md border border-[var(--accent)] bg-[var(--surface-sunken)] px-2 text-[11px] text-[var(--ink)] outline-none"
                  />
                  <button type="submit" className="h-6 rounded-md bg-[var(--accent)] px-2 text-[11px] font-semibold text-[var(--accent-ink)]">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="h-6 rounded-md px-1.5 text-[11px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <span key={collection.id} className="inline-flex items-center">
                  <button
                    type="button"
                    aria-pressed={activeCollectionId === collection.id}
                    onClick={() => {
                      setActiveCollectionId(collection.id);
                      setVisible(PAGE_SIZE);
                    }}
                    className={`h-6 shrink-0 rounded-l-md border px-2.5 text-[11px] font-medium transition-colors ${
                      activeCollectionId === collection.id
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {collection.name}
                    <span className="ml-1 font-mono text-[10px] opacity-70">
                      {collection.item_count}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename collection ${collection.name}`}
                    onClick={() => {
                      setRenamingId(collection.id);
                      setRenameDraft(collection.name);
                    }}
                    className="flex h-6 w-5 items-center justify-center border-y border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:text-[var(--accent)]"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete collection ${collection.name}`}
                    onClick={() => void deleteCollection(collection)}
                    className="flex h-6 w-5 items-center justify-center rounded-r-md border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </span>
              )
            )}
            <form onSubmit={createCollection} className="ml-1 flex items-center gap-1">
              <input
                type="text"
                value={collectionNameDraft}
                onChange={(e) => setCollectionNameDraft(e.target.value)}
                placeholder="New collection…"
                aria-label="New collection name"
                maxLength={120}
                className="h-6 w-36 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-soft)]/60 outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={!collectionNameDraft.trim()}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 text-[11px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
              >
                <FolderPlus className="h-3 w-3" />
                Create
              </button>
            </form>
          </div>
          {collectionError && (
            <p className="mt-1.5 text-[11px] text-[var(--danger)]" role="alert">
              {collectionError}
            </p>
          )}
        </div>

        {/* Bulk action bar */}
        {selectMode && (
          <div className="mb-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/[0.06] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-[var(--accent)]">
                {selectedKeys.size} selected
              </span>
              <span className="text-[11px] text-[var(--ink-faint)]">
                Bulk add sends at most {BULK_ADD_LIMIT}.
              </span>
              <label className="sr-only" htmlFor="bulk-collection">Target collection</label>
              <select
                id="bulk-collection"
                value={bulkTarget}
                onChange={(e) => setBulkTarget(e.target.value)}
                className="h-7 rounded-md border border-[var(--line-strong)]/40 bg-[var(--surface-sunken)] px-2 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">New collection…</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              {!bulkTarget && (
                <input
                  type="text"
                  value={bulkNewName}
                  onChange={(e) => setBulkNewName(e.target.value)}
                  placeholder="Collection name…"
                  aria-label="New collection name for bulk add"
                  maxLength={120}
                  className="h-7 w-40 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-soft)]/60 outline-none focus:border-[var(--accent)]"
                />
              )}
              <button
                type="button"
                onClick={() => void addSelectedToCollection()}
                disabled={bulkBusy || selectedKeys.size === 0}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[11px] font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Add to collection
              </button>
              {activeCollectionId && (
                <button
                  type="button"
                  onClick={() => void removeSelectedFromCollection()}
                  disabled={bulkBusy || selectedKeys.size === 0}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--danger-line)] bg-[var(--danger-surface)] px-3 text-[11px] font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/20 disabled:opacity-40"
                >
                  Remove from {activeCollection?.name ?? "collection"}
                </button>
              )}
              {selectedKeys.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedKeys(new Set())}
                  className="h-7 rounded-md px-2 text-[11px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  Clear selection
                </button>
              )}
            </div>
            {(bulkMessage || bulkError) && (
              <p
                className={`mt-1.5 text-[11px] ${bulkError ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"}`}
                role={bulkError ? "alert" : "status"}
              >
                {bulkError ?? bulkMessage}
              </p>
            )}
          </div>
        )}

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
      <section className="workspace-bezel mx-auto mt-4 w-full max-w-[1600px] px-5 pb-8 pt-6 sm:px-6" aria-label="Asset results">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-[var(--ink-faint)]">
          <div className="flex items-center gap-2 flex-wrap">
            <p aria-live="polite">
              {loading
                ? "Loading assets…"
                : `Showing ${formatCount(shown.length)} of ${formatCount(filtered.length)} ${
                    tab === "3d" ? "3D assets" : `${tab}${filtered.length === 1 ? "" : "s"}`
                  } from ${formatCount(assets.length)} loaded (latest ${LOADED_LIMIT})`}
            </p>
            {activeCollection && (
              <span className="font-mono text-[11px] text-[var(--accent)]">
                collection: {activeCollection.name}
              </span>
            )}
            {selectedTags.length > 0 && (
              <span className="font-mono text-[11px] text-[var(--accent)]">
                filtered by: {selectedTags.map((t) => `#${t}`).join(", ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeCollectionId && (
              <button
                type="button"
                onClick={() => setActiveCollectionId(null)}
                className="workspace-action-quiet min-h-9 px-2 text-xs"
              >
                Clear collection
              </button>
            )}
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
            <p className="mt-1.5 text-sm text-[var(--ink-faint)]">Check your studio connection, then retry.</p>
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
          activeCollectionId && query === "" && selectedTags.length === 0 ? (
            <div className="workspace-empty flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-[var(--ink-soft)]">
                Nothing from this page is in the collection yet.
              </p>
              <button
                type="button"
                onClick={() => setActiveCollectionId(null)}
                className="workspace-action-secondary mt-4 px-3 py-2 text-xs"
              >
                Show all assets
              </button>
            </div>
          ) : query ? (
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
              selectable={selectMode}
              selectedKeys={selectedKeys}
              onToggleSelect={(asset) => toggleSelected(asset.key)}
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
      <AssetDetailOverlay
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
        </div>
        <WorkspaceFooter containerClassName="max-w-[1600px]" />
      </main>
    </ProtectedRoute>
  );
}
