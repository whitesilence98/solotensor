"use client";

import { RotateCcw } from "lucide-react";
import { generationBlockReason, useEngineStatus } from "@/lib/useEngineStatus";

export default function EngineStatusBanner() {
  const { health, unreachable, checking, retry } = useEngineStatus();
  const issues = health ? [
    health.storage === "down" && "Storage is unavailable; saving and library access may fail.",
    health.database_status === "down" && "The studio database is unavailable; library data may fail to load.",
    health.comfy === "down" && "Studio Engine is offline. You can still browse the studio and library; generation requires the engine. Start the engine, then retry.",
  ].filter(Boolean) : [];
  const message = unreachable
    ? "Studio API is unreachable. Check that the studio service is running, then retry. Engine availability is unknown."
    : issues.join(" ");

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {message && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--ink)]">
          <p className="min-w-0 flex-1">{message}</p>
          <button
            type="button"
            onClick={retry}
            disabled={checking}
            title={generationBlockReason(health) ?? "Check studio connection"}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            {checking ? "Checking…" : "Retry connection"}
          </button>
        </div>
      )}
    </div>
  );
}
