"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Box, Layers } from "lucide-react";
import { resolveMediaUrl, type PublicModelSummary } from "@/lib/api";
import RoleBadge from "@/components/RoleBadge";
import UserAvatar from "@/components/UserAvatar";

export interface TensorModelCardData {
  model_id?: string;
  title: string;
  model_type: string;
  category: string;
  base_model?: string | null;
  cover_url?: string | null;
  sample_count?: number;
  author_id?: string;
  author_username?: string;
  author_display_name?: string;
  author_role?: string;
}

export interface TensorModelCardProps {
  item: PublicModelSummary | TensorModelCardData;
  index?: number;
  isLink?: boolean;
  className?: string;
}

/**
 * 1:1 Mirroring Skeleton for Model Gallery Card (Zero-CLS)
 */
export function ModelCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 40}ms` }}
      className="relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)]"
    >
      {/* Background base shimmer */}
      <div className="absolute inset-0 shimmer opacity-60" />

      {/* Floating Top Badges Mirror */}
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between pointer-events-none">
        <div className="h-5 w-16 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
        <div className="h-5 w-12 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
      </div>

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 via-50% to-transparent" />

      {/* Bottom Typography Overlay Mirror */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 space-y-2 pointer-events-none">
        <div className="h-6 w-3/4 rounded-lg bg-white/20 shimmer" />
        <div className="h-4 w-1/2 rounded-md bg-white/10 shimmer mt-1.5" />
      </div>
    </div>
  );
}

/**
 * Creator-model gallery card with progressive image hydration and 1:1 visual parity.
 */
export function TensorModelCard({
  item,
  index = 0,
  isLink = true,
  className = "",
}: TensorModelCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const coverUrl = resolveMediaUrl(item.cover_url);
  const sampleCount = item.sample_count ?? 0;

  // Type badge styling
  const typeBadgeStyle = useMemo(() => {
    switch (item.model_type) {
      case "LoRA":
      case "LoKr":
      case "LoCon":
      case "LyCORIS":
      case "DoRA":
      case "Motion LoRA":
        return "bg-[var(--surface)]/90 text-[var(--accent)] border-[var(--accent)]/30";
      case "Checkpoint":
      case "SVD":
        return "bg-[var(--surface)]/90 text-[var(--accent)] border-[var(--accent)]/30";
      case "ControlNet":
      case "Poses":
        return "bg-[var(--surface)]/90 text-cyan-400 border-cyan-400/30";
      case "VAE":
      case "StyleModel":
      case "Aesthetic Gradient":
        return "bg-[var(--surface)]/90 text-amber-400 border-amber-400/30";
      default:
        return "bg-[var(--surface)]/90 text-[var(--ink)] border-[var(--line)]";
    }
  }, [item.model_type]);

  // Derive short base model name
  const shortBase = useMemo(() => {
    const raw = item.base_model || "";
    const lower = raw.toLowerCase();
    if (lower.includes("sdxl") || lower.includes("stable diffusion xl"))
      return "SDXL";
    if (lower.includes("flux")) return "FLUX.1";
    if (lower.includes("z-image") || lower.includes("turbo")) return "Z-Image";
    if (lower.includes("sd 1.5") || lower.includes("sd1.5")) return "SD 1.5";
    return raw.split(" ")[0] || "Custom";
  }, [item.base_model]);

  const isVideo = Boolean(
    coverUrl &&
      (coverUrl.endsWith(".mp4") ||
        coverUrl.endsWith(".webm") ||
        coverUrl.includes("/video/")),
  );

  const cardContent = (
    <>
      {/* Background Shimmer Placeholder while media decodes */}
      {coverUrl && !imgError && (
        <div
          className={`absolute inset-0 shimmer transition-opacity duration-300 ${
            isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        />
      )}

      {/* Full-Bleed Media with smooth progressive hydration */}
      {coverUrl && !imgError ? (
        isVideo ? (
          <video
            src={coverUrl}
            muted
            autoPlay
            loop
            playsInline
            onLoadedData={() => setIsLoaded(true)}
            onError={() => setImgError(true)}
            className={`asset-zoom-media absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <img
            src={coverUrl}
            alt={item.title}
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            onError={() => setImgError(true)}
            className={`asset-zoom-media absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )
      ) : (
        <div className="absolute inset-0 grid h-full w-full place-items-center bg-[var(--surface-soft)] p-4 text-center">
          <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              {["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(item.model_type) ? (
                <Layers className="h-6 w-6 opacity-80" />
              ) : (
                <Box className="h-6 w-6 opacity-80" />
              )}
            </div>
            <span className="line-clamp-2 text-xs font-semibold text-[var(--ink-faint)]">
              {item.title}
            </span>
          </div>
        </div>
      )}

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 via-50% to-transparent transition-opacity duration-300 ease-out group-hover:opacity-0" />

      {/* Floating Top Badges */}
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between pointer-events-none">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${typeBadgeStyle}`}
        >
          {item.model_type}
        </span>
        <span className="inline-flex items-center rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-md">
          {shortBase}
        </span>
      </div>

      {/* Bottom Typography Overlay */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5">
        <h3
          className="truncate text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-sm transition-colors group-hover:text-[var(--accent)]"
          title={item.title}
        >
          {item.title || "Untitled model"}
        </h3>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-xs sm:text-sm font-medium text-white/75 drop-shadow-sm">
            {item.category} • {shortBase}{" "}
            {sampleCount > 0 ? `• ${sampleCount} samples` : ""}
          </p>
          {"author_role" in item && item.author_role && (
            <div className="shrink-0 flex items-center gap-1.5 pointer-events-none">
              <UserAvatar
                name={item.author_display_name || item.author_username}
                username={item.author_username}
                role={item.author_role}
                size="xs"
              />
              {"author_username" in item && item.author_username && (
                <span className="font-mono text-[10px] font-medium text-white/90 truncate max-w-[80px] drop-shadow-sm hidden sm:inline">
                  @{item.author_username}
                </span>
              )}
              <RoleBadge
                role={item.author_role}
                size="xs"
              />
            </div>
          )}
        </div>
      </div>
    </>
  );

  const containerClasses = `group relative flex aspect-[3/4] w-full flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] transition-all duration-300 ease-out ${className}`;

  if (isLink && item.model_id) {
    return (
      <Link
        href={`/models/${item.model_id}`}
        style={{ animationDelay: `${index * 30}ms` }}
        className={containerClasses}
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <div
      style={{ animationDelay: `${index * 30}ms` }}
      className={containerClasses}
    >
      {cardContent}
    </div>
  );
}

export default TensorModelCard;
