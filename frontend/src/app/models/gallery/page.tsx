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

/**
 * Creator-model gallery card.
 */
function TensorModelCard({ item }: { item: PublicModelSummary }) {
  const [imgError, setImgError] = useState(false);
  const coverUrl = resolveMediaUrl(item.cover_url);

  // Type badge styling
  const typeBadgeStyle = useMemo(() => {
    switch (item.model_type) {
      case "LoRA":
        return "bg-[var(--surface)]/90 text-[var(--accent)] border-[var(--accent)]/30";
      case "Checkpoint":
        return "bg-[var(--surface)]/90 text-[var(--accent)] border-[var(--accent)]/30";
      case "Diffusion Model":
        return "bg-[var(--surface)]/90 text-[var(--accent)] border-[var(--accent)]/30";
      default:
        return "bg-[var(--surface)]/90 text-[var(--ink)] border-[var(--line)]";
    }
  }, [item.model_type]);

  // Derive short base model name
  const shortBase = useMemo(() => {
    const raw = item.base_model || "";
    const lower = raw.toLowerCase();
    if (lower.includes("sdxl") || lower.includes("stable diffusion xl"))
      return "SDXL";
    if (lower.includes("flux")) return "FLUX.1";
    if (lower.includes("z-image") || lower.includes("turbo")) return "Z-Image";
    if (lower.includes("sd 1.5") || lower.includes("sd1.5")) return "SD 1.5";
    return raw.split(" ")[0] || "Custom";
  }, [item.base_model]);

  return (
    <Link
      href={`/models/gallery/${item.model_id}`}
      className="group relative flex aspect-[3/4] w-full flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] transition-all duration-300 ease-out"
    >
      {/* Full-Bleed Media */}
      {coverUrl && !imgError ? (
        <img
          src={coverUrl}
          alt={item.title}
          loading="lazy"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid h-full w-full place-items-center bg-[var(--surface-soft)] p-4 text-center">
          <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              {item.model_type === "LoRA" ? (
                <Layers className="h-6 w-6 opacity-80" />
              ) : (
                <Box className="h-6 w-6 opacity-80" />
              )}
            </div>
            <span className="line-clamp-2 text-xs font-semibold text-[var(--ink-faint)]">
              {item.title}
            </span>
          </div>
        </div>
      )}

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 via-50% to-transparent transition-opacity duration-300 ease-out group-hover:opacity-0" />

      {/* Floating Top Badges */}
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between pointer-events-none">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${typeBadgeStyle}`}
        >
          {item.model_type}
        </span>
        <span className="inline-flex items-center rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-md">
          {shortBase}
        </span>
      </div>

      {/* Bottom Typography Overlay */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5">
        <h3
          className="truncate text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-sm transition-colors group-hover:text-[var(--accent)]"
          title={item.title}
        >
          {item.title}
        </h3>
        <p className="mt-0.5 truncate text-xs sm:text-sm font-medium text-white/75 drop-shadow-sm">
          {item.category} • {shortBase} {item.sample_count > 0 ? `• ${item.sample_count} samples` : ""}
        </p>
      </div>
    </Link>
  );
}

export default function ModelGalleryPage() {
  const [items, setItems] = useState<PublicModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ModelTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [baseModelFilter, setBaseModelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("latest");

  const load = (searchVal = query) => {
    setLoading(true);
    setError(null);
    api
      .listPublicModels(searchVal)
      .then((res) => setItems(res.items || []))
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Could not load model gallery",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load("");
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
      {/* 1. Page Header (Tensor.art Marketplace Style) */}
      <header className="workspace-command top-0 z-20 mx-2 mt-2 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_88%,transparent)] backdrop-blur-xl sm:mx-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="workspace-kicker">Community catalog</p>
              <h1 className="workspace-heading mt-1 text-3xl font-semibold tracking-tighter sm:text-4xl">
                Explore creator models
              </h1>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">Discover checkpoints and LoRAs for your next render.</p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2.5">
              <Link
                href="/models"
                className="inline-flex items-center gap-2 rounded-[var(--radius-panel)] bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--accent-ink)] transition duration-200 hover:bg-[var(--accent-hover)] active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>Publish Model</span>
              </Link>
            </div>
          </div>

          {/* Search Bar + Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models, tags, trigger words, architectures…"
                aria-label="Search creator models"
                className="workspace-field h-11 w-full pl-10 pr-10 text-sm placeholder:text-[var(--ink-faint)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear model search"
                  className="workspace-action-quiet absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Base Model Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={baseModelFilter}
                onChange={(e) => setBaseModelFilter(e.target.value)}
                aria-label="Filter by Base Model"
                className="h-10 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] outline-none transition hover:border-[var(--line-strong)] focus:border-[var(--accent)]"
              >
                {BASE_MODEL_FILTERS.map((bf) => (
                  <option key={bf.value} value={bf.value}>
                    {bf.label}
                  </option>
                ))}
              </select>

              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="Sort models"
                className="h-10 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] outline-none transition hover:border-[var(--line-strong)] focus:border-[var(--accent)]"
              >
                <option value="latest">Recently Published</option>
                <option value="samples">Most Showcase Samples</option>
                <option value="title">Name (A–Z)</option>
              </select>
            </div>
          </div>

          {/* Type Filter Pills Row */}
          <div className="flex items-center justify-between gap-3 overflow-x-auto workspace-scroll-x pt-1">
            <div className="flex items-center gap-1.5">
              {TYPE_FILTERS.map((tf) => {
                const active = typeFilter === tf.value;
                return (
                  <button
                    key={tf.value}
                    type="button"
                    onClick={() => setTypeFilter(tf.value)}
                    className={`whitespace-nowrap rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] "
                        : "bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}

              <span className="mx-1 h-4 w-px bg-[var(--line)]" />

              {/* Category Pills */}
              {CATEGORY_FILTERS.map((cat) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`capitalize whitespace-nowrap rounded-[var(--radius-control)] px-2.5 py-1 text-[11px] font-semibold transition ${
                      active
                        ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[var(--accent)]/30 font-bold"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
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
                className="whitespace-nowrap text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Content Grid */}
      <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
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

        {/* Loading Shimmer State */}
        {loading && (
          <div
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            aria-label="Loading models"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div
                key={i}
                className="shimmer aspect-[3/4] w-full rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"
              />
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
                : "Import or publish your checkpoints and LoRAs in the Creator Studio to showcase them here."}
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
              <Link
                href="/models"
                className="mt-4 inline-block rounded-[var(--radius-panel)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition"
              >
                Go to Creator Studio
              </Link>
            )}
          </div>
        )}

        {/* Tensor.art Card Grid */}
        {!loading && !error && filteredItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 sm:gap-4">
            {filteredItems.map((item) => (
              <TensorModelCard key={item.model_id} item={item} />
            ))}
          </div>
        )}
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <WorkspaceFooter />
      </div>
    </main>
  );
}
