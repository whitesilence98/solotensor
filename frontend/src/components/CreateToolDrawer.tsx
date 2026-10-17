"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Cpu,
  FileCode2,
  FileJson,
  Film,
  ImageIcon,
  Info,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { api, type ToolAspectRatio, type ToolMode, type ToolSummary } from "@/lib/api";

const modes: {
  value: ToolMode;
  label: string;
  description: string;
  isVideo?: boolean;
  requiresImage?: boolean;
}[] = [
  {
    value: "text-to-image",
    label: "Text → Image",
    description: "Prompt-driven latent generation",
  },
  {
    value: "image-to-image",
    label: "Image → Image",
    description: "Conditioned on reference starter image",
    requiresImage: true,
  },
  {
    value: "text-to-video",
    label: "Text → Video",
    description: "Temporal motion synthesis from text prompt",
    isVideo: true,
  },
  {
    value: "image-to-video",
    label: "Image → Video",
    description: "Video animation seeded by starter image",
    isVideo: true,
    requiresImage: true,
  },
];

const ratios: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];

interface WorkflowMeta {
  nodeCount: number;
  hasPrompt: boolean;
  hasSampler: boolean;
  hasImageInput: boolean;
  topNodes: string[];
}

export interface CreateToolDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (tool: ToolSummary) => void;
}

