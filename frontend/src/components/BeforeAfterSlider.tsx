"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ChevronsLeftRight,
  Columns2,
  Layers,
} from "lucide-react";

export type ViewMode = "split" | "side-by-side" | "flip";

export interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  aspectRatio?: string;
}

export default function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
  aspectRatio = "16/9",
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<ViewMode>("split");
  const [flipped, setFlipped] = useState(false);

  // Updates slider percentage based on client coordinate
  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  }, []);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (mode !== "split") return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || mode !== "split") return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored if already released
      }
    }
  };

  // Keyboard accessibility
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (mode === "flip") {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      return;
    }

    if (mode !== "split") return;

    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setSliderPos((pos) => Math.max(0, pos - 5));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setSliderPos((pos) => Math.min(100, pos + 5));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSliderPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSliderPos(100);
    }
  };

  // Listen to spacebar flip in flip mode when container is focused
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (mode === "flip" && (e.code === "Space" || e.key === " ") && document.activeElement === containerRef.current) {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Top View Mode Switcher */}
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">
          Comparison Mode
        </span>
        <div className="flex items-center gap-1 border border-[var(--line)] bg-[var(--surface)] p-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "split"}
            onClick={() => setMode("split")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
              mode === "split"
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <ChevronsLeftRight className="h-3 w-3" />
            <span>Split</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "side-by-side"}
            onClick={() => setMode("side-by-side")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
              mode === "side-by-side"
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <Columns2 className="h-3 w-3" />
            <span>Side-by-Side</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "flip"}
            onClick={() => setMode("flip")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
              mode === "flip"
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>Flip</span>
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div
        ref={containerRef}
        tabIndex={0}
        role={mode === "split" ? "slider" : "region"}
        aria-label={
          mode === "split"
            ? "Before and after comparison slider"
            : mode === "side-by-side"
            ? "Side by side comparison"
            : "Flip comparison view"
        }
        aria-valuemin={mode === "split" ? 0 : undefined}
        aria-valuemax={mode === "split" ? 100 : undefined}
        aria-valuenow={mode === "split" ? Math.round(sliderPos) : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        style={{ aspectRatio }}
        className={`relative w-full overflow-hidden border border-[var(--line)] bg-[var(--surface-sunken)] outline-none select-none transition-colors ${
          mode === "split"
            ? "cursor-ew-resize focus-visible:border-[var(--accent)]"
            : mode === "flip"
            ? "cursor-pointer focus-visible:border-[var(--accent)]"
            : "focus-visible:border-[var(--accent)]"
        }`}
      >
        {/* MODE 1: SPLIT SLIDER */}
        {mode === "split" && (
          <>
            {/* Background Layer: Before / Input */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={beforeUrl}
              alt={beforeLabel}
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain select-none"
            />

            {/* Foreground Layer: After / Processed with clipPath */}
            <div
              style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={afterUrl}
                alt={afterLabel}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain select-none"
              />
            </div>

            {/* Vertical Divider Line */}
            <div
              style={{ left: `${sliderPos}%` }}
              className="pointer-events-none absolute inset-y-0 w-0 -translate-x-1/2 border-l border-[var(--accent)] shadow-[0_0_12px_rgba(213,240,111,0.4)]"
            >
              {/* Draggable Center Pill */}
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1.5 text-[var(--accent)] shadow-2xl transition hover:scale-110 active:scale-95">
                <ChevronsLeftRight className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Badges */}
            <div className="pointer-events-none absolute left-3 top-3 border border-[var(--line)] bg-[var(--surface)]/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink-soft)] backdrop-blur-md">
              {beforeLabel}
            </div>
            <div className="pointer-events-none absolute right-3 top-3 border border-[var(--accent)]/50 bg-[var(--surface)]/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] backdrop-blur-md">
              {afterLabel}
            </div>
          </>
        )}

        {/* MODE 2: SIDE BY SIDE */}
        {mode === "side-by-side" && (
          <div className="grid h-full w-full grid-cols-2 divide-x divide-[var(--line)]">
            <div className="relative flex h-full w-full items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={beforeUrl}
                alt={beforeLabel}
                draggable={false}
                className="h-full w-full object-contain select-none"
              />
              <span className="pointer-events-none absolute left-3 top-3 border border-[var(--line)] bg-[var(--surface)]/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink-soft)]">
                {beforeLabel}
              </span>
            </div>
            <div className="relative flex h-full w-full items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={afterUrl}
                alt={afterLabel}
                draggable={false}
                className="h-full w-full object-contain select-none"
              />
              <span className="pointer-events-none absolute right-3 top-3 border border-[var(--accent)]/50 bg-[var(--surface)]/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent)]">
                {afterLabel}
              </span>
            </div>
          </div>
        )}

        {/* MODE 3: FLIP TOGGLE */}
        {mode === "flip" && (
          <div
            onClick={() => setFlipped((f) => !f)}
            className="relative flex h-full w-full items-center justify-center p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={flipped ? beforeUrl : afterUrl}
              alt={flipped ? beforeLabel : afterLabel}
              draggable={false}
              className="h-full w-full object-contain select-none transition-opacity duration-150"
            />
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
              <span
                className={`border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                  flipped
                    ? "border-[var(--line)] bg-[var(--surface)]/90 text-[var(--ink-soft)]"
                    : "border-[var(--accent)]/50 bg-[var(--surface)]/90 text-[var(--accent)]"
                }`}
              >
                {flipped ? beforeLabel : afterLabel}
              </span>
              <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                (Click or press Space to flip)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
