"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Cpu,
  Dices,
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
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  uuid,
  type ProgressEvent,
  type ToolAspectRatio,
  type ToolControl,
  type ToolMode,
  type ToolParseResponse,
  type ToolRunResult,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import StudioStepperTabs, { type StudioStepItem } from "@/components/StudioStepperTabs";
import AspectRatioSelector, {
  DEFAULT_TOOL_RATIOS,
} from "@/components/AspectRatioSelector";
import {
  STARTER_TEMPLATES,
  detectComfyUIFormat,
  type StarterWorkflowTemplate,
} from "@/lib/starter-workflows";

const MODES: {
  value: ToolMode;
  label: string;
  description: string;
  isVideo?: boolean;
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
  },
];

const RATIOS: ToolAspectRatio[] = DEFAULT_TOOL_RATIOS;

/**
 * Dual-Mode Live Preview Inspector Panel (from CreateToolDrawer).
 * Retains the complete right panel: [Live Form] & [Card Mockup] with dynamic Telemetry table.
 */
function StudioInspectorPanel({
  previewTab,
  setPreviewTab,
  step,
  mode,
  ratio,
  currentDisplayName,
  exposedCount,
  exposedControls,
  controls,
  thumbnailPreview,
  isVideoMode,
  file,
  parsedData,
}: {
  previewTab: "form" | "card";
  setPreviewTab: (tab: "form" | "card") => void;
  step: 1 | 2 | 3 | 4;
  mode: ToolMode;
  ratio: ToolAspectRatio;
  currentDisplayName: string;
  exposedCount: number;
  exposedControls: ToolControl[];
  controls: ToolControl[];
  thumbnailPreview: string | null;
  isVideoMode: boolean;
  file: File | null;
  parsedData: ToolParseResponse | null;
}) {
  return (
    <div className="w-[340px] lg:w-[380px] xl:w-[420px] shrink-0 bg-[var(--surface-sunken)] p-5 flex flex-col justify-between overflow-y-auto border-l border-[var(--line)]">
      <div className="space-y-4">
        {/* Preview Mode Selector Tabs */}
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
          <div className="flex items-center gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-0.5">
            <button
              type="button"
              onClick={() => setPreviewTab("form")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-mono text-[10px] font-bold transition ${
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
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-mono text-[10px] font-bold transition ${
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
            Step {step}/4
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
                    LOCAL COMFYUI
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
  );
}

export default function CreateToolStudioPage() {
  const router = useRouter();
  const { isAuthenticated, openAuthModal } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedData, setParsedData] = useState<ToolParseResponse | null>(null);
  const [controls, setControls] = useState<ToolControl[]>([]);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ToolMode>("text-to-image");
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [showModeOverride, setShowModeOverride] = useState(false);
  const [formatWarning, setFormatWarning] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"form" | "card">("card");

  // Playground test-run state
  const [playgroundPrompt, setPlaygroundPrompt] = useState("");
  const [playgroundImage, setPlaygroundImage] = useState<File | null>(null);
  const [playgroundImagePreview, setPlaygroundImagePreview] = useState<string | null>(null);
  const [playgroundValues, setPlaygroundValues] = useState<Record<string, string | number | boolean>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<ProgressEvent | null>(null);
  const [testResult, setTestResult] = useState<ToolRunResult | null>(null);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Final deployment state
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingWorkflow, setIsDraggingWorkflow] = useState(false);
  const [isDraggingThumb, setIsDraggingThumb] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const starterImageInputRef = useRef<HTMLInputElement>(null);

  // Auth gate check
  useEffect(() => {
    if (!isAuthenticated) {
      openAuthModal("create_tool");
    }
  }, [isAuthenticated, openAuthModal]);

  // Cleanup thumbnail preview
  useEffect(() => {
    if (!thumbnail) {
      setThumbnailPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumbnail);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  // Cleanup playground image preview
  useEffect(() => {
    if (!playgroundImage) {
      setPlaygroundImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(playgroundImage);
    setPlaygroundImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [playgroundImage]);

  // Clean socket on unmount
  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  const processJsonFile = async (next: File) => {
    if (!next.name.toLowerCase().endsWith(".json")) {
      setError("Please select a valid ComfyUI workflow JSON file (.json).");
      return;
    }
    setError(null);
    setFormatWarning(null);

    // Format inspection check
    try {
      const text = await next.text();
      const jsonObj = JSON.parse(text);
      const inspection = detectComfyUIFormat(jsonObj);

      if (inspection.isUiFormat) {
        setFormatWarning(inspection.message || "Detected ComfyUI GUI format.");
      }
    } catch {
      // Ignored, let backend parse validate
    }

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

      const initialControls: ToolControl[] = res.controls.map((c) => ({
        ...c,
        exposed: c.exposed !== false,
      }));
      setControls(initialControls);

      // Pre-fill playground values
      const initialValues: Record<string, string | number | boolean> = {};
      initialControls.forEach((c) => {
        if (c.default !== undefined) initialValues[c.id] = c.default;
        else if (c.value !== undefined) initialValues[c.id] = c.value;
      });
      setPlaygroundValues(initialValues);

      // Pre-fill default prompt if discovered
      const promptCtrl = initialControls.find(
        (c) => c.kind === "prompt" || (c.role && c.role.includes("prompt"))
      );
      if (promptCtrl && typeof promptCtrl.default === "string") {
        setPlaygroundPrompt(promptCtrl.default);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not analyze workflow JSON.");
      setParsedData(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyTemplate = (template: StarterWorkflowTemplate) => {
    const jsonStr = JSON.stringify(template.workflow, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const templateFile = new File([blob], `${template.id}.json`, {
      type: "application/json",
    });
    setName(template.name);
    setMode(template.mode);
    void processJsonFile(templateFile);
  };

  // Restore workflow dropped/selected from /tools, or load starter template from query param
  useEffect(() => {
    // 1. Session Storage dropped / uploaded workflow
    try {
      const savedJson = sessionStorage.getItem("st_tool_upload_json");
      const savedFilename = sessionStorage.getItem("st_tool_upload_filename");
      if (savedJson && savedFilename) {
        sessionStorage.removeItem("st_tool_upload_json");
        sessionStorage.removeItem("st_tool_upload_filename");
        const blob = new Blob([savedJson], { type: "application/json" });
        const restoredFile = new File([blob], savedFilename, { type: "application/json" });
        void processJsonFile(restoredFile);
        return;
      }
    } catch (e) {
      console.error("Failed to restore workflow from session:", e);
    }

    // 2. Query param or session starter template
    try {
      const params = new URLSearchParams(window.location.search);
      const templateId = params.get("template") || sessionStorage.getItem("st_tool_starter_template");
      if (templateId) {
        sessionStorage.removeItem("st_tool_starter_template");
        const matched = STARTER_TEMPLATES.find((t) => t.id === templateId);
        if (matched) {
          handleApplyTemplate(matched);
        }
      }
    } catch (e) {
      console.error("Failed to load starter template:", e);
    }
  }, []);

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
  const currentDisplayName = name.trim() || "Untitled Studio Tool";
  const isVideoMode = mode.includes("video");

  // Run dry run in ComfyUI
  const handleRunPlayground = async () => {
    if (!parsedData || !parsedData.tool_id) {
      setError("Please ingest and verify a workflow graph first.");
      return;
    }

    const clientId = uuid();
    setIsTesting(true);
    setError(null);
    setTestResult(null);
    setTestProgress({ type: "queued" });

    const socket = api.openProgressSocket(clientId, (event) => setTestProgress(event));
    socketRef.current = socket;

    try {
      const filesMap: Record<string, File> = {};
      const imageControls = exposedControls.filter((c) => c.kind === "image");
      if (imageControls.length > 0 && playgroundImage) {
        filesMap[imageControls[0].id] = playgroundImage;
      }

      const result = await api.runTool(
        parsedData.tool_id,
        playgroundPrompt,
        ratio,
        playgroundImage ?? undefined,
        playgroundValues,
        filesMap,
        { clientId, saveToGallery: false }
      );
      setTestResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playground test run failed.");
    } finally {
      socket.close();
      socketRef.current = null;
      setIsTesting(false);
    }
  };

  // 1-Click Snapshot: Take generated output and set as tool thumbnail
  const handleSnapshotToThumbnail = async () => {
    if (!testResult) return;
    const mediaUrl = testResult.images?.[0]?.url;
    if (!mediaUrl) return;

    try {
      const res = await fetch(mediaUrl);
      const blob = await res.blob();
      const ext = blob.type.includes("webp")
        ? ".webp"
        : blob.type.includes("jpeg")
          ? ".jpg"
          : ".png";
      const snapFile = new File([blob], `cover_snapshot_${Date.now()}${ext}`, {
        type: blob.type || "image/png",
      });
      setThumbnail(snapFile);
      setSnapshotSuccess(true);
      setTimeout(() => setSnapshotSuccess(false), 3000);
    } catch (e) {
      console.error("Could not capture thumbnail:", e);
    }
  };

  // Final Publish / Deploy
  const handleDeploy = async () => {
    if (!isAuthenticated) {
      openAuthModal("create_tool");
      return;
    }
    if (!file) {
      setError("ComfyUI workflow JSON is required.");
      setStep(1);
      return;
    }
    if (controls.length > 0 && exposedCount === 0) {
      setError("Please expose at least one parameter for users to control.");
      setStep(2);
      return;
    }

    setIsDeploying(true);
    setError(null);
    try {
      const tool = await api.createTool(
        file,
        name.trim() || "Untitled Studio Tool",
        mode,
        ratio,
        thumbnail ?? undefined,
        controls.length > 0 ? exposedControls : undefined
      );
      router.push(`/tools/${tool.tool_id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not deploy tool.");
      setIsDeploying(false);
    }
  };

  const stepsList: StudioStepItem<1 | 2 | 3 | 4>[] = [
    { id: 1, code: "01", label: "Source & Graph", icon: FileCode2 },
    {
      id: 2,
      code: "02",
      label: "Parameter Studio",
      icon: SlidersHorizontal,
      disabled: !file || isAnalyzing,
      tooltip: !file ? "Upload or pick a workflow in Step 1 to proceed" : undefined,
    },
    {
      id: 3,
      code: "03",
      label: "Playground & Test",
      icon: Play,
      disabled: !file || isAnalyzing,
      tooltip: !file ? "Upload or pick a workflow in Step 1 to proceed" : undefined,
    },
    {
      id: 4,
      code: "04",
      label: "Media & Deploy",
      icon: Sparkles,
      disabled: !file || isAnalyzing,
      tooltip: !file ? "Upload or pick a workflow in Step 1 to proceed" : undefined,
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
    <div className="flex h-screen w-full flex-col bg-[var(--ground)] text-[var(--ink)] overflow-hidden font-sans">
      {/* Top Studio Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-6 z-20">
        <div className="flex items-center gap-4">
          <Link
            href="/tools"
            className="flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Tools</span>
          </Link>
          <div className="h-4 w-px bg-[var(--line)]" />
          <div className="flex items-center gap-2.5">
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
                  PARAMETRIC PIPELINE BUILDER
                </span>
              </div>
              <h1 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                {currentDisplayName}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/tools/canvas"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            title="Open Interactive Visual Node Graph Canvas"
          >
            <Activity className="h-3 w-3" />
            <span>Node Canvas Mode</span>
          </Link>

          {parsedData && (
            <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>{parsedData.archetype}</span>
            </span>
          )}

          {step < 4 ? (
            <button
              type="button"
              disabled={step === 1 ? !file || isAnalyzing : exposedCount === 0}
              onClick={() => setStep((s) => (s + 1) as 2 | 3 | 4)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
            >
              <span>Next</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isDeploying || !file || exposedCount === 0}
              onClick={() => void handleDeploy()}
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.25)] disabled:opacity-40"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{isDeploying ? "Deploying…" : "Deploy Tool ⚡"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Stepper Tabs Bar */}
      <StudioStepperTabs
        steps={stepsList}
        activeStep={step}
        onStepChange={(newStep) => setStep(newStep as 1 | 2 | 3 | 4)}
        busy={isDeploying || isAnalyzing || isTesting}
        mode="wizard"
        ariaLabel="Studio builder steps"
      />

      {/* Error Callout */}
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

      {/* ComfyUI GUI Format Warning */}
      {formatWarning && (
        <div className="mx-6 mt-4 rounded-[5px] border border-amber-500/40 bg-amber-500/10 p-4 font-mono text-xs text-amber-300 space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2 font-bold text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span>ComfyUI GUI Graph Detected (workflow.json)</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            This JSON contains UI canvas data (`nodes` & `links`). To build a headless executable tool in SoloTensor, export the execution graph format:
          </p>
          <div className="rounded border border-amber-500/20 bg-black/40 p-2 text-[10px] space-y-1">
            <p>1. In ComfyUI, click the <strong>Settings (⚙️)</strong> gear icon.</p>
            <p>2. Enable <strong>&quot;Enable Dev mode Options&quot;</strong>.</p>
            <p>3. In the sidebar menu, click <strong>&quot;Save (API format)&quot;</strong>.</p>
          </div>
        </div>
      )}

      {/* Main Studio Body: Dual-Pane Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* STEP 1: SOURCE & WORKFLOW INGESTION */}
        {step === 1 && (
          <div className="flex flex-1 min-h-0 overflow-hidden animate-in fade-in duration-150">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Option A: Drop / Upload JSON Graph */}
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                    <FileCode2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                      Ingest ComfyUI API Graph
                    </h2>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      Upload any ComfyUI API JSON graph to auto-detect modality and expose parameters
                    </span>
                  </div>
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
                  if (dropped) void processJsonFile(dropped);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-[160px] cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed p-6 text-center transition ${
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
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                  <FileJson className="h-5 w-5" />
                </div>
                {file ? (
                  <div className="space-y-1">
                    <p className="font-mono text-xs font-bold text-[var(--accent)] truncate max-w-md">
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
                      Supports any exported API graph format (*.json)
                    </p>
                  </div>
                )}
              </div>

              {/* Parsing State */}
              {isAnalyzing && (
                <div className="flex items-center gap-3 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3.5 font-mono text-xs text-[var(--accent)] animate-pulse">
                  <Cpu className="h-4 w-4 animate-spin" />
                  <div>
                    <span className="font-bold">Analyzing ComfyUI Execution Graph…</span>
                    <p className="text-[10px] text-[var(--ink-soft)]">
                      Inspecting latents, conditioning, models, and sampling parameters.
                    </p>
                  </div>
                </div>
              )}

              {/* Auto-detected Pipeline Profile */}
              {parsedData && !isAnalyzing && (
                <div className="rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] p-4 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                      ✓ Pipeline Graph Verified & Profiled
                    </span>
                    <span className="font-mono text-[10px] font-bold text-[var(--ink)]">
                      {parsedData.node_count} Graph Nodes
                    </span>
                  </div>

                  <div className="rounded-[5px] border border-[var(--accent)]/20 bg-[var(--surface-raised)] p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[9px] font-bold uppercase text-[var(--ink-faint)] block">
                          ARCHETYPE
                        </span>
                        <h3 className="font-sans text-sm font-bold text-[var(--ink)] flex items-center gap-1.5">
                          <Zap className="h-4 w-4 text-[var(--accent)]" />
                          <span>{parsedData.archetype}</span>
                        </h3>
                      </div>
                      <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)] uppercase">
                        {mode}
                      </span>
                    </div>
                  </div>

                  {parsedData.detected_inputs && parsedData.detected_inputs.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-mono text-[9px] font-bold uppercase text-[var(--ink-faint)] block">
                        Detected Inputs & Conditions:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {parsedData.detected_inputs.map((sig, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[9px] text-[var(--ink-soft)]"
                          >
                            <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                            <span>{sig}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Option B: Starter Workflow Templates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Or Start from Curated Studio Templates
                  </h3>
                  <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                    Verified ComfyUI pipelines ready for immediate parametric configuration
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {STARTER_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="flex flex-col justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 hover:border-[var(--line-strong)] transition-all shadow-sm group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent)]">
                          {tmpl.badge}
                        </span>
                        <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">
                          {tmpl.mode}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-mono text-xs font-bold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                          {tmpl.name}
                        </h4>
                        <p className="mt-1 text-[11px] text-[var(--ink-faint)] leading-snug">
                          {tmpl.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {tmpl.highlightInputs.map((h, i) => (
                          <span
                            key={i}
                            className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.2 font-mono text-[8px] text-[var(--ink-faint)]"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                      >
                        Use This Template ⚡
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>

            {/* Right: Dual-Mode Live Preview Inspector */}
            <StudioInspectorPanel
              previewTab={previewTab}
              setPreviewTab={setPreviewTab}
              step={step}
              mode={mode}
              ratio={ratio}
              currentDisplayName={currentDisplayName}
              exposedCount={exposedCount}
              exposedControls={exposedControls}
              controls={controls}
              thumbnailPreview={thumbnailPreview}
              isVideoMode={isVideoMode}
              file={file}
              parsedData={parsedData}
            />
          </div>
        )}

        {/* STEP 2: PARAMETER STUDIO (FORM BUILDER) */}
        {step === 2 && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Configuration Inputs */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 border-r border-[var(--line)]">
              {/* Identity & Canvas */}
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Tool Identity & Canvas
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowModeOverride(!showModeOverride)}
                      className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)]"
                    >
                      <span>Mode: {mode}</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {showModeOverride && (
                      <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1 shadow-xl font-mono text-[10px]">
                        {MODES.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                              setMode(m.value);
                              setShowModeOverride(false);
                            }}
                            className={`flex w-full items-center justify-between rounded px-2 py-1 text-left ${
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

                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Pipeline Tool Name <span className="text-[var(--accent)]">*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cyberpunk Portrait Generator"
                    className="workspace-field h-8 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] focus:border-[var(--accent)] outline-none"
                  />
                </div>

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

              {/* Form Builder */}
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                  <div>
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      Parametric Form Builder
                    </h3>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      Toggle exposed user controls and customize display labels
                    </span>
                  </div>
                  <span className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink)]">
                    <span className="text-[var(--accent)]">{exposedCount}</span> / {controls.length} Exposed
                  </span>
                </div>

                {/* Batch Actions */}
                <div className="flex items-center justify-between font-mono text-[10px] pb-1">
                  <span className="text-[var(--ink-faint)]">Batch Toggles:</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleExposeAll}
                      className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    >
                      Expose All
                    </button>
                    <button
                      type="button"
                      onClick={handleExposePromptsOnly}
                      className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    >
                      Prompts Only
                    </button>
                    <button
                      type="button"
                      onClick={handleHideAll}
                      className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    >
                      Hide All
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {controls.map((control) => {
                    const isExposed = control.exposed !== false;
                    const badge = getControlKindBadge(control.kind);
                    const BadgeIcon = badge.icon;

                    return (
                      <div
                        key={control.id}
                        className={`rounded-[6px] border p-3.5 transition-all ${
                          isExposed
                            ? "border-[var(--line-strong)] bg-[var(--surface-sunken)]/80"
                            : "border-[var(--line)] bg-[var(--surface-sunken)]/20 opacity-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => handleControlToggleExposed(control.id)}
                            className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              isExposed
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                                : "border-[var(--line-strong)] bg-[var(--surface)] text-transparent"
                            }`}
                          >
                            <Check className="h-3 w-3 stroke-[3]" />
                          </button>

                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold border ${badge.className}`}
                                >
                                  <BadgeIcon className="h-3 w-3" />
                                  <span>{badge.label}</span>
                                </span>
                                <span className="font-mono text-[9px] text-[var(--ink-faint)] truncate max-w-[220px]">
                                  Node #{control.node_id} · {control.input_name}
                                </span>
                              </div>
                              <span className="font-mono text-[9px] font-bold">
                                {isExposed ? (
                                  <span className="text-[var(--accent)] flex items-center gap-1">
                                    <Eye className="h-3 w-3" />
                                    <span>Exposed</span>
                                  </span>
                                ) : (
                                  <span className="text-[var(--ink-faint)] flex items-center gap-1">
                                    <EyeOff className="h-3 w-3" />
                                    <span>Locked</span>
                                  </span>
                                )}
                              </span>
                            </div>

                            <input
                              value={control.label}
                              disabled={!isExposed}
                              onChange={(e) =>
                                handleControlLabelChange(control.id, e.target.value)
                              }
                              placeholder="Form Field Label"
                              className="workspace-field h-7 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 font-mono text-[11px] text-[var(--ink)] focus:border-[var(--accent)] outline-none disabled:opacity-50"
                            />

                            <div className="flex items-center gap-3 font-mono text-[9px] text-[var(--ink-faint)]">
                              <span>
                                Default: {String(control.default ?? control.value ?? "—")}
                              </span>
                              {control.numeric && (
                                <span>
                                  Range: [{control.min ?? control.minimum ?? "0"} …{" "}
                                  {control.max ?? control.maximum ?? "100"}]
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Dual-Mode Live Preview Inspector */}
            <StudioInspectorPanel
              previewTab={previewTab}
              setPreviewTab={setPreviewTab}
              step={step}
              mode={mode}
              ratio={ratio}
              currentDisplayName={currentDisplayName}
              exposedCount={exposedCount}
              exposedControls={exposedControls}
              controls={controls}
              thumbnailPreview={thumbnailPreview}
              isVideoMode={isVideoMode}
              file={file}
              parsedData={parsedData}
            />
          </div>
        )}

        {/* STEP 3: PLAYGROUND & TEST RUN (PHASE 3) */}
        {step === 3 && (
          <div className="flex flex-1 min-h-0 overflow-hidden animate-in fade-in duration-150">
            {/* Left: Interactive Playground Controller */}
            <div className="w-[420px] lg:w-[480px] shrink-0 overflow-y-auto p-6 space-y-5 border-r border-[var(--line)] bg-[var(--surface)]">
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      In-Studio Test Execution
                    </h3>
                  </div>
                  <span className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
                    Dry Run Mode
                  </span>
                </div>

                {/* Prompt Field */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold uppercase text-[var(--ink-soft)]">
                    Test Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={playgroundPrompt}
                    onChange={(e) => setPlaygroundPrompt(e.target.value)}
                    placeholder="Enter test prompt to run through ComfyUI graph…"
                    className="w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 font-mono text-xs text-[var(--ink)] focus:border-[var(--accent)] outline-none resize-none"
                  />
                </div>

                {/* Starter Image Picker if image-based */}
                {mode.includes("image") && (
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold uppercase text-[var(--ink-soft)]">
                      Reference Starter Image <span className="text-[var(--accent)]">*</span>
                    </label>
                    <div
                      onClick={() => starterImageInputRef.current?.click()}
                      className="cursor-pointer flex h-[90px] flex-col items-center justify-center rounded border border-dashed border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-center hover:border-[var(--accent)] transition"
                    >
                      <input
                        ref={starterImageInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setPlaygroundImage(f);
                        }}
                      />
                      {playgroundImagePreview ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={playgroundImagePreview}
                            alt="Reference"
                            className="h-14 w-14 rounded object-cover border border-[var(--line)]"
                          />
                          <div className="text-left font-mono text-[10px]">
                            <p className="font-bold text-[var(--ink)] truncate max-w-[180px]">
                              {playgroundImage?.name}
                            </p>
                            <span className="text-[var(--accent)]">Click to change</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 font-mono text-[10px] text-[var(--ink-faint)]">
                          <Upload className="h-4 w-4 mx-auto text-[var(--accent)]" />
                          <p>Upload reference test photo</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Configured Parameters for testing */}
                {exposedControls.length > 0 && (
                  <div className="space-y-2.5 pt-2 border-t border-[var(--line)]">
                    <span className="font-mono text-[9px] font-bold uppercase text-[var(--ink-faint)] block">
                      Live Parameter Knobs:
                    </span>
                    {exposedControls
                      .filter((c) => c.kind !== "prompt" && c.kind !== "image")
                      .slice(0, 4)
                      .map((c) => (
                        <div key={c.id} className="space-y-1">
                          <div className="flex justify-between font-mono text-[9px]">
                            <span className="text-[var(--ink-soft)] font-bold">{c.label}</span>
                            <span className="text-[var(--ink-faint)]">
                              {String(playgroundValues[c.id] ?? c.default ?? c.value)}
                            </span>
                          </div>
                          {c.numeric ? (
                            <input
                              type="range"
                              min={c.min ?? c.minimum ?? 0}
                              max={c.max ?? c.maximum ?? 100}
                              step={c.step ?? 1}
                              value={Number(playgroundValues[c.id] ?? c.default ?? c.value ?? 0)}
                              onChange={(e) =>
                                setPlaygroundValues((prev) => ({
                                  ...prev,
                                  [c.id]: parseFloat(e.target.value),
                                }))
                              }
                              className="w-full accent-[var(--accent)] cursor-pointer"
                            />
                          ) : (
                            <input
                              value={String(playgroundValues[c.id] ?? c.default ?? c.value ?? "")}
                              onChange={(e) =>
                                setPlaygroundValues((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              className="workspace-field h-6 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[10px]"
                            />
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {/* Run Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isTesting || (mode.includes("image") && !playgroundImage)}
                    onClick={() => void handleRunPlayground()}
                    className="w-full flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[var(--accent)] font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)] disabled:opacity-40"
                  >
                    {isTesting ? (
                      <>
                        <Cpu className="h-4 w-4 animate-spin" />
                        <span>Executing ComfyUI…</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        <span>Test Run Pipeline ⚡</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Live Execution Screen & Result Visualizer */}
            <div className="flex-1 bg-[var(--surface-sunken)] p-6 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4 max-w-3xl mx-auto w-full">
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-[var(--ink)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                    <span>Pipeline Output & Snapshot</span>
                  </div>
                  {testResult && (
                    <span className="font-mono text-[10px] text-[var(--accent)]">
                      Completed in {(testResult.elapsed_ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>

                {/* Generation Canvas Screen */}
                <div className="relative aspect-video w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-2xl flex items-center justify-center overflow-hidden">
                  {testResult && testResult.images?.[0] ? (
                    isVideoMode ? (
                      <video
                        src={testResult.images[0].url}
                        controls
                        autoPlay
                        loop
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <img
                        src={testResult.images[0].url}
                        alt="Test Output"
                        className="h-full w-full object-contain"
                      />
                    )
                  ) : isTesting ? (
                    <div className="flex flex-col items-center gap-3 p-6 text-center font-mono">
                      <Cpu className="h-8 w-8 text-[var(--accent)] animate-spin" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-[var(--ink)]">
                          {testProgress?.type === "executing"
                            ? "Sampling Latent Diffusion…"
                            : testProgress?.type === "progress"
                              ? `Progress: Step ${testProgress.value} / ${testProgress.max}`
                              : "Queued in Local ComfyUI Instance…"}
                        </p>
                        <p className="text-[10px] text-[var(--ink-faint)]">
                          Executing parametric graph directly on local hardware
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-center p-6 font-mono text-[11px] text-[var(--ink-faint)]">
                      <Play className="h-8 w-8 text-[var(--accent)] opacity-40 mb-1" />
                      <p className="font-bold text-[var(--ink-soft)]">Dry-Run Playground Ready</p>
                      <p className="text-[10px] max-w-sm">
                        Click &quot;Test Run Pipeline ⚡&quot; on the left to verify your ComfyUI models, latents, and exposed parameters before deploying.
                      </p>
                    </div>
                  )}
                </div>

                {/* 1-Click Snapshot Action */}
                {testResult && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-4">
                    <div className="space-y-0.5 font-mono">
                      <span className="text-xs font-bold text-[var(--accent)] block">
                        Pipeline Execution Succeeded!
                      </span>
                      <p className="text-[10px] text-[var(--ink-soft)]">
                        Capture this generated output directly as your tool&apos;s catalog cover image.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSnapshotToThumbnail()}
                      className={`inline-flex items-center gap-2 rounded-[5px] px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                        snapshotSuccess || thumbnail
                          ? "bg-emerald-500 text-black shadow-md"
                          : "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
                      }`}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>
                        {snapshotSuccess
                          ? "✓ Attached as Cover!"
                          : thumbnail
                            ? "✓ Cover Attached (Click to Replace)"
                            : "Use as Tool Cover 📸"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: SHOWCASE MEDIA & FINAL DEPLOY */}
        {step === 4 && (
          <div className="flex flex-1 min-h-0 overflow-hidden animate-in fade-in duration-150">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <ImageIcon className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      Showcase Media & Pre-Flight Verification
                    </h3>
                    <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                      Review tool configuration and catalog cover before final deployment
                    </p>
                  </div>
                </div>
              </div>

              {/* Cover Art Upload / Snapshot */}
              <div>
                <label className="mb-1.5 block font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
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
                  className={`flex h-[140px] cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed p-4 text-center transition ${
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
                  {thumbnailPreview ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={thumbnailPreview}
                        alt="Thumbnail"
                        className="h-20 w-32 rounded object-cover border border-[var(--line-strong)] shadow-md"
                      />
                      <div className="text-left font-mono text-xs space-y-1">
                        <p className="font-bold text-[var(--accent)] truncate max-w-sm">
                          {thumbnail?.name}
                        </p>
                        <p className="text-[10px] text-[var(--ink-faint)]">
                          Click or drag to replace cover image
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 font-mono">
                      <Upload className="h-5 w-5 mx-auto text-[var(--accent)] mb-1" />
                      <p className="text-xs font-bold text-[var(--ink)]">
                        Upload or Capture Tool Thumbnail
                      </p>
                      <p className="text-[10px] text-[var(--ink-faint)]">
                        PNG, JPG, or WebP 16:10 catalog preview card
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pre-Flight Checklist */}
              <div className="rounded-[6px] border border-[var(--line)] bg-[var(--surface-sunken)] p-4 font-mono text-[11px] space-y-2.5">
                <span className="font-bold text-[10px] uppercase tracking-wider text-[var(--accent)] block pb-1 border-b border-[var(--line)]">
                  ✓ Pre-Flight Studio Checklist
                </span>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Workflow Graph:</span>
                  <span className="font-bold text-[var(--ink)] truncate max-w-md">
                    {file?.name || "Verified Graph"} ({parsedData?.node_count} nodes)
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Archetype:</span>
                  <span className="font-bold text-[var(--accent)]">
                    {parsedData?.archetype}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Modality:</span>
                  <span className="font-bold text-[var(--accent)] uppercase">{mode}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Exposed Parameters:</span>
                  <span className="font-semibold text-[var(--ink)]">
                    {exposedCount} of {controls.length} controls configured
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Default Canvas Ratio:</span>
                  <span className="font-semibold text-[var(--ink)]">{ratio}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Playground Verified:</span>
                  <span className="font-semibold text-[var(--accent)]">
                    {testResult ? "✓ Tested Successfully in ComfyUI" : "Not tested (optional)"}
                  </span>
                </div>
              </div>

              {/* Deploy Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isDeploying || !file || exposedCount === 0}
                  onClick={() => void handleDeploy()}
                  className="w-full flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[var(--accent)] font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_16px_rgba(213,240,111,0.25)] disabled:opacity-40"
                >
                  <Zap className="h-4 w-4" />
                  <span>
                    {isDeploying ? "Deploying Tool Pipeline…" : "Deploy Tool to Studio Catalog ⚡"}
                  </span>
                </button>
              </div>
            </div>
            </div>

            {/* Right: Dual-Mode Live Preview Inspector */}
            <StudioInspectorPanel
              previewTab={previewTab}
              setPreviewTab={setPreviewTab}
              step={step}
              mode={mode}
              ratio={ratio}
              currentDisplayName={currentDisplayName}
              exposedCount={exposedCount}
              exposedControls={exposedControls}
              controls={controls}
              thumbnailPreview={thumbnailPreview}
              isVideoMode={isVideoMode}
              file={file}
              parsedData={parsedData}
            />
          </div>
        )}
      </div>
    </div>
  );
}
