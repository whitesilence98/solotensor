"use client";

import React, { useState, useRef, useEffect, useId, useMemo } from "react";
import { Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  type BaseArchitectureNode,
  type BaseArchitectureGroup,
  isArchitectureGroup,
  getArchitectureDisplay,
} from "@/lib/baseModelArchitectures";

export interface HierarchicalSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BaseArchitectureNode[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  disabled?: boolean;
  id?: string;
}

export default function HierarchicalSelect({
  value,
  onChange,
  options,
  placeholder = "Select Base Architecture…",
  className = "",
  buttonClassName = "",
  popoverClassName = "",
  disabled = false,
  id: explicitId,
}: HierarchicalSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  // All groups are collapsed by default (empty state record)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const id = explicitId || generatedId;

  // Selected item display info
  const selectedDisplay = useMemo(() => getArchitectureDisplay(value), [value]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Toggle group expansion
  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupLabel]: !prev[groupLabel],
    }));
  };

  // Filter options by search query
  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;

    const results: BaseArchitectureNode[] = [];

    for (const node of options) {
      if (isArchitectureGroup(node)) {
        const groupMatches = node.label.toLowerCase().includes(q);
        const matchingOptions = node.options.filter(
          (opt) =>
            opt.label.toLowerCase().includes(q) ||
            opt.value.toLowerCase().includes(q),
        );

        if (groupMatches) {
          // If the group label itself matches, show all child options
          results.push(node);
        } else if (matchingOptions.length > 0) {
          // If only specific children match, show group with matching children
          results.push({
            label: node.label,
            options: matchingOptions,
          });
        }
      } else {
        if (
          node.label.toLowerCase().includes(q) ||
          node.value.toLowerCase().includes(q)
        ) {
          results.push(node);
        }
      }
    }

    return results;
  }, [options, searchQuery]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery("");
  };

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`group flex h-9 w-full items-center justify-between gap-2 rounded-[6px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] transition-all duration-150 outline-none hover:border-[var(--line-strong)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40 ${
          isOpen
            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20 bg-[var(--surface-raised)]"
            : ""
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {value ? (
            selectedDisplay.group ? (
              <div className="flex items-center gap-1.5 truncate">
                <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-soft)] border border-[var(--line)] shrink-0">
                  {selectedDisplay.group}
                </span>
                <span className="truncate font-bold text-[var(--ink)]">
                  {selectedDisplay.label}
                </span>
              </div>
            ) : (
              <span className="truncate font-bold text-[var(--ink)]">
                {selectedDisplay.label || value}
              </span>
            )
          ) : (
            <span className="truncate text-[var(--ink-faint)]">
              {placeholder}
            </span>
          )}
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)] transition-transform duration-200 group-hover:text-[var(--ink)] ${
            isOpen ? "rotate-180 text-[var(--accent)]" : ""
          }`}
        />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 top-full z-50 mt-1.5 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 overflow-hidden ${popoverClassName}`}
        >
          {/* Search Header */}
          <div className="p-2 border-b border-[var(--line)] bg-[var(--surface)]/50">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--ink-faint)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search base architecture (e.g. FLUX, SDXL, Wan)..."
                className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] pl-8 pr-7 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Hierarchical Option List */}
          <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs no-scrollbar">
            {filteredNodes.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--ink-faint)]">
                No matching architecture found
              </div>
            ) : (
              filteredNodes.map((node, nodeIdx) => {
                if (isArchitectureGroup(node)) {
                  // In search mode, auto-expand groups that have matches
                  // In normal mode, follow expandedGroups state (collapsed by default)
                  const isExpanded = isSearchActive
                    ? true
                    : !!expandedGroups[node.label];

                  const hasSelectedChild = node.options.some(
                    (opt) => opt.value === value,
                  );

                  return (
                    <div key={`group-${node.label}-${nodeIdx}`} className="space-y-0.5">
                      {/* Group Header (Accordion Toggle) */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(node.label)}
                        className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors group ${
                          hasSelectedChild
                            ? "bg-[var(--accent)]/5 text-[var(--accent)]"
                            : "text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronRight
                            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                              isExpanded
                                ? "rotate-90 text-[var(--accent)]"
                                : "text-[var(--ink-faint)] group-hover:text-[var(--ink)]"
                            }`}
                          />
                          <span className="truncate">{node.label}</span>
                          {hasSelectedChild && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0"
                              title="Active selection in this group"
                            />
                          )}
                        </div>
                        <span className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.2 text-[9px] text-[var(--ink-faint)]">
                          {node.options.length}
                        </span>
                      </button>

                      {/* Group Children (Indented) */}
                      {isExpanded && (
                        <div className="ml-3 pl-2.5 border-l border-[var(--line)] my-0.5 space-y-0.5 animate-in fade-in">
                          {node.options.map((opt) => {
                            const isSelected = opt.value === value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleSelect(opt.value)}
                                className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer select-none ${
                                  isSelected
                                    ? "bg-[var(--accent)]/15 font-bold text-[var(--accent)] shadow-sm"
                                    : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
                                }`}
                              >
                                <span className="truncate">{opt.label}</span>
                                {isSelected && (
                                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Standalone Item
                const isSelected = node.value === value;
                return (
                  <button
                    key={`item-${node.value}-${nodeIdx}`}
                    type="button"
                    onClick={() => handleSelect(node.value)}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer select-none ${
                      isSelected
                        ? "bg-[var(--accent)]/15 font-bold text-[var(--accent)] shadow-sm"
                        : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="truncate">{node.label}</span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
