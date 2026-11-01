"use client";

import React from "react";
import { Box, ChevronRight, ExternalLink, Lock, RefreshCw } from "lucide-react";
import type { InstalledGalleryModel, PublicModelSummary } from "@/lib/api";
import { resolveModelGalleryUrl } from "@/lib/models";
import LoraStackPanel, { type ActiveLora } from "./LoraStackPanel";

export type { ActiveLora };

export interface ModelLoraStackProps {
  // Model Card Configuration
  selectedModel: InstalledGalleryModel | null;
  coverUrl?: string | null;
  baseModelTag?: string;
  onOpenModelPicker: () => void;
  fallbackTitle?: string;
  isLocked?: boolean;
  lockedBadge?: string;
  sectionTitle?: string; // Default: "GENERATION MODEL"
  showGalleryLink?: boolean; // Default: true

  // LoRA Stack Configuration
  loras: ActiveLora[];
  onLorasChange: (loras: ActiveLora[]) => void;
  onOpenLoraPicker: () => void;
  maxLoras?: number; // Default: 5

  // Shared Studio Context & Metadata
  modelOptions?: InstalledGalleryModel[];
  publicModels?: PublicModelSummary[];
  publicModelMap?: Map<string, PublicModelSummary>;
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export default function ModelLoraStack({
  selectedModel,
  coverUrl = null,
  baseModelTag = "",
  onOpenModelPicker,
  fallbackTitle,
  isLocked = false,
  lockedBadge = "Workflow Default",
  sectionTitle = "GENERATION MODEL",
  showGalleryLink = true,
  loras,
  onLorasChange,
  onOpenLoraPicker,
  maxLoras = 5,
  modelOptions = [],
  publicModels = [],
  publicModelMap,
  prompt = "",
  onPromptChange,
  disabled = false,
  loading = false,
  className = "",
}: ModelLoraStackProps) {
  const modelUrl =
    showGalleryLink && selectedModel
      ? resolveModelGalleryUrl(
          {
            modelId: selectedModel.model_id,
            title: selectedModel.title,
            filename: selectedModel.filename,
            fileId: selectedModel.file_id,
          },
          modelOptions,
          publicModels
        ) || (selectedModel.model_id ? `/models/${selectedModel.model_id}` : null)
      : null;

  const actionLabel = sectionTitle.toLowerCase().includes("basic") ? "Replace" : "Change";

  if (loading && !selectedModel) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
            {sectionTitle}
          </span>
          <div className="h-4 w-14 rounded-xl bg-[var(--surface-soft)] shimmer" />
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 min-w-0">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-[var(--surface-soft)] shimmer border border-[var(--line)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-[var(--surface-soft)] shimmer" />
            <div className="h-2.5 w-1/2 rounded bg-[var(--surface-soft)] shimmer mt-1.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 1. Model Card Header & Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
              {sectionTitle}
            </span>
            {baseModelTag && (
              <span
                className="shrink-0 max-w-[120px] truncate rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[9px] font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]"
                title={baseModelTag}
              >
                {baseModelTag}
              </span>
            )}
          </div>
          {!isLocked ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onOpenModelPicker}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{actionLabel}</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--ink-faint)]">
              <Lock className="h-2.5 w-2.5 opacity-70" />
              <span>{lockedBadge}</span>
            </span>
          )}
        </div>

        <div className="flex items-stretch gap-1.5 min-w-0">
          <button
            type="button"
            disabled={disabled || isLocked}
            onClick={disabled || isLocked ? undefined : onOpenModelPicker}
            aria-label={selectedModel ? `Selected model: ${selectedModel.title}` : "Select model"}
            className={`group flex flex-1 items-center gap-2.5 rounded-xl border border-[var(--line)] p-2.5 text-left transition ${
              disabled || isLocked
                ? "bg-[var(--surface-sunken)]/60 opacity-80 cursor-default"
                : "bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
            }`}
          >
            {/* Cover Preview Thumbnail */}
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]">
              {coverUrl ? (
                <>
                  <img
                    src={coverUrl}
                    alt={selectedModel?.title ?? "Model preview"}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 grid place-items-center text-[var(--accent)] opacity-60 pointer-events-none">
                    <Box className="h-5 w-5" />
                  </div>
                </>
              ) : (
                <div className="grid h-full w-full place-items-center bg-[var(--surface-soft)] text-[var(--accent)]">
                  <Box className="h-5 w-5 opacity-75" />
                </div>
              )}
              {selectedModel?.version_name && (
                <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[var(--media-scrim-strong)] via-[var(--media-scrim)] to-transparent pb-0.5 pt-2.5 px-1 pointer-events-none">
                  <span className="block truncate font-mono text-[8px] font-bold text-[var(--ink)] drop-shadow-[0_1px_2px_var(--overlay)]">
                    {selectedModel.version_name}
                  </span>
                </div>
              )}
            </div>

            {/* Title & Metadata */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="truncate min-w-0 block text-xs font-bold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors"
                  title={selectedModel?.title ?? fallbackTitle ?? "Select Model"}
                >
                  {selectedModel?.title || fallbackTitle || "Select Model"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1 min-w-0">
                {baseModelTag && (
                  <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)]">
                    {baseModelTag}
                  </span>
                )}
                <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--ink-faint)]">
                  {isLocked
                    ? "Bundled Workflow"
                    : selectedModel?.model_type || "Diffusion Model"}
                </span>
              </div>
            </div>

            {/* Right Action Chevron or Locked Badge */}
            {!isLocked ? (
              <ChevronRight className="h-4 w-4 text-[var(--ink-faint)] group-hover:text-[var(--accent)] transition-transform group-hover:translate-x-0.5 shrink-0" />
            ) : (
              <span className="font-mono text-[9px] text-[var(--ink-faint)] px-1 uppercase tracking-wider shrink-0">
                Locked
              </span>
            )}
          </button>

          {/* External Model Gallery Link */}
          {modelUrl && (
            <a
              href={modelUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View model in gallery"
              title="View in Model Gallery"
              className="flex items-center justify-center rounded-xl border border-[var(--line)] px-2.5 text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:text-[var(--accent)] transition shrink-0 bg-[var(--surface)] hover:bg-[var(--surface-raised)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* 2. LoRA Stack Panel */}
      <LoraStackPanel
        loras={loras}
        onLorasChange={onLorasChange}
        onOpenPicker={onOpenLoraPicker}
        selectedModel={selectedModel}
        modelOptions={modelOptions}
        publicModels={publicModels}
        publicModelMap={publicModelMap}
        prompt={prompt}
        onPromptChange={onPromptChange}
        disabled={disabled}
        maxLoras={maxLoras}
      />
    </div>
  );
}
