"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { InstalledGalleryModel } from "@/lib/api";

export type FormatKey = "1:1" | "16:9" | "9:16" | "4:3" | "3:2" | "custom";
export type TensorMode = "Text2Img" | "Img2Img" | "Edit" | "Video" | "Prime";

export interface ActiveLora {
  id: string;
  title: string;
  baseModel: string;
  weight: number;
  modelId?: string;
  versionId?: string;
  fileId?: string;
  thumbnailUrl?: string;
}

export interface ActiveEmbedding {
  id: string;
  title: string;
  baseModel: string;
  weight: number;
  thumbnailUrl?: string;
}

const FORMATS: { value: FormatKey; label: string }[] = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "custom", label: "Custom" },
];

const MODES: { id: TensorMode; label: string; icon?: typeof Sparkles; isPrime?: boolean }[] = [
  { id: "Text2Img", label: "Text2Img" },
  { id: "Img2Img", label: "Img2Img" },
  { id: "Edit", label: "Edit" },
  { id: "Video", label: "Video" },
  { id: "Prime", label: "Prime", isPrime: true },
];

interface Props {
  selectedModel: InstalledGalleryModel | null;
  modelOptions: InstalledGalleryModel[];
  onModelChange: (key: string) => void;
  baseModel: InstalledGalleryModel | null;
  baseModelOptions: InstalledGalleryModel[];
  onBaseModelChange: (key: string) => void;
  loras: ActiveLora[];
  onLorasChange: (loras: ActiveLora[]) => void;
  embeddings: ActiveEmbedding[];
  onEmbeddingsChange: (embeddings: ActiveEmbedding[]) => void;
  seed: string;
  onSeedChange: (v: string) => void;
  steps: string;
  onStepsChange: (v: string) => void;
  cfg: string;
  onCfgChange: (v: string) => void;
  denoise: string;
  onDenoiseChange: (v: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (v: string) => void;
  customWidth: string;
  onCustomWidthChange: (v: string) => void;
  customHeight: string;
  onCustomHeightChange: (v: string) => void;
  format: FormatKey;
  onFormatChange: (v: FormatKey) => void;
  busy: boolean;
  modelsLoading?: boolean;
  modelsError?: string | null;
}

export default function ControlPanel(props: Props) {
  const {
    selectedModel,
    modelOptions,
    onModelChange,
    loras,
    onLorasChange,
    embeddings,
    onEmbeddingsChange,
    seed,
    onSeedChange,
    steps,
    onStepsChange,
    cfg,
    onCfgChange,
    denoise,
    onDenoiseChange,
    negativePrompt,
    onNegativePromptChange,
    customWidth,
    onCustomWidthChange,
    customHeight,
    onCustomHeightChange,
    format,
    onFormatChange,
    busy,
    modelsLoading,
    modelsError,
  } = props;

  const [activeMode, setActiveMode] = useState<TensorMode>("Text2Img");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [loraPickerOpen, setLoraPickerOpen] = useState(false);
  const [embeddingPickerOpen, setEmbeddingPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [infoTooltip, setInfoTooltip] = useState<string | null>(null);

  // Available base models (Checkpoint or Diffusion Model)
  const baseModels = useMemo(
    () => modelOptions.filter((m) => m.model_type === "Checkpoint" || m.model_type === "Diffusion Model"),
    [modelOptions]
  );

  // Available LoRA models from gallery
  const galleryLoras = useMemo(
    () => modelOptions.filter((m) => m.model_type === "LoRA" || m.model_type === "LyCORIS"),
    [modelOptions]
  );

  // Derive active base model name tag (e.g. KREA_2 or SDXL)
  const baseModelTag = useMemo(() => {
    if (!selectedModel) return "KREA_2";
    if (selectedModel.title.toLowerCase().includes("krea")) return "KREA_2";
    if (selectedModel.title.toLowerCase().includes("sdxl")) return "SDXL";
    if (selectedModel.title.toLowerCase().includes("flux")) return "FLUX.1";
    if (selectedModel.title.toLowerCase().includes("turbo") || selectedModel.title.toLowerCase().includes("z image")) return "Z-Image";
    return selectedModel.title.split(" ")[0].toUpperCase();
  }, [selectedModel]);

  // Adjust LoRA weight
  const updateLoraWeight = (id: string, nextWeight: number) => {
    const clamped = Math.round(Math.min(2.0, Math.max(-2.0, nextWeight)) * 10) / 10;
    onLorasChange(loras.map((l) => (l.id === id ? { ...l, weight: clamped } : l)));
  };

  const removeLora = (id: string) => {
    onLorasChange(loras.filter((l) => l.id !== id));
  };

  // Adjust Embedding weight
  const updateEmbeddingWeight = (id: string, nextWeight: number) => {
    const clamped = Math.round(Math.min(2.0, Math.max(0.0, nextWeight)) * 10) / 10;
    onEmbeddingsChange(embeddings.map((e) => (e.id === id ? { ...e, weight: clamped } : e)));
  };

  const removeEmbedding = (id: string) => {
    onEmbeddingsChange(embeddings.filter((e) => e.id !== id));
  };

  // Add new LoRA from modal selection
  const handleAddLora = (item: InstalledGalleryModel) => {
    const exists = loras.some((l) => l.modelId === item.model_id && l.fileId === item.file_id);
    if (!exists) {
      onLorasChange([
        ...loras,
        {
          id: `${item.model_id}:${item.file_id}`,
          title: item.title,
          baseModel: baseModelTag,
          weight: 0.8,
          modelId: item.model_id,
          versionId: item.version_id,
          fileId: item.file_id,
        },
      ]);
    }
    setLoraPickerOpen(false);
  };

  return (
    <aside className="workspace-scroll h-full min-h-0 w-full shrink-0 border-b border-[#24262c] bg-[var(--surface)] text-[#e2e4e9] lg:h-full lg:w-[24.5rem] lg:border-b-0 lg:border-r">
      {/* Top Mode Tabs: Text2Img, Img2Img, Edit, Video, Prime */}
      <div className="flex items-center justify-between border-b border-[#24262c] px-3 pt-2">
        <div className="flex items-center gap-1 overflow-x-auto workspace-scroll-x">
          {MODES.map((mode) => {
            const active = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setActiveMode(mode.id)}
                className={`relative flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-xs font-semibold transition ${
                  mode.isPrime
                    ? "text-[#f59e0b] hover:text-[#fbbf24]"
                    : active
                    ? "text-[var(--accent)]"
                    : "text-[#8b909a] hover:text-[#e2e4e9]"
                }`}
              >
                {mode.isPrime && (
                  <Sparkles className="h-3 w-3 fill-current text-[#f59e0b]" />
                )}
                <span>{mode.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(0,229,255,0.7)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Section Title: Models */}
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-white tracking-tight">Models</h2>
          {modelsLoading && (
            <span className="text-[11px] text-[#8b909a]">Loading models…</span>
          )}
        </div>

        {modelsError && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] p-2.5 text-xs text-[var(--danger)]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{modelsError}</span>
          </div>
        )}

        {/* 1. Basic Model Card */}
        <div className="group relative rounded-xl border border-[#2b2d35] bg-[#1d1f25] p-3 transition hover:border-[#3d414d]">
          {/* Header Badge */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#8b909a] uppercase tracking-wide">
              Basic Model - {baseModelTag}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Thumbnail */}
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#272931] border border-[#333742] grid place-items-center">
              <Box className="h-5 w-5 text-[#8b909a]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>

            {/* Title & Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-[#f2f4f8]">
                  {selectedModel?.title ?? "Soliloquy 2 - FULL"}
                </span>
                <button
                  type="button"
                  title="Model Details"
                  onClick={() =>
                    setInfoTooltip(
                      selectedModel
                        ? `${selectedModel.title} (${selectedModel.filename})`
                        : "Basic Model weights"
                    )
                  }
                  className="text-[#6c707d] hover:text-[var(--accent)] transition"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[#8b909a]">
                {selectedModel?.filename ?? "Checkpoint or Diffusion Model"}
              </p>
            </div>

            {/* Right Controls: Change Chevron and Lock */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModelPickerOpen(true)}
                title="Change Model"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-[#252830] text-[#8b909a] hover:bg-[#2e323c] hover:text-white transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Model Pinned"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-[#252830] text-[#6c707d] hover:text-white transition"
              >
                <Lock className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. LoRA Cards Section */}
        {loras.length > 0 && (
          <div className="space-y-2.5">
            {loras.map((lora) => {
              const sliderPct = ((lora.weight - (-2.0)) / (2.0 - (-2.0))) * 100;
              return (
                <div
                  key={lora.id}
                  className="relative rounded-xl border border-[#2b2d35] bg-[#1d1f25] p-3 transition hover:border-[#3d414d]"
                >
                  {/* Top Badge */}
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-[#8b909a] uppercase tracking-wide">
                      LoRA - {lora.baseModel}
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    {/* Thumbnail */}
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#272931] border border-[#333742] grid place-items-center">
                      <Layers className="h-5 w-5 text-[#8b909a]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Title Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate text-xs font-semibold text-[#f2f4f8]">
                            {lora.title}
                          </span>
                          <button
                            type="button"
                            title="LoRA info"
                            className="text-[#6c707d] hover:text-[var(--accent)] transition"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => removeLora(lora.id)}
                          title="Remove LoRA"
                          className="ml-2 text-[var(--ink-faint)] hover:text-[var(--danger)] transition p-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Slider Row */}
                      <div className="mt-2.5 flex items-center gap-2">
                        {/* Cyan Slider Track */}
                        <div className="relative flex-1 flex items-center">
                          <input
                            type="range"
                            min="-2.0"
                            max="2.0"
                            step="0.05"
                            value={lora.weight}
                            onChange={(e) => updateLoraWeight(lora.id, parseFloat(e.target.value))}
                            className="workspace-range w-full"
                            style={{
                              background: `linear-gradient(to right, var(--accent) ${sliderPct}%, var(--line) ${sliderPct}%)`,
                            }}
                          />
                        </div>

                        {/* Weight Display Pill */}
                        <div className="flex h-6 min-w-[2.25rem] items-center justify-center rounded bg-[#272931] px-1.5 font-mono text-[11px] font-semibold text-white">
                          {lora.weight.toFixed(1)}
                        </div>

                        {/* Decrement (-) Button */}
                        <button
                          type="button"
                          onClick={() => updateLoraWeight(lora.id, lora.weight - 0.1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-[#272931] text-[#9ca3af] hover:bg-[#323642] hover:text-white active:scale-95 transition"
                          title="Decrease Weight"
                        >
                          <Minus className="h-3 w-3" />
                        </button>

                        {/* Increment (+) Button */}
                        <button
                          type="button"
                          onClick={() => updateLoraWeight(lora.id, lora.weight + 0.1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-[#272931] text-[#9ca3af] hover:bg-[#323642] hover:text-white active:scale-95 transition"
                          title="Increase Weight"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. Embedding Cards Section */}
        {embeddings.length > 0 && (
          <div className="space-y-2.5">
            {embeddings.map((emb) => {
              const sliderPct = (emb.weight / 2.0) * 100;
              return (
                <div
                  key={emb.id}
                  className="relative rounded-xl border border-[#2b2d35] bg-[#1d1f25] p-3 transition hover:border-[#3d414d]"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-[#8b909a] uppercase tracking-wide">
                      Embedding - {emb.baseModel}
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#272931] border border-[#333742] grid place-items-center">
                      <Wand2 className="h-5 w-5 text-[#8b909a]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate text-xs font-semibold text-[#f2f4f8]">
                            {emb.title}
                          </span>
                          <button
                            type="button"
                            title="Embedding info"
                            className="text-[#6c707d] hover:text-[var(--accent)] transition"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEmbedding(emb.id)}
                          title="Remove Embedding"
                          className="ml-2 text-[#6c707d] hover:text-[var(--danger)] transition p-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="relative flex-1 flex items-center">
                          <input
                            type="range"
                            min="0.0"
                            max="2.0"
                            step="0.05"
                            value={emb.weight}
                            onChange={(e) => updateEmbeddingWeight(emb.id, parseFloat(e.target.value))}
                            className="workspace-range w-full"
                            style={{
                              background: `linear-gradient(to right, var(--accent) ${sliderPct}%, var(--line) ${sliderPct}%)`,
                            }}
                          />
                        </div>
                        <div className="flex h-6 min-w-[2.25rem] items-center justify-center rounded bg-[#272931] px-1.5 font-mono text-[11px] font-semibold text-white">
                          {emb.weight.toFixed(1)}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateEmbeddingWeight(emb.id, emb.weight - 0.1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-[#272931] text-[#9ca3af] hover:bg-[#323642] hover:text-white active:scale-95 transition"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateEmbeddingWeight(emb.id, emb.weight + 0.1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-[#272931] text-[#9ca3af] hover:bg-[#323642] hover:text-white active:scale-95 transition"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Action Buttons: Add LoRA & Add Embedding */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setLoraPickerOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#2b2d35] bg-[#1d1f25] py-2.5 text-xs font-semibold text-[#e2e4e9] hover:border-[#3d414d] hover:bg-[#252830] transition active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Add LoRA</span>
          </button>
          <button
            type="button"
            onClick={() => setEmbeddingPickerOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#2b2d35] bg-[#1d1f25] py-2.5 text-xs font-semibold text-[#e2e4e9] hover:border-[#3d414d] hover:bg-[#252830] transition active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Add Embedding</span>
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-[#24262c] pt-4 space-y-4">
          {/* Format / Aspect Ratio */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#8b909a] uppercase tracking-wide">
                Aspect Ratio
              </span>
              <span className="font-mono text-[10px] text-[var(--accent)]">{format}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMATS.map(({ value, label }) => {
                const active = format === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFormatChange(value)}
                    disabled={busy}
                    className={`rounded-lg border py-2 text-center font-mono text-[11px] font-semibold transition active:scale-95 disabled:opacity-40 ${
                      active
                        ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] shadow-[0_0_10px_rgba(0,229,255,0.15)]"
                        : "border-[#2b2d35] bg-[#1d1f25] text-[#8b909a] hover:border-[#3d414d] hover:text-[#e2e4e9]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {format === "custom" && (
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="custom-width" className="text-[10px] text-[#8b909a] uppercase font-semibold">Width</label>
                  <input
                    id="custom-width"
                    type="number"
                    min="64"
                    max="4096"
                    step="8"
                    value={customWidth}
                    onChange={(e) => onCustomWidthChange(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-md border border-[#2b2d35] bg-[#1d1f25] px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label htmlFor="custom-height" className="text-[10px] text-[#8b909a] uppercase font-semibold">Height</label>
                  <input
                    id="custom-height"
                    type="number"
                    min="64"
                    max="4096"
                    step="8"
                    value={customHeight}
                    onChange={(e) => onCustomHeightChange(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-md border border-[#2b2d35] bg-[#1d1f25] px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Advanced Settings Accordion */}
          <div className="rounded-xl border border-[#2b2d35] bg-[#1d1f25] overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between p-3 text-xs font-semibold text-[#8b909a] hover:text-white transition"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
                Advanced Settings
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  advancedOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {advancedOpen && (
              <div className="space-y-3.5 border-t border-[#262830] p-3 pt-3.5">
                {/* Negative Prompt */}
                <div>
                  <label htmlFor="neg-prompt" className="mb-1.5 block text-[10px] font-semibold uppercase text-[#8b909a]">
                    Negative Prompt (Exclude)
                  </label>
                  <textarea
                    id="neg-prompt"
                    value={negativePrompt}
                    onChange={(e) => onNegativePromptChange(e.target.value)}
                    placeholder="worst quality, low quality, blurry, distorted…"
                    rows={3}
                    disabled={busy}
                    className="w-full resize-none rounded-lg border border-[#2b2d35] bg-[var(--surface)] p-2.5 text-xs text-white placeholder-[#6c707d] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                {/* Seed, Steps, CFG */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="param-seed" className="block text-[10px] font-semibold uppercase text-[#8b909a]">Seed</label>
                    <input
                      id="param-seed"
                      type="number"
                      min="0"
                      value={seed}
                      onChange={(e) => onSeedChange(e.target.value)}
                      placeholder="Random"
                      disabled={busy}
                      className="mt-1 w-full rounded-md border border-[#2b2d35] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs text-white placeholder-[#6c707d] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="param-steps" className="block text-[10px] font-semibold uppercase text-[#8b909a]">Steps</label>
                    <input
                      id="param-steps"
                      type="number"
                      min="1"
                      max="100"
                      value={steps}
                      onChange={(e) => onStepsChange(e.target.value)}
                      disabled={busy}
                      className="mt-1 w-full rounded-md border border-[#2b2d35] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="param-cfg" className="block text-[10px] font-semibold uppercase text-[#8b909a]">CFG</label>
                    <input
                      id="param-cfg"
                      type="number"
                      min="0"
                      max="30"
                      step="0.1"
                      value={cfg}
                      onChange={(e) => onCfgChange(e.target.value)}
                      disabled={busy}
                      className="mt-1 w-full rounded-md border border-[#2b2d35] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                {/* Denoise Slider */}
                <div>
                  <div className="flex items-center justify-between text-[10px] text-[#8b909a] uppercase font-semibold">
                    <span>Denoise</span>
                    <span className="font-mono text-white">{denoise}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={denoise}
                    onChange={(e) => onDenoiseChange(e.target.value)}
                    disabled={busy}
                    className="workspace-range mt-2 w-full"
                    style={{
                      background: `linear-gradient(to right, var(--accent) ${parseFloat(denoise) * 100}%, var(--line) ${parseFloat(denoise) * 100}%)`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Model Picker Modal */}
      {modelPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2b2d35] bg-[#17181d] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#24262c] pb-3.5">
              <h3 className="text-base font-bold text-white">Select Basic Model</h3>
              <button
                type="button"
                onClick={() => setModelPickerOpen(false)}
                className="rounded-md p-1 text-[#8b909a] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative mt-3.5 mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c707d]" />
              <input
                type="text"
                placeholder="Search models…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[#2b2d35] bg-[#121316] py-2 pl-9 pr-3 text-xs text-white placeholder-[#6c707d] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {baseModels
                .filter((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((m) => {
                  const key = `${m.model_id}:${m.version_id}:${m.file_id}`;
                  const isCurrent =
                    selectedModel &&
                    `${selectedModel.model_id}:${selectedModel.version_id}:${selectedModel.file_id}` === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onModelChange(key);
                        setModelPickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                        isCurrent
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                          : "border-[#2b2d35] bg-[#1d1f25] hover:border-[#3d414d] hover:bg-[#252830]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-white">{m.title}</span>
                          <span className="rounded bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
                            {m.model_type}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-mono text-[11px] text-[#8b909a]">{m.filename}</p>
                      </div>
                      {isCurrent && <Check className="h-4 w-4 text-[var(--accent)]" />}
                    </button>
                  );
                })}
              {baseModels.length === 0 && (
                <p className="py-6 text-center text-xs text-[#8b909a]">
                  No installed models found in gallery.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LoRA Picker Modal */}
      {loraPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2b2d35] bg-[#17181d] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#24262c] pb-3.5">
              <h3 className="text-base font-bold text-white">Add LoRA Adapter</h3>
              <button
                type="button"
                onClick={() => setLoraPickerOpen(false)}
                className="rounded-md p-1 text-[#8b909a] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 py-3 pr-1">
              {galleryLoras.map((lora) => (
                <div
                  key={`${lora.model_id}:${lora.file_id}`}
                  className="flex items-center justify-between rounded-xl border border-[#2b2d35] bg-[#1d1f25] p-3 transition hover:border-[#3d414d]"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-white">{lora.title}</span>
                    <span className="block truncate font-mono text-[11px] text-[#8b909a]">{lora.filename}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddLora(lora)}
                    className="ml-3 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-95 transition"
                  >
                    Add
                  </button>
                </div>
              ))}
              {galleryLoras.length === 0 && (
                <div className="py-8 text-center text-xs text-[#8b909a]">
                  <p>No LoRAs found in local gallery.</p>
                  <Link href="/models" className="mt-2 inline-block font-semibold text-[var(--accent)] hover:underline">
                    Import LoRA in Model Studio
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Embedding Picker Modal */}
      {embeddingPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#2b2d35] bg-[#17181d] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#24262c] pb-3.5">
              <h3 className="text-base font-bold text-white">Add Embedding</h3>
              <button
                type="button"
                onClick={() => setEmbeddingPickerOpen(false)}
                className="rounded-md p-1 text-[#8b909a] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-[#8b909a]">
                Type the name or trigger word of an embedding / textual inversion token:
              </p>
              <input
                type="text"
                placeholder="e.g. *NxFang 𝕓 - Test, easynegative, badhandv4…"
                id="embedding-name-input"
                className="w-full rounded-lg border border-[#2b2d35] bg-[#121316] p-2.5 text-xs text-white placeholder-[#6c707d] outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const target = e.currentTarget;
                    if (target.value.trim()) {
                      onEmbeddingsChange([
                        ...embeddings,
                        {
                          id: `emb-${Date.now()}`,
                          title: target.value.trim(),
                          baseModel: baseModelTag,
                          weight: 0.5,
                        },
                      ]);
                      setEmbeddingPickerOpen(false);
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById("embedding-name-input") as HTMLInputElement | null;
                  if (input && input.value.trim()) {
                    onEmbeddingsChange([
                      ...embeddings,
                      {
                        id: `emb-${Date.now()}`,
                        title: input.value.trim(),
                        baseModel: baseModelTag,
                        weight: 0.5,
                      },
                    ]);
                    setEmbeddingPickerOpen(false);
                  }
                }}
                className="w-full rounded-lg bg-[var(--accent)] py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition"
              >
                Add Embedding Token
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Tooltip Toast */}
      {infoTooltip && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-[#2b2d35] bg-[#1c1d22] px-3.5 py-2 text-xs text-white shadow-xl">
          <Info className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>{infoTooltip}</span>
          <button type="button" onClick={() => setInfoTooltip(null)} className="ml-2 text-[#8b909a] hover:text-white">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </aside>
  );
}
