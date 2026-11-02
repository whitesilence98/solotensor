"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, Layers, Sliders, Sparkles, Zap } from "lucide-react";

export interface UpscaleConfig {
  enabled: boolean;
  scale: number; // 1 | 1.5 | 2 | 3 | 4 | 0 (0 = custom)
  customScale?: number;
  ditModel: string;
  colorCorrection: "lab" | "rgb" | "none";
  inputNoiseScale: number;
  latentNoiseScale: number;
  // Legacy backward-compat fields
  upscaler?: string;
  hiresSteps?: number;
  denoisingStrength?: number;
}

export const SEEDVR2_DIT_MODELS = [
  {
    id: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    label: "SeedVR2 3B (Fast)",
    tag: "FP8",
    desc: "Default fast super-resolution with sharp micro-texture recovery",
  },
  {
    id: "seedvr2_ema_7b_fp8_e4m3fn.safetensors",
    label: "SeedVR2 7B (HQ)",
    tag: "FP8",
    desc: "Higher-capacity DiT for cinematic high-frequency realism",
  },
];

const SCALE_OPTIONS = [
  { label: "1.5x", value: 1.5 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
  { label: "4x", value: 4 },
];

export const DEFAULT_UPSCALE_CONFIG: UpscaleConfig = {
  enabled: false,
  scale: 1.5,
  customScale: 2.0,
  ditModel: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
  colorCorrection: "lab",
  inputNoiseScale: 0.0,
  latentNoiseScale: 0.0,
  upscaler: "SeedVR2",
  hiresSteps: 25,
  denoisingStrength: 0.5,
};

interface Props {
  config: UpscaleConfig;
  onChange: (cfg: UpscaleConfig) => void;
  outputWidth: number;
  outputHeight: number;
  defaultExpanded?: boolean;
  alwaysExpanded?: boolean;
  hideToggle?: boolean;
  variant?: "accordion" | "standalone";
}

export default function UpscalePanel({
  config,
  onChange,
  outputWidth,
  outputHeight,
  defaultExpanded = false,
  alwaysExpanded = false,
  hideToggle = false,
  variant = "accordion",
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isExpanded = alwaysExpanded || expanded;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const effectiveScale = config.scale === 0 ? (config.customScale ?? 2) : config.scale;
  const scaledW = Math.round(outputWidth * effectiveScale);
  const scaledH = Math.round(outputHeight * effectiveScale);

  const set = (patch: Partial<UpscaleConfig>) => onChange({ ...config, ...patch });

  if (variant === "standalone") {
    return (
      <div className="space-y-4">
        {/* 1. Stage Header Banner */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-center justify-center shrink-0">
                <Zap className="w-4.5 h-4.5 text-[var(--accent)]" strokeWidth={1.5} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-[var(--ink)] tracking-tight">SeedVR2 Super-Resolution</h3>
                  <span className="text-[9px] font-mono font-bold text-[var(--accent)] bg-[var(--accent-ambient)] px-1.5 py-0.5 rounded border border-[var(--accent)]/30">
                    STAGE 2
                  </span>
                </div>
                <p className="text-[10px] text-[var(--ink-faint)] leading-snug">
                  Latent Diffusion Transformer super-resolution upscaler (Max 4096px).
                </p>
              </div>
            </div>

            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--line)] text-[var(--accent)] font-bold shrink-0">
              FP8 DiT
            </span>
          </div>
        </div>

        {/* 2. Resolution Transformation Metric Bar */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
          <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-[var(--ink-faint)] block mb-2">
            RESOLUTION TRANSFORMATION
          </span>
          <div className="grid grid-cols-5 items-center gap-1 text-center font-mono">
            <div className="col-span-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] p-2">
              <span className="text-[9px] text-[var(--ink-faint)] block uppercase">Source</span>
              <span className="text-xs font-bold text-[var(--ink)]">{outputWidth} × {outputHeight}</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent-ambient)] px-2 py-0.5 rounded border border-[var(--accent)]/30">
                {effectiveScale}x
              </span>
            </div>
            <div className="col-span-2 rounded-lg bg-[var(--surface)] border border-[var(--accent)]/40 p-2 shadow-sm">
              <span className="text-[9px] text-[var(--accent)] block uppercase font-semibold">Target</span>
              <span className="text-xs font-bold text-[var(--accent)]">{scaledW} × {scaledH}</span>
            </div>
          </div>
        </div>

        {/* 3. Scale Factor Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] font-bold block px-0.5">
            Target Scale Factor
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {SCALE_OPTIONS.map((opt) => {
              const isSelected = config.scale === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set({ scale: opt.value })}
                  className={`py-2 text-xs font-mono rounded-lg border transition-all text-center ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => set({ scale: 0 })}
              className={`py-2 text-xs font-mono rounded-lg border transition-all text-center ${
                config.scale === 0
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                  : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
              }`}
            >
              Custom
            </button>
          </div>

          {config.scale === 0 && (
            <div className="flex items-center gap-2 pt-1.5 px-0.5">
              <input
                type="range"
                min={1}
                max={4}
                step={0.1}
                value={config.customScale ?? 2}
                onChange={(e) => set({ customScale: parseFloat(e.target.value) })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
              />
              <span className="text-xs font-mono text-[var(--accent)] font-bold tabular-nums w-12 text-right">
                {(config.customScale ?? 2).toFixed(1)}x
              </span>
            </div>
          )}
        </div>

        {/* 4. DiT Model Weights */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] font-bold flex items-center justify-between px-0.5">
            <span className="flex items-center gap-1">
              <span>DiT Model Architecture</span>
              <HelpCircle className="w-3 h-3 text-[var(--ink-faint)]" strokeWidth={1.5} />
            </span>
            <span className="text-[9px] text-[var(--accent)] font-mono">FP8 EMA</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SEEDVR2_DIT_MODELS.map((m) => {
              const isSelected = (config.ditModel || DEFAULT_UPSCALE_CONFIG.ditModel) === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => set({ ditModel: m.id })}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--ink)] shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold">{m.label}</span>
                    <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-[var(--surface)] text-[var(--ink-faint)] border border-[var(--line)]">
                      {m.tag}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-[var(--ink-faint)] line-clamp-2 mt-1 leading-relaxed">
                    {m.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Color Correction Space */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] font-bold flex items-center justify-between px-0.5">
            <span>Color Correction Space</span>
            <span className="text-[9px] text-[var(--ink-faint)]">LAB preserves natural chroma</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["lab", "rgb", "none"] as const).map((mode) => {
              const isSelected = config.colorCorrection === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set({ colorCorrection: mode })}
                  className={`py-2 text-xs font-mono rounded-lg border uppercase transition-all text-center ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--accent)] font-bold shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                  }`}
                >
                  {mode === "lab" ? "LAB (Preserve)" : mode}
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Advanced Latent Controls */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center justify-between w-full text-[11px] font-mono text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold">
              <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Advanced Latent Noise Scales</span>
            </span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAdvanced && (
            <div className="pt-2.5 space-y-3 border-t border-[var(--line)]">
              {/* Input Noise Scale */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <label className="text-[var(--ink-soft)]">Input Noise Scale</label>
                  <span className="text-[var(--accent)] font-bold tabular-nums">{config.inputNoiseScale.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.inputNoiseScale}
                  onChange={(e) => set({ inputNoiseScale: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
                />
              </div>

              {/* Latent Noise Scale */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <label className="text-[var(--ink-soft)]">Latent Noise Scale</label>
                  <span className="text-[var(--accent)] font-bold tabular-nums">{config.latentNoiseScale.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.latentNoiseScale}
                  onChange={(e) => set({ latentNoiseScale: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden transition-all duration-200">
      {/* Header */}
      <div
        {...(!alwaysExpanded
          ? {
              role: "button",
              tabIndex: 0,
              "aria-expanded": isExpanded,
              onClick: () => setExpanded((v) => !v),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              },
            }
          : {})}
        className={`flex items-center justify-between px-3.5 py-2.5 select-none bg-[var(--surface)] transition-colors ${
          !alwaysExpanded
            ? "cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <Zap
            className="w-4 h-4 text-[var(--accent)]"
            strokeWidth={1.5}
          />
          <span className="text-xs font-semibold text-[var(--ink)] tracking-tight">Upscale</span>
          <span className="text-[10px] font-mono text-[var(--ink-faint)] px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--surface-sunken)]">
            SeedVR2 DiT
          </span>
          {(config.enabled || hideToggle) && (
            <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-ambient)] px-1.5 py-0.5 rounded">
              {effectiveScale}x → {scaledW}×{scaledH}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Toggle pill */}
          {!hideToggle && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = !config.enabled;
                if (next) setExpanded(true);
                set({ enabled: next });
              }}
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.96] ${
                config.enabled ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
              }`}
              aria-pressed={config.enabled}
              aria-label="Toggle Upscale"
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-[var(--surface-sunken)] shadow-sm transition-transform ${
                  config.enabled ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </button>
          )}

          {!alwaysExpanded && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-[var(--ink-faint)] transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-2.5 space-y-3.5 border-t border-[var(--line)]">
          {/* 1. Resolution Transformation Metric Bar */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
            <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-[var(--ink-faint)] block mb-2">
              RESOLUTION TRANSFORMATION
            </span>
            <div className="grid grid-cols-5 items-center gap-1 text-center font-mono">
              <div className="col-span-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] p-2">
                <span className="text-[9px] text-[var(--ink-faint)] block uppercase">Source</span>
                <span className="text-xs font-bold text-[var(--ink)]">{outputWidth} × {outputHeight}</span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent-ambient)] px-2 py-0.5 rounded border border-[var(--accent)]/30">
                  {effectiveScale}x
                </span>
              </div>
              <div className="col-span-2 rounded-lg bg-[var(--surface)] border border-[var(--accent)]/40 p-2 shadow-sm">
                <span className="text-[9px] text-[var(--accent)] block uppercase font-semibold">Target</span>
                <span className="text-xs font-bold text-[var(--accent)]">{scaledW} × {scaledH}</span>
              </div>
            </div>
          </div>

          {/* 2. Scale Factor Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] font-bold block px-0.5">
              Target Scale Factor
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {SCALE_OPTIONS.map((opt) => {
                const isSelected = config.scale === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set({ scale: opt.value })}
                    className={`py-2 text-xs font-mono rounded-lg border transition-all text-center ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => set({ scale: 0 })}
                className={`py-2 text-xs font-mono rounded-lg border transition-all text-center ${
                  config.scale === 0
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                    : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                }`}
              >
                Custom
              </button>
            </div>

            {config.scale === 0 && (
              <div className="flex items-center gap-2 pt-1.5 px-0.5">
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.1}
                  value={config.customScale ?? 2}
                  onChange={(e) => set({ customScale: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
                />
                <span className="text-xs font-mono text-[var(--accent)] font-bold tabular-nums w-12 text-right">
                  {(config.customScale ?? 2).toFixed(1)}x
                </span>
              </div>
            )}
          </div>

          {/* 3. DiT Model Weights */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] font-bold flex items-center justify-between px-0.5">
              <span className="flex items-center gap-1">
                <span>DiT Model Architecture</span>
                <HelpCircle className="w-3 h-3 text-[var(--ink-faint)]" strokeWidth={1.5} />
              </span>
              <span className="text-[9px] text-[var(--accent)] font-mono">FP8 EMA</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SEEDVR2_DIT_MODELS.map((m) => {
                const isSelected = (config.ditModel || DEFAULT_UPSCALE_CONFIG.ditModel) === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set({ ditModel: m.id })}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--ink)] shadow-sm"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold">{m.label}</span>
                      <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-[var(--surface)] text-[var(--ink-faint)] border border-[var(--line)]">
                        {m.tag}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-[var(--ink-faint)] line-clamp-2 mt-1 leading-relaxed">
                      {m.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Color Correction Space */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] font-bold flex items-center justify-between px-0.5">
              <span>Color Correction Space</span>
              <span className="text-[9px] text-[var(--ink-faint)]">LAB preserves natural chroma</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["lab", "rgb", "none"] as const).map((mode) => {
                const isSelected = config.colorCorrection === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set({ colorCorrection: mode })}
                    className={`py-2 text-xs font-mono rounded-lg border uppercase transition-all text-center ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--accent)] font-bold shadow-sm"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                    }`}
                  >
                    {mode === "lab" ? "LAB (Preserve)" : mode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Advanced Latent Controls */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 space-y-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center justify-between w-full text-[11px] font-mono text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
            >
              <span className="flex items-center gap-1.5 font-bold">
                <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Advanced Latent Noise Scales</span>
              </span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="pt-2.5 space-y-3 border-t border-[var(--line)]">
                {/* Input Noise Scale */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <label className="text-[var(--ink-soft)]">Input Noise Scale</label>
                    <span className="text-[var(--accent)] font-bold tabular-nums">{config.inputNoiseScale.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.inputNoiseScale}
                    onChange={(e) => set({ inputNoiseScale: parseFloat(e.target.value) })}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
                  />
                </div>

                {/* Latent Noise Scale */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <label className="text-[var(--ink-soft)]">Latent Noise Scale</label>
                    <span className="text-[var(--accent)] font-bold tabular-nums">{config.latentNoiseScale.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.latentNoiseScale}
                    onChange={(e) => set({ latentNoiseScale: parseFloat(e.target.value) })}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
            )}
    </div>
  );
}
