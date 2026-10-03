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
      className={`relative overflow-hidden rounded-[.7rem] border border-[#292d28] bg-[#080908] ${bounded ? "min-h-0 flex-1" : ""}`}
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
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-[.55rem] bg-[#0b0c0b]/90 p-1.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,.8)] backdrop-blur sm:inset-x-3 sm:bottom-3 sm:gap-2 sm:p-2">
        <button type="button" onClick={togglePlay} aria-label={playing ? "Pause video" : "Play video"} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#d5f06f] transition-colors hover:bg-[#20231f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d5f06f]">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}</button>
        <input aria-label="Seek video" type="range" min="0" max={duration || 0} step="0.01" value={current} onChange={(event) => { const next = Number(event.target.value); if (video.current) video.current.currentTime = next; setCurrent(next); }} className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5f06f]" />
        <span className="hidden font-mono text-[10px] tabular-nums text-[#aaa8a1] sm:inline">{Math.floor(current)}s / {Math.floor(duration)}s</span>
        <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute video" : "Mute video"} aria-pressed={!muted} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#deddd6] transition-colors hover:bg-[#20231f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d5f06f]">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
        <button type="button" onClick={() => setLoop((value) => !value)} aria-pressed={loop} aria-label={loop ? "Disable video loop" : "Enable video loop"} className={`hidden rounded-md px-2 py-1 text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d5f06f] min-[430px]:block ${loop ? "bg-[#d5f06f] text-[#171b08]" : "text-[#aaa8a1] hover:bg-[#20231f]"}`}>Loop</button>
        <button type="button" onClick={fullscreen} aria-label="Enter fullscreen" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#deddd6] transition-colors hover:bg-[#20231f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d5f06f]"><Expand className="h-4 w-4" /></button>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 hidden items-center gap-1 rounded-md bg-[#0b0c0b]/85 px-2 py-1 text-[10px] font-semibold text-[#deddd6] sm:inline-flex">
        {muted ? <VolumeX className="h-3 w-3 text-[#d5f06f]" /> : <Volume2 className="h-3 w-3 text-[#d5f06f]" />}
        {muted ? "Muted" : "Sound on"}
      </span>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <a href={url} download={filename} className="inline-flex items-center gap-2 whitespace-nowrap rounded-[.5rem] bg-[#d5f06f] px-3 py-2 text-xs font-bold text-[#171b08] transition hover:brightness-105 active:scale-[.97]"><Download className="h-3.5 w-3.5" />Download</a>
      <a href={url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-[.5rem] border border-[#3a4038] px-3 py-2 text-xs font-semibold text-[#deddd6] transition-colors hover:bg-[#20231f] active:scale-[.97]">Open original</a>
      <button type="button" onClick={copy} className="inline-flex items-center gap-2 whitespace-nowrap rounded-[.5rem] border border-[#3a4038] px-3 py-2 text-xs font-semibold text-[#deddd6] transition-colors hover:bg-[#20231f] active:scale-[.97]"><Copy className="h-3.5 w-3.5" /><span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span></button>
    </div>
    {error && <p role="alert" className="shrink-0 truncate text-xs text-[#ef8c79]" title={error}>{error}</p>}
  </div>;
}
