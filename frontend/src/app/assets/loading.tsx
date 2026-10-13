export default function AssetsLoading() {
  return (
    <main
      id="main-content"
      className="assets-root workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)] antialiased"
      aria-busy="true"
      aria-label="Loading assets"
    >
      {/* 1. Header Navigation & Filter Bar Mock */}
      <header className="workspace-command top-0 z-30 mx-2 mt-2 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_88%,transparent)] backdrop-blur-xl sm:mx-4">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-28 rounded bg-[var(--accent)]/30 shimmer" />
            <div className="h-8 w-52 rounded-lg bg-white/15 shimmer" />
            <div className="h-3.5 w-64 rounded bg-white/5 shimmer" />
          </div>
          <div className="h-10 w-32 rounded-xl bg-[var(--accent)]/20 shimmer" />
        </div>
        <div className="mx-auto flex max-w-[1600px] gap-4 px-5 pb-3 sm:px-6">
          <div className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-24 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] shimmer" />
            ))}
          </div>
        </div>
      </header>

      {/* 2. Masonry Cards Grid Mock */}
      <section className="mx-auto max-w-[1600px] px-5 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between text-xs text-[var(--ink-faint)]">
          <div className="h-3.5 w-32 rounded bg-white/10 shimmer" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-label="Loading assets" aria-busy="true">
          {Array.from({ length: 18 }).map((_, idx) => {
            const height = 280 + ((idx * 40) % 140);
            return (
              <div
                key={idx}
                style={{ height, animationDelay: `${idx * 30}ms` }}
                className="relative flex w-full flex-col justify-end overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)]"
              >
                {/* Background base shimmer */}
                <div className="absolute inset-0 shimmer opacity-60" />

                {/* Floating Top Badge Mirror */}
                <div className="absolute left-3.5 top-3.5 z-10 pointer-events-none">
                  <div className="h-5 w-16 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
                </div>

                {/* Atmospheric Bottom Gradient Scrim */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 via-50% to-transparent" />

                {/* Bottom Typography Overlay Mirror */}
                <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5 space-y-2 pointer-events-none">
                  <div className="h-5 w-3/4 rounded-lg bg-white/20 shimmer" />
                  <div className="h-3.5 w-1/2 rounded-md bg-white/10 shimmer mt-1.5" />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
