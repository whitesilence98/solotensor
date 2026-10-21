"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Cpu,
  FileCode2,
  FileJson,
  Layout,
  Play,
  RotateCcw,
  Sparkles,
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
  type ToolRunResult,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import VisualNodeCanvas from "@/components/VisualNodeCanvas";
import {
  STARTER_TEMPLATES,
  detectComfyUIFormat,
  type StarterWorkflowTemplate,
} from "@/lib/starter-workflows";

export default function ToolCanvasPage() {
  const router = useRouter();
  const { isAuthenticated, openAuthModal } = useAuth();

  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("Visual Node Studio Tool");
  const [mode, setMode] = useState<ToolMode>("text-to-image");
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [controls, setControls] = useState<ToolControl[]>([]);
  const [parsedData, setParsedData] = useState<ToolParseResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ingest workflow file
  const processWorkflowFile = async (targetFile: File) => {
    if (!targetFile.name.toLowerCase().endsWith(".json")) {
      setError("Please upload a valid ComfyUI JSON file.");
      return;
    }
    setError(null);
    setFile(targetFile);
    setIsAnalyzing(true);

    try {
      const text = await targetFile.text();
      const rawJson = JSON.parse(text) as Record<string, unknown>;
      setWorkflow(rawJson);

      const defaultName =
        targetFile.name
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

  const handleDeploy = async () => {
    if (!isAuthenticated) {
      openAuthModal("create_tool");
      return;
    }
    if (!file) {
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
    try {
      const tool = await api.createTool(
        file,
        name,
        mode,
        ratio,
        undefined,
        controls.length > 0 ? exposedControls : undefined
      );
      router.push(`/tools/${tool.tool_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deploy tool.");
      setIsDeploying(false);
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
                  VISUAL FUNCTION CONTROLLER
                </span>
              </div>
              <h1 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                {name}
              </h1>
            </div>
          </div>
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher to Form Studio */}
          <Link
            href="/tools/create"
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-mono text-[11px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Layout className="h-3.5 w-3.5" />
            <span>Form Studio Mode</span>
          </Link>

          {parsedData && (
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>{parsedData.archetype}</span>
            </span>
          )}

          <button
            type="button"
            disabled={isDeploying || !workflow || exposedCount === 0}
            onClick={() => void handleDeploy()}
            className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.25)] disabled:opacity-40"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{isDeploying ? "Deploying…" : "Deploy Tool ⚡"}</span>
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

      {/* Body: Visual Canvas or Ingestion Empty State */}
      <div className="flex-1 min-h-0 relative">
        {workflow ? (
          <VisualNodeCanvas
            workflow={workflow}
            controls={controls}
            onControlsChange={setControls}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 overflow-y-auto">
            <div className="max-w-2xl w-full space-y-6">
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
