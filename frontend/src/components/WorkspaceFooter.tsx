"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, HardDrive, Cpu, Terminal } from "lucide-react";

interface WorkspaceFooterProps {
  className?: string;
  containerClassName?: string;
}

export default function WorkspaceFooter({
  className = "",
  containerClassName = "max-w-[1600px]",
}: WorkspaceFooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      aria-label="Solo. Studio footer"
      className={`workspace-footer shrink-0 ${className}`}
    >
      <div className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${containerClassName}`}>
        {/* Main Grid: Studio Brand & Telemetry vs Navigation */}
        <div className="grid grid-cols-1 gap-10 py-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {/* Col 1 & 2: Brand Identity & Privacy Statement */}
          <div className="space-y-4 sm:col-span-2 lg:col-span-2">
            <Link
              href="/"
              className="group inline-flex items-center gap-3 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded-lg"
              aria-label="Solo. Studio home"
            >
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent-ambient)]"
                />
              </div>
              <div className="flex flex-col select-none">
                <div className="flex items-baseline">
                  <span className="font-heading text-lg font-black tracking-[-0.035em] text-[var(--ink)]">
                    SOLO<span className="text-[var(--accent)]">.</span>
                  </span>
                  <span className="ml-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                    STUDIO
                  </span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                  Autonomous Generative Studio
                </span>
              </div>
            </Link>

            <p className="max-w-md text-xs leading-relaxed text-[var(--ink-soft)]">
              A private, local-first studio for generating, curating, and executing visual AI workflows. Powered directly by your local machine with zero cloud telemetry or data egress.
            </p>

            {/* Privacy & Hardware Assurance Badge */}
            <div className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1.5 text-[11px] text-[var(--ink-soft)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                Zero Cloud Egress
              </span>
              <span className="text-[var(--line-strong)]">•</span>
              <span>100% Local GPU Execution</span>
            </div>
          </div>

          {/* Col 3: Studio Surfaces */}
          <div className="space-y-3">
            <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)]">
              Studio
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href="/"
                  className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:underline"
                >
                  Explore Feed
                </Link>
              </li>
              <li>
                <Link
                  href="/generate"
                  className="inline-flex items-center gap-1.5 text-[var(--ink-soft)] transition-colors hover:text-[var(--accent)] focus-visible:underline"
                >
                  <span>Interactive Canvas</span>
                  <span className="rounded bg-[var(--accent)]/10 px-1 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    Live
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href="/tools"
                  className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:underline"
                >
                  Tool Pipelines
                </Link>
              </li>
              <li>
                <Link
                  href="/models"
                  className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:underline"
                >
                  Model Vault
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Resources & Controls */}
          <div className="space-y-3">
            <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)]">
              Workspace
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href="/assets"
                  className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:underline"
                >
                  Creation Library
                </Link>
              </li>
              <li>
                <Link
                  href="/assist"
                  className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:underline"
                >
                  Code & Workflow Assist
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:underline"
                >
                  Runtime Settings
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 5: Local Telemetry & Nodes */}
          <div className="space-y-3">
            <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)]">
              Active Topology
            </h4>
            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[var(--ink-soft)]">
                  <Terminal className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                  FastAPI
                </span>
                <span className="text-[10px] text-[var(--ink-faint)]">:8000</span>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[var(--ink-soft)]">
                  <Cpu className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                  ComfyUI
                </span>
                <span className="text-[10px] text-[var(--ink-faint)]">:8188</span>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[var(--ink-soft)]">
                  <HardDrive className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                  Storage
                </span>
                <span className="text-[10px] text-[var(--ink-faint)]">Local SSD</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hairline Sub-Footer Bar */}
        <div className="flex flex-col gap-4 border-t border-[var(--line)] pt-6 pb-2 text-[11px] text-[var(--ink-faint)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-[var(--ink-soft)]">
              Solo. Studio
            </span>
            <span>•</span>
            <span>Preferences stored locally in this browser</span>
            <span>•</span>
            <span>Local ComfyUI inference runtime</span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-[var(--ink-soft)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              LOCAL-FIRST
            </span>
            <span className="text-[var(--ink-faint)]">© {currentYear}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
