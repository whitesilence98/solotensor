"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, Copy, Dices, RotateCcw } from "lucide-react";

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

  // Normalize numeric value; -1, empty string, or invalid is treated as random mode
  const rawNum = typeof value === "number" ? value : Number(value);
  const isRandom =
    value === "" ||
    value === null ||
    value === undefined ||
    isNaN(rawNum) ||
    rawNum === -1;

  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState(
    isRandom ? "" : String(Math.max(0, Math.min(MAX_SEED, Math.floor(rawNum))))
  );
  const [copied, setCopied] = useState(false);

  // Keep local text in sync when external value changes while not actively typing
  useEffect(() => {
    if (!isEditing) {
      if (isRandom) {
        setTextValue("");
      } else {
        setTextValue(String(Math.max(0, Math.min(MAX_SEED, Math.floor(rawNum)))));
      }
    }
  }, [value, isRandom, isEditing, rawNum]);

  // Switch to Random Mode (-1)
  const handleSetRandom = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (disabled) return;
      setTextValue("");
      setIsEditing(false);
      onChange(-1);
    },
    [disabled, onChange]
  );

  // Switch to Fixed Mode (either roll a seed if currently random, or focus existing)
  const handleSetFixed = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (disabled) return;
      if (isRandom) {
        const rolled = Math.floor(Math.random() * (MAX_SEED + 1));
        setTextValue(String(rolled));
        setIsEditing(false);
        onChange(rolled);
      } else {
        setIsEditing(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 10);
      }
    },
    [disabled, isRandom, onChange]
  );

  // Roll a new random 32-bit uint seed and set to fixed mode
  const handleRollSeed = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      const rolled = Math.floor(Math.random() * (MAX_SEED + 1));
      setTextValue(String(rolled));
      setIsEditing(false);
      onChange(rolled);
    },
    [disabled, onChange]
  );

  // Click on the placeholder area when random to start typing a custom seed directly
  const handleStartTyping = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
    setTextValue("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  }, [disabled]);

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
    [disabled, isRandom, rawNum]
  );

  // Handle typing inside numeric input
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
    [onChange]
  );

  // On blur, commit or revert to random if empty
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
    [isRandom, rawNum]
  );

  // Explicit locked dimensions to eliminate any layout shift between states
  const heightClass =
    size === "sm"
      ? "h-8 min-h-[32px] max-h-[32px] px-2.5"
      : "h-9 min-h-[36px] max-h-[36px] px-3";
  const btnSizeClass = size === "sm" ? "h-5 w-5 shrink-0" : "h-6 w-6 shrink-0";
  const iconSizeClass = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className={`w-full ${className}`}>
      {/* Header Row: Label & Segmented Mode Switcher */}
      {showLabel && !compact && (
        <div className="mb-1.5 flex h-6 items-center justify-between select-none">
          <label
            htmlFor={id}
            className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)] leading-none"
          >
            {label}
          </label>

          {/* Segmented Mode Switcher (Random vs Fixed) */}
          <div
            role="tablist"
            aria-label="Seed generation mode"
            className="inline-flex h-6 items-center rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5 font-mono text-[9px] box-border"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isRandom}
              onClick={() => handleSetRandom()}
              disabled={disabled}
              className={`inline-flex h-5 items-center justify-center gap-1 rounded-[3px] border px-2 font-semibold transition-all duration-150 box-border leading-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                isRandom
                  ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] shadow-xs"
                  : "border-transparent text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-raised)]"
              }`}
              title="Auto-roll a new random seed on every run"
            >
              <Dices className="h-2.5 w-2.5" />
              <span>Random</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isRandom}
              onClick={() => handleSetFixed()}
              disabled={disabled}
              className={`inline-flex h-5 items-center justify-center gap-1 rounded-[3px] border px-2 font-semibold transition-all duration-150 box-border leading-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                !isRandom
                  ? "bg-[var(--surface-raised)] text-[var(--ink)] border-[var(--line-strong)] shadow-xs"
                  : "border-transparent text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-raised)]"
              }`}
              title="Lock to a deterministic fixed seed"
            >
              <span>#</span>
              <span>Fixed</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Seed Input Box */}
      <div
        className={`group relative flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-colors focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/30 overflow-hidden box-border ${
          disabled
            ? "pointer-events-none cursor-not-allowed opacity-50"
            : "hover:border-[var(--line-strong)]"
        } ${heightClass}`}
      >
        {/* COMPACT / NO-LABEL MODE MINI-SWITCHER */}
        {(!showLabel || compact) && (
          <button
            type="button"
            onClick={isRandom ? () => handleSetFixed() : () => handleSetRandom()}
            disabled={disabled}
            title={isRandom ? "Switch to Fixed Seed" : "Switch to Random Seed"}
            className={`mr-2 inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 font-mono text-[9px] font-bold uppercase transition-colors box-border ${
              isRandom
                ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30"
                : "bg-[var(--surface-raised)] text-[var(--ink)] border border-[var(--line)]"
            }`}
          >
            {isRandom ? (
              <>
                <Dices className="h-2.5 w-2.5" />
                <span>Auto</span>
              </>
            ) : (
              <span># Fixed</span>
            )}
          </button>
        )}

        {/* RANDOM MODE: Clean, inviting prompt that can be clicked to type a custom seed */}
        {isRandom && !isEditing ? (
          <div
            onClick={handleStartTyping}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleStartTyping();
              }
            }}
            aria-label="Seed is set to Random. Click to type a custom seed."
            className="flex h-full min-w-0 flex-1 cursor-text items-center gap-1.5 select-none"
          >
            <span className="shrink-0 font-mono text-xs font-semibold text-[var(--ink-faint)] select-none">
              #
            </span>
            <span className="truncate font-mono text-xs text-[var(--ink-faint)] leading-none transition-colors group-hover:text-[var(--ink-soft)]">
              Auto-roll on run
            </span>
          </div>
        ) : (
          /* FIXED MODE OR EDITING: Live numeric input with tabular digits */
          <div className="flex h-full min-w-0 flex-1 items-center gap-1.5">
            <span className="shrink-0 font-mono text-xs font-semibold text-[var(--ink-faint)] select-none">
              #
            </span>
            <input
              ref={inputRef}
              id={id}
              type="text"
              inputMode="numeric"
              value={textValue}
              disabled={disabled}
              placeholder="0–4294967295"
              onChange={handleInputChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="h-full min-w-0 flex-1 bg-transparent py-0 font-mono text-xs font-semibold tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none leading-none"
            />
          </div>
        )}

        {/* Action Toolbar */}
        <div className="flex h-full shrink-0 items-center gap-1 pl-2">
          {/* Roll Random Seed button */}
          <button
            type="button"
            onClick={handleRollSeed}
            disabled={disabled}
            title={isRandom ? "Roll a specific seed" : "Roll new random seed"}
            aria-label="Roll random seed"
            className={`inline-flex items-center justify-center rounded border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--surface)] hover:text-[var(--accent)] active:scale-95 ${btnSizeClass}`}
          >
            <Dices className={iconSizeClass} />
          </button>

          {/* Fixed Mode: Copy to clipboard */}
          {!isRandom && !isEditing && (
            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled}
              title={copied ? "Copied!" : "Copy seed to clipboard"}
              aria-label="Copy seed"
              className={`inline-flex items-center justify-center rounded border transition-colors active:scale-95 ${btnSizeClass} ${
                copied
                  ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-400"
                  : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              {copied ? (
                <Check className={iconSizeClass} />
              ) : (
                <Copy className={iconSizeClass} />
              )}
            </button>
          )}

          {/* Fixed Mode or Editing: Reset back to Random */}
          {(!isRandom || isEditing) && (
            <button
              type="button"
              onClick={handleSetRandom}
              disabled={disabled}
              title="Reset to Random Auto"
              aria-label="Reset to Random Auto"
              className={`inline-flex items-center justify-center rounded border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--surface)] hover:text-[var(--accent)] active:scale-95 ${btnSizeClass}`}
            >
              <RotateCcw className={iconSizeClass} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
