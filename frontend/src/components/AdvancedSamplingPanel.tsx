"use client";

import React, { useState } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import SeedInput from "@/components/SeedInput";

export const SAMPLER_OPTIONS = [
  { value: "euler", label: "Euler" },
  { value: "euler_ancestral", label: "Euler A (Ancestral)" },
  { value: "dpmpp_2m", label: "DPM++ 2M" },
  { value: "dpmpp_sde", label: "DPM++ SDE" },
  { value: "dpmpp_2m_sde", label: "DPM++ 2M SDE" },
  { value: "dpmpp_3m_sde", label: "DPM++ 3M SDE" },
  { value: "heun", label: "Heun" },
  { value: "ddim", label: "DDIM" },
  { value: "uni_pc", label: "UniPC" },
  { value: "lcm", label: "LCM" },
];

export const SCHEDULER_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "karras", label: "Karras" },
  { value: "exponential", label: "Exponential" },
  { value: "sgm_uniform", label: "SGM Uniform" },
  { value: "simple", label: "Simple" },
  { value: "ddim_uniform", label: "DDIM Uniform" },
  { value: "beta", label: "Beta" },
];

export interface AdvancedSamplingPanelProps {
  idPrefix?: string;
  seed: string;
  onSeedChange: (seed: string) => void;
  steps: string | number;
  onStepsChange: (steps: string) => void;
  cfg: string | number;
  onCfgChange: (cfg: string) => void;
  sampler?: string;
  onSamplerChange?: (sampler: string) => void;
  scheduler?: string;
  onSchedulerChange?: (scheduler: string) => void;
  denoise?: string | number;
  onDenoiseChange?: (denoise: string) => void;
  showDenoise?: boolean;
  minSteps?: number;
  maxSteps?: number;
  minCfg?: number;
  maxCfg?: number;
  busy?: boolean;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  defaultOpen?: boolean;
  title?: string;
  badge?: string;
}

