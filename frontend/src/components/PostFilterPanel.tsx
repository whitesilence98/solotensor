"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  FileQuestion,
  Gauge,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Scan,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Tags,
  TextQuote,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { AspectRatioIcon } from "@/components/AspectRatioSelector";
import {
  POST_ASPECT_RATIOS,
  POST_CATEGORY_PILLS,
  POST_MEDIA_TYPES,
  POST_MODEL_FAMILIES,
  POST_RESOLUTION_TIERS,
  POST_SOURCES,
  POST_TIME_RANGES,
  countActivePostFilters,
  hasActivePostFilters,
  sortedFacetEntries,
  togglePostFilterValue,
  type PostFacetCounts,
  type PostFilterListFacet,
  type PostFilters,
  type PostMediaType,
  type PostTimeRange,
} from "@/lib/postFilters";

export interface PostFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: PostFilters;
  onFiltersChange: (filters: PostFilters) => void;
  facetCounts: PostFacetCounts;
  totalMatching: number;
  totalAssets: number;
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onReset: () => void;
}

const PANEL_TRANSITION_MS = 200;
const COLLAPSED_TAGS = 10;
const COLLAPSED_LORAS = 8;
const COLLAPSED_MODEL_TYPES = 10;
const COLLAPSED_TOOLS = 6;

/** The panel's CSS transitions opt out under reduced motion; so must its timing. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* -------------------------------------------------------------------------- */
/* Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function FacetSection({
  label,
  icon,
  onClear,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const labelId = `post-facet-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span
          id={labelId}
          className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]"
        >
          <span className="text-[var(--ink-soft)]">{icon}</span>
          {label}
        </span>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded px-1 py-0.5 font-mono text-[9px] font-semibold text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Clear
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function OptionChip({
  label,
  title,
  count,
  selected,
  onClick,
  icon,
  className = "",
}: {
  label: string;
  title?: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  className?: string;
}) {
  const dimmed = count === 0 && !selected;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
          : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      } ${dimmed ? "opacity-40" : ""} ${className}`}
    >
      {icon}
      <span className="truncate" title={title ?? label}>
        {label}
      </span>
      <span
        className={`font-mono text-[10px] tabular-nums ${
          selected ? "text-[var(--accent)]" : "text-[var(--ink-soft)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * A collapsed facet must never hide an option the visitor has already
 * selected — otherwise the active state becomes invisible and cannot be
 * removed without expanding. Selected options are pinned into the visible
 * slice even when they fall past the cap.
 */
function visibleEntries(
  entries: Array<[string, number]>,
  selected: readonly string[],
  expanded: boolean,
  limit: number
): Array<[string, number]> {
  if (expanded || entries.length <= limit) return entries;
  const selectedSet = new Set(selected);
  const head = entries.slice(0, limit);
  const headKeys = new Set(head.map(([value]) => value));
  const pinned = entries.filter(
    ([value]) => selectedSet.has(value) && !headKeys.has(value)
  );
  return [...head, ...pinned];
}

