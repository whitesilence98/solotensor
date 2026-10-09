"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Box, FolderOpen, ImageIcon, Layers3, MessageSquareCode, MoreHorizontal, Settings, Sparkles, Wrench } from "lucide-react";

const NAV_ITEMS = [
  { id: "assets", icon: FolderOpen, label: "Library", href: "/assets", primary: true },
  { id: "generate", icon: ImageIcon, label: "Generate", href: "/", primary: true },
  { id: "tools", icon: Wrench, label: "Tool studio", href: "/tools", primary: true },
  { id: "models", icon: Box, label: "Model studio", href: "/models", primary: true },
  { id: "model-gallery", icon: Sparkles, label: "Model gallery", href: "/models/gallery", primary: false },
  { id: "assist", icon: MessageSquareCode, label: "Code Assist", href: "/assist", primary: false },
  { id: "settings", icon: Settings, label: "Settings", href: "/settings", primary: false },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/models") return pathname === "/models";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SidebarNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreSheetRef = useRef<HTMLDivElement>(null);
  const secondaryActive = NAV_ITEMS.some((item) => !item.primary && isActive(pathname, item.href));

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

  const item = ({ id, icon: Icon, label, href, primary }: (typeof NAV_ITEMS)[number]) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={id}
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`group relative flex h-11 w-11 items-center justify-center transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px ${primary ? "" : "hidden md:flex"} ${active ? "text-[var(--accent-ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"}`}
      >
        {active && (
          <span className="absolute inset-1 rounded-lg bg-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),_0_8px_20px_rgba(255,255,255,0.2)]" aria-hidden="true" />
        )}
        {!active && (
          <span className="absolute inset-1 rounded-lg hover:bg-[var(--surface-soft)] transition-colors duration-[200ms]" aria-hidden="true" />
        )}
        <Icon className="relative z-10 h-5 w-5" strokeWidth={1.5} />
        <span className="pointer-events-none absolute left-[calc(100%+.85rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-semibold tracking-wide text-[var(--ink)] opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-[opacity] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-visible:opacity-100 md:block z-50">
          {label}
        </span>
      </Link>
    );
  };

  return (
    <nav aria-label="Primary navigation" className="workspace-bezel fixed bottom-[max(.75rem,env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 h-[4.5rem] w-auto md:relative md:bottom-auto md:left-auto md:right-auto md:my-4 md:ml-4 md:h-[calc(100%-2rem)] md:w-[4.5rem] md:shrink-0">
      <div className="workspace-core flex h-full items-center justify-between px-2 md:flex-col md:justify-start md:px-0 md:py-3 relative">
        <Link href="/" className="group relative z-10 hidden h-11 w-11 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_6px_22px_rgba(255,255,255,0.15)] transition-transform duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95 md:mb-6 md:flex" aria-label="SoloTensor home">
          <svg aria-hidden="true" viewBox="0 0 32 32" className="h-5 w-5 fill-none" stroke="currentColor" strokeWidth="2">
            <path d="m16 3 10 5.8v14.4L16 29 6 23.2V8.8L16 3Z" />
            <path d="m6 8.8 10 5.8 10-5.8M16 14.6V29" />
            <path d="m11 11.7 10 5.8" opacity=".55" />
          </svg>
        </Link>

        <div className="flex flex-1 items-center justify-between gap-1 md:w-full md:flex-none md:flex-col md:gap-1.5">
          {NAV_ITEMS.map(item)}
          
          <div className="hidden md:block w-6 h-px bg-[var(--line-strong)] my-2 rounded-full" />
          
          <button
            ref={moreButtonRef}
            type="button"
            aria-label="More destinations"
            aria-expanded={moreOpen}
            aria-controls="mobile-more-navigation"
            onClick={() => setMoreOpen((open) => !open)}
            className={`group relative flex h-11 w-11 items-center justify-center transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px md:hidden ${moreOpen || secondaryActive ? "text-[var(--accent-ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"}`}
          >
            {(moreOpen || secondaryActive) && (
              <span className="absolute inset-1 rounded-lg bg-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),_0_8px_20px_rgba(255,255,255,0.2)]" aria-hidden="true" />
            )}
            {!(moreOpen || secondaryActive) && (
              <span className="absolute inset-1 rounded-lg hover:bg-[var(--surface-soft)] transition-colors duration-[200ms]" aria-hidden="true" />
            )}
            <MoreHorizontal className="relative z-10 h-5 w-5" strokeWidth={1.5} />
            {secondaryActive && <span aria-hidden className="absolute bottom-2 right-2 z-20 h-1.5 w-1.5 rounded-full bg-[var(--ground)] border-[0.5px] border-[var(--accent)]" />}
          </button>
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
              <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-faint)]">More</div>
              {NAV_ITEMS.filter(({ primary }) => !primary).map(({ id, icon: Icon, label, href }) => {
                const active = isActive(pathname, href);
                return (
                  <Link key={id} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${active ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"}`}>
                    <span className={`workspace-icon-island h-8 w-8 ${active ? 'bg-transparent text-[var(--accent-ink)]' : ''}`}><Icon className="h-4.5 w-4.5" strokeWidth={1.5} /></span>
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
