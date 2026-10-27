"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Cpu,
  Dices,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  FileJson,
  Film,
  HardDrive,
  ImageIcon,
  Info,
  Layers,
  Layout,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Type,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  type ToolAspectRatio,
  type ToolControl,
  type ToolMode,
  type ToolParseResponse,
  type ToolSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import StudioStepperTabs, { type StudioStepItem } from "@/components/StudioStepperTabs";
import AspectRatioSelector, {
  DEFAULT_TOOL_RATIOS,
} from "@/components/AspectRatioSelector";

const MODES: {
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

const RATIOS: ToolAspectRatio[] = DEFAULT_TOOL_RATIOS;

export interface CreateToolDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (tool: ToolSummary) => void;
  initialFile?: File | null;
  initialConfig?: {
    name?: string;
    mode?: ToolMode;
    ratio?: ToolAspectRatio;
  } | null;
}

export default function CreateToolDrawer({
  open,
  onClose,
  onCreated,
  initialFile,
  initialConfig,
}: CreateToolDrawerProps) {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedData, setParsedData] = useState<ToolParseResponse | null>(null);
  const [controls, setControls] = useState<ToolControl[]>([]);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ToolMode>("text-to-image");
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [showModeOverride, setShowModeOverride] = useState(false);
  const [previewTab, setPreviewTab] = useState<"form" | "card">("card");
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

  // Reset or initialize form on open
  useEffect(() => {
    if (open) {
      if (initialFile) {
        void processJsonFile(initialFile);
        setStep(2);
      } else {
        setStep(1);
      }
      if (initialConfig?.name) setName(initialConfig.name);
      if (initialConfig?.mode) setMode(initialConfig.mode);
      if (initialConfig?.ratio) setRatio(initialConfig.ratio);
      setError(null);
    }
  }, [open, initialFile, initialConfig]);

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

  // Auto-switch preview tab when step changes
  useEffect(() => {
    if (step === 2) {
      setPreviewTab("form");
    } else {
      setPreviewTab("card");
    }
  }, [step]);

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

  const processJsonFile = async (next: File) => {
    if (!next.name.toLowerCase().endsWith(".json")) {
      setError("Please select a valid ComfyUI workflow JSON file (.json).");
      return;
    }
    setError(null);
    setFile(next);
    setIsAnalyzing(true);

    try {
      const defaultName =
        name.trim() ||
        next.name
          .replace(/\.json$/i, "")
          .replace(/[_-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

      const res = await api.parseTool(next, defaultName);
      setParsedData(res);

      if (res.detected_mode) {
        setMode(res.detected_mode);
      }
      if (!name.trim()) {
        setName(defaultName);
      }

      // Initialize all controls as exposed by default
      const initialControls: ToolControl[] = res.controls.map((c) => ({
        ...c,
        exposed: c.exposed !== false,
      }));
      setControls(initialControls);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not analyze workflow JSON.");
      setParsedData(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleControlLabelChange = (id: string, newLabel: string) => {
    setControls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: newLabel } : c))
    );
  };

  const handleControlToggleExposed = (id: string) => {
    setControls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, exposed: !c.exposed } : c))
    );
  };

  const handleExposeAll = () => {
    setControls((prev) => prev.map((c) => ({ ...c, exposed: true })));
  };

  const handleExposePromptsOnly = () => {
    setControls((prev) =>
      prev.map((c) => ({
        ...c,
        exposed: c.kind === "prompt" || (c.role ? c.role.includes("prompt") : false),
      }))
    );
  };

  const handleHideAll = () => {
    setControls((prev) => prev.map((c) => ({ ...c, exposed: false })));
  };

  const exposedControls = controls.filter((c) => c.exposed !== false);
  const exposedCount = exposedControls.length;
  const currentDisplayName = name.trim() || "Untitled tool";
  const isVideoMode = mode.includes("video");

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

    if (controls.length > 0 && exposedCount === 0) {
      setError("Please expose at least one parameter for users to control.");
      setStep(2);
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
        controls.length > 0 ? exposedControls : undefined,
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

  const stepsList: StudioStepItem<1 | 2 | 3>[] = [
    { id: 1, code: "01", label: "Workflow Graph", icon: FileCode2 },
    {
      id: 2,
      code: "02",
      label: "Parameters & Identity",
      icon: Sparkles,
      disabled: !file || isAnalyzing,
      tooltip: !file ? "Upload a ComfyUI workflow JSON in Step 1 to proceed" : undefined,
    },
    {
      id: 3,
      code: "03",
      label: "Media & Deploy",
      icon: ImageIcon,
      disabled: !file || isAnalyzing,
      tooltip: !file ? "Upload a ComfyUI workflow JSON in Step 1 to proceed" : undefined,
    },
  ];

  const getControlKindBadge = (kind: ToolControl["kind"]) => {
    switch (kind) {
      case "prompt":
        return {
          icon: Type,
          label: "Prompt",
          className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
        };
      case "image":
        return {
          icon: ImageIcon,
          label: "Image Input",
          className: "border-rose-500/30 bg-rose-500/10 text-rose-400",
        };
      case "seed":
        return {
          icon: Dices,
          label: "Seed",
          className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        };
      case "number":
        return {
          icon: SlidersHorizontal,
          label: "Slider / Number",
          className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        };
      case "select":
        return {
          icon: Layers,
          label: "Select",
          className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
        };
      case "boolean":
        return {
          icon: Zap,
          label: "Toggle",
          className: "border-blue-500/30 bg-blue-500/10 text-blue-400",
        };
      default:
        return {
          icon: Cpu,
          label: "Field",
          className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
        };
    }
  };

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
        className="relative z-10 flex h-full w-full max-w-5xl lg:max-w-6xl flex-col border-l border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl animate-in slide-in-from-right duration-250 ease-out"
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
                  PIPELINE ARCHITECTURE
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
            <Link
              href="/tools/create"
              onClick={onClose}
              title="Expand to Full-Screen Tool Studio Workspace"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <span>Full Studio Workspace</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
            {parsedData && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                {parsedData.archetype || "Graph Ready"}
              </span>
            )}
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

        {/* Creator Access Notice Banner */}
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
                  Sign in to publish parametric tools to the studio catalog
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
        <StudioStepperTabs
          steps={stepsList}
          activeStep={step}
          onStepChange={(newStep) => setStep(newStep as 1 | 2 | 3)}
          busy={busy || isAnalyzing}
          mode="wizard"
          ariaLabel="Creation steps"
        />

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
          {/* LEFT PANE: Step Inputs & Parameter Configurator */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 border-r border-[var(--line)]">
            {/* STEP 1: WORKFLOW GRAPH & MODALITY AUTO-DETECTION */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                        <FileCode2 className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                          ComfyUI Workflow JSON
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                          Upload exported ComfyUI API graph (workflow_api.json or any .json)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dropzone */}
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
                      if (dropped) void processJsonFile(dropped);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex h-[140px] cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed p-6 text-center transition ${
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
                        if (f) void processJsonFile(f);
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
                          {(file.size / 1024).toFixed(1)} KB · Click or drag new JSON to replace
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-mono text-xs font-bold text-[var(--ink)]">
                          Drop ComfyUI workflow JSON here
                        </p>
                        <p className="font-mono text-[11px] text-[var(--ink-faint)]">
                          Click to browse or drag file from ComfyUI (Save API format)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Loading State during Graph Analysis */}
                  {isAnalyzing && (
                    <div className="flex items-center gap-3 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3.5 font-mono text-xs text-[var(--accent)] animate-pulse">
                      <Cpu className="h-4 w-4 animate-spin" />
                      <div>
                        <span className="font-bold">Analyzing ComfyUI Execution Graph…</span>
                        <p className="text-[10px] text-[var(--ink-soft)]">
                          Inspecting latent samplers, inputs, diffusion conditions, and video nodes.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Auto-detected Pipeline Architecture Profile */}
                  {parsedData && !isAnalyzing && (
                    <div className="rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] p-4 space-y-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                            Auto-Detected Pipeline Profile
                          </span>
                        </div>
                        <span className="rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent)]">
                          ✓ Graph Validated
                        </span>
                      </div>

                      {/* Archetype & Modality Summary Banner */}
                      <div className="rounded-[5px] border border-[var(--accent)]/20 bg-[var(--surface-raised)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink-faint)] block">
                              PIPELINE ARCHETYPE
                            </span>
                            <h3 className="font-sans text-sm font-bold text-[var(--ink)] flex items-center gap-1.5">
                              <Zap className="h-4 w-4 text-[var(--accent)]" />
                              <span>{parsedData.archetype || "Custom ComfyUI Pipeline"}</span>
                            </h3>
                          </div>
                          <div className="text-right">
                            <span className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--accent)] inline-block">
                              {mode.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Architecture Telemetry Chips */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-2">
                          <span className="text-[var(--ink-faint)] block text-[9px]">MODE</span>
                          <span className="font-bold text-[var(--ink)] capitalize">
                            {mode.replace(/-/g, " ")}
                          </span>
                        </div>
                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-2">
                          <span className="text-[var(--ink-faint)] block text-[9px]">OUTPUT TARGET</span>
                          <span className="font-bold text-[var(--accent)]">
                            {parsedData.detected_output_type === "video"
                              ? "🎬 MP4 Video"
                              : "🖼️ PNG / WebP"}
                          </span>
                        </div>
                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-2">
                          <span className="text-[var(--ink-faint)] block text-[9px]">TOTAL NODES</span>
                          <span className="font-bold text-[var(--ink)]">
                            {parsedData.node_count ?? parsedData.locked_nodes.length} Linked
                          </span>
                        </div>
                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-2">
                          <span className="text-[var(--ink-faint)] block text-[9px]">PARAMETERS</span>
                          <span className="font-bold text-[var(--accent)]">
                            {controls.length} Auto-Extracted
                          </span>
                        </div>
                      </div>

                      {/* Discovered Inputs & Signals */}
                      {parsedData.detected_inputs && parsedData.detected_inputs.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)] block">
                            Detected Pipeline Signals & Inputs:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {parsedData.detected_inputs.map((sig, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[9px] text-[var(--ink-soft)]"
                              >
                                <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                                <span>{sig}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="font-mono text-[10px] text-[var(--ink-faint)] pt-1">
                        Modality was automatically recognized from your ComfyUI nodes. Proceed to Step 2 to customize user-facing parameters and form labels.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 2: PARAMETERS & IDENTITY (FORM BUILDER) */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* 1. Identity & Auto-Detected Pipeline Configuration */}
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                          Tool Identity & Canvas
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                          Name your studio pipeline and set target aspect ratio
                        </span>
                      </div>
                    </div>

                    {/* Auto-detected Modality Badge with Override Selector */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowModeOverride(!showModeOverride)}
                        className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                        title="Click to override auto-detected pipeline mode"
                      >
                        {isVideoMode ? (
                          <Film className="h-3 w-3" />
                        ) : (
                          <ImageIcon className="h-3 w-3" />
                        )}
                        <span>Mode: {mode}</span>
                        <ChevronDown className="h-3 w-3 opacity-70" />
                      </button>

                      {showModeOverride && (
                        <div className="absolute right-0 top-full mt-1.5 z-20 w-52 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1.5 shadow-xl font-mono text-[10px]">
                          <span className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)] block">
                            Override Generation Mode
                          </span>
                          {MODES.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => {
                                setMode(m.value);
                                setShowModeOverride(false);
                              }}
                              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition ${
                                mode === m.value
                                  ? "bg-[var(--accent)]/20 text-[var(--accent)] font-bold"
                                  : "text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                              }`}
                            >
                              <span>{m.label}</span>
                              {mode === m.value && <Check className="h-3 w-3" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tool Name Input */}
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

                  {/* Canvas Aspect Ratio */}
                  <div>
                    <AspectRatioSelector
                      value={ratio}
                      onChange={setRatio}
                      options={RATIOS}
                      label="Default Canvas Aspect Ratio"
                      columns={5}
                      size="sm"
                    />
                  </div>
                </div>

                {/* 2. Visual Parameter Studio (Form Builder) */}
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--line)]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                          Parametric Form Builder
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                          Toggle exposed parameters and customize user-facing labels
                        </span>
                      </div>
                    </div>

                    {/* Exposed Stats Pill */}
                    <div className="flex items-center gap-2">
                      <span className="rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink-soft)]">
                        <span className="text-[var(--accent)]">{exposedCount}</span> / {controls.length} Exposed
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Toolbar */}
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                      Quick Batch Actions:
                    </span>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <button
                        type="button"
                        onClick={handleExposeAll}
                        className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
                      >
                        Expose All
                      </button>
                      <button
                        type="button"
                        onClick={handleExposePromptsOnly}
                        className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
                      >
                        Prompts Only
                      </button>
                      <button
                        type="button"
                        onClick={handleHideAll}
                        className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
                      >
                        Hide All
                      </button>
                    </div>
                  </div>

                  {/* Parameter List */}
                  {controls.length === 0 ? (
                    <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-6 text-center font-mono text-xs text-[var(--ink-faint)]">
                      No parametric inputs discovered in this workflow graph. The tool will execute using fixed node defaults.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {controls.map((control) => {
                        const isExposed = control.exposed !== false;
                        const badge = getControlKindBadge(control.kind);
                        const BadgeIcon = badge.icon;

                        return (
                          <div
                            key={control.id}
                            className={`rounded-[5px] border p-3.5 transition-all ${
                              isExposed
                                ? "border-[var(--line-strong)] bg-[var(--surface-sunken)]/80 shadow-sm"
                                : "border-[var(--line)] bg-[var(--surface-sunken)]/30 opacity-60"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Checkbox Toggle */}
                              <button
                                type="button"
                                onClick={() => handleControlToggleExposed(control.id)}
                                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                  isExposed
                                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                                    : "border-[var(--line-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--ink-faint)]"
                                }`}
                                title={isExposed ? "Hide from users" : "Expose to users"}
                              >
                                <Check className="h-3 w-3 stroke-[3]" />
                              </button>

                              {/* Form Field Configurator */}
                              <div className="flex-1 space-y-2 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  {/* Badge & Node Origin */}
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold border ${badge.className}`}
                                    >
                                      <BadgeIcon className="h-3 w-3" />
                                      <span>{badge.label}</span>
                                    </span>
                                    <span className="font-mono text-[9px] text-[var(--ink-faint)] truncate max-w-[200px]">
                                      Node #{control.node_id} · {control.input_name}
                                    </span>
                                  </div>

                                  {/* Status Indicator */}
                                  <span className="font-mono text-[9px] font-bold">
                                    {isExposed ? (
                                      <span className="text-[var(--accent)] flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        <span>Exposed</span>
                                      </span>
                                    ) : (
                                      <span className="text-[var(--ink-faint)] flex items-center gap-1">
                                        <EyeOff className="h-3 w-3" />
                                        <span>Hidden (Fixed)</span>
                                      </span>
                                    )}
                                  </span>
                                </div>

                                {/* Custom Label Input */}
                                <div>
                                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                                    Form Field Label
                                  </label>
                                  <input
                                    value={control.label}
                                    disabled={!isExposed}
                                    onChange={(e) =>
                                      handleControlLabelChange(control.id, e.target.value)
                                    }
                                    placeholder="e.g. Creative Prompt, Steps, Guidance"
                                    className="workspace-field h-7 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                </div>

                                {/* Default Value & Bounds Hint */}
                                <div className="flex flex-wrap items-center gap-3 font-mono text-[9px] text-[var(--ink-faint)] pt-0.5">
                                  <span>
                                    Default:{" "}
                                    <span className="text-[var(--ink)] font-semibold">
                                      {control.default !== undefined
                                        ? String(control.default)
                                        : control.value !== undefined
                                          ? String(control.value)
                                          : "—"}
                                    </span>
                                  </span>

                                  {control.numeric && (
                                    <span>
                                      Range: [
                                      {control.min ?? control.minimum ?? "0"} …{" "}
                                      {control.max ?? control.maximum ?? "100"}
                                      ]
                                      {control.step ? ` · Step: ${control.step}` : ""}
                                    </span>
                                  )}

                                  {control.kind === "select" && control.options?.length > 0 && (
                                    <span>
                                      {control.options.length} options available
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Warning if no controls exposed */}
                  {controls.length > 0 && exposedCount === 0 && (
                    <div className="rounded-[5px] border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-[11px] text-amber-400">
                      ⚠️ <strong>Warning:</strong> You have unchecked all parameters. Users will have no custom inputs to run this tool. Please expose at least 1 parameter.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: SHOWCASE MEDIA & FINAL DEPLOY */}
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
                        Upload catalog cover art and verify pipeline controls before deployment
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
                      className={`flex h-[110px] cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed p-4 text-center transition ${
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
                      <p className="max-w-full truncate font-mono text-xs font-bold text-[var(--ink)]">
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
                      <span className="font-bold text-[var(--ink)] truncate max-w-[200px]">
                        {file?.name || "None"} ({parsedData?.node_count ?? 0} nodes)
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Archetype:</span>
                      <span className="font-bold text-[var(--accent)]">
                        {parsedData?.archetype || "ComfyUI Pipeline"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Execution Mode:</span>
                      <span className="font-bold text-[var(--accent)] uppercase">{mode}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Exposed Parameters:</span>
                      <span className="font-semibold text-[var(--ink)]">
                        {exposedCount} of {controls.length} configured
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Canvas Ratio:</span>
                      <span className="font-semibold text-[var(--ink)]">{ratio}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Cover Image:</span>
                      <span className="font-semibold text-[var(--ink)]">
                        {thumbnail ? thumbnail.name : "Default generated card"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANE: Dual-Mode Live Preview Inspector (Form View + Card Mockup) */}
          <div className="w-[340px] lg:w-[380px] shrink-0 bg-[var(--surface-sunken)] p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              {/* Preview Mode Selector Tabs */}
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                <div className="flex items-center gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("form")}
                    className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-bold transition ${
                      previewTab === "form"
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Layout className="h-3 w-3" />
                    <span>Live Form</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("card")}
                    className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-bold transition ${
                      previewTab === "card"
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Card Mockup</span>
                  </button>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-[5px] border border-[var(--accent)]/20">
                  Step {step}/3
                </span>
              </div>

              {/* TAB 1: LIVE USER FORM PREVIEW */}
              {previewTab === "form" && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                      Live User Interface
                    </span>
                    <span className="text-[var(--accent)] font-bold">
                      {exposedCount} Controls
                    </span>
                  </div>

                  {/* Mock Studio Tool Execution Interface */}
                  <div className="rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 shadow-xl space-y-3.5">
                    {/* Simulated Tool Header */}
                    <div className="border-b border-[var(--line)] pb-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] font-bold text-[var(--accent)] uppercase">
                          {mode.toUpperCase()}
                        </span>
                        <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.2 font-mono text-[8px] text-[var(--ink-faint)]">
                          LOCAL COMFIUI
                        </span>
                      </div>
                      <h4 className="font-mono text-xs font-bold text-[var(--ink)] truncate mt-0.5">
                        {currentDisplayName}
                      </h4>
                    </div>

                    {/* Render Mock Controls for Exposed Items */}
                    {exposedCount === 0 ? (
                      <div className="rounded border border-dashed border-[var(--line-strong)] p-4 text-center font-mono text-[10px] text-[var(--ink-faint)]">
                        No parameters exposed yet. Check [✓] Expose on parameters to add them to your user interface.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {exposedControls.map((ctrl) => (
                          <div key={ctrl.id} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase truncate max-w-[200px]">
                                {ctrl.label || ctrl.input_name}
                              </label>
                              <span className="font-mono text-[8px] text-[var(--ink-faint)] uppercase">
                                {ctrl.kind}
                              </span>
                            </div>

                            {/* Render visual mock input based on kind */}
                            {ctrl.kind === "prompt" && (
                              <textarea
                                readOnly
                                rows={2}
                                value={String(ctrl.default ?? ctrl.value ?? "")}
                                placeholder="Enter prompt instructions…"
                                className="w-full resize-none rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2 font-mono text-[10px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none"
                              />
                            )}

                            {ctrl.kind === "image" && (
                              <div className="flex h-14 items-center justify-center rounded border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] font-mono text-[9px] text-[var(--ink-faint)]">
                                🖼️ Starter Image Input Zone
                              </div>
                            )}

                            {ctrl.kind === "seed" && (
                              <div className="flex items-center gap-1.5">
                                <div className="h-7 flex-1 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[10px] text-[var(--ink)] flex items-center">
                                  {String(ctrl.default ?? ctrl.value ?? "-1")}
                                </div>
                                <div className="h-7 w-7 rounded border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--ink-faint)]">
                                  <Dices className="h-3 w-3" />
                                </div>
                              </div>
                            )}

                            {ctrl.kind === "number" && (
                              <div className="space-y-1">
                                <div className="h-7 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[10px] text-[var(--ink)] flex items-center justify-between">
                                  <span>{String(ctrl.default ?? ctrl.value ?? "0")}</span>
                                  <span className="text-[8px] text-[var(--ink-faint)]">
                                    [{ctrl.min ?? ctrl.minimum ?? "0"} - {ctrl.max ?? ctrl.maximum ?? "100"}]
                                  </span>
                                </div>
                              </div>
                            )}

                            {ctrl.kind === "select" && (
                              <div className="h-7 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[10px] text-[var(--ink)] flex items-center justify-between">
                                <span>{String(ctrl.default ?? ctrl.value ?? "Default Option")}</span>
                                <ChevronDown className="h-3 w-3 opacity-60" />
                              </div>
                            )}

                            {ctrl.kind === "boolean" && (
                              <div className="flex items-center justify-between h-7 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2">
                                <span className="font-mono text-[9px] text-[var(--ink)]">Enabled</span>
                                <div className="h-3.5 w-6 rounded-full bg-[var(--accent)] flex items-center justify-end px-0.5">
                                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent-ink)]" />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Aspect Ratio Selector Mockup */}
                        <div className="space-y-1 pt-1 border-t border-[var(--line)]">
                          <label className="font-mono text-[9px] font-bold uppercase text-[var(--ink-soft)]">
                            Format
                          </label>
                          <div className="flex gap-1">
                            {RATIOS.slice(0, 4).map((r) => (
                              <span
                                key={r}
                                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                                  ratio === r
                                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                    : "bg-[var(--surface-sunken)] text-[var(--ink-faint)] border border-[var(--line)]"
                                }`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Mock Generate Button */}
                        <div className="pt-2">
                          <div className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[5px] bg-[var(--accent)] font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)] shadow-sm">
                            <Zap className="h-3 w-3" />
                            <span>Generate ⚡</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TOOL CARD CATALOG MOCKUP */}
              {previewTab === "card" && (
                <div className="space-y-3 animate-in fade-in duration-150">
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
                      <span className="text-[var(--ink-faint)]">Archetype:</span>
                      <span className="font-bold text-[var(--accent)] truncate max-w-[150px]">
                        {parsedData?.archetype || "ComfyUI Pipeline"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Graph Nodes:</span>
                      <span className="font-bold text-[var(--accent)]">
                        {parsedData?.node_count ? `${parsedData.node_count} detected` : "None"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Parameters:</span>
                      <span className="font-semibold text-[var(--ink)]">
                        {exposedCount} of {controls.length} exposed
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Pipeline Mode:</span>
                      <span className="font-semibold text-[var(--accent)] uppercase">{mode}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[var(--ink-faint)]">Default Canvas:</span>
                      <span className="font-semibold text-[var(--ink)]">{ratio}</span>
                    </div>
                  </div>
                </div>
              )}
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
            disabled={busy || isAnalyzing}
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
                disabled={step === 1 ? !file || isAnalyzing : exposedCount === 0}
                onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
              >
                <span>Next Step</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !file || exposedCount === 0}
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