function BooleanToggle({
  label,
  description,
  count,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
      } ${count === 0 && !selected ? "opacity-40" : ""}`}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        {selected ? (
          <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        ) : (
          <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" />
        )}
        <span className="min-w-0">
          <span
            className={`block text-xs font-semibold ${
              selected ? "text-[var(--accent)]" : "text-[var(--ink)]"
            }`}
          >
            {label}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-faint)]">
            {description}
          </span>
        </span>
      </span>
      <span
        className={`shrink-0 font-mono text-[10px] font-bold tabular-nums ${
          selected ? "text-[var(--accent)]" : "text-[var(--ink-soft)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                     */
/* -------------------------------------------------------------------------- */

export default function PostFilterPanel({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  facetCounts,
  totalMatching,
  totalAssets,
  searchDraft,
  onSearchDraftChange,
  onReset,
}: PostFilterPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Parents pass a fresh closure each render; keeping it in a ref prevents the
  // focus/ESC effects from tearing down and stealing focus mid-keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keep the drawer mounted long enough to run its exit transition.
  const [rendered, setRendered] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Bumped on every open/close so a stale exit timer can never unmount a panel
  // that was reopened inside the transition window.
  const phaseRef = useRef(0);

  const toggleExpanded = (key: string) =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));

  useEffect(() => {
    const phase = ++phaseRef.current;
    let timeout = 0;

    if (isOpen) {
      setRendered(true);
      // Two frames: one to mount with the off-screen transform, one to let the
      // browser commit it before the transition begins. One frame would fold
      // both styles into the same layout pass and skip the animation.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          if (phaseRef.current === phase) setVisible(true);
        });
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }

    setVisible(false);
    // Reduced motion disables the transition entirely, so unmount immediately
    // rather than leaving an invisible full-screen overlay over the page.
    const delay = prefersReducedMotion() ? 0 : PANEL_TRANSITION_MS;
    timeout = window.setTimeout(() => {
      if (phaseRef.current === phase) setRendered(false);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  // Lock background scrolling while the panel is mounted. The homepage scrolls
  // inside `<main class="workspace-scroll">`, not `body`, so locking only the
  // body would leave the page scrolling behind the backdrop.
  useEffect(() => {
    if (!rendered) return;
    const scroller = panelRef.current?.closest<HTMLElement>(".workspace-scroll");
    const targets = [document.body, scroller].filter(
      (element): element is HTMLElement => Boolean(element)
    );
    if (targets.length === 0) targets.push(document.body);

    const previous = targets.map((element) => element.style.overflow);
    targets.forEach((element) => {
      element.style.overflow = "hidden";
    });

    return () => {
      targets.forEach((element, index) => {
        element.style.overflow = previous[index];
      });
    };
  }, [rendered]);

  // ESC closes.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Move focus into the panel on open and restore it on close.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const timeout = window.setTimeout(() => {
      searchRef.current?.focus();
    }, 40);
    return () => {
      window.clearTimeout(timeout);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  const trapFocus = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const root = panelRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const activeCount = countActivePostFilters(filters);
  const canReset = hasActivePostFilters(filters);

  const toggleList = <T extends string>(facet: PostFilterListFacet, value: T) => {
    const facetFilters = filters as unknown as Record<
      PostFilterListFacet,
      readonly T[]
    >;
    onFiltersChange({
      ...filters,
      [facet]: togglePostFilterValue(facetFilters[facet], value),
    } as PostFilters);
  };

  const clearFacet = (facet: PostFilterListFacet) => {
    onFiltersChange({ ...filters, [facet]: [] } as PostFilters);
  };

  if (!rendered) return null;

  const modelTypeEntries = sortedFacetEntries(facetCounts.modelTypes);
  const samplerEntries = sortedFacetEntries(facetCounts.samplers);
  const schedulerEntries = sortedFacetEntries(facetCounts.schedulers);
  const loraEntries = sortedFacetEntries(facetCounts.loras);
  const toolEntries = sortedFacetEntries(facetCounts.tools);
  const tagEntries = sortedFacetEntries(facetCounts.tags);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Frosted backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 bg-[var(--overlay-backdrop)] backdrop-blur-sm transition-opacity duration-200 ease-[var(--ease-workspace)] motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Slide-over panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-filter-panel-title"
        onKeyDown={trapFocus}
        className={`relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-2xl transition-transform duration-200 ease-[var(--ease-workspace)] motion-reduce:transition-none ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="post-filter-panel-title"
                className="font-heading text-sm font-bold tracking-tight text-[var(--ink)]"
              >
                Filter Posts
              </h3>
              <p className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
                {totalMatching} of {totalAssets} creations
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
                {activeCount} active
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close post filters"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable facets */}
        <div className="workspace-scroll flex-1 space-y-6 overflow-y-auto p-5">
          {/* 1. Search */}
          <FacetSection label="Search" icon={<Search className="h-3 w-3" />}>
            <div className="group relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)] transition-colors group-focus-within:text-[var(--accent)]" />
              <input
                ref={searchRef}
                type="search"
                value={searchDraft}
                onChange={(event) => onSearchDraftChange(event.target.value)}
                placeholder="Prompt, model, or tag…"
                aria-label="Search prompts, models, and tags"
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] pl-9 pr-11 text-xs text-[var(--ink)] outline-none transition-colors duration-150 placeholder:text-[var(--ink-faint)] hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 motion-reduce:transition-none"
              />
              {searchDraft ? (
                <button
                  type="button"
                  onClick={() => onSearchDraftChange("")}
                  aria-label="Clear post search"
                  className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 select-none rounded border border-[var(--line-strong)]/60 bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-faint)] transition-opacity group-focus-within:opacity-0">
                  /
                </kbd>
              )}
            </div>
          </FacetSection>

          {/* 2. Media type */}
          <FacetSection
            label="Media Type"
            icon={<ImageIcon className="h-3 w-3" />}
            onClear={
              filters.mediaTypes.length
                ? () => clearFacet("mediaTypes")
                : undefined
            }
          >
            <div className="grid grid-cols-3 gap-1.5">
              {POST_MEDIA_TYPES.map((option) => {
                const selected = filters.mediaTypes.includes(option.value);
                const count = facetCounts.mediaTypes[option.value] ?? 0;
                const Icon =
                  option.value === "video"
                    ? Video
                    : option.value === "3d"
                      ? Layers
                      : ImageIcon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      toggleList<PostMediaType>("mediaTypes", option.value)
                    }
                    className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                    } ${count === 0 && !selected ? "opacity-40" : ""}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-[11px] font-semibold">
                        {option.label}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-[var(--ink-soft)]">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </FacetSection>

          {/* 3. Category */}
          <FacetSection
            label="Category"
            icon={<Sparkles className="h-3 w-3" />}
            onClear={
              filters.categories.length
                ? () => clearFacet("categories")
                : undefined
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {POST_CATEGORY_PILLS.filter((pill) => pill.id !== "all").map(
                (pill) => {
                  const selected = filters.categories.includes(pill.id);
                  const count = facetCounts.categories[pill.id] ?? 0;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleList("categories", pill.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                      } ${count === 0 && !selected ? "opacity-40" : ""}`}
                    >
                      <span>{pill.label}</span>
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          selected
                            ? "text-[var(--accent-ink)]/70"
                            : "text-[var(--ink-soft)]"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </FacetSection>

          {/* 4. Aspect ratio */}
          <FacetSection
            label="Aspect Ratio"
            icon={<ImageIcon className="h-3 w-3" />}
            onClear={
              filters.aspectRatios.length
                ? () => clearFacet("aspectRatios")
                : undefined
            }
          >
            <div className="grid grid-cols-4 gap-1.5">
              {POST_ASPECT_RATIOS.map((option) => {
                const selected = filters.aspectRatios.includes(option.value);
                const count = facetCounts.aspectRatios[option.value] ?? 0;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      toggleList<PostFilters["aspectRatios"][number]>(
                        "aspectRatios",
                        option.value
                      )
                    }
                    className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2 font-mono text-[10px] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                    } ${count === 0 && !selected ? "opacity-40" : ""}`}
                  >
                    <AspectRatioIcon ratio={option.value} />
                    <span className="leading-none">{option.label}</span>
                    <span className="text-[9px] tabular-nums text-[var(--ink-soft)]">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </FacetSection>

          {/* 5. Time range */}
          <FacetSection
            label="Time Range"
            icon={<Clock className="h-3 w-3" />}
            onClear={
              filters.timeRange !== "all"
                ? () => onFiltersChange({ ...filters, timeRange: "all" })
                : undefined
            }
          >
            <div className="grid grid-cols-3 gap-1.5">
              {POST_TIME_RANGES.map((option) => {
                const selected = filters.timeRange === option.value;
                const count = facetCounts.timeRanges[option.value] ?? 0;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        timeRange: option.value as PostTimeRange,
                      })
                    }
                    className={`flex items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                    } ${count === 0 && !selected ? "opacity-40" : ""}`}
                  >
                    <span className="truncate">{option.label}</span>
                    <span className="font-mono text-[10px] tabular-nums">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </FacetSection>

          {/* 6. Source */}
          <FacetSection
            label="Source"
            icon={<Layers className="h-3 w-3" />}
            onClear={
              filters.sources.length ? () => clearFacet("sources") : undefined
            }
          >
            <div className="grid grid-cols-2 gap-1.5">
              {POST_SOURCES.map((option) => {
                const selected = filters.sources.includes(option.value);
                const count = facetCounts.sources[option.value] ?? 0;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleList("sources", option.value)}
                    className={`flex items-center justify-between gap-1.5 rounded-lg border px-3 py-2 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                    } ${count === 0 && !selected ? "opacity-40" : ""}`}
                  >
                    <span className="truncate text-[11px] font-semibold">
                      {option.label}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </FacetSection>

          {/* 7. Model family */}
          <FacetSection
            label="Model Family"
            icon={<Wand2 className="h-3 w-3" />}
            onClear={
              filters.modelFamilies.length
                ? () => clearFacet("modelFamilies")
                : undefined
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {POST_MODEL_FAMILIES.map((option) => (
                <OptionChip
                  key={option.value}
                  label={option.label}
                  count={facetCounts.modelFamilies[option.value] ?? 0}
                  selected={filters.modelFamilies.includes(option.value)}
                  onClick={() => toggleList("modelFamilies", option.value)}
                  className="font-mono"
                />
              ))}
            </div>
          </FacetSection>

          {/* 8. Model type — only values present in the data */}
          {modelTypeEntries.length > 0 && (
            <FacetSection
              label="Model Type"
              icon={<Layers className="h-3 w-3" />}
              onClear={
                filters.modelTypes.length
                  ? () => clearFacet("modelTypes")
                  : undefined
              }
            >
              <div className="grid grid-cols-2 gap-1.5">
                {visibleEntries(
                  modelTypeEntries,
                  filters.modelTypes,
                  Boolean(expanded.modelTypes),
                  COLLAPSED_MODEL_TYPES
                ).map(([value, count]) => {
                  const selected = filters.modelTypes.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleList("modelTypes", value)}
                      className={`flex items-center justify-between gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                          : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                      } ${count === 0 && !selected ? "opacity-40" : ""}`}
                    >
                      <span className="truncate font-mono text-[11px]">
                        {value}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {modelTypeEntries.length > COLLAPSED_MODEL_TYPES && (
                <ShowMore
                  expanded={Boolean(expanded.modelTypes)}
                  total={modelTypeEntries.length}
                  collapsedCount={COLLAPSED_MODEL_TYPES}
                  onClick={() => toggleExpanded("modelTypes")}
                />
              )}
            </FacetSection>
          )}

          {/* 9. Sampler */}
          {samplerEntries.length > 0 && (
            <FacetSection
              label="Sampler"
              icon={<Gauge className="h-3 w-3" />}
              onClear={
                filters.samplers.length ? () => clearFacet("samplers") : undefined
              }
            >
              <div className="flex flex-wrap gap-1.5">
                {samplerEntries.map(([value, count]) => (
                  <OptionChip
                    key={value}
                    label={value}
                    count={count}
                    selected={filters.samplers.includes(value)}
                    onClick={() => toggleList("samplers", value)}
                    className="font-mono"
                  />
                ))}
              </div>
            </FacetSection>
          )}

          {/* 10. Scheduler */}
          {schedulerEntries.length > 0 && (
            <FacetSection
              label="Scheduler"
              icon={<Clock className="h-3 w-3" />}
              onClear={
                filters.schedulers.length
                  ? () => clearFacet("schedulers")
                  : undefined
              }
            >
              <div className="flex flex-wrap gap-1.5">
                {schedulerEntries.map(([value, count]) => (
                  <OptionChip
                    key={value}
                    label={value}
                    count={count}
                    selected={filters.schedulers.includes(value)}
                    onClick={() => toggleList("schedulers", value)}
                    className="font-mono"
                  />
                ))}
              </div>
            </FacetSection>
          )}

          {/* 11. Resolution tier */}
          <FacetSection
            label="Resolution"
            icon={<Scan className="h-3 w-3" />}
            onClear={
              filters.resolutionTiers.length
                ? () => clearFacet("resolutionTiers")
                : undefined
            }
          >
            <div className="grid grid-cols-2 gap-1.5">
              {POST_RESOLUTION_TIERS.map((option) => (
                <OptionChip
                  key={option.value}
                  label={option.label}
                  count={facetCounts.resolutionTiers[option.value] ?? 0}
                  selected={filters.resolutionTiers.includes(option.value)}
                  onClick={() => toggleList("resolutionTiers", option.value)}
                  className="justify-between font-mono"
                />
              ))}
            </div>
          </FacetSection>

          {/* 12. LoRA used */}
          {loraEntries.length > 0 && (
            <FacetSection
              label="LoRA Used"
              icon={<Layers className="h-3 w-3" />}
              onClear={
                filters.loras.length ? () => clearFacet("loras") : undefined
              }
            >
              <div className="flex flex-wrap gap-1.5">
                {visibleEntries(
                  loraEntries,
                  filters.loras,
                  Boolean(expanded.loras),
                  COLLAPSED_LORAS
                ).map(([value, count]) => (
                  <OptionChip
                    key={value}
                    label={value.split(/[\\/]/).pop() ?? value}
                    title={value}
                    count={count}
                    selected={filters.loras.includes(value)}
                    onClick={() => toggleList("loras", value)}
                    className="max-w-full font-mono"
                  />
                ))}
              </div>
              {loraEntries.length > COLLAPSED_LORAS && (
                <ShowMore
                  expanded={Boolean(expanded.loras)}
                  total={loraEntries.length}
                  collapsedCount={COLLAPSED_LORAS}
                  onClick={() => toggleExpanded("loras")}
                />
              )}
            </FacetSection>
          )}

          {/* 13. AI tool */}
          {toolEntries.length > 0 && (
            <FacetSection
              label="AI Tool"
              icon={<Wand2 className="h-3 w-3" />}
              onClear={
                filters.tools.length ? () => clearFacet("tools") : undefined
              }
            >
              <div className="flex flex-wrap gap-1.5">
                {visibleEntries(
                  toolEntries,
                  filters.tools,
                  Boolean(expanded.tools),
                  COLLAPSED_TOOLS
                ).map(([value, count]) => (
                  <OptionChip
                    key={value}
                    label={value}
                    count={count}
                    selected={filters.tools.includes(value)}
                    onClick={() => toggleList("tools", value)}
                  />
                ))}
              </div>
              {toolEntries.length > COLLAPSED_TOOLS && (
                <ShowMore
                  expanded={Boolean(expanded.tools)}
                  total={toolEntries.length}
                  collapsedCount={COLLAPSED_TOOLS}
                  onClick={() => toggleExpanded("tools")}
                />
              )}
            </FacetSection>
          )}

          {/* 14. Tags */}
          {tagEntries.length > 0 && (
            <FacetSection
              label="Tags"
              icon={<Tags className="h-3 w-3" />}
              onClear={filters.tags.length ? () => clearFacet("tags") : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {visibleEntries(
                  tagEntries,
                  filters.tags,
                  Boolean(expanded.tags),
                  COLLAPSED_TAGS
                ).map(([value, count]) => (
                  <OptionChip
                    key={value}
                    label={value}
                    count={count}
                    selected={filters.tags.includes(value)}
                    onClick={() => toggleList("tags", value)}
                    className="font-mono"
                  />
                ))}
              </div>
              {tagEntries.length > COLLAPSED_TAGS && (
                <ShowMore
                  expanded={Boolean(expanded.tags)}
                  total={tagEntries.length}
                  collapsedCount={COLLAPSED_TAGS}
                  onClick={() => toggleExpanded("tags")}
                />
              )}
            </FacetSection>
          )}

          {/* 15. Prompt metadata toggles */}
          <FacetSection label="Prompt Signals" icon={<TextQuote className="h-3 w-3" />}>
            <div className="space-y-1.5">
              <BooleanToggle
                label="Detailer applied"
                description="Passes that were re-detailed after the base render."
                count={facetCounts.detailerOnly}
                selected={filters.detailerOnly}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    detailerOnly: !filters.detailerOnly,
                  })
                }
              />
              <BooleanToggle
                label="Has negative prompt"
                description="Runs where a negative prompt was recorded."
                count={facetCounts.negativePromptOnly}
                selected={filters.negativePromptOnly}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    negativePromptOnly: !filters.negativePromptOnly,
                  })
                }
              />
            </div>
          </FacetSection>

          {/* Metadata coverage note — honest, not decorative */}
          {totalAssets > 0 && totalMatching === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
              <FileQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" />
              <p className="text-[11px] leading-relaxed text-[var(--ink-soft)]">
                No creations match every active facet. Remove the narrowest
                one or reset all filters.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-4">
          <button
            type="button"
            disabled={!canReset}
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 font-mono text-xs font-semibold text-[var(--ink-faint)] transition-colors duration-150 motion-reduce:transition-none hover:border-[var(--danger)]/50 hover:bg-[var(--surface-raised)] hover:text-[var(--danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset all</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 font-mono text-xs font-bold text-[var(--accent-ink)] shadow-sm transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <span>
              Show {totalMatching} {totalMatching === 1 ? "Post" : "Posts"}
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function ShowMore({
  expanded,
  total,
  collapsedCount,
  onClick,
}: {
  expanded: boolean;
  total: number;
  collapsedCount: number;
  onClick: () => void;
}) {
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="inline-flex items-center gap-1 rounded px-0.5 py-1 font-mono text-[10px] font-semibold text-[var(--ink-faint)] transition-colors duration-150 motion-reduce:transition-none hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <Icon className="h-3 w-3" />
      <span>
        {expanded ? "Show fewer" : `Show ${total - collapsedCount} more`}
      </span>
    </button>
  );
}
