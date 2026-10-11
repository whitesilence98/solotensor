export default function ToolStudioLoading() {
  return (
    <main
      id="main-content"
      className="workspace-page workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)] antialiased"
      aria-busy="true"
      aria-label="Loading tools"
    >
      {/* 1. Header Navigation & Filter Bar Mock */}
      <header className="workspace-command top-0 z-30 mx-2 mt-2 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_88%,transparent)] backdrop-blur-xl sm:mx-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-[var(--accent)]/30 shimmer" />
              <div className="h-8 w-48 rounded-lg bg-white/15 shimmer" />
              <div className="h-3.5 w-64 rounded bg-white/5 shimmer" />
            </div>
            <div className="h-10 w-36 rounded-xl bg-[var(--accent)]/20 shimmer" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 w-24 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] shimmer" />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Grid Mock */}
      <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between text-xs text-[var(--ink-faint)]">
          <div className="h-3.5 w-32 rounded bg-white/10 shimmer" />
        </div>

        {/* 1:1 Matching Tool Poster Cards Grid */}
        <div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-label="Loading tools"
        >
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              style={{ animationDelay: `${idx * 40}ms` }}
              className="relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)]"
            >
              {/* Background base shimmer */}
              <div className="absolute inset-0 shimmer opacity-60" />

              {/* Floating Top Metadata & Actions Mirror */}
              <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <div className="h-5 w-16 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
                  <div className="h-5 w-10 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
                </div>
                <div className="h-7 w-7 rounded-lg border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
              </div>

              {/* Atmospheric Bottom Gradient Scrim */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 via-50% to-transparent" />

              {/* Bottom Typography Overlay Mirror */}
              <div className="absolute inset-x-0 bottom-0 z-10 p-5 space-y-2 pointer-events-none">
                <div className="h-6 w-2/3 rounded-lg bg-white/20 shimmer" />
                <div className="h-4 w-1/3 rounded-md bg-white/10 shimmer mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
