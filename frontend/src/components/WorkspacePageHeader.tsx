import type { ReactNode } from "react";
import CreditPill from "@/components/CreditPill";

export default function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  showCreditPill = true,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  showCreditPill?: boolean;
}) {
  return (
    <header className="workspace-header">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <div className="workspace-kicker mb-4">{eyebrow}</div>}
          <h1 className="workspace-title">{title}</h1>
          {description && <p className="workspace-copy mt-4">{description}</p>}
        </div>
        <div className="workspace-header-actions shrink-0 flex items-center gap-2.5">
          {showCreditPill && <CreditPill />}
          {actions}
        </div>
      </div>
      {children && <div className="workspace-header-content">{children}</div>}
    </header>
  );
}
