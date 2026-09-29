"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Expand, ImageIcon } from "lucide-react";
import type { GalleryItem } from "@/lib/api";

interface Props {
  busy: boolean; progress: number; progressLabel: string; gallery: GalleryItem[];
  error: string | null; outputWidth: number; outputHeight: number; referenceImage: string | null;
}

function detailHref(item: GalleryItem): string {
  return `/assets/${item.key.split("/").map(encodeURIComponent).join("/")}`;
}

function ComparisonSlider({ before, after }: { before: string; after: string }) {
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const updatePosition = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    setPosition(Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100)));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => updatePosition(event.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  return (
    <div
      ref={frameRef}
      className="group relative isolate mx-auto w-full max-w-[64rem] overflow-hidden rounded-[.8rem] border border-[#292d28] bg-[#111311] select-none touch-none"
      style={{ aspectRatio: "16 / 10" }}
      onPointerDown={(event) => { setDragging(true); updatePosition(event.clientX); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setPosition((value) => Math.min(100, Math.max(0, value + (event.key === "ArrowRight" ? 2 : -2))));
        }
        if (event.key === "Home") setPosition(0);
        if (event.key === "End") setPosition(100);
      }}
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${Math.round(position)} percent generated result`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="Generated image after transformation" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt="Reference image before generation" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} draggable={false} />
      <span className="pointer-events-none absolute left-3 top-3 rounded-[.35rem] bg-[#0b0c0b]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#f2f0e9] backdrop-blur">Before</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-[.35rem] bg-[#d5f06f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#171b08]">After</span>
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${position}%` }}>
        <span className="absolute inset-y-0 -translate-x-1/2 border-l border-white/80 shadow-[0_0_0_1px_rgba(11,12,11,.35)]" />
        <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-[#0b0c0b]/85 text-[#f2f0e9] shadow-[0_8px_24px_-8px_rgba(0,0,0,.8)] backdrop-blur">
          <span className="text-lg leading-none" aria-hidden>↔</span>
        </span>
      </div>
      <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0b0c0b]/75 px-3 py-1.5 text-[10px] font-semibold tracking-[.08em] text-[#deddd6] opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:opacity-100">Drag to compare · {Math.round(position)}%</span>
    </div>
  );
}

export default function CanvasPreview({ busy, progress, progressLabel, gallery, error, outputWidth, outputHeight, referenceImage }: Props) {
  const latest = gallery[0];
  const canCompare = Boolean(referenceImage && latest && !busy);

  return (
    <main id="main-content" className="workspace-scroll relative h-[58%] min-w-0 flex-1 bg-[radial-gradient(circle_at_68%_28%,rgba(213,240,111,.055),transparent_26rem)] lg:h-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#292d28] bg-[#0b0c0b]/85 px-5 py-3 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3"><span className={`h-1.5 w-1.5 rounded-full ${busy ? "animate-pulse bg-[#d5f06f]" : "bg-[#50554d]"}`} /><span className="text-xs font-semibold text-[#aaa8a1]">{busy ? "Rendering" : canCompare ? "Comparison ready" : "Canvas ready"}</span></div>
        <span className="font-mono text-[10px] tabular-nums text-[#6f716d]">{gallery.length.toString().padStart(2, "0")} OUTPUTS</span>
      </header>

      <div className="mx-auto w-full max-w-[78rem] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        {error && <div role="alert" className="mb-7 flex items-start gap-3 border-l-2 border-[#ef8c79] bg-[#ef8c79]/[.06] px-4 py-3 text-sm text-[#efb1a5]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-relaxed">{error}</p></div>}

        {busy && <section aria-live="polite" className="mb-12">
          <div className="mb-4 flex items-end justify-between border-b border-[#292d28] pb-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#6f716d]">In progress</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em] text-[#f2f0e9]">{progressLabel || "Building your image"}</h2></div><span className="font-mono text-2xl text-[#d5f06f]">{progress}%</span></div>
          <div className="mx-auto max-h-[60vh] max-w-full overflow-hidden rounded-[.75rem]" style={{ aspectRatio: `${outputWidth} / ${outputHeight}`, width: `min(100%, calc(60vh * ${outputWidth} / ${outputHeight}))` }}><div className="shimmer h-full w-full" /></div>
        </section>}

        {latest ? <section className="mb-14">
          <div className="mb-4 flex items-end justify-between border-b border-[#292d28] pb-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#6f716d]">{canCompare ? "Before / after" : `Latest / ${gallery.length.toString().padStart(2, "0")}`}</p><h2 className="mt-1 text-[clamp(1.75rem,4vw,3.5rem)] font-semibold leading-none tracking-[-.065em] text-[#f2f0e9]">{canCompare ? "See what changed." : "Fresh from the graph."}</h2></div><Link href={detailHref(latest)} className="hidden items-center gap-2 text-xs font-semibold text-[#aaa8a1] transition-colors hover:text-[#d5f06f] sm:flex"><Expand className="h-4 w-4" />View details</Link></div>
          {canCompare ? <ComparisonSlider before={referenceImage!} after={latest.url} /> : <Link href={detailHref(latest)} className="group relative block w-full overflow-hidden rounded-[.8rem] bg-[#111311] shadow-[0_26px_80px_-36px_rgba(126,152,52,.35)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={latest.url} alt="Latest generated image" className="max-h-[42rem] w-full object-contain transition-transform duration-500 group-hover:scale-[1.008]" /><span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-md bg-[#0b0c0b]/80 text-[#f2f0e9] opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"><Expand className="h-4 w-4" /></span>
          </Link>}
          {canCompare && <p className="mt-3 text-center text-[10px] uppercase tracking-[.16em] text-[#6f716d]">Use arrow keys or drag the handle across the image</p>}
        </section> : !busy && <section className="grid min-h-[30rem] place-items-center border border-[#292d28] bg-[#0e100e]/60 px-6 py-16">
          <div className="max-w-xl text-center"><div className="relative mx-auto mb-7 grid h-24 w-24 place-items-center"><span className="absolute inset-0 animate-[breathe_3s_ease-in-out_infinite] rounded-full border border-[#d5f06f]/20" /><span className="absolute inset-4 rounded-full border border-[#d5f06f]/30" /><ImageIcon className="h-6 w-6 text-[#d5f06f]" strokeWidth={1.6} /></div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#6f716d]">Blank canvas</p><h2 className="mt-3 text-[clamp(2.2rem,6vw,5.25rem)] font-semibold leading-[.88] tracking-[-.075em] text-[#f2f0e9]">Give the model<br />something to see.</h2><p className="mx-auto mt-5 max-w-[48ch] text-sm leading-6 text-[#8a8d85]">Write a specific prompt. Choose a format. The first result lands here and stays in your library.</p></div>
        </section>}

        {gallery.length > 1 && <section><div className="mb-4 flex items-center justify-between border-b border-[#292d28] pb-3"><h2 className="text-sm font-semibold text-[#deddd6]">Recent work</h2><span className="font-mono text-[10px] text-[#6f716d]">{gallery.length} FILES</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{gallery.slice(1).map((item) => <Link key={item.key} href={detailHref(item)} className="group relative aspect-square overflow-hidden rounded-[.45rem] bg-[#111311]">
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.url} alt={item.key} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" /><span className="absolute inset-0 bg-[#d5f06f]/0 transition-colors group-hover:bg-[#d5f06f]/[.05]" /></Link>)}</div></section>}
      </div>
    </main>
  );
}
