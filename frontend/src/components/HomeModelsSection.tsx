"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Box } from "lucide-react";
import type { PublicModelSummary } from "@/lib/api";
import TensorModelCard, { ModelCardSkeleton } from "@/components/TensorModelCard";

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

interface HomeModelsSectionProps {
  models: PublicModelSummary[];
  loading?: boolean;
}

export default function HomeModelsSection({
  models,
  loading = false,
}: HomeModelsSectionProps) {
  const [activeCategory, setActiveCategory] = useState("hot-trends");

  // Filter models based on the selected category pill
  const filteredModels = useMemo(() => {
    if (activeCategory === "hot-trends") {
      // For Hot Trends, sort by sample_count descending
      return [...models].sort((a, b) => (b.sample_count ?? 0) - (a.sample_count ?? 0));
    }

    const target = activeCategory.replace("-", " ").toLowerCase();
    return models.filter((m) => {
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
  }, [models, activeCategory]);

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
            Models
          </h2>
          <span className="font-mono text-xs text-[var(--ink-faint)]">
            ({models.length})
          </span>
        </div>

        <Link
          href="/models"
          className="group inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          <span>View More &gt;</span>
          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* Horizontal Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        {MODEL_CATEGORY_PILLS.map((pill) => {
          const isActive = activeCategory === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setActiveCategory(pill.id)}
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

      {/* 4-Column Cards (3:4 Ratio) */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ModelCardSkeleton key={i} index={i} />
          ))}
        </div>
      ) : filteredModels.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredModels.slice(0, 8).map((item, idx) => (
            <TensorModelCard
              key={item.model_id}
              item={item}
              index={idx}
              className="shadow-sm"
            />
          ))}
        </div>
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
              onClick={() => setActiveCategory("hot-trends")}
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
