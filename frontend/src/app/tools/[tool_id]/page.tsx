"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  ImagePlus,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import WorkspaceModal from "@/components/WorkspaceModal";
import CustomSelect from "@/components/CustomSelect";
import SeedInput from "@/components/SeedInput";
import AspectRatioSelector, { AspectRatioIcon } from "@/components/AspectRatioSelector";
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

const RATIOS: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];
const MODE_LABELS = {
  "text-to-image": "Text → Image",
  "image-to-image": "Image → Image",
  "text-to-video": "Text → Video",
  "image-to-video": "Image → Video",
} as const;

const FIELD =
  "workspace-field w-full px-3 py-2 text-xs font-mono outline-none rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Scalar = string | number | boolean;

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanNodeTitle(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  // Strip emojis like 🖼️, ⚡, 🎨
  s = s.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu, "").trim();

  // If string contains English and Chinese (e.g. "Text2Video Switch 文生视频开关"),
  // strip the redundant Chinese translation characters if English words exist
  if (/[a-zA-Z]/.test(s) && /[\u4e00-\u9fa5]/.test(s)) {
    s = s.replace(/[\u4e00-\u9fa5]+/g, "").trim();
  }

  // Remove redundant "(Prompt)" if title is just "CLIP Text Encode (Prompt)"
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

  // Check if it's a prompt control
  if (control.kind === "prompt") {
    const promptControls = allControls.filter((c) => c.kind === "prompt");
    const isMultiplePrompts = promptControls.length > 1;

    // Check if role or text indicates negative
    const valString = String(control.value || control.default || "").toLowerCase();
    const hasNegativeKeywords =
      valString.includes("noise") ||
      valString.includes("blur") ||
      valString.includes("ugly") ||
      valString.includes("deformed") ||
      valString.includes("watermark") ||
      valString.includes("bad") ||
      valString.includes("subtitles") ||
      valString.includes("bleep") ||
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
          "Specify unwanted elements to avoid (e.g. blurry, noise, watermark, low quality, artifacts)…",
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

  // Check if it's an image control
  if (control.kind === "image") {
    let title = cleaned;
    if (
      title.toLowerCase().startsWith("load image") ||
      title.toLowerCase().startsWith("loadimage")
    ) {
      title = title.replace(/^load\s*image\s*/i, "Input Image ").trim();
    }
    if (!title || title.toLowerCase() === "image") {
      title = "Reference Image";
    }
    return {
      displayTitle: title,
      badge: control.role ? control.role.toUpperCase() : "IMAGE",
      hint: "PNG, JPEG, or WebP · max 10 MB",
    };
  }

  // Check boolean
  if (control.kind === "boolean") {
    let title = cleaned;
    if (title.toLowerCase().startsWith("primitive")) {
      title = title.replace(/^primitive\s*/i, "").trim();
    }
    return {
      displayTitle: title || "Toggle Switch",
      badge: "OPTION",
    };
  }

  // Numerical or other controls
  let title = cleaned;
  if (title.toLowerCase().startsWith("primitive")) {
    title = title.replace(/^primitive\s*/i, "").trim();
  }
  return {
    displayTitle: title || control.input_name || "Parameter",
    badge: control.kind === "seed" ? "SEED" : control.kind === "number" ? "PARAM" : undefined,
  };
}

function ImagePreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url ? (
    <img src={url} alt={alt} className="asset-zoom-media h-full w-full object-cover" />
  ) : (
    <ImagePlus className="h-5 w-5 text-[var(--ink-faint)]" />
  );
}

