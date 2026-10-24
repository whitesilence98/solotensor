"use client";

import React, { useRef } from "react";
import { Sparkles, Tag, Loader2 } from "lucide-react";

export interface PromptComposerProps {
  idPrefix?: string;
  prompt?: string;
  onPromptChange?: (value: string) => void;
  negativePrompt?: string;
  onNegativePromptChange?: (value: string) => void;
  busy?: boolean;
  canGenerate?: boolean;
  onGenerate?: () => void;
  onInterrogateFile?: (file: File) => void | Promise<void>;
  interrogating?: boolean;
  interrogateToast?: string | null;
  positivePlaceholder?: string;
  negativePlaceholder?: string;
  positiveRows?: number;
  negativeRows?: number;
  className?: string;
  showAutoPrompt?: boolean;
}

export default function PromptComposer({
  idPrefix = "prompt-composer",
  prompt = "",
  onPromptChange,
  negativePrompt = "",
  onNegativePromptChange,
  busy = false,
  canGenerate = false,
  onGenerate,
  onInterrogateFile,
  interrogating = false,
  interrogateToast = null,
  positivePlaceholder = "Describe your scene, subjects, atmosphere, style, camera angle, and lighting…",
  negativePlaceholder = "worst quality, low quality, blurry, distorted, extra limbs, bad anatomy…",
  positiveRows = 4,
  negativeRows = 3,
  className = "",
  showAutoPrompt = true,
}: PromptComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onInterrogateFile) {
      void onInterrogateFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={`space-y-3.5 ${className}`}>
      {/* Header with Title and Auto-Prompt Action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
            Prompt Composer
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {interrogateToast && (
            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-[var(--accent)]/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] animate-pulse">
              {interrogateToast}
            </span>
          )}
          {showAutoPrompt && onInterrogateFile && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={interrogating || busy}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] hover:underline transition disabled:opacity-50"
                title="Upload an image to auto-detect generation parameters or WD14 prompt tags"
              >
                {interrogating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Tag className="h-3 w-3" />
                )}
                <span>{interrogating ? "Detecting…" : "Auto Prompt"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Positive Prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={`${idPrefix}-prompt`}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink)]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Prompt</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-[var(--ink-faint)]">
              {prompt ? `${prompt.length} chars` : "Required"}
            </span>
            {prompt && onPromptChange && (
              <button
                type="button"
                onClick={() => onPromptChange("")}
                className="text-[10px] font-medium text-[var(--ink-faint)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)] transition"
                title="Clear prompt"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <textarea
          id={`${idPrefix}-prompt`}
          value={prompt}
          onChange={(e) => onPromptChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canGenerate) {
              e.preventDefault();
              onGenerate?.();
            }
          }}
          rows={positiveRows}
          placeholder={positivePlaceholder}
          disabled={busy}
          className="workspace-field w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-xs leading-relaxed text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50 min-h-[5rem]"
        />
      </div>

      {/* Negative Prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={`${idPrefix}-neg-prompt`}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-soft)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
            <span>Negative Prompt</span>
          </label>
          {negativePrompt && onNegativePromptChange && (
            <button
              type="button"
              onClick={() => onNegativePromptChange("")}
              className="text-[10px] font-medium text-[var(--ink-faint)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)] transition"
              title="Clear negative prompt"
            >
              Clear
            </button>
          )}
        </div>
        <textarea
          id={`${idPrefix}-neg-prompt`}
          value={negativePrompt}
          onChange={(e) => onNegativePromptChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canGenerate) {
              e.preventDefault();
              onGenerate?.();
            }
          }}
          rows={negativeRows}
          placeholder={negativePlaceholder}
          disabled={busy}
          className="workspace-field w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 text-xs leading-relaxed text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50 min-h-[3.5rem]"
        />
      </div>
    </div>
  );
}
