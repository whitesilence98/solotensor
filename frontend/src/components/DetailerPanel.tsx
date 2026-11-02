"use client";

import { useState } from "react";
import {
  ChevronDown,
  HelpCircle,
  ScanFace,
  Sparkles,
  Sliders,
  Check,
} from "lucide-react";
import type { InstalledGalleryModel } from "@/lib/api";

export type DetailerType = "face" | "foot" | "breast" | "hand" | "vagina";

export interface DetailerItemConfig {
  type: DetailerType;
  enabled: boolean;
  detectorModel: string;
  prompt: string;
  negativePrompt: string;
  steps: number;
  stepsEnabled: boolean;
  cfgScale: number;
  denoisingStrength: number;
  inpaintMaskBlur: number;
  inpaintOnlyMasked: boolean;
  bboxThreshold: number;
  bboxDilation: number;
}

export interface DetailerConfig {
  enabled: boolean;
  items: DetailerItemConfig[];
}

export const DETAILER_PRESETS: {
  type: DetailerType;
  label: string;
  defaultDetector: string;
  detectorOptions: string[];
  defaultDenoise: number;
  description: string;
}[] = [
  {
    type: "face",
    label: "Face",
    defaultDetector: "bbox/yolov11l-face.pt",
    detectorOptions: [
      "bbox/yolov11l-face.pt",
      "bbox/face_yolov8s.pt",
      "bbox/face_yolov8n.pt",
    ],
    defaultDenoise: 0.35,
    description: "YOLOv11l Face detection & micro-geometry restoration",
  },
  {
    type: "foot",
    label: "Foot",
    defaultDetector: "bbox/adetailerFootYolov8x_v20.pt",
    detectorOptions: [
      "bbox/adetailerFootYolov8x_v20.pt",
      "bbox/foot_yolov8n.pt",
    ],
    defaultDenoise: 0.28,
    description: "Anatomical foot & toe reconstruction",
  },
  {
    type: "breast",
    label: "Breast",
    defaultDetector: "bbox/female-breast-v4.7.pt",
    detectorOptions: [
      "bbox/female-breast-v4.7.pt",
      "bbox/breast_yolov8n.pt",
    ],
    defaultDenoise: 0.25,
    description: "Torso & cleavage curvature enhancement",
  },
  {
    type: "hand",
    label: "Hand",
    defaultDetector: "bbox/hand_yolov9c.pt",
    detectorOptions: [
      "bbox/hand_yolov9c.pt",
      "bbox/hand_yolov8n.pt",
    ],
    defaultDenoise: 0.32,
    description: "YOLOv9c Finger articulation & nail refinement",
  },
  {
    type: "vagina",
    label: "Vagina",
    defaultDetector: "bbox/vagina-v4.2.pt",
    detectorOptions: [
      "bbox/vagina-v4.2.pt",
    ],
    defaultDenoise: 0.30,
    description: "Intimate anatomy detailer pass",
  },
];

function defaultItem(type: DetailerType, defaultDetector: string, defaultDenoise: number): DetailerItemConfig {
  return {
    type,
    enabled: true,
    detectorModel: defaultDetector,
    prompt: "",
    negativePrompt: "",
    steps: 25,
    stepsEnabled: true,
    cfgScale: 7.0,
    denoisingStrength: defaultDenoise,
    inpaintMaskBlur: 4,
    inpaintOnlyMasked: true,
    bboxThreshold: 0.5,
    bboxDilation: 10,
  };
}

export const DEFAULT_DETAILER_CONFIG: DetailerConfig = {
  enabled: false,
  items: [],
};

// ─── Sub-components ────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: boolean;
}

function SliderRow({ label, value, min, max, step, onChange, format, hint }: SliderRowProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <label className="text-[var(--ink-soft)] flex items-center gap-1">
          {label}
          {hint && <HelpCircle className="w-3 h-3 text-[var(--ink-faint)]" strokeWidth={1.5} />}
        </label>
        <span className="text-[var(--ink)] tabular-nums font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)] bg-[var(--line)]"
      />
    </div>
  );
}