export default function AdvancedSamplingPanel({
  idPrefix = "sampling",
  seed,
  onSeedChange,
  steps,
  onStepsChange,
  cfg,
  onCfgChange,
  sampler = "euler",
  onSamplerChange,
  scheduler = "normal",
  onSchedulerChange,
  denoise,
  onDenoiseChange,
  showDenoise = false,
  minSteps = 4,
  maxSteps = 50,
  minCfg = 0,
  maxCfg = 10,
  busy = false,
  isOpen,
  onToggleOpen,
  defaultOpen = false,
  title = "Advanced Settings",
  badge = "Seed & Sampling",
}: AdvancedSamplingPanelProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isExpanded = isOpen !== undefined ? isOpen : internalOpen;

  const handleToggle = () => {
    if (onToggleOpen) {
      onToggleOpen();
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  // Steps math (4 to 50)
  const parsedSteps = typeof steps === "number" ? steps : parseInt(String(steps), 10);
  const stepsNum = Math.max(
    minSteps,
    Math.min(maxSteps, isNaN(parsedSteps) ? 20 : parsedSteps)
  );
  const stepsPercent = Math.round(((stepsNum - minSteps) / (maxSteps - minSteps)) * 100);

  // CFG math (0 to 10, handles 0 gracefully)
  const parsedCfg = typeof cfg === "number" ? cfg : parseFloat(String(cfg));
  const cfgNum = Math.max(
    minCfg,
    Math.min(maxCfg, isNaN(parsedCfg) ? 7.0 : parsedCfg)
  );
  const cfgPercent = Math.round(((cfgNum - minCfg) / (maxCfg - minCfg)) * 100);

  // Denoise math (0 to 1)
  const parsedDenoise = typeof denoise === "number" ? denoise : parseFloat(String(denoise ?? 1.0));
  const denoiseNum = Math.max(
    0,
    Math.min(1, isNaN(parsedDenoise) ? 1.0 : parsedDenoise)
  );
  const denoisePercent = Math.round(denoiseNum * 100);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-controls={`${idPrefix}-sampling-panel`}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold select-none hover:bg-[var(--surface-raised)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
          <span className="text-xs font-semibold text-[var(--ink)] tracking-tight">{title}</span>
          <span className="text-[10px] font-mono text-[var(--ink-faint)] px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--surface-sunken)]">
            {badge}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--ink-faint)] transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {isExpanded && (
        <div
          id={`${idPrefix}-sampling-panel`}
          className="space-y-3.5 border-t border-[var(--line)] px-3.5 pb-3.5 pt-2.5"
        >
          {/* Unified Seed Control */}
          <SeedInput
            id={`${idPrefix}-seed`}
            label="Seed"
            value={seed}
            onChange={(val) => onSeedChange(String(val))}
            disabled={busy}
            size="sm"
          />

          {/* Steps & CFG Grid with Sliders */}
          <div className="grid grid-cols-2 gap-3">
            {/* Steps Slider + Numeric Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor={`${idPrefix}-steps`}
                  className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider font-semibold"
                >
                  Steps
                </label>
                <input
                  id={`${idPrefix}-steps`}
                  type="number"
                  min={minSteps}
                  max={maxSteps}
                  value={steps}
                  onChange={(e) => onStepsChange(e.target.value)}
                  disabled={busy}
                  className="w-12 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-right font-mono text-[11px] font-bold text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <input
                type="range"
                min={minSteps}
                max={maxSteps}
                step="1"
                value={stepsNum}
                onChange={(e) => onStepsChange(e.target.value)}
                disabled={busy}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${stepsPercent}%, var(--surface-soft) ${stepsPercent}%, var(--surface-soft) 100%)`,
                }}
                className="workspace-range w-full"
                aria-label="Generation Steps slider"
              />
            </div>

            {/* CFG Scale Slider + Numeric Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor={`${idPrefix}-cfg`}
                  className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider font-semibold"
                >
                  CFG Scale
                </label>
                <input
                  id={`${idPrefix}-cfg`}
                  type="number"
                  min={minCfg}
                  max={maxCfg}
                  step="0.1"
                  value={cfg}
                  onChange={(e) => onCfgChange(e.target.value)}
                  disabled={busy}
                  className="w-12 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-right font-mono text-[11px] font-bold text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <input
                type="range"
                min={minCfg}
                max={maxCfg}
                step="0.1"
                value={cfgNum}
                onChange={(e) => onCfgChange(e.target.value)}
                disabled={busy}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${cfgPercent}%, var(--surface-soft) ${cfgPercent}%, var(--surface-soft) 100%)`,
                }}
                className="workspace-range w-full"
                aria-label="CFG Scale slider"
              />
            </div>
          </div>

          {/* Sampler & Scheduler Selectors */}
          {(onSamplerChange || onSchedulerChange) && (
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              {/* Sampler Selector */}
              <div className="space-y-1.5">
                <label
                  htmlFor={`${idPrefix}-sampler`}
                  className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider font-semibold block"
                >
                  Sampler
                </label>
                <select
                  id={`${idPrefix}-sampler`}
                  value={sampler}
                  onChange={(e) => onSamplerChange?.(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  {SAMPLER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[var(--surface)] text-[var(--ink)]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheduler Selector */}
              <div className="space-y-1.5">
                <label
                  htmlFor={`${idPrefix}-scheduler`}
                  className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider font-semibold block"
                >
                  Scheduler
                </label>
                <select
                  id={`${idPrefix}-scheduler`}
                  value={scheduler}
                  onChange={(e) => onSchedulerChange?.(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  {SCHEDULER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[var(--surface)] text-[var(--ink)]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Denoise Slider (Optional / for Text2Img) */}
          {showDenoise && onDenoiseChange && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor={`${idPrefix}-denoise`}
                  className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider font-semibold"
                >
                  Denoise
                </label>
                <span className="font-mono text-[11px] text-[var(--ink)]">
                  {typeof denoise === "number" ? denoise.toFixed(2) : String(denoise ?? "1.00")}
                </span>
              </div>
              <input
                id={`${idPrefix}-denoise`}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={denoiseNum}
                onChange={(e) => onDenoiseChange(e.target.value)}
                disabled={busy}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${denoisePercent}%, var(--surface-soft) ${denoisePercent}%, var(--surface-soft) 100%)`,
                }}
                className="workspace-range w-full"
                aria-label="Denoise slider"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
