import type { ReactNode } from "react";

export default function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <div className="workspace-kicker mb-4">{eyebrow}</div>}
          <h1 className="workspace-title">{title}</h1>
          {description && <p className="workspace-copy mt-4">{description}</p>}
        </div>
        {actions && <div className="workspace-header-actions shrink-0">{actions}</div>}
      </div>
      {children && <div className="workspace-header-content">{children}</div>}
    </header>
  );
}
