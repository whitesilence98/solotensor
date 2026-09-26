"use client";

import { useState } from "react";
import { ChevronDown, Loader2, SlidersHorizontal, Zap } from "lucide-react";
import ImageUpload from "./ImageUpload";
import type { GenerationMode } from "@/lib/api";

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
  mode: GenerationMode; onModeChange: (v: GenerationMode) => void;
  prompt: string; onPromptChange: (v: string) => void;
  negativePrompt: string; onNegativePromptChange: (v: string) => void;
  unetName: string; unetOptions: string[]; onUnetNameChange: (v: string) => void;
  clipName: string; clipOptions: string[]; onClipNameChange: (v: string) => void;
  vaeName: string; vaeOptions: string[]; onVaeNameChange: (v: string) => void;
  seed: string; onSeedChange: (v: string) => void;
  steps: string; onStepsChange: (v: string) => void;
  customWidth: string; onCustomWidthChange: (v: string) => void;
  customHeight: string; onCustomHeightChange: (v: string) => void;
  format: FormatKey; onFormatChange: (v: FormatKey) => void;
  references: string[]; onReferencesChange: (refs: string[]) => void;
  busy: boolean; progress: number; progressLabel: string;
  canGenerate: boolean; onGenerate: () => void;
}

const labelClass = "mb-2 block text-[11px] font-semibold tracking-[.08em] text-[#8a8d85]";
const fieldClass = "w-full rounded-[.55rem] border border-[#292d28] bg-[#111311] px-3 py-2.5 text-[13px] text-[#deddd6] outline-none transition-all duration-200 hover:border-[#3a4038] focus:border-[#d5f06f]/70 focus:ring-2 focus:ring-[#d5f06f]/10 disabled:opacity-45";

export default function ControlPanel(props: Props) {
  const { mode, onModeChange, prompt, onPromptChange, negativePrompt, onNegativePromptChange,
    unetName, unetOptions, onUnetNameChange, clipName, clipOptions, onClipNameChange,
    vaeName, vaeOptions, onVaeNameChange, seed, onSeedChange, steps, onStepsChange,
    customWidth, onCustomWidthChange, customHeight, onCustomHeightChange, format,
    onFormatChange, references, onReferencesChange, busy, progress, progressLabel,
    canGenerate, onGenerate } = props;
  const imageToImage = mode === "image-to-image";
  const promptWords = wordCount(prompt);
  const [advanced, setAdvanced] = useState(false);

  const select = (id: string, value: string, options: string[], onChange: (v: string) => void) => (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={busy} className={`${fieldClass} appearance-none pr-9`}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6f716d]" />
    </div>
  );

  return (
    <aside className="w-full shrink-0 overflow-visible border-b border-[#292d28] bg-[#0e100e]/95 lg:h-full lg:w-[22rem] lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="border-b border-[#292d28] px-5 pb-4 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#6f716d]">Workspace / 01</p>
        <div className="mt-2 flex items-end justify-between">
          <h1 className="text-[1.75rem] font-semibold leading-none tracking-[-.055em] text-[#f2f0e9]">New image</h1>
          <span className="font-mono text-[10px] text-[#6f716d]">LOCAL</span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div role="tablist" aria-label="Generation mode" className="grid grid-cols-2 gap-1 border-b border-[#292d28]">
          {(["text-to-image", "image-to-image"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={mode === tab} disabled={busy} onClick={() => onModeChange(tab)} className={`relative px-2 pb-3 text-left text-xs font-semibold transition-colors disabled:opacity-40 ${mode === tab ? "text-[#f2f0e9]" : "text-[#6f716d] hover:text-[#aaa8a1]"}`}>
              {tab === "text-to-image" ? "Text to image" : "Image to image"}
              {mode === tab && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#d5f06f]" />}
            </button>
          ))}
        </div>

        {imageToImage ? (
          <section className="space-y-4">
            <div className="border-l-2 border-[#d5f06f] bg-[#d5f06f]/[.05] px-4 py-3 text-xs leading-relaxed text-[#aaa8a1]">
              This workflow accepts text only. Reference images are staged for the next graph export.
            </div>
            <div><span className={labelClass}>Reference images</span><ImageUpload references={references} onChange={onReferencesChange} disabled={busy} /></div>
          </section>
        ) : (
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
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor="seed" className={labelClass}>Seed</label><input id="seed" type="number" min="0" value={seed} onChange={(e) => onSeedChange(e.target.value)} placeholder="Random" disabled={busy} className={`${fieldClass} font-mono`} /></div>
                <div><label htmlFor="steps" className={labelClass}>Steps</label><input id="steps" type="number" min="1" max="100" value={steps} onChange={(e) => onStepsChange(e.target.value)} disabled={busy} className={`${fieldClass} font-mono`} /></div>
              </div>
              <div className="space-y-3"><div><label htmlFor="unet-name" className={labelClass}>UNET</label>{select("unet-name", unetName, unetOptions, onUnetNameChange)}</div><div><label htmlFor="clip-name" className={labelClass}>Encoder</label>{select("clip-name", clipName, clipOptions, onClipNameChange)}</div><div><label htmlFor="vae-name" className={labelClass}>VAE</label>{select("vae-name", vaeName, vaeOptions, onVaeNameChange)}</div></div>
            </div>}
          </>
        )}

        <button type="button" onClick={onGenerate} disabled={!canGenerate} className="group flex w-full items-center justify-between rounded-[.6rem] bg-[#d5f06f] px-4 py-3.5 text-sm font-bold text-[#171b08] transition-all duration-200 hover:bg-[#e2f88a] active:scale-[.985] disabled:cursor-not-allowed disabled:bg-[#252824] disabled:text-[#62665e]">
          <span>{busy ? "Building image" : imageToImage ? "Workflow unavailable" : "Generate image"}</span>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="flex items-center gap-1.5 font-mono text-[10px]"><Zap className="h-3.5 w-3.5" fill="currentColor" />~20 SEC</span>}
        </button>

        {busy && <div aria-live="polite"><div className="h-1 overflow-hidden bg-[#20231f]"><div className="h-full bg-[#d5f06f] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div><p className="mt-2 flex justify-between text-[10px] text-[#6f716d]"><span>{progressLabel || "Working"}</span><span className="font-mono text-[#d5f06f]">{progress}%</span></p></div>}
      </div>
    </aside>
  );
}
