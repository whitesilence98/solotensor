export default function StudioLoading() {
  return (
    <div
      className="workspace-bezel relative flex h-full min-h-0 w-full flex-col overflow-y-auto bg-transparent p-2 sm:p-3 lg:flex-row lg:gap-3 lg:overflow-hidden"
      aria-busy="true"
      aria-label="Loading Studio Workspace"
    >
      {/* Left Inspector Skeleton (1:1 with ControlPanel) */}
      <div className="h-auto w-full lg:h-full lg:w-[24.5rem] min-h-0 shrink-0">
        <aside className="relative flex flex-col h-full min-h-0 w-full shrink-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[var(--surface)] text-[var(--ink)] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
          {/* Top Mode Tabs Mock */}
          <div className="border-b border-[var(--line)] bg-[var(--surface-sunken)] p-1.5 shrink-0">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface)] p-1">
              <div className="h-8 rounded-lg bg-white/10 shimmer" />
              <div className="h-8 rounded-lg bg-white/5 shimmer" />
            </div>
          </div>

          {/* Inspector Body Skeleton */}
          <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
            {/* Section: Models Header */}
            <div className="flex items-center justify-between">
              <div className="h-4 w-16 rounded bg-white/10 shimmer" />
              <div className="h-3 w-20 rounded bg-white/5 shimmer" />
            </div>

            {/* Basic Model Card Skeleton */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="h-3 w-16 rounded bg-white/10 shimmer" />
                <div className="h-3.5 w-12 rounded-xl bg-white/5 shimmer" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-[var(--surface-soft)] shimmer border border-white/5" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-white/15 shimmer" />
                  <div className="h-2.5 w-1/2 rounded bg-white/10 shimmer" />
                </div>
              </div>
            </div>

            {/* Prompt Composer Section Skeleton */}
            <div className="space-y-3 pt-1">
              {/* Positive Prompt */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-12 rounded bg-white/10 shimmer" />
                  <div className="h-3 w-8 rounded bg-white/5 shimmer" />
                </div>
                <div className="h-24 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3 space-y-2">
                  <div className="h-3 w-4/5 rounded bg-white/10 shimmer" />
                  <div className="h-3 w-3/5 rounded bg-white/5 shimmer" />
                </div>
              </div>

              {/* Negative Prompt */}
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-white/10 shimmer" />
                <div className="h-16 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                  <div className="h-3 w-2/3 rounded bg-white/5 shimmer" />
                </div>
              </div>
            </div>

            {/* Aspect Ratio / Format Preset Chips */}
            <div className="space-y-2 pt-1">
              <div className="h-3 w-20 rounded bg-white/10 shimmer" />
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
                ))}
              </div>
            </div>
          </div>

          {/* Pinned Sticky Generate Footer Skeleton */}
          <div className="sticky bottom-0 z-20 shrink-0 border-t border-[var(--line)] bg-[var(--surface)]/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="h-10 w-16 shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
              <div className="h-10 flex-1 rounded-xl bg-[var(--accent)]/30 shimmer" />
            </div>
          </div>
        </aside>
      </div>

      {/* Right Canvas Viewport Skeleton (1:1 with CanvasPreview) */}
      <main className="workspace-core workspace-scroll relative flex h-auto min-h-[36rem] min-w-0 flex-1 flex-col overflow-y-auto rounded-[1.35rem] border border-white/10 bg-[color-mix(in_srgb,var(--ground)_88%,var(--surface))] text-[var(--ink)] shadow-[0_24px_80px_rgba(19,28,17,.18)] lg:h-full">
        {/* Viewport Control Strip Mock */}
        <header className="workspace-command top-0 z-30 m-2 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[var(--line-strong)] bg-[rgba(15,18,15,.85)] px-3.5 py-2.5 shadow-[0_14px_42px_rgba(3,8,4,.32)] backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
            <div className="hidden sm:inline-flex h-7 w-24 rounded-xl border border-white/10 bg-[var(--surface-raised)] shimmer" />
            <div className="h-7 w-32 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-16 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
            <div className="h-8 w-8 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
            <div className="h-8 w-20 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shimmer" />
          </div>
        </header>

        {/* Canvas Body Frame Mock */}
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-2xl aspect-square max-h-[32rem] rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/50 shimmer flex flex-col items-center justify-center p-6 text-center">
            <div className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 shimmer mb-3" />
            <div className="h-4 w-40 rounded bg-white/10 shimmer mb-2" />
            <div className="h-3 w-64 rounded bg-white/5 shimmer" />
          </div>
        </div>
      </main>
    </div>
  );
}
