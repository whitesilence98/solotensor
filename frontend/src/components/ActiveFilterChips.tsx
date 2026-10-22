"use client";

import React from "react";
import { HardDrive, Sparkles, X } from "lucide-react";
import type { CreatorModelType } from "@/lib/api";

export interface ActiveFilterChipsProps {
  query?: string;
  onClearQuery: () => void;
  selectedTypes: CreatorModelType[];
  onRemoveType: (type: CreatorModelType) => void;
  selectedBaseModels: string[];
  onRemoveBaseModel: (base: string) => void;
  selectedCategories: string[];
  onRemoveCategory: (cat: string) => void;
  onlyVault: boolean;
  onClearVault: () => void;
  hasSamplesOnly: boolean;
  onClearSamplesOnly: () => void;
  onClearAll: () => void;
  className?: string;
}

const BASE_MODEL_LABELS: Record<string, string> = {
  flux: "FLUX.1",
  sdxl: "SDXL",
  "sd1.5": "SD 1.5",
  "z-image": "Z-Image",
};

export default function ActiveFilterChips({
  query = "",
  onClearQuery,
  selectedTypes,
  onRemoveType,
  selectedBaseModels,
  onRemoveBaseModel,
  selectedCategories,
  onRemoveCategory,
  onlyVault,
  onClearVault,
  hasSamplesOnly,
  onClearSamplesOnly,
  onClearAll,
  className = "",
}: ActiveFilterChipsProps) {
  const hasChips =
    Boolean(query.trim()) ||
    selectedTypes.length > 0 ||
    selectedBaseModels.length > 0 ||
    selectedCategories.length > 0 ||
    onlyVault ||
    hasSamplesOnly;

  if (!hasChips) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 py-1 text-xs select-none animate-in fade-in duration-150 ${className}`}
      aria-label="Active filters list"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)] mr-1">
        Active:
      </span>

      {/* Query Search Chip */}
      {query.trim() && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink)]">
          <span className="text-[var(--ink-faint)]">Search:</span>
          <span className="font-semibold text-[var(--accent)]">&ldquo;{query}&rdquo;</span>
          <button
            type="button"
            onClick={onClearQuery}
            aria-label="Remove search query filter"
            className="rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--danger)] hover:bg-[var(--surface-soft)] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {/* Vault Only Chip */}
      {onlyVault && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-950/30 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
          <HardDrive className="h-3 w-3 text-emerald-400" />
          <span className="font-semibold">Installed in Vault</span>
          <button
            type="button"
            onClick={onClearVault}
            aria-label="Remove vault only filter"
            className="rounded p-0.5 text-emerald-400/70 hover:text-emerald-200 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {/* Base Models Chips */}
      {selectedBaseModels.map((base) => (
        <span
          key={`base-${base}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[11px] text-[var(--accent)]"
        >
          <span className="text-[var(--ink-faint)]">Base:</span>
          <span className="font-semibold">{BASE_MODEL_LABELS[base] || base}</span>
          <button
            type="button"
            onClick={() => onRemoveBaseModel(base)}
            aria-label={`Remove base model ${base}`}
            className="rounded p-0.5 text-[var(--accent)] hover:text-[var(--danger)] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {/* Model Types Chips */}
      {selectedTypes.map((t) => (
        <span
          key={`type-${t}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink)]"
        >
          <span className="text-[var(--ink-faint)]">Type:</span>
          <span className="font-semibold">{t}</span>
          <button
            type="button"
            onClick={() => onRemoveType(t)}
            aria-label={`Remove type ${t}`}
            className="rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--danger)] hover:bg-[var(--surface-soft)] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {/* Category Chips */}
      {selectedCategories.map((cat) => (
        <span
          key={`cat-${cat}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-soft)]"
        >
          <span className="text-[var(--ink-faint)]">Category:</span>
          <span className="font-semibold text-[var(--ink)]">{cat}</span>
          <button
            type="button"
            onClick={() => onRemoveCategory(cat)}
            aria-label={`Remove category ${cat}`}
            className="rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--danger)] hover:bg-[var(--surface-soft)] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {/* Has Samples Only Chip */}
      {hasSamplesOnly && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-soft)]">
          <Sparkles className="h-3 w-3 text-[var(--accent)]" />
          <span>With Previews</span>
          <button
            type="button"
            onClick={onClearSamplesOnly}
            aria-label="Remove previews only filter"
            className="rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--danger)] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {/* Clear All Trigger */}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[var(--danger)] hover:underline"
      >
        <span>Clear all</span>
      </button>
    </div>
  );
}
