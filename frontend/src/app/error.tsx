"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="workspace-page grid place-items-center">
      <section className="workspace-bezel w-full max-w-xl">
        <div className="workspace-core p-7 sm:p-10">
          <span className="workspace-icon-island h-11 w-11 bg-[var(--danger-surface)] text-[var(--danger)]">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="workspace-kicker mt-7">Workspace interrupted</p>
          <h1 className="workspace-heading mt-3 text-3xl font-semibold tracking-[-.045em]">This view could not load.</h1>
          <p role="alert" className="workspace-copy mt-4">Your local data is unchanged. Retry the view or return to the generation studio.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="workspace-action-primary min-h-11 gap-2 px-4 text-sm">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retry
            </button>
            <Link href="/" className="workspace-action-secondary min-h-11 px-4 text-sm">Return to Create</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
