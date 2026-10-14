import Link from "next/link";
import { ArrowRight, Box, FolderOpen, Scan, Sparkles, Wrench } from "lucide-react";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="workspace-page relative flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center p-4 sm:p-6 lg:p-8"
    >
      {/* Viewfinder Radar Card */}
      <section className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-7 sm:p-10 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {/* Ambient Subtle Grid & Scrim */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(var(--accent)_1px,transparent_1px)] [background-size:20px_20px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-transparent"
        />

        {/* Technical Status Strip */}
        <div className="relative z-10 flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[var(--accent)] uppercase">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            <Scan className="h-4 w-4" aria-hidden="true" />
            <span>404 // COORDINATES_UNRESOLVED</span>
          </div>
          <span className="font-mono text-[10px] text-[var(--ink-faint)] uppercase tracking-wider">
            LOCAL INSTANCE
          </span>
        </div>

        {/* Confident, Anti-Apologetic Typography */}
        <div className="relative z-10 mt-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
            This tensor was not found in local memory.
          </h1>
          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-[var(--ink-soft)]">
            The requested workflow, model checkpoint, or asset may have been relocated, deleted, or was never generated in this local storage.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="relative z-10 mt-6">
          <Link
            href="/"
            className="workspace-action-primary flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold transition shadow-lg"
          >
            <Sparkles className="h-4 w-4" />
            <span>Return to Studio</span>
          </Link>
        </div>

        {/* Secondary Action Grid */}
        <div className="relative z-10 mt-6 pt-5 border-t border-[var(--line)]">
          <p className="font-mono text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider mb-3">
            Active Exploration Routes
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Link
              href="/tools"
              className="group flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
            >
              <div className="flex items-center justify-between text-[var(--accent)]">
                <Wrench className="h-4 w-4" />
                <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
              </div>
              <div className="mt-3">
                <span className="block text-xs font-bold text-[var(--ink)]">Workflows</span>
                <span className="block text-[10px] text-[var(--ink-faint)]">Tools & APIs</span>
              </div>
            </Link>

            <Link
              href="/models"
              className="group flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
            >
              <div className="flex items-center justify-between text-[var(--accent)]">
                <Box className="h-4 w-4" />
                <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
              </div>
              <div className="mt-3">
                <span className="block text-xs font-bold text-[var(--ink)]">Models</span>
                <span className="block text-[10px] text-[var(--ink-faint)]">Checkpoints</span>
              </div>
            </Link>

            <Link
              href="/assets"
              className="group flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
            >
              <div className="flex items-center justify-between text-[var(--accent)]">
                <FolderOpen className="h-4 w-4" />
                <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
              </div>
              <div className="mt-3">
                <span className="block text-xs font-bold text-[var(--ink)]">Library</span>
                <span className="block text-[10px] text-[var(--ink-faint)]">Outputs</span>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
