"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
  FileCode2,
  FileImage,
  FileJson,
  Film,
  HardDrive,
  ImageIcon,
  Info,
  Layers3,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  X,
  Zap,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import WorkspaceNavbar from "@/components/WorkspaceNavbar";
import { api, type ToolAspectRatio, type ToolMode } from "@/lib/api";

const modes: { value: ToolMode; label: string; description: string; isVideo?: boolean; requiresImage?: boolean }[] = [
  { value: "text-to-image", label: "Text → Image", description: "Prompt-driven latent generation" },
  { value: "image-to-image", label: "Image → Image", description: "Generation conditioned on reference image", requiresImage: true },
  { value: "text-to-video", label: "Text → Video", description: "Temporal motion synthesis from text prompt", isVideo: true },
  { value: "image-to-video", label: "Image → Video", description: "Video animation seeded by starter image", isVideo: true, requiresImage: true },
];

const ratios: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];

const inputClass =
  "workspace-field h-7.5 w-full px-2.5 text-[11px] font-mono outline-none bg-[var(--surface-sunken)] border border-[var(--line)] rounded-md text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors";
const labelClass =
  "mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase";

interface WorkflowMeta {
  nodeCount: number;
  hasPrompt: boolean;
  hasSampler: boolean;
  hasImageInput: boolean;
  topNodes: string[];
}

