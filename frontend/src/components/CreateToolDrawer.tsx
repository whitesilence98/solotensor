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
  HardDrive,
  ImageIcon,
  Info,
  Layers,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { api, type ToolAspectRatio, type ToolMode, type ToolSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

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
    description: "Prompt-driven latent diffusion",
  },
  {
    value: "image-to-image",
    label: "Image → Image",
    description: "Conditioned on starter image reference",
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
  const { isAuthenticated, openAuthModal } = useAuth();
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
  const [isDraggingWorkflow, setIsDraggingWorkflow] = useState(false);
  const [isDraggingThumb, setIsDraggingThumb] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Auth gate interception on drawer open
  useEffect(() => {
    if (open && !isAuthenticated) {
      openAuthModal("create_tool");
    }
  }, [open, isAuthenticated, openAuthModal]);

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
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, onClose]);

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
    if (!isAuthenticated) {
      openAuthModal("create_tool");
      return;
    }

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

  const currentDisplayName = name.trim() || "Untitled tool";
  const isVideoMode = mode.includes("video");

  const stepsList = [
    { num: 1 as const, code: "01", label: "Workflow", icon: FileCode2 },
    { num: 2 as const, code: "02", label: "Identity", icon: Sparkles },
    { num: 3 as const, code: "03", label: "Media & Deploy", icon: ImageIcon },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      {/* Drawer Surface */}
      <div
        ref={drawerRef}
        className="relative z-10 flex h-full w-full max-w-4xl lg:max-w-5xl flex-col border-l border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* Header Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--accent)] shadow-sm">
              <Cpu className="h-4 w-4 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold tracking-widest text-[var(--accent)] uppercase">
                  TOOL STUDIO
                </span>
                <span className="font-mono text-[9px] text-[var(--line-strong)]">/</span>
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">
                  WORKFLOW PIPELINE BUILDER
                </span>
              </div>
              <h2
                id="tool-drawer-title"
                className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
              >
                Create Custom AI Tool
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-[10px] text-[var(--ink-soft)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              Live Catalog Mockup
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close creation drawer"
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Obsidian & Acid-Lime Sign-In Notice Banner */}
        {!isAuthenticated && (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--accent)]/30 bg-[var(--surface-sunken)] px-6 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Creator Access Required
                </p>
                <p className="font-sans text-xs text-[var(--ink-soft)]">
                  Sign in to author parametric studio tools
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal("create_tool")}
              className="shrink-0 rounded-[5px] bg-[var(--accent)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98]"
            >
              Sign In
            </button>
          </div>
        )}

        {/* Step Stepper Navigation Bar */}
        <nav
          aria-label="Creation steps"
          className="flex items-center border-b border-[var(--line)] bg-[var(--surface-sunken)] px-6 py-2"
        >
          <div className="grid w-full grid-cols-3 gap-2 font-mono text-[11px]">
            {stepsList.map(({ num, code, label, icon: Icon }) => {
              const isActive = step === num;
              const isPast = step > num;
              const isAllowed = num === 1 || Boolean(file);
              return (
                <button
                  key={num}
                  type="button"
                  disabled={!isAllowed || busy}
                  onClick={() => {
                    if (isAllowed) setStep(num);
                  }}
                  className={`group relative flex items-center justify-center gap-2 rounded-[5px] py-2 px-2 transition-all disabled:opacity-40 ${
                    isActive
                      ? "border border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm shadow-[var(--accent)]/5"
                      : isPast
                        ? "border border-[var(--line)] bg-[var(--surface-raised)]/60 text-[var(--ink)] hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
                        : "border border-transparent text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold ${
                      isActive
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : isPast
                          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                          : "bg-[var(--surface-soft)] text-[var(--ink-faint)]"
                    }`}
                  >
                    {isPast ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : code}
                  </span>
                  <span className="truncate font-semibold tracking-wide uppercase text-[10px]">
                    {label}
                  </span>
                  {isActive && (
                    <div className="absolute inset-x-2 -bottom-2 h-0.5 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            className="mx-6 mt-4 flex items-center justify-between rounded-[5px] border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 font-mono text-xs text-[var(--danger)] animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Dual-Pane Workspace Body: Form Left + Realtime Preview Right */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Step Form Inputs */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 border-r border-[var(--line)]">
            {/* STEP 1: WORKFLOW FILE */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--line)]">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                      <FileCode2 className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                        ComfyUI Workflow API JSON
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                        Upload exported API graph (Save format: workflow_api.json)
                      </span>
                    </div>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingWorkflow(true);
                    }}
                    onDragLeave={() => setIsDraggingWorkflow(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingWorkflow(false);
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) processJsonFile(dropped);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed p-6 text-center transition ${
                      isDraggingWorkflow
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
                    <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                      <FileJson className="h-4 w-4" />
                    </div>
                    {file ? (
                      <div className="space-y-1">
                        <p className="font-mono text-xs font-bold text-[var(--accent)] truncate max-w-sm">
                          {file.name}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                          {(file.size / 1024).toFixed(1)} KB · Drag new file to replace
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-mono text-xs font-bold text-[var(--ink)]">
                          Drop workflow_api.json here
                        </p>
                        <p className="font-mono text-[11px] text-[var(--ink-faint)]">
                          Click to browse or export from ComfyUI menu (Save API format)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Parsed Node Metadata */}
                  {workflowMeta && (
                    <div className="rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                          PIPELINE GRAPH VERIFIED
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                          {workflowMeta.nodeCount} Total Nodes
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {workflowMeta.hasPrompt && (
                          <span className="rounded-[5px] border border-[var(--accent)]/30 bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
                            ✓ Prompt Encoder
                          </span>
                        )}
                        {workflowMeta.hasSampler && (
                          <span className="rounded-[5px] border border-[var(--accent)]/30 bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
                            ✓ KSampler Core
                          </span>
                        )}
                        {workflowMeta.hasImageInput && (
                          <span className="rounded-[5px] border border-[var(--accent)]/30 bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
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
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--line)]">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                        Tool Identity & Pipeline Mode
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                        Name your pipeline and determine media generation modes
                      </span>
                    </div>
                  </div>

                  {/* Tool Name */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Tool Pipeline Name <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Cyberpunk Cinematic Portrait"
                      className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-[12px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none transition-colors"
                    />
                  </div>

                  {/* Workflow Mode Selector */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Generation Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {modes.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setMode(item.value)}
                          className={`rounded-[5px] border p-2.5 text-left transition ${
                            mode === item.value
                              ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                              : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink)] hover:border-[var(--line-strong)]"
                          }`}
                        >
                          <div className="flex items-center gap-2 font-mono text-[11px] font-bold">
                            {item.isVideo ? (
                              <Film className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span>{item.label}</span>
                          </div>
                          <p className="mt-1 text-[9px] leading-tight text-[var(--ink-faint)]">
                            {item.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Presets */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Default Canvas Aspect Ratio
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ratios.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setRatio(item)}
                          className={`rounded-[5px] border px-3 py-1 font-mono text-xs font-bold transition-all ${
                            ratio === item
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                              : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
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

            {/* STEP 3: THUMBNAIL & DEPLOY */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--line)]">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                      <ImageIcon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                        Showcase Media & Final Verification
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                        Upload card cover and review parameters before deployment
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail Upload */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Tool Thumbnail Cover
                    </label>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingThumb(true);
                      }}
                      onDragLeave={() => setIsDraggingThumb(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingThumb(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) setThumbnail(f);
                      }}
                      onClick={() => thumbInputRef.current?.click()}
                      className={`flex min-h-[110px] cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed p-4 text-center transition ${
                        isDraggingThumb
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : thumbnail
                            ? "border-[var(--accent)]/50 bg-[var(--surface-sunken)]"
                            : "border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                      }`}
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
                      <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                        <Upload className="h-3.5 w-3.5" />
                      </div>
                      <p className="font-mono text-xs font-bold text-[var(--ink)]">
                        {thumbnail
                          ? `Thumbnail: ${thumbnail.name}`
                          : "Upload Tool Cover Image"}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-faint)]">
                        PNG, JPG, or WebP 16:10 preview card image
                      </p>
                    </div>
                  </div>

                  {/* Pre-flight Checklist */}
                  <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 font-mono text-[11px] space-y-2">
                    <div className="flex items-center gap-2 text-[var(--accent)] font-bold text-[10px] pb-1 border-b border-[var(--line)] uppercase tracking-wider">
                      <span>✓ Pre-Flight Checklist</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Workflow Graph:</span>
                      <span className="font-bold text-[var(--ink)] truncate max-w-[180px]">
                        {file?.name || "None"} ({workflowMeta?.nodeCount ?? 0} nodes)
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Execution Mode:</span>
                      <span className="font-bold text-[var(--accent)]">{mode}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Canvas Ratio:</span>
                      <span className="font-semibold text-[var(--ink)]">{ratio}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Live Preview Inspector Panel (Always Visible) */}
          <div className="w-[320px] shrink-0 bg-[var(--surface-sunken)] p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              {/* Preview Header Frame */}
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                  <span>Tool Card Mockup</span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-[5px] border border-[var(--accent)]/20">
                  Step {step}/3
                </span>
              </div>

              {/* Machined 16:10 Tool Card Container */}
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-xl">
                {thumbnailPreview ? (
                  <img
                    src={thumbnailPreview}
                    alt={currentDisplayName}
                    className="asset-zoom-media absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid h-full w-full place-items-center bg-[var(--surface-soft)] p-4 text-center">
                    <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)]">
                        {isVideoMode ? (
                          <Film className="h-5 w-5 opacity-80" />
                        ) : (
                          <Sparkles className="h-5 w-5 opacity-80" />
                        )}
                      </div>
                      <span className="line-clamp-2 font-mono text-[11px] font-semibold text-[var(--ink-faint)]">
                        {currentDisplayName}
                      </span>
                    </div>
                  </div>
                )}

                {/* Dark Gradient Scrim */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 via-50% to-transparent" />

                {/* Top Badges */}
                <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-[5px] border border-white/20 bg-black/60 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md">
                      {isVideoMode ? (
                        <Film className="h-3 w-3" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      {isVideoMode ? "Motion" : "Visual"}
                    </span>
                    <span className="rounded-[5px] border border-white/15 bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white/80 backdrop-blur-md">
                      {ratio}
                    </span>
                  </div>
                </div>

                {/* Bottom Title Overlay */}
                <div className="absolute inset-x-3 bottom-3 z-10 pointer-events-none">
                  <p className="line-clamp-1 font-mono text-xs font-bold text-white">
                    {currentDisplayName}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-white/70 uppercase">
                    {mode} · ComfyUI Pipeline
                  </p>
                </div>
              </div>

              {/* Dynamic Telemetry Specs */}
              <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-[11px] space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Workflow Source:</span>
                  <span className="font-semibold text-[var(--ink)] truncate max-w-[150px]">
                    {file?.name || "Pending upload…"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Graph Nodes:</span>
                  <span className="font-bold text-[var(--accent)]">
                    {workflowMeta?.nodeCount ? `${workflowMeta.nodeCount} detected` : "None"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Pipeline Mode:</span>
                  <span className="font-semibold text-[var(--accent)]">{mode}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Default Canvas:</span>
                  <span className="font-semibold text-[var(--ink)]">{ratio}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Cover Art:</span>
                  <span className="font-semibold text-[var(--ink)]">
                    {thumbnail ? "Attached" : "Default icon"}
                  </span>
                </div>
              </div>
            </div>

            {/* Micro Hint */}
            <p className="mt-4 text-center font-mono text-[9px] text-[var(--ink-faint)]">
              Updates in real-time as you configure the pipeline
            </p>
          </div>
        </div>

        {/* Footer Actions Bar */}
        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--surface-raised)] px-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => (s - 1) as 1 | 2);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-[11px] font-bold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors disabled:opacity-40"
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

          <div className="flex items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 && !file}
                onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
              >
                <span>Next Step</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !file}
                onClick={() => void submit()}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.25)] disabled:opacity-40"
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
