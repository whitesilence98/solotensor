"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export default function WorkspaceModal({
  open,
  title,
  description,
  children,
  onClose,
  destructive = false,
  size = "default",
  eyebrow,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  destructive?: boolean;
  size?: "default" | "wide" | "media";
  eyebrow?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus());
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnFocus = () => openerRef.current?.focus();
    dialog.addEventListener("close", returnFocus);
    return () => dialog.removeEventListener("close", returnFocus);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className={`workspace-modal ${size === "wide" ? "!max-w-4xl" : size === "media" ? "!max-w-6xl" : ""} ${destructive ? "workspace-modal-danger" : ""}`}
    >
      <div className="workspace-modal-card">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="workspace-kicker mb-3">{eyebrow ?? (destructive ? "Confirm action" : "Workspace")}</div>
            <h2 id={titleId} className="workspace-heading text-xl font-semibold text-[var(--ink)]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="workspace-action-quiet workspace-action-icon -mr-1 -mt-1 shrink-0" aria-label="Close dialog">
            <X className="h-4.5 w-4.5" strokeWidth={1.5} />
          </button>
        </div>
        {description && <p id={descriptionId} className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{description}</p>}
        <div className="workspace-modal-content mt-6">{children}</div>
      </div>
    </dialog>
  );
}
