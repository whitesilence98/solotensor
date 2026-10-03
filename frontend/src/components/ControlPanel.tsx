"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ImageIcon, Loader2, SlidersHorizontal, Zap } from "lucide-react";
import type { InstalledGalleryModel } from "@/lib/api";

export type FormatKey = "1:1" | "16:9" | "9:16" | "4:3" | "3:2" | "custom";

const FORMATS: { value: FormatKey; label: string }[] = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "custom", label: "Custom" },
];
const MAX_PROMPT_WORDS = 1000;

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

interface Props {
  prompt: string; onPromptChange: (v: string) => void;
  negativePrompt: string; onNegativePromptChange: (v: string) => void;
  selectedModel: InstalledGalleryModel | null;
  modelOptions: InstalledGalleryModel[];
  onModelChange: (key: string) => void;
  seed: string; onSeedChange: (v: string) => void;
  steps: string; onStepsChange: (v: string) => void;
  imageCount: string; onImageCountChange: (v: string) => void;
  cfg: string; onCfgChange: (v: string) => void;
  denoise: string; onDenoiseChange: (v: string) => void;
  customWidth: string; onCustomWidthChange: (v: string) => void;
  customHeight: string; onCustomHeightChange: (v: string) => void;
  format: FormatKey; onFormatChange: (v: FormatKey) => void;
  busy: boolean; progress: number; progressLabel: string;
  modelsLoading?: boolean; modelsError?: string | null;
  canGenerate: boolean; onGenerate: () => void;
}

const labelClass = "mb-2 block text-[11px] font-semibold tracking-[.08em] text-[#8a8d85]";
const fieldClass = "workspace-field w-full px-3 py-2.5 text-[13px] outline-none transition-all duration-200 disabled:opacity-45";

