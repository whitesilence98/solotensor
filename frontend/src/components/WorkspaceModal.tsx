"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export default function WorkspaceModal({
  open,
  title,
  description,
  children,
  onClose,
  destructive = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  destructive?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-title`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className={`workspace-modal ${destructive ? "workspace-modal-danger" : ""}`}
    >
      <div className="workspace-modal-card">
        <h2 id={titleId} className="text-base font-semibold text-[var(--ink)]">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}
