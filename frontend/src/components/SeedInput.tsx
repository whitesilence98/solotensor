"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, Copy, Dices, RotateCcw, Sparkles } from "lucide-react";

export interface SeedInputProps {
  id?: string;
  label?: string; // Optional visible label (default: "Seed")
  value: number | string | null | undefined; // Accepts -1, positive integer, or numeric string
  onChange: (value: number) => void; // Emits number (-1 for random, or 0..4294967295)
  disabled?: boolean;
  size?: "sm" | "md"; // Defaults to "sm"
  showLabel?: boolean; // Defaults to true
  compact?: boolean; // Ultra-compact mode without embedded label
  className?: string;
}

const MAX_SEED = 4294967295; // 2^32 - 1

export default function SeedInput({
  id: explicitId,
  label = "Seed",
  value,
  onChange,
  disabled = false,
  size = "sm",
  showLabel = true,
  compact = false,
  className = "",
}: SeedInputProps) {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const inputRef = useRef<HTMLInputElement>(null);

  // Normalize numeric value; -1 or empty/invalid is treated as random mode
  const rawNum = typeof value === "number" ? value : Number(value);
  const isRandom =
    value === "" ||
    value === null ||
    value === undefined ||
    isNaN(rawNum) ||
    rawNum === -1;

  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState(
    isRandom ? "" : String(Math.max(0, Math.min(MAX_SEED, Math.floor(rawNum)))),
  );
  const [copied, setCopied] = useState(false);

  // Keep local text in sync when external value changes while not actively editing
  useEffect(() => {
    if (!isEditing) {
      if (isRandom) {
        setTextValue("");
      } else {
        setTextValue(
          String(Math.max(0, Math.min(MAX_SEED, Math.floor(rawNum)))),
        );
      }
    }
  }, [value, isRandom, isEditing, rawNum]);

  // Click on "RANDOM" pill to enter typing mode
  const handleStartEditing = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
    setTextValue(isRandom ? "" : String(rawNum));
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);
  }, [disabled, isRandom, rawNum]);

  // Roll an explicit random 32-bit uint seed and lock it in
  const handleRollSeed = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      const rolled = Math.floor(Math.random() * (MAX_SEED + 1));
      setTextValue(String(rolled));
      setIsEditing(false);
      onChange(rolled);
    },
    [disabled, onChange],
  );

  // Revert back to random latent mode (-1)
  const handleResetToRandom = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      setTextValue("");
      setIsEditing(false);
      onChange(-1);
    },
    [disabled, onChange],
  );

  // Copy seed to clipboard
  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled || isRandom) return;
      try {
        await navigator.clipboard.writeText(String(rawNum));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore clipboard failure */
      }
    },
    [disabled, isRandom, rawNum],
  );

  // Handle typing inside text input
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = e.target.value.replace(/\D/g, "");
      if (cleaned === "") {
        setTextValue("");
        return;
      }
      const parsed = Math.min(Number(cleaned), MAX_SEED);
      setTextValue(String(parsed));
      onChange(parsed);
    },
    [onChange],
  );

  // On blur, commit or revert to random
  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (textValue.trim() === "" || textValue.trim() === "-1") {
      onChange(-1);
      setTextValue("");
    } else {
      const parsed = Math.min(Number(textValue.replace(/\D/g, "")), MAX_SEED);
      onChange(parsed);
      setTextValue(String(parsed));
    }
  }, [textValue, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        if (isRandom) {
          setTextValue("");
          setIsEditing(false);
        } else {
          setTextValue(String(rawNum));
          setIsEditing(false);
        }
      }
    },
    [isRandom, rawNum],
  );

  const heightClass = size === "sm" ? "h-8 px-2" : "h-9 px-2.5";

  return (
    <div className={`w-full ${className}`}>
      {showLabel && !compact && (
        <div className="mb-1 flex items-center justify-between select-none">
          <label
            htmlFor={id}
            className="block font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]"
          >
            {label}
          </label>
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            {isRandom && !isEditing ? "Latent Auto" : "Fixed Seed"}
          </span>
        </div>
      )}

      <div
        className={`group relative flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/30 ${
          disabled
            ? "pointer-events-none cursor-not-allowed opacity-50"
            : "hover:border-[var(--line-strong)]"
        } ${heightClass}`}
      >
        {/* RANDOM MODE VIEW: Never display "-1", visually mark with tactile badge */}
        {isRandom && !isEditing ? (
          <div
            onClick={handleStartEditing}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleStartEditing();
              }
            }}
            aria-label="Seed is set to Random. Click to specify seed."
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 select-none outline-none"
          >
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[var(--accent)]">
              <Sparkles className="h-2.5 w-2.5" />
              RANDOM
            </span>
            <span className="truncate font-mono text-[11px] text-[var(--ink-faint)] transition-colors group-hover:text-[var(--ink-soft)]">
              Auto-roll on run
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              ref={inputRef}
              id={id}
              type="text"
              inputMode="numeric"
              value={textValue}
              disabled={disabled}
              placeholder={isRandom ? "Enter seed (0–4.29B)…" : ""}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="min-w-0 flex-1 bg-transparent font-mono text-xs tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none"
            />
          </div>
        )}

        {/* Action Toolbar */}
        <div className="flex shrink-0 items-center gap-0.5 border-l border-[var(--line)]/50 pl-1">
          {/* If in fixed seed mode, show copy button */}
          {!isRandom && !isEditing && (
            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled}
              title={copied ? "Copied!" : "Copy seed to clipboard"}
              aria-label="Copy seed"
              className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] text-[var(--ink-faint)] transition hover:bg-[var(--surface)] hover:text-[var(--ink)] active:scale-95"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Roll / Randomize dice button */}
          <button
            type="button"
            onClick={handleRollSeed}
            disabled={disabled}
            title={
              isRandom
                ? "Roll a specific random seed"
                : "Roll a new random seed"
            }
            aria-label="Roll random seed"
            className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] text-[var(--ink-faint)] transition hover:bg-[var(--surface)] hover:text-[var(--accent)] active:scale-95"
          >
            <Dices className="h-3.5 w-3.5" />
          </button>

          {/* Reset back to Random mode (-1) button (only shown when a fixed seed is active or being edited) */}
          {(!isRandom || isEditing) && (
            <button
              type="button"
              onClick={handleResetToRandom}
              disabled={disabled}
              title="Reset to Random (-1)"
              aria-label="Reset to Random"
              className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] text-[var(--ink-faint)] transition hover:bg-[var(--surface)] hover:text-[var(--ink)] active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
