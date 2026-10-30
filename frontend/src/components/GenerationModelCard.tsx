"use client";

import type { InstalledGalleryModel } from "@/lib/api";
import { Box, ChevronRight, Lock, RefreshCw } from "lucide-react";

export interface GenerationModelCardProps {
  selectedModel: InstalledGalleryModel | null;
  coverUrl?: string | null;
  baseModelTag?: string;
  onOpenPicker: () => void;
  fallbackTitle?: string;
  disabled?: boolean;
  disabledBadge?: string;
}

export default function GenerationModelCard({
  selectedModel,
  coverUrl = null,
  baseModelTag = "",
  onOpenPicker,
  fallbackTitle,
  disabled = false,
  disabledBadge = "Workflow Default",
}: GenerationModelCardProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
          GENERATION MODEL
        </span>
        {!disabled ? (
          <button
            type="button"
            onClick={onOpenPicker}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Change</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--ink-faint)]">
            <Lock className="h-2.5 w-2.5 opacity-70" />
            <span>{disabledBadge}</span>
          </span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={disabled ? undefined : onOpenPicker}
        className={`group flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] p-2.5 text-left transition ${
          disabled
            ? "bg-[var(--surface-sunken)]/60 opacity-80 cursor-default"
            : "bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
        }`}
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={selectedModel?.title ?? "Model preview"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[var(--accent)]">
              <Box className="h-5 w-5 opacity-75" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-bold text-[var(--ink)]">
              {selectedModel?.title || (fallbackTitle ?? "Krea 2 Turbo")}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {baseModelTag && (
              <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)]">
                {baseModelTag}
              </span>
            )}
            <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--ink-faint)]">
              {disabled ? "Bundled Workflow" : (selectedModel?.model_type || "Diffusion Model")}
            </span>
          </div>
        </div>
        {!disabled ? (
          <ChevronRight className="h-4 w-4 text-[var(--ink-faint)] group-hover:text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
        ) : (
          <span className="font-mono text-[9px] text-[var(--ink-faint)] px-1 uppercase tracking-wider">
            Locked
          </span>
        )}
      </button>
    </div>
  );
}
