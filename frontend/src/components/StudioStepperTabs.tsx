"use client";

import React from "react";
import { Check } from "lucide-react";

export interface StudioStepItem<T = number | string> {
  id: T;
  label: string;
  code?: string;
  disabled?: boolean;
  tooltip?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface StudioStepperTabsProps<T = number | string> {
  steps: StudioStepItem<T>[];
  activeStep: T;
  onStepChange: (stepId: T) => void;
  busy?: boolean;
  mode?: "wizard" | "tabs";
  className?: string;
  ariaLabel?: string;
}

/**
 * Unified tactile Obsidian stepper/tab navigation for Studio Drawers.
 * Synchronizes visual language across Create Tool, Create Model, and Edit Model.
 */
export default function StudioStepperTabs<T = number | string>({
  steps,
  activeStep,
  onStepChange,
  busy = false,
  mode = "wizard",
  className = "",
  ariaLabel = "Studio workflow steps",
}: StudioStepperTabsProps<T>) {
  const activeIndex = steps.findIndex((item) => item.id === activeStep);

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center border-b border-[var(--line)] bg-[var(--surface-sunken)] px-6 py-2 select-none ${className}`}
    >
      <div
        className="grid w-full gap-2 font-mono text-[11px]"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((item, index) => {
          const isActive = item.id === activeStep;
          const isPast = mode === "wizard" && activeIndex > index;
          const isDisabled = busy || Boolean(item.disabled);
          const code = item.code || (index + 1).toString().padStart(2, "0");

          return (
            <button
              key={String(item.id)}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  onStepChange(item.id);
                }
              }}
              title={item.tooltip}
              aria-current={isActive ? "step" : undefined}
              className={`group relative flex items-center justify-center gap-2 rounded-[5px] py-2 px-2 transition-all ${
                isDisabled
                  ? "border border-transparent text-[var(--ink-faint)]/35 opacity-40 cursor-not-allowed"
                  : isActive
                    ? "border border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm shadow-[var(--accent)]/5"
                    : isPast
                      ? "border border-[var(--line)] bg-[var(--surface-raised)]/60 text-[var(--ink)] hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
                      : "border border-transparent text-[var(--ink-faint)] hover:border-[var(--line)] hover:bg-[var(--surface-raised)]/60 hover:text-[var(--ink-soft)]"
              }`}
            >
              <span
                className={`flex h-4 min-w-[18px] px-1 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold ${
                  isActive
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : isPast
                      ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                      : isDisabled
                        ? "bg-[var(--surface-soft)]/50 text-[var(--ink-faint)]/40"
                        : "bg-[var(--surface-soft)] text-[var(--ink-faint)]"
                }`}
              >
                {isPast ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : code}
              </span>
              <span className="truncate font-semibold tracking-wide uppercase text-[10px]">
                {item.label}
              </span>
              {isActive && (
                <div className="absolute inset-x-2 -bottom-2 h-0.5 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
