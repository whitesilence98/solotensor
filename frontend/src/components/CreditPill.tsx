"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Clock, Loader2, Sparkles, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00h 00m 00s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export default function CreditPill({
  className = "",
}: {
  className?: string;
}) {
  const { credits, isAuthenticated, claimDaily, openAuthModal } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const percentage = Math.min(
    100,
    Math.max(0, Math.round((credits.balance / credits.dailyAllowance) * 100))
  );

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  const handleClaim = async () => {
    if (!isAuthenticated) {
      setIsOpen(false);
      openAuthModal();
      return;
    }
    setClaimBusy(true);
    setClaimFeedback(null);
    try {
      const res = await claimDaily();
      setClaimFeedback(res.message);
      setTimeout(() => setClaimFeedback(null), 3000);
    } catch {
      setClaimFeedback("Could not claim credits");
    } finally {
      setClaimBusy(false);
    }
  };

  // Close popover on escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative inline-flex items-center ${className}`}
    >
      {/* Pill Badge Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Studio credits: ${credits.balance} of ${credits.dailyAllowance}`}
        className="group flex h-8 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 transition-all duration-200 hover:border-[var(--accent)] hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:border-[var(--accent)]"
      >
        {/* Lightning Bolt with Glow */}
        <span className="flex h-4 w-4 items-center justify-center text-[var(--accent)] transition-transform duration-200 group-hover:scale-110">
          <Zap className="h-3.5 w-3.5 fill-current" />
        </span>

        {/* Tabular Credit Readout */}
        <div className="flex items-center gap-1 font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
          <span>{credits.balance}</span>
          <span className="text-[var(--ink-faint)]">/</span>
          <span className="text-[var(--ink-faint)]">{credits.dailyAllowance}</span>
        </div>

        {/* Live Mini Meter Indicator */}
        <div className="relative h-1.5 w-6 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-sunken)]">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </button>

      {/* TensorArt-style Obsidian Hover Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Studio Energy & Credits"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 shadow-[0_24px_72px_rgba(0,0,0,0.85)] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
            <div>
              <div className="workspace-kicker mb-0.5">ENERGY POOL // STATUS</div>
              <h3 className="font-mono text-xs font-bold text-[var(--ink)]">
                Daily Studio Energy
              </h3>
            </div>
            <span className="flex items-center gap-1 rounded bg-[var(--accent)]/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] border border-[var(--accent)]/20">
              ⚡ LIVE
            </span>
          </div>

          {/* Large Balance Display */}
          <div className="my-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                {credits.balance}
                <span className="text-sm font-normal text-[var(--ink-faint)]">
                  {" "}/ {credits.dailyAllowance}
                </span>
              </span>
              <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                {percentage}%
              </span>
            </div>

            {/* High-Contrast Hairline Gauge Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 shadow-[0_0_12px_rgba(213,240,111,0.4)]"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Daily Reset Countdown Timer */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-2 mb-3">
            <div className="flex items-center gap-1.5 text-[var(--ink-faint)]">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono text-[10px] uppercase tracking-wider">
                Resets In
              </span>
            </div>
            <span className="font-mono text-xs font-bold tabular-nums text-[var(--ink)]">
              {formatCountdown(credits.nextResetInSeconds)}
            </span>
          </div>

          {/* Claim Action Button */}
          {isAuthenticated ? (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleClaim}
                disabled={claimBusy || credits.balance >= credits.dailyAllowance}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {claimBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : credits.balance >= credits.dailyAllowance ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Energy Pool Full</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Claim Daily Energy (+25 ⚡)</span>
                  </>
                )}
              </button>
              {claimFeedback && (
                <p className="font-mono text-[10px] text-center text-[var(--accent)]">
                  {claimFeedback}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  openAuthModal();
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98]"
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                <span>Sign In to Claim Energy</span>
              </button>
            </div>
          )}

          {/* Technical Explainer Microcopy */}
          <div className="mt-3 border-t border-[var(--line)] pt-2.5">
            <p className="font-mono text-[9px] leading-relaxed text-[var(--ink-faint)] uppercase">
              Generations consume 2-4 credits on remote nodes. Local runs are free & unlimited.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
