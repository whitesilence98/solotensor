"use client";

import React, { useEffect, useRef, useState, useId } from "react";
import { Check, ChevronDown } from "lucide-react";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const id = explicitId || generatedId;

  // Normalize options to object format
  const normalizedOptions: CustomSelectOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

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

      {isOpen && (
        <div
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } top-full z-50 mt-1.5 min-w-[11rem] max-h-64 overflow-y-auto rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 no-scrollbar ${popoverClassName}`}
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
        </div>
      )}
    </div>
  );
}
