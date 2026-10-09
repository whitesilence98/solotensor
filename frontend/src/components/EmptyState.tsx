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
    <div className="workspace-empty workspace-bezel flex min-h-[420px] flex-col items-center justify-center p-1.5 text-center">
      <div className="workspace-core flex h-full w-full flex-col items-center justify-center px-6 py-16">
        <div className="workspace-icon-island h-16 w-16 border border-[var(--accent-ambient)] text-[var(--accent)] shadow-ambient-glow rounded-2xl bg-[var(--surface-soft)]">
          <Icon className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <div className="workspace-kicker mt-8">Your library is ready</div>
        <h3 className="workspace-heading mt-3 text-xl font-semibold text-[var(--ink)]">{s.title}</h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-[var(--ink-soft)]">{s.body}</p>
        {kind === "image" && onClearSearch ? (
          <button type="button" onClick={onClearSearch} className="workspace-action-primary mt-7 gap-2 px-5 py-2.5 text-sm">
            {s.hint}<ArrowRight className="h-4.5 w-4.5" strokeWidth={1.5} />
          </button>
        ) : (
          <Link href="/" className="workspace-action-primary mt-7 gap-2 px-5 py-2.5 text-sm">
            <Sparkles className="h-4.5 w-4.5" strokeWidth={1.5} />{s.hint}
          </Link>
        )}
        {"tabHint" in s && <p className="mt-5 text-xs text-[var(--ink-faint)]">{s.tabHint}</p>}
      </div>
    </div>
  );
}
