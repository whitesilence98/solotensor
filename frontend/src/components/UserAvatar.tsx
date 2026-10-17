"use client";

import React, { useMemo, useState } from "react";
import { normalizeRoleName, type UserRole } from "@/lib/api";

export interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  username?: string | null;
  role?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  shape?: "square" | "circle";
  showRoleRing?: boolean;
  online?: boolean;
  className?: string;
  title?: string;
}

const SIZE_CONFIGS = {
  xs: {
    dimension: 20,
    containerClass: "h-5 w-5",
    textClass: "text-[9px]",
    dotClass: "h-1.5 w-1.5 -bottom-0.5 -right-0.5 border",
    borderClass: "border",
    roundedClass: "rounded-[4px]",
  },
  sm: {
    dimension: 28,
    containerClass: "h-7 w-7",
    textClass: "text-[11px]",
    dotClass: "h-2 w-2 -bottom-0.5 -right-0.5 border",
    borderClass: "border",
    roundedClass: "rounded-[6px]",
  },
  md: {
    dimension: 36,
    containerClass: "h-9 w-9",
    textClass: "text-xs",
    dotClass: "h-2.5 w-2.5 -bottom-0.5 -right-0.5 border-[1.5px]",
    borderClass: "border",
    roundedClass: "rounded-lg",
  },
  lg: {
    dimension: 44,
    containerClass: "h-11 w-11",
    textClass: "text-sm",
    dotClass: "h-3 w-3 -bottom-0.5 -right-0.5 border-2",
    borderClass: "border-[1.5px]",
    roundedClass: "rounded-xl",
  },
  xl: {
    dimension: 64,
    containerClass: "h-16 w-16",
    textClass: "text-lg font-bold",
    dotClass: "h-3.5 w-3.5 bottom-0 right-0 border-2",
    borderClass: "border-2",
    roundedClass: "rounded-2xl",
  },
  "2xl": {
    dimension: 84,
    containerClass: "h-[84px] w-[84px]",
    textClass: "text-2xl font-bold",
    dotClass: "h-4 w-4 bottom-0.5 right-0.5 border-2",
    borderClass: "border-2",
    roundedClass: "rounded-full",
  },
};

const ROLE_PALETTES: Record<
  UserRole,
  {
    accent: string;
    glow: string;
    border: string;
    badgeName: string;
  }
> = {
  admin: {
    accent: "#fb7185", // rose-400
    glow: "rgba(251, 113, 133, 0.3)",
    border: "rgba(251, 113, 133, 0.4)",
    badgeName: "Admin",
  },
  moderator: {
    accent: "#38bdf8", // sky-400
    glow: "rgba(56, 189, 248, 0.3)",
    border: "rgba(56, 189, 248, 0.4)",
    badgeName: "Moderator",
  },
  verified_creator: {
    accent: "#f5c66e", // amber-300
    glow: "rgba(245, 198, 110, 0.3)",
    border: "rgba(245, 198, 110, 0.45)",
    badgeName: "Verified Author",
  },
  pro_creator: {
    accent: "#c7e36a", // acid-lime
    glow: "rgba(199, 227, 106, 0.35)",
    border: "rgba(199, 227, 106, 0.5)",
    badgeName: "Pro VIP",
  },
  creator: {
    accent: "#cbd5e1", // slate-300
    glow: "rgba(203, 213, 225, 0.15)",
    border: "rgba(203, 213, 225, 0.25)",
    badgeName: "Creator",
  },
  guest: {
    accent: "#858e82", // ink-faint
    glow: "rgba(133, 142, 130, 0.15)",
    border: "rgba(133, 142, 130, 0.25)",
    badgeName: "Guest",
  },
};

