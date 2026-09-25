"use client";

import Link from "next/link";
import { Film, Box, ImageIcon, Sparkles, ArrowRight } from "lucide-react";

const STATES = {
  video: {
    icon: Film,
    title: "No videos yet",
    body: "Video outputs will appear here once a workflow in your ComfyUI pipeline saves video files (mp4, webm). The gallery picks them up automatically.",
    hint: "Generate images",
    tabHint: "Until then, everything you have generated lives in Images.",
  },
  "3d": {
    icon: Box,
    title: "No 3D assets yet",
    body: "Mesh outputs (glb, obj, fbx) will appear here when a workflow produces 3D formats. The gallery detects them by file type.",
    hint: "Generate images",
    tabHint: "Browse your generated images in the Images tab.",
  },
  image: {
    icon: ImageIcon,
    title: "No images match your search",
    body: "Try a different filename, or clear the search to see the full library.",
    hint: "Clear search",
  },
} as const;

type EmptyKind = keyof typeof STATES;

export default function EmptyState({
  kind,
  onClearSearch,
}: {
  kind: EmptyKind;
  onClearSearch?: () => void;
}) {
  const s = STATES[kind];
  const Icon = s.icon;
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center border border-[#292d28] bg-[#0e100e]/60 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[.65rem] border border-[#d5f06f]/25 bg-[#d5f06f]/[.06]">
        <Icon className="h-6 w-6 text-[#d5f06f]" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-[-.03em] text-[#f2f0e9]">
        {s.title}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#8a8d85]">{s.body}</p>
      {kind === "image" && onClearSearch ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-6 inline-flex items-center gap-1.5 rounded-[.5rem] bg-[#d5f06f] px-4 py-2.5 text-sm font-semibold text-[#171b08] transition-all duration-200 hover:bg-[#e2f88a] active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5f06f]"
        >
          {s.hint}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-[.5rem] bg-[#d5f06f] px-4 py-2.5 text-sm font-semibold text-[#171b08] transition-all duration-200 hover:bg-[#e2f88a] active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5f06f]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {s.hint}
        </Link>
      )}
      {"tabHint" in s && (
        <p className="mt-3 text-xs text-[#6f716d]">{s.tabHint}</p>
      )}
    </div>
  );
}