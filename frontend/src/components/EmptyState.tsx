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
    <div className="workspace-empty flex min-h-[420px] flex-col items-center justify-center px-6 py-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-panel)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]">
        <Icon className="h-6 w-6 text-[var(--accent)]" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-[-.03em] text-[var(--ink)]">
        {s.title}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">{s.body}</p>
      {kind === "image" && onClearSearch ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="workspace-action-primary mt-6 gap-1.5 px-4 py-2.5 text-sm"
        >
          {s.hint}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Link
          href="/"
          className="workspace-action-primary mt-6 gap-1.5 px-4 py-2.5 text-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {s.hint}
        </Link>
      )}
      {"tabHint" in s && (
        <p className="mt-3 text-xs text-[var(--ink-faint)]">{s.tabHint}</p>
      )}
    </div>
  );
}