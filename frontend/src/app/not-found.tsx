import Link from "next/link";
import { ArrowRight, ScanSearch } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main-content" className="workspace-page grid place-items-center">
      <section className="w-full max-w-2xl py-12">
        <div className="flex items-center gap-3 text-[var(--accent)]">
          <ScanSearch className="h-6 w-6" aria-hidden="true" />
          <span className="workspace-data text-sm">404 / NOT FOUND</span>
        </div>
        <h1 className="workspace-title mt-6">Nothing is stored at this address.</h1>
        <p className="workspace-copy mt-5">The item may have moved, been removed, or never existed in this local workspace.</p>
        <nav aria-label="Recovery links" className="mt-9 grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
          <Link href="/" className="group flex min-h-20 items-center justify-between bg-[var(--surface)] px-5 text-sm font-semibold hover:bg-[var(--surface-raised)]">
            Create an image <ArrowRight className="h-4 w-4 text-[var(--accent)] transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="/assets" className="group flex min-h-20 items-center justify-between bg-[var(--surface)] px-5 text-sm font-semibold hover:bg-[var(--surface-raised)]">
            Browse the library <ArrowRight className="h-4 w-4 text-[var(--accent)] transition-transform group-hover:translate-x-1" />
          </Link>
        </nav>
      </section>
    </main>
  );
}
