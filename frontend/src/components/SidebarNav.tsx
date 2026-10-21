"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, ChevronRight, Folder, Home, MessageSquareCode, MoreHorizontal, Settings, Shield, Wand2, Wrench } from "lucide-react";
import UserNavProfile from "./UserNavProfile";
import BrandLogo, { TensorPrismEmblem } from "./BrandLogo";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  href: string;
  primary: boolean;
}

const BASE_NAV_ITEMS: readonly NavItem[] = [
  { id: "home", icon: Home, label: "Explore", href: "/", primary: true },
  { id: "generate", icon: Wand2, label: "Generate", href: "/generate", primary: true },
  { id: "tools", icon: Wrench, label: "Tool studio", href: "/tools", primary: true },
  { id: "models", icon: Box, label: "Models", href: "/models", primary: true },
  { id: "assets", icon: Folder, label: "Library", href: "/assets", primary: true },
  { id: "assist", icon: MessageSquareCode, label: "Code Assist", href: "/assist", primary: false },
  { id: "settings", icon: Settings, label: "Settings", href: "/settings", primary: false },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/generate") return pathname === "/generate" || pathname.startsWith("/generate");
  if (href === "/models") return pathname === "/models" || pathname.startsWith("/models");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SparkleStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" />
    </svg>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { isMod, isAdmin, pendingReviewCount } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreSheetRef = useRef<HTMLDivElement>(null);

  const navItems = useMemo<NavItem[]>(() => {
    const items = [...BASE_NAV_ITEMS];
    if (isMod || isAdmin) {
      items.push({
        id: "moderation",
        icon: Shield,
        label: "Moderation",
        href: "/admin/moderation",
        primary: false,
      });
    }
    return items;
  }, [isMod, isAdmin]);

  const secondaryActive = navItems.some((item) => !item.primary && isActive(pathname, item.href));

  const closeMore = () => setMoreOpen(false);

  useEffect(() => closeMore(), [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const sheet = moreSheetRef.current;
    sheet?.querySelector<HTMLElement>("a")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMore();
        moreButtonRef.current?.focus();
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  const primaryNavItems = useMemo(
    () => navItems.filter((item) => item.id !== "settings"),
    [navItems]
  );
  const settingsItem = useMemo(
    () => navItems.find((item) => item.id === "settings"),
    [navItems]
  );

  const item = ({ id, icon: Icon, label, href, primary }: NavItem) => {
    const active = isActive(pathname, href);
    const hasPending = id === "moderation" && pendingReviewCount > 0;
    const isGenerate = id === "generate";

    return (
      <Link
        key={id}
        href={href}
        aria-label={hasPending ? `${label} (${pendingReviewCount} pending)` : label}
        aria-current={active ? "page" : undefined}
        className={`group relative flex h-11 w-11 items-center justify-center transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 ${
          primary ? "" : "hidden md:flex"
        } ${
          active
            ? isGenerate
              ? "ai-magic-active text-white"
              : "text-[#0b0d0e]"
            : isGenerate
              ? "text-white"
              : "text-[var(--ink-faint)] hover:text-white"
        }`}
      >
        {/* Active Left-Edge Docked Indicator Pill (Desktop Only) */}
        {active && (
          <span
            className={`pointer-events-none absolute -left-[14px] top-1/2 -translate-y-1/2 hidden md:block h-6 w-1 rounded-r-full z-30 ${
              isGenerate
                ? "bg-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.85)]"
                : "bg-[#d5f06f] shadow-[0_0_10px_rgba(213,240,111,0.85)]"
            }`}
            aria-hidden="true"
          />
        )}

        {/* Normal Nav Item Active State: Glowing Lime Squircle (Matches User Reference Image) */}
        {active && !isGenerate && (
          <span
            className="absolute inset-0 rounded-2xl bg-[#d5f06f] shadow-[0_0_22px_rgba(213,240,111,0.55),0_0_44px_rgba(213,240,111,0.18)]"
            aria-hidden="true"
          />
        )}

        {/* Normal Nav Item Inactive Hover State */}
        {!active && !isGenerate && (
          <span
            className="absolute inset-0 rounded-2xl bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            aria-hidden="true"
          />
        )}

        {/* AI MAGIC: SELECTED STATE (Matches User Reference Image Column 3) */}
        {active && isGenerate && (
          <>
            {/* Luminous Solid Cyan-to-Blue Gradient Fill with Ambient Neon Bloom */}
            <span
              className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[#38bdf8] via-[#0ea5e9] to-[#2563eb] shadow-[0_0_24px_rgba(56,189,248,0.7),0_0_48px_rgba(14,165,233,0.4),inset_0_1px_1px_rgba(255,255,255,0.7)] pointer-events-none z-[1]"
              aria-hidden="true"
            />

            {/* Glowing Cyan Bead / Pip on Top-Right Corner */}
            <span
              className="absolute -top-0.5 -right-0.5 z-20 h-2.5 w-2.5 rounded-full bg-[#a5f3fc] border border-white/70 shadow-[0_0_10px_#38bdf8,0_0_18px_#0ea5e9]"
              aria-hidden="true"
            />
          </>
        )}

        {/* AI MAGIC: HOVER STATE (Matches User Reference Image Column 2) */}
        {!active && isGenerate && (
          <>
            {/* Ambient Neon Glow Aura */}
            <span
              className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-[#c084fc]/35 via-transparent to-[#38bdf8]/45 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              aria-hidden="true"
            />

            {/* Squircle Container with Gradient Border */}
            <span
              className="absolute inset-0 rounded-2xl p-[1.5px] bg-gradient-to-tr from-[#c084fc] via-[#818cf8] to-[#38bdf8] opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none shadow-[0_0_16px_rgba(56,189,248,0.35)]"
              aria-hidden="true"
            >
              <span className="block h-full w-full rounded-[14px] bg-[#0c0e15]/90 backdrop-blur-sm" />
            </span>

            {/* Floating External Sparkles */}
            <span
              className="pointer-events-none absolute inset-0 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100"
              aria-hidden="true"
            >
              {/* Top-left primary 4-point star */}
              <span className="absolute -top-1 -left-1 text-[#38bdf8] animate-sparkle">
                <SparkleStar className="h-2.5 w-2.5 drop-shadow-[0_0_4px_#38bdf8]" />
              </span>
              {/* Top-left secondary dot */}
              <span className="absolute top-1.5 -left-1.5 h-1 w-1 rounded-full bg-[#7dd3fc] shadow-[0_0_4px_#7dd3fc]" />
              
              {/* Bottom-right primary 4-point star */}
              <span className="absolute -bottom-1 -right-1 text-[#e879f9] animate-sparkle" style={{ animationDelay: "0.6s" }}>
                <SparkleStar className="h-2 w-2 drop-shadow-[0_0_4px_#e879f9]" />
              </span>
              {/* Bottom-right secondary dot */}
              <span className="absolute bottom-1.5 -right-1.5 h-1 w-1 rounded-full bg-[#c084fc] shadow-[0_0_4px_#c084fc]" />
            </span>
          </>
        )}

        {/* The Icon */}
        <Icon
          className={`relative z-10 h-5 w-5 transition-transform duration-200 group-hover:scale-105 ${
            isGenerate ? "ai-magic-icon" : ""
          }`}
          strokeWidth={active && !isGenerate ? 2 : isGenerate ? 1.8 : 1.6}
        />

        {/* Pending Review Badge (for moderation) */}
        {hasPending && (
          <span className="absolute top-1 right-1 z-20 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/25 px-1 font-mono text-[9px] font-black text-amber-300 border border-amber-500/60 shadow-sm animate-pulse">
            {pendingReviewCount}
          </span>
        )}

        {/* Tooltip Pill (Matches User Reference Image) */}
        <span className="pointer-events-none absolute left-[calc(100%+.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#15171e] px-3 py-1 text-xs font-semibold tracking-wide text-white opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:flex items-center gap-1.5 z-50">
          {isGenerate ? (
            <>
              <span className="text-[#38bdf8] text-xs">🪄</span>
              <span>Generate</span>
            </>
          ) : hasPending ? (
            `${label} (${pendingReviewCount} pending review)`
          ) : (
            label
          )}
        </span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-[max(.75rem,env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 h-[4.5rem] w-auto workspace-bezel md:workspace-none md:relative md:bottom-auto md:left-auto md:right-auto md:my-0 md:ml-0 md:h-full md:w-[4.5rem] md:shrink-0 md:rounded-none md:border-y-0 md:border-l-0 md:border-r md:border-white/[0.08] md:bg-[#0c0e12]/95 md:backdrop-blur-xl md:shadow-[1px_0_0_0_rgba(255,255,255,0.02)]"
    >
      {/* SVG Gradient Definitions for AI Magic Wand Icon */}
      <svg width="0" height="0" className="absolute -z-50 pointer-events-none opacity-0" aria-hidden="true">
        <defs>
          <linearGradient id="ai-magic-wand-gradient" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
          <linearGradient id="ai-magic-wand-gradient-bright" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="45%" stopColor="#a5b4fc" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>
      </svg>

      <div className="workspace-core md:border-0 md:rounded-none md:bg-transparent md:shadow-none flex h-full items-center justify-between px-2 md:flex-col md:justify-between md:px-0 md:py-4 relative">
        {/* Top Section: Brand Squircle Badge & Main Navigation */}
        <div className="flex flex-1 items-center justify-between gap-1 md:w-full md:flex-none md:flex-col md:items-center">
          {/* Desktop Brand Squircle Badge (Matches Reference Image) */}
          <div className="group relative z-10 hidden md:mb-5 md:flex items-center justify-center">
            <Link
              href="/"
              className="group relative flex h-11 w-11 flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#16181d] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-[var(--accent)] hover:shadow-[0_0_16px_rgba(213,240,111,0.2)] active:scale-95 select-none"
              aria-label="SoloTensor Studio Home"
            >
              <div className="flex flex-col items-center justify-center -space-y-0.5 leading-none">
                <span className="text-[12px] font-black tracking-tight text-[#d5f06f]">solo/</span>
                <span className="text-[10.5px] font-semibold tracking-tight text-white/90">studio</span>
              </div>
              <span className="pointer-events-none absolute left-[calc(100%+.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#15171e] px-3 py-1 font-heading text-xs font-bold tracking-tight text-white opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:block z-50">
                SOLOTENSOR<span className="text-[var(--accent)] font-extrabold">.</span>
              </span>
            </Link>
          </div>

          {/* Desktop Main Navigation Items List */}
          <div className="hidden md:flex md:w-full md:flex-col md:items-center md:gap-2">
            {primaryNavItems.map(item)}
          </div>

          {/* Mobile Bottom Navigation Bar Items */}
          <div className="flex flex-1 items-center justify-between gap-1 md:hidden">
            {navItems.filter((i) => i.primary).map(item)}

            <button
              ref={moreButtonRef}
              type="button"
              aria-label="More destinations"
              aria-expanded={moreOpen}
              aria-controls="mobile-more-navigation"
              onClick={() => setMoreOpen((open) => !open)}
              className={`group relative flex h-11 w-11 items-center justify-center transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px md:hidden ${
                moreOpen || secondaryActive ? "text-[var(--accent-ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {(moreOpen || secondaryActive) && (
                <span
                  className="absolute inset-1 rounded-lg bg-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),_0_8px_20px_rgba(255,255,255,0.2)]"
                  aria-hidden="true"
                />
              )}
              {!(moreOpen || secondaryActive) && (
                <span
                  className="absolute inset-1 rounded-lg hover:bg-[var(--surface-soft)] transition-colors duration-[200ms]"
                  aria-hidden="true"
                />
              )}
              <MoreHorizontal className="relative z-10 h-5 w-5" strokeWidth={1.5} />
              {secondaryActive && (
                <span
                  aria-hidden
                  className="absolute bottom-2 right-2 z-20 h-1.5 w-1.5 rounded-full bg-[var(--ground)] border-[0.5px] border-[var(--accent)]"
                />
              )}
            </button>

            <UserNavProfile />
          </div>
        </div>

        {/* Desktop Bottom Controls: Settings, Hairline Dividers, Expand Chevron, Profile */}
        <div className="hidden md:flex md:w-full md:flex-col md:items-center md:mt-auto">
          {/* Hairline Divider above Settings */}
          <div className="w-7 h-px bg-white/[0.08] mb-2" aria-hidden="true" />

          {/* Settings Nav Item */}
          {settingsItem && item(settingsItem)}

          {/* Hairline Divider below Settings */}
          <div className="w-7 h-px bg-white/[0.08] my-2" aria-hidden="true" />

          {/* Expand / Drawer Toggle Chevron Button (Matches Reference Image) */}
          <button
            type="button"
            aria-label="Expand sidebar"
            className="group relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--ink-faint)] transition-all duration-200 hover:bg-white/[0.06] hover:text-white active:scale-95 mb-2.5"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.75} />
            <span className="pointer-events-none absolute left-[calc(100%+.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#15171e] px-3 py-1 text-xs font-medium text-white opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-opacity duration-200 group-hover:opacity-100 z-50 md:block">
              Expand
            </span>
          </button>

          {/* User Profile Avatar with Presence Indicator */}
          <UserNavProfile />
        </div>
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onMouseDown={closeMore}>
          <div
            id="mobile-more-navigation"
            ref={moreSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More destinations"
            onMouseDown={(event) => event.stopPropagation()}
            className="workspace-bezel absolute bottom-[calc(max(.75rem,env(safe-area-inset-bottom,0px))+5.25rem)] left-3 right-3 shadow-[0_32px_96px_rgba(0,0,0,0.8)]"
          >
            <div className="workspace-core p-2">
              <div className="px-3 pb-2.5 pt-2 border-b border-[var(--line)] mb-2">
                <BrandLogo size="sm" subtitle="AI CREATION STUDIO" />
              </div>
              {navItems
                .filter(({ primary }) => !primary)
                .map(({ id, icon: Icon, label, href }) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link
                      key={id}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        active
                          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <span
                        className={`workspace-icon-island h-8 w-8 ${
                          active ? "bg-transparent text-[var(--accent-ink)]" : ""
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" strokeWidth={1.5} />
                      </span>
                      {label}
                    </Link>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
