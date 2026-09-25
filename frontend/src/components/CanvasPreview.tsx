"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Download, Expand, ImageIcon, X } from "lucide-react";
import type { GalleryItem } from "@/lib/api";

interface Props {
  busy: boolean; progress: number; progressLabel: string; gallery: GalleryItem[];
  error: string | null; viewerUrl: string | null;
  onOpenViewer: (url: string) => void; onCloseViewer: () => void;
}

export default function CanvasPreview({ busy, progress, progressLabel, gallery, error, viewerUrl, onOpenViewer, onCloseViewer }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!viewerUrl) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseViewer(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerUrl, onCloseViewer]);

  const latest = gallery[0];

  return (
    <main id="main-content" className="relative min-h-[34rem] min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_68%_28%,rgba(213,240,111,.055),transparent_26rem)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#292d28] bg-[#0b0c0b]/85 px-5 py-3 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3"><span className={`h-1.5 w-1.5 rounded-full ${busy ? "animate-pulse bg-[#d5f06f]" : "bg-[#50554d]"}`} /><span className="text-xs font-semibold text-[#aaa8a1]">{busy ? "Rendering" : "Canvas ready"}</span></div>
        <span className="font-mono text-[10px] tabular-nums text-[#6f716d]">{gallery.length.toString().padStart(2, "0")} OUTPUTS</span>
      </header>

      <div className="mx-auto w-full max-w-[78rem] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        {error && <div role="alert" className="mb-7 flex items-start gap-3 border-l-2 border-[#ef8c79] bg-[#ef8c79]/[.06] px-4 py-3 text-sm text-[#efb1a5]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-relaxed">{error}</p></div>}

        {busy && <section aria-live="polite" className="mb-12">
          <div className="mb-4 flex items-end justify-between border-b border-[#292d28] pb-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#6f716d]">In progress</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em] text-[#f2f0e9]">{progressLabel || "Building your image"}</h2></div><span className="font-mono text-2xl text-[#d5f06f]">{progress}%</span></div>
          <div className="grid gap-3 md:grid-cols-[1.35fr_.65fr]">
            <div className="shimmer aspect-[16/10] rounded-[.75rem]" /><div className="grid grid-cols-2 gap-3 md:grid-cols-1"><div className="shimmer rounded-[.55rem]" /><div className="shimmer rounded-[.55rem]" /></div>
          </div>
        </section>}

        {latest ? <section className="mb-14">
          <div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#6f716d]">Latest / {gallery.length.toString().padStart(2, "0")}</p><h2 className="mt-1 text-[clamp(1.75rem,4vw,3.5rem)] font-semibold leading-none tracking-[-.065em] text-[#f2f0e9]">Fresh from the graph.</h2></div><button type="button" onClick={() => onOpenViewer(latest.url)} className="hidden items-center gap-2 text-xs font-semibold text-[#aaa8a1] transition-colors hover:text-[#d5f06f] sm:flex"><Expand className="h-4 w-4" />Expand</button></div>
          <button type="button" onClick={() => onOpenViewer(latest.url)} className="group relative block w-full overflow-hidden rounded-[.8rem] bg-[#111311] shadow-[0_26px_80px_-36px_rgba(126,152,52,.35)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={latest.url} alt="Latest generated image" className="max-h-[42rem] w-full object-contain transition-transform duration-500 group-hover:scale-[1.008]" />
            <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-md bg-[#0b0c0b]/80 text-[#f2f0e9] opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"><Expand className="h-4 w-4" /></span>
          </button>
        </section> : !busy && <section className="grid min-h-[30rem] place-items-center border border-[#292d28] bg-[#0e100e]/60 px-6 py-16">
          <div className="max-w-xl text-center"><div className="relative mx-auto mb-7 grid h-24 w-24 place-items-center"><span className="absolute inset-0 animate-[breathe_3s_ease-in-out_infinite] rounded-full border border-[#d5f06f]/20" /><span className="absolute inset-4 rounded-full border border-[#d5f06f]/30" /><ImageIcon className="h-6 w-6 text-[#d5f06f]" strokeWidth={1.6} /></div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#6f716d]">Blank canvas</p><h2 className="mt-3 text-[clamp(2.2rem,6vw,5.25rem)] font-semibold leading-[.88] tracking-[-.075em] text-[#f2f0e9]">Give the model<br />something to see.</h2><p className="mx-auto mt-5 max-w-[48ch] text-sm leading-6 text-[#8a8d85]">Write a specific prompt. Choose a format. The first result lands here and stays in your library.</p></div>
        </section>}

        {gallery.length > 1 && <section><div className="mb-4 flex items-center justify-between border-b border-[#292d28] pb-3"><h2 className="text-sm font-semibold text-[#deddd6]">Recent work</h2><span className="font-mono text-[10px] text-[#6f716d]">{gallery.length} FILES</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{gallery.slice(1).map((item, index) => <button key={item.key} type="button" onClick={() => onOpenViewer(item.url)} className={`group relative overflow-hidden rounded-[.45rem] bg-[#111311] ${index % 5 === 0 ? "col-span-2 row-span-2" : "aspect-square"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.url} alt={item.key} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" /><span className="absolute inset-0 bg-[#d5f06f]/0 transition-colors group-hover:bg-[#d5f06f]/[.05]" /></button>)}</div></section>}
      </div>

      {viewerUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080908]/95 p-4 backdrop-blur-sm sm:p-8" onClick={onCloseViewer} role="dialog" aria-modal="true" aria-label="Full resolution image">
        <div className="relative flex max-h-full max-w-6xl flex-col" onClick={(e) => e.stopPropagation()}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={viewerUrl} alt="Full resolution generated asset" className="max-h-[84vh] max-w-full object-contain" /><div className="mt-4 flex items-center justify-center gap-2"><a href={viewerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md bg-[#d5f06f] px-4 py-2.5 text-xs font-bold text-[#171b08] transition-transform active:scale-[.97]"><Download className="h-3.5 w-3.5" />Open original</a><button ref={closeRef} type="button" onClick={onCloseViewer} className="flex items-center gap-2 rounded-md border border-[#3a4038] px-4 py-2.5 text-xs font-semibold text-[#deddd6] transition-colors hover:bg-[#20231f]"><X className="h-3.5 w-3.5" />Close</button></div></div>
      </div>}
    </main>
  );
}
