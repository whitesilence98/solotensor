"use client";

import React from "react";
import { Loader2, ScanText, Sparkles, RefreshCw } from "lucide-react";

export interface QuickImageActionsProps {
  onReadImage?: () => void;
  onMatchDimensions?: () => void;
  onReplace?: () => void;
  interrogating?: boolean;
  canMatchDimensions?: boolean;
  disabled?: boolean;
  /** "docked" inside the preview slot (0px height shift) or "drawer" beneath it */
  layout?: "docked" | "drawer";
  /** Compact labels for narrow 2-column cards */
  compact?: boolean;
  className?: string;
}

/**
 * Standardized Obsidian darkroom action bar for image slots across all Studio tabs:
 * [Read Image] (Interrogate prompt/tags/settings)
 * [Match Size] (Snap canvas/video dimensions to image aspect ratio)
 * [Replace]    (Trigger file picker without clearing)
 */
export default function QuickImageActions({
  onReadImage,
  onMatchDimensions,
  onReplace,
  interrogating = false,
  canMatchDimensions = true,
  disabled = false,
  layout = "docked",
  compact = false,
  className = "",
}: QuickImageActionsProps) {
  const isDocked = layout === "docked";
  const actionCount =
    (onReadImage ? 1 : 0) + (onMatchDimensions ? 1 : 0) + (onReplace ? 1 : 0);
  const isCrowded = compact && actionCount > 1;

  return (
    <div
      className={
        isDocked
          ? `absolute bottom-0 inset-x-0 z-10 flex h-7 items-center justify-between ${
              isCrowded ? "gap-0.5 px-1" : "gap-1 px-1.5"
            } py-0.5 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-sunken)_88%,transparent)] backdrop-blur-md transition-all duration-200 ease-out motion-reduce:transition-none ${className}`
          : `flex items-center gap-1.5 pt-1 transition-all duration-200 ease-out motion-reduce:transition-none ${className}`
      }
      role="toolbar"
      aria-label="Image actions"
    >
      {/* 1. Read Image / Auto-Prompt Interrogator */}
      {onReadImage && (
        <button
          type="button"
          onClick={onReadImage}
          disabled={disabled || interrogating}
          title="Extract prompt, seed, sampler & tags from this image"
          aria-label={interrogating ? "Reading image metadata…" : "Read prompt from image"}
          className={`flex flex-1 min-w-0 items-center justify-center ${
            isCrowded ? "gap-0.5 px-1 text-[9.5px]" : "gap-1 px-1.5 text-[10px]"
          } rounded-md border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] font-medium text-[var(--accent)] transition-all hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none ${
            isDocked ? "h-5.5 py-0" : "h-7"
          }`}
        >
          {interrogating ? (
            <Loader2 className="h-3 w-3 animate-spin shrink-0 text-[var(--accent)]" />
          ) : (
            <ScanText className="h-3 w-3 shrink-0 text-[var(--accent)]" />
          )}
          <span className="truncate">
            {interrogating ? "Reading…" : compact ? "Read" : "Read Image"}
          </span>
        </button>
      )}

      {/* 2. Match Dimensions */}
      {onMatchDimensions && (
        <button
          type="button"
          onClick={onMatchDimensions}
          disabled={disabled || !canMatchDimensions}
          title="Adjust canvas dimensions to match image natural aspect ratio"
          aria-label="Match canvas dimensions to image"
          className={`flex flex-1 min-w-0 items-center justify-center ${
            isCrowded ? "gap-0.5 px-1 text-[9.5px]" : "gap-1 px-1.5 text-[10px]"
          } rounded-md border border-[var(--line)] bg-[var(--surface-raised)] font-medium text-[var(--ink)] transition-all hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none ${
            isDocked ? "h-5.5 py-0" : "h-7"
          }`}
        >
          <Sparkles className="h-3 w-3 shrink-0 text-[var(--accent)]" />
          <span className="truncate">
            {compact ? "Match" : "Match Size"}
          </span>
        </button>
      )}

      {/* 3. Replace Image */}
      {onReplace && (
        <button
          type="button"
          onClick={onReplace}
          disabled={disabled}
          title="Choose a replacement image"
          aria-label="Replace current image"
          className={`flex flex-1 min-w-0 items-center justify-center ${
            isCrowded ? "gap-0.5 px-1 text-[9.5px]" : "gap-1 px-1.5 text-[10px]"
          } rounded-md border border-[var(--line)] bg-[var(--surface-raised)] font-medium text-[var(--ink-soft)] transition-all hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none ${
            isDocked ? "h-5.5 py-0" : "h-7"
          }`}
        >
          <RefreshCw className="h-3 w-3 shrink-0 text-[var(--ink-faint)]" />
          <span className="truncate">
            {isCrowded ? "Swap" : "Replace"}
          </span>
        </button>
      )}
    </div>
  );
}
