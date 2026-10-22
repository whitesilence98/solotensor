"use client";

import React, { useEffect, useMemo } from "react";
import {
  Check,
  CheckSquare,
  Clock,
  Filter,
  HardDrive,
  Layers,
  RotateCcw,
  Sparkles,
  Square,
  X,
  Zap,
} from "lucide-react";
import type { CreatorModelType } from "@/lib/api";

export interface FilterFacetCounts {
  types: Record<string, number>;
  baseModels: Record<string, number>;
  categories: Record<string, number>;
  vaultCount: number;
  hasSamplesCount: number;
  total: number;
}

export interface ModelFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Selected state
  selectedTypes: CreatorModelType[];
  onToggleType: (type: CreatorModelType) => void;
  selectedBaseModels: string[];
  onToggleBaseModel: (base: string) => void;
  selectedCategories: string[];
  onToggleCategory: (cat: string) => void;
  onlyVault: boolean;
  onToggleOnlyVault: (val: boolean) => void;
  hasSamplesOnly: boolean;
  onToggleHasSamplesOnly: (val: boolean) => void;
  // Counts & Actions
  facetCounts: FilterFacetCounts;
  totalMatching: number;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

const AVAILABLE_TYPES: Array<{ value: CreatorModelType; label: string }> = [
  { value: "Checkpoint", label: "Checkpoint" },
  { value: "LoRA", label: "LoRA" },
  { value: "ControlNet", label: "ControlNet" },
  { value: "Embedding", label: "Embedding" },
  { value: "VAE", label: "VAE" },
  { value: "DoRA", label: "DoRA" },
  { value: "LyCORIS", label: "LyCORIS" },
  { value: "Motion LoRA", label: "Motion LoRA" },
  { value: "Hyper Network", label: "Hyper Network" },
  { value: "LoKr", label: "LoKr" },
  { value: "LoCon", label: "LoCon" },
  { value: "Poses", label: "Poses" },
  { value: "Wildcards", label: "Wildcards" },
  { value: "SVD", label: "SVD" },
  { value: "StyleModel", label: "StyleModel" },
];

const AVAILABLE_BASE_MODELS = [
  { value: "flux", label: "FLUX.1" },
  { value: "sdxl", label: "SDXL" },
  { value: "sd1.5", label: "SD 1.5" },
  { value: "z-image", label: "Z-Image / Turbo" },
];

const AVAILABLE_CATEGORIES = [
  "Character",
  "Style",
  "Concept",
  "Clothing",
  "Pose",
  "General",
];

