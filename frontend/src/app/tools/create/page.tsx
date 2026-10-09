"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ArrowLeft, FileImage, FileJson, Plus, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ToolAspectRatio, type ToolMode } from "@/lib/api";

const modes: { value: ToolMode; label: string; description: string }[] = [
  { value: "text-to-image", label: "Text → Image", description: "Prompt-driven image workflow" },
  { value: "image-to-image", label: "Image → Image", description: "Workflow with an input image" },
  { value: "text-to-video", label: "Text → Video", description: "Prompt-driven video workflow" },
  { value: "image-to-video", label: "Image → Video", description: "Workflow with an input image" },
];
const ratios: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];
const field = "workspace-field w-full px-3 py-3 text-sm outline-none transition duration-200 focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-50";

export default function CreateToolPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbnailRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ToolMode>("text-to-image");
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next || !next.name.toLowerCase().endsWith(".json")) return setError("Choose a workflow_api.json file.");
    setError(null); setFile(next); event.target.value = "";
  };
  const chooseThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next || !["image/png", "image/jpeg", "image/webp"].includes(next.type)) return setError("Choose a PNG, JPEG, or WebP thumbnail.");
    setError(null); setThumbnail(next); event.target.value = "";
  };
  const submit = async () => {
    if (!file) return setError("Workflow JSON is required.");
    setBusy(true); setError(null);
    try { const tool = await api.createTool(file, name.trim() || "Untitled tool", mode, ratio, thumbnail ?? undefined); router.push(`/tools/${tool.tool_id}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create tool."); }
    finally { setBusy(false); }
  };

  return (
    <main id="main-content" className="workspace-scroll h-full min-h-0 bg-[var(--ground)] px-4 py-6 pb-28 md:px-8 md:py-10 md:pb-10">
      <div className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb">
          <Link href="/tools" className="workspace-action-quiet mb-5 gap-2 py-1 text-xs">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to AI Tool Studio
          </Link>
        </nav>
        <header className="mb-8 border-b border-[var(--line)] pb-6">
          <p className="workspace-kicker mb-3">AI Tool Studio / New tool</p>
          <h1 className="workspace-title">Create a tool</h1>
          <p className="workspace-copy mt-3">Expose safe workflow controls. Models, samplers, and workflow internals stay server-owned.</p>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="workspace-bezel space-y-6 p-1" aria-busy={busy}>
          <div className="workspace-core space-y-6 p-5 md:p-7">
          <label className="block" htmlFor="tool-name">
            <span className="mb-2 block text-[11px] font-bold text-[var(--ink-soft)]">Tool name <span className="font-normal text-[var(--ink-faint)]">(optional)</span></span>
            <input id="tool-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} maxLength={120} placeholder="Portrait maker" className={field} />
          </label>
          <div>
            <span className="mb-2 block text-[11px] font-bold text-[var(--ink-soft)]">Workflow JSON <span className="text-[var(--accent)]">(required)</span></span>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center border border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)] px-6 py-10 text-center transition duration-200 hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <input ref={inputRef} type="file" accept=".json,application/json" onChange={choose} className="sr-only" aria-label="Choose workflow JSON file" />
              <Upload className="mb-3 h-6 w-6 text-[var(--accent)]" />
              <span className="text-sm text-[var(--ink)]">{file?.name ?? "Choose workflow_api.json"}</span>
              <span className="mt-1 text-xs text-[var(--ink-faint)]">ComfyUI API-format workflow only</span>
            </button>
            {file && (
              <div className="mt-2 flex items-center justify-between border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--ink-soft)]">
                <span className="truncate">{file.name}</span>
                <button type="button" disabled={busy} onClick={() => setFile(null)} aria-label="Remove workflow file" className="p-1 hover:text-[var(--danger)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div>
            <span className="mb-2 block text-[11px] font-bold text-[var(--ink-soft)]">
              Tool thumbnail <span className="font-normal normal-case tracking-normal text-[var(--ink-faint)]">(optional)</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => thumbnailRef.current?.click()}
              className="flex w-full items-center gap-3 border border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)] px-4 py-5 text-left transition duration-200 hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <input ref={thumbnailRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseThumbnail} className="sr-only" aria-label="Choose thumbnail image" />
              <FileImage className="h-5 w-5 text-[var(--accent)]" />
              <span className="truncate text-sm text-[var(--ink)]">{thumbnail?.name ?? "Choose thumbnail image"}</span>
            </button>
            {thumbnail && (
              <button type="button" disabled={busy} onClick={() => setThumbnail(null)} className="mt-2 flex items-center gap-1 text-xs text-[var(--ink-soft)] hover:text-[var(--danger)]">
                <X className="h-3.5 w-3.5" /> Remove thumbnail
              </button>
            )}
          </div>
          <fieldset>
            <legend className="mb-2 block text-[11px] font-bold text-[var(--ink-soft)]">Tool mode</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {modes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={busy}
                  aria-pressed={mode === item.value}
                  onClick={() => setMode(item.value)}
                  className={`border px-3 py-3 text-left transition duration-200 disabled:opacity-50 ${mode === item.value ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--ink)]" : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--line-strong)]"}`}
                >
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs text-[var(--ink-faint)]">{item.description}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 block text-[11px] font-bold text-[var(--ink-soft)]">Default aspect ratio</legend>
            <div className="flex flex-wrap gap-2">
              {ratios.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={busy}
                  aria-pressed={ratio === item}
                  onClick={() => setRatio(item)}
                  className={`border px-4 py-2 text-sm font-medium transition duration-200 disabled:opacity-50 ${ratio === item ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--line-strong)]"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>
          {error && (
            <div id="create-tool-error" role="alert" className="flex gap-2 border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-sm text-[var(--danger)]">
              <FileJson className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !file}
            className="workspace-action-primary flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            aria-busy={busy}
            aria-describedby={error ? "create-tool-error" : undefined}
          >
            {busy ? "Creating…" : <><Plus className="h-4 w-4" aria-hidden="true" /> Create tool</>}
          </button>
          <p className="sr-only" role="status" aria-live="polite">{busy ? "Creating tool" : ""}</p>
          </div>
        </form>
      </div>
    </main>
  );
}
