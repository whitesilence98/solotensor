"use client";

import React, { useRef, useState, useEffect } from "react";
import { Sparkles, Zap, Loader2, Tag, ChevronDown, ChevronUp, X, Check, UploadCloud, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { VideoSubMode } from "@/lib/api";

const DEFAULT_POSITIVE_PLACEHOLDER =
  "Describe your scene, subjects, atmosphere, style, camera angle, and lighting… (Ctrl+Enter to generate)";
const DEFAULT_NEGATIVE_PLACEHOLDER =
  "worst quality, low quality, blurry, distorted, extra limbs, bad anatomy, cropped…";
// Video's LTX graph responds to motion/camera language. This is the copy that
// lived in the removed sidebar PromptComposer.
const VIDEO_POSITIVE_PLACEHOLDER =
  "Describe scene motion, camera movement, actions, and lighting… (e.g. A slow continuous tracking shot through a market, 35mm film)";
const VIDEO_NEGATIVE_PLACEHOLDER =
  "worst quality, low quality, jerky camera, jittery frames, blurred subjects…";
const EDIT_POSITIVE_PLACEHOLDER =
  "Describe your edit (e.g. Change the outfit in Image 1 to match the dress in Image 2...)";

export interface StudioPromptBarProps {
  idPrefix?: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  negativePrompt?: string;
  onNegativePromptChange?: (value: string) => void;
  busy?: boolean;
  canGenerate?: boolean;
  onGenerate?: () => void;
  progress?: number;
  progressLabel?: string | null;
  onInterrogateFile?: (file: File) => void | Promise<void>;
  interrogating?: boolean;
  interrogateToast?: string | null;
  positivePlaceholder?: string;
  negativePlaceholder?: string;
  className?: string;
  imageCount?: string;
  onImageCountChange?: (count: string) => void;
  activeMode?: string;
  referenceImage?: string | null;
  lastFrameImage?: string | null;
  img2imgSubTab?: "image_to_image" | "detailer" | "upscaler";
  stage2Upscale?: boolean;
  videoSubMode?: VideoSubMode;
}

export default function StudioPromptBar({
  idPrefix = "studio-prompt",
  prompt = "",
  onPromptChange,
  negativePrompt = "",
  onNegativePromptChange,
  busy = false,
  canGenerate = false,
  onGenerate,
  progress = 0,
  progressLabel = null,
  onInterrogateFile,
  interrogating = false,
  interrogateToast = null,
  positivePlaceholder,
  negativePlaceholder,
  className = "",
  imageCount = "1",
  onImageCountChange,
  activeMode = "Text2Img",
  referenceImage = null,
  lastFrameImage = null,
  img2imgSubTab = "image_to_image",
  stage2Upscale = false,
  videoSubMode = "text-to-video",
}: StudioPromptBarProps) {
  const { isPro, isAdmin, isAuthenticated, openAuthModal } = useAuth();
  const isProUser = isPro || isAdmin;

  const isVideoMode = activeMode === "Video";
  // Matches the page's canGenerate guard: image-to-video needs a first OR last
  // frame, because the graph can seed motion from either one.
  const videoNeedsFrame =
    isVideoMode &&
    videoSubMode === "image-to-video" &&
    !referenceImage &&
    !lastFrameImage;
  const timingLabel = busy
    ? progressLabel || "Rendering"
    : !isAuthenticated
    ? "LOGIN"
    : isVideoMode
    ? stage2Upscale
      ? "~45s"
      : "~15s"
    : isProUser
    ? "~4s"
    : "~28s";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageCountRef = useRef<HTMLDivElement>(null);
  const [imageCountOpen, setImageCountOpen] = useState(false);
  // Tri-state: null = no explicit user choice yet, so the per-mode default
  // applies. An explicit true/false always wins and is never overwritten.
  const [negativeOpenChoice, setNegativeOpenChoice] = useState<boolean | null>(null);

  // Close batch count popover on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (imageCountRef.current && !imageCountRef.current.contains(e.target as Node)) {
        setImageCountOpen(false);
      }
    };
    if (imageCountOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [imageCountOpen]);

  // Re-apply the per-mode default when the tab changes. This clears the
  // explicit choice rather than forcing the field open, so a toggle made
  // within the current mode is never fought.
  useEffect(() => {
    setNegativeOpenChoice(null);
  }, [activeMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onInterrogateFile) {
      void onInterrogateFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerateClick = () => {
    if (!isAuthenticated) {
      openAuthModal("generation");
      return;
    }
    if ((activeMode === "Img2Img" || activeMode === "Edit") && !referenceImage) {
      return;
    }
    if (canGenerate && !busy) {
      onGenerate?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerateClick();
    }
  };

  const hasNegativeText = Boolean(negativePrompt && negativePrompt.trim().length > 0);
  // Video's LTX graph can consume a real negative prompt once CFG > 1, so the
  // field defaults open there; every other mode keeps today's behavior.
  const negativeOpen = negativeOpenChoice ?? (isVideoMode || hasNegativeText);

  return (
    <div
      className={`workspace-command relative z-40 shrink-0 rounded-2xl border border-[var(--line-strong)] bg-[rgba(15,18,15,0.92)] p-2.5 sm:p-3 shadow-[0_12px_36px_rgba(3,8,4,0.28)] backdrop-blur-xl space-y-2 select-none transition-all duration-200 ${className}`}
    >
      {/* 1. Top Row: Positive Prompt Input (Full Width - no buttons beside it) */}
      <div className="relative w-full">
        <label htmlFor={`${idPrefix}-input`} className="sr-only">
          Prompt
        </label>
        <textarea
          id={`${idPrefix}-input`}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={positivePlaceholder ?? (isVideoMode ? VIDEO_POSITIVE_PLACEHOLDER : activeMode === "Edit" ? EDIT_POSITIVE_PLACEHOLDER : DEFAULT_POSITIVE_PLACEHOLDER)}
          disabled={busy}
          className="workspace-field w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 sm:p-3 text-xs leading-relaxed text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50 min-h-[58px]"
        />
      </div>

      {/* 2. Middle Row: Compact 1-Liner Negative Prompt (when open) */}
      {negativeOpen && onNegativePromptChange && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_2px_var(--accent-ambient)] motion-reduce:transition-none">
          <div className="flex items-center gap-1.5 shrink-0 select-none">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
            <label
              htmlFor={`${idPrefix}-negative-input`}
              className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-faint)]"
            >
              Negative:
            </label>
          </div>
          <input
            id={`${idPrefix}-negative-input`}
            type="text"
            value={negativePrompt}
            onChange={(e) => onNegativePromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={negativePlaceholder ?? (isVideoMode ? VIDEO_NEGATIVE_PLACEHOLDER : DEFAULT_NEGATIVE_PLACEHOLDER)}
            disabled={busy}
            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none"
          />
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-[4.5rem] shrink-0 text-right font-mono text-[9px] text-[var(--ink-faint)] opacity-60">
              {negativePrompt.trim() ? `${negativePrompt.length} chars` : "Optional"}
            </span>
            <span className="flex w-4 shrink-0 items-center justify-center">
              {negativePrompt.trim() && (
                <button
                  type="button"
                  onClick={() => onNegativePromptChange("")}
                  disabled={busy}
                  title="Clear negative prompt"
                  className="flex h-4 w-4 items-center justify-center rounded text-[var(--ink-faint)] hover:text-[var(--danger)] transition disabled:opacity-50 shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>
        </div>
      )}

      {/* 3. Bottom Row: 1-Line Controllers Bar (Auto Prompt line + Batch Selector + Generate button) */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs pt-0.5">
        {/* Left Group: Auto Prompt, Negative Toggle, Toast */}
        <div className="flex items-center gap-1.5 min-w-0">
          {onInterrogateFile && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Upload reference image to auto-prompt"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={interrogating || busy}
                title="Upload an image to auto-detect prompt tags and metadata"
                className="inline-flex h-7 sm:h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 text-[11px] font-semibold text-[var(--accent)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] transition disabled:opacity-50"
              >
                {interrogating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Tag className="h-3.5 w-3.5" />
                )}
                <span>{interrogating ? "Detecting…" : "Auto Prompt"}</span>
              </button>
            </>
          )}

          {/* Negative Prompt 1-Liner Toggle with Eye Open / Close SVG */}
          <button
            type="button"
            onClick={() => setNegativeOpenChoice((prev) => !(prev ?? (isVideoMode || hasNegativeText)))}
            aria-expanded={negativeOpen}
            aria-label={negativeOpen ? "Hide negative prompt" : "Show negative prompt"}
            className={`inline-flex h-7 sm:h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-mono font-semibold transition border ${
              negativeOpen
                ? "bg-[var(--surface-soft)] border-[var(--line-strong)] text-[var(--ink)]"
                : hasNegativeText
                ? "bg-[var(--danger-surface)] border-[var(--danger-line)] text-[var(--danger)]"
                : "bg-[var(--surface-raised)] border-[var(--line)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
          >
            {negativeOpen ? (
              <Eye className="h-3.5 w-3.5 text-[var(--ink)]" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
            )}
            <span>Negative</span>
          </button>

          {/* Interrogate Toast */}
          {interrogateToast && (
            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-[var(--accent)]/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] animate-pulse truncate max-w-[200px]">
              {interrogateToast}
            </span>
          )}
        </div>

        {/* Right Group: Char Count, Batch Count Selector & Primary Generate Deck */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Character counter (space reserved so the row never shifts) */}
          <span className="hidden w-[4.5rem] shrink-0 text-right font-mono text-[10px] text-[var(--ink-faint)] sm:inline">
            {prompt.trim() ? `${prompt.length} chars` : ""}
          </span>

          {/* Batch Image Count Selector (1x, 2x, 3x, 4x) */}
          <div ref={imageCountRef} className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => setImageCountOpen((v) => !v)}
              disabled={busy}
              title="Batch count (number of images to generate)"
              aria-label="Select batch image count"
              className={`inline-flex h-7 sm:h-8 items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 text-xs font-mono font-bold text-[var(--ink)] hover:bg-[var(--surface-soft)] focus-visible:bg-[var(--surface-soft)] transition select-none ${
                imageCountOpen ? "bg-[var(--surface-soft)] ring-1 ring-[var(--accent)]/40" : ""
              }`}
            >
              <span>{imageCount || "1"}x</span>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
            </button>

            {imageCountOpen && (
              <div className="absolute top-full right-0 mt-1.5 z-[100] w-32 rounded-xl border border-[var(--line-strong)] bg-[rgba(20,24,20,0.98)] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                {["1", "2", "3", "4"].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      onImageCountChange?.(n);
                      setImageCountOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-xs text-left transition ${
                      imageCount === n
                        ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] font-bold"
                        : "text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                    }`}
                  >
                    <span>{n} {n === "1" ? "image" : "images"}</span>
                    {imageCount === n && <Check className="h-3 w-3 text-[var(--accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary Generate Button (Anchored right at the Auto Prompt line) */}
          {onGenerate && (
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={busy || (isAuthenticated && !canGenerate) || ((activeMode === "Img2Img" || activeMode === "Edit") && !referenceImage) || videoNeedsFrame}
              aria-label="Generate Artwork"
              className="workspace-action-primary flex h-7 sm:h-8 items-center justify-between gap-2.5 sm:gap-3 rounded-lg bg-[var(--accent)] px-3 sm:px-4 text-xs font-bold text-[var(--accent-ink)] shadow-[0_0_14px_rgba(213,240,111,0.22)] transition active:scale-[0.99] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 select-none shrink-0"
            >
              {busy ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-ink)]" />
                  <span className="font-mono text-xs">
                    Rendering {progress > 0 ? `${Math.round(progress)}%` : ""}
                  </span>
                </div>
              ) : !isAuthenticated ? (
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 fill-current" />
                  <span>Sign In to Generate</span>
                </div>
              ) : (activeMode === "Img2Img" || activeMode === "Edit") && !referenceImage ? (
                <div className="flex items-center gap-1.5">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Upload Image</span>
                </div>
              ) : videoNeedsFrame ? (
                <div className="flex items-center gap-1.5">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Add a Frame</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 fill-current" />
                    <span className="font-bold">
                      {activeMode === "Img2Img"
                        ? img2imgSubTab === "detailer"
                          ? "Run Detailer Pass"
                          : img2imgSubTab === "upscaler"
                          ? "Run SeedVR2 Upscaler"
                          : "Generate Img2Img"
                        : activeMode === "Edit"
                        ? "Generate Inpaint"
                        : activeMode === "Video"
                        ? "Generate Video"
                        : activeMode === "Prime"
                        ? "Generate Prime"
                        : "Generate"}
                    </span>
                  </div>
                  {isProUser ? (
                    <span className="rounded bg-[var(--accent-ink)]/15 px-1.5 py-0.5 font-mono text-[9px] font-extrabold tracking-wider text-[var(--accent-ink)] uppercase">
                      ⚡ PRIORITY QUEUE
                    </span>
                  ) : (
                    <span className="rounded bg-[var(--accent-ink)]/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-[var(--accent-ink)] uppercase">
                      STANDARD
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1.5 font-mono text-[10px] opacity-80 shrink-0">
                <span>{timingLabel}</span>
                {!busy && isAuthenticated && (
                  <span className="text-[8px] opacity-65 font-bold hidden sm:inline">Ctrl+↵</span>
                )}
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}