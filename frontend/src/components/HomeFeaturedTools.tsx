"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Camera,
  Film,
  Flame,
  Image as ImageIcon,
  PenTool,
  Smile,
  Sparkles,
  UserCheck,
  UserPlus,
  Wand2,
  Wrench,
} from "lucide-react";
import type { ToolSummary } from "@/lib/api";

interface FeaturedToolDef {
  id: string;
  name: string;
  badge?: string;
  desc: string;
  icon: typeof Wand2;
  iconColor: string;
  iconBg: string;
  queryKey: string;
  defaultHref: string;
  /** The tile is a fixed product surface, not a backend-tool shortcut. */
  pinnedHref?: boolean;
}

const FEATURED_TOOLS_LIST: FeaturedToolDef[] = [
  {
    id: "oc-creator",
    name: "OC Creator",
    badge: "New",
    desc: "Design original character from scratch",
    icon: UserPlus,
    iconColor: "text-[var(--accent)]",
    iconBg: "bg-[var(--accent)]/10 border-[var(--accent)]/20",
    queryKey: "character",
    defaultHref: "/generate?mode=character",
  },
  {
    id: "design-agent",
    name: "Shot Director",
    badge: "New",
    desc: "Plan shots with an AI director, then open them in Generate",
    icon: Film,
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10 border-cyan-500/20",
    queryKey: "agent",
    defaultHref: "/flow",
    // Shot Director is a product surface. A backend tool whose name happens to
    // match "agent" must not hijack the tile away from /flow.
    pinnedHref: true,
  },
  {
    id: "anime-lab",
    name: "Anime Lab",
    desc: "Anime characters, scenes, and stylized visuals",
    icon: Smile,
    iconColor: "text-pink-400",
    iconBg: "bg-pink-500/10 border-pink-500/20",
    queryKey: "anime",
    defaultHref: "/generate?mode=anime",
  },
  {
    id: "photoreal-studio",
    name: "Photoreal Studio",
    desc: "Generate lifelike photography and portraits",
    icon: Camera,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10 border-amber-500/20",
    queryKey: "photoreal",
    defaultHref: "/generate?mode=photoreal",
  },
  {
    id: "smart-edit",
    name: "Smart Edit",
    desc: "Easily modify, enhance, or transform any asset",
    icon: Wand2,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    queryKey: "edit",
    defaultHref: "/tools",
  },
  {
    id: "create-from-ref",
    name: "Create from Reference",
    desc: "Create any video/image from your reference inputs",
    icon: ImageIcon,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/10 border-blue-500/20",
    queryKey: "reference",
    defaultHref: "/generate?mode=img2img",
  },
  {
    id: "digital-avatar",
    name: "Digital Avatar",
    desc: "A virtual you for any digital space",
    icon: UserCheck,
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-500/10 border-indigo-500/20",
    queryKey: "avatar",
    defaultHref: "/generate?mode=avatar",
  },
  {
    id: "motion-pose-ref",
    name: "Motion & Pose Ref",
    desc: "Guide poses, movements, and camera angles",
    icon: Activity,
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/10 border-purple-500/20",
    queryKey: "pose",
    defaultHref: "/tools",
  },
  {
    id: "sns-trends",
    name: "SNS Trends",
    desc: "Remix hot trends creations instantly",
    icon: Flame,
    iconColor: "text-orange-400",
    iconBg: "bg-orange-500/10 border-orange-500/20",
    queryKey: "trends",
    defaultHref: "/assets",
  },
  {
    id: "brand-design",
    name: "Brand Design",
    desc: "Create logos, brand visuals, and mockups",
    icon: PenTool,
    iconColor: "text-teal-400",
    iconBg: "bg-teal-500/10 border-teal-500/20",
    queryKey: "brand",
    defaultHref: "/generate?mode=brand",
  },
];

interface HomeFeaturedToolsProps {
  tools?: ToolSummary[];
}

export default function HomeFeaturedTools({ tools = [] }: HomeFeaturedToolsProps) {
  // Map tools from backend if available
  const toolMap = useMemo(() => {
    const map = new Map<string, ToolSummary>();
    for (const tool of tools) {
      const lower = tool.name.toLowerCase();
      map.set(lower, tool);
      if (lower.includes("character")) map.set("character", tool);
      if (lower.includes("edit") || lower.includes("smart")) map.set("edit", tool);
      if (lower.includes("anime")) map.set("anime", tool);
      if (lower.includes("pose") || lower.includes("motion")) map.set("pose", tool);
      if (lower.includes("cyber") || lower.includes("city")) map.set("cyber", tool);
    }
    return map;
  }, [tools]);

  return (
    <section className="space-y-3.5" aria-labelledby="featured-tools-heading">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4.5 w-4.5 text-[var(--accent)]" />
          <h2
            id="featured-tools-heading"
            className="font-heading text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]"
          >
            Featured
          </h2>
          <span className="font-mono text-xs font-semibold text-[var(--ink-faint)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded-full border border-[var(--line)]">
            AI Tools
          </span>
        </div>

        <Link
          href="/tools"
          className="group inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          <span>Explore all tools</span>
          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* 2 Rows x 5 Columns Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {FEATURED_TOOLS_LIST.map((item) => {
          const Icon = item.icon;
          // Check if real backend tool matched
          const matched = toolMap.get(item.queryKey) || toolMap.get(item.name.toLowerCase());
          const targetHref =
            item.pinnedHref || !matched
              ? item.defaultHref
              : `/tools/${encodeURIComponent(matched.tool_id)}`;

          return (
            <Link
              key={item.id}
              href={targetHref}
              className="group relative flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 transition-all duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:shadow-md"
            >
              {/* Icon Container */}
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105 ${item.iconBg} ${item.iconColor}`}
              >
                <Icon className="h-5 w-5" />
              </div>

              {/* Text Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate font-heading text-xs sm:text-[13px] font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                    {item.name}
                  </h3>
                  {item.badge && (
                    <span className="shrink-0 rounded bg-[var(--accent)] px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent-ink)] shadow-sm">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-[var(--ink-soft)]">
                  {item.desc}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
