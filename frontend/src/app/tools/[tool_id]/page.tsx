"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ImagePlus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import WorkspaceModal from "@/components/WorkspaceModal";
import {
  api,
  uuid,
  type ProgressEvent,
  type ToolAspectRatio,
  type ToolControl,
  type ToolDetail,
  type ToolRunResult,
} from "@/lib/api";

const RATIOS: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];
const MODE_LABELS = {
  "text-to-image": "Text → Image",
  "image-to-image": "Image → Image",
  "text-to-video": "Text → Video",
  "image-to-video": "Image → Video",
} as const;
const FIELD =
  "workspace-field w-full px-3.5 py-3 text-sm outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-50";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Scalar = string | number | boolean;

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImagePreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url ? (
    <img src={url} alt={alt} className="h-full w-full object-cover" />
  ) : (
    <ImagePlus className="h-5 w-5 text-[var(--ink-faint)]" />
  );
}

function SectionHeading({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-end justify-between border-b border-[var(--line)] pb-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-[var(--ink)]">
          {title}
        </h2>
      </div>
      {count !== undefined && (
        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
          {String(count).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

function ImageControl({
  control,
  file,
  busy,
  required,
  onFile,
}: {
  control: ToolControl;
  file?: File;
  busy: boolean;
  required: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const id = `control-${control.id}`;
  const [fileError, setFileError] = useState<string | null>(null);
  const display = control.meta_title ?? control.label;

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
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]"
        >
          {display}
        </label>
        {required && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Required
          </span>
        )}
      </div>
      <div
        className={`border bg-[var(--surface-sunken)] p-3 transition ${fileError ? "border-[var(--danger-line)]" : "border-dashed border-[var(--line-strong)] hover:border-[var(--accent)]"}`}
      >
        {file ? (
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden border border-[var(--line)] bg-[var(--surface-soft)]">
              <ImagePreview file={file} alt={control.label} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--ink)]">{file.name}</p>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">
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
              aria-label={`Remove ${display}`}
              className="p-2 text-[var(--ink-soft)] transition hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor={id}
            className="flex cursor-pointer items-center gap-3 p-2 transition hover:bg-[var(--surface-soft)]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">
                Add reference image
              </span>
              <span className="mt-1 block text-xs text-[var(--ink-faint)]">
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
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
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
  onChange,
  onFile,
}: {
  control: ToolControl;
  value: Scalar | undefined;
  busy: boolean;
  required: boolean;
  file?: File;
  onChange: (value: Scalar) => void;
  onFile: (file: File | undefined) => void;
}) {
  const id = `control-${control.id}`;
  const display = control.meta_title ?? control.label;
  const label = (
    <label
      htmlFor={id}
      className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]"
    >
      {display}
    </label>
  );

  if (control.kind === "image") {
    return (
      <ImageControl
        control={control}
        file={file}
        busy={busy}
        required={required}
        onFile={onFile}
      />
    );
  }

  if (control.kind === "boolean") {
    return (
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-3.5 text-sm text-[var(--ink)] transition hover:border-[var(--line-strong)]"
      >
        <span>{display}</span>
        <span className="relative inline-flex h-6 w-10 shrink-0 items-center bg-[var(--line-strong)] transition has-[:checked]:bg-[var(--accent)]">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value ?? control.value)}
            disabled={busy}
            onChange={(event) => onChange(event.target.checked)}
            className="peer sr-only"
          />
          <span className="ml-1 h-4 w-4 bg-[var(--ink-soft)] transition peer-checked:translate-x-4 peer-checked:bg-[var(--accent-ink)]" />
        </span>
      </label>
    );
  }

  if (control.kind === "select") {
    return (
      <div>
        {label}
        <div className="relative">
          <select
            id={id}
            value={String(value ?? control.value ?? "")}
            disabled={busy}
            onChange={(event) => onChange(event.target.value)}
            className={`${FIELD} appearance-none pr-10`}
          >
            {control.options.map((option) => (
              <option key={String(option)} value={String(option)}>
                {String(option)}
              </option>
            ))}
          </select>
          <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[var(--ink-faint)]" />
        </div>
      </div>
    );
  }

  const numeric = control.kind === "number" || control.kind === "seed";
  return (
    <div>
      {label}
      {control.kind === "prompt" || control.kind === "text" ? (
        <textarea
          id={id}
          value={String(value ?? control.value ?? "")}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          rows={6}
          placeholder={
            control.kind === "prompt"
              ? "Describe the result you want…"
              : undefined
          }
          className={`${FIELD} resize-y leading-relaxed`}
        />
      ) : (
        <div className="relative">
          <input
            id={id}
            type={
              control.kind === "seed" ? "text" : numeric ? "number" : "text"
            }
            inputMode={control.kind === "seed" ? "numeric" : undefined}
            value={
              control.kind === "seed" && value === -1
                ? "Random"
                : String(value ?? control.value ?? "")
            }
            disabled={busy}
            min={control.kind === "seed" ? -1 : (control.minimum ?? undefined)}
            max={control.maximum ?? undefined}
            step={control.step ?? undefined}
            placeholder={control.kind === "seed" ? "Random" : undefined}
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (control.kind === "seed" && raw.toLowerCase() === "random") {
                onChange(-1);
              } else if (numeric) {
                onChange(raw === "" ? "" : Number(raw));
              } else {
                onChange(event.target.value);
              }
            }}
            className={`${FIELD} ${numeric ? "font-mono tabular-nums" : ""}`}
          />
          {control.kind === "seed" && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              -1 = Random
            </span>
          )}
        </div>
      )}
      {numeric && (control.minimum !== null || control.maximum !== null) && (
        <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
          {control.kind === "seed"
            ? "Enter -1 for a random seed"
            : `Range ${control.minimum ?? "—"} to ${control.maximum ?? "—"}`}
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
  const socket = useRef<WebSocket | null>(null);

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
        setValues(
          Object.fromEntries(
            nextTool.controls
              .filter((item) => item.kind !== "image")
              .map((item) => [item.id, item.value as Scalar]),
          ),
        );
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
  const editableCount = tool?.controls.length ?? 0;

  const run = async () => {
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
  };

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
          <div className="h-4 w-24 animate-pulse bg-[var(--surface-soft)]" />
          <div className="mt-6 h-12 w-2/3 animate-pulse bg-[var(--surface-soft)]" />
          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(20rem,27rem)_1fr]">
            <div className="h-[34rem] animate-pulse border border-[var(--line)] bg-[var(--surface)]" />
            <div className="h-[34rem] animate-pulse border border-[var(--line)] bg-[var(--surface)]" />
          </div>
        </div>
      </main>
    );
  }

  if (error && !tool) {
    return (
      <main
        id="main-content"
        className="workspace-scroll h-full min-h-0 bg-[var(--ground)] px-4 py-8 pb-28 md:px-8 md:pb-10"
      >
        <div className="mx-auto max-w-3xl">
          <Link
            href="/tools"
            className="mb-8 inline-flex items-center gap-2 text-xs text-[var(--ink-soft)] transition hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-4 w-4" /> All tools
          </Link>
          <div
            role="alert"
            className="border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6"
          >
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-[var(--danger)]" />
              <p className="text-sm leading-6 text-[var(--danger)]">{error}</p>
            </div>
            <button
              type="button"
              onClick={load}
              className="mt-5 inline-flex items-center gap-2 border border-[var(--danger-line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--danger-surface)]"
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
      className="workspace-scroll flex h-full min-h-0 w-full flex-col overflow-x-hidden bg-[var(--ground)] lg:flex-row lg:overflow-hidden"
    >
      <aside className="workspace-bezel workspace-scroll flex w-full shrink-0 flex-col border-b border-r-0 p-0 lg:w-[350px] lg:border-b-0 lg:border-r">
        <header className="border-b border-[var(--line)] px-5 py-5 sm:px-6 sm:py-6">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center justify-between">
            <Link
              href="/tools"
              className="workspace-action-quiet gap-2 px-0 py-1 text-xs"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to tools
            </Link>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--ink-soft)] transition hover:text-[var(--danger)]"
              title="Delete tool"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </button>
          </nav>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="workspace-kicker truncate">{MODE_LABELS[tool!.mode]}</p>
            <span className="shrink-0 border border-[var(--line-strong)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--ink-faint)]">LOCAL</span>
          </div>
          <h1 className="workspace-heading text-[1.75rem]">{tool!.name}</h1>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-faint)]">Configure inputs, then generate in this local workspace.</p>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => { event.preventDefault(); run(); }}
          aria-busy={busy}
        >
          <fieldset className="flex-1 space-y-7 px-5 py-6 sm:px-6">
            <legend className="workspace-kicker mb-5">Generation controls</legend>
            {tool!.controls.length ? (
              tool!.controls.map((control) => (
                <DynamicControl
                  key={control.id}
                  control={control}
                  value={values[control.id]}
                  busy={busy}
                  required={control.kind === "image" && tool!.requires_image}
                  file={files[control.id]}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [control.id]: value }))
                  }
                  onFile={(file) =>
                    setFiles((current) => {
                      const next = { ...current };
                      if (file) next[control.id] = file;
                      else delete next[control.id];
                      return next;
                    })
                  }
                />
              ))
            ) : (
              <p className="text-sm text-[var(--ink-faint)]">No editable controls.</p>
            )}

            {!dimensionControls && (
              <fieldset>
                <legend className="mb-2 block text-[11px] font-medium text-[var(--ink-faint)]">Format</legend>
                <div className="grid grid-cols-5 gap-1.5">
                  {tool!.supported_aspect_ratios
                    .filter((item) => RATIOS.includes(item))
                    .map((item) => (
                      <button
                        key={item}
                        type="button"
                        disabled={busy}
                        aria-pressed={ratio === item}
                        onClick={() => setRatio(item)}
                        className={`border px-1 py-2 text-[10px] font-medium transition duration-200 disabled:opacity-40 ${
                          ratio === item
                            ? "border-[var(--accent)] text-[var(--accent)]"
                            : "border-[var(--line-strong)] text-[var(--ink-faint)] hover:border-[var(--accent)]"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                </div>
              </fieldset>
            )}
          </fieldset>

          <div className="border-t border-[var(--line)] p-5">
            {tool!.requires_image && missingImages.length > 0 && (
              <p id="required-images-note" className="mb-3 text-xs leading-5 text-[var(--danger)]">
                Add all required reference images before generating.
              </p>
            )}
            <button
              type="submit"
              disabled={!canRun}
              aria-busy={busy}
              aria-describedby={tool!.requires_image && missingImages.length > 0 ? "required-images-note" : undefined}
              className="workspace-action-primary flex w-full items-center justify-center px-4 py-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate image"}
            </button>
          </div>
        </form>
      </aside>

      <section className="relative z-0 flex min-h-[28rem] flex-1 flex-col lg:min-h-0" aria-labelledby="output-heading">
        <header className="flex h-[3.5rem] shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--ground)] px-4 sm:px-6">
          <div className="flex items-center gap-2 text-[10px] font-medium text-[var(--ink-faint)]">
            <span className="h-1.5 w-1.5 bg-[var(--ink-faint)]" aria-hidden="true" /> Canvas
          </div>
          {result?.images.length && inputImageUrl ? (
            <div className="flex items-center gap-1 border border-[var(--line)] bg-[var(--surface)] p-0.5">
              <button
                type="button"
                onClick={() => setPreviewTab("comparison")}
                className={`px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
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
                className={`px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
                  previewTab === "result"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
              >
                Result only
              </button>
            </div>
          ) : null}
          <div className="text-[10px] font-medium tracking-wide text-[var(--ink-faint)]">
            {String(result?.images.length ?? 0).padStart(2, "0")} OUTPUTS
          </div>
        </header>

        <div className="workspace-scroll flex flex-1 items-center justify-center overflow-y-auto bg-[var(--ground)] p-4 sm:p-8">
          {busy ? (
            <div className="flex flex-col items-center text-center" role="status" aria-live="polite" aria-atomic="true">
              <RefreshCw className="mb-4 h-8 w-8 animate-spin text-[var(--accent)]" aria-hidden="true" />
              <p className="workspace-kicker mb-2">{progress?.type === "progress" ? "Rendering" : progress?.type === "executing" ? "Executing" : "Queued"}</p>
              <h2 id="output-heading" className="mt-2 text-3xl font-medium tracking-tight text-[var(--ink)]">Building output…</h2>
            </div>
          ) : result?.images.length ? (
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
                <div className="aspect-[16/9] w-full border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.images[0].url} alt={`Generated result from ${tool!.name}`} className="h-full w-full object-contain" />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                  {result.images[0].filename || "output.png"}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={result.images[0].url}
                    download={result.images[0].filename || "tool_output.png"}
                    className="inline-flex items-center gap-1.5 border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] active:scale-[.97]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </a>
                  <a
                    href={result.images[0].url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)] active:scale-[.97]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open original</span>
                  </a>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="text-center text-[var(--danger)]" role="alert">
              <AlertCircle className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
              <h2 id="output-heading" className="sr-only">Generation error</h2>
              <p>{error}</p>
            </div>
          ) : (
            <div className="flex aspect-video w-full max-w-[900px] flex-col items-center justify-center border border-[var(--line)] bg-[var(--surface)] px-5">
              <div className="mb-6 flex h-[60px] w-[60px] items-center justify-center border border-[var(--line-strong)]">
                <ImagePlus className="h-[22px] w-[22px] text-[var(--ink-faint)]" aria-hidden="true" />
              </div>
              <p className="workspace-kicker mb-5">Blank canvas</p>
              <h2 id="output-heading" className="text-center text-4xl font-medium leading-[1.05] tracking-tighter text-[var(--ink)] sm:text-6xl lg:text-7xl">
                Give the model<br className="hidden sm:block" /> something to see.
              </h2>
              <p className="mt-6 max-w-[42ch] text-center text-[13px] leading-relaxed text-[var(--ink-faint)]">
                Write a specific prompt. Choose a format. The first result lands here and stays in your library.
              </p>
            </div>
          )}
        </div>
      </section>

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
