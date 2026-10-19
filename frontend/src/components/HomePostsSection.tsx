"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Clock,
  Filter,
  Grid,
  Layers,
  Ratio,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { AssetRecord, GalleryItem } from "@/lib/api";
import AssetCardList from "@/components/AssetCardList";

export type PostSortMode = "explore" | "trending" | "latest";

export const POST_CATEGORY_PILLS = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "character", label: "Character" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "illustration", label: "Illustration" },
  { id: "sci-fi", label: "Sci-Fi" },
  { id: "visual-design", label: "Visual Design" },
  { id: "space-design", label: "Space Design" },
  { id: "game-design", label: "Game Design" },
];

export type AspectFilter = "all" | "1:1" | "3:4" | "16:9" | "9:16";
export type TimeFilter = "all" | "today" | "week" | "month";
export type OriginFilter = "all" | "workspace" | "tool";

interface HomePostsSectionProps {
  assets: AssetRecord[];
  loading?: boolean;
  onOpenAsset: (asset: AssetRecord | GalleryItem) => void;
}

export default function HomePostsSection({
  assets,
  loading = false,
  onOpenAsset,
}: HomePostsSectionProps) {
  // Sort Mode & Dropdown
  const [sortMode, setSortMode] = useState<PostSortMode>("explore");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Category Pill
  const [activeCategory, setActiveCategory] = useState("all");

  // Advanced Filters Drawer
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeFilterCount =
    (aspectFilter !== "all" ? 1 : 0) +
    (timeFilter !== "all" ? 1 : 0) +
    (originFilter !== "all" ? 1 : 0);

  const resetAdvancedFilters = () => {
    setAspectFilter("all");
    setTimeFilter("all");
    setOriginFilter("all");
  };

  // Filter & Sort Logic
  const filteredAssets = useMemo(() => {
    let result = assets;

    // 1. Category Pill Filter
    if (activeCategory !== "all") {
      const cat = activeCategory.toLowerCase();
      result = result.filter((item) => {
        if (cat === "video") {
          return item.type === "video" || (item.key || "").match(/\.(mp4|webm|mov)$/i);
        }
        const prompt = (item.metadata?.prompt || "").toLowerCase();
        const modelTitle = (item.metadata?.model_title || "").toLowerCase();
        const tags = (item.metadata?.tags || []).map((t) => t.toLowerCase());

        if (cat === "visual-design") {
          return prompt.includes("design") || prompt.includes("graphic") || prompt.includes("logo") || tags.some(t => t.includes("design"));
        }
        if (cat === "space-design") {
          return prompt.includes("architecture") || prompt.includes("interior") || prompt.includes("room") || prompt.includes("space") || tags.some(t => t.includes("space") || t.includes("arch"));
        }
        if (cat === "game-design") {
          return prompt.includes("game") || prompt.includes("concept") || prompt.includes("rpg") || tags.some(t => t.includes("game"));
        }

        const keyword = cat.replace("-", " ");
        return (
          prompt.includes(keyword) ||
          modelTitle.includes(keyword) ||
          tags.some((t) => t.includes(keyword))
        );
      });
    }

    // 2. Aspect Ratio Filter
    if (aspectFilter !== "all") {
      result = result.filter((item) => {
        const fmt = item.metadata?.format_name;
        if (fmt === aspectFilter) return true;
        const w = item.metadata?.width;
        const h = item.metadata?.height;
        if (!w || !h) return false;
        const ratio = w / h;
        if (aspectFilter === "1:1") return Math.abs(ratio - 1) < 0.1;
        if (aspectFilter === "3:4") return Math.abs(ratio - 0.75) < 0.15;
        if (aspectFilter === "16:9") return Math.abs(ratio - 1.77) < 0.2;
        if (aspectFilter === "9:16") return Math.abs(ratio - 0.56) < 0.15;
        return true;
      });
    }

    // 3. Time Filter
    if (timeFilter !== "all") {
      const now = Date.now();
      const cutoff =
        timeFilter === "today"
          ? 24 * 3600 * 1000
          : timeFilter === "week"
          ? 7 * 24 * 3600 * 1000
          : 30 * 24 * 3600 * 1000;

      result = result.filter((item) => {
        const dateStr = item.last_modified || item.metadata?.created_at;
        if (!dateStr) return true;
        const time = new Date(dateStr).getTime();
        return now - time <= cutoff;
      });
    }

    // 4. Origin Filter
    if (originFilter !== "all") {
      result = result.filter((item) => {
        const source = item.metadata?.source || item.metadata?.origin;
        if (originFilter === "workspace") return source === "workspace" || !source;
        if (originFilter === "tool") return source === "tool" || source === "ai_tool_studio";
        return true;
      });
    }

    // 5. Sort Mode
    if (sortMode === "latest") {
      return [...result].sort((a, b) => {
        const tA = new Date(a.last_modified || a.metadata?.created_at || 0).getTime();
        const tB = new Date(b.last_modified || b.metadata?.created_at || 0).getTime();
        return tB - tA;
      });
    }

    if (sortMode === "trending") {
      // Deterministic pseudorandom score based on key hash
      return [...result].sort((a, b) => {
        let hA = 0;
        let hB = 0;
        for (let i = 0; i < (a.key || "").length; i++) hA = (hA * 31 + a.key.charCodeAt(i)) | 0;
        for (let i = 0; i < (b.key || "").length; i++) hB = (hB * 31 + b.key.charCodeAt(i)) | 0;
        return (Math.abs(hB) % 1000) - (Math.abs(hA) % 1000);
      });
    }

    // 'explore' balanced default
    return result;
  }, [assets, activeCategory, aspectFilter, timeFilter, originFilter, sortMode]);

  const sortLabels: Record<PostSortMode, string> = {
    explore: "Explore",
    trending: "Trending",
    latest: "Latest",
  };

  return (
    <section className="space-y-4" aria-labelledby="home-posts-heading">
      {/* Header with Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
          {/* Left: Title + Explore Dropdown */}
          <div className="flex items-center gap-3">
            <h2
              id="home-posts-heading"
              className="font-heading text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]"
            >
              Posts
            </h2>

            {/* Explore Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1.5 font-sans text-xs font-semibold text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all"
              >
                <span>{sortLabels[sortMode]}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-[var(--ink-soft)] transition-transform duration-200 ${
                    sortDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {sortDropdownOpen && (
                <div className="absolute left-0 top-full z-30 mt-1.5 w-36 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in-50 zoom-in-95">
                  {(["explore", "trending", "latest"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setSortMode(mode);
                        setSortDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        sortMode === mode
                          ? "bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
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

          {/* Right: Filters Toggle Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                filtersOpen || activeFilterCount > 0
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-[var(--accent-ink)]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Center: Category Filter Pills Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
          {POST_CATEGORY_PILLS.map((pill) => {
            const isActive = activeCategory === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setActiveCategory(pill.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                    : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Advanced Filters Expandable Drawer */}
        {filtersOpen && (
          <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 p-4 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Aspect Ratio Filter */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--ink-faint)] mb-2">
                  <Ratio className="h-3 w-3 text-[var(--accent)]" />
                  Aspect Ratio
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "all", label: "All" },
                      { id: "1:1", label: "Square 1:1" },
                      { id: "3:4", label: "Portrait 3:4" },
                      { id: "16:9", label: "Landscape 16:9" },
                      { id: "9:16", label: "Story 9:16" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAspectFilter(opt.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        aspectFilter === opt.id
                          ? "bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
                          : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Range Filter */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--ink-faint)] mb-2">
                  <Clock className="h-3 w-3 text-cyan-400" />
                  Time Range
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "all", label: "All Time" },
                      { id: "today", label: "Today" },
                      { id: "week", label: "This Week" },
                      { id: "month", label: "This Month" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTimeFilter(opt.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        timeFilter === opt.id
                          ? "bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
                          : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Origin / Source Filter */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--ink-faint)] mb-2">
                  <Layers className="h-3 w-3 text-amber-400" />
                  Creation Source
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "all", label: "All Sources" },
                      { id: "workspace", label: "Studio Canvas" },
                      { id: "tool", label: "AI Tool Studio" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOriginFilter(opt.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        originFilter === opt.id
                          ? "bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
                          : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            {activeFilterCount > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--line)] flex items-center justify-between">
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  {activeFilterCount} active filters matching {filteredAssets.length} creations
                </span>
                <button
                  type="button"
                  onClick={resetAdvancedFilters}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--danger)] hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset filters</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Masonry Fluid Grid (4-6 Columns) */}
      {filteredAssets.length > 0 || loading ? (
        <AssetCardList
          items={filteredAssets}
          loading={loading}
          skeletonCount={16}
          aspectRatio="natural"
          onOpen={onOpenAsset}
        />
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/40 p-12 text-center">
          <Sparkles className="mx-auto h-9 w-9 text-[var(--ink-faint)] opacity-50" />
          <h4 className="mt-3 text-base font-semibold text-[var(--ink)]">
            No creations match your filter criteria
          </h4>
          <p className="mt-1 text-xs text-[var(--ink-soft)] max-w-sm mx-auto">
            Try adjusting your category pill or reset advanced filters to see more community works.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveCategory("all");
                resetAdvancedFilters();
              }}
              className="workspace-action-secondary px-4 py-2 text-xs font-semibold"
            >
              Clear all filters
            </button>
            <Link
              href="/generate"
              className="workspace-action-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Create something</span>
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
