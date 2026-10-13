"use client";

import React, { ReactNode } from "react";
import BrandLogo from "@/components/BrandLogo";
import CreditPill from "@/components/CreditPill";

export interface WorkspaceNavbarProps {
  subtitle: string;
  href?: string;
  badge?: ReactNode;
  statusText?: string;
  statusVariant?: "accent" | "warning" | "default";
  showCreditPill?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  maxWidth?: string;
}

export default function WorkspaceNavbar({
  subtitle,
  href = "/",
  badge,
  statusText,
  statusVariant = "accent",
  showCreditPill = true,
  actions,
  children,
  maxWidth = "max-w-[1600px]",
}: WorkspaceNavbarProps) {
  const statusDotClass =
    statusVariant === "warning"
      ? "bg-amber-400"
      : statusVariant === "accent"
        ? "bg-[var(--accent)]"
        : "bg-[var(--ink-faint)]";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--ground)]/90 backdrop-blur-md px-3.5 sm:px-4 py-2.5">
      <div className={`mx-auto flex ${maxWidth} flex-col gap-2.5`}>
        {/* Row 1: Brand Anchor + Title + Dynamic Status/Breadcrumb + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          {/* Left: Brand Identity & Subtitle & Badge */}
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size="sm" subtitle={subtitle} href={href} />
            {badge && (
              <>
                <div className="hidden h-4 w-px bg-[var(--line-strong)] sm:block" />
                <div className="hidden sm:flex items-center">{badge}</div>
              </>
            )}
          </div>

          {/* Right: Status pill, Credit pill & Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {statusText && (
              <div className="hidden items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-1 font-mono text-[9px] text-[var(--ink-faint)] uppercase tracking-wider md:flex">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                <span>{statusText}</span>
              </div>
            )}
            {showCreditPill && <CreditPill />}
            {actions}
          </div>
        </div>

        {/* Row 2 (Contextual Sub-bar): Search, Tabs, or Filters */}
        {children && (
          <div className="flex flex-col gap-2 border-t border-[var(--line)]/50 pt-2">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
