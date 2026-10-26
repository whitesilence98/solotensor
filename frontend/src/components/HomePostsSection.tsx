"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { AssetRecord, GalleryItem } from "@/lib/api";
import AssetCardList from "@/components/AssetCardList";
import PostFilterPanel from "@/components/PostFilterPanel";
import PostFilterChips from "@/components/PostFilterChips";
import {
  POST_CATEGORY_PILLS,
  applyPostFilters,
  computePostFacetCounts,
  countActivePostFilters,
  createDefaultPostFilters,
  getActivePostFilterDescriptors,
  hasActivePostFilters,
  removeActivePostFilter,
  togglePostFilterValue,
  type PostFilterDescriptor,
  type PostFilters,
} from "@/lib/postFilters";

export type PostSortMode = "explore" | "trending" | "latest";

// Public surface retained for callers importing the taxonomy from this module.
export { POST_CATEGORY_PILLS };

interface HomePostsSectionProps {
  assets: AssetRecord[];
  loading?: boolean;
  onOpenAsset: (asset: AssetRecord | GalleryItem) => void;
}

const SEARCH_DEBOUNCE_MS = 200;

function trendingScore(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % 1000;
}

function sortPosts(assets: AssetRecord[], mode: PostSortMode): AssetRecord[] {
  if (mode === "latest") {
    return [...assets].sort((a, b) => {
      const timeA = new Date(a.last_modified || a.metadata?.created_at || 0).getTime();
      const timeB = new Date(b.last_modified || b.metadata?.created_at || 0).getTime();
      return timeB - timeA;
    });
  }

  if (mode === "trending") {
    // Deterministic pseudorandom score based on key hash — no invented engagement.
    return [...assets].sort(
      (a, b) => trendingScore(b.key || "") - trendingScore(a.key || "")
    );
  }

  return assets;
}

