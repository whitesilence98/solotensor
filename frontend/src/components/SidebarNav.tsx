"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Box, FolderOpen, ImageIcon, Layers3, MessageSquareCode, MoreHorizontal, Settings, Sparkles, Wrench } from "lucide-react";

const NAV_ITEMS = [
  { id: "assets", icon: FolderOpen, label: "Library", href: "/assets", primary: true },
  { id: "generate", icon: ImageIcon, label: "Create", href: "/", primary: true },
  { id: "tools", icon: Wrench, label: "AI Tool Studio", href: "/tools", primary: true },
  { id: "models", icon: Box, label: "Models", href: "/models", primary: true },
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
  const secondaryActive = NAV_ITEMS.some((item) => !item.primary && isActive(pathname, item.href));

  useEffect(() => setMoreOpen(false), [pathname]);

  const item = ({ id, icon: Icon, label, href, primary }: (typeof NAV_ITEMS)[number]) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={id}
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`${primary ? "flex" : "hidden md:flex"} group relative h-11 w-12 items-center justify-center rounded-[var(--radius-control)] transition duration-200 active:scale-[.96] ${active ? "bg-[var(--surface-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(6,182,212,.25)]" : "text-[var(--ink-faint)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"}`}
      >
        <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.8} />
        <span className="pointer-events-none absolute bottom-auto left-[calc(100%+.65rem)] hidden whitespace-nowrap rounded-[.35rem] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:block">{label}</span>
        {active && <span aria-hidden className="absolute bottom-0 h-0.5 w-5 rounded-full bg-[var(--accent)] md:-left-[.9rem] md:bottom-auto md:h-5 md:w-0.5" />}
      </Link>
    );
  };

  return (
    <nav aria-label="Primary navigation" className="fixed bottom-0 left-0 z-40 flex h-[var(--mobile-nav-height)] w-full items-center border-t border-[var(--line)] bg-[var(--overlay)] px-2 shadow-[0_-14px_32px_-24px_rgba(6,182,212,.2)] backdrop-blur-xl md:static md:h-full md:w-20 md:shrink-0 md:flex-col md:justify-start md:border-r md:border-t-0 md:px-0 md:py-5 md:shadow-[14px_0_32px_-28px_rgba(6,182,212,.15)]">
      <Link href="/" className="hidden h-10 w-10 items-center justify-center rounded-[.55rem] bg-[var(--accent)] text-[var(--accent-ink)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] active:scale-[.97] md:mb-8 md:flex" aria-label="SoloTensor home">
        <Layers3 className="h-5 w-5" strokeWidth={2.2} />
      </Link>

      <div className="flex w-full items-center justify-around gap-0.5 md:w-auto md:flex-col md:justify-start md:gap-2">
        {NAV_ITEMS.map(item)}
        <div className="relative md:hidden">
          <button
            type="button"
            aria-label="More destinations"
            aria-expanded={moreOpen}
            aria-controls="mobile-more-navigation"
            onClick={() => setMoreOpen((open) => !open)}
            className={`relative flex h-11 w-12 items-center justify-center rounded-[var(--radius-control)] transition active:scale-[.96] ${moreOpen || secondaryActive ? "bg-[var(--surface-soft)] text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
          >
            <MoreHorizontal className="h-5 w-5" />
            {secondaryActive && <span aria-hidden className="absolute bottom-0 h-0.5 w-5 rounded-full bg-[var(--accent)]" />}
          </button>
          {moreOpen && (
            <div id="mobile-more-navigation" className="absolute bottom-[calc(100%+.75rem)] right-0 w-52 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1.5 shadow-[0_18px_48px_-20px_rgba(0,0,0,.8)]">
              {NAV_ITEMS.filter(({ primary }) => !primary).map(({ id, icon: Icon, label, href }) => {
                const active = isActive(pathname, href);
                return <Link key={id} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-semibold transition ${active ? "bg-[var(--surface-soft)] text-[var(--accent)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"}`}><Icon className="h-4 w-4" />{label}</Link>;
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
