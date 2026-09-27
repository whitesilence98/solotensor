"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { api, type ToolAspectRatio, type ToolDetail, type ToolRunResult } from "@/lib/api";

const ratios: ToolAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "21:9"];
const labels = { "text-to-image": "Text → Image", "image-to-image": "Image → Image", "text-to-video": "Text → Video", "image-to-video": "Image → Video" };

export default function ToolDetailPage() {
  const params = useParams<{ tool_id: string }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<ToolAspectRatio>("1:1");
  const [image, setImage] = useState<File | undefined>();
  const [result, setResult] = useState<ToolRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.getTool(params.tool_id).then((value) => { setTool(value); setRatio(value.default_aspect_ratio); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load tool.")); }, [params.tool_id]);
  const run = async () => {
    if (!tool) return;
    setBusy(true); setError(null); setResult(null);
    try { setResult(await api.runTool(tool.tool_id, prompt, ratio, image)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not run tool."); } finally { setBusy(false); }
  };
  if (!tool && !error) return <main className="p-8 text-sm text-[#aaa8a1]">Loading tool…</main>;
  return <main className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-10"><div className="mx-auto max-w-3xl"><Link href="/tools" className="mb-8 inline-flex items-center gap-2 text-xs text-[#aaa8a1] hover:text-[#d5f06f]"><ArrowLeft className="h-4 w-4" /> All tools</Link>{error && !tool ? <div role="alert" className="rounded-xl border border-[#6d332e] bg-[#241412] p-4 text-sm text-[#ef8c79]">{error}</div> : tool && <><header className="mb-8 border-b border-[#292d28] pb-6">{tool.thumbnail_url && <img src={tool.thumbnail_url} alt="" className="mb-6 aspect-[16/7] w-full rounded-xl object-cover" />}<p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#d5f06f]">{labels[tool.mode]} · {tool.output_kind}</p><h1 className="text-3xl font-semibold text-[#f2f0e9] md:text-5xl">{tool.name}</h1><p className="mt-3 text-sm text-[#aaa8a1]">Choose the creative direction. Internal execution settings are locked.</p></header><section className="space-y-6 rounded-2xl border border-[#292d28] bg-[#111311] p-5 md:p-7">{tool.has_prompt && <label className="block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Prompt</span><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="Describe the result…" className="w-full resize-y rounded-lg border border-[#3a4038] bg-[#0b0c0b] px-3 py-3 text-sm leading-6 text-[#f2f0e9] outline-none focus:border-[#d5f06f]" /></label>}{tool.requires_image && <div><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Input image</span><button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[#3a4038] bg-[#0b0c0b] px-4 py-4 text-left text-sm text-[#aaa8a1] hover:border-[#d5f06f]"><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => setImage(e.target.files?.[0])} className="sr-only" /><Upload className="h-5 w-5 text-[#d5f06f]" />{image?.name ?? "Choose source image"}</button></div>}<div><span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#aaa8a1]">Aspect ratio</span><div className="flex flex-wrap gap-2">{tool.supported_aspect_ratios.filter((item) => ratios.includes(item)).map((item) => <button key={item} type="button" onClick={() => setRatio(item)} className={`rounded-full border px-4 py-2 text-sm ${ratio === item ? "border-[#d5f06f] bg-[#d5f06f] text-[#171b08]" : "border-[#3a4038] text-[#aaa8a1]"}`}>{item}</button>)}</div></div><button type="button" onClick={run} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#d5f06f] px-4 py-3 text-sm font-bold text-[#171b08] disabled:opacity-50">{busy ? "Running…" : <><Play className="h-4 w-4 fill-current" /> Run tool</>}</button>{error && <div role="alert" className="rounded-lg border border-[#6d332e] bg-[#241412] p-3 text-sm text-[#ef8c79]">{error}</div>}{result && <div className="border-t border-[#292d28] pt-5"><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#6f716d]">{result.status} · {result.elapsed_ms} ms</p><div className="grid gap-3 sm:grid-cols-2">{result.images.map((asset) => <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-[#292d28]"><img src={asset.url} alt={asset.filename} className="aspect-square w-full object-cover" /></a>)}</div></div>}</section></>}</div></main>;
}
