"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";

export default function CreateToolRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tools?create=true");
  }, [router]);

  return (
    <main className="flex h-full min-h-screen w-full items-center justify-center bg-[var(--ground)] p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)] animate-pulse">
          <Zap className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">
          Redirecting to Tool Studio…
        </p>
        <a
          href="/tools?create=true"
          className="font-mono text-[11px] text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
        >
          Click here if not redirected automatically
        </a>
      </div>
    </main>
  );
}
