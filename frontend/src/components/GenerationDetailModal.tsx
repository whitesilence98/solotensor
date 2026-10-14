"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { GenerationRecord } from "@/lib/api";

export interface GenerationDetailModalProps {
  generation: GenerationRecord | null;
  modelId: string;
  onClose: () => void;
}

export default function GenerationDetailModal({
  generation,
  modelId,
  onClose,
}: GenerationDetailModalProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!generation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [generation, onClose]);

  if (!generation) return null;

  const copyText = (
    text: string | null | undefined,
    setter: (val: boolean) => void,
  ) => {
    if (!text) return;
    void navigator.clipboard?.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 1600);
  };

  const remixUrl = `/?model_id=${encodeURIComponent(
    generation.model_id || modelId,
  )}${generation.prompt ? `&prompt=${encodeURIComponent(generation.prompt)}` : ""}${
    generation.seed !== undefined && generation.seed !== null
      ? `&seed=${generation.seed}`
      : ""
  }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generation output details"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 bg-[var(--ground)]/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="relative flex flex-col lg:flex-row w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-[0_32px_96px_rgba(0,0,0,0.85)] animate-in zoom-in-95 duration-200"
      >
        {/* Close Button Top Right (Mobile & Desktop) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lightbox"
          className="absolute top-3.5 right-3.5 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Left Column: High-Res Media Viewport */}
        <div className="relative flex-1 min-h-[300px] lg:min-h-[580px] flex items-center justify-center bg-[var(--surface-sunken)] p-4 sm:p-6 overflow-hidden">
          {/* Subtle grid pattern background */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle, var(--line-strong) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          <img
            src={generation.url}
            alt={generation.prompt || generation.filename}
            className="relative z-10 max-h-[82vh] w-auto max-w-full rounded-lg object-contain shadow-2xl border border-[var(--line)]"
          />
        </div>

        {/* Right Column: Parameter Inspector Panel */}
        <div className="w-full lg:w-[400px] xl:w-[440px] shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-[var(--line)] bg-[var(--surface-raised)] max-h-[50vh] lg:max-h-none overflow-y-auto workspace-scroll">
          {/* Header */}
          <div className="p-5 border-b border-[var(--line)] pr-12">
            <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase block mb-1">
              GENERATION RECORD // SEC-NODE
            </span>
            <h2 className="font-mono text-sm font-bold text-[var(--ink)] truncate" title={generation.filename}>
              {generation.filename}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--ink-faint)] font-mono">
              <span>{generation.created_at ? new Date(generation.created_at).toLocaleDateString() : "Recent"}</span>
              {generation.format_name && (
                <>
                  <span>•</span>
                  <span className="uppercase text-[var(--ink-soft)]">{generation.format_name}</span>
                </>
              )}
              {generation.elapsed_ms && (
                <>
                  <span>•</span>
                  <span>{(generation.elapsed_ms / 1000).toFixed(1)}s</span>
                </>
              )}
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 space-y-4 flex-1">
            {/* Prompt Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                  PROMPT
                </span>
                {generation.prompt && (
                  <button
                    type="button"
                    onClick={() => copyText(generation.prompt, setCopiedPrompt)}
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="h-3 w-3 text-[var(--accent)]" />
                        <span className="text-[var(--accent)]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed text-[var(--ink)] select-text break-words">
                {generation.prompt || (
                  <span className="text-[var(--ink-faint)] italic">No prompt record stored</span>
                )}
              </div>
            </div>

            {/* Negative Prompt Section */}
            {generation.negative_prompt && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase">
                    NEGATIVE PROMPT
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(generation.negative_prompt, setCopiedNegative)
                    }
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                  >
                    {copiedNegative ? (
                      <>
                        <Check className="h-3 w-3 text-[var(--accent)]" />
                        <span className="text-[var(--accent)]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed text-[var(--ink-soft)] select-text break-words">
                  {generation.negative_prompt}
                </div>
              </div>
            )}

            {/* Inference Parameters Matrix */}
            <div>
              <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase block mb-2">
                INFERENCE SPECS
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                    SEED
                  </span>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-[var(--ink)]">
                      {generation.seed !== undefined && generation.seed !== null
                        ? generation.seed
                        : "Random"}
                    </span>
                    {generation.seed !== undefined && generation.seed !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          copyText(String(generation.seed), setCopiedSeed)
                        }
                        className="text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
                        title="Copy seed"
                      >
                        {copiedSeed ? (
                          <Check className="h-3 w-3 text-[var(--accent)]" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                    RESOLUTION
                  </span>
                  <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block">
                    {generation.width && generation.height
                      ? `${generation.width} × ${generation.height}`
                      : "Standard"}
                  </span>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                    STEPS
                  </span>
                  <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block">
                    {generation.steps ?? "—"}
                  </span>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase block">
                    CFG SCALE
                  </span>
                  <span className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)] block">
                    {generation.cfg !== undefined && generation.cfg !== null
                      ? generation.cfg
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* LoRA Stack */}
            {generation.loras && generation.loras.length > 0 && (
              <div>
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-soft)] uppercase block mb-2">
                  ATTACHED LORAS ({generation.loras.length})
                </span>
                <div className="space-y-1.5">
                  {generation.loras.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Layers className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                        <span className="truncate text-[var(--ink)]">
                          {item.lora_name}
                        </span>
                      </div>
                      <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] border border-[var(--line)] shrink-0 ml-2">
                        {item.strength}x
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action CTAs Footer */}
          <div className="p-5 border-t border-[var(--line)] bg-[var(--surface)] space-y-2.5 mt-auto">
            <Link
              href={remixUrl}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(213,240,111,0.25)]"
            >
              <Zap className="h-4 w-4 fill-current stroke-current" />
              <span>Remix in Studio</span>
            </Link>

            <a
              href={generation.url}
              download={generation.filename}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] hover:border-[var(--line-strong)] transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Image</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
