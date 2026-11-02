"use client";

import React, { useRef, useState, useCallback } from "react";
import { UploadCloud, Trash2 } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api";
import QuickImageActions from "@/components/QuickImageActions";

export interface ImageSlotActionsConfig {
  onReadImage?: () => void;
  onMatchDimensions?: () => void;
  onReplace?: () => void;
  interrogating?: boolean;
  canMatchDimensions?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export interface ImageInputSlotProps {
  label: string;
  value?: string | null;
  onClear?: () => void;
  onFileSelect: (file: File) => void;
  title?: string;
  subtitle?: string;
  disabled?: boolean;
  /** Explicit CSS height class override (e.g. "h-48", "h-52") */
  heightClass?: string;
  /** Whether this slot is standing alone (full width, taller h-48) vs paired in a 2-col grid (h-[7.5rem]) */
  standalone?: boolean;
  badge?: React.ReactNode;
  overlay?: React.ReactNode;
  alt?: string;
  className?: string;
  id?: string;
  accept?: string;
  actions?: ImageSlotActionsConfig;
}

/**
 * High-craft Obsidian darkroom image input and dropzone slot.
 * Matches the Video tab's compact geometry when in a grid, and comfortably
 * expands to h-48 when standing alone (e.g. Img2Img source image).
 * When actions are provided, renders a smooth docked action bar inside
 * the preview container, preserving 100% constant container height.
 */
export default function ImageInputSlot({
  label,
  value,
  onClear,
  onFileSelect,
  title = "Drop image or browse",
  subtitle = "PNG, JPG, WEBP",
  disabled = false,
  heightClass,
  standalone = false,
  badge,
  overlay,
  alt = "Image preview",
  className = "",
  id,
  accept = "image/png,image/jpeg,image/webp",
  actions,
}: ImageInputSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const effectiveHeight = heightClass ?? (standalone ? "h-48" : "h-[7.5rem]");

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;
      const files = e.dataTransfer.files;
      if (files && files.length > 0 && files[0].type.startsWith("image/")) {
        onFileSelect(files[0]);
      }
    },
    [disabled, onFileSelect]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            onFileSelect(file);
            return;
          }
        }
      }
    },
    [disabled, onFileSelect]
  );

  const resolvedSrc = value ? resolveMediaUrl(value) || value : null;

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Header row */}
      <div className="flex h-4 items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            {label}
          </span>
          {badge}
        </div>
        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            aria-label={`Remove ${label}`}
            title={`Remove ${label}`}
            className="rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--danger)] focus-visible:text-[var(--danger)] disabled:opacity-40 motion-reduce:transition-none"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
          e.target.value = "";
        }}
      />

      {/* Dropzone or Preview */}
      {!resolvedSrc ? (
        <div
          tabIndex={disabled ? -1 : 0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          onClick={() => !disabled && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`group flex ${effectiveHeight} cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
            disabled ? "cursor-not-allowed opacity-40" : ""
          } ${
            isDragOver
              ? "border-[var(--accent)] bg-[var(--accent)]/10"
              : "border-[var(--line-strong)] bg-[var(--surface-sunken)] hover:border-[var(--ink-faint)] hover:bg-[var(--surface-raised)]/40"
          }`}
        >
          <div
            className={`flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] transition-colors group-hover:text-[var(--accent)] motion-reduce:transition-none ${
              standalone ? "h-10 w-10 mb-1" : "h-8 w-8"
            }`}
          >
            <UploadCloud className={standalone ? "h-5 w-5" : "h-4 w-4"} />
          </div>
          <p
            className={`font-semibold text-[var(--ink)] ${
              standalone ? "mt-1.5 text-xs" : "mt-1.5 text-[11px]"
            }`}
          >
            {title}
          </p>
          {subtitle && (
            <p
              className={`leading-tight text-[var(--ink-faint)] ${
                standalone ? "mt-1 font-mono text-[10px]" : "mt-0.5 text-[9px]"
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
      ) : (
        <div
          tabIndex={disabled ? -1 : 0}
          onPaste={handlePaste}
          className={`relative flex ${effectiveHeight} items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-1.5 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]`}
        >
          {/* Preview Image with bottom padding reservation when actions are docked */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedSrc}
            alt={alt}
            className={`h-full w-full rounded-md object-contain transition-all duration-200 ${
              actions ? "pb-6" : ""
            }`}
          />

          {overlay}

          {/* Smooth Docked Action Bar: preserves constant container height */}
          {actions && (
            <QuickImageActions
              onReadImage={actions.onReadImage}
              onMatchDimensions={actions.onMatchDimensions}
              onReplace={actions.onReplace || (() => fileInputRef.current?.click())}
              interrogating={actions.interrogating}
              canMatchDimensions={actions.canMatchDimensions}
              disabled={disabled || actions.disabled}
              compact={actions.compact}
              layout="docked"
            />
          )}
        </div>
      )}
    </div>
  );
}