// Deterministic fast hash for generating consistent procedural motifs
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function UserAvatar({
  src,
  name,
  username,
  role,
  size = "md",
  shape = "square",
  showRoleRing = false,
  online,
  className = "",
  title,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const normRole = useMemo(() => normalizeRoleName(role), [role]);
  const palette = ROLE_PALETTES[normRole] || ROLE_PALETTES.creator;
  const config = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;

  const effectiveShape = size === "2xl" ? "circle" : shape;
  const radiusClass =
    effectiveShape === "circle" ? "rounded-full" : config.roundedClass;

  const identifier = username || name || "guest";
  const initials = useMemo(() => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (username && username.trim()) {
      return username.slice(0, 2).toUpperCase();
    }
    return "ST";
  }, [name, username]);

  const hashVal = useMemo(() => hashString(identifier), [identifier]);

  // Procedural geometric background parameters derived from seed hash
  const geomType = hashVal % 3; // 0 = aperture iris, 1 = tech matrix, 2 = crosshair wafer
  const patternSeed = (hashVal >> 3) % 8;

  const tooltipText =
    title ||
    `${name || username || "Anonymous"}${
      palette.badgeName ? ` (${palette.badgeName})` : ""
    }`;

  // Ring styling if showRoleRing is enabled
  const ringStyle = showRoleRing
    ? {
        borderColor: palette.border,
        boxShadow: `0 0 0 1px ${palette.border}`,
      }
    : {};

  return (
    <div
      title={tooltipText}
      className={`group relative inline-flex shrink-0 items-center justify-center select-none ${config.containerClass} ${className}`}
    >
      <div
        style={ringStyle}
        className={`relative flex h-full w-full items-center justify-center overflow-hidden border border-[var(--line-strong)] bg-[#070807] transition-all duration-200 ${radiusClass}`}
      >
        {src && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name || username || "User avatar"}
            onError={() => setImageError(true)}
            className="asset-zoom-media h-full w-full object-cover"
          />
        ) : (
          /* High-craft Procedural Studio Wafer Avatar */
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id={`avatar-grad-${hashVal}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#0a0d0b" />
                <stop offset="60%" stopColor="#121713" />
                <stop offset="100%" stopColor="#080a08" />
              </linearGradient>

              <radialGradient
                id={`avatar-glow-${hashVal}`}
                cx="50%"
                cy="50%"
                r="60%"
              >
                <stop offset="0%" stopColor={palette.accent} stopOpacity="0.16" />
                <stop offset="100%" stopColor="#070807" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Base dark wafer */}
            <rect
              width="100"
              height="100"
              fill={`url(#avatar-grad-${hashVal})`}
            />

            {/* Ambient role-tinted radial core */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill={`url(#avatar-glow-${hashVal})`}
            />

            {/* Micro grid & crosshair framing */}
            <line
              x1="12"
              y1="50"
              x2="18"
              y2="50"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <line
              x1="82"
              y1="50"
              x2="88"
              y2="50"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <line
              x1="50"
              y1="12"
              x2="50"
              y2="18"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <line
              x1="50"
              y1="82"
              x2="50"
              y2="88"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />

            {/* Procedural Latent Geometry Ring */}
            {geomType === 0 && (
              <>
                <circle
                  cx="50"
                  cy="50"
                  r="34"
                  fill="none"
                  stroke={palette.accent}
                  strokeWidth="1.2"
                  strokeDasharray="4 6"
                  opacity="0.45"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="24"
                  fill="none"
                  stroke={palette.accent}
                  strokeWidth="1"
                  opacity="0.25"
                />
              </>
            )}

            {geomType === 1 && (
              <>
                <polygon
                  points="50,18 78,34 78,66 50,82 22,66 22,34"
                  fill="none"
                  stroke={palette.accent}
                  strokeWidth="1.2"
                  strokeDasharray="5 4"
                  opacity="0.4"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="22"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                />
              </>
            )}

            {geomType === 2 && (
              <>
                <rect
                  x="24"
                  y="24"
                  width="52"
                  height="52"
                  fill="none"
                  stroke={palette.accent}
                  strokeWidth="1"
                  strokeDasharray="6 8"
                  opacity="0.35"
                />
                <line
                  x1="24"
                  y1="24"
                  x2="76"
                  y2="76"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="0.8"
                />
                <line
                  x1="76"
                  y1="24"
                  x2="24"
                  y2="76"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="0.8"
                />
              </>
            )}

            {/* Crisp Monogram Initials positioned in center */}
            <text
              x="50"
              y="56"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={palette.accent}
              fontFamily="var(--font-geist-mono), monospace"
              fontSize={size === "xs" ? "42" : "36"}
              fontWeight="700"
              letterSpacing="-0.02em"
              style={{ filter: `drop-shadow(0 0 6px ${palette.glow})` }}
            >
              {initials}
            </text>
          </svg>
        )}
      </div>

      {/* Online / Active status pulse indicator */}
      {online && (
        <span
          aria-hidden="true"
          title="Online"
          className={`absolute rounded-full bg-emerald-400 border-[var(--ground)] shadow-[0_0_8px_rgba(52,211,153,0.8)] ${config.dotClass}`}
        />
      )}
    </div>
  );
}

export default UserAvatar;
