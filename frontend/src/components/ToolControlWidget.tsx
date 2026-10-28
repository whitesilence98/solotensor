"use client";

import CustomSelect from "@/components/CustomSelect";
import { type ToolControl } from "@/lib/api";

export const FIELD =
  "workspace-field w-full px-3 py-2 text-xs font-mono outline-none rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export type Scalar = string | number | boolean;

export function cleanNodeTitle(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  s = s.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu, "").trim();
  if (/[a-zA-Z]/.test(s) && /[一-龥]/.test(s)) {
    s = s.replace(/[一-龥]+/g, "").trim();
  }
  if (/^clip\s*text\s*encode\s*(\(prompt\))?$/i.test(s)) {
    return "CLIP Text Encode";
  }
  return s.trim();
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
      displayTitle: "CFG Scale (Guidance)",
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

  return {
    displayTitle: cleaned || control.input_name || `Input ${index + 1}`,
    badge: control.kind.toUpperCase(),
    hint: control.role || undefined,
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

  const label = (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={id}
          className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]"
        >
          {meta.displayTitle}
        </label>
        {meta.badge && (
          <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1 py-0.2 font-mono text-[8px] font-bold text-[var(--ink-faint)] tracking-wider">
            {meta.badge}
          </span>
        )}
      </div>
      {meta.hint && (
        <span className="truncate font-mono text-[9px] text-[var(--ink-faint)] opacity-70">
          {meta.hint}
        </span>
      )}
    </div>
  );

  if (control.kind === "boolean") {
    const isChecked = Boolean(value ?? control.value);
    return (
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 transition hover:border-[var(--line-strong)]"
      >
        <div>
          <span className="block font-mono text-xs font-semibold text-[var(--ink)]">
            {meta.displayTitle}
          </span>
          <span className="mt-0.5 block font-mono text-[9px] text-[var(--ink-faint)]">
            {isChecked ? "Active / Enabled" : "Bypassed / Disabled"}
          </span>
        </div>
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
    );
  }

  if (control.kind === "select") {
    return (
      <div>
        {label}
        <CustomSelect
          id={id}
          value={String(value ?? control.value ?? "")}
          disabled={busy}
          onChange={(val) => onChange(val)}
          options={control.options.map(String)}
          className="w-full mt-1"
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
    const stepVal =
      control.step ?? ((maxVal - minVal) > 10 ? 1 : (maxVal - minVal) / 100);
    const currVal = typeof value === "number" ? value : Number(value ?? minVal);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={id}
            className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]"
          >
            {meta.displayTitle}
          </label>
          <span className="font-mono text-xs font-bold text-[var(--accent)]">
            {currVal}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            id={`${id}-slider`}
            min={minVal}
            max={maxVal}
            step={stepVal}
            value={currVal}
            disabled={busy}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--line-strong)] accent-[var(--accent)]"
          />
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
            className={`${FIELD} h-7 w-20 text-center tabular-nums font-mono text-xs shrink-0`}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {label}
      <div className="relative">
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
          className={`${FIELD} h-8 ${numeric ? "tabular-nums" : ""}`}
        />
      </div>
    </div>
  );
}
