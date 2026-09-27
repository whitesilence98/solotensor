"use client";

import { ChangeEvent, useRef, useState } from "react";
import { FileImage, FileJson, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, type ToolAspectRatio, type ToolMode } from "@/lib/api";

const modes: { value: ToolMode; label: string }[] = [
  { value: "text-to-image", label: "Text → Image" },
  { value: "image-to-image", label: "Image → Image" },
  { value: "text-to-video", label: "Text → Video" },
  { value: "image-to-video", label: "Image → Video" },
];
const ratios: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];

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
    setError(null);
    setFile(next);
  };
  const chooseThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next || !["image/png", "image/jpeg", "image/webp"].includes(next.type)) return setError("Choose a PNG, JPEG, or WebP thumbnail.");
    setError(null);
    setThumbnail(next);
  };
  const submit = async () => {
    if (!file) return setError("Workflow JSON is required.");
    setBusy(true); setError(null);
    try {
      const tool = await api.createTool(file, name.trim() || "Untitled tool", mode, ratio, thumbnail ?? undefined);
      router.push(`/tools/${tool.tool_id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create tool.");
    } finally { setBusy(false); }
  };

  return <main className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-10"><div className="mx-auto max-w-3xl"><header className="mb-8 border-b border-[#292d28] pb-6"><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#d5f06f]">AI Tool Studio / New tool</p><h1 className="text-3xl font-semibold text-[#f2f0e9] md:text-5xl">Create a tool</h1><p className="mt-3 text-sm text-[#aaa8a1]">Set the public experience. Models, samplers, seeds, and workflow internals stay server-owned.</p></header>
    <section className="space-y-6 rounded-2xl border border-[#292d28] bg-[#111311] p-5 md:p-7">
      <label className="block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Tool name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Portrait maker" className="w-full rounded-lg border border-[#3a4038] bg-[#0b0c0b] px-3 py-3 text-sm text-[#f2f0e9] outline-none focus:border-[#d5f06f]" /></label>
      <div><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Workflow JSON</span><button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center rounded-xl border border-dashed border-[#3a4038] bg-[#0b0c0b] px-6 py-10 text-center hover:border-[#d5f06f]"><input ref={inputRef} type="file" accept=".json,application/json" onChange={choose} className="sr-only" /><Upload className="mb-3 h-6 w-6 text-[#d5f06f]" /><span className="text-sm text-[#f2f0e9]">{file?.name ?? "Choose workflow_api.json"}</span><span className="mt-1 text-xs text-[#6f716d]">API-format workflow only</span></button>{file && <button type="button" onClick={() => setFile(null)} className="mt-2 flex items-center gap-1 text-xs text-[#aaa8a1]"><X className="h-3.5 w-3.5" /> Remove file</button>}</div>
      <div><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Tool thumbnail <span className="font-normal normal-case tracking-normal text-[#6f716d]">(optional)</span></span><button type="button" onClick={() => thumbnailRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[#3a4038] bg-[#0b0c0b] px-4 py-5 text-left hover:border-[#d5f06f]"><input ref={thumbnailRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseThumbnail} className="sr-only" /><FileImage className="h-5 w-5 text-[#d5f06f]" /><span className="text-sm text-[#f2f0e9]">{thumbnail?.name ?? "Choose thumbnail image"}</span></button>{thumbnail && <button type="button" onClick={() => setThumbnail(null)} className="mt-2 flex items-center gap-1 text-xs text-[#aaa8a1]"><X className="h-3.5 w-3.5" /> Remove thumbnail</button>}</div>
      <div><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Tool mode</span><div className="grid gap-2 sm:grid-cols-2">{modes.map((item) => <button key={item.value} type="button" onClick={() => setMode(item.value)} className={`rounded-lg border px-3 py-3 text-left text-sm ${mode === item.value ? "border-[#d5f06f] bg-[#20231f] text-[#f2f0e9]" : "border-[#3a4038] text-[#aaa8a1]"}`}>{item.label}</button>)}</div></div>
      <div><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Default aspect ratio</span><div className="flex flex-wrap gap-2">{ratios.map((item) => <button key={item} type="button" onClick={() => setRatio(item)} className={`rounded-full border px-4 py-2 text-sm ${ratio === item ? "border-[#d5f06f] bg-[#d5f06f] text-[#171b08]" : "border-[#3a4038] text-[#aaa8a1]"}`}>{item}</button>)}</div></div>
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-[#6d332e] bg-[#241412] p-3 text-sm text-[#ef8c79]"><FileJson className="h-4 w-4 shrink-0" />{error}</div>}
      <button type="button" onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#d5f06f] px-4 py-3 text-sm font-bold text-[#171b08] disabled:opacity-50">{busy ? "Creating…" : <><Plus className="h-4 w-4" /> Create tool</>}</button>
    </section>
  </div></main>;
}