export default function ControlPanel(props: Props) {
  const { prompt, onPromptChange, negativePrompt, onNegativePromptChange,
    selectedModel, modelOptions, onModelChange,
    seed, onSeedChange, steps, onStepsChange,
    imageCount, onImageCountChange, cfg, onCfgChange, denoise, onDenoiseChange,
    customWidth, onCustomWidthChange, customHeight, onCustomHeightChange, format,
    onFormatChange, busy, progress, progressLabel,
    modelsLoading, modelsError, canGenerate, onGenerate } = props;
  const promptWords = wordCount(prompt);
  const [advanced, setAdvanced] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);


  return (
    <aside className="workspace-scroll h-[42%] min-h-0 w-full shrink-0 border-b border-[#292d28] bg-[#0e100e]/95 lg:h-full lg:w-[22rem] lg:border-b-0 lg:border-r">
      <div className="border-b border-[#292d28] px-5 pb-4 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#6f716d]">Workspace / 01</p>
        <div className="mt-2 flex items-end justify-between">
          <h1 className="text-[1.75rem] font-semibold leading-none tracking-[-.055em] text-[#f2f0e9]">New image</h1>
          <span className="font-mono text-[10px] text-[#6f716d]">LOCAL</span>
        </div>
      </div>

      <section className="border-b border-[#292d28] px-5 py-4">
        <button
          type="button"
          aria-expanded={modelOpen}
          onClick={() => setModelOpen((value) => !value)}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[.55rem] border border-[#292d28] bg-[#171a17] text-[#6f716d]">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-[#6f716d]">Model</span>
            <span className="mt-1 block truncate text-xs font-medium text-[#deddd6]">{selectedModel ? `${selectedModel.title} · ${selectedModel.model_type} · ${selectedModel.version_name}` : "Select a gallery model"}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#8a8d85] transition-transform ${modelOpen ? "rotate-180" : ""}`} />
        </button>
        {modelOpen && (
          <div className="mt-4 space-y-3 border-t border-[#292d28] pt-4">
            {modelsLoading && <p className="text-[11px] text-[#8a8d85]">Loading installed gallery models…</p>}
            {modelsError && <p className="border-l-2 border-[#ef8c79] bg-[#ef8c79]/[.06] px-3 py-2 text-[11px] leading-4 text-[#ef8c79]">{modelsError}</p>}
            {!modelsLoading && modelOptions.length === 0 ? (
              <p className="border border-dashed border-[#292d28] px-3 py-2.5 text-xs leading-5 text-[#8a8d85]">No installed Checkpoint or Diffusion Model gallery models.</p>
            ) : (
              <div>
                <label htmlFor="gallery-model" className={labelClass}>Installed model</label>
                <div className="relative">
                  <select
                    id="gallery-model"
                    value={selectedModel ? `${selectedModel.model_id}:${selectedModel.version_id}:${selectedModel.file_id}` : ""}
                    onChange={(event) => onModelChange(event.target.value)}
                    disabled={busy || modelsLoading}
                    className={`${fieldClass} appearance-none pr-9`}
                  >
                    <option value="">Choose a model</option>
                    {modelOptions.map((model) => (
                      <option key={`${model.model_id}:${model.version_id}:${model.file_id}`} value={`${model.model_id}:${model.version_id}:${model.file_id}`}>
                        {model.title} · {model.model_type} · {model.version_name} · {model.filename}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6f716d]" />
                </div>
              </div>
            )}
            <Link href="/models/gallery" className="inline-flex text-[11px] font-semibold text-[#d5f06f] hover:text-[#e2f88a]">Browse Models Gallery</Link>
          </div>
        )}
      </section>

      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
          <div>
            <span className="workspace-label block">Workflow</span>
            <span className="mt-1 block text-xs font-semibold text-[var(--ink)]">Text to image</span>
          </div>
          <span className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-[var(--ink-faint)]">Ready</span>
        </div>

        <>
            <div>
              <div className="mb-2 flex items-baseline justify-between"><label htmlFor="prompt-input" className={labelClass}>Describe the frame</label><span className={`font-mono text-[10px] ${promptWords >= MAX_PROMPT_WORDS ? "text-[#ef8c79]" : "text-[#6f716d]"}`}>{promptWords}/{MAX_PROMPT_WORDS} words</span></div>
              <textarea id="prompt-input" value={prompt} onChange={(e) => {
                const next = e.target.value;
                if (wordCount(next) <= MAX_PROMPT_WORDS) onPromptChange(next);
              }} placeholder="Soft morning light across a brutalist interior, linen textures, 35mm grain…" rows={6} disabled={busy} className={`${fieldClass} resize-none leading-relaxed`} />
            </div>

            <div>
              <span className={labelClass}>Format</span>
              <div className="grid grid-cols-3 gap-1.5">
                {FORMATS.map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => onFormatChange(value)} disabled={busy} className={`rounded-[.45rem] border py-2 font-mono text-[10px] transition-all active:scale-[.97] disabled:opacity-40 ${format === value ? "border-[#d5f06f]/60 bg-[#d5f06f]/10 text-[#d5f06f]" : "border-[#292d28] text-[#8a8d85] hover:border-[#3a4038]"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {format === "custom" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div><label htmlFor="width" className={labelClass}>Width</label><input id="width" type="number" min="64" max="4096" step="8" value={customWidth} onChange={(e) => onCustomWidthChange(e.target.value)} disabled={busy} className={`${fieldClass} font-mono`} /></div>
                  <div><label htmlFor="height" className={labelClass}>Height</label><input id="height" type="number" min="64" max="4096" step="8" value={customHeight} onChange={(e) => onCustomHeightChange(e.target.value)} disabled={busy} className={`${fieldClass} font-mono`} /></div>
                </div>
              )}
            </div>

            <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="flex w-full items-center justify-between border-y border-[#292d28] py-3 text-xs font-semibold text-[#aaa8a1] transition-colors hover:text-[#f2f0e9]">
              <span className="flex items-center gap-2"><SlidersHorizontal className="h-3.5 w-3.5" />Advanced controls</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${advanced ? "rotate-180" : ""}`} />
            </button>

            {advanced && <div className="space-y-4">
              <div><label htmlFor="neg-prompt-input" className={labelClass}>Exclude</label><input id="neg-prompt-input" type="text" value={negativePrompt} onChange={(e) => onNegativePromptChange(e.target.value)} placeholder="Artifacts, text, blur…" disabled={busy} className={fieldClass} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label htmlFor="seed" className={labelClass}>Seed</label><input id="seed" type="number" min="0" value={seed} onChange={(e) => onSeedChange(e.target.value)} placeholder="Random" disabled={busy} className={`${fieldClass} font-mono`} /></div>
                <div><label htmlFor="steps" className={labelClass}>Steps</label><input id="steps" type="number" min="1" max="100" value={steps} onChange={(e) => onStepsChange(e.target.value)} disabled={busy} className={`${fieldClass} font-mono`} /></div>
                <div><label htmlFor="cfg" className={labelClass}>CFG</label><input id="cfg" type="number" min="0" max="30" step="0.1" value={cfg} onChange={(e) => onCfgChange(e.target.value)} disabled={busy} className={`${fieldClass} font-mono`} /></div>
              </div>
              <div><label htmlFor="denoise" className={labelClass}>Denoise · {denoise}</label><input id="denoise" type="range" min="0" max="1" step="0.05" value={denoise} onChange={(e) => onDenoiseChange(e.target.value)} disabled={busy} className="w-full" /></div>
            </div>}
        </>

        <div className="flex items-end gap-2">
          <button type="button" onClick={onGenerate} disabled={!canGenerate} className="group flex min-w-0 flex-1 items-center justify-between rounded-[.6rem] bg-[#d5f06f] px-4 py-3.5 text-sm font-bold text-[#171b08] transition-all duration-200 hover:bg-[#e2f88a] active:scale-[.985] disabled:cursor-not-allowed disabled:bg-[#252824] disabled:text-[#62665e]">
            <span>{busy ? "Building image" : "Generate image"}</span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" fill="currentColor" />}
          </button>
          <div className="w-[4.75rem] shrink-0"><label htmlFor="image-count" className={labelClass}>Images</label><input id="image-count" type="number" min="1" max="4" value={imageCount} onChange={(e) => onImageCountChange(e.target.value)} disabled={busy} className={`${fieldClass} font-mono`} /></div>
        </div>

        {busy && <div aria-live="polite"><div className="h-1 overflow-hidden bg-[#20231f]"><div className="h-full bg-[#d5f06f] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div><p className="mt-2 flex justify-between text-[10px] text-[#6f716d]"><span>{progressLabel || "Working"}</span><span className="font-mono text-[#d5f06f]">{progress}%</span></p></div>}
      </div>
    </aside>
  );
}
