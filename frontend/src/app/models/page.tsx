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
  HardDrive,
  Layers,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { api, resolveMediaUrl, type PublicModelSummary } from "@/lib/api";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import TensorModelCard, { ModelCardSkeleton } from "@/components/TensorModelCard";
import CustomSelect from "@/components/CustomSelect";
import ModelFilterDrawer, { type FilterFacetCounts } from "@/components/ModelFilterDrawer";
import ActiveFilterChips from "@/components/ActiveFilterChips";

import type { CreatorModelType } from "@/lib/api";

type SortOption = "latest" | "samples" | "title";

const BASE_MODEL_OPTIONS = [
  { value: "all", label: "All Base Models" },
  { value: "flux", label: "FLUX.1" },
  { value: "sdxl", label: "SDXL" },
  { value: "sd1.5", label: "SD 1.5" },
  { value: "z-image", label: "Z-Image" },
];

const SORT_OPTIONS = [
  { value: "latest", label: "Recently Published" },
  { value: "samples", label: "Most Showcase Samples" },
  { value: "title", label: "Name (A-Z)" },
];

export default function ModelsPage() {
  const [items, setItems] = useState<PublicModelSummary[]>([]);
  const [installedModelIds, setInstalledModelIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Multi-Faceted Filters State
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<CreatorModelType[]>([]);
  const [selectedBaseModels, setSelectedBaseModels] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [onlyVault, setOnlyVault] = useState(false);
  const [hasSamplesOnly, setHasSamplesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("latest");

  // Drawer open state
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Success banner
  const [createdBanner, setCreatedBanner] = useState<{ id: string; title: string } | null>(null);

  const load = (searchVal = query) => {
    setLoading(true);
    setError(null);

    Promise.allSettled([
      api.listPublicModels(searchVal),
      api.listSelectableModels(),
    ])
      .then(([modelsRes, selectableRes]) => {
        if (modelsRes.status === "fulfilled") {
          setItems(modelsRes.value.items || []);
        } else {
          setError(
            modelsRes.reason instanceof Error
              ? modelsRes.reason.message
              : "Could not load models"
          );
        }

        if (selectableRes.status === "fulfilled") {
          setInstalledModelIds(new Set(selectableRes.value.map((m) => m.model_id)));
        }
      })
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
        window.location.href = "/models/create";
      }
      const createdId = search.get("createdId");
      const createdTitle = search.get("createdTitle");
      if (createdId && createdTitle) {
        setCreatedBanner({ id: createdId, title: createdTitle });
      }
    }
    load(initialQuery);
  }, []);

  // Compute live facet counts for all criteria
  const facetCounts = useMemo<FilterFacetCounts>(() => {
    const types: Record<string, number> = {};
    const baseModels: Record<string, number> = {};
    const categories: Record<string, number> = {};
    let vaultCount = 0;
    let hasSamplesCount = 0;

    items.forEach((item) => {
      // Type
      const t = item.model_type || "Other";
      types[t] = (types[t] || 0) + 1;

      // Base Model
      const base = (item.base_model || "").toLowerCase();
      if (base.includes("flux")) baseModels["flux"] = (baseModels["flux"] || 0) + 1;
      if (base.includes("sdxl") || base.includes("xl")) baseModels["sdxl"] = (baseModels["sdxl"] || 0) + 1;
      if (base.includes("1.5") || base.includes("sd1.5")) baseModels["sd1.5"] = (baseModels["sd1.5"] || 0) + 1;
      if (base.includes("z-image") || base.includes("turbo")) baseModels["z-image"] = (baseModels["z-image"] || 0) + 1;

      // Category
      if (item.category) {
        categories[item.category] = (categories[item.category] || 0) + 1;
      }

      // Vault
      if (installedModelIds.has(item.model_id)) {
        vaultCount += 1;
      }

      // Previews
      if ((item.sample_count ?? 0) > 0) {
        hasSamplesCount += 1;
      }
    });

    return {
      types,
      baseModels,
      categories,
      vaultCount,
      hasSamplesCount,
      total: items.length,
    };
  }, [items, installedModelIds]);

  // Multi-faceted filtering & sorting logic
  const filteredItems = useMemo(() => {
    let result = items.slice();

    // 1. Vault only
    if (onlyVault) {
      result = result.filter((item) => installedModelIds.has(item.model_id));
    }

    // 2. Types (multi-select)
    if (selectedTypes.length > 0) {
      result = result.filter((item) => selectedTypes.includes(item.model_type));
    }

    // 3. Base Models (multi-select)
    if (selectedBaseModels.length > 0) {
      result = result.filter((item) => {
        const base = (item.base_model || "").toLowerCase();
        return selectedBaseModels.some((b) => {
          if (b === "flux") return base.includes("flux");
          if (b === "sdxl") return base.includes("sdxl") || base.includes("xl");
          if (b === "sd1.5") return base.includes("1.5") || base.includes("sd1.5");
          if (b === "z-image") return base.includes("z-image") || base.includes("turbo");
          return false;
        });
      });
    }

    // 4. Categories (multi-select)
    if (selectedCategories.length > 0) {
      const lowerCats = selectedCategories.map((c) => c.toLowerCase());
      result = result.filter((item) =>
        lowerCats.includes((item.category || "").toLowerCase())
      );
    }

    // 5. Samples only
    if (hasSamplesOnly) {
      result = result.filter((item) => (item.sample_count ?? 0) > 0);
    }

    // 6. Search query
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.base_model.toLowerCase().includes(q) ||
          item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    // 7. Sort
    result.sort((a, b) => {
      if (sortBy === "samples") return (b.sample_count ?? 0) - (a.sample_count ?? 0);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return (
        new Date(b.published_at || b.updated_at).getTime() -
        new Date(a.published_at || a.updated_at).getTime()
      );
    });

    return result;
  }, [
    items,
    onlyVault,
    installedModelIds,
    selectedTypes,
    selectedBaseModels,
    selectedCategories,
    hasSamplesOnly,
    query,
    sortBy,
  ]);

  // Toggle helpers
  const handleToggleType = (type: CreatorModelType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleToggleBaseModel = (base: string) => {
    setSelectedBaseModels((prev) =>
      prev.includes(base) ? prev.filter((b) => b !== base) : [...prev, base]
    );
  };

  const handleToggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const hasActiveFilters =
    Boolean(query.trim()) ||
    selectedTypes.length > 0 ||
    selectedBaseModels.length > 0 ||
    selectedCategories.length > 0 ||
    onlyVault ||
    hasSamplesOnly;

  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    selectedTypes.length +
    selectedBaseModels.length +
    selectedCategories.length +
    (onlyVault ? 1 : 0) +
    (hasSamplesOnly ? 1 : 0);

  const clearAllFilters = () => {
    setQuery("");
    setSelectedTypes([]);
    setSelectedBaseModels([]);
    setSelectedCategories([]);
    setOnlyVault(false);
    setHasSamplesOnly(false);
  };

  return (
    <main
      id="main-content"
      className="workspace-scroll relative flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-y-auto bg-[var(--ground)]"
    >
      {/* Main Content Container */}
      <section className="mx-auto w-full max-w-[1600px] flex-1 flex flex-col min-h-0 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
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

        {/* Command Bar Toolbar: Search + Quick Base Select + Filter Drawer Trigger + Sort + Publish */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]/70 backdrop-blur-md p-2.5 shadow-sm mb-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            {/* Search Input with Clear Button and Shortcut Key */}
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
              {/* Smart Filters Slide-Over Drawer Trigger */}
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(true)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-mono font-semibold transition-all shadow-sm ${
                  activeFilterCount > 0
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                }`}
                title="Open Smart Filters Drawer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[9px] font-bold text-[var(--accent-ink)]">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Base Model Quick Select */}
              <CustomSelect
                value={
                  selectedBaseModels.length === 1 ? selectedBaseModels[0] : "all"
                }
                onChange={(val) => {
                  if (val === "all") {
                    setSelectedBaseModels([]);
                  } else {
                    setSelectedBaseModels([val]);
                  }
                }}
                options={BASE_MODEL_OPTIONS}
                ariaLabel="Filter by Base Model"
                icon={<Layers className="h-3.5 w-3.5 text-[var(--ink-faint)]" />}
                buttonClassName="h-9 rounded-lg font-medium text-xs text-[var(--ink)]"
              />

              {/* Sort Order */}
              <CustomSelect
                value={sortBy}
                onChange={(val) => setSortBy(val as SortOption)}
                options={SORT_OPTIONS}
                ariaLabel="Sort models"
                icon={<ArrowUpDown className="h-3.5 w-3.5 text-[var(--ink-faint)]" />}
                buttonClassName="h-9 rounded-lg font-medium text-xs text-[var(--ink)]"
              />

              {/* Publish Model Button */}
              <Link
                href="/models/create"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] hover:brightness-105 active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Publish Model</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Streamlined Quick-Pill Row (Wrapping without horizontal scroll) */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full py-1 mb-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* All Types Pill */}
            <button
              type="button"
              onClick={() => {
                setSelectedTypes([]);
                setOnlyVault(false);
              }}
              className={`min-h-6 shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                selectedTypes.length === 0 && !onlyVault
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              All Types
            </button>

            {/* Checkpoint Pill */}
            <button
              type="button"
              onClick={() => handleToggleType("Checkpoint")}
              className={`min-h-6 shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                selectedTypes.includes("Checkpoint")
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              Checkpoint ({facetCounts.types["Checkpoint"] || 0})
            </button>

            {/* LoRA Pill */}
            <button
              type="button"
              onClick={() => handleToggleType("LoRA")}
              className={`min-h-6 shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                selectedTypes.includes("LoRA")
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              LoRA ({facetCounts.types["LoRA"] || 0})
            </button>

            {/* ControlNet Pill */}
            <button
              type="button"
              onClick={() => handleToggleType("ControlNet")}
              className={`min-h-6 shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                selectedTypes.includes("ControlNet")
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              ControlNet ({facetCounts.types["ControlNet"] || 0})
            </button>

            <span className="mx-1 h-3.5 w-px bg-[var(--line)]" />

            {/* In Vault Quick Toggle Pill */}
            <button
              type="button"
              onClick={() => setOnlyVault(!onlyVault)}
              className={`inline-flex items-center gap-1.5 min-h-6 shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                onlyVault
                  ? "border-emerald-500 bg-emerald-950/40 text-emerald-400 font-bold shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-emerald-500/50 hover:text-emerald-400"
              }`}
              title="Only show models installed in ComfyUI vault"
            >
              <HardDrive className="h-3 w-3 text-emerald-400" />
              <span>In Vault ({facetCounts.vaultCount})</span>
            </button>

            <span className="mx-1 h-3.5 w-px bg-[var(--line)]" />

            {/* More Filters Trigger Pill */}
            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen(true)}
              className="inline-flex items-center gap-1 min-h-6 shrink-0 rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2.5 py-1 text-[11px] font-mono text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>More Filters…</span>
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="workspace-action-quiet min-h-6 shrink-0 whitespace-nowrap px-2 text-[11px] font-medium text-[var(--danger)] hover:underline"
            >
              Reset all
            </button>
          )}
        </div>

        {/* Dismissible Active Filter Chips Row */}
        <ActiveFilterChips
          query={query}
          onClearQuery={() => setQuery("")}
          selectedTypes={selectedTypes}
          onRemoveType={handleToggleType}
          selectedBaseModels={selectedBaseModels}
          onRemoveBaseModel={handleToggleBaseModel}
          selectedCategories={selectedCategories}
          onRemoveCategory={handleToggleCategory}
          onlyVault={onlyVault}
          onClearVault={() => setOnlyVault(false)}
          hasSamplesOnly={hasSamplesOnly}
          onClearSamplesOnly={() => setHasSamplesOnly(false)}
          onClearAll={clearAllFilters}
          className="mb-2"
        />

        {/* Count Bar */}
        <div className="mb-4 flex items-center justify-between text-xs text-[var(--ink-faint)]">
          <p>
            {loading ? (
              "Loading models..."
            ) : (
              <>
                Showing{" "}
                <span className="font-mono text-[var(--ink)] font-bold">
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

          <button
            type="button"
            onClick={() => load()}
            title="Refresh models catalog"
            className="workspace-action-quiet text-xs flex items-center gap-1 font-mono hover:text-[var(--accent)]"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {/* Models Grid (Zero-CLS) */}
        {error ? (
          <div className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center">
            <p className="text-xs text-[var(--danger)] font-mono">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="workspace-action-secondary mt-3 px-3 py-1 text-xs"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <ModelCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/30 p-12 text-center my-auto">
            <Box className="mx-auto h-10 w-10 text-[var(--ink-faint)] opacity-40 mb-3" />
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              No models match your current filters
            </h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)] max-w-sm mx-auto">
              Try removing some filter criteria or clearing your search term to see more models.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all shadow-sm"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredItems.map((item, idx) => (
              <TensorModelCard
                key={item.model_id}
                item={item}
                index={idx}
                className="shadow-sm"
              />
            ))}
          </div>
        )}
      </section>

      {/* Slide-Over Smart Filters Drawer */}
      <ModelFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        selectedTypes={selectedTypes}
        onToggleType={handleToggleType}
        selectedBaseModels={selectedBaseModels}
        onToggleBaseModel={handleToggleBaseModel}
        selectedCategories={selectedCategories}
        onToggleCategory={handleToggleCategory}
        onlyVault={onlyVault}
        onToggleOnlyVault={setOnlyVault}
        hasSamplesOnly={hasSamplesOnly}
        onToggleHasSamplesOnly={setHasSamplesOnly}
        facetCounts={facetCounts}
        totalMatching={filteredItems.length}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={clearAllFilters}
      />

      {/* Footer */}
      <div className="shrink-0 pt-6">
        <WorkspaceFooter />
      </div>
    </main>
  );
}
