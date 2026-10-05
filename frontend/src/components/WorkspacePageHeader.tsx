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
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <div className="workspace-kicker mb-3">{eyebrow}</div>}
          <h1 className="workspace-title">{title}</h1>
          {description && <p className="workspace-copy mt-3">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
