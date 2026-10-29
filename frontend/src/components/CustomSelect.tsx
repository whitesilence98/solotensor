"use client";

import React, { useCallback, useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

const PANEL_GAP = 6;
const VIEWPORT_EDGE = 8;
const PANEL_MIN_WIDTH = 176; // today's 11rem

export interface CustomSelectOption {
  value: string;
  label: string;
  badge?: string;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: (CustomSelectOption | string)[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  disabled?: boolean;
  align?: "left" | "right";
  id?: string;
  icon?: React.ReactNode;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option…",
  ariaLabel,
  className = "",
  buttonClassName = "",
  popoverClassName = "",
  disabled = false,
  align = "left",
  id: explicitId,
  icon,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const id = explicitId || generatedId;

  // Normalize options to object format
  const normalizedOptions: CustomSelectOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // The panel is portalled to <body>, so its coordinates come from the trigger's
  // viewport rect. Placing it here lets it escape overflow-clipped scroll areas.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Read the natural (content-driven) width with the inline minimum removed.
    const previousMinWidth = panel.style.minWidth;
    panel.style.minWidth = "0px";
    const naturalWidth = panel.offsetWidth;

    const minWidth = Math.min(
      Math.max(naturalWidth, rect.width, PANEL_MIN_WIDTH),
      vw - VIEWPORT_EDGE * 2,
    );
    panel.style.minWidth = `${minWidth}px`;
    const height = panel.offsetHeight;
    panel.style.minWidth = previousMinWidth;

    const spaceBelow = vh - rect.bottom - PANEL_GAP;
    const spaceAbove = rect.top - PANEL_GAP;
    const placeAbove = height > spaceBelow && spaceAbove > spaceBelow;

    let top = placeAbove
      ? rect.top - PANEL_GAP - height
      : rect.bottom + PANEL_GAP;
    let left = align === "right" ? rect.right - minWidth : rect.left;

    left = Math.max(
      VIEWPORT_EDGE,
      Math.min(left, vw - minWidth - VIEWPORT_EDGE),
    );
    top = Math.max(
      VIEWPORT_EDGE,
      Math.min(top, vh - height - VIEWPORT_EDGE),
    );

    setPosition({ top, left, minWidth });
  }, [align]);

  // Place on open; reset while closed so a reopen never flashes stale coords.
  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [isOpen, updatePosition]);

  // Track the trigger while scrolling/resizing. The real scroller is an ancestor
  // (main.workspace-scroll), and element scroll events do not bubble — capture.
  useEffect(() => {
    if (!isOpen) return;

    let frame = 0;
    const schedule = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return; // internal scroll
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updatePosition();
      });
    };

    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [isOpen, updatePosition]);

  // Close when clicking outside either the trigger or the portalled panel.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
      const nextIndex =
        e.key === "ArrowDown"
          ? (currentIndex + 1) % normalizedOptions.length
          : (currentIndex - 1 + normalizedOptions.length) % normalizedOptions.length;

      const nextOption = normalizedOptions[nextIndex];
      if (nextOption) {
        onChange(nextOption.value);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (isOpen) {
        setIsOpen(false);
      }
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || selectedOption?.label || placeholder}
        className={`group flex h-8 items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 text-xs font-medium text-[var(--ink)] transition-all duration-150 outline-none hover:border-[var(--line-strong)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40 ${
          isOpen
            ? "border-[var(--line-strong)] ring-2 ring-[var(--accent)]/20 bg-[var(--surface-raised)]"
            : ""
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-[var(--ink-faint)] transition-transform duration-200 group-hover:text-[var(--ink)] ${
            isOpen ? "rotate-180 text-[var(--accent)]" : ""
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              top: position?.top,
              left: position?.left,
              minWidth: position?.minWidth,
              maxWidth: "calc(100vw - 1rem)",
              visibility: position ? undefined : "hidden",
            }}
            className={`fixed z-[60] max-h-64 overflow-y-auto rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 no-scrollbar ${popoverClassName}`}
          >
            <ul
              ref={listboxRef}
              role="listbox"
              aria-activedescendant={value}
              tabIndex={-1}
              className="space-y-0.5"
            >
              {normalizedOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={`flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none ${
                      isSelected
                        ? "bg-[var(--accent)]/10 font-semibold text-[var(--accent)]"
                        : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[9px] text-[var(--ink-faint)]">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="h-3 w-3 text-[var(--accent)]" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
