"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Box,
  Check,
  ChevronDown,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { api, resolveMediaUrl, type PublicModelSummary } from "@/lib/api";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import TensorModelCard, { ModelCardSkeleton } from "@/components/TensorModelCard";
import CreateModelDrawer from "@/components/CreateModelDrawer";

type ModelTypeFilter = "all" | "Checkpoint" | "LoRA" | "Diffusion Model";
type SortOption = "latest" | "samples" | "title";

const TYPE_FILTERS: Array<{ value: ModelTypeFilter; label: string }> = [
  { value: "all", label: "All Types" },
  { value: "Checkpoint", label: "Checkpoints" },
  { value: "LoRA", label: "LoRAs" },
  { value: "Diffusion Model", label: "Diffusion" },
];

const CATEGORY_FILTERS = [
  "all",
  "Character",
  "Style",
  "Concept",
  "Clothing",
  "Pose",
  "General",
];

const BASE_MODEL_FILTERS = [
  { value: "all", label: "All Base Models" },
  { value: "sdxl", label: "SDXL" },
  { value: "flux", label: "FLUX.1" },
  { value: "z-image", label: "Z-Image" },
  { value: "sd1.5", label: "SD 1.5" },
];

export default function ModelsPage() {
  const [items, setItems] = useState<PublicModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ModelTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [baseModelFilter, setBaseModelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("latest");
  const [studioOpen, setStudioOpen] = useState(false);

  const load = (searchVal = query) => {
    setLoading(true);
    setError(null);
    api
      .listPublicModels(searchVal)
      .then((res) => setItems(res.items || []))
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Could not load models",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let initialQuery = "";
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      initialQuery = search.get("q") || "";
      if (initialQuery) {
        setQuery(initialQuery);
      }
      if (search.get("create") === "true") {
        setStudioOpen(true);
      }
    }
    load(initialQuery);
  }, []);

  // Filtered & sorted models
  const filteredItems = useMemo(() => {
    let result = items.slice();

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((item) => item.model_type === typeFilter);
    }

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter(
        (item) => item.category.toLowerCase() === categoryFilter.toLowerCase(),
      );
    }

    // Base model filter
    if (baseModelFilter !== "all") {
      result = result.filter((item) => {
        const base = (item.base_model || "").toLowerCase();
        if (baseModelFilter === "sdxl")
          return base.includes("sdxl") || base.includes("xl");
        if (baseModelFilter === "flux") return base.includes("flux");
        if (baseModelFilter === "z-image")
          return base.includes("z-image") || base.includes("turbo");
        if (baseModelFilter === "sd1.5")
          return base.includes("1.5") || base.includes("sd1.5");
        return true;
      });
    }

    // Search query
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.base_model.toLowerCase().includes(q) ||
          item.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "samples") return b.sample_count - a.sample_count;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return (
        new Date(b.published_at || b.updated_at).getTime() -
        new Date(a.published_at || a.updated_at).getTime()
      );
    });

    return result;
  }, [items, typeFilter, categoryFilter, baseModelFilter, query, sortBy]);

  const hasActiveFilters =
    query.trim() !== "" ||
    typeFilter !== "all" ||
    categoryFilter !== "all" ||
    baseModelFilter !== "all";

  const clearAllFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setBaseModelFilter("all");
  };

  return (
    <main
      id="main-content"
      className="workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)]"
    >
      {/* 1. Main Content Grid & Integrated Controls */}
      <section className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Integrated In-Grid Toolbar: Search + Base Model + Sort + Publish CTA */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
          {/* Search Input */}
          <div className="relative flex-1 max-w-lg">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models, tags, trigger words, architectures…"
              aria-label="Search creator models"
              className="workspace-field h-7.5 w-full pl-8 pr-14 text-xs placeholder:text-[var(--ink-faint)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear model search"
                className="workspace-action-quiet absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-xs"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Selects & Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={baseModelFilter}
              onChange={(e) => setBaseModelFilter(e.target.value)}
              aria-label="Filter by Base Model"
              className="h-7.5 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-[11px] text-[var(--ink)] outline-none transition hover:border-[var(--line-strong)] focus:border-[var(--accent)]"
            >
              {BASE_MODEL_FILTERS.map((bf) => (
                <option key={bf.value} value={bf.value}>
                  {bf.label}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort models"
              className="h-7.5 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-[11px] text-[var(--ink)] outline-none transition hover:border-[var(--line-strong)] focus:border-[var(--accent)]"
            >
              <option value="latest">Recently Published</option>
              <option value="samples">Most Showcase Samples</option>
              <option value="title">Name (A–Z)</option>
            </select>

            <button
              type="button"
              onClick={() => setStudioOpen(true)}
              className="inline-flex h-7.5 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Publish Model ⚡</span>
            </button>
          </div>
        </div>

        {/* Filter Pills Sub-Row: Types + Categories + Reset */}
        <div className="flex items-center justify-between gap-3 overflow-x-auto w-full py-2.5 no-scrollbar">
          <div className="flex items-center gap-1.5">
            {TYPE_FILTERS.map((tf) => {
              const active = typeFilter === tf.value;
              return (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTypeFilter(tf.value)}
                  className={`min-h-5 shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase font-semibold transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}

            <span className="mx-1 h-3.5 w-px bg-[var(--line)]" />

            {/* Category Pills */}
            {CATEGORY_FILTERS.map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`capitalize min-h-5 shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] font-bold shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                  }`}
                >
                  {cat === "all" ? "All Categories" : cat}
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="workspace-action-quiet min-h-5 shrink-0 whitespace-nowrap px-1.5 text-[9px] font-mono text-[var(--danger)] hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>
        {/* Count Bar */}
        <div className="mb-4 flex items-center justify-between text-xs text-[var(--ink-faint)]">
          <p>
            {loading
              ? "Loading models…"
              : `Showing ${filteredItems.length} of ${items.length} creator model${
                  items.length === 1 ? "" : "s"
                }`}
          </p>
        </div>

        {/* Loading Shimmer State (1:1 Layout Parity) */}
        {loading && (
          <div
            className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 sm:gap-4"
            aria-label="Loading models"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i, idx) => (
              <ModelCardSkeleton key={i} index={idx} />
            ))}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div
            role="alert"
            className="rounded-[var(--radius-panel)] border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center text-sm text-[var(--danger)]"
          >
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-panel)] border border-[var(--danger-line)] px-4 py-2 text-xs font-bold transition hover:bg-[var(--danger-line)]/50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredItems.length === 0 && (
          <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)] p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-panel)] bg-[var(--surface-soft)] text-[var(--accent)] mb-3">
              <Box className="h-7 w-7 opacity-70" />
            </div>
            <h3 className="text-base font-bold text-[var(--ink)]">
              {hasActiveFilters
                ? "No matching creator models"
                : "No published creator models yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--ink-faint)]">
              {hasActiveFilters
                ? "Try widening your search terms, changing the base model, or resetting the filter pills."
                : "Import or publish your checkpoints and LoRAs to showcase them here."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 rounded-[var(--radius-panel)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition"
              >
                Clear all filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="mt-4 inline-block rounded-[var(--radius-panel)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition"
              >
                Publish First Model
              </button>
            )}
          </div>
        )}

        {/* Tensor.art Card Grid with smooth cross-fade */}
        {!loading && !error && filteredItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 sm:gap-4 animate-in fade-in duration-300 ease-out">
            {filteredItems.map((item, idx) => (
              <TensorModelCard key={item.model_id} item={item} index={idx} />
            ))}
          </div>
        )}
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <WorkspaceFooter />
      </div>

      <CreateModelDrawer
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onCreated={() => {
          load();
        }}
      />
    </main>
  );
}
