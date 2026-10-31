"use client";

import React, { useCallback, useMemo } from "react";
import {
  Layers,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  Minus,
  Plus,
} from "lucide-react";
import {
  resolveMediaUrl,
  type InstalledGalleryModel,
  type PublicModelSummary,
} from "@/lib/api";
import { resolveModelGalleryUrl } from "@/lib/models";
import { isArchitectureCompatible } from "@/lib/baseModelArchitectures";

export interface ActiveLora {
  id: string;
  title: string;
  baseModel: string;
  weight: number;
  modelId?: string;
  versionId?: string;
  fileId?: string;
  thumbnailUrl?: string | null;
  enabled?: boolean;
  triggerWords?: string[];
  category?: string;
}

export interface LoraStackPanelProps {
  loras: ActiveLora[];
  onLorasChange: (loras: ActiveLora[]) => void;
  onOpenPicker: () => void;
  selectedModel?: InstalledGalleryModel | null;
  modelOptions?: InstalledGalleryModel[];
  publicModels?: PublicModelSummary[];
  publicModelMap?: Map<string, PublicModelSummary>;
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  maxLoras?: number;
  disabled?: boolean;
  className?: string;
}

export default function LoraStackPanel({
  loras,
  onLorasChange,
  onOpenPicker,
  selectedModel,
  modelOptions = [],
  publicModels = [],
  publicModelMap,
  prompt = "",
  onPromptChange,
  maxLoras = 5,
  disabled = false,
  className = "",
}: LoraStackPanelProps) {
  // Update weight clamped to [0.0, 1.0] in 0.05 increments
  const updateLoraWeight = useCallback(
    (id: string, nextWeight: number) => {
      const clamped = Math.max(0, Math.min(1, Math.round(nextWeight * 100) / 100));
      onLorasChange(
        loras.map((l) => (l.id === id ? { ...l, weight: clamped } : l))
      );
    },
    [loras, onLorasChange]
  );

  // Toggle mute / unmute
  const toggleLora = useCallback(
    (id: string) => {
      onLorasChange(
        loras.map((l) =>
          l.id === id ? { ...l, enabled: l.enabled === false ? true : false } : l
        )
      );
    },
    [loras, onLorasChange]
  );

  // Remove single LoRA
  const removeLora = useCallback(
    (id: string) => {
      onLorasChange(loras.filter((l) => l.id !== id));
    },
    [loras, onLorasChange]
  );

  // Clear all LoRAs
  const handleClearAll = useCallback(() => {
    onLorasChange([]);
  }, [onLorasChange]);

  // Insert single trigger word into prompt
  const insertTriggerWord = useCallback(
    (word: string) => {
      if (!onPromptChange) return;
      const current = prompt ?? "";
      if (!current.trim()) {
        onPromptChange(word);
        return;
      }
      const regex = new RegExp(
        `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      );
      if (regex.test(current)) return;
      onPromptChange(`${current.trim()}, ${word}`);
    },
    [prompt, onPromptChange]
  );

  // Insert all trigger words into prompt
  const insertAllTriggerWords = useCallback(
    (words: string[]) => {
      if (!onPromptChange || !words.length) return;
      const current = prompt ?? "";
      const toAdd: string[] = [];
      for (const w of words) {
        const regex = new RegExp(
          `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        );
        if (!regex.test(current)) {
          toAdd.push(w);
        }
      }
      if (!toAdd.length) return;
      if (!current.trim()) {
        onPromptChange(toAdd.join(", "));
      } else {
        onPromptChange(`${current.trim()}, ${toAdd.join(", ")}`);
      }
    },
    [prompt, onPromptChange]
  );

  // Check compatibility of each LoRA with current selectedModel
  const checkLoraCompatible = useCallback(
    (lora: ActiveLora) => {
      if (!selectedModel) return true;
      const modelArch = selectedModel.base_model || selectedModel.title || "";
      return isArchitectureCompatible(modelArch, lora.baseModel);
    },
    [selectedModel]
  );

  const incompatibleLoras = useMemo(
    () => loras.filter((l) => !checkLoraCompatible(l)),
    [loras, checkLoraCompatible]
  );

  const handleRemoveIncompatible = useCallback(() => {
    onLorasChange(loras.filter((l) => checkLoraCompatible(l)));
  }, [loras, checkLoraCompatible, onLorasChange]);

  const isLimitReached = loras.length >= maxLoras;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Section Header with count and clear action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
            LoRA
          </span>
          <span className="rounded-xl bg-[var(--surface-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--ink-faint)]">
            {loras.length}/{maxLoras}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {incompatibleLoras.length > 0 && (
            <button
              type="button"
              onClick={handleRemoveIncompatible}
              disabled={disabled}
              className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 transition disabled:opacity-50"
              title="Remove LoRAs that do not match the current model architecture"
            >
              Remove incompatible ({incompatibleLoras.length})
            </button>
          )}
          {loras.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={disabled}
              className="text-[10px] font-medium text-[var(--ink-faint)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)] transition disabled:opacity-50"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Stacked Active LoRA Cards */}
      {loras.length > 0 && (
        <div className="space-y-2.5">
          {loras.map((lora) => {
            const isMuted = lora.enabled === false;
            const isCompatible = checkLoraCompatible(lora);

            // Resolve thumbnail cover
            const loraCover = resolveMediaUrl(
              lora.thumbnailUrl ||
                modelOptions.find(
                  (m) =>
                    (lora.modelId && m.model_id === lora.modelId) ||
                    (lora.fileId && m.file_id === lora.fileId) ||
                    m.title === lora.title
                )?.cover_url ||
                (lora.modelId && publicModelMap
                  ? publicModelMap.get(lora.modelId)?.cover_url
                  : null) ||
                publicModels.find(
                  (p) =>
                    (lora.modelId && p.model_id === lora.modelId) ||
                    p.title.toLowerCase() === lora.title.toLowerCase()
                )?.cover_url ||
                null
            );

            // Resolve external gallery URL
            const loraUrl = resolveModelGalleryUrl(
              {
                modelId: lora.modelId,
                fileId: lora.fileId,
                title: lora.title,
              },
              modelOptions,
              publicModels
            );

            const clampedWeight = Math.max(
              0,
              Math.min(1, typeof lora.weight === "number" ? lora.weight : 0.8)
            );
            const percent = Math.round(clampedWeight * 100);

            return (
              <div
                key={lora.id}
                className={`relative rounded-xl border p-3 transition hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] ${
                  !isCompatible
                    ? "border-rose-500/40 bg-rose-950/20"
                    : "border-[var(--line)] bg-[var(--surface)]"
                } ${isMuted ? "opacity-60 bg-[var(--surface-raised)]" : ""}`}
              >
                {/* Top Row: Badge, Title & Power/Delete Actions */}
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] grid place-items-center">
                    {loraCover ? (
                      <>
                        <img
                          src={loraCover}
                          alt={lora.title}
                          className="asset-zoom-media relative z-10 h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                        />
                        <div className="absolute inset-0 grid place-items-center text-[var(--accent)] opacity-60">
                          <Layers className="h-5 w-5" />
                        </div>
                      </>
                    ) : (
                      <Layers className="h-5 w-5 text-[var(--accent)] opacity-80" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Title Row */}
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                        <span
                          className="truncate min-w-0 block text-xs font-bold text-[var(--ink)]"
                          title={lora.title}
                        >
                          {lora.title}
                        </span>
                        {lora.baseModel && (
                          <span
                            className="shrink-0 max-w-[100px] truncate rounded-xl bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--ink-faint)]"
                            title={lora.baseModel}
                          >
                            {lora.baseModel}
                          </span>
                        )}
                        {!isCompatible && (
                          <span
                            className="shrink-0 rounded-md bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[9px] font-mono font-bold text-rose-400"
                            title={`Incompatible with ${selectedModel?.title || selectedModel?.base_model || "active model"}`}
                          >
                            Incompatible
                          </span>
                        )}
                      </div>

                      {/* Quick Action Icons: Gallery Link, Mute/Power & Remove */}
                      <div className="flex items-center gap-1 shrink-0">
                        {loraUrl && (
                          <a
                            href={loraUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View in Model Gallery"
                            aria-label={`View ${lora.title} in gallery`}
                            className="p-1 rounded-xl text-[var(--ink-faint)] hover:text-[var(--accent)] focus-visible:text-[var(--accent)] transition"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleLora(lora.id)}
                          disabled={disabled}
                          title={isMuted ? "Enable LoRA" : "Mute LoRA"}
                          aria-label={isMuted ? `Enable ${lora.title}` : `Mute ${lora.title}`}
                          className={`p-1 rounded-xl transition ${
                            isMuted
                              ? "text-[var(--ink-faint)] hover:text-[var(--accent)] focus-visible:text-[var(--accent)]"
                              : "text-[var(--accent)] hover:text-[var(--ink-faint)] focus-visible:text-[var(--ink-faint)]"
                          }`}
                        >
                          {isMuted ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLora(lora.id)}
                          disabled={disabled}
                          title="Remove LoRA"
                          aria-label={`Remove ${lora.title}`}
                          className="p-1 rounded-xl text-[var(--ink-faint)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)] transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Slider Row with fine steppers */}
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="relative flex-1 flex items-center">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={clampedWeight}
                          disabled={isMuted || disabled}
                          onChange={(e) =>
                            updateLoraWeight(lora.id, parseFloat(e.target.value))
                          }
                          style={{
                            background: isMuted
                              ? `linear-gradient(to right, var(--ink-faint) 0%, var(--ink-faint) ${percent}%, var(--surface-soft) ${percent}%, var(--surface-soft) 100%)`
                              : `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--surface-soft) ${percent}%, var(--surface-soft) 100%)`,
                          }}
                          className="workspace-range w-full"
                          aria-label={`${lora.title} weight slider`}
                        />
                      </div>

                      {/* Numeric Weight Badge */}
                      <div className="flex h-6 min-w-[2.6rem] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-1.5 font-mono text-[11px] font-bold text-[var(--ink)]">
                        {clampedWeight.toFixed(2)}
                      </div>

                      {/* Decrement Stepper */}
                      <button
                        type="button"
                        disabled={isMuted || disabled || clampedWeight <= 0}
                        onClick={() => updateLoraWeight(lora.id, clampedWeight - 0.05)}
                        className="flex h-6 w-6 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] active:scale-95 disabled:opacity-40 transition"
                        title="Decrease (-0.05)"
                        aria-label={`Decrease ${lora.title} weight`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>

                      {/* Increment Stepper */}
                      <button
                        type="button"
                        disabled={isMuted || disabled || clampedWeight >= 1}
                        onClick={() => updateLoraWeight(lora.id, clampedWeight + 0.05)}
                        className="flex h-6 w-6 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] active:scale-95 disabled:opacity-40 transition"
                        title="Increase (+0.05)"
                        aria-label={`Increase ${lora.title} weight`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Trigger Words Section */}
                    {lora.triggerWords && lora.triggerWords.length > 0 && onPromptChange && (
                      <div className="mt-2 border-t border-[var(--line)] pt-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-semibold text-[var(--ink-faint)] uppercase tracking-wider">
                            Trigger Words
                          </span>
                          <button
                            type="button"
                            onClick={() => insertAllTriggerWords(lora.triggerWords!)}
                            disabled={disabled}
                            className="text-[9px] font-semibold text-[var(--accent)] hover:underline focus-visible:underline disabled:opacity-50"
                          >
                            + Add all
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {lora.triggerWords.map((tw) => (
                            <button
                              key={tw}
                              type="button"
                              onClick={() => insertTriggerWord(tw)}
                              disabled={disabled}
                              title={`Click to append "${tw}" to prompt`}
                              className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-soft)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] hover:text-[var(--accent)] focus-visible:text-[var(--accent)] border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-soft)] transition disabled:opacity-50"
                            >
                              <span>{tw}</span>
                              <Plus className="h-2.5 w-2.5 opacity-60" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add LoRA Adapter Button */}
      <button
        type="button"
        onClick={onOpenPicker}
        disabled={isLimitReached || disabled}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] py-2.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] focus-visible:bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] disabled:opacity-50 transition active:scale-[0.99]"
      >
        <Plus className="h-4 w-4 text-[var(--accent)]" />
        <span>
          {isLimitReached
            ? `LoRA Limit Reached (${loras.length}/${maxLoras})`
            : `Add LoRA Adapter (${loras.length}/${maxLoras})`}
        </span>
      </button>
    </div>
  );
}