function SectionCardHeader({
  number,
  title,
  subtitle,
  icon: Icon,
  badge,
}: {
  number: string;
  title: string;
  subtitle?: string;
  icon: typeof Info;
  badge?: string | number;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)] shadow-sm">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] font-bold tracking-widest text-[var(--accent)] uppercase">
              {number}
            </span>
            <span className="font-mono text-[9px] text-[var(--line-strong)]">/</span>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-[var(--ink)] uppercase">
              {title}
            </h2>
            {badge !== undefined && (
              <span className="ml-1 rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.2 font-mono text-[8px] text-[var(--ink-faint)]">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="font-mono text-[9px] text-[var(--ink-faint)] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateToolPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbnailRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [workflowMeta, setWorkflowMeta] = useState<WorkflowMeta | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ToolMode>("text-to-image");
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumbnail);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  const parseWorkflow = async (targetFile: File) => {
    try {
      const text = await targetFile.text();
      const data = JSON.parse(text);
      if (typeof data === "object" && data !== null) {
        const nodes = Object.values(data) as Record<string, unknown>[];
        const classTypes = nodes
          .map((n) => (typeof n?.class_type === "string" ? n.class_type : ""))
          .filter(Boolean);

        const hasPrompt = classTypes.some((t) =>
          t.toLowerCase().includes("cliptextencode") || t.toLowerCase().includes("prompt"),
        );
        const hasSampler = classTypes.some((t) =>
          t.toLowerCase().includes("ksampler"),
        );
        const hasImageInput = classTypes.some((t) =>
          t.toLowerCase().includes("loadimage"),
        );

        const uniqueTop = Array.from(new Set(classTypes)).slice(0, 4);

        setWorkflowMeta({
          nodeCount: Object.keys(data).length,
          hasPrompt,
          hasSampler,
          hasImageInput,
          topNodes: uniqueTop,
        });

        // Automatically set mode to image-to-image if LoadImage node is present
        if (hasImageInput && mode === "text-to-image") {
          setMode("image-to-image");
        }
      }
    } catch {
      setWorkflowMeta(null);
    }
  };

  const processJsonFile = (next: File) => {
    if (!next.name.toLowerCase().endsWith(".json")) {
      setError("Choose a valid ComfyUI workflow_api.json file.");
      return;
    }
    setError(null);
    setFile(next);
    void parseWorkflow(next);
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (next) processJsonFile(next);
    event.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) processJsonFile(dropped);
  };

  const chooseThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next || !["image/png", "image/jpeg", "image/webp"].includes(next.type)) {
      setError("Thumbnail must be a PNG, JPEG, or WebP image.");
      return;
    }
    setError(null);
    setThumbnail(next);
    event.target.value = "";
  };

  const submit = async () => {
    if (!file) {
      setError("ComfyUI workflow JSON file is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tool = await api.createTool(
        file,
        name.trim() || "Untitled tool",
        mode,
        ratio,
        thumbnail ?? undefined,
      );
      router.push(`/tools/${tool.tool_id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create tool.");
      setBusy(false);
    }
  };

  const activeModeConfig = modes.find((m) => m.value === mode);
  const isVideo = activeModeConfig?.isVideo ?? false;

  return (
    <main id="main-content" className="workspace-scroll h-full min-h-0 bg-[var(--ground)]">
      {/* 1. Header & Actions Bar */}
      <WorkspaceNavbar
        subtitle="TOOL STUDIO // WORKFLOW BUILDER"
        href="/tools"
        maxWidth="max-w-[1240px]"
        badge={
          <div className="flex items-center gap-2">
            <Link
              href="/tools"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--line)] bg-[var(--surface-sunken)] font-mono text-[10px] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Back</span>
            </Link>
            <span className="font-mono text-[10px] text-[var(--line-strong)]">/</span>
            <span className="font-mono text-[9px] font-semibold text-[var(--ink-faint)] uppercase tracking-wider">
              NEW PIPELINE
            </span>
          </div>
        }
        statusText={file ? "JSON LOADED" : "AWAITING WORKFLOW"}
        statusVariant={file ? "accent" : "warning"}
        actions={
          <>
            <Link
              href="/tools"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[11px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition-colors"
            >
              Cancel
            </Link>

            <button
              type="button"
              onClick={submit}
              disabled={busy || !file}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)] disabled:opacity-40"
            >
              <Check className="h-3 w-3 stroke-[2.5]" />
              <span>{busy ? "Ingesting…" : "Create Tool ⚡"}</span>
            </button>
          </>
        }
      />

      {/* 2. Error Banner (if any) */}
      {error && (
        <div
          role="alert"
          className="border-b border-[var(--danger)]/30 bg-[var(--danger)]/10 px-5 py-2.5 font-mono text-xs text-[var(--danger)]"
        >
          {error}
        </div>
      )}

      {/* 3. Dual-Column Studio Geometry */}
      <div className="mx-auto max-w-[1240px] px-3.5 sm:px-4 py-3.5 pb-20">
        <div className="flex flex-col lg:flex-row items-start gap-4">
          {/* LEFT COLUMN: Main Ingestion Configuration Sections */}
          <div className="flex-1 w-full space-y-4">
            {/* Section 01: Workflow Definition */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-5">
              <SectionCardHeader
                number="01"
                title="WORKFLOW INGESTION"
                subtitle="Upload ComfyUI workflow_api.json to parse runnable graph nodes"
                icon={FileCode2}
                badge={file ? "VALIDATED" : "REQUIRED"}
              />

              {!file ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center cursor-pointer transition duration-200 ${
                    isDragging
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--line-strong)] bg-[var(--surface-sunken)] hover:border-[var(--accent)]"
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={choose}
                    className="sr-only"
                    aria-label="Upload workflow JSON"
                  />
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--accent)] mb-3">
                    <Upload className="h-5 w-5" />
                  </div>
                  <p className="font-mono text-xs font-semibold text-[var(--ink)]">
                    Drop ComfyUI <span className="text-[var(--accent)]">workflow_api.json</span> here
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
                    Or click to browse from filesystem (API-format graphs only)
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)]">
                        <FileJson className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-[var(--ink)]">
                          {file.name}
                        </p>
                        <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                          {(file.size / 1024).toFixed(1)} KB • {workflowMeta?.nodeCount ?? "—"} ComfyUI graph nodes
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setWorkflowMeta(null);
                      }}
                      className="p-1 text-[var(--ink-faint)] hover:text-[var(--danger)] transition-colors"
                      title="Remove workflow"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {workflowMeta && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-2">
                        <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] block">
                          Graph Nodes
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                          {workflowMeta.nodeCount} detected
                        </span>
                      </div>
                      <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-2">
                        <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] block">
                          Sampler Node
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                          {workflowMeta.hasSampler ? "KSampler ✓" : "Custom"}
                        </span>
                      </div>
                      <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-2">
                        <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] block">
                          Input Condition
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                          {workflowMeta.hasImageInput ? "Image Required" : "Prompt Only"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 02: Identity & Branding */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-5">
              <SectionCardHeader
                number="02"
                title="IDENTITY & BRANDING"
                subtitle="Catalog title and cover preview for the shelf"
                icon={Tag}
              />

              <div className="space-y-4">
                <div>
                  <label htmlFor="tool-name" className={labelClass}>
                    Pipeline Title
                  </label>
                  <input
                    id="tool-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    placeholder="e.g., Ultra Studio Portrait HDR"
                    className={inputClass}
                  />
                  <span className="mt-1 block font-mono text-[9px] text-[var(--ink-faint)]">
                    Descriptive display name shown in the workflow shelf and generation inspector.
                  </span>
                </div>

                <div>
                  <span className={labelClass}>
                    Cover Media Thumbnail <span className="font-normal text-[var(--ink-faint)]">(optional)</span>
                  </span>

                  {!thumbnailPreview ? (
                    <button
                      type="button"
                      onClick={() => thumbnailRef.current?.click()}
                      className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] p-3.5 text-left transition duration-200 hover:border-[var(--accent)]"
                    >
                      <input
                        ref={thumbnailRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={chooseThumbnail}
                        className="sr-only"
                        aria-label="Upload thumbnail"
                      />
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--accent)]">
                        <FileImage className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-[var(--ink)]">
                          Select cover thumbnail
                        </p>
                        <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                          PNG, WebP or JPEG • Replaces generic placeholder
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md border border-[var(--line)]">
                          <img
                            src={thumbnailPreview}
                            alt="Preview"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-semibold text-[var(--ink)]">
                            {thumbnail?.name}
                          </p>
                          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                            Cover thumbnail ready
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setThumbnail(null)}
                        className="p-1 text-[var(--ink-faint)] hover:text-[var(--danger)] transition-colors"
                        title="Remove thumbnail"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 03: Pipeline Mode & Format */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 sm:p-5">
              <SectionCardHeader
                number="03"
                title="PIPELINE MODE & FORMAT"
                subtitle="Select execution modality and default aspect ratio"
                icon={Settings2}
              />

              <div className="space-y-4">
                <div>
                  <span className={labelClass}>Execution Modality</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {modes.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setMode(item.value)}
                        className={`rounded-lg border p-3 text-left transition duration-200 ${
                          mode === item.value
                            ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--ink)]"
                            : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[var(--ink)]">
                            {item.label}
                          </span>
                          {mode === item.value && (
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                          )}
                        </div>
                        <span className="mt-1 block font-mono text-[9px] text-[var(--ink-faint)]">
                          {item.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className={labelClass}>Default Aspect Ratio</span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {ratios.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setRatio(item)}
                        className={`rounded-md border py-2 text-center font-mono text-[10px] font-bold transition duration-200 ${
                          ratio === item
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                            : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Sticky 300px Live Tool Manifest Preview */}
          <aside className="w-full lg:w-[300px] shrink-0 lg:sticky lg:top-[68px] space-y-4">
            {/* Live Catalog Card Preview */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold tracking-widest uppercase text-[var(--ink-faint)]">
                  CATALOG PREVIEW
                </span>
                <span className="rounded bg-[var(--surface)] px-1.5 py-0.2 font-mono text-[8px] font-bold text-[var(--accent)] uppercase">
                  LIVE
                </span>
              </div>

              {/* Exact 1:1 Mirror of TensorToolCard */}
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]">
                {thumbnailPreview ? (
                  <img
                    src={thumbnailPreview}
                    alt="Cover preview"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid h-full w-full place-items-center bg-[var(--surface-soft)] p-4 text-center">
                    <div className="flex flex-col items-center gap-1.5 text-[var(--accent)]">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)]">
                        {isVideo ? <Film className="h-5 w-5 opacity-80" /> : <Sparkles className="h-5 w-5 opacity-80" />}
                      </div>
                      <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                        Awaiting cover art
                      </span>
                    </div>
                  </div>
                )}

                {/* Scrim */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 via-50% to-transparent" />

                {/* Top Badges */}
                <div className="absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/50 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md">
                      {isVideo ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                      {isVideo ? "Motion" : "Visual"}
                    </span>
                    <span className="rounded-md border border-white/15 bg-black/50 px-1.5 py-0.5 font-mono text-[8px] font-bold text-white/80 backdrop-blur-md">
                      {ratio}
                    </span>
                  </div>
                </div>

                {/* Bottom Title Overlay */}
                <div className="absolute inset-x-0 bottom-0 z-10 p-3">
                  <h3 className="truncate font-sans text-sm font-bold tracking-tight text-white">
                    {name.trim() || "Untitled pipeline"}
                  </h3>
                  <p className="mt-0.5 truncate font-mono text-[8px] tracking-wide text-white/75 uppercase">
                    {activeModeConfig?.label} {activeModeConfig?.requiresImage ? "• IMAGE INPUT" : "• PROMPT DRIVEN"}
                  </p>
                </div>
              </div>
            </div>

            {/* Manifest Telemetry Card */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                <span className="font-mono text-[9px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                  MANIFEST TELEMETRY
                </span>
                <span
                  className={`rounded px-1.5 py-0.2 font-mono text-[8px] font-bold uppercase ${
                    file
                      ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                      : "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                  }`}
                >
                  {file ? "VALIDATED" : "PENDING"}
                </span>
              </div>

              <div className="space-y-2 text-[10px] font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">PIPELINE TYPE</span>
                  <span className="font-bold text-[var(--ink)]">{mode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">ASPECT RATIO</span>
                  <span className="font-bold text-[var(--ink)]">{ratio}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">GRAPH NODES</span>
                  <span className="font-bold text-[var(--ink)]">
                    {workflowMeta?.nodeCount ?? 0} NODES
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">ENVIRONMENT</span>
                  <span className="font-bold text-[var(--accent)]">LOCAL RUNNER</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">BACKEND ENGINE</span>
                  <span className="font-bold text-[var(--ink)]">COMFYUI :8188</span>
                </div>
              </div>

              <div className="border-t border-[var(--line)] pt-2.5">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !file}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)] disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>{busy ? "Ingesting…" : "Create Tool ⚡"}</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
