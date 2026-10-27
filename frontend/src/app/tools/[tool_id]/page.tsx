"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Flame,
  Heart,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Share2,
  Sliders,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UploadCloud,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import WorkspaceModal from "@/components/WorkspaceModal";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import CustomSelect from "@/components/CustomSelect";
import SeedInput from "@/components/SeedInput";
import AspectRatioSelector, {
  DEFAULT_TOOL_RATIOS,
} from "@/components/AspectRatioSelector";
import PromptComposer from "@/components/PromptComposer";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth-context";
import { Can } from "@/components/rbac";
import {
  api,
  uuid,
  type ProgressEvent,
  type ToolAspectRatio,
  type ToolControl,
  type ToolDetail,
  type ToolRunResult,
} from "@/lib/api";
import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from "@/lib/storage";

const RATIOS: ToolAspectRatio[] = DEFAULT_TOOL_RATIOS;
/** ToolAspectRatio plus the client-only "custom" mode, which is not sent to the API. */
type ToolRatio = ToolAspectRatio | "custom";
/**
 * The size mode a run last used. `values` already persists the width/height
 * numbers, but not which pill produced them — so without this a custom run
 * reloads showing "1:1" while still sending its custom pixels.
 */
interface ToolSizeDraft {
  ratio: ToolRatio;
  width: string;
  height: string;
}
const MODE_LABELS: Record<string, string> = {
  "text-to-image": "Text → Image",
  "image-to-image": "Image → Image",
  "text-to-video": "Text → Video",
  "image-to-video": "Image → Video",
};

const FIELD =
  "workspace-field w-full px-3 py-2 text-xs font-mono outline-none rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type Scalar = string | number | boolean;

function cleanNodeTitle(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  s = s.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu, "").trim();
  if (/[a-zA-Z]/.test(s) && /[\u4e00-\u9fa5]/.test(s)) {
    s = s.replace(/[\u4e00-\u9fa5]+/g, "").trim();
  }
  if (/^clip\s*text\s*encode\s*(\(prompt\))?$/i.test(s)) {
    return "CLIP Text Encode";
  }
  return s.trim();
}

interface DisambiguatedControlMeta {
  displayTitle: string;
  badge?: string;
  placeholder?: string;
  hint?: string;
}

