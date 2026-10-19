"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Box,
  Check,
  ChevronDown,
  Clock,
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
import CustomSelect from "@/components/CustomSelect";

import type { CreatorModelType } from "@/lib/api";

type ModelTypeFilter = "all" | CreatorModelType;
type SortOption = "latest" | "samples" | "title";

const TYPE_FILTERS: Array<{ value: ModelTypeFilter; label: string }> = [
  { value: "all", label: "All Types" },
  { value: "Checkpoint", label: "Checkpoint" },
  { value: "Hyper Network", label: "Hyper Network" },
  { value: "Embedding", label: "Embedding" },
  { value: "Aesthetic Gradient", label: "Aesthetic Gradient" },
  { value: "LoRA", label: "LoRA" },
  { value: "LoKr", label: "LoKr" },
  { value: "LoCon", label: "LoCon" },
  { value: "ControlNet", label: "ControlNet" },
  { value: "Poses", label: "Poses" },
  { value: "Wildcards", label: "Wildcards" },
  { value: "LyCORIS", label: "LyCORIS" },
  { value: "SVD", label: "SVD" },
  { value: "Motion LoRA", label: "Motion LoRA" },
  { value: "VAE", label: "VAE" },
  { value: "DoRA", label: "DoRA" },
  { value: "StyleModel", label: "StyleModel" },
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

const SORT_OPTIONS = [
  { value: "latest", label: "Recently Published" },
  { value: "samples", label: "Most Showcase Samples" },
  { value: "title", label: "Name (A-Z)" },
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
  const [createdBanner, setCreatedBanner] = useState<{ id: string; title: string } | null>(null);

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
        {/* Model Submission Pending Review Alert */}
        {createdBanner && (
          <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
              <div>
                <p className="font-bold text-amber-300">
                  Model &ldquo;{createdBanner.title}&rdquo; Submitted for Moderator Review
                </p>
                <p className="text-[11px] text-amber-200/80">
                  Your model has been submitted to the moderation queue. It will appear in this public gallery once approved by a moderator.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/models/${createdBanner.id}`}
                className="rounded border border-amber-500/50 bg-amber-500/20 px-3 py-1 font-mono text-[10px] font-bold text-amber-100 hover:bg-amber-500/30 transition-colors"
              >
                View Model &rarr;
              </Link>
              <button
                type="button"
                onClick={() => setCreatedBanner(null)}
                className="rounded p-1 text-amber-400/70 hover:text-amber-200 transition-colors"
                aria-label="Dismiss banner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Command Bar Toolbar: Search + Base Model + Sort + Publish CTA */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]/70 backdrop-blur-md p-2.5 shadow-sm mb-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[260px] max-w-xl group">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)] group-focus-within:text-[var(--accent)] transition-colors duration-150" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models, tags, trigger words, architectures..."
                aria-label="Search creator models"
                className="h-9 w-full rounded-lg border border-[var(--line-strong)]/40 bg-[var(--surface-sunken)] pl-9 pr-14 text-xs font-normal text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-all duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 focus:bg-[var(--surface-raised)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear model search"
                  className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors text-xs"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-faint)] group-focus-within:opacity-0 transition-opacity select-none">
                  /
                </kbd>
              )}
            </div>

            {/* Selects & Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <CustomSelect
                value={baseModelFilter}
                onChange={setBaseModelFilter}
                options={BASE_MODEL_FILTERS}
                ariaLabel="Filter by Base Model"
                icon={<Layers className="h-3.5 w-3.5 text-[var(--ink-faint)]" />}
                buttonClassName="h-9 rounded-lg font-medium text-xs text-[var(--ink)]"
              />

              <CustomSelect
                value={sortBy}
                onChange={(val) => setSortBy(val as SortOption)}
                options={SORT_OPTIONS}
                ariaLabel="Sort models"
                icon={<ArrowUpDown className="h-3.5 w-3.5 text-[var(--ink-faint)]" />}
                buttonClassName="h-9 rounded-lg font-medium text-xs text-[var(--ink)]"
              />

              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] hover:brightness-105 active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Publish Model</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills Sub-Row: Types + Categories + Reset */}
        <div className="flex items-center justify-between gap-3 overflow-x-auto w-full py-1.5 no-scrollbar mb-2">
          <div className="flex items-center gap-1.5">
            {TYPE_FILTERS.map((tf) => {
              const active = typeFilter === tf.value;
              return (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTypeFilter(tf.value)}
                  className={`min-h-6 shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm"
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
                  className={`capitalize min-h-6 shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] font-semibold shadow-sm"
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
              className="workspace-action-quiet min-h-6 shrink-0 whitespace-nowrap px-2 text-[11px] font-medium text-[var(--danger)] hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>
        {/* Count Bar */}
        <div className="mb-4 flex items-center justify-between text-xs text-[var(--ink-faint)]">
          <p>
            {loading ? (
              "Loading models..."
            ) : (
              <>
                Showing{" "}
                <span className="font-mono text-[var(--ink)]">
                  {filteredItems.length}
                </span>{" "}
                of{" "}
                <span className="font-mono text-[var(--ink)]">
                  {items.length}
                </span>{" "}
                creator model{items.length === 1 ? "" : "s"}
              </>
            )}
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
        onCreated={(model) => {
          load();
          if (model?.title) {
            setCreatedBanner({
              id: model.model_id,
              title: model.title,
            });
          }
        }}
      />
    </main>
  );
}
