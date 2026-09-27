"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Wrench } from "lucide-react";
import { api, type ToolSummary } from "@/lib/api";

const modeLabel: Record<ToolSummary["mode"], string> = {
  "text-to-image": "Text → Image",
  "image-to-image": "Image → Image",
  "text-to-video": "Text → Video",
  "image-to-video": "Image → Video",
};

export default function ToolStudioPage() {
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getTools().then(setTools).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load tools.")).finally(() => setLoading(false));
  }, []);

  return <main className="h-full overflow-y-auto px-4 py-6 md:px-8 md:py-10"><div className="mx-auto max-w-6xl">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[#292d28] pb-6"><div><p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#d5f06f]"><Wrench className="h-3.5 w-3.5" /> AI Tool Studio</p><h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#f2f0e9] md:text-5xl">Your tools</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#aaa8a1]">Reusable ComfyUI tools with only the controls your audience needs.</p></div><Link href="/tools/create" className="inline-flex items-center gap-2 rounded-lg bg-[#d5f06f] px-4 py-3 text-sm font-bold text-[#171b08] hover:brightness-105"><Plus className="h-4 w-4" /> Create tool</Link></header>
    {loading ? <div className="flex min-h-64 items-center justify-center text-sm text-[#6f716d]"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading tools</div> : error ? <div role="alert" className="rounded-xl border border-[#6d332e] bg-[#241412] p-4 text-sm text-[#ef8c79]">{error}</div> : tools.length === 0 ? <div className="rounded-2xl border border-dashed border-[#3a4038] bg-[#111311] p-12 text-center"><Wrench className="mx-auto mb-3 h-7 w-7 text-[#3a4038]" /><p className="text-sm text-[#aaa8a1]">No tools yet.</p><Link href="/tools/create" className="mt-4 inline-block text-sm text-[#d5f06f]">Create your first tool</Link></div> : <div className="grid gap-4 md:grid-cols-2">{tools.map((tool) => <Link key={tool.tool_id} href={`/tools/${tool.tool_id}`} className="overflow-hidden rounded-2xl border border-[#292d28] bg-[#111311] transition hover:border-[#58634d]"><div className="aspect-[16/7] bg-[#0b0c0b]">{tool.thumbnail_url ? <img src={tool.thumbnail_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-[#3a4038]">No thumbnail</div>}</div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[#f2f0e9]">{tool.name}</h2><p className="mt-2 text-xs uppercase tracking-[0.14em] text-[#d5f06f]">{modeLabel[tool.mode]}</p></div><span className="rounded-full bg-[#20231f] px-2.5 py-1 text-xs text-[#aaa8a1]">{tool.default_aspect_ratio}</span></div><p className="mt-5 text-xs text-[#6f716d]">{tool.has_prompt ? "Prompt enabled" : "Prompt locked"} · {tool.requires_image ? "Image input" : "No image input"}</p></div></Link>)}</div>}
  </div></main>;
}