function resolveControlMeta(
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

function DynamicControl({
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

export default function ToolDetailPage() {
  const params = useParams<{ tool_id: string }>();
  const router = useRouter();
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const [values, setValues] = useState<Record<string, Scalar>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [ratio, setRatio] = useState<ToolRatio>("1:1");
  /** Custom width/height as strings so the inputs can hold transient/empty values. */
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [result, setResult] = useState<ToolRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveToGallery, setSaveToGallery] = useState(true);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [starCount, setStarCount] = useState(1280);
  const [shareCopied, setShareCopied] = useState(false);
  const [copiedRecipeIndex, setCopiedRecipeIndex] = useState<number | null>(null);
  const [sessionHistory, setSessionHistory] = useState<ToolRunResult[]>([]);
  const socket = useRef<WebSocket | null>(null);

  // Drag and drop state for starter reference image
  const [isDragOver, setIsDragOver] = useState(false);
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [interrogating, setInterrogating] = useState(false);
  const [interrogateToast, setInterrogateToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fallback standalone prompts when no dedicated prompt control is exposed
  const [standalonePrompt, setStandalonePrompt] = useState("");
  const [standaloneNegativePrompt, setStandaloneNegativePrompt] = useState("");

  // Elapsed stopwatch
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (busy) {
      setElapsedMs(0);
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [busy]);

  const formattedElapsedTime = useMemo(() => {
    const totalSec = elapsedMs / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = (totalSec % 60).toFixed(1);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }, [elapsedMs]);

  const load = useCallback(() => {
    setError(null);
    api
      .getTool(params.tool_id)
      .then((nextTool) => {
        setTool(nextTool);
        setRatio(nextTool.default_aspect_ratio);
        const defaultVals = Object.fromEntries(
          nextTool.controls
            .filter((item) => item.kind !== "image")
            .map((item) => [item.id, item.value as Scalar]),
        );
        const savedVals = getStorageItem<Record<string, Scalar> | null>(
          STORAGE_KEYS.TOOL_VALUES(params.tool_id),
          null,
        );
        setValues(savedVals ? { ...defaultVals, ...savedVals } : defaultVals);
        // Restore the size mode too. `values` alone cannot express it: a custom
        // 1280×704 run restores its numbers, and without this the pill would
        // read "1:1" while the graph still received 1280×704.
        const savedSize = getStorageItem<ToolSizeDraft | null>(
          STORAGE_KEYS.TOOL_DIMENSIONS(params.tool_id),
          null,
        );
        const ratios: string[] = nextTool.supported_aspect_ratios ?? [];
        // "custom" is only offered when the graph can actually be sized, and a
        // tool can be replaced by one whose graph has no size node at all.
        const canRestoreCustom =
          ratios.length > 0 &&
          nextTool.controls.some(
            (c) => c.role === "width" || c.input_name === "width",
          ) &&
          nextTool.controls.some(
            (c) => c.role === "height" || c.input_name === "height",
          );
        if (
          savedSize &&
          (savedSize.ratio === "custom"
            ? canRestoreCustom
            : ratios.includes(savedSize.ratio))
        ) {
          setRatio(savedSize.ratio);
          setCustomWidth(savedSize.width);
          setCustomHeight(savedSize.height);
        }
        setFiles({});
        setResult(null);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load tool.",
        ),
      );
  }, [params.tool_id]);

  useEffect(() => {
    load();
    return () => socket.current?.close();
  }, [load]);

  const handleValueChange = useCallback(
    (controlId: string, value: Scalar) => {
      setValues((current) => {
        const next = { ...current, [controlId]: value };
        setStorageItem(STORAGE_KEYS.TOOL_VALUES(params.tool_id), next);
        return next;
      });
    },
    [params.tool_id],
  );

  const handleResetInputs = useCallback(() => {
    if (!tool) return;
    removeStorageItem(STORAGE_KEYS.TOOL_VALUES(params.tool_id));
    removeStorageItem(STORAGE_KEYS.TOOL_DIMENSIONS(params.tool_id));
    setValues(
      Object.fromEntries(
        tool.controls
          .filter((item) => item.kind !== "image")
          .map((item) => [item.id, item.value as Scalar]),
      ),
    );
    setFiles({});
    setStandalonePrompt("");
    setStandaloneNegativePrompt("");
    setNaturalDimensions(null);
    setRatio(tool.default_aspect_ratio);
    // Re-seed the custom inputs from the restored defaults, so a later switch
    // to Custom cannot resurrect the reset width/height.
    const widthCtrl = tool.controls.find(
      (c) => c.role === "width" || c.input_name === "width",
    );
    const heightCtrl = tool.controls.find(
      (c) => c.role === "height" || c.input_name === "height",
    );
    setCustomWidth(widthCtrl ? String(widthCtrl.value ?? "") : "");
    setCustomHeight(heightCtrl ? String(heightCtrl.value ?? "") : "");
  }, [tool, params.tool_id]);

  const handleRatioChange = useCallback(
    (newRatio: string) => {
      setRatio(newRatio as ToolRatio);
      if (!tool) return;
      // "custom" carries no preset of its own: it keeps whatever the current
      // width/height already are, so the seed effect is what fills the inputs.
      if (newRatio === "custom") return;
      const widthCtrl = tool.controls.find(
        (c) => c.role === "width" || c.input_name === "width",
      );
      const heightCtrl = tool.controls.find(
        (c) => c.role === "height" || c.input_name === "height",
      );
      // Presets come from the server (ASPECT_DIMENSIONS) rather than a client
      // copy, so the size shown is exactly the size the graph receives.
      const dims = tool.aspect_dimensions?.[newRatio];
      if (!dims || dims.length !== 2) return;
      if (widthCtrl || heightCtrl) {
        setValues((current) => {
          const next = { ...current };
          if (widthCtrl) next[widthCtrl.id] = dims[0];
          if (heightCtrl) next[heightCtrl.id] = dims[1];
          setStorageItem(STORAGE_KEYS.TOOL_VALUES(params.tool_id), next);
          return next;
        });
      }
    },
    [tool, params.tool_id],
  );

  // The latent width/height controls are the single source of truth for size.
  // Seeding the custom inputs from them keeps every code path — preset pill,
  // custom input, Match Size, and a restored draft — showing the same numbers.
  const widthControl = useMemo(
    () =>
      tool?.controls.find(
        (c) => c.role === "width" || c.input_name === "width",
      ) ?? null,
    [tool],
  );
  const heightControl = useMemo(
    () =>
      tool?.controls.find(
        (c) => c.role === "height" || c.input_name === "height",
      ) ?? null,
    [tool],
  );
  const hasSizeControls = Boolean(widthControl && heightControl);
  const dimensionMultiple = tool?.dimension_multiple ?? 8;
  /** Smallest size the server accepts; see the minimum on the width control. */
  const dimensionFloor = Math.max(64, dimensionMultiple);

  useEffect(() => {
    if (ratio !== "custom") return;
    if (widthControl) setCustomWidth(String(values[widthControl.id] ?? ""));
    if (heightControl) setCustomHeight(String(values[heightControl.id] ?? ""));
    // Seeding only; user edits to the inputs must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio, widthControl?.id, heightControl?.id]);

  // Persist the size mode next to the numbers. `values` already survives a
  // reload, so without this the restored run would show "1:1" while still
  // submitting custom pixels. Skipped until the tool loads, and skipped for a
  // "custom" mode the graph cannot honour.
  useEffect(() => {
    if (!tool) return;
    if (ratio === "custom" && !hasSizeControls) return;
    setStorageItem<ToolSizeDraft>(STORAGE_KEYS.TOOL_DIMENSIONS(params.tool_id), {
      ratio,
      width: customWidth,
      height: customHeight,
    });
  }, [tool, ratio, customWidth, customHeight, hasSizeControls, params.tool_id]);

  const isValidDimension = useCallback(
    (value: string) => {
      const dimension = Number(value);
      return (
        Number.isInteger(dimension) &&
        dimension >= dimensionFloor &&
        dimension <= 4096 &&
        dimension % dimensionMultiple === 0
      );
    },
    [dimensionMultiple, dimensionFloor],
  );
  const customWidthInvalid = customWidth !== "" && !isValidDimension(customWidth);
  const customHeightInvalid =
    customHeight !== "" && !isValidDimension(customHeight);
  /**
   * CSS aspect ratio for preview panes. "custom" is not a valid CSS value, and
   * feeding it to BeforeAfterSlider collapses the comparison to zero height, so
   * custom mode reports its actual pixel ratio instead.
   */
  const cssAspectRatio =
    ratio === "custom"
      ? `${Number(customWidth) || 1}/${Number(customHeight) || 1}`
      : ratio.replace(":", "/");
  /** Human label for "custom": the pill name alone says nothing about the size. */
  const ratioLabel =
    ratio === "custom"
      ? `${customWidth || "?"} × ${customHeight || "?"}`
      : ratio;

  const handleCustomDimensionChange = useCallback(
    (axis: "width" | "height", raw: string) => {
      if (axis === "width") setCustomWidth(raw);
      else setCustomHeight(raw);
      const control = axis === "width" ? widthControl : heightControl;
      if (!control) return;
      const parsed = Number(raw);
      if (raw === "" || !Number.isFinite(parsed)) return;
      // Only persist a value the graph can actually run; the backend floors
      // off-grid sizes, which would make the input disagree with the result.
      if (!isValidDimension(raw)) return;
      setValues((current) => {
        const next = { ...current, [control.id]: parsed };
        setStorageItem(STORAGE_KEYS.TOOL_VALUES(params.tool_id), next);
        return next;
      });
    },
    [widthControl, heightControl, isValidDimension, params.tool_id],
  );

  /** Snap a natural pixel size onto the tool's latent grid, preserving aspect. */
  const handleMatchDimensions = useCallback(() => {
    if (!naturalDimensions || !hasSizeControls) return;
    const aspect = naturalDimensions.width / naturalDimensions.height;
    const maxDim = 1344;
    const minDim = 512;
    let targetW: number;
    let targetH: number;
    if (aspect >= 1) {
      targetW = Math.min(maxDim, Math.max(minDim, naturalDimensions.width));
      targetH = Math.round(targetW / aspect);
    } else {
      targetH = Math.min(maxDim, Math.max(minDim, naturalDimensions.height));
      targetW = Math.round(targetH * aspect);
    }
    // The server rejects anything under 64, so an extreme aspect (a very tall
    // panorama, say) must clamp to the floor rather than produce e.g. 24 px and
    // fail at submit time with a server-shaped error.
    const snap = (value: number) =>
      Math.max(
        dimensionFloor,
        Math.min(4096, Math.round(value / dimensionMultiple) * dimensionMultiple),
      );
    const nextW = snap(targetW);
    const nextH = snap(targetH);
    setRatio("custom");
    setCustomWidth(String(nextW));
    setCustomHeight(String(nextH));
    setValues((current) => {
      const next = { ...current };
      if (widthControl) next[widthControl.id] = nextW;
      if (heightControl) next[heightControl.id] = nextH;
      setStorageItem(STORAGE_KEYS.TOOL_VALUES(params.tool_id), next);
      return next;
    });
  }, [
    naturalDimensions,
    hasSizeControls,
    dimensionMultiple,
    widthControl,
    heightControl,
    params.tool_id,
  ]);

  // Group controls into categories
  const promptControls = useMemo(
    () => tool?.controls.filter((c) => c.kind === "prompt") ?? [],
    [tool],
  );

  const negativePromptCtrl = useMemo(
    () =>
      promptControls.find(
        (c) =>
          c.role === "negative_prompt" ||
          c.input_name?.toLowerCase().includes("negative") ||
          c.meta_title?.toLowerCase().includes("negative"),
      ),
    [promptControls],
  );

  const positivePromptCtrl = useMemo(
    () =>
      promptControls.find((c) => c !== negativePromptCtrl) ??
      promptControls[0],
    [promptControls, negativePromptCtrl],
  );

  const imageControls = useMemo(
    () => tool?.controls.filter((control) => control.kind === "image") ?? [],
    [tool],
  );

  const primaryImageControl = useMemo(
    () => imageControls[0],
    [imageControls],
  );

  const seedControl = useMemo(
    () =>
      tool?.controls.find(
        (c) =>
          c.kind === "seed" ||
          c.seed ||
          c.role === "seed" ||
          c.input_name === "seed" ||
          c.input_name === "noise_seed",
      ),
    [tool],
  );

  const isEssential = useCallback(
    (c: ToolControl) =>
      Boolean(
        c.is_essential ||
        c.kind === "seed" ||
        c.seed ||
        ["seed", "width", "height", "cfg", "steps"].includes(c.role || "") ||
        ["seed", "noise_seed", "cfg", "guidance", "steps", "width", "height"].includes(c.input_name),
      ),
    [],
  );

  const essentialControls = useMemo(
    () =>
      tool?.controls.filter(
        (c) =>
          isEssential(c) &&
          c.kind !== "prompt" &&
          c.kind !== "image" &&
          c !== seedControl &&
          c.input_name !== "width" &&
          c.input_name !== "height",
      ) ?? [],
    [tool, isEssential, seedControl],
  );

  const customControls = useMemo(
    () =>
      tool?.controls.filter(
        (c) =>
          !isEssential(c) &&
          c.kind !== "prompt" &&
          c.kind !== "image",
      ) ?? [],
    [tool, isEssential],
  );

  // First reference image file and URL
  const firstImageFile = useMemo(() => {
    if (primaryImageControl && files[primaryImageControl.id]) {
      return files[primaryImageControl.id];
    }
    const anyKey = Object.keys(files)[0];
    return anyKey ? files[anyKey] : undefined;
  }, [primaryImageControl, files]);

  const [inputImageUrl, setInputImageUrl] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"comparison" | "result">("comparison");

  useEffect(() => {
    if (!firstImageFile) {
      setInputImageUrl(null);
      setNaturalDimensions(null);
      return;
    }
    const url = URL.createObjectURL(firstImageFile);
    setInputImageUrl(url);

    const img = new Image();
    img.onload = () => {
      setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;

    return () => URL.revokeObjectURL(url);
  }, [firstImageFile]);

  // Image upload handler
  const handleFileUpload = useCallback(
    (file: File) => {
      const targetId = primaryImageControl?.id || "input_image";
      setFiles((current) => ({ ...current, [targetId]: file }));
    },
    [primaryImageControl],
  );

  const handleClearImage = useCallback(() => {
    const targetId = primaryImageControl?.id || "input_image";
    setFiles((current) => {
      const next = { ...current };
      delete next[targetId];
      return next;
    });
  }, [primaryImageControl]);

  // Active prompt values
  const currentPositivePrompt = useMemo(() => {
    if (positivePromptCtrl && values[positivePromptCtrl.id] !== undefined) {
      return String(values[positivePromptCtrl.id]);
    }
    return standalonePrompt;
  }, [positivePromptCtrl, values, standalonePrompt]);

  const currentNegativePrompt = useMemo(() => {
    if (negativePromptCtrl && values[negativePromptCtrl.id] !== undefined) {
      return String(values[negativePromptCtrl.id]);
    }
    return standaloneNegativePrompt;
  }, [negativePromptCtrl, values, standaloneNegativePrompt]);

  const handlePromptChange = useCallback(
    (newVal: string) => {
      setStandalonePrompt(newVal);
      if (positivePromptCtrl) {
        handleValueChange(positivePromptCtrl.id, newVal);
      }
    },
    [positivePromptCtrl, handleValueChange],
  );

  const handleNegativePromptChange = useCallback(
    (newVal: string) => {
      setStandaloneNegativePrompt(newVal);
      if (negativePromptCtrl) {
        handleValueChange(negativePromptCtrl.id, newVal);
      }
    },
    [negativePromptCtrl, handleValueChange],
  );

  // Auto-prompt extraction from image metadata
  const handleAutoPromptFromReference = useCallback(async () => {
    if (!firstImageFile) return;
    setInterrogating(true);
    setInterrogateToast(null);
    try {
      const res = await api.interrogateImage(firstImageFile, firstImageFile.name);
      if (res.has_metadata && res.metadata?.prompt) {
        handlePromptChange(res.metadata.prompt);
        if (res.metadata.negative_prompt && negativePromptCtrl) {
          handleValueChange(negativePromptCtrl.id, res.metadata.negative_prompt);
        }
        setInterrogateToast("Metadata extracted!");
      } else if (res.tags && res.tags.length > 0) {
        const topTags = res.tags.slice(0, 15).join(", ");
        handlePromptChange(topTags);
        setInterrogateToast(`${res.tags.length} tags detected!`);
      } else {
        setInterrogateToast("No metadata found");
      }
    } catch {
      setInterrogateToast("Interrogation failed");
    } finally {
      setInterrogating(false);
      setTimeout(() => setInterrogateToast(null), 3000);
    }
  }, [firstImageFile, handlePromptChange, negativePromptCtrl, handleValueChange]);

  // Mode-aware curated sample prompt recipes
  const sampleRecipes = useMemo(() => {
    if (!tool) return [];
    if (tool.mode === "image-to-image") {
      return [
        {
          title: "Fine Art Oil Painting",
          tag: "Impressionist",
          prompt: "Masterwork oil painting, rich visible impasto texture, dramatic chiaroscuro lighting, deep shadows, fine museum brushwork",
        },
        {
          title: "Cyberpunk Obsidian",
          tag: "Sci-Fi",
          prompt: "Cyberpunk obsidian overhaul, gleaming neon accents, rain-slicked reflective surfaces, volumetric atmospheric haze, hyperdetailed",
        },
        {
          title: "Analog 35mm Film",
          tag: "Cinematic",
          prompt: "Vintage 35mm film photograph, subtle grain, natural warm ambient lighting, Kodak Portra 400 tones, authentic depth",
        },
      ];
    }
    if (tool.mode === "text-to-video" || tool.mode === "image-to-video") {
      return [
        {
          title: "Slow Continuous Tracking",
          tag: "Camera Motion",
          prompt: "Slow continuous camera pan tracking across the subject, gentle atmospheric breeze, dynamic rim light, 35mm film motion",
        },
        {
          title: "Volumetric Mist Drift",
          tag: "Atmospheric",
          prompt: "Ethereal morning mist gently rolling across landscape, golden hour sunlight rays breaking through, smooth cinematic motion",
        },
        {
          title: "Dynamic Action Zoom",
          tag: "Energetic",
          prompt: "Dynamic zoom and forward camera movement, swirling glowing particles, cinematic high shutter speed, fluid motion",
        },
      ];
    }
    return [
      {
        title: "Studio Portrait Photography",
        tag: "Editorial",
        prompt: "Award-winning studio portrait photography, dramatic rim lighting, 8k uhd, shallow depth of field, sharp focus, 35mm photograph",
      },
      {
        title: "Obsidian Bioluminescent",
        tag: "Concept Art",
        prompt: "Futuristic obsidian mechanical structure, glowing bioluminescent circuit traces, atmospheric mist, volumetric raytracing, Octane render",
      },
      {
        title: "Vibrant Anime Masterpiece",
        tag: "Anime",
        prompt: "Vibrant cel-shaded anime aesthetic, expressive line art, dramatic sunset sky with clouds, floating glowing petals, masterpiece",
      },
    ];
  }, [tool]);

  const handleApplyRecipe = (promptText: string) => {
    handlePromptChange(promptText);
  };

  const handleCopyRecipe = (promptText: string, idx: number) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(promptText);
      setCopiedRecipeIndex(idx);
      setTimeout(() => setCopiedRecipeIndex(null), 2000);
    }
  };

  const missingImages = imageControls.filter((control) => !files[control.id]);
  const canRun =
    Boolean(tool) &&
    !busy &&
    (!tool?.requires_image || missingImages.length === 0);

  const run = useCallback(async () => {
    if (!tool || !canRun) return;
    const clientId = uuid();
    setBusy(true);
    setError(null);
    setProgress({ type: "queued" });
    const nextSocket = api.openProgressSocket(clientId, (event) =>
      setProgress(event),
    );
    socket.current = nextSocket;
    try {
      // In custom mode the two inputs are the authority: they may be ahead of
      // `values` while a value is mid-edit, so submit them explicitly. The API
      // enum has no "custom" member, so a preset is sent as-is and custom mode
      // reuses the tool's default preset purely as a carrier — the explicit
      // width/height in `values` are what the graph receives.
      const submittedRatio: ToolAspectRatio =
        ratio === "custom" ? tool.default_aspect_ratio : ratio;
      const submittedValues: Record<string, Scalar> = { ...values };
      if (ratio === "custom" && hasSizeControls) {
        const w = Number(customWidth);
        const h = Number(customHeight);
        if (!isValidDimension(customWidth) || !isValidDimension(customHeight)) {
          throw new Error(
            `Width and height must be whole pixels, 64–4096, in multiples of ${dimensionMultiple}.`,
          );
        }
        if (widthControl) submittedValues[widthControl.id] = w;
        if (heightControl) submittedValues[heightControl.id] = h;
      }
      const runResult = await api.runTool(
        tool.tool_id,
        currentPositivePrompt,
        submittedRatio,
        undefined,
        submittedValues,
        files,
        { clientId, saveToGallery },
      );
      setResult(runResult);
      setSessionHistory((prev) => [
        runResult,
        ...prev.filter((r) => r.prompt_id !== runResult.prompt_id),
      ].slice(0, 8));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run tool.");
    } finally {
      nextSocket.close();
      socket.current = null;
      setBusy(false);
    }
  }, [
    tool,
    canRun,
    currentPositivePrompt,
    ratio,
    values,
    files,
    saveToGallery,
    hasSizeControls,
    customWidth,
    customHeight,
    isValidDimension,
    dimensionMultiple,
    widthControl,
    heightControl,
  ]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to run
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (canRun) {
          e.preventDefault();
          void run();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRun, run]);

  const progressPercentage = useMemo(() => {
    if (!progress || progress.type !== "progress") return 0;
    const val = progress.value ?? 0;
    const max = progress.max ?? 1;
    return Math.min(100, Math.max(0, Math.round((val / max) * 100)));
  }, [progress]);

  const handleDelete = async () => {
    if (!tool) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteTool(tool.tool_id);
      router.push("/tools");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete tool");
      setDeleting(false);
    }
  };

  const handleShare = () => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  };

  if (!tool && !error) {
    return (
      <main
        id="main-content"
        className="workspace-scroll flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)] p-8"
        role="status"
        aria-busy="true"
        aria-label="Loading tool"
      >
        <div className="mx-auto max-w-[1600px] w-full space-y-6">
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-soft)]" />
          <div className="h-10 w-2/5 animate-pulse rounded bg-[var(--surface-soft)]" />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="h-[500px] animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--surface)]" />
            <div className="h-[500px] animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--surface)]" />
          </div>
        </div>
      </main>
    );
  }

  if (error && !tool) {
    return (
      <main
        id="main-content"
        className="workspace-scroll flex h-full min-h-0 items-center justify-center bg-[var(--ground)] p-6"
      >
        <div className="w-full max-w-md rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-[var(--danger)]" />
          <h2 className="text-base font-bold text-[var(--ink)]">Failed to load workflow tool</h2>
          <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Link
              href="/tools"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to tools
            </Link>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="workspace-scroll flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)] text-[var(--ink-soft)]"
    >
      {/* 1. TOP HEADER & IDENTITY BAR (Matches Models Detail Page) */}
      <header className="z-30 border-b border-[var(--line)] bg-[var(--ground)]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8">
          {/* Breadcrumb row with share toast */}
          <div className="mb-2.5 flex items-center justify-between">
            <Link
              href="/tools"
              className="group inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors"
            >
              <ArrowLeft
                className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
              <span>All Workflows</span>
            </Link>
            {shareCopied && (
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] animate-fade-in">
                Link copied to clipboard!
              </span>
            )}
          </div>

          {/* Title & Actions Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink)]">
                {tool!.name}
              </h1>
              <span className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                {MODE_LABELS[tool!.mode] ?? tool!.mode}
              </span>
              <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                {tool!.output_kind === "video" ? "MP4 VIDEO" : "PNG IMAGE"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Star Button */}
              <button
                type="button"
                onClick={() => {
                  setIsStarred((prev) => !prev);
                  setStarCount((prev) => (isStarred ? prev - 1 : prev + 1));
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isStarred
                    ? "border-[var(--warning)] bg-[var(--warning-surface)] text-[var(--warning)]"
                    : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                }`}
              >
                <Star
                  className={`h-3.5 w-3.5 ${
                    isStarred ? "fill-[var(--warning)] text-[var(--warning)]" : ""
                  }`}
                />
                <span className="font-mono text-[11px]">
                  {(starCount / 1000).toFixed(1)}K star
                </span>
              </button>

              {/* Share Button */}
              <button
                type="button"
                onClick={handleShare}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-[var(--ink-faint)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                title="Share tool link"
              >
                <Share2 className="h-4 w-4" />
              </button>

              {/* Open in Visual Canvas */}
              <Link
                href={`/tools/canvas?from=${tool!.tool_id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                title="Open and edit this tool inside Node Canvas"
              >
                <Cpu className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Visual Canvas</span>
              </Link>

              {/* Delete Tool (Owner / Admin) */}
              <Can do="tool:delete" ownerId={tool?.user_id}>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--danger-line)]/50 bg-[var(--danger-surface)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--danger)] transition hover:border-[var(--danger-line)] hover:bg-[var(--danger)]/20"
                  title="Delete Tool"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </Can>
            </div>
          </div>

          {/* Author Attribution & Telemetry Row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <UserAvatar
                username={tool!.author_username || "SoloTensor"}
                size="xs"
                shape="square"
              />
              <span className="text-[var(--ink-faint)]">by</span>
              <span className="font-mono font-bold text-[var(--ink)]">
                {tool!.author_username ? `@${tool!.author_username}` : "@solotensor"}
              </span>
            </div>

            <span className="text-[var(--line-strong)]">·</span>

            <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {tool!.created_at
                  ? new Date(tool!.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Local Archive"}
              </span>
            </div>

            <span className="text-[var(--line-strong)]">·</span>

            <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--accent)] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>COMFYUI LOCAL ENGINE</span>
            </div>
          </div>

          {/* Feature Badges Row */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--line)] pt-2.5">
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]">
              ⚡ Parametric Graph
            </span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]">
              📐 Multi-Aspect Support
            </span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]">
              🔒 Private Offline Execution
            </span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]">
              🖼️ Auto-Saved to Library
            </span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]">
              {tool!.controls.length} Exposed Controls
            </span>
          </div>
        </div>
      </header>

      {/* 2. MAIN 2-COLUMN SHOWCASE & EXECUTION STAGE */}
      <div className="mx-auto max-w-[1600px] w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* LEFT COLUMN: Hero Showcase, Telemetry HUD, Sample Recipes, Readme, History */}
          <section className="space-y-6 min-w-0">
            {/* STAGE CONTAINER: Shows Execution Telemetry HUD when generating, Completed Output when done, or Interactive Showcase when idle */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-xl">
              {/* STAGE HEADER BAR */}
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4">
                <div className="flex items-center gap-2.5">
                  {busy ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent)]"></span>
                    </span>
                  ) : (
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        result?.images.length ? "bg-emerald-400" : "bg-[var(--accent)]"
                      }`}
                    />
                  )}
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
                    {busy
                      ? progress?.type === "progress"
                        ? `Rendering Step ${progress.value ?? 0}/${progress.max ?? 20}`
                        : "Executing ComfyUI Graph…"
                      : result?.images.length
                      ? "Generation Output"
                      : "Canvas Stage"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {result?.images.length && inputImageUrl ? (
                    <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setPreviewTab("comparison")}
                        className={`rounded px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition ${
                          previewTab === "comparison"
                            ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        Comparison
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab("result")}
                        className={`rounded px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition ${
                          previewTab === "result"
                            ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        Result Only
                      </button>
                    </div>
                  ) : null}

                  {result?.images.length ? (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-1.5 text-[var(--ink-soft)] hover:text-[var(--accent)] transition"
                      title="Open in full-screen Lightbox"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* STAGE MAIN BODY */}
              <div className="min-h-[420px] p-4 sm:p-6 flex items-center justify-center bg-[#0d0e0d]">
                {busy ? (
                  /* LIVE EXECUTION TELEMETRY HUD */
                  <div className="w-full max-w-md rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-2xl backdrop-blur-md animate-fade-in">
                    <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent)]"></span>
                        </span>
                        <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase">
                          {progress?.type === "progress"
                            ? "Sampling Latents"
                            : progress?.type === "executing"
                            ? "Executing Graph"
                            : "Pipeline Queued"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-soft)] bg-[var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[var(--line)]">
                        <Clock className="h-3 w-3 text-[var(--accent)]" />
                        <span>{formattedElapsedTime}</span>
                      </div>
                    </div>

                    <div className="mb-5">
                      <h3 className="text-lg font-bold tracking-tight text-[var(--ink)]">
                        {progress?.type === "progress"
                          ? `Denoising Step (${progress.value ?? 0}/${progress.max ?? 20})`
                          : progress?.type === "executing"
                          ? `Node: ${progress.node ?? "Pipeline Stage"}`
                          : "Synthesizing Pipeline Parameters…"}
                      </h3>
                      <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
                        {progress?.message || "Streaming through local ComfyUI graph"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between font-mono text-[10px] font-semibold text-[var(--ink-soft)]">
                        <span>PROGRESS</span>
                        <span className="text-[var(--accent)]">{progressPercentage}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] border border-[var(--line)]">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-all duration-300 shadow-[0_0_10px_rgba(213,240,111,0.3)]"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2 pt-3 border-t border-[var(--line)] font-mono text-[9px] text-[var(--ink-faint)]">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-3 w-3 text-[var(--ink-soft)]" />
                        <span>COMFYUI LOCAL</span>
                      </div>
                      <div className="text-right">
                        <span>ASPECT: {ratioLabel}</span>
                      </div>
                    </div>
                  </div>
                ) : result?.images.length ? (
                  /* COMPLETED RESULT VIEW */
                  <div className="flex w-full flex-col gap-4 animate-fade-in">
                    {inputImageUrl && previewTab === "comparison" ? (
                      <BeforeAfterSlider
                        beforeUrl={inputImageUrl}
                        afterUrl={result.images[0].url}
                        beforeLabel="Original Input"
                        afterLabel="Generated Output"
                        aspectRatio={cssAspectRatio}
                      />
                    ) : (
                      <div className="relative aspect-video max-h-[520px] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] flex items-center justify-center p-2 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.images[0].url}
                          alt={`Generated result from ${tool!.name}`}
                          className="max-h-[500px] w-auto max-w-full object-contain rounded-lg"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--ink)]">
                          {result.images[0].filename || "output.png"}
                        </span>
                        <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] text-[var(--accent)] font-semibold">
                          {ratioLabel} · PNG
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={result.images[0].url}
                          download={result.images[0].filename || "tool_output.png"}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </a>
                        <a
                          href={result.images[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Open Full Res</span>
                        </a>
                      </div>
                    </div>
                  </div>
                ) : error ? (
                  /* ERROR STATE */
                  <div className="w-full max-w-md rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center animate-fade-in">
                    <AlertCircle className="mx-auto mb-3 h-8 w-8 text-[var(--danger)]" />
                    <h2 className="text-base font-bold text-[var(--ink)]">Execution Error</h2>
                    <p className="mt-1 font-mono text-xs text-[var(--danger)]">{error}</p>
                    <button
                      type="button"
                      onClick={() => void run()}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[var(--danger-line)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--danger-surface)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry Execution
                    </button>
                  </div>
                ) : (
                  /* IDLE / SHOWCASE HERO (No blank screen!) */
                  <div className="w-full flex flex-col items-center justify-center text-center p-6 sm:p-10">
                    {tool!.thumbnail_url ? (
                      <div className="relative aspect-video max-h-[380px] w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] mb-6 shadow-2xl group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tool!.thumbnail_url}
                          alt={tool!.name}
                          className="h-full w-full object-cover opacity-90 transition group-hover:scale-105 duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-5">
                          <div className="text-left">
                            <span className="rounded bg-[var(--accent)] text-[var(--accent-ink)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider">
                              WORKFLOW PREVIEW
                            </span>
                            <h3 className="text-base font-bold text-white mt-1">
                              {tool!.name}
                            </h3>
                            <p className="text-xs text-white/70 font-mono">
                              Press &ldquo;Generate Output&rdquo; or ⌘↵ to execute locally.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : inputImageUrl ? (
                      <div className="relative aspect-video max-h-[380px] w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] mb-6 p-2 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={inputImageUrl}
                          alt="Input Frame"
                          className="max-h-[340px] w-auto object-contain rounded-lg"
                        />
                        <div className="absolute bottom-4 left-4 rounded-md bg-black/80 backdrop-blur-md px-2.5 py-1 font-mono text-[10px] text-white/90 border border-white/10">
                          STARTER IMAGE LOADED · READY TO PROCESS
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-sunken)] shadow-inner mb-5">
                        <Sparkles className="h-8 w-8 text-[var(--accent)]" />
                      </div>
                    )}

                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
                      {tool!.name}
                    </h2>
                    <p className="mt-2 max-w-[50ch] text-xs leading-relaxed text-[var(--ink-faint)] font-mono">
                      Configure your prompt and generation parameters on the right rail. Press{" "}
                      <kbd className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                        ⌘ Enter
                      </kbd>{" "}
                      to launch local synthesis.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] text-[var(--ink-faint)]">
                      <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1">
                        ⚡ ComfyUI Graph Engine
                      </span>
                      <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1">
                        🖼️ {MODE_LABELS[tool!.mode] ?? tool!.mode}
                      </span>
                      <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1">
                        📐 Aspect: {ratioLabel}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. SAMPLE RECIPES & PROMPT PRESETS (Parity with Models Detail Sample Cards) */}
            {sampleRecipes.length > 0 && (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)]">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      Sample Recipes & Presets
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                    1-Click Apply to Form
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {sampleRecipes.map((recipe, idx) => (
                    <div
                      key={recipe.title}
                      className="group flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-raised)]"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs font-bold text-[var(--ink)]">
                            {recipe.title}
                          </span>
                          <span className="rounded bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.2 font-mono text-[9px] font-semibold border border-[var(--accent)]/20">
                            {recipe.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--ink-soft)] font-mono line-clamp-3 leading-relaxed mb-3">
                          &ldquo;{recipe.prompt}&rdquo;
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--line)]/60">
                        <button
                          type="button"
                          onClick={() => handleApplyRecipe(recipe.prompt)}
                          className="flex-1 py-1 px-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] font-mono text-[10px] font-bold text-center transition hover:bg-[var(--accent-hover)]"
                        >
                          Apply to Tool
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyRecipe(recipe.prompt, idx)}
                          className="p-1 rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)] transition"
                          title="Copy prompt text"
                        >
                          {copiedRecipeIndex === idx ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. WORKFLOW PIPELINE & ARCHITECTURE SPECIFICATION */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/15 text-sky-400">
                    <Layers className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Pipeline Architecture & Node Graph
                  </h3>
                </div>
                <Link
                  href={`/tools/canvas?from=${tool!.tool_id}`}
                  className="font-mono text-[10px] font-bold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                >
                  <span>Open in Canvas</span>
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Node Pipeline Flow Visualizer */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-4">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] block mb-2.5">
                  Execution Flow Diagram
                </span>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  {tool!.requires_image && (
                    <>
                      <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1.5 font-bold text-[var(--ink)]">
                        <UploadCloud className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span>LoadImage</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
                    </>
                  )}
                  <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1.5 font-bold text-[var(--ink)]">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>CLIP Conditioning</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
                  <div className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 font-bold text-[var(--accent)]">
                    <Zap className="h-3.5 w-3.5" />
                    <span>KSampler Diffusion</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
                  <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1.5 font-bold text-[var(--ink)]">
                    <Cpu className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
                    <span>VAE Latent Decode</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
                  <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1.5 font-bold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Save Output</span>
                  </div>
                </div>
              </div>

              {/* Documentation Text */}
              <div className="space-y-2 text-xs font-mono text-[var(--ink-soft)] leading-relaxed">
                <p>
                  This tool exposes a streamlined parameter interface dynamically mapped to its internal ComfyUI execution graph.
                  All graph inputs are validated on the backend and dispatched through the asynchronous WebSocket streaming bridge.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                    <span className="text-[10px] text-[var(--ink-faint)] block">Default Aspect</span>
                    <span className="font-bold text-[var(--ink)]">{tool!.default_aspect_ratio}</span>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                    <span className="text-[10px] text-[var(--ink-faint)] block">Output Kind</span>
                    <span className="font-bold text-[var(--accent)] uppercase">{tool!.output_kind}</span>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                    <span className="text-[10px] text-[var(--ink-faint)] block">Image Required</span>
                    <span className="font-bold text-[var(--ink)]">{tool!.requires_image ? "Yes (I2I/I2V)" : "No (T2I/T2V)"}</span>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                    <span className="text-[10px] text-[var(--ink-faint)] block">Execution Target</span>
                    <span className="font-bold text-[var(--ink)]">Local ComfyUI</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. SESSION RUNS HISTORY */}
            {sessionHistory.length > 0 && (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Session Generations ({sessionHistory.length})
                  </h3>
                  <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                    Click to inspect output
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {sessionHistory.map((hist, idx) => (
                    <button
                      key={hist.prompt_id || idx}
                      type="button"
                      onClick={() => setResult(hist)}
                      className={`relative aspect-square overflow-hidden rounded-lg border transition ${
                        result?.prompt_id === hist.prompt_id
                          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/40"
                          : "border-[var(--line)] hover:border-[var(--ink-soft)]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={hist.images[0]?.url}
                        alt="Session run output"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* RIGHT COLUMN: Sticky Telemetry, Parameters & License Rail (380px) */}
          <aside className="space-y-4 self-start lg:sticky lg:top-20">
            {/* Primary Action Button (Generate Output) */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void run()}
                disabled={!canRun}
                aria-busy={busy}
                className="flex w-full items-center justify-between rounded-xl bg-[var(--accent)] px-4 py-3.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--accent-ink)] shadow-[0_0_16px_rgba(213,240,111,0.2)] transition hover:bg-[var(--accent-hover)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  {busy ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 fill-[var(--accent-ink)]" />
                  )}
                  <span>{busy ? "Generating Output…" : "Generate Output"}</span>
                </span>
                <span className="font-mono text-[10px] opacity-80 flex items-center gap-1">
                  <span>⌘↵</span>
                  <span>·</span>
                  <span>LOCAL</span>
                </span>
              </button>

              {tool!.requires_image && missingImages.length > 0 && (
                <p className="font-mono text-[10px] text-[var(--danger)] text-center">
                  ⚠ Add required reference image before generating
                </p>
              )}
            </div>

            {/* CARD 1: Parametric Generation Inputs (Reused Components from Generate Page) */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  Generation Parameters
                </span>
                <button
                  type="button"
                  onClick={handleResetInputs}
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] transition hover:text-[var(--ink)]"
                  title="Reset inputs to defaults"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Prompt Composer (Reused Component) */}
              <div className="space-y-1.5">
                <PromptComposer
                  idPrefix="tool-prompt"
                  prompt={currentPositivePrompt}
                  onPromptChange={handlePromptChange}
                  negativePrompt={currentNegativePrompt}
                  onNegativePromptChange={handleNegativePromptChange}
                  positivePlaceholder="Describe the subject, composition, atmosphere, lighting, and rendering style…"
                  negativePlaceholder="Specify unwanted elements (e.g. blurry, noise, low quality, artifacts)…"
                  positiveRows={3}
                  negativeRows={2}
                  showAutoPrompt={false}
                />
              </div>

              {/* Reference Image Uploader (Dropzone Reused from Generate Page) */}
              {(tool!.requires_image || imageControls.length > 0) && (
                <div className="space-y-2 border-t border-[var(--line)] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                      Reference Starter Image {tool!.requires_image && <span className="text-[var(--danger)]">*</span>}
                    </span>
                    {firstImageFile && (
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--danger)] hover:underline transition"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  {!firstImageFile ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        const droppedFile = e.dataTransfer.files?.[0];
                        if (droppedFile) handleFileUpload(droppedFile);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`group relative flex h-40 flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center transition-all cursor-pointer ${
                        isDragOver
                          ? "border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]"
                          : "border-[var(--line-strong)] bg-[#0d0e0d] hover:border-[var(--accent)]/50"
                      }`}
                    >
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-[var(--accent)] mb-2 group-hover:scale-105 transition">
                        <UploadCloud className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-[var(--ink)]">
                        Drop starter frame or <span className="text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2">browse</span>
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
                        PNG, JPG, WEBP · MAX 25MB
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--line)] bg-[#0d0e0d] p-2 space-y-2">
                      <div className="relative rounded-lg overflow-hidden border border-white/5 bg-black/40 flex h-40 w-full items-center justify-center group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={inputImageUrl || ""}
                          alt="Reference Frame"
                          className="h-full w-full object-contain rounded-md"
                        />
                        {naturalDimensions && (
                          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/80 backdrop-blur-md px-1.5 py-0.5 font-mono text-[9px] text-white/90 border border-white/10">
                            {naturalDimensions.width} × {naturalDimensions.height} PX
                          </span>
                        )}
                      </div>

                      {/* Auto-Prompt Extraction Button */}
                      <button
                        type="button"
                        onClick={handleAutoPromptFromReference}
                        disabled={interrogating || busy}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[11px] font-bold text-[var(--accent)] transition disabled:opacity-50"
                      >
                        {interrogating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Tag className="h-3 w-3" />
                        )}
                        <span>{interrogateToast || "Extract Prompts & Metadata"}</span>
                      </button>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
              )}

              {/* Aspect Ratio Selector (Reused Component) */}
              <div className="space-y-1.5 border-t border-[var(--line)] pt-3">
                <AspectRatioSelector
                  value={ratio}
                  onChange={handleRatioChange}
                  options={
                    hasSizeControls
                      ? [
                          ...tool!.supported_aspect_ratios
                            .filter((item) => RATIOS.includes(item))
                            .map((item) => ({ value: item, label: item })),
                          { value: "custom", label: "Custom" },
                        ]
                      : tool!.supported_aspect_ratios
                          .filter((item) => RATIOS.includes(item))
                          .map((item) => ({ value: item, label: item }))
                  }
                  disabled={busy}
                  label="Aspect Ratio Format"
                />

                {hasSizeControls && ratio === "custom" && (
                  <div className="space-y-1.5 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="tool-custom-width"
                          className="text-[10px] uppercase font-semibold text-[var(--ink-faint)]"
                        >
                          Width
                        </label>
                        <input
                          id="tool-custom-width"
                          type="number"
                          min={64}
                          max={4096}
                          step={dimensionMultiple}
                          value={customWidth}
                          onChange={(e) =>
                            handleCustomDimensionChange("width", e.target.value)
                          }
                          disabled={busy}
                          aria-invalid={customWidthInvalid}
                          aria-describedby={
                            customWidthInvalid || customHeightInvalid
                              ? "tool-custom-dimension-validation"
                              : undefined
                          }
                          className={`${FIELD} mt-1 w-full rounded-xl px-2.5 py-1.5`}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="tool-custom-height"
                          className="text-[10px] uppercase font-semibold text-[var(--ink-faint)]"
                        >
                          Height
                        </label>
                        <input
                          id="tool-custom-height"
                          type="number"
                          min={64}
                          max={4096}
                          step={dimensionMultiple}
                          value={customHeight}
                          onChange={(e) =>
                            handleCustomDimensionChange("height", e.target.value)
                          }
                          disabled={busy}
                          aria-invalid={customHeightInvalid}
                          aria-describedby={
                            customWidthInvalid || customHeightInvalid
                              ? "tool-custom-dimension-validation"
                              : undefined
                          }
                          className={`${FIELD} mt-1 w-full rounded-xl px-2.5 py-1.5`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {naturalDimensions && (
                        <button
                          type="button"
                          onClick={handleMatchDimensions}
                          disabled={busy}
                          title="Set width and height to this image's dimensions"
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-1.5 text-[11px] font-medium text-[var(--ink)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-soft)] disabled:opacity-50 motion-reduce:transition-none"
                        >
                          <Maximize2 className="h-3 w-3 text-[var(--accent)]" />
                          <span>Match Size</span>
                        </button>
                      )}
                      <span
                        className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${
                          customWidthInvalid || customHeightInvalid
                            ? "text-[var(--danger)]"
                            : "text-[var(--ink-faint)]"
                        }`}
                        id="tool-custom-dimension-validation"
                      >
                        {customWidthInvalid || customHeightInvalid
                          ? `64–4096, ×${dimensionMultiple}`
                          : `${customWidth || "?"} × ${customHeight || "?"}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Seed Control (Reused SeedInput Component) */}
              <div className="space-y-1.5 border-t border-[var(--line)] pt-3">
                <SeedInput
                  value={seedControl ? (values[seedControl.id] as number) : -1}
                  onChange={(val) => {
                    if (seedControl) handleValueChange(seedControl.id, val);
                  }}
                  disabled={busy}
                  label="Noise Seed"
                />
              </div>

              {/* Essential Controls (CFG, Steps) */}
              {essentialControls.length > 0 && (
                <div className="space-y-3 border-t border-[var(--line)] pt-3">
                  {essentialControls.map((control, idx) => {
                    const meta = resolveControlMeta(control, idx, tool!.controls);
                    return (
                      <DynamicControl
                        key={control.id}
                        control={control}
                        value={values[control.id]}
                        busy={busy}
                        meta={meta}
                        onChange={(val) => handleValueChange(control.id, val)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Custom / Advanced Controls */}
              {customControls.length > 0 && (
                <div className="space-y-3 border-t border-[var(--line)] pt-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="font-mono text-[10px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                      Advanced Parameters
                    </span>
                    <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                      {customControls.length} options
                    </span>
                  </div>
                  {customControls.map((control, idx) => {
                    const meta = resolveControlMeta(control, idx, tool!.controls);
                    return (
                      <DynamicControl
                        key={control.id}
                        control={control}
                        value={values[control.id]}
                        busy={busy}
                        meta={meta}
                        onChange={(val) => handleValueChange(control.id, val)}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* CARD 2: Pipeline Architecture & Compatibility (Parity with Model Detail) */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--ink)] text-xs font-mono uppercase tracking-wider">
                  Pipeline Compatibility
                </h4>
                <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">
                  COMFYUI
                </span>
              </div>

              <div className="space-y-2 border-t border-[var(--line)] pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Engine</span>
                  <span className="font-mono text-[var(--ink)]">Local ComfyUI</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Workflow Mode</span>
                  <span className="rounded bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.2 font-mono text-[10px] font-bold border border-[var(--accent)]/30">
                    {MODE_LABELS[tool!.mode] ?? tool!.mode}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Output Format</span>
                  <span className="font-mono text-[var(--ink)] uppercase">
                    {tool!.output_kind === "video" ? "MP4 Video" : "PNG Image"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Exposed Inputs</span>
                  <span className="font-mono text-[var(--ink)] font-semibold">
                    {tool!.controls.length} Parameters
                  </span>
                </div>
              </div>

              <div className="border-t border-[var(--line)] pt-3">
                <Link
                  href={`/tools/canvas?from=${tool!.tool_id}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] py-2 font-mono text-xs text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Inspect in Node Canvas</span>
                </Link>
              </div>
            </div>

            {/* CARD 3: Project Permissions & License (Parity with Model Detail) */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--ink)] text-xs font-mono uppercase tracking-wider">
                  Tool Permissions
                </h4>
                <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">
                  LOCAL ONLY
                </span>
              </div>

              <div className="space-y-2 border-t border-[var(--line)] pt-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    <span className="text-[var(--ink-soft)]">Commercial Use</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                    Allowed
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    <span className="text-[var(--ink-soft)]">Offline Execution</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                    100% Private
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    <span className="text-[var(--ink-soft)]">Canvas Remixing</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                    Permitted
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <WorkspaceModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Workflow Tool"
        description="Are you sure you want to delete this tool? This action removes the parametric wrapper from your library."
        destructive
      >
        {deleteError && (
          <p className="mb-4 text-xs text-[var(--danger)]" role="alert">
            {deleteError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowDeleteModal(false)}
            disabled={deleting}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 font-mono text-xs text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--danger)] px-3.5 py-1.5 font-mono text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleting && <RefreshCw className="h-3 w-3 animate-spin" />}
            <span>Delete Tool</span>
          </button>
        </div>
      </WorkspaceModal>

      {/* Full-Screen Lightbox Modal for Output */}
      {result?.images.length ? (
        <WorkspaceModal
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          title={tool!.name}
          description={`Generated at ${ratioLabel} · ${result.images[0].filename || "output.png"}`}
          size="media"
        >
          <div className="flex flex-col items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.images[0].url}
              alt="Generated result lightbox"
              className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-4 flex items-center gap-3">
              <a
                href={result.images[0].url}
                download={result.images[0].filename || "output.png"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Asset</span>
              </a>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="rounded-lg border border-[var(--line)] px-4 py-2 font-mono text-xs text-[var(--ink)] hover:bg-[var(--surface-raised)] transition"
              >
                Close
              </button>
            </div>
          </div>
        </WorkspaceModal>
      ) : null}

      <WorkspaceFooter />
    </main>
  );
}
