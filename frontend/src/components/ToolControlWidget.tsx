"use client";

import CustomSelect from "@/components/CustomSelect";
import { type ToolControl } from "@/lib/api";

export const FIELD =
  "workspace-field w-full px-3 py-2 text-xs font-mono outline-none rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** Single-line row field: same tokens as FIELD, sized to the select trigger. */
const ROW_FIELD =
  "workspace-field w-full h-8 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 text-xs font-mono text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

const LABEL =
  "font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]";

/** Proportional accent fill for `.workspace-range` (see globals.css). */
export const rangeFill = (percent: number) =>
  `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--surface-soft) ${percent}%, var(--surface-soft) 100%)`;

export type Scalar = string | number | boolean;

/** ComfyUI input names that read better as product language than as node titles. */
const INPUT_LABELS: Record<string, string> = {
  sampler_name: "Sampler",
  scheduler: "Scheduler",
  steps: "Steps",
  cfg: "CFG Scale",
  guidance: "CFG Scale",
  denoise: "Denoise",
  seed: "Noise Seed",
  noise_seed: "Noise Seed",
  width: "Width",
  height: "Height",
  batch_size: "Batch Size",
  upscale_method: "Upscale Method",
};

/** Short, human hints. Never surface a raw identifier. */
const INPUT_HINTS: Record<string, string> = {
  cfg: "Prompt adherence weight",
  guidance: "Prompt adherence weight",
  steps: "Denoising iterations",
  denoise: "How much of the source to repaint",
  sampler_name: "Sampling algorithm",
  scheduler: "Noise schedule",
  upscale_method: "Resampling filter",
  batch_size: "Images per run",
};

/** Canonical casing for acronyms that must never be title-cased. */
const ACRONYMS: Record<string, string> = {
  CFG: "CFG",
  VAE: "VAE",
  CLIP: "CLIP",
  LORA: "LoRA",
  IP: "IP",
  CPU: "CPU",
  GPU: "GPU",
  SDE: "SDE",
  SGM: "SGM",
  DPM: "DPM",
  LCM: "LCM",
  SDXL: "SDXL",
  VHS: "VHS",
};

/** Trailing parentheticals that carry no information of their own. */
const ANNOTATION_PAREN = new Set(["for more steps", "prompt", "optional"]);

/** Lowercase connectors inside a title (`Text to Video`, not `Text To Video`). */
const CONNECTORS = new Set(["to", "of", "and", "for", "by", "in", "on", "with"]);

/** Numeric shorthand the workflow editors use for mode names. */
const TOKEN_FIXES: Array<[RegExp, string]> = [
  [/\btext2video\b/gi, "Text to Video"],
  [/\btext2img\b/gi, "Text to Image"],
  [/\bimg2img\b/gi, "Image to Image"],
];