function ImageControl({
  control,
  file,
  busy,
  required,
  meta,
  onFile,
}: {
  control: ToolControl;
  file?: File;
  busy: boolean;
  required: boolean;
  meta: DisambiguatedControlMeta;
  onFile: (file: File | undefined) => void;
}) {
  const id = `control-${control.id}`;
  const [fileError, setFileError] = useState<string | null>(null);

  const choose = (next: File | undefined) => {
    if (!next) return;
    if (!IMAGE_TYPES.includes(next.type)) {
      setFileError("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (next.size > MAX_IMAGE_BYTES) {
      setFileError("Image must be smaller than 10 MB.");
      return;
    }
    setFileError(null);
    onFile(next);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor={id}
            className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]"
          >
            {meta.displayTitle}
          </label>
          {meta.badge && (
            <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[var(--ink-faint)] tracking-wider">
              {meta.badge}
            </span>
          )}
        </div>
        {required && (
          <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider text-[var(--accent)] uppercase">
            Required
          </span>
        )}
      </div>
      <div
        className={`rounded-lg border bg-[var(--surface-sunken)] p-3 transition ${
          fileError
            ? "border-[var(--danger-line)]"
            : "border-dashed border-[var(--line-strong)] hover:border-[var(--accent)]"
        }`}
      >
        {file ? (
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-soft)]">
              <ImagePreview file={file} alt={meta.displayTitle} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--ink)]">{file.name}</p>
              <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
                {formatBytes(file.size)} · Ready
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFileError(null);
                onFile(undefined);
              }}
              aria-label={`Remove ${meta.displayTitle}`}
              className="rounded p-1.5 text-[var(--ink-soft)] transition hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor={id}
            className="flex cursor-pointer items-center gap-3 p-2 transition hover:bg-[var(--surface)] rounded-md"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
              <ImagePlus className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs font-semibold text-[var(--ink)]">
                Upload reference image
              </span>
              <span className="mt-0.5 block font-mono text-[10px] text-[var(--ink-faint)]">
                PNG, JPEG, or WebP · max 10 MB
              </span>
            </span>
          </label>
        )}
        <input
          id={id}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {fileError && (
        <p className="mt-1 text-[11px] text-[var(--danger)]" role="alert">
          {fileError}
        </p>
      )}
    </div>
  );
}

