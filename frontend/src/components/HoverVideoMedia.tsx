"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";

export const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i;

/**
 * Universal video media detector across SoloTensor cards.
 * Inspects URL file extensions, query strings, path segments, and API metadata.
 */
export function isVideoMediaUrl(
  url?: string | null,
  options?: {
    mediaType?: string | null;
    videoFamily?: string | null;
    mode?: string | null;
    explicitIsVideo?: boolean;
  }
): boolean {
  if (options?.explicitIsVideo) return true;
  if (options?.mediaType === "video") return true;
  if (Boolean(options?.videoFamily)) return true;
  if (options?.mode && options.mode.toLowerCase().includes("video")) return true;
  if (!url) return false;
  const trimmed = url.trim();
  if (VIDEO_EXT_REGEX.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes("/video/") ||
    lower.includes(".mp4") ||
    lower.includes(".webm") ||
    lower.includes(".mov")
  );
}

export interface HoverVideoMediaProps {
  src?: string | null;
  poster?: string | null;
  alt: string;
  isVideo?: boolean;
  isHovered?: boolean;
  className?: string;
  onLoaded?: () => void;
  onError?: () => void;
  fallback?: React.ReactNode;
}

/**
 * HoverVideoMedia
 * 
 * Synchronized media component for Model & Tool cards.
 * - Displays static initial poster frame at rest (preload="metadata").
 * - Autoplays smoothly when hovered (play().catch() safely handled).
 * - Pauses and rewinds (currentTime = 0) on unhover.
 * - Applies smooth luxury cubic-bezier zoom (.asset-zoom-media).
 * - Zero-CLS shimmer during progressive hydration.
 */
export default function HoverVideoMedia({
  src,
  poster,
  alt,
  isVideo = false,
  isHovered,
  className = "",
  onLoaded,
  onError,
  fallback = null,
}: HoverVideoMediaProps) {
  const [internalHover, setInternalHover] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const effectiveHover = isHovered !== undefined ? isHovered : internalHover;

  // Reduced motion preference check
  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Synchronized hover playback lifecycle
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !isVideo || reduceMotion) return;

    if (effectiveHover) {
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Gracefully absorb browser autoplay rejection or abort on fast mouse exits
        });
      }
    } else {
      vid.pause();
      try {
        vid.currentTime = 0;
      } catch {
        // Silently ignore if metadata is still loading
      }
    }
  }, [effectiveHover, isVideo, reduceMotion]);

  const handleLoaded = () => {
    setIsLoaded(true);
    onLoaded?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  if (!src || hasError) {
    return <>{fallback}</>;
  }

  const baseMediaClasses = `asset-zoom-media absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
    isLoaded ? "opacity-100" : "opacity-0"
  } ${className}`;

  return (
    <>
      {/* Background Shimmer Placeholder while media decodes (Zero CLS) */}
      <div
        className={`absolute inset-0 shimmer transition-opacity duration-300 pointer-events-none ${
          isLoaded ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden="true"
      />

      {isVideo ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          onMouseEnter={() => setInternalHover(true)}
          onMouseLeave={() => setInternalHover(false)}
          onLoadedData={handleLoaded}
          onError={handleError}
          className={baseMediaClasses}
          aria-label={alt}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onMouseEnter={() => setInternalHover(true)}
          onMouseLeave={() => setInternalHover(false)}
          onLoad={handleLoaded}
          onError={handleError}
          className={baseMediaClasses}
        />
      )}
    </>
  );
}
