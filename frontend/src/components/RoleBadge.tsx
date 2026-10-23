"use client";

import React, { useMemo } from "react";
import {
  CheckCircle2,
  Flame,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { normalizeRoleName, type UserRole } from "@/lib/api";

export interface RoleBadgeProps {
  role?: string | null;
  size?: "xs" | "sm" | "md";
  variant?: "default" | "subtle" | "icon";
  showIcon?: boolean;
  className?: string;
  labelOverride?: string;
  title?: string;
}

interface RoleConfig {
  label: string;
  shortLabel: string;
  classes: string;
  subtleClasses: string;
  iconClasses: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  admin: {
    label: "ADMIN",
    shortLabel: "ADMIN",
    classes:
      "border-rose-500/40 bg-gradient-to-r from-rose-950/70 via-rose-950/40 to-black/60 text-rose-300 ring-1 ring-inset ring-rose-500/25 shadow-[inset_0_1px_0_rgba(251,113,133,0.15)]",
    subtleClasses:
      "border-rose-500/25 bg-rose-950/30 text-rose-400 ring-1 ring-inset ring-rose-500/10",
    iconClasses: "text-rose-400 fill-rose-500/20",
    icon: Flame,
    description: "System Staff Admin • Full Platform & Registry Governance",
  },
  moderator: {
    label: "MODERATOR",
    shortLabel: "MOD",
    classes:
      "border-sky-500/40 bg-gradient-to-r from-sky-950/70 via-sky-950/40 to-black/60 text-sky-300 ring-1 ring-inset ring-sky-500/25 shadow-[inset_0_1px_0_rgba(56,189,248,0.15)]",
    subtleClasses:
      "border-sky-500/25 bg-sky-950/30 text-sky-400 ring-1 ring-inset ring-sky-500/10",
    iconClasses: "text-sky-400 fill-sky-500/20",
    icon: ShieldCheck,
    description: "Community Moderator • Review Queue & Trust Operations",
  },
  verified_creator: {
    label: "VERIFIED AUTHOR",
    shortLabel: "VERIFIED",
    classes:
      "border-amber-500/45 bg-gradient-to-r from-amber-950/70 via-amber-950/40 to-black/60 text-amber-300 ring-1 ring-inset ring-amber-500/30 shadow-[inset_0_1px_0_rgba(245,198,110,0.2)]",
    subtleClasses:
      "border-amber-500/25 bg-amber-950/30 text-amber-400 ring-1 ring-inset ring-amber-500/10",
    iconClasses: "text-amber-400 fill-amber-500/20",
    icon: CheckCircle2,
    description: "Verified Partner Author • Certified Checkpoints & Model Revenue",
  },
  pro_creator: {
    label: "PRO VIP",
    shortLabel: "PRO",
    classes:
      "border-[var(--accent)]/45 bg-gradient-to-r from-[var(--accent)]/15 via-[var(--accent)]/10 to-black/60 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/30 shadow-[inset_0_1px_0_rgba(213,240,111,0.25)]",
    subtleClasses:
      "border-[var(--accent)]/25 bg-[var(--accent)]/5 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/10",
    iconClasses: "text-[var(--accent)] fill-[var(--accent)]",
    icon: Zap,
    description: "SoloTensor Pro VIP • Priority GPU Queue & 4K Pipelines",
  },
  creator: {
    label: "CREATOR",
    shortLabel: "CREATOR",
    classes:
      "border-neutral-700/80 bg-neutral-900/80 text-neutral-300 ring-1 ring-inset ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    subtleClasses:
      "border-neutral-800 bg-neutral-950/60 text-neutral-400 ring-1 ring-inset ring-white/[0.02]",
    iconClasses: "text-neutral-400",
    icon: Sparkles,
    description: "SoloTensor Creator • Daily Energy Pool & Generation Enclave",
  },
  user: {
    label: "USER",
    shortLabel: "USER",
    classes:
      "border-neutral-700/80 bg-neutral-900/80 text-neutral-300 ring-1 ring-inset ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    subtleClasses:
      "border-neutral-800 bg-neutral-950/60 text-neutral-400 ring-1 ring-inset ring-white/[0.02]",
    iconClasses: "text-neutral-400",
    icon: Sparkles,
    description: "Standard User • Generation & Community Participation",
  },
  guest: {
    label: "VISITOR",
    shortLabel: "GUEST",
    classes:
      "border-neutral-800/80 bg-neutral-950/70 text-neutral-400 ring-1 ring-inset ring-white/[0.02]",
    subtleClasses:
      "border-neutral-800/40 bg-transparent text-neutral-500",
    iconClasses: "text-neutral-500",
    icon: User,
    description: "Anonymous Explorer • Read-Only Public Feeds",
  },
};

export function RoleBadge({
  role,
  size = "sm",
  variant = "default",
  showIcon = true,
  className = "",
  labelOverride,
  title,
}: RoleBadgeProps) {
  const normRole = useMemo(() => normalizeRoleName(role), [role]);
  const config = ROLE_CONFIGS[normRole] || ROLE_CONFIGS.creator;
  const IconComponent = config.icon;

  const sizeClasses = useMemo(() => {
    switch (size) {
      case "xs":
        return variant === "icon"
          ? "h-[18px] w-[18px] p-0 justify-center rounded-[3px]"
          : "h-[18px] text-[9px] px-1.5 py-0 rounded-[3.5px] gap-1";
      case "md":
        return variant === "icon"
          ? "h-7 w-7 p-0 justify-center rounded-[6px]"
          : "h-7 text-[11px] px-2.5 py-0.5 rounded-[5px] gap-1.5";
      case "sm":
      default:
        return variant === "icon"
          ? "h-[22px] w-[22px] p-0 justify-center rounded-[4px]"
          : "h-[22px] text-[10px] px-2 py-0.5 rounded-[4px] gap-1.5";
    }
  }, [size, variant]);

  const iconSizes = useMemo(() => {
    switch (size) {
      case "xs":
        return "h-2.5 w-2.5";
      case "md":
        return "h-3.5 w-3.5";
      case "sm":
      default:
        return "h-3 w-3";
    }
  }, [size]);

  const variantClass = useMemo(() => {
    switch (variant) {
      case "subtle":
        return config.subtleClasses;
      case "icon":
      case "default":
      default:
        return config.classes;
    }
  }, [variant, config]);

  const displayText = useMemo(() => {
    if (labelOverride) return labelOverride;
    if (size === "xs") return config.shortLabel;
    return config.label;
  }, [labelOverride, size, config]);

  const tooltipText = title || config.description;

  return (
    <span
      title={tooltipText}
      className={`inline-flex items-center font-mono font-bold tracking-[0.06em] uppercase border select-none transition-all duration-150 hover:brightness-110 active:scale-[0.98] cursor-default ${sizeClasses} ${variantClass} ${className}`}
    >
      {showIcon && (
        <IconComponent
          className={`${iconSizes} shrink-0 ${config.iconClasses}`}
        />
      )}
      {variant !== "icon" && <span className="leading-none">{displayText}</span>}
    </span>
  );
}

export default RoleBadge;