export default function HomePostsSection({
  assets,
  loading = false,
  onOpenAsset,
}: HomePostsSectionProps) {
  const [sortMode, setSortMode] = useState<PostSortMode>("explore");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState<PostFilters>(createDefaultPostFilters);
  const [searchDraft, setSearchDraft] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const resetFilters = useCallback(() => {
    setSearchDraft("");
    setFilters(createDefaultPostFilters());
  }, []);

  // Debounce the search field into the filter state.
  useEffect(() => {
    if (searchDraft === filters.query) return;
    const handle = window.setTimeout(() => {
      setFilters((current) =>
        current.query === searchDraft ? current : { ...current, query: searchDraft }
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchDraft, filters.query]);

  // Close the sort menu on outside click.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // "/" opens the panel and focuses search, like the assets page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active?.isContentEditable) {
        return;
      }
      event.preventDefault();
      setFiltersOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ESC closes the sort dropdown when the panel is not open.
  useEffect(() => {
    if (!sortDropdownOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortDropdownOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sortDropdownOpen]);

  const facetCounts = useMemo(
    () => computePostFacetCounts(assets, filters),
    [assets, filters]
  );

  const filteredAssets = useMemo(
    () => sortPosts(applyPostFilters(assets, filters), sortMode),
    [assets, filters, sortMode]
  );

  const activeFilterCount = countActivePostFilters(filters);
  const filtersEngaged = hasActivePostFilters(filters);
  const activeCategoryCount = filters.categories.length;
  const activeDescriptors = useMemo(
    () => getActivePostFilterDescriptors(filters),
    [filters]
  );

  // The search field is the sole writer of the draft; the debounce above is
  // the sole bridge into `filters.query`. Facet toggles therefore only update
  // their own slice and never clobber an in-flight keystroke.
  const handleFiltersChange = useCallback((next: PostFilters) => {
    setFilters(next);
  }, []);

  const handleRemoveChip = useCallback((descriptor: PostFilterDescriptor) => {
    if (descriptor.facet === "query") setSearchDraft("");
    setFilters((current) => removeActivePostFilter(current, descriptor));
  }, []);

  const handleCategoryPill = useCallback((id: string) => {
    setFilters((current) =>
      id === "all"
        ? { ...current, categories: [] }
        : { ...current, categories: togglePostFilterValue(current.categories, id) }
    );
  }, []);

  const sortLabels: Record<PostSortMode, string> = {
    explore: "Explore",
    trending: "Trending",
    latest: "Latest",
  };

  return (
    <section className="space-y-4" aria-labelledby="home-posts-heading">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-3">
            <h2
              id="home-posts-heading"
              className="font-heading text-lg font-bold tracking-tight text-[var(--ink)] sm:text-xl"
            >
              Posts
            </h2>

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setSortDropdownOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={sortDropdownOpen}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1.5 font-sans text-xs font-semibold text-[var(--ink)] transition-colors duration-150 hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none"
              >
                <span>{sortLabels[sortMode]}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-[var(--ink-soft)] transition-transform duration-200 motion-reduce:transition-none ${
                    sortDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {sortDropdownOpen && (
                <div
                  role="menu"
                  aria-label="Sort posts"
                  className="absolute left-0 top-full z-30 mt-1.5 w-36 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1.5 shadow-2xl"
                >
                  {(["explore", "trending", "latest"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortMode === mode}
                      onClick={() => {
                        setSortMode(mode);
                        setSortDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                        sortMode === mode
                          ? "bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
                          : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <span>{sortLabels[mode]}</span>
                      {sortMode === mode && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                filtersEngaged
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--accent-ink)]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Category quick-access — same engine, same counts */}
        <div
          className="flex flex-wrap items-center gap-2 pb-1 text-xs"
          role="group"
          aria-label="Filter posts by category"
        >
          {POST_CATEGORY_PILLS.map((pill) => {
            const isActive =
              pill.id === "all"
                ? activeCategoryCount === 0
                : filters.categories.includes(pill.id);
            const count = facetCounts.categories[pill.id] ?? 0;
            const dimmed = count === 0 && !isActive;
            return (
              <button
                key={pill.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleCategoryPill(pill.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isActive
                    ? "bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                    : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                } ${dimmed ? "opacity-40" : ""}`}
              >
                <span>{pill.label}</span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    isActive ? "text-[var(--accent-ink)]/70" : "text-[var(--ink-faint)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <PostFilterChips
          filters={filters}
          onRemove={handleRemoveChip}
          onClearAll={resetFilters}
        />
      </div>

      {/* Grid */}
      {filteredAssets.length > 0 || loading ? (
        <>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]" aria-live="polite">
            {loading
              ? "Loading creations"
              : `${filteredAssets.length} ${filteredAssets.length === 1 ? "creation" : "creations"}${
                  filtersEngaged ? ` of ${assets.length}` : ""
                }`}
          </p>
          <AssetCardList
            items={filteredAssets}
            loading={loading}
            skeletonCount={16}
            aspectRatio="natural"
            onOpen={onOpenAsset}
          />
        </>
      ) : filtersEngaged ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]/40 p-10 text-center">
          <SearchX className="mx-auto h-8 w-8 text-[var(--ink-faint)]" />
          <h3 className="mt-3 text-base font-semibold text-[var(--ink)]">
            No creations match these filters
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--ink-soft)]">
            {activeFilterCount === 1
              ? "One filter is narrowing your collection."
              : `${activeFilterCount} filters are narrowing your collection.`}{" "}
            Clear them to see your full history.
          </p>
          <ul className="mx-auto mt-3 flex max-w-md flex-wrap items-center justify-center gap-1.5">
            {activeDescriptors.slice(0, 5).map((descriptor) => (
              <li
                key={descriptor.id}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]"
              >
                {descriptor.prefix ? (
                  <span className="text-[var(--ink-faint)]">{descriptor.prefix}:</span>
                ) : null}
                <span className="max-w-[12rem] truncate text-[var(--ink)]">
                  {descriptor.label}
                </span>
              </li>
            ))}
            {activeDescriptors.length > 5 && (
              <li className="font-mono text-[10px] text-[var(--ink-faint)]">
                +{activeDescriptors.length - 5} more
              </li>
            )}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={resetFilters}
              className="workspace-action-secondary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear all filters</span>
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="workspace-action-quiet px-3 py-2 text-xs font-semibold"
            >
              Adjust filters
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]/40 p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[var(--accent)] opacity-70" />
          <h3 className="mt-3 text-base font-semibold text-[var(--ink)]">
            Your first creation goes here
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--ink-soft)]">
            The Posts feed gathers every render you save locally. Open the canvas,
            write a prompt, and your output lands here with its full metadata.
          </p>
          <Link
            href="/generate"
            className="workspace-action-primary mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span>Open the canvas</span>
          </Link>
        </div>
      )}

      <PostFilterPanel
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        facetCounts={facetCounts}
        totalMatching={filteredAssets.length}
        totalAssets={assets.length}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onReset={resetFilters}
      />
    </section>
  );
}
