"use client";

import React, { useState } from "react";
import { Zap, Sparkles, X, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export interface ProGateProps {
  children: React.ReactNode | ((isPro: boolean) => React.ReactNode);
  fallback?: React.ReactNode;
  featureName?: string;
  actionLabel?: string;
  showInlineUpsell?: boolean;
}

/**
 * Specialized Pro VIP Tier Gate wrapper.
 * Gated strictly to `isPro` (VIP Pro subscribers, Verified Authors, Moderators, Admins).
 */
export function ProGate({
  children,
  fallback,
  featureName = "SoloTensor Pro VIP Pipeline",
  actionLabel = "Upgrade to Pro VIP",
  showInlineUpsell = true,
}: ProGateProps) {
  const { isPro, switchRoleDemo } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  if (typeof children === "function") {
    return <>{children(isPro)}</>;
  }

  if (isPro) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showInlineUpsell) {
    return null;
  }

  return (
    <>
      {/* Brutalist Obsidian Pro Upgrade Trigger Banner */}
      <div className="rounded-xl border border-[var(--accent)]/30 bg-gradient-to-r from-[var(--surface-raised)] via-[var(--surface)] to-[var(--surface-raised)] p-3.5 shadow-[inset_0_1px_0_rgba(213,240,111,0.15)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] shadow-[0_0_12px_var(--accent-ambient)]">
            <Zap className="h-4 w-4 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                PRO VIP CLEARANCE
              </span>
            </div>
            <p className="font-sans text-xs font-semibold text-[var(--ink)]">
              {featureName}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] shadow-sm shrink-0"
        >
          <span>{actionLabel}</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Pro VIP Upsell Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="workspace-core w-full max-w-md p-6 shadow-[0_32px_96px_rgba(0,0,0,0.9)] space-y-4">
            <div className="flex items-start justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] shadow-[0_0_16px_var(--accent-ambient)]">
                  <Zap className="h-4 w-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--ink)] tracking-tight">
                    SoloTensor Pro VIP
                  </h3>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent)] font-semibold">
                    UNRESTRICTED GENERATIVE ENCLAVE
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--ink-soft)] leading-relaxed">
              Unlock dedicated GPU nodes, 4K synthesis pipelines, multi-run batch queues, and confidential private outputs.
            </p>

            <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent)] font-bold">⚡</span>
                <span className="font-mono text-[11px] text-[var(--ink)]">Priority Queue (~4s instant execution)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent)] font-bold">⚡</span>
                <span className="font-mono text-[11px] text-[var(--ink)]">4K Canvas Synthesis (up to 4096px / 100 steps)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent)] font-bold">⚡</span>
                <span className="font-mono text-[11px] text-[var(--ink)]">Confidential Private Output Enclave</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent)] font-bold">⚡</span>
                <span className="font-mono text-[11px] text-[var(--ink)]">High-Speed Model Safetensor Weight Downloads</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  switchRoleDemo("pro_creator");
                  setModalOpen(false);
                }}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition active:scale-[0.98] shadow-sm"
              >
                Activate Pro VIP Demo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ProGate;
