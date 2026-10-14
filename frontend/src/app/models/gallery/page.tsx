"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box } from "lucide-react";

export default function ModelGalleryRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/models");
  }, [router]);

  return (
    <main className="flex h-full min-h-screen w-full items-center justify-center bg-[var(--ground)] p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)] animate-pulse">
          <Box className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">
          Redirecting to Models…
        </p>
        <a
          href="/models"
          className="font-mono text-[11px] text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
        >
          Click here if not redirected automatically
        </a>
      </div>
    </main>
  );
}
