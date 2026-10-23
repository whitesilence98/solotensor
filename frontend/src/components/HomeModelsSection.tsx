"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Box, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { PublicModelSummary } from "@/lib/api";
import TensorModelCard, { ModelCardSkeleton } from "@/components/TensorModelCard";
import Carousel from "@/components/Carousel";

const MODEL_CATEGORY_PILLS = [
  { id: "hot-trends", label: "Hot Trends" },
  { id: "manga", label: "Manga" },
  { id: "niji-style", label: "Niji Style" },
  { id: "vtuber", label: "VTuber" },
  { id: "photography", label: "Photography" },
  { id: "e-commerce", label: "E-commerce" },
  { id: "3d-cgi", label: "3D & CGI" },
  { id: "chibi", label: "Chibi" },
  { id: "vintage-art", label: "Vintage Art" },
  { id: "cozy-healing", label: "Cozy & Healing" },
];

const ITEMS_PER_PAGE = 4;
const MAX_TRENDING_MODELS = 20;

interface HomeModelsSectionProps {
  models: PublicModelSummary[];
  loading?: boolean;
}

export default function HomeModelsSection({
  models,
  loading = false,
}: HomeModelsSectionProps) {
  const [activeCategory, setActiveCategory] = useState("hot-trends");
  const [currentPage, setCurrentPage] = useState(0);

  // Filter models based on the selected category pill and take maximum 20 trending models
  const trendingModels = useMemo(() => {
    let list: PublicModelSummary[] = [];

    if (activeCategory === "hot-trends") {
      // For Hot Trends, sort by sample_count or runs descending
      list = [...models].sort((a, b) => (b.sample_count ?? 0) - (a.sample_count ?? 0));
    } else {
      const target = activeCategory.replace("-", " ").toLowerCase();
      list = models.filter((m) => {
        const title = (m.title || "").toLowerCase();
        const cat = (m.category || "").toLowerCase();
        const base = (m.base_model || "").toLowerCase();
        const tags = (m.tags || []).map((t) => t.toLowerCase());

        if (target === "3d cgi") {
          return cat.includes("3d") || title.includes("3d") || tags.some((t) => t.includes("3d") || t.includes("cgi"));
        }
        if (target === "cozy healing") {
          return tags.some((t) => t.includes("cozy") || t.includes("healing")) || title.includes("cozy");
        }
        if (target === "e commerce") {
          return tags.some((t) => t.includes("commerce") || t.includes("product")) || title.includes("product");
        }
        if (target === "vintage art") {
          return tags.some((t) => t.includes("vintage") || t.includes("retro")) || title.includes("vintage") || title.includes("retro");
        }

        return (
          title.includes(target) ||
          cat.includes(target) ||
          base.includes(target) ||
          tags.some((t) => t.includes(target))
        );
      });
    }

    // Maximum 20 trending models
    return list.slice(0, MAX_TRENDING_MODELS);
  }, [models, activeCategory]);

  const totalPages = Math.max(1, Math.ceil(trendingModels.length / ITEMS_PER_PAGE));

  return (
    <section className="space-y-4" aria-labelledby="home-models-heading">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
        <div className="flex items-center gap-2.5">
          <Box className="h-4.5 w-4.5 text-[var(--accent)]" />
          <h2
            id="home-models-heading"
            className="font-heading text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]"
          >
            Trending Models
          </h2>
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-raised)] border border-[var(--line)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)] font-semibold">
            <Sparkles className="h-2.5 w-2.5 text-[var(--accent)]" />
            {trendingModels.length} Featured
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Header Quick Pagination Controls */}
          {totalPages > 1 && !loading && (
            <div className="hidden sm:flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => (prev <= 0 ? totalPages - 1 : prev - 1))}
                title="Previous page"
                aria-label="Previous models page"
                className="flex h-7 w-7 items-center justify-center rounded text-[var(--ink-soft)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition active:scale-95"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] font-semibold text-[var(--ink)] select-none">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => (prev >= totalPages - 1 ? 0 : prev + 1))}
                title="Next page"
                aria-label="Next models page"
                className="flex h-7 w-7 items-center justify-center rounded text-[var(--ink-soft)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition active:scale-95"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Link
            href="/models"
            className="group inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            <span>View All &gt;</span>
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>

      {/* Category Filter Pills (Wrapping without horizontal scroll) */}
      <div className="flex flex-wrap items-center gap-2 pb-1 text-xs">
        {MODEL_CATEGORY_PILLS.map((pill) => {
          const isActive = activeCategory === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => {
                setActiveCategory(pill.id);
                setCurrentPage(0);
              }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                  : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Models Carousel */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ModelCardSkeleton key={i} index={i} />
          ))}
        </div>
      ) : trendingModels.length > 0 ? (
        <Carousel
          key={activeCategory}
          items={trendingModels}
          itemsPerPage={ITEMS_PER_PAGE}
          currentIndex={currentPage}
          onIndexChange={setCurrentPage}
          loop={true}
          ariaLabel="Trending models carousel"
          renderPage={(pageItems, pageIdx) => (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {pageItems.map((item, itemIdx) => (
                <TensorModelCard
                  key={item.model_id}
                  item={item}
                  index={pageIdx * ITEMS_PER_PAGE + itemIdx}
                  className="shadow-sm"
                />
              ))}
            </div>
          )}
        />
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/40 p-10 text-center">
          <Box className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-50" />
          <h4 className="mt-3 text-sm font-semibold text-[var(--ink)]">
            No models found in this category
          </h4>
          <p className="mt-1 text-xs text-[var(--ink-soft)] max-w-sm mx-auto">
            Try switching back to Hot Trends or check the full model hub for community uploads.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setActiveCategory("hot-trends");
                setCurrentPage(0);
              }}
              className="workspace-action-secondary px-3.5 py-1.5 text-xs font-semibold"
            >
              Reset to Hot Trends
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
