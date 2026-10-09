import type { ReactNode } from "react";

export default function WorkspacePage({ children, className = "", wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <main id="main-content" className={`workspace-page ${wide ? "workspace-page-wide" : ""} ${className}`}>
      <div className={`workspace-container ${wide ? "workspace-container-wide" : ""}`}>
        <div className={wide ? "" : "workspace-page-frame"}>{children}</div>
      </div>
    </main>
  );
}