interface ItemEditorProps {
  item: DetailerItemConfig;
  onChange: (patch: Partial<DetailerItemConfig>) => void;
  detectorOptions: string[];
}

function ItemEditor({ item, onChange, detectorOptions }: ItemEditorProps) {
  return (
    <div className="mt-3 space-y-3.5 pl-3 border-l-2 border-[var(--accent)]/40">
      {/* Detector model */}
      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)] flex items-center justify-between">
          <span className="flex items-center gap-1">
            <span>YOLO Detector Model</span>
            <HelpCircle className="w-3 h-3 text-[var(--ink-faint)]" strokeWidth={1.5} />
          </span>
          <span className="text-[9px] text-[var(--accent)] font-mono">ULTRALYTICS</span>
        </label>
        <select
          value={item.detectorModel}
          onChange={(e) => onChange({ detectorModel: e.target.value })}
          className="w-full bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink)] text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer"
        >
          {detectorOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* ADetailer Prompt */}
      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
          Inpaint Positive Prompt
        </label>
        <textarea
          value={item.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          rows={2}
          placeholder="Optional: specialized target tags (e.g. photorealistic skin, crisp iris, 8k)..."
          className="w-full bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink)] text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-[var(--accent)] resize-none placeholder-[var(--ink-faint)]"
        />
      </div>

      {/* ADetailer Negative Prompt */}
      <div className="space-y-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
          Inpaint Negative Prompt
        </label>
        <textarea
          value={item.negativePrompt}
          onChange={(e) => onChange({ negativePrompt: e.target.value })}
          rows={1}
          placeholder="Optional: unwanted artifacts in this region..."
          className="w-full bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink)] text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-[var(--accent)] resize-none placeholder-[var(--ink-faint)]"
        />
      </div>

      {/* Primary sliders */}
      <div className="space-y-2.5 pt-1">
        <SliderRow
          label="Inpaint Steps"
          value={item.steps}
          min={10}
          max={60}
          step={1}
          onChange={(v) => onChange({ steps: Math.round(v) })}
        />
        <SliderRow
          label="Denoising Strength"
          value={item.denoisingStrength}
          min={0.1}
          max={0.8}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => onChange({ denoisingStrength: v })}
        />
        <SliderRow
          label="CFG Scale"
          value={item.cfgScale}
          min={1.0}
          max={15.0}
          step={0.5}
          format={(v) => v.toFixed(1)}
          onChange={(v) => onChange({ cfgScale: v })}
        />
        <SliderRow
          label="BBox Confidence Threshold"
          value={item.bboxThreshold}
          min={0.1}
          max={0.95}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => onChange({ bboxThreshold: v })}
        />
        <SliderRow
          label="BBox Dilation (px)"
          value={item.bboxDilation}
          min={0}
          max={32}
          step={1}
          onChange={(v) => onChange({ bboxDilation: Math.round(v) })}
        />
        <SliderRow
          label="Mask Blur (px)"
          value={item.inpaintMaskBlur}
          min={0}
          max={16}
          step={1}
          onChange={(v) => onChange({ inpaintMaskBlur: Math.round(v) })}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  config: DetailerConfig;
  onChange: (cfg: DetailerConfig) => void;
  selectedModel?: InstalledGalleryModel | null;
  defaultExpanded?: boolean;
  alwaysExpanded?: boolean;
  hideToggle?: boolean;
  variant?: "accordion" | "standalone";
}

