"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { VideoResultPreview } from "@/components/VideoResultPreview";
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

function SectionHeading({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return (
    <div className="flex items-end justify-between border-b border-[var(--line)] pb-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-[var(--ink)]">{title}</h2>
      </div>
      {count !== undefined && <span className="font-mono text-[10px] text-[var(--ink-faint)]">{String(count).padStart(2, "0")}</span>}
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
        <label htmlFor={id} className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
          {display}
        </label>
        {required && <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Required</span>}
      </div>
      <div className={`rounded-2xl border bg-[var(--surface-sunken)] p-3 transition ${fileError ? "border-[var(--danger-line)]" : "border-dashed border-[var(--line-strong)] hover:border-[var(--accent)]"}`}>
        {file ? (
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-soft)]">
              <ImagePreview file={file} alt={control.label} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--ink)]">{file.name}</p>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">{formatBytes(file.size)} · Ready</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setFileError(null); onFile(undefined); }}
              aria-label={`Remove ${display}`}
              className="rounded-lg p-2 text-[var(--ink-soft)] transition hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--surface-soft)]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-[var(--accent)]"><ImagePlus className="h-5 w-5" /></span>
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">Add reference image</span>
              <span className="mt-1 block text-xs text-[var(--ink-faint)]">PNG, JPEG, or WebP · max 10 MB</span>
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
      {fileError && <p className="mt-2 text-xs text-[var(--danger)]" role="alert">{fileError}</p>}
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
    <label htmlFor={id} className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
      {display}
    </label>
  );

  if (control.kind === "image") {
    return <ImageControl control={control} file={file} busy={busy} required={required} onFile={onFile} />;
  }

  if (control.kind === "boolean") {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-3.5 text-sm text-[var(--ink)] transition hover:border-[var(--line-strong)]">
        <span>{display}</span>
        <span className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-[var(--line-strong)] transition has-[:checked]:bg-[var(--accent)]">
          <input id={id} type="checkbox" checked={Boolean(value ?? control.value)} disabled={busy} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
          <span className="ml-1 h-4 w-4 rounded-full bg-[var(--ink-soft)] transition peer-checked:translate-x-4 peer-checked:bg-[var(--accent-ink)]" />
        </span>
      </label>
    );
  }

  if (control.kind === "select") {
    return (
      <div>
        {label}
        <div className="relative">
          <select id={id} value={String(value ?? control.value ?? "")} disabled={busy} onChange={(event) => onChange(event.target.value)} className={`${FIELD} appearance-none pr-10`}>
            {control.options.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
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
        <textarea id={id} value={String(value ?? control.value ?? "")} disabled={busy} onChange={(event) => onChange(event.target.value)} rows={6} placeholder={control.kind === "prompt" ? "Describe the result you want…" : undefined} className={`${FIELD} resize-y leading-relaxed`} />
      ) : (
        <div className="relative">
          <input
            id={id}
            type={control.kind === "seed" ? "text" : numeric ? "number" : "text"}
            inputMode={control.kind === "seed" ? "numeric" : undefined}
            value={control.kind === "seed" && value === -1 ? "Random" : String(value ?? control.value ?? "")}
            disabled={busy}
            min={control.kind === "seed" ? -1 : control.minimum ?? undefined}
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
          {control.kind === "seed" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">-1 = Random</span>}
        </div>
      )}
      {numeric && (control.minimum !== null || control.maximum !== null) && <p className="mt-2 text-[11px] text-[var(--ink-faint)]">{control.kind === "seed" ? "Enter -1 for a random seed" : `Range ${control.minimum ?? "—"} to ${control.maximum ?? "—"}`}{control.step ? ` · step ${control.step}` : ""}</p>}
    </div>
  );
}

