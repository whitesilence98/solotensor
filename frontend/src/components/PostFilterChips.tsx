"use client";

import { X } from "lucide-react";
import {
  getActivePostFilterDescriptors,
  type PostFilterDescriptor,
  type PostFilters,
} from "@/lib/postFilters";

export interface PostFilterChipsProps {
  filters: PostFilters;
  onRemove: (descriptor: PostFilterDescriptor) => void;
  onClearAll: () => void;
  className?: string;
}

/**
 * Active filter chips for the Posts feed. Mirrors `ActiveFilterChips` but is
 * driven by the post filter model, so every facet yields an accurate chip.
 */
export default function PostFilterChips({
  filters,
  onRemove,
  onClearAll,
  className = "",
}: PostFilterChipsProps) {
  const descriptors = getActivePostFilterDescriptors(filters);
  if (descriptors.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 py-1 text-xs select-none ${className}`}
      aria-label="Active post filters"
    >
      <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
        Active:
      </span>

      {descriptors.map((descriptor) => (
        <span
          key={descriptor.id}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] ${
            descriptor.facet === "query"
              ? "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)]"
              : "border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink-soft)]"
          }`}
        >
          {descriptor.prefix ? (
            <span className="text-[var(--ink-faint)]">
              {descriptor.prefix}:
            </span>
          ) : null}
          <span
            className={`max-w-[14rem] truncate font-semibold ${
              descriptor.facet === "query"
                ? "text-[var(--accent)]"
                : "text-[var(--ink)]"
            }`}
            title={descriptor.label}
          >
            {descriptor.label}
          </span>
          <button
            type="button"
            onClick={() => onRemove(descriptor)}
            aria-label={`Remove ${descriptor.prefix || "filter"} ${descriptor.label}`}
            className="rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[var(--danger)] transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span>Clear all</span>
      </button>
    </div>
  );
}
