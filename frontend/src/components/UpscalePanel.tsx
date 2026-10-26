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
}

export default function UpscalePanel({ config, onChange, outputWidth, outputHeight, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const effectiveScale = config.scale === 0 ? (config.customScale ?? 2) : config.scale;
  const scaledW = Math.round(outputWidth * effectiveScale);
  const scaledH = Math.round(outputHeight * effectiveScale);

  const set = (patch: Partial<UpscaleConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden transition-all duration-200">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none bg-[var(--surface)] hover:bg-[var(--surface-raised)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
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
          {config.enabled && (
            <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-ambient)] px-1.5 py-0.5 rounded">
              {effectiveScale}x → {scaledW}×{scaledH}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Toggle pill */}
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

          <ChevronDown
            className={`w-3.5 h-3.5 text-[var(--ink-faint)] transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-2 space-y-3.5 border-t border-[var(--line)]">
          {/* Engine Card */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.5} />
              <div>
                <div className="text-[11px] font-medium text-[var(--ink)]">SeedVR2 Video & Image Upscaler</div>
                <div className="text-[10px] font-mono text-[var(--ink-faint)]">
                  Latent DiT Super-Resolution (Max 4096px)
                </div>
              </div>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--line)] text-[var(--accent)]">
              ACTIVE
            </span>
          </div>

          {/* DiT Model Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span>DiT Model Weights</span>
                <HelpCircle className="w-3 h-3 text-[var(--ink-faint)]" strokeWidth={1.5} />
              </span>
              <span className="text-[9px] text-[var(--accent)] font-mono">FP8 EMA</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {SEEDVR2_DIT_MODELS.map((m) => {
                const isSelected = (config.ditModel || DEFAULT_UPSCALE_CONFIG.ditModel) === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set({ ditModel: m.id })}
                    className={`flex flex-col items-start px-2.5 py-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--ink)]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-medium">{m.label}</span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[var(--surface)] text-[var(--ink-faint)]">
                        {m.tag}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-[var(--ink-faint)] line-clamp-1 mt-0.5">
                      {m.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scale Multiplier Row */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
                Target Scale Factor
              </label>
              <span className="text-[11px] font-mono text-[var(--accent)] tabular-nums">
                {effectiveScale}x ({scaledW} × {scaledH} px)
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {SCALE_OPTIONS.map((opt) => {
                const isSelected = config.scale === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set({ scale: opt.value })}
                    className={`py-1.5 text-xs font-mono rounded-lg border transition-all text-center ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm"
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
                className={`py-1.5 text-xs font-mono rounded-lg border transition-all text-center ${
                  config.scale === 0
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm"
                    : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                }`}
              >
                Custom
              </button>
            </div>

            {config.scale === 0 && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.1}
                  value={config.customScale ?? 2}
                  onChange={(e) => set({ customScale: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
                />
                <span className="text-xs font-mono text-[var(--ink)] tabular-nums w-12 text-right">
                  {(config.customScale ?? 2).toFixed(1)}x
                </span>
              </div>
            )}
          </div>

          {/* Color Correction Mode */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] flex items-center justify-between">
              <span>Color Correction Space</span>
              <span className="text-[9px] text-[var(--ink-faint)]">LAB preserves natural chroma</span>
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(["lab", "rgb", "none"] as const).map((mode) => {
                const isSelected = config.colorCorrection === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set({ colorCorrection: mode })}
                    className={`py-1.5 text-xs font-mono rounded-lg border uppercase transition-all text-center ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--accent)] font-semibold"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center justify-between w-full text-[11px] font-mono text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors py-1"
            >
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3" />
                <span>Latent Noise Scales</span>
              </span>
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showAdvanced && (
              <div className="mt-2.5 space-y-3 p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)]">
                {/* Input Noise Scale */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <label className="text-[var(--ink-soft)]">Input Noise Scale</label>
                    <span className="text-[var(--ink)] tabular-nums">{config.inputNoiseScale.toFixed(2)}</span>
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
                    <span className="text-[var(--ink)] tabular-nums">{config.latentNoiseScale.toFixed(2)}</span>
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