export default function DetailerPanel({
  config,
  onChange,
  selectedModel,
  defaultExpanded = false,
  alwaysExpanded = false,
  hideToggle = false,
  variant = "accordion",
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isExpanded = alwaysExpanded || expanded;
  const [activeTab, setActiveTab] = useState<DetailerType>("face");

  const setConfig = (patch: Partial<DetailerConfig>) =>
    onChange({ ...config, ...patch });

  // Get active items count
  const activeCount = config.items.filter((i) => i.enabled).length;

  // Toggle or get item
  const getItem = (type: DetailerType): DetailerItemConfig => {
    const existing = config.items.find((i) => i.type === type);
    if (existing) return existing;
    const preset = DETAILER_PRESETS.find((p) => p.type === type)!;
    return defaultItem(type, preset.defaultDetector, preset.defaultDenoise);
  };

  const updateItem = (type: DetailerType, patch: Partial<DetailerItemConfig>) => {
    const exists = config.items.some((i) => i.type === type);
    let nextItems: DetailerItemConfig[];
    if (exists) {
      nextItems = config.items.map((i) => (i.type === type ? { ...i, ...patch } : i));
    } else {
      const preset = DETAILER_PRESETS.find((p) => p.type === type)!;
      nextItems = [...config.items, { ...defaultItem(type, preset.defaultDetector, preset.defaultDenoise), ...patch }];
    }
    setConfig({ items: nextItems });
  };

  const toggleItemEnabled = (type: DetailerType, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = getItem(type);
    updateItem(type, { enabled: !current.enabled });
  };

  const currentPreset = DETAILER_PRESETS.find((p) => p.type === activeTab)!;
  const currentItem = getItem(activeTab);

  if (variant === "standalone") {
    return (
      <div className="space-y-4">
        {/* 1. Stage Header Banner */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-center justify-center shrink-0">
                <ScanFace className="w-4.5 h-4.5 text-[var(--accent)]" strokeWidth={1.5} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-[var(--ink)] tracking-tight">ADetailer Engine</h3>
                  <span className="text-[9px] font-mono font-bold text-[var(--accent)] bg-[var(--accent-ambient)] px-1.5 py-0.5 rounded border border-[var(--accent)]/30">
                    STAGE 3
                  </span>
                </div>
                <p className="text-[10px] text-[var(--ink-faint)] leading-snug">
                  Sequential anatomical face, hand, and micro-geometry restoration passes.
                </p>
              </div>
            </div>

            <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-ambient)] px-2 py-0.5 rounded-full font-semibold border border-[var(--accent)]/30 shrink-0">
              {activeCount} {activeCount === 1 ? "pass" : "passes"} active
            </span>
          </div>

          {/* Pipeline Link Strip */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)] text-xs font-mono">
            <span className="text-[10px] uppercase text-[var(--ink-faint)]">Pipeline Source</span>
            <span className="text-[11px] text-[var(--accent)] truncate max-w-[210px] font-semibold">
              {selectedModel?.title ?? selectedModel?.filename ?? "Base Checkpoint + UNet"}
            </span>
          </div>
        </div>

        {/* 2. Cascade Passes Status Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[var(--ink-faint)]">
              CASCADE PASSES
            </span>
            <span className="text-[9px] font-mono text-[var(--ink-faint)]">
              Select chip to edit targets
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {DETAILER_PRESETS.map((p) => {
              const item = getItem(p.type);
              const isSelected = activeTab === p.type;
              const isItemActive = item.enabled;

              return (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => setActiveTab(p.type)}
                  className={`relative py-2 px-1 text-xs font-mono rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--ink)] shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                  }`}
                >
                  <span className="font-semibold text-[11px]">{p.label}</span>
                  <span
                    className={`text-[8px] font-mono px-1 py-0.2 rounded-full font-bold ${
                      isItemActive
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "bg-[var(--surface)] text-[var(--ink-faint)] border border-[var(--line)]"
                    }`}
                  >
                    {isItemActive ? "ON" : "OFF"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Selected Target Workstation */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-[var(--ink)]">
                {currentPreset.label} Detailer Pass
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--ink-faint)] border border-[var(--line)]">
                {currentPreset.defaultDetector.split("/").pop()}
              </span>
            </div>

            {/* Direct Pass Toggle Button */}
            <button
              type="button"
              onClick={(e) => toggleItemEnabled(activeTab, e)}
              className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
                currentItem.enabled
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                  : "border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {currentItem.enabled ? (
                <>
                  <Check className="w-3 h-3" strokeWidth={2.5} />
                  <span>Pass Active</span>
                </>
              ) : (
                <span>Bypassed</span>
              )}
            </button>
          </div>

          <p className="text-[10px] text-[var(--ink-faint)] font-mono leading-relaxed">
            {currentPreset.description}
          </p>

          <ItemEditor
            item={currentItem}
            onChange={(patch) => updateItem(activeTab, patch)}
            detectorOptions={currentPreset.detectorOptions}
          />
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
          <ScanFace
            className="w-4 h-4 text-[var(--accent)]"
            strokeWidth={1.5}
          />
          <span className="text-xs font-semibold text-[var(--ink)] tracking-tight">ADetailer</span>
          <span className="text-[10px] font-mono text-[var(--ink-faint)] px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--surface-sunken)]">
            5 Passes
          </span>
          {(config.enabled || hideToggle) && (
            <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-ambient)] px-1.5 py-0.5 rounded font-semibold">
              {activeCount} {activeCount === 1 ? "pass" : "passes"} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Master Toggle Pill */}
          {!hideToggle && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextEnabled = !config.enabled;
                if (nextEnabled) setExpanded(true);
                // If enabling for first time and items empty, seed default items
                let nextItems = config.items;
                if (nextEnabled && nextItems.length === 0) {
                  nextItems = [
                    defaultItem("face", "bbox/yolov11l-face.pt", 0.35),
                    defaultItem("hand", "bbox/hand_yolov9c.pt", 0.32),
                  ];
                }
                setConfig({ enabled: nextEnabled, items: nextItems });
              }}
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.96] ${
                config.enabled ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
              }`}
              aria-pressed={config.enabled}
              aria-label="Toggle Detailer"
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
          {/* 1. Pipeline Link Strip */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)] text-xs font-mono">
            <span className="text-[10px] uppercase text-[var(--ink-faint)]">Pipeline Source</span>
            <span className="text-[11px] text-[var(--accent)] truncate max-w-[210px] font-semibold">
              {selectedModel?.title ?? selectedModel?.filename ?? "Base Checkpoint + UNet"}
            </span>
          </div>

          {/* 2. Cascade Passes Status Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[var(--ink-faint)]">
                CASCADE PASSES
              </span>
              <span className="text-[9px] font-mono text-[var(--ink-faint)]">
                Select chip to edit targets
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {DETAILER_PRESETS.map((p) => {
                const item = getItem(p.type);
                const isSelected = activeTab === p.type;
                const isItemActive = item.enabled;

                return (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => setActiveTab(p.type)}
                    className={`relative py-2 px-1 text-xs font-mono rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-ambient)] text-[var(--ink)] shadow-sm"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink-soft)]"
                    }`}
                  >
                    <span className="font-semibold text-[11px]">{p.label}</span>
                    <span
                      className={`text-[8px] font-mono px-1 py-0.2 rounded-full font-bold ${
                        isItemActive
                          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "bg-[var(--surface)] text-[var(--ink-faint)] border border-[var(--line)]"
                      }`}
                    >
                      {isItemActive ? "ON" : "OFF"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Selected Target Workstation */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3.5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-[var(--ink)]">
                  {currentPreset.label} Detailer Pass
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--ink-faint)] border border-[var(--line)]">
                  {currentPreset.defaultDetector.split("/").pop()}
                </span>
              </div>

              {/* Direct Pass Toggle Button */}
              <button
                type="button"
                onClick={(e) => toggleItemEnabled(activeTab, e)}
                className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
                  currentItem.enabled
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                    : "border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {currentItem.enabled ? (
                  <>
                    <Check className="w-3 h-3" strokeWidth={2.5} />
                    <span>Pass Active</span>
                  </>
                ) : (
                  <span>Bypassed</span>
                )}
              </button>
            </div>

            <p className="text-[10px] text-[var(--ink-faint)] font-mono leading-relaxed">
              {currentPreset.description}
            </p>

            <ItemEditor
              item={currentItem}
              onChange={(patch) => updateItem(activeTab, patch)}
              detectorOptions={currentPreset.detectorOptions}
            />
          </div>
        </div>
            )}
    </div>
  );
}