export default function CreateToolDrawer({
  open,
  onClose,
  onCreated,
}: CreateToolDrawerProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Reset form on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
    }
  }, [open]);

  // Thumbnail preview cleanup
  useEffect(() => {
    if (!thumbnail) {
      setThumbnailPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumbnail);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  // Keyboard escape handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const parseWorkflow = async (targetFile: File) => {
    try {
      const text = await targetFile.text();
      const data = JSON.parse(text);
      if (typeof data === "object" && data !== null) {
        const nodes = Object.values(data) as Record<string, unknown>[];
        const classTypes = nodes
          .map((n) => (typeof n?.class_type === "string" ? n.class_type : ""))
          .filter(Boolean);

        const hasPrompt = classTypes.some(
          (t) =>
            t.toLowerCase().includes("cliptextencode") ||
            t.toLowerCase().includes("prompt"),
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
      setError("Please select a valid ComfyUI workflow_api.json file.");
      return;
    }
    setError(null);
    setFile(next);
    void parseWorkflow(next);
  };

  const submit = async () => {
    if (!file) {
      setError("ComfyUI workflow JSON file is required.");
      setStep(1);
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
      if (onCreated) {
        onCreated(tool);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create tool.");
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-drawer-title"
      className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      {/* Drawer Surface */}
      <div
        ref={drawerRef}
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl animate-in slide-in-from-right duration-200"
      >
        {/* Header Bar */}
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <h2
                id="tool-drawer-title"
                className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
              >
                TOOL STUDIO // WORKFLOW BUILDER
              </h2>
            </div>
            <p className="font-mono text-[10px] text-[var(--ink-faint)] mt-0.5">
              Deploy custom ComfyUI pipeline to workspace gallery
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close creation drawer"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* Step Indicator Bar */}
        <nav
          aria-label="Creation steps"
          className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-sunken)] px-5 py-2 font-mono text-[10px]"
        >
          {[
            { num: 1 as const, label: "01 WORKFLOW" },
            { num: 2 as const, label: "02 IDENTITY" },
            { num: 3 as const, label: "03 MEDIA" },
          ].map((item, idx) => (
            <div key={item.num} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (item.num === 1 || file) setStep(item.num);
                }}
                disabled={item.num > 1 && !file}
                className={`flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors disabled:opacity-40 ${
                  step === item.num
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                    : (item.num === 1 && file) || (item.num === 2 && name)
                      ? "text-[var(--accent)] hover:bg-[var(--surface-raised)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                <span>{item.label}</span>
                {item.num === 1 && file && step !== 1 && (
                  <Check className="h-2.5 w-2.5" />
                )}
              </button>
              {idx < 2 && (
                <span className="text-[var(--line-strong)]">/</span>
              )}
            </div>
          ))}
        </nav>

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between border-b border-[var(--danger)]/30 bg-[var(--danger)]/10 px-5 py-2 font-mono text-xs text-[var(--danger)]"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="hover:opacity-75"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Scrollable Step Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* STEP 1: WORKFLOW FILE */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--line)]">
                  <FileCode2 className="h-4 w-4 text-[var(--accent)]" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    COMFYUI WORKFLOW API JSON
                  </span>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) processJsonFile(dropped);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition ${
                    isDragging
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : file
                        ? "border-[var(--accent)]/50 bg-[var(--surface-sunken)]"
                        : "border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processJsonFile(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                    <FileJson className="h-4 w-4" />
                  </div>
                  {file ? (
                    <div>
                      <p className="font-mono text-xs font-bold text-[var(--accent)] truncate max-w-xs">
                        {file.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-faint)]">
                        {(file.size / 1024).toFixed(1)} KB · Click or drag to replace
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-mono text-xs font-semibold text-[var(--ink)]">
                        Drop workflow_api.json here
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                        Export from ComfyUI menu (Save API format)
                      </p>
                    </div>
                  )}
                </div>

                {/* Parsed Node Metadata */}
                {workflowMeta && (
                  <div className="mt-3 rounded-md border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                        PIPELINE DISCOVERY
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink)]">
                        {workflowMeta.nodeCount} Total Nodes
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {workflowMeta.hasPrompt && (
                        <span className="rounded border border-[var(--accent)]/30 bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent)]">
                          ✓ Prompt Text Node
                        </span>
                      )}
                      {workflowMeta.hasSampler && (
                        <span className="rounded border border-[var(--accent)]/30 bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent)]">
                          ✓ KSampler Node
                        </span>
                      )}
                      {workflowMeta.hasImageInput && (
                        <span className="rounded border border-[var(--accent)]/30 bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent)]">
                          ✓ LoadImage Node (Img2Img)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: TOOL IDENTITY & INFERENCE PARAMETERS */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3.5">
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    TOOL IDENTITY & PIPELINE MODE
                  </span>
                </div>

                {/* Tool Name */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Tool Pipeline Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cyberpunk Cinematic Portrait"
                    className="workspace-field h-7.5 w-full px-2.5 font-mono text-[11px] outline-none bg-[var(--surface-sunken)] border border-[var(--line)] rounded-md text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors"
                  />
                </div>

                {/* Workflow Mode Selector */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Generation Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {modes.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setMode(item.value)}
                        className={`rounded-md border p-2 text-left transition ${
                          mode === item.value
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm"
                            : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink)] hover:border-[var(--line-strong)]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
                          {item.isVideo ? (
                            <Film className="h-3 w-3 shrink-0" />
                          ) : (
                            <ImageIcon className="h-3 w-3 shrink-0" />
                          )}
                          <span>{item.label}</span>
                        </div>
                        <p className="mt-0.5 text-[9px] leading-tight text-[var(--ink-faint)]">
                          {item.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect Ratio Presets */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Default Canvas Aspect Ratio
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ratios.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setRatio(item)}
                        className={`rounded-md border px-3 py-1 font-mono text-xs font-bold transition ${
                          ratio === item
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink)] hover:border-[var(--line-strong)]"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: THUMBNAIL & REVIEW */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3.5">
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                  <ImageIcon className="h-4 w-4 text-[var(--accent)]" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    SHOWCASE THUMBNAIL & REVIEW
                  </span>
                </div>

                {/* Thumbnail Upload */}
                <div
                  onClick={() => thumbInputRef.current?.click()}
                  className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 p-4 text-center transition hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                >
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setThumbnail(f);
                      e.target.value = "";
                    }}
                  />
                  {thumbnailPreview ? (
                    <div className="relative aspect-[16/10] h-20 overflow-hidden rounded border border-[var(--line)]">
                      <img
                        src={thumbnailPreview}
                        alt="Thumbnail preview"
                        className="asset-zoom-media h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                        <Upload className="h-3.5 w-3.5" />
                      </div>
                      <p className="font-mono text-[11px] font-semibold text-[var(--ink)]">
                        Add Tool Cover Thumbnail
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">
                        PNG, JPG, or WebP preview card image
                      </p>
                    </>
                  )}
                </div>

                {/* Review Specs Summary */}
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-[11px] space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-faint)]">Name:</span>
                    <span className="font-bold text-[var(--ink)]">
                      {name || "Untitled tool"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-faint)]">Mode:</span>
                    <span className="text-[var(--accent)]">{mode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-faint)]">Default Ratio:</span>
                    <span className="text-[var(--ink)]">{ratio}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-faint)]">Workflow Nodes:</span>
                    <span className="text-[var(--ink)]">
                      {workflowMeta?.nodeCount ?? 0} nodes
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions Bar */}
        <footer className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-raised)] px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => (s - 1) as 1 | 2);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[11px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors disabled:opacity-40"
          >
            {step === 1 ? (
              <span>Cancel</span>
            ) : (
              <>
                <ArrowLeft className="h-3 w-3" />
                <span>Back</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 && !file}
                onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
              >
                <span>Next Step</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !file}
                onClick={() => void submit()}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)] disabled:opacity-40"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{busy ? "Deploying Pipeline…" : "Create Tool ⚡"}</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