export default function ToolDetailPage() {
  const params = useParams<{ tool_id: string }>();
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const [values, setValues] = useState<Record<string, Scalar>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [result, setResult] = useState<ToolRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveToGallery, setSaveToGallery] = useState(true);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const socket = useRef<WebSocket | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.getTool(params.tool_id).then((nextTool) => {
      setTool(nextTool);
      setRatio(nextTool.default_aspect_ratio);
      setValues(Object.fromEntries(nextTool.controls.filter((item) => item.kind !== "image").map((item) => [item.id, item.value as Scalar])));
      setFiles({});
      setResult(null);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load tool."));
  }, [params.tool_id]);

  useEffect(() => {
    load();
    return () => socket.current?.close();
  }, [load]);

  const imageControls = useMemo(() => tool?.controls.filter((control) => control.kind === "image") ?? [], [tool]);
  const dimensionControls = useMemo(() => tool?.controls.some((control) => control.input_name === "width" || control.input_name === "height") ?? false, [tool]);
  const missingImages = imageControls.filter((control) => !files[control.id]);
  const canRun = Boolean(tool) && !busy && (!tool?.requires_image || missingImages.length === 0);
  const editableCount = tool?.controls.length ?? 0;

  const run = async () => {
    if (!tool || !canRun) return;
    const clientId = uuid();
    setBusy(true); setError(null); setResult(null); setProgress({ type: "queued" });
    const nextSocket = api.openProgressSocket(clientId, (event) => setProgress(event));
    socket.current = nextSocket;
    try { setResult(await api.runTool(tool.tool_id, "", ratio, undefined, values, files, { clientId, saveToGallery })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not run tool."); }
    finally { nextSocket.close(); socket.current = null; setBusy(false); }
  };

  if (!tool && !error) {
    return (
      <main id="main-content" className="workspace-scroll h-full px-4 py-8 md:px-8" role="status" aria-busy="true">
        <div className="mx-auto max-w-7xl">
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-soft)]" />
          <div className="mt-6 h-12 w-2/3 animate-pulse rounded bg-[var(--surface-soft)]" />
          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(20rem,27rem)_1fr]">
            <div className="h-[34rem] animate-pulse rounded-2xl bg-[var(--surface)]" />
            <div className="h-[34rem] animate-pulse rounded-2xl bg-[var(--surface)]" />
          </div>
        </div>
      </main>
    );
  }

  if (error && !tool) {
    return (
      <main id="main-content" className="workspace-scroll h-full px-4 py-8 md:px-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/tools" className="mb-8 inline-flex items-center gap-2 text-xs text-[var(--ink-soft)] transition hover:text-[var(--accent)]">
            <ArrowLeft className="h-4 w-4" /> All tools
          </Link>
          <div role="alert" className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-[var(--danger)]" />
              <p className="text-sm leading-6 text-[var(--danger)]">{error}</p>
            </div>
            <button
              type="button"
              onClick={load}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[var(--danger-line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--danger-surface)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="workspace-scroll h-full px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
      <div className="mx-auto max-w-7xl">
        <nav aria-label="Breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-[var(--ink-faint)]">
          <Link href="/tools" className="inline-flex items-center gap-2 transition hover:text-[var(--accent)]">
            <ArrowLeft className="h-3.5 w-3.5" /> AI Tool Studio
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-[var(--ink-soft)]">{tool!.name}</span>
        </nav>

        <header className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-[var(--line)] pb-7">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--line-strong)] bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                {MODE_LABELS[tool!.mode]}
              </span>
              <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                {tool!.output_kind}
              </span>
            </div>
            <h1 className="truncate text-4xl font-semibold tracking-[-0.06em] text-[var(--ink)] md:text-6xl">{tool!.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">A focused interface for the safe controls exposed by this workflow.</p>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-xs text-[var(--ink-faint)]">
            <span><strong className="font-mono text-[var(--ink)]">{editableCount}</strong> controls</span>
            <span className="h-1 w-1 rounded-full bg-[var(--line-strong)]" />
            <span>{tool!.requires_image ? "Image guided" : "Prompt guided"}</span>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(21rem,28rem)_minmax(0,1fr)]">
          <aside className="space-y-5 lg:sticky lg:top-5">
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 md:p-6">
              <SectionHeading eyebrow="01 / Configure" title="Inputs" count={editableCount} />
              <div className="mt-6 space-y-5">
                {tool!.controls.length ? (
                  tool!.controls.map((control) => (
                    <DynamicControl
                      key={control.id}
                      control={control}
                      value={values[control.id]}
                      busy={busy}
                      required={control.kind === "image" && tool!.requires_image}
                      file={files[control.id]}
                      onChange={(value) => setValues((current) => ({ ...current, [control.id]: value }))}
                      onFile={(file) => setFiles((current) => {
                        const next = { ...current };
                        if (file) next[control.id] = file;
                        else delete next[control.id];
                        return next;
                      })}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line-strong)] p-5 text-sm leading-6 text-[var(--ink-soft)]">
                    This tool has no editable public controls.
                  </div>
                )}
              </div>
            </section>

            {!dimensionControls && (
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 md:p-6">
                <SectionHeading eyebrow="02 / Output" title="Aspect ratio" />
                <fieldset className="mt-5">
                  <legend className="sr-only">Output aspect ratio</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {tool!.supported_aspect_ratios.filter((item) => RATIOS.includes(item)).map((item) => (
                      <button
                        key={item}
                        type="button"
                        disabled={busy}
                        aria-pressed={ratio === item}
                        onClick={() => setRatio(item)}
                        className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition disabled:opacity-40 ${ratio === item ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </section>
            )}

            <section className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/[.04] p-5 md:p-6">
              <div className="flex gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Ready to render?</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">Your workflow stays private. Only the controls above are sent with this run.</p>
                </div>
              </div>
              <label className="mt-5 flex cursor-pointer items-center gap-2 text-xs text-[var(--ink)]">
                <input type="checkbox" checked={saveToGallery} onChange={(event) => setSaveToGallery(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                Save completed output to Gallery
              </label>
              <button
                type="button"
                onClick={run}
                disabled={!canRun}
                aria-busy={busy}
                className="workspace-action-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? <><RefreshCw className="h-4 w-4 animate-spin" /> Rendering…</> : <><Play className="h-4 w-4 fill-current" /> Run tool</>}
              </button>
              {tool!.requires_image && missingImages.length > 0 && (
                <p className="mt-3 text-center text-xs text-[var(--accent)]" role="status">
                  Add {missingImages.length === 1 ? "the required image" : `${missingImages.length} required images`} to continue.
                </p>
              )}
            </section>
          </aside>

          <section className="min-h-[34rem] rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] p-5 md:min-h-[46rem] md:p-7" aria-live="polite">
            <div className="mb-7 flex items-center justify-between border-b border-[var(--line)] pb-4">
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${busy ? "animate-pulse bg-[var(--accent)]" : result?.status === "completed" ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">03 / Workspace</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{busy ? "Rendering workflow" : result ? "Latest result" : "Output preview"}</p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">{result ? `${result.elapsed_ms} MS` : "READY"}</span>
            </div>

            {error && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-4 text-sm leading-6 text-[var(--danger)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {busy && (
              <div className="min-h-[26rem] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8" role="status">
                <div className="shimmer h-2 w-full rounded-full" />
                <div className="mx-auto mt-16 max-w-md text-center">
                  <RefreshCw className="mx-auto mb-5 h-7 w-7 animate-spin text-[var(--accent)]" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                    {progress?.type === "progress" ? "Rendering" : progress?.type === "executing" ? "Executing" : "Queued"}
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Building your {tool!.output_kind}</h2>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    {progress?.node ? `Working on node ${progress.node}` : "The workflow is being rendered by ComfyUI."}
                  </p>
                  {progress?.type === "progress" && (progress.max ?? 0) > 0 && (
                    <div className="mt-6">
                      <div className="flex justify-between text-[10px] font-mono text-[var(--ink-faint)]">
                        <span>Step {progress.value ?? 0} / {progress.max ?? 0}</span>
                        <span>{Math.round(((progress.value ?? 0) / (progress.max ?? 1)) * 100)}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                          style={{ width: `${Math.min(100, ((progress.value ?? 0) / (progress.max ?? 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!busy && result?.images.length ? (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">Completed</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Fresh from the graph.</h2>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {result.images.map((asset) =>
                    asset.kind === "video" || tool!.output_kind === "video" ? (
                      <VideoResultPreview key={asset.url} url={asset.url} filename={asset.filename} ratio={result.aspect_ratio ?? ratio} />
                    ) : (
                      <a
                        key={asset.url}
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--accent)]"
                      >
                        <img src={asset.url} alt={asset.filename} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
                        <div className="flex items-center justify-between px-3 py-2 text-xs text-[var(--ink-faint)]">
                          <span className="truncate">{asset.filename}</span>
                          <span className="ml-3 text-[var(--accent)] font-semibold">Open ↗</span>
                        </div>
                      </a>
                    )
                  )}
                </div>
                <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
                    <SlidersHorizontal className="h-4 w-4 text-[var(--accent)]" /> Generation inspector
                  </div>
                  <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-[var(--ink-faint)]">Prompt ID</dt>
                      <dd className="mt-1 break-all font-mono text-[var(--ink)]">{result.prompt_id}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ink-faint)]">Aspect ratio</dt>
                      <dd className="mt-1 text-[var(--ink)]">{result.aspect_ratio ?? ratio}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ink-faint)]">Render time</dt>
                      <dd className="mt-1 text-[var(--ink)]">{(result.elapsed_ms / 1000).toFixed(1)} s</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ink-faint)]">Gallery</dt>
                      <dd className="mt-1 text-[var(--ink)]">{result.images[0]?.saved === false ? "Staged" : "Saved"}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-xs text-[var(--ink-faint)]">Upscale and extend actions appear when compatible video workflows are registered.</p>
                </div>
              </div>
            ) : null}

            {!busy && result && !result.images.length && (
              <div className="grid min-h-[26rem] place-items-center rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center">
                <div>
                  <AlertCircle className="mx-auto mb-4 h-7 w-7 text-[var(--danger)]" />
                  <h2 className="text-xl font-semibold text-[var(--ink)]">No output files</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--ink-soft)]">The run completed, but the workflow did not return an image file.</p>
                </div>
              </div>
            )}

            {!busy && !result && !error && (
              <div className="grid min-h-[26rem] place-items-center rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center">
                <div>
                  <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/[.04]">
                    <Sparkles className="h-7 w-7 text-[var(--accent)]" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">Blank canvas</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--ink)]">Make something<br />worth keeping.</h2>
                  <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[var(--ink-soft)]">Set your inputs, then run the tool. Your first result will appear here.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