/** Turn a raw ComfyUI node title into product language. */
export function cleanNodeTitle(raw: string): string {
  if (!raw) return "";
  let s = raw
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu, " ")
    .trim();
  if (/[a-zA-Z]/.test(s) && /[一-龥]/.test(s)) {
    s = s.replace(/[一-龥]+/g, " ");
  }
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";

  for (const [pattern, replacement] of TOKEN_FIXES) {
    s = s.replace(pattern, replacement);
  }

  // KSampler is one product token; protect it from the acronym split below.
  s = s
    .replace(/KSampler(?![a-z])/g, "\u0000")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\u0000/g, "KSampler")
    .replace(/\s+/g, " ")
    .trim();

  const paren = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (paren && ANNOTATION_PAREN.has(paren[2].trim().toLowerCase())) {
    s = paren[1].trim();
  }
  if (!s) return "";

  const words = s.split(" ");
  return words
    .map((word, i) => {
      const upper = word.toUpperCase();
      if (ACRONYMS[upper]) return ACRONYMS[upper];
      if (word.length <= 6 && word === upper && /[A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      // Connectors stay lowercase unless they open the title.
      if (i > 0 && CONNECTORS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export interface DisambiguatedControlMeta {
  displayTitle: string;
  badge?: string;
  placeholder?: string;
  hint?: string;
}

export function resolveControlMeta(
  control: ToolControl,
  index: number,
  allControls: ToolControl[],
): DisambiguatedControlMeta {
  const rawTitle = control.meta_title ?? control.label ?? "";
  const cleaned = cleanNodeTitle(rawTitle);

  /**
   * A graph can legitimately repeat an input across independent passes — Video
   * Test runs two SamplerCustomAdvanced stages, one video and one audio, each
   * with its own CFGGuider and KSamplerSelect. Both are live and separately
   * tunable, so they must stay on screen; numbering keeps them distinguishable
   * instead of hiding a real control behind a duplicate title.
   */
  const numbered = (title: string) => {
    const peers = allControls.filter(
      (c) => c.input_name === control.input_name,
    );
    if (peers.length < 2) return title;
    const ordinal = peers.findIndex((c) => c.id === control.id) + 1;
    return `${title} ${ordinal}`;
  };

  if (control.kind === "prompt") {
    const promptControls = allControls.filter((c) => c.kind === "prompt");
    const isMultiplePrompts = promptControls.length > 1;

    const valString = String(control.value || control.default || "").toLowerCase();
    const hasNegativeKeywords =
      valString.includes("noise") ||
      valString.includes("blur") ||
      valString.includes("ugly") ||
      valString.includes("deformed") ||
      valString.includes("watermark") ||
      valString.includes("bad") ||
      valString.includes("subtitles") ||
      valString.includes("artifacts");

    const isNegative =
      control.role === "negative_prompt" ||
      cleaned.toLowerCase().includes("negative") ||
      cleaned.toLowerCase().includes("neg") ||
      (isMultiplePrompts &&
        (hasNegativeKeywords ||
          (control.id === promptControls[1]?.id &&
            !cleaned.toLowerCase().includes("positive"))));

    if (isNegative) {
      return {
        displayTitle: "Negative Conditioning",
        badge: "Exclusions",
        placeholder:
          "Specify unwanted elements (e.g. blurry, noise, watermark, low quality, artifacts)…",
        hint: "Subtracted from the latent representation during sampling",
      };
    }

    return {
      displayTitle: isMultiplePrompts ? "Positive Prompt" : "Generation Prompt",
      badge: "Conditioning",
      placeholder:
        "Describe the subject, composition, atmosphere, lighting, and rendering style…",
      hint: "Primary textual guidance for the diffusion model",
    };
  }

  if (control.kind === "image") {
    return {
      displayTitle: cleaned || "Source Reference Image",
      badge: control.role === "mask" ? "Mask" : "Starter Frame",
      hint: "Uploaded starter image for conditioning",
    };
  }

  if (control.kind === "seed" || control.seed) {
    return {
      displayTitle: "Noise Seed",
      badge: "Randomization",
      hint: "-1 generates a random noise pattern each run",
    };
  }

  if (control.role === "cfg" || control.input_name === "cfg") {
    return {
      displayTitle: numbered("CFG Scale (Guidance)"),
      badge: "Adherence",
      hint: "Classifier-Free Guidance weight for prompt alignment",
    };
  }

  if (control.role === "steps" || control.input_name === "steps") {
    return {
      displayTitle: "Sampling Steps",
      badge: "Refinement",
      hint: "Number of iterative denoising steps",
    };
  }

  const hintKey = control.role || control.input_name || "";

  return {
    displayTitle: numbered(
      INPUT_LABELS[control.input_name] ?? (cleaned || `Input ${index + 1}`),
    ),
    hint: INPUT_HINTS[hintKey],
  };
}

export function DynamicControl({
  control,
  value,
  busy,
  meta,
  onChange,
}: {
  control: ToolControl;
  value: Scalar | undefined;
  busy: boolean;
  meta: DisambiguatedControlMeta;
  onChange: (value: Scalar) => void;
}) {
  const id = `control-${control.id}`;

  const labelRow = (right?: React.ReactNode) => (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={id} className={`${LABEL} truncate`}>
          {meta.displayTitle}
        </label>
        {meta.badge && (
          <span className="shrink-0 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-1 py-px font-mono text-[8px] font-bold tracking-wider text-[var(--ink-faint)]">
            {meta.badge}
          </span>
        )}
      </div>
      {right ??
        (meta.hint && (
          <span className="min-w-0 shrink truncate text-right font-mono text-[9px] text-[var(--ink-faint)]">
            {meta.hint}
          </span>
        ))}
    </div>
  );

  if (control.kind === "boolean") {
    const isChecked = Boolean(value ?? control.value);
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={id} className={`${LABEL} truncate`}>
            {meta.displayTitle}
          </label>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            {isChecked ? "Enabled" : "Bypassed"}
          </span>
        </div>
        <label
          htmlFor={id}
          className="flex h-8 cursor-pointer items-center justify-end rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 transition hover:border-[var(--line-strong)]"
        >
          <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-[var(--line-strong)] transition has-[:checked]:bg-[var(--accent)]">
            <input
              id={id}
              type="checkbox"
              checked={isChecked}
              disabled={busy}
              onChange={(event) => onChange(event.target.checked)}
              className="peer sr-only"
            />
            <span className="ml-0.5 h-4 w-4 rounded-full bg-[var(--ink-soft)] transition peer-checked:translate-x-4 peer-checked:bg-[var(--accent-ink)]" />
          </span>
        </label>
      </div>
    );
  }

  if (control.kind === "select") {
    return (
      <div>
        {labelRow()}
        <CustomSelect
          id={id}
          value={String(value ?? control.value ?? "")}
          disabled={busy}
          onChange={(val) => onChange(val)}
          options={control.options.map(String)}
          className="w-full"
          buttonClassName="w-full h-8 px-2.5"
        />
      </div>
    );
  }

  const numeric = control.numeric || control.kind === "number";

  const hasSlider =
    numeric &&
    typeof control.minimum === "number" &&
    typeof control.maximum === "number" &&
    control.maximum > control.minimum;

  if (hasSlider) {
    const minVal = control.minimum!;
    const maxVal = control.maximum!;
    const rawStep =
      control.step ?? ((maxVal - minVal) > 10 ? 1 : (maxVal - minVal) / 100);
    const stepVal = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
    const parsed = Number(value ?? minVal);
    const currVal = Number.isFinite(parsed) ? parsed : minVal;
    const percent = Math.min(
      100,
      Math.max(0, ((currVal - minVal) / (maxVal - minVal)) * 100),
    );

    return (
      <div className="space-y-1.5">
        {labelRow(
          <input
            id={id}
            type="number"
            min={minVal}
            max={maxVal}
            step={stepVal}
            value={currVal}
            disabled={busy}
            onChange={(e) => {
              const raw = e.target.value.trim();
              onChange(raw === "" ? minVal : Number(raw));
            }}
            className="w-14 shrink-0 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-right font-mono text-[11px] font-bold tabular-nums text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          />,
        )}
        <input
          type="range"
          id={`${id}-slider`}
          min={minVal}
          max={maxVal}
          step={stepVal}
          value={currVal}
          disabled={busy}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ background: rangeFill(percent) }}
          className="workspace-range w-full"
          aria-label={`${meta.displayTitle} slider`}
        />
        {meta.hint && (
          <span className="block font-mono text-[9px] leading-tight text-[var(--ink-faint)]">
            {meta.hint}
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      {labelRow()}
      <input
        id={id}
        type={numeric ? "number" : "text"}
        value={String(value ?? control.value ?? "")}
        disabled={busy}
        min={control.minimum ?? undefined}
        max={control.maximum ?? undefined}
        step={control.step ?? undefined}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (numeric) {
            onChange(raw === "" ? "" : Number(raw));
          } else {
            onChange(event.target.value);
          }
        }}
        className={`${ROW_FIELD} ${numeric ? "tabular-nums" : ""}`}
      />
    </div>
  );
}
