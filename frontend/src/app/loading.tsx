export default function Loading() {
  return (
    <main id="main-content" className="workspace-page" aria-busy="true" aria-label="Loading workspace">
      <div className="workspace-container">
        <div className="workspace-reveal space-y-8">
          <div className="space-y-3 border-b border-[var(--line)] pb-8">
            <div className="shimmer h-3 w-24 rounded-full" />
            <div className="shimmer h-12 w-full max-w-xl rounded-[var(--radius-control)]" />
            <div className="shimmer h-4 w-full max-w-md rounded-full" />
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
            <div className="shimmer min-h-[24rem] rounded-[var(--radius-panel)]" />
            <div className="shimmer min-h-[32rem] rounded-[var(--radius-panel)]" />
          </div>
        </div>
      </div>
    </main>
  );
}
