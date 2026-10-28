"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Cpu,
  ExternalLink,
  FileCode2,
  Loader2,
  Play,
  Settings2,
  Upload,
  Zap,
} from "lucide-react";
import {
  ApiError,
  api,
  uuid,
  type ToolAspectRatio,
  type ToolControl,
  type ToolMode,
  type ToolParseResponse,
  type ToolRunResult,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import VisualNodeCanvas from "@/components/VisualNodeCanvas";
import CustomSelect from "@/components/CustomSelect";
import {
  STARTER_TEMPLATES,
  type StarterWorkflowTemplate,
} from "@/lib/starter-workflows";

const MODE_LABELS: Record<ToolMode, string> = {
  "text-to-image": "Text to Image",
  "image-to-image": "Image to Image",
  "text-to-video": "Text to Video",
  "image-to-video": "Image to Video",
};

const MODE_OPTIONS = (Object.keys(MODE_LABELS) as ToolMode[]).map((value) => ({
  value,
  label: MODE_LABELS[value],
}));

const RATIO_OPTIONS: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];

export default function ToolCanvasPage() {
  const router = useRouter();
  const { isAuthenticated, openAuthModal } = useAuth();

  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("Visual Node Studio Tool");
  const [mode, setMode] = useState<ToolMode>("text-to-image");
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [controls, setControls] = useState<ToolControl[]>([]);
  const [parsedData, setParsedData] = useState<ToolParseResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-edit round trip
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [isLoadingTool, setIsLoadingTool] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Post-save test run
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ToolRunResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Hydrate on mount. Read window.location.search directly — the repo avoids
  // useSearchParams (Suspense boundary required at build time).
  // Precedence: ?from=<tool_id> wins outright (a re-edit must not be clobbered
  // by stale handoff state); then a workflow dropped on /tools; then a starter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const toolId = params.get("from");
    if (toolId) {
      let cancelled = false;
      setIsLoadingTool(true);
      api
        .getToolForEdit(toolId)
        .then((res) => {
          if (cancelled) return;
          setWorkflow(res.workflow_api);
          setControls(res.controls.map((c) => ({ ...c, exposed: c.exposed !== false })));
          setName(res.name);
          setMode(res.mode);
          setRatio(res.default_aspect_ratio);
          setEditingToolId(res.tool_id);
        })
        .catch((cause) => {
          if (cancelled) return;
          const status = cause instanceof ApiError ? cause.status : 0;
          if (status === 401 || status === 403) setLoadError("You do not own this tool.");
          else if (status === 404) setLoadError("Tool not found.");
          else setLoadError(cause instanceof Error ? cause.message : "Could not load tool.");
        })
        .finally(() => {
          if (!cancelled) setIsLoadingTool(false);
        });
      return () => {
        cancelled = true;
      };
    }

    // 1. Workflow dropped / browsed on /tools (consumed, never replayed).
    try {
      const savedJson = sessionStorage.getItem("st_tool_upload_json");
      const savedFilename = sessionStorage.getItem("st_tool_upload_filename");
      if (savedJson && savedFilename) {
        sessionStorage.removeItem("st_tool_upload_json");
        sessionStorage.removeItem("st_tool_upload_filename");
        void processWorkflowFile(
          new File([savedJson], savedFilename, { type: "application/json" }),
        );
        return;
      }
    } catch (e) {
      console.error("Failed to restore workflow from session:", e);
    }

    // 2. Starter kit from ?template= or sessionStorage.
    try {
      const templateId = params.get("template") ?? sessionStorage.getItem("st_tool_starter_template");
      if (templateId) {
        sessionStorage.removeItem("st_tool_starter_template");
        const matched = STARTER_TEMPLATES.find((t) => t.id === templateId);
        if (matched) handleApplyTemplate(matched);
      }
    } catch (e) {
      console.error("Failed to load starter template:", e);
    }
  }, []);

  // "Saved" is stale the moment the user edits anything again.
  useEffect(() => {
    setSavedAt(null);
  }, [workflow, controls, name, mode, ratio]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isSettingsOpen]);

  // Ingest workflow file
  const processWorkflowFile = async (targetFile: File) => {
    if (!targetFile.name.toLowerCase().endsWith(".json")) {
      setError("Please upload a valid ComfyUI JSON file.");
      return;
    }
    setError(null);
    setIsAnalyzing(true);

    try {
      const text = await targetFile.text();
      const rawJson = JSON.parse(text) as Record<string, unknown>;
      setWorkflow(rawJson);

      const defaultName = targetFile.name
        .replace(/\.json$/i, "")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setName(defaultName);

      const res = await api.parseTool(targetFile, defaultName);
      setParsedData(res);
      if (res.detected_mode) setMode(res.detected_mode);
      setControls(res.controls.map((c) => ({ ...c, exposed: c.exposed !== false })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse ComfyUI graph.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyTemplate = (template: StarterWorkflowTemplate) => {
    const jsonStr = JSON.stringify(template.workflow, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const tmplFile = new File([blob], `${template.id}.json`, { type: "application/json" });
    setName(template.name);
    setMode(template.mode);
    setWorkflow(template.workflow);
    void processWorkflowFile(tmplFile);
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      if (editingToolId) {
        setError("You do not own this tool.");
      } else {
        openAuthModal("create_tool");
      }
      return;
    }
    if (!workflow) {
      setError("Workflow file is required to deploy.");
      return;
    }
    const exposedControls = controls.filter((c) => c.exposed !== false);
    if (controls.length > 0 && exposedControls.length === 0) {
      setError("Please expose at least one node parameter.");
      return;
    }

    setIsDeploying(true);
    setError(null);
    setTestError(null);
    try {
      // Serialize the current graph — the canvas state is the source of truth.
      const graphFile = new File([JSON.stringify(workflow)], "workflow_api.json", {
        type: "application/json",
      });
      const exposed = exposedControls.length > 0 ? exposedControls : undefined;

      if (editingToolId) {
        await api.updateTool(editingToolId, graphFile, name, mode, ratio, thumbnail ?? undefined, exposed);
        setSavedAt(new Date().toLocaleTimeString());
      } else {
        const tool = await api.createTool(graphFile, name, mode, ratio, thumbnail ?? undefined, exposed);
        router.push(`/tools/${tool.tool_id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : editingToolId ? "Failed to update tool." : "Failed to deploy tool.");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleTestRun = async () => {
    if (!editingToolId) return;
    setIsTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const exposed = controls.filter((c) => c.exposed !== false);
      const promptControl = exposed.find((c) => c.kind === "prompt");
      const values: Record<string, string | number | boolean> = {};
      for (const c of exposed) {
        if (c.kind === "prompt") continue;
        const v = c.default ?? c.value;
        if (v !== undefined) values[c.id] = v;
      }
      const result = await api.runTool(
        editingToolId,
        promptControl ? String(promptControl.default ?? promptControl.value ?? "") : "",
        ratio,
        undefined,
        values,
        {},
        { clientId: uuid(), saveToGallery: false },
      );
      setTestResult(result);
      if (result.status === "failed") setTestError(result.error || "Run failed.");
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Test run failed.");
    } finally {
      setIsTesting(false);
    }
  };

  // Snapshot the first output as the next save's cover.
  const handleUseOutputAsCover = async () => {
    const mediaUrl = testResult?.images?.[0]?.url;
    if (!mediaUrl) return;
    setCoverBusy(true);
    try {
      const res = await fetch(mediaUrl);
      const blob = await res.blob();
      const ext = blob.type.includes("webp") ? ".webp" : blob.type.includes("jpeg") ? ".jpg" : ".png";
      setThumbnail(
        new File([blob], `cover_snapshot_${Date.now()}${ext}`, { type: blob.type || "image/png" }),
      );
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Could not capture cover.");
    } finally {
      setCoverBusy(false);
    }
  };

  const exposedCount = controls.filter((c) => c.exposed !== false).length;

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--ground)] text-[var(--ink)] overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-6 z-30">
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
                  NODE CANVAS
                </span>
                <span className="font-mono text-[9px] text-[var(--line-strong)]">/</span>
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">
                  {editingToolId ? "EDITING SAVED TOOL" : "VISUAL FUNCTION CONTROLLER"}
                </span>
              </div>
              <h1 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                {name}
              </h1>
            </div>
          </div>
        </div>

        {/* Tool settings & save */}
        <div className="flex items-center gap-3">
          {parsedData && (
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>{parsedData.archetype}</span>
            </span>
          )}

          {/* Tool Settings — the retired wizard's identity step */}
          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              onClick={() => setIsSettingsOpen((v) => !v)}
              aria-expanded={isSettingsOpen}
              aria-haspopup="dialog"
              aria-label="Tool settings"
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-3 font-mono text-[11px] font-bold text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>Settings</span>
            </button>
            {isSettingsOpen && (
              <div
                role="dialog"
                aria-label="Tool settings"
                className="absolute right-0 top-10 z-40 w-72 space-y-3 rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 shadow-xl"
              >
                <div className="space-y-1">
                  <label className="block font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
                    Tool name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] outline-none focus-visible:border-[var(--accent)]"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
                    Mode
                  </span>
                  <CustomSelect
                    value={mode}
                    onChange={(v) => setMode(v as ToolMode)}
                    options={MODE_OPTIONS}
                    ariaLabel="Tool mode"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
                    Aspect ratio
                  </span>
                  <CustomSelect
                    value={ratio}
                    onChange={(v) => setRatio(v as ToolAspectRatio)}
                    options={RATIO_OPTIONS}
                    ariaLabel="Default aspect ratio"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={isDeploying || !workflow || exposedCount === 0}
            onClick={() => void handleSave()}
            className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.25)] disabled:opacity-40"
          >
            {isDeploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            <span>
              {isDeploying
                ? editingToolId
                  ? "Updating…"
                  : "Deploying…"
                : editingToolId
                  ? "Update Tool"
                  : "Deploy Tool ⚡"}
            </span>
          </button>
        </div>
      </header>

      {/* Error Callout */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 flex items-center justify-between rounded-[5px] border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 font-mono text-xs text-[var(--danger)] z-30"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Saved bar: View tool, test run, cover capture */}
      {savedAt && editingToolId && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-2 z-30">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
            <Check className="h-3.5 w-3.5" />
            Saved
            <span className="font-normal text-[var(--ink-faint)]">{savedAt}</span>
          </span>
          <Link
            href={`/tools/${editingToolId}`}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:text-[var(--accent)]"
          >
            View tool <ExternalLink className="h-3 w-3" />
          </Link>
          <button
            type="button"
            disabled={isTesting}
            onClick={() => void handleTestRun()}
            className="inline-flex h-6 items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            <span>{isTesting ? "Running…" : "Test run"}</span>
          </button>
          {testError && (
            <span role="alert" className="font-mono text-[10px] text-[var(--danger)]">
              {testError}
            </span>
          )}
          {testResult?.images?.[0] && (
            <div className="flex items-center gap-2">
              {testResult.images[0].kind === "video" ? (
                <a
                  href={testResult.images[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-[var(--accent)] hover:underline"
                >
                  Open output
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={testResult.images[0].url}
                  alt="Test run output"
                  className="h-8 w-8 rounded border border-[var(--line)] object-cover"
                />
              )}
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => void handleUseOutputAsCover()}
                className="font-mono text-[10px] text-[var(--ink-soft)] underline hover:text-[var(--accent)] disabled:opacity-40"
              >
                {thumbnail ? "Cover set" : "Use as cover"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body: Visual Canvas or Ingestion Empty State */}
      <div className="flex-1 min-h-0 relative">
        {isLoadingTool ? (
          <div className="flex h-full w-full items-center justify-center font-mono text-xs text-[var(--ink-faint)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--accent)]" />
            Loading tool…
          </div>
        ) : workflow ? (
          <VisualNodeCanvas
            workflow={workflow}
            controls={controls}
            onControlsChange={setControls}
            onWorkflowChange={setWorkflow}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 overflow-y-auto">
            <div className="max-w-2xl w-full space-y-6">
              {loadError && (
                <div
                  role="alert"
                  className="rounded-[5px] border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-center font-mono text-xs text-[var(--danger)]"
                >
                  {loadError}
                </div>
              )}

              {/* Drop / Ingest Card */}
              <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-xl space-y-4 text-center">
                <div className="h-12 w-12 rounded-[8px] border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--accent)] flex items-center justify-center mx-auto">
                  <FileCode2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--ink)]">
                    Load Graph into Visual Node Canvas
                  </h2>
                  <p className="mt-1 font-mono text-xs text-[var(--ink-faint)]">
                    Upload any ComfyUI API workflow JSON to inspect nodes, links, and controllers
                  </p>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-[8px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] p-6 hover:border-[var(--accent)] transition-all font-mono text-xs"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void processWorkflowFile(f);
                    }}
                  />
                  <Upload className="h-6 w-6 text-[var(--accent)] mx-auto mb-2" />
                  <p className="font-bold text-[var(--ink)]">Click to Browse or Drop ComfyUI JSON</p>
                  <p className="text-[10px] text-[var(--ink-faint)] mt-0.5">Supports any *.json workflow</p>
                </div>
              </div>

              {/* Starter Templates */}
              <div className="space-y-3">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)] block text-center">
                  Or launch a verified graph:
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {STARTER_TEMPLATES.slice(0, 4).map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleApplyTemplate(tmpl)}
                      className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-left hover:border-[var(--accent)] transition-all group font-mono"
                    >
                      <div className="flex justify-between text-[9px] font-bold text-[var(--accent)] uppercase">
                        <span>{tmpl.badge}</span>
                        <span className="text-[var(--ink-faint)]">{tmpl.nodeCount} nodes</span>
                      </div>
                      <h4 className="text-xs font-bold text-[var(--ink)] mt-1 group-hover:text-[var(--accent)] transition-colors">
                        {tmpl.name}
                      </h4>
                      <p className="text-[10px] text-[var(--ink-faint)] truncate mt-0.5">
                        {tmpl.tagline}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
