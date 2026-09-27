"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, ImageIcon, Box, Settings, Layers3, Wrench } from "lucide-react";

const NAV_ITEMS = [
  { id: "assets", icon: FolderOpen, label: "Library", href: "/assets" },
  { id: "generate", icon: ImageIcon, label: "Create", href: "/" },
  { id: "tools", icon: Wrench, label: "AI Tool Studio", href: "/tools" },
  { id: "models", icon: Box, label: "Models", href: null },
  { id: "settings", icon: Settings, label: "Settings", href: null },
] as const;

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="fixed bottom-0 left-0 z-40 flex h-[4.75rem] w-full items-center justify-center border-t border-[#292d28] bg-[#0b0c0b]/95 px-3 backdrop-blur-xl md:static md:h-full md:w-20 md:shrink-0 md:flex-col md:justify-start md:border-r md:border-t-0 md:px-0 md:py-5">
      <Link href="/" className="mr-auto flex h-10 w-10 items-center justify-center rounded-[.65rem] bg-[#d5f06f] text-[#171b08] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.97] md:mb-8 md:mr-0" aria-label="SoloTensor home">
        <Layers3 className="h-5 w-5" strokeWidth={2.2} />
      </Link>

      <div className="flex items-center gap-1 md:flex-col md:gap-2">
        {NAV_ITEMS.map(({ id, icon: Icon, label, href }) => {
          const active = href !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
          const content = (
            <span className={`group relative flex h-11 w-12 items-center justify-center rounded-lg transition-all duration-200 active:scale-[.96] ${active ? "bg-[#20231f] text-[#d5f06f]" : "text-[#6f716d] hover:bg-[#151715] hover:text-[#f2f0e9]"}`}>
              <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.8} />
              <span className="pointer-events-none absolute bottom-[calc(100%+.5rem)] left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#20231f] px-2 py-1 text-[10px] font-semibold text-[#f2f0e9] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 md:bottom-auto md:left-[calc(100%+.65rem)] md:block md:translate-x-0">{label}</span>
              {active && <span aria-hidden className="absolute bottom-0 h-0.5 w-5 rounded-full bg-[#d5f06f] md:-left-[.9rem] md:bottom-auto md:h-5 md:w-0.5" />}
            </span>
          );
          return href ? (
            <Link key={id} href={href} aria-label={label} aria-current={active ? "page" : undefined}>{content}</Link>
          ) : (
            <button key={id} type="button" aria-label={`${label} unavailable`} aria-disabled="true" className="cursor-not-allowed opacity-45">{content}</button>
          );
        })}
      </div>
    </nav>
  );
}