export default function ModelFilterDrawer({
  isOpen,
  onClose,
  selectedTypes,
  onToggleType,
  selectedBaseModels,
  onToggleBaseModel,
  selectedCategories,
  onToggleCategory,
  onlyVault,
  onToggleOnlyVault,
  hasSamplesOnly,
  onToggleHasSamplesOnly,
  facetCounts,
  totalMatching,
  hasActiveFilters,
  onResetFilters,
}: ModelFilterDrawerProps) {
  // Close drawer on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const activeCount = useMemo(() => {
    let count = 0;
    count += selectedTypes.length;
    count += selectedBaseModels.length;
    count += selectedCategories.length;
    if (onlyVault) count += 1;
    if (hasSamplesOnly) count += 1;
    return count;
  }, [selectedTypes, selectedBaseModels, selectedCategories, onlyVault, hasSamplesOnly]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none">
      {/* Frosted Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      />

      {/* Slide-Over Drawer Container */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Smart Model Filters"
        className="relative z-10 flex h-full w-full max-w-md flex-col justify-between border-l border-[var(--line-strong)] bg-[var(--surface-raised)]/95 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* Drawer Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]">
              <Filter className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold tracking-tight text-[var(--ink)]">
                Smart Model Filters
              </h3>
              <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                Multi-faceted registry search
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
                {activeCount} active
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close smart filters"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Filter Facets */}
        <div className="workspace-scroll flex-1 overflow-y-auto p-5 space-y-6">
          {/* Section 1: Local Vault & Readiness */}
          <div className="space-y-3">
            <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
              Vault & Local Storage
            </span>
            <div
              onClick={() => onToggleOnlyVault(!onlyVault)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleOnlyVault(!onlyVault);
                }
              }}
              className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all ${
                onlyVault
                  ? "border-emerald-500/50 bg-emerald-950/25 shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    onlyVault
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)]"
                  }`}
                >
                  <HardDrive className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-xs font-bold text-[var(--ink)]">
                      Installed in Vault
                    </span>
                    <span className="rounded bg-emerald-950/40 border border-emerald-500/30 px-1 py-0.2 font-mono text-[9px] font-bold text-emerald-400">
                      Ready to Run
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-soft)]">
                    Only show weights mounted into your ComfyUI workspace
                  </p>
                </div>
              </div>

              <span className="shrink-0 font-mono text-xs font-bold text-emerald-400">
                ({facetCounts.vaultCount})
              </span>
            </div>
          </div>

          {/* Section 2: Base Architecture */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Base Architecture
              </span>
              {selectedBaseModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectedBaseModels.forEach((b) => onToggleBaseModel(b))}
                  className="font-mono text-[9px] text-[var(--accent)] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_BASE_MODELS.map((base) => {
                const isSelected = selectedBaseModels.includes(base.value);
                const count = facetCounts.baseModels[base.value] || 0;
                return (
                  <button
                    key={base.value}
                    type="button"
                    onClick={() => onToggleBaseModel(base.value)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left font-mono text-xs transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 font-semibold text-[var(--accent)] shadow-xs"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="truncate">{base.label}</span>
                    <span
                      className={`text-[10px] font-bold ${
                        isSelected ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Model Types */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Model Type
              </span>
              {selectedTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectedTypes.forEach((t) => onToggleType(t))}
                  className="font-mono text-[9px] text-[var(--accent)] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {AVAILABLE_TYPES.map((typeObj) => {
                const isSelected = selectedTypes.includes(typeObj.value);
                const count = facetCounts.types[typeObj.value] || 0;
                return (
                  <button
                    key={typeObj.value}
                    type="button"
                    onClick={() => onToggleType(typeObj.value)}
                    className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 font-semibold text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                    } ${count === 0 && !isSelected ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      ) : (
                        <Square className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" />
                      )}
                      <span className="truncate text-[11px] font-mono">{typeObj.label}</span>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[10px] font-bold ${
                        isSelected ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Categories & Tags */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Category & Subject
              </span>
              {selectedCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectedCategories.forEach((c) => onToggleCategory(c))}
                  className="font-mono text-[9px] text-[var(--accent)] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_CATEGORIES.map((cat) => {
                const isSelected = selectedCategories.includes(cat);
                const count = facetCounts.categories[cat] || 0;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onToggleCategory(cat)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-xs"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                    } ${count === 0 && !isSelected ? "opacity-40" : ""}`}
                  >
                    <span>{cat}</span>
                    <span
                      className={`text-[10px] ${
                        isSelected ? "text-[var(--accent-ink)]/70" : "text-[var(--ink-faint)]"
                      }`}
                    >
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 5: Media & Quality */}
          <div className="space-y-2.5">
            <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
              Quality & Media
            </span>

            <div
              onClick={() => onToggleHasSamplesOnly(!hasSamplesOnly)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleHasSamplesOnly(!hasSamplesOnly);
                }
              }}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition-all ${
                hasSamplesOnly
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 font-semibold text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-xs">Has Showcase Preview Images</span>
              </div>
              <span className="font-mono text-[10px] font-bold">
                ({facetCounts.hasSamplesCount})
              </span>
            </div>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--surface)]/95 p-4 backdrop-blur-md">
          <button
            type="button"
            disabled={!hasActiveFilters}
            onClick={onResetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 font-mono text-xs font-semibold text-[var(--ink-faint)] transition-colors hover:border-[var(--danger)]/50 hover:text-[var(--danger)] hover:bg-[var(--surface-raised)] disabled:opacity-30 disabled:pointer-events-none"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset All</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all active:scale-95 shadow-sm"
          >
            <span>Show {totalMatching} Models</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
