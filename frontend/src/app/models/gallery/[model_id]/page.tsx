"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box } from "lucide-react";

export default function ModelDetailRedirect({
  params,
}: {
  params: Promise<{ model_id: string }>;
}) {
  const router = useRouter();

  useEffect(() => {
    params.then(({ model_id }) => {
      router.replace(`/models/${model_id}`);
    });
  }, [params, router]);

  return (
    <main className="flex h-full min-h-screen w-full items-center justify-center bg-[var(--ground)] p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)] animate-pulse">
          <Box className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">
          Redirecting to Model…
        </p>
      </div>
    </main>
  );
}
