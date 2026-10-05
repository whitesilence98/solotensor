"use client";

import { useRef, useState } from "react";
import { Copy, Download, Expand, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { ToolAspectRatio } from "@/lib/api";

type VideoResultPreviewProps = {
  url: string;
  filename: string;
  ratio: ToolAspectRatio;
  bounded?: boolean;
};

export function VideoResultPreview({ url, filename, ratio, bounded = false }: VideoResultPreviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [loop, setLoop] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [intrinsicRatio, setIntrinsicRatio] = useState(ratio.replace(":", " / "));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const togglePlay = () => {
    if (!video.current) return;
    if (video.current.paused) {
      void video.current.play().then(() => setPlaying(true)).catch(() => setError("Autoplay was blocked. Use the play control."));
    } else {
      video.current.pause();
      setPlaying(false);
    }
  };
  const fullscreen = () => {
    if (video.current?.requestFullscreen) void video.current.requestFullscreen().catch(() => setError("Fullscreen is unavailable in this browser."));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy the video link.");
    }
  };

  return <div className={bounded ? "flex h-full min-h-0 flex-col gap-2" : "space-y-3"}>
    <div
      className={`relative overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--ground)] ${bounded ? "min-h-0 flex-1" : ""}`}
      style={bounded ? undefined : { aspectRatio: intrinsicRatio }}
    >
      <video
        ref={video}
        src={url}
        muted={muted}
        autoPlay
        loop={loop}
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onLoadedMetadata={(event) => {
          const node = event.currentTarget;
          setDuration(node.duration);
          if (node.videoWidth && node.videoHeight) setIntrinsicRatio(`${node.videoWidth} / ${node.videoHeight}`);
          void node.play().then(() => setPlaying(true)).catch(() => undefined);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setError("The video stream could not be loaded.")}
        aria-label={filename}
      />
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--surface-sunken)]/90 p-1.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,.8)] backdrop-blur sm:inset-x-3 sm:bottom-3 sm:gap-2 sm:p-2">
        <button type="button" onClick={togglePlay} aria-label={playing ? "Pause video" : "Play video"} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--accent)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}</button>
        <input aria-label="Seek video" type="range" min="0" max={duration || 0} step="0.01" value={current} onChange={(event) => { const next = Number(event.target.value); if (video.current) video.current.currentTime = next; setCurrent(next); }} className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" />
        <span className="hidden font-mono text-[10px] tabular-nums text-[var(--ink-soft)] sm:inline">{Math.floor(current)}s / {Math.floor(duration)}s</span>
        <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute video" : "Mute video"} aria-pressed={!muted} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
        <button type="button" onClick={() => setLoop((value) => !value)} aria-pressed={loop} aria-label={loop ? "Disable video loop" : "Enable video loop"} className={`hidden rounded-md px-2 py-1 text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] min-[430px]:block ${loop ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"}`}>Loop</button>
        <button type="button" onClick={fullscreen} aria-label="Enter fullscreen" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Expand className="h-4 w-4" /></button>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 hidden items-center gap-1 rounded-md bg-[var(--surface-sunken)]/85 px-2 py-1 text-[10px] font-semibold text-[var(--ink)] sm:inline-flex">
        {muted ? <VolumeX className="h-3 w-3 text-[var(--accent)]" /> : <Volume2 className="h-3 w-3 text-[var(--accent)]" />}
        {muted ? "Muted" : "Sound on"}
      </span>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <a href={url} download={filename} className="inline-flex items-center gap-2 whitespace-nowrap rounded-[.5rem] bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)] active:scale-[.97]"><Download className="h-3.5 w-3.5" />Download</a>
      <a href={url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-[.5rem] border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] active:scale-[.97]">Open original</a>
      <button type="button" onClick={copy} className="inline-flex items-center gap-2 whitespace-nowrap rounded-[.5rem] border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] active:scale-[.97]"><Copy className="h-3.5 w-3.5" /><span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span></button>
    </div>
    {error && <p role="alert" className="shrink-0 truncate text-xs text-[var(--danger)]" title={error}>{error}</p>}
  </div>;
}
