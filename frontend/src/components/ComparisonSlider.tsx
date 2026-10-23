"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export interface ComparisonSliderProps {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  aspectRatio?: string;
  style?: CSSProperties;
}

export default function ComparisonSlider({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  className,
  aspectRatio = "16 / 10",
  style,
}: ComparisonSliderProps) {
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const updatePosition = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    if (bounds.width <= 0) return;
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
      className={`media-frame group relative isolate mx-auto overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface-raised)] shadow-[0_18px_48px_rgba(0,0,0,.2)] select-none touch-none ${
        className || "w-full max-w-[64rem]"
      }`}
      style={{ aspectRatio, ...style }}
      onPointerDown={(event) => {
        setDragging(true);
        updatePosition(event.clientX);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          setPosition((value) => Math.max(0, value - step));
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          setPosition((value) => Math.min(100, value + step));
        } else if (event.key === "Home") {
          event.preventDefault();
          setPosition(0);
        } else if (event.key === "End") {
          event.preventDefault();
          setPosition(100);
        }
      }}
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={after}
        alt="Generated image"
        className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt="Reference image"
        className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />
      <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-xl bg-[var(--media-scrim-strong)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink)] shadow-md backdrop-blur-md">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-xl bg-[var(--accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)] shadow-md">
        {afterLabel}
      </span>
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${position}%` }}>
        <span className="absolute inset-y-0 -translate-x-1/2 border-l border-[var(--ink)] shadow-[0_0_8px_rgba(0,0,0,0.5)]" />
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--ink)] bg-[var(--media-control)] text-[var(--media-control-ink)] shadow-lg">
          <span className="text-sm font-bold" aria-hidden>
            ↔
          </span>
        </span>
      </div>
    </div>
  );
}