function DynamicControl({
  control,
  value,
  busy,
  required,
  file,
  meta,
  onChange,
  onFile,
}: {
  control: ToolControl;
  value: Scalar | undefined;
  busy: boolean;
  required: boolean;
  file?: File;
  meta: DisambiguatedControlMeta;
  onChange: (value: Scalar) => void;
  onFile: (file: File | undefined) => void;
}) {
  const id = `control-${control.id}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (value !== undefined) {
      navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const label = (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <label
          htmlFor={id}
          className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]"
        >
          {meta.displayTitle}
        </label>
        {meta.badge && (
          <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[var(--ink-faint)] tracking-wider">
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

  if (control.kind === "image") {
    return (
      <ImageControl
        control={control}
        file={file}
        busy={busy}
        required={required}
        meta={meta}
        onFile={onFile}
      />
    );
  }

  if (control.kind === "boolean") {
    const isChecked = Boolean(value ?? control.value);
    return (
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2.5 transition hover:border-[var(--line-strong)]"
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

  if (control.kind === "seed" || control.seed) {
    return (
      <SeedInput
        id={id}
        label={meta.displayTitle}
        showLabel={true}
        value={
          typeof value === "number" || typeof value === "string"
            ? value
            : typeof control.value === "number" || typeof control.value === "string"
              ? control.value
              : -1
        }
        onChange={(nextVal) => onChange(nextVal)}
        disabled={busy}
        size="sm"
      />
    );
  }

  const numeric = control.kind === "number";

  if (control.kind === "prompt" || control.kind === "text") {
    const textVal = String(value ?? control.value ?? "");
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor={id}
              className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]"
            >
              {meta.displayTitle}
            </label>
            {meta.badge && (
              <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[var(--ink-faint)] tracking-wider">
                {meta.badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {textVal && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 font-mono text-[9px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                title="Copy prompt"
              >
                {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
            <span className="font-mono text-[9px] text-[var(--ink-faint)]">
              {textVal.length} chars
            </span>
          </div>
        </div>
        <textarea
          id={id}
          value={textVal}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          rows={control.kind === "prompt" ? 4 : 3}
          placeholder={meta.placeholder ?? "Enter prompt text…"}
          className={`${FIELD} resize-y leading-relaxed text-xs`}
        />
      </div>
    );
  }

  // Numeric control with optional slider if min & max are provided
  if (numeric && control.minimum !== null && control.maximum !== null) {
    const minVal = control.minimum;
    const maxVal = control.maximum;
    const stepVal = control.step ?? (Number.isInteger(minVal) && Number.isInteger(maxVal) ? 1 : 0.1);
    const numVal = typeof value === "number" ? value : Number(control.value ?? minVal);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          {label}
          <span className="font-mono text-xs font-semibold tabular-nums text-[var(--accent)]">
            {numVal}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={minVal}
            max={maxVal}
            step={stepVal}
            value={numVal}
            disabled={busy}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)] cursor-pointer h-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)]"
          />
          <input
            id={id}
            type="number"
            value={numVal}
            min={minVal}
            max={maxVal}
            step={stepVal}
            disabled={busy}
            onChange={(e) => {
              const raw = e.target.value.trim();
              onChange(raw === "" ? minVal : Number(raw));
            }}
            className={`${FIELD} h-7 w-20 text-center tabular-nums font-mono text-xs`}
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
      {numeric && (control.minimum !== null || control.maximum !== null) && (
        <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
          {`Range ${control.minimum ?? "—"} to ${control.maximum ?? "—"}`}
          {control.step ? ` · step ${control.step}` : ""}
        </p>
      )}
    </div>
  );
}

export default function ToolDetailPage() {
  const params = useParams<{ tool_id: string }>();
  const router = useRouter();
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const [values, setValues] = useState<Record<string, Scalar>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [result, setResult] = useState<ToolRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveToGallery, setSaveToGallery] = useState(true);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedResultPrompt, setCopiedResultPrompt] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  // Execution elapsed stopwatch
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
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [busy]);

  const formattedElapsedTime = useMemo(() => {
    const totalSec = elapsedMs / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = (totalSec % 60).toFixed(1);
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }, [elapsedMs]);

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
        setFiles({});
        setResult(null);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load tool.",
        ),
      );
  }, [params.tool_id]);

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
    setValues(
      Object.fromEntries(
        tool.controls
          .filter((item) => item.kind !== "image")
          .map((item) => [item.id, item.value as Scalar]),
      ),
    );
    setFiles({});
    setRatio(tool.default_aspect_ratio);
  }, [tool, params.tool_id]);

  useEffect(() => {
    load();
    return () => socket.current?.close();
  }, [load]);

  const handleRatioChange = useCallback(
    (newRatio: ToolAspectRatio) => {
      setRatio(newRatio);
      if (tool) {
        const widthCtrl = tool.controls.find(
          (c) => c.role === "width" || c.input_name === "width",
        );
        const heightCtrl = tool.controls.find(
          (c) => c.role === "height" || c.input_name === "height",
        );
        const aspectMap: Record<ToolAspectRatio, [number, number]> = {
          "1:1": [1024, 1024],
          "16:9": [1280, 720],
          "9:16": [720, 1280],
          "4:3": [1152, 864],
          "21:9": [1536, 656],
        };
        const dims = aspectMap[newRatio];
        if (dims && (widthCtrl || heightCtrl)) {
          setValues((current) => {
            const next = { ...current };
            if (widthCtrl) next[widthCtrl.id] = dims[0];
            if (heightCtrl) next[heightCtrl.id] = dims[1];
            setStorageItem(STORAGE_KEYS.TOOL_VALUES(params.tool_id), next);
            return next;
          });
        }
      }
    },
    [tool, params.tool_id],
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

  const promptAndImageControls = useMemo(
    () => tool?.controls.filter((c) => c.kind === "prompt" || c.kind === "image") ?? [],
    [tool],
  );

  const essentialControls = useMemo(
    () =>
      tool?.controls.filter(
        (c) =>
          isEssential(c) &&
          c.kind !== "prompt" &&
          c.kind !== "image" &&
          c.input_name !== "width" &&
          c.input_name !== "height",
      ) ?? [],
    [tool, isEssential],
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

  const imageControls = useMemo(
    () => tool?.controls.filter((control) => control.kind === "image") ?? [],
    [tool],
  );
  const dimensionControls = useMemo(
    () =>
      tool?.controls.some(
        (control) =>
          control.input_name === "width" || control.input_name === "height",
      ) ?? false,
    [tool],
  );
  const missingImages = imageControls.filter((control) => !files[control.id]);
  const firstImageFile = useMemo(() => {
    const imgCtrl = imageControls.find((c) => files[c.id]);
    return imgCtrl ? files[imgCtrl.id] : undefined;
  }, [imageControls, files]);

  const [inputImageUrl, setInputImageUrl] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"comparison" | "result">("comparison");

  useEffect(() => {
    if (!firstImageFile) {
      setInputImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(firstImageFile);
    setInputImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [firstImageFile]);

  const canRun =
    Boolean(tool) &&
    !busy &&
    (!tool?.requires_image || missingImages.length === 0);

  const run = useCallback(async () => {
    if (!tool || !canRun) return;
    const clientId = uuid();
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress({ type: "queued" });
    const nextSocket = api.openProgressSocket(clientId, (event) =>
      setProgress(event),
    );
    socket.current = nextSocket;
    try {
      setResult(
        await api.runTool(tool.tool_id, "", ratio, undefined, values, files, {
          clientId,
          saveToGallery,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run tool.");
    } finally {
      nextSocket.close();
      socket.current = null;
      setBusy(false);
    }
  }, [tool, canRun, ratio, values, files, saveToGallery]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to run
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (canRun) {
          e.preventDefault();
          run();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRun, run]);

  // Telemetry step calculations
  const progressPercentage = useMemo(() => {
    if (!progress || progress.type !== "progress") return 0;
    const val = progress.value ?? 0;
    const max = progress.max ?? 1;
    return Math.min(100, Math.max(0, Math.round((val / max) * 100)));
  }, [progress]);

  if (!tool && !error) {
    return (
      <main
        id="main-content"
        className="workspace-scroll h-full min-h-0 bg-[var(--ground)] px-4 py-8 pb-28 md:px-8 md:pb-10"
        role="status"
        aria-busy="true"
        aria-label="Loading tool"
      >
        <div className="mx-auto max-w-7xl">
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-soft)]" />
          <div className="mt-6 h-10 w-1/3 animate-pulse rounded bg-[var(--surface-soft)]" />
          <div className="mt-8 grid gap-5 lg:grid-cols-[380px_1fr]">
            <div className="h-[34rem] animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)]" />
            <div className="h-[34rem] animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)]" />
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
        <div className="w-full max-w-md rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center">
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
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--ground)] lg:flex-row"
    >
      {/* LEFT INSPECTOR SIDEBAR */}
      <aside className="flex w-full shrink-0 flex-col border-b border-[var(--line)] bg-[var(--surface)] lg:w-[380px] lg:border-b-0 lg:border-r h-full min-h-0">
        {/* PINNED HEADER (Never scrolls away) */}
        <header className="shrink-0 border-b border-[var(--line)] px-5 py-4 bg-[var(--surface)]">
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center justify-between">
            <Link
              href="/tools"
              className="group inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors"
            >
              <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
              <span>All Workflows</span>
            </Link>
            <Can do="tool:delete" ownerId={tool?.user_id}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--danger)] transition-colors"
                title="Delete tool"
              >
                <Trash2 className="h-3 w-3" />
                <span>Delete</span>
              </button>
            </Can>
          </nav>

          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="rounded bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-[var(--accent)] uppercase">
              {MODE_LABELS[tool!.mode]}
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--ink-faint)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span>LOCAL ENGINE</span>
            </div>
          </div>

          <h1 className="font-sans text-xl font-bold tracking-tight text-[var(--ink)] truncate">
            {tool!.name}
          </h1>
          <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)] truncate">
            Configure pipeline parameters and execute locally.
          </p>
        </header>

        {/* SCROLLABLE FORM CONTROLS */}
        <div className="workspace-scroll flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink-soft)]">
              Generation Parameters
            </span>
            <button
              type="button"
              onClick={handleResetInputs}
              className="inline-flex items-center gap-1 font-mono text-[9px] text-[var(--ink-faint)] transition hover:text-[var(--ink)]"
              title="Reset inputs to defaults"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* 1. Primary Inputs (Prompts & Images) */}
          {promptAndImageControls.length > 0 && (
            <div className="space-y-3.5">
              {promptAndImageControls.map((control, idx) => {
                const meta = resolveControlMeta(control, idx, tool!.controls);
                return (
                  <DynamicControl
                    key={control.id}
                    control={control}
                    value={values[control.id]}
                    busy={busy}
                    required={control.kind === "image" && tool!.requires_image}
                    file={files[control.id]}
                    meta={meta}
                    onChange={(val) => handleValueChange(control.id, val)}
                    onFile={(file) =>
                      setFiles((current) => {
                        const next = { ...current };
                        if (file) next[control.id] = file;
                        else delete next[control.id];
                        return next;
                      })
                    }
                  />
                );
              })}
            </div>
          )}

          {/* 2. Generation Essentials Container */}
          <div className="rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 p-3.5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
              <span className="font-mono text-[9px] font-bold text-[var(--accent)] flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="h-3 w-3" />
                <span>Generation Essentials</span>
              </span>
              <span className="font-mono text-[8px] text-[var(--ink-faint)]">
                RATIO · SEED · GUIDANCE
              </span>
            </div>

            {/* Aspect Ratio Selector (Universal Format Controller) */}
            <div>
              <AspectRatioSelector
                value={ratio}
                onChange={handleRatioChange}
                options={tool!.supported_aspect_ratios.filter((item) => RATIOS.includes(item))}
                disabled={busy}
                label="Aspect Ratio Format"
              />
            </div>

            {/* Seed, CFG, Steps & Other Essential Controls */}
            {essentialControls.length > 0 && (
              <div className="space-y-3 pt-1 border-t border-[var(--line)]/50">
                {essentialControls.map((control, idx) => {
                  const meta = resolveControlMeta(control, idx, tool!.controls);
                  return (
                    <DynamicControl
                      key={control.id}
                      control={control}
                      value={values[control.id]}
                      busy={busy}
                      required={false}
                      meta={meta}
                      onChange={(val) => handleValueChange(control.id, val)}
                      onFile={() => {}}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Custom / Advanced Workflow Controls */}
          {customControls.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-1.5">
                <span className="font-mono text-[9px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                  Custom Parameters
                </span>
                <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                  {customControls.length} options
                </span>
              </div>
              <div className="space-y-3">
                {customControls.map((control, idx) => {
                  const meta = resolveControlMeta(control, idx, tool!.controls);
                  return (
                    <DynamicControl
                      key={control.id}
                      control={control}
                      value={values[control.id]}
                      busy={busy}
                      required={false}
                      meta={meta}
                      onChange={(val) => handleValueChange(control.id, val)}
                      onFile={() => {}}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {!tool!.controls.length && (
            <p className="font-mono text-xs text-[var(--ink-faint)]">No editable controls detected.</p>
          )}
        </div>

        {/* PINNED FOOTER CTA */}
        <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-4">
          {tool!.requires_image && missingImages.length > 0 && (
            <p id="required-images-note" className="mb-2.5 font-mono text-[10px] leading-4 text-[var(--danger)]">
              ⚠ Add required reference image before generating.
            </p>
          )}
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            aria-busy={busy}
            aria-describedby={
              tool!.requires_image && missingImages.length > 0
                ? "required-images-note"
                : undefined
            }
            className="flex w-full items-center justify-between rounded-lg bg-[var(--accent)] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              {busy ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5 fill-current" />
              )}
              <span>{busy ? "Generating Output…" : "Generate Output"}</span>
            </span>
            <span className="font-mono text-[9px] opacity-80 flex items-center gap-1">
              <span>⌘↵</span>
              <span>·</span>
              <span>LOCAL</span>
            </span>
          </button>
        </footer>
      </aside>

      {/* RIGHT CANVAS VIEWPORT */}
      <section className="relative flex flex-1 min-w-0 min-h-0 flex-col h-full bg-[var(--ground)]" aria-labelledby="output-heading">
        {/* CANVAS HEADER */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--ground)] px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider">
              {busy ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]"></span>
                </span>
              ) : (
                <span className={`h-2 w-2 rounded-full ${result?.images.length ? "bg-emerald-400" : "bg-[var(--accent)]"}`} />
              )}
              <span className={busy ? "text-[var(--accent)]" : "text-[var(--ink-soft)]"}>
                {busy
                  ? progress?.type === "progress"
                    ? `Rendering Step ${progress.value ?? 0}/${progress.max ?? 20}`
                    : "Executing Graph"
                  : result?.images.length
                    ? "Output Complete"
                    : "Canvas Ready"}
              </span>
            </div>
            <span className="text-[var(--line-strong)]">/</span>
            <span className="font-mono text-[10px] text-[var(--ink-faint)] truncate max-w-[200px]">
              {tool!.name}
            </span>
          </div>

          {result?.images.length && inputImageUrl ? (
            <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-1">
              <button
                type="button"
                onClick={() => setPreviewTab("comparison")}
                className={`rounded-md px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
                  previewTab === "comparison"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
              >
                Comparison Slider
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("result")}
                className={`rounded-md px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
                  previewTab === "result"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
              >
                Result Only
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <div className="font-mono text-[10px] font-bold tracking-wider text-[var(--ink-faint)] uppercase">
              {String(result?.images.length ?? 0).padStart(2, "0")} OUTPUTS
            </div>
          </div>
        </header>

        {/* CANVAS WORKSPACE VIEWPORT */}
        <div className="workspace-scroll flex-1 min-h-0 overflow-y-auto p-6 flex items-center justify-center">
          {busy ? (
            /* LIVE EXECUTION TELEMETRY HUD */
            <div className="w-full max-w-md rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent)]"></span>
                  </span>
                  <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase">
                    {progress?.type === "progress"
                      ? "Inference Active"
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
                <h3 className="text-xl font-bold tracking-tight text-[var(--ink)]">
                  {progress?.type === "progress"
                    ? `Sampling Latents (${progress.value ?? 0}/${progress.max ?? 20})`
                    : progress?.type === "executing"
                      ? `Executing Node: ${progress.node ?? "Pipeline"}`
                      : "Synthesizing Pipeline Parameters…"}
                </h3>
                <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
                  {progress?.message || "Running through local ComfyUI graph"}
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
                  <span>ENGINE: COMFYUI LOCAL</span>
                </div>
                <div className="text-right">
                  <span>FORMAT: {ratio}</span>
                </div>
              </div>
            </div>
          ) : result?.images.length ? (
            /* COMPLETED RESULT VIEW */
            <div className="flex w-full max-w-5xl flex-col gap-3">
              <h2 id="output-heading" className="sr-only">Generated output</h2>

              {inputImageUrl && previewTab === "comparison" ? (
                <BeforeAfterSlider
                  beforeUrl={inputImageUrl}
                  afterUrl={result.images[0].url}
                  beforeLabel="Original Input"
                  afterLabel="Processed Output"
                  aspectRatio="16/9"
                />
              ) : (
                <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.images[0].url}
                    alt={`Generated result from ${tool!.name}`}
                    className="asset-zoom-media h-full w-full object-contain"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-[var(--ink-soft)]">
                    {result.images[0].filename || "output.png"}
                  </span>
                  <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
                    PNG · {ratio}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={result.images[0].url}
                    download={result.images[0].filename || "tool_output.png"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] active:scale-[.97]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </a>
                  <a
                    href={result.images[0].url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)] active:scale-[.97]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open original</span>
                  </a>
                </div>
              </div>
            </div>
          ) : error ? (
            /* ERROR STATE */
            <div className="w-full max-w-md rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center" role="alert">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-[var(--danger)]" aria-hidden="true" />
              <h2 id="output-heading" className="text-base font-bold text-[var(--ink)]">Generation Encountered an Error</h2>
              <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>
              <button
                type="button"
                onClick={run}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[var(--danger-line)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--danger-surface)]"
              >
                <RefreshCw className="h-3 w-3" /> Retry Generation
              </button>
            </div>
          ) : (
            /* BLANK CANVAS EMPTY STATE */
            <div className="flex aspect-video w-full max-w-[800px] flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-sunken)] shadow-inner">
                <Sparkles className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] mb-3">
                WORKSPACE / READY
              </p>
              <h2 id="output-heading" className="text-center text-4xl font-bold leading-tight tracking-tighter text-[var(--ink)] sm:text-5xl">
                Give the model<br className="hidden sm:block" /> something to see.
              </h2>
              <p className="mt-4 max-w-[44ch] text-center text-xs leading-relaxed text-[var(--ink-faint)]">
                Adjust prompt conditioning on the left sidebar. Press <kbd className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1 py-0.5 font-mono text-[10px] text-[var(--accent)]">⌘ Enter</kbd> to launch local execution.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 font-mono text-[9px] text-[var(--ink-faint)]">
                <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1">
                  ⚡ Uses local ComfyUI pipeline
                </span>
                <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1">
                  🖼️ Auto-saved to library
                </span>
                <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1">
                  ⏱️ Real-time step telemetry
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* DELETION CONFIRMATION MODAL */}
      {tool && (
        <WorkspaceModal
          open={showDeleteModal}
          onClose={() => {
            if (!deleting) {
              setShowDeleteModal(false);
              setDeleteError(null);
            }
          }}
          destructive
          title="Delete tool permanently?"
          description={`"${tool.name}" and all associated thumbnails and outputs will be deleted from disk. This action cannot be undone.`}
          eyebrow="Confirm Deletion"
        >
          <div className="space-y-4">
            {deleteError && (
              <p className="text-xs font-semibold text-[var(--danger)]" role="alert">
                {deleteError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="workspace-action-secondary px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--danger)]/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete tool"}
              </button>
            </div>
          </div>
        </WorkspaceModal>
      )}
    </main>
  );
}
