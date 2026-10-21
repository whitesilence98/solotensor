"use client";

import React from "react";
import type { ToolAspectRatio } from "@/lib/api";

export type AspectRatioKey = ToolAspectRatio | "3:2" | "2:3" | "3:4" | "custom" | string;

export interface AspectRatioOption<T extends string = string> {
  value: T;
  label?: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface AspectRatioSelectorProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options?: readonly T[] | readonly AspectRatioOption<T>[];
  label?: string;
  showLabel?: boolean;
  showSelectedBadge?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  columns?: number;
  className?: string;
  buttonClassName?: string;
  id?: string;
}

const DEFAULT_TOOL_RATIOS: ToolAspectRatio[] = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "21:9",
];

/**
 * Geometric miniature representation of an aspect ratio.
 */
export function AspectRatioIcon({
  ratio,
  className = "",
}: {
  ratio: string;
  className?: string;
}) {
  switch (ratio) {
    case "1:1":
      return (
        <div
          className={`h-3 w-3 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "16:9":
      return (
        <div
          className={`h-2 w-3.5 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "9:16":
      return (
        <div
          className={`h-3.5 w-2 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "4:3":
      return (
        <div
          className={`h-2.5 w-3.5 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "3:4":
      return (
        <div
          className={`h-3.5 w-2.5 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "3:2":
      return (
        <div
          className={`h-2.5 w-3.75 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "2:3":
      return (
        <div
          className={`h-3.75 w-2.5 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "21:9":
      return (
        <div
          className={`h-1.5 w-4 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    case "custom":
      return (
        <div
          className={`h-3 w-3 rounded-[1px] border border-dashed border-current flex items-center justify-center opacity-80 ${className}`}
          aria-hidden="true"
        >
          <div className="h-1 w-1 bg-current rounded-[0.5px]" />
        </div>
      );
    default: {
      // Dynamic fallback based on parsing ratio string like "W:H"
      const parts = ratio.split(":").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] > 0 && parts[1] > 0) {
        const [w, h] = parts;
        const maxDim = 14; // pixels
        const scale = maxDim / Math.max(w, h);
        const widthPx = Math.max(6, Math.min(16, Math.round(w * scale)));
        const heightPx = Math.max(6, Math.min(16, Math.round(h * scale)));
        return (
          <div
            style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
            className={`rounded-[1px] border border-current ${className}`}
            aria-hidden="true"
          />
        );
      }
      return (
        <div
          className={`h-3 w-3 rounded-[1px] border border-current ${className}`}
          aria-hidden="true"
        />
      );
    }
  }
}

/**
 * High-craft Obsidian darkroom Aspect Ratio selector.
 */
export default function AspectRatioSelector<T extends string = string>({
  value,
  onChange,
  options = DEFAULT_TOOL_RATIOS as unknown as readonly T[],
  label = "Aspect Ratio Format",
  showLabel = true,
  showSelectedBadge = true,
  disabled = false,
  size = "md",
  columns,
  className = "",
  buttonClassName = "",
  id,
}: AspectRatioSelectorProps<T>) {
  // Normalize options into { value, label, sublabel, disabled }
  const normalizedOptions: AspectRatioOption<T>[] = React.useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "object" && opt !== null && "value" in opt) {
        return opt as AspectRatioOption<T>;
      }
      return {
        value: opt as T,
        label: String(opt),
      };
    });
  }, [options]);

  // Determine grid column class
  const colCount = columns ?? (
    normalizedOptions.length <= 3
      ? 3
      : normalizedOptions.length === 4
        ? 4
        : normalizedOptions.length === 5
          ? 5
          : normalizedOptions.length === 6
            ? 3 // 2 rows of 3
            : 5
  );

  const gridColsClass =
    colCount === 2
      ? "grid-cols-2"
      : colCount === 3
        ? "grid-cols-3"
        : colCount === 4
          ? "grid-cols-4"
          : colCount === 6
            ? "grid-cols-3 sm:grid-cols-6"
            : "grid-cols-5";

  // Size styling variants
  const sizeStyles = {
    sm: "py-1.5 px-1 text-[9px] gap-1",
    md: "py-2 px-1.5 text-[10px] gap-1",
    lg: "py-2.5 px-2 text-xs gap-1.5",
  }[size];

  return (
    <div className={`space-y-1.5 ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={id}
            className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]"
          >
            {label}
          </label>
          {showSelectedBadge && (
            <span className="font-mono text-[10px] font-bold text-[var(--accent)] tabular-nums">
              {value}
            </span>
          )}
        </div>
      )}

      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        className={`grid ${gridColsClass} gap-1.5`}
      >
        {normalizedOptions.map((opt) => {
          const active = value === opt.value;
          const itemDisabled = disabled || opt.disabled;

          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={itemDisabled}
              onClick={() => onChange(opt.value)}
              className={`flex flex-col items-center justify-center rounded-lg border text-center font-mono font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] ${sizeStyles} ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_8px_rgba(213,240,111,0.15)]"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              } ${buttonClassName}`}
            >
              <AspectRatioIcon ratio={opt.value} />
              <span className="truncate max-w-full leading-none">
                {opt.label ?? opt.value}
              </span>
              {opt.sublabel && (
                <span className="font-mono text-[8px] opacity-60 leading-none truncate max-w-full">
                  {opt.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
