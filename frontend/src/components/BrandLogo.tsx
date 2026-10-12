"use client";

import React from "react";
import Link from "next/link";

export interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  subtitle?: string;
  href?: string;
  showWordmark?: boolean;
  showDot?: boolean;
  className?: string;
  emblemClassName?: string;
}

/**
 * Geometric dual-tone isometric tensor prism emblem.
 * Features hairline obsidian/ink edges with an acid-lime signal core.
 */
export function TensorPrismEmblem({
  className = "h-7 w-7",
}: {
  className?: string;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.4)] ${className}`}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        aria-hidden="true"
      >
        {/* Outer Isometric Hexagon Prism */}
        <path
          d="M16 2.5L27 8.85V21.55L16 27.9L5 21.55V8.85L16 2.5Z"
          stroke="var(--ink)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {/* Tri-Axial Internal Coordinate Vectors */}
        <path
          d="M5 8.85L16 15.2M27 8.85L16 15.2M16 27.9V15.2"
          stroke="var(--ink-soft)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {/* Dual-Tone Tensor Lattice Vector in Acid Lime */}
        <path
          d="M10.5 12.025L21.5 18.375"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* Core Quantum Singularity / Node Point */}
        <circle
          cx="16"
          cy="15.2"
          r="1.8"
          fill="var(--accent)"
        />
      </svg>
    </div>
  );
}

export function BrandLogo({
  size = "md",
  subtitle,
  href,
  showWordmark = true,
  showDot = true,
  className = "",
  emblemClassName = "",
}: BrandLogoProps) {
  const sizeStyles = {
    sm: {
      emblem: "h-7 w-7",
      wordmark: "text-sm",
      dot: "text-base",
      subtitle: "text-[8px] tracking-[0.2em]",
      gap: "gap-2.5",
    },
    md: {
      emblem: "h-9 w-9",
      wordmark: "text-base",
      dot: "text-lg",
      subtitle: "text-[9px] tracking-[0.22em]",
      gap: "gap-3",
    },
    lg: {
      emblem: "h-11 w-11",
      wordmark: "text-xl",
      dot: "text-2xl",
      subtitle: "text-[10px] tracking-[0.24em]",
      gap: "gap-3.5",
    },
  }[size];

  const content = (
    <div className={`inline-flex items-center ${sizeStyles.gap} ${className}`}>
      {/* Isometric Tensor Prism Emblem */}
      <TensorPrismEmblem
        className={`${sizeStyles.emblem} ${emblemClassName}`}
      />

      {/* Signature Wordmark & Technical Kicker */}
      {showWordmark && (
        <div className="flex flex-col justify-center leading-none select-none">
          {subtitle && (
            <span
              className={`font-mono ${sizeStyles.subtitle} uppercase font-semibold text-[var(--ink-faint)] mb-1 leading-none`}
            >
              {subtitle}
            </span>
          )}
          <div className="flex items-baseline">
            <span
              className={`font-heading font-extrabold tracking-[-0.035em] text-[var(--ink)] uppercase leading-none ${sizeStyles.wordmark}`}
            >
              SOLOTENSOR
            </span>
            {showDot && (
              <span
                className={`font-extrabold text-[var(--accent)] ml-0.5 leading-none transition-transform duration-200 group-hover:scale-125 ${sizeStyles.dot}`}
              >
                .
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group inline-flex items-center transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded-lg"
        aria-label="SoloTensor Studio"
      >
        {content}
      </Link>
    );
  }

  return content;
}

export default BrandLogo;
