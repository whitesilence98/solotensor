"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Box,
  Compass,
  Flame,
  Layers,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Wand2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  withTypes,
  type AssetRecord,
  type GalleryItem,
  type InstalledGalleryModel,
  type PublicModelSummary,
  type ToolSummary,
} from "@/lib/api";
import AssetCardList from "@/components/AssetCardList";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import WorkspaceModal from "@/components/WorkspaceModal";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import TensorModelCard, { ModelCardSkeleton } from "@/components/TensorModelCard";
import { resolveMediaUrl } from "@/lib/api";

type HomeTab = "all" | "posts" | "models" | "tools";

const QUICK_TAGS = [
  "Photorealistic",
  "Anime & Manga",
  "Cyberpunk",
  "Cinematic Portrait",
  "Sci-Fi",
  "Architecture",
  "Surrealism",
  "3D Render",
  "Retro Pixel",
  "Dark Fantasy",
];

const HERO_HIGHLIGHTS = [
  {
    title: "FLUX & SDXL Workflows",
    desc: "Generate high-fidelity assets locally without cloud fees or queue delays.",
    badge: "Native ComfyUI",
    icon: Wand2,
    href: "/generate",
  },
  {
    title: "Creator Model Hub",
    desc: "Download and condition community checkpoints, LoRAs, and ControlNets.",
    badge: "16 Model Types",
    icon: Box,
    href: "/models",
  },
  {
    title: "Tool Studio Pipelines",
    desc: "1-Click automated workflows for upscaling, styling, and video synthesis.",
    badge: "Instant Execution",
    icon: Wrench,
    href: "/tools",
  },
];

function HomeToolCard({ tool }: { tool: ToolSummary }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const thumbUrl = resolveMediaUrl(tool.thumbnail_url);
  const isVideo = tool.mode.includes("video");

  return (
    <Link
      href={`/tools/${encodeURIComponent(tool.tool_id)}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] transition-all duration-300 hover:border-[var(--line-strong)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--surface-sunken)]">
        {thumbUrl && !imgError && (
          <div
            className={`absolute inset-0 shimmer transition-opacity duration-300 ${
              isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          />
        )}

        {thumbUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={tool.name}
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            onError={() => setImgError(true)}
            className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
              <Wrench className="h-5 w-5" />
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--ground)] via-transparent to-transparent opacity-80" />

        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 font-mono text-[9px] font-semibold text-white/90 backdrop-blur-md border border-white/10">
            {isVideo ? <Play className="h-2.5 w-2.5 text-[var(--accent)] fill-current" /> : <Zap className="h-2.5 w-2.5 text-[var(--accent)]" />}
            <span>{tool.mode}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-3.5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-heading text-sm font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors truncate">
              {tool.name}
            </h4>
            <span className="shrink-0 font-mono text-[10px] text-[var(--accent)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--line)]">
              {tool.default_aspect_ratio}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--ink-soft)] leading-relaxed">
            {tool.has_prompt ? "Custom prompt-driven pipeline with instant parameter tuning." : "Interactive ComfyUI pipeline ready for instant parameter tuning."}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[var(--line)]/60 pt-2.5">
          <span className="font-mono text-[10px] text-[var(--ink-faint)] truncate max-w-[140px]">
            {tool.author_username || "Comfy Studio"}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] group-hover:translate-x-0.5 transition-transform">
            Run tool <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const router = useRouter();

  // Tab & Search State
  const [activeTab, setActiveTab] = useState<HomeTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Data states
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [models, setModels] = useState<PublicModelSummary[]>([]);
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Asset Inspection Stage Modal
  const [inspectedAsset, setInspectedAsset] = useState<AssetRecord | null>(null);

  // Fetch initial combined data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      api.getAssets(60),
      api.getPublicModels(""),
      api.getTools(),
      api.listSelectableModels(),
    ])
      .then(([assetsRes, modelsRes, toolsRes, selectableRes]) => {
        if (cancelled) return;

        if (assetsRes.status === "fulfilled") {
          setAssets(withTypes(assetsRes.value));
        }
        if (modelsRes.status === "fulfilled") {
          setModels(modelsRes.value.items || []);
        }
        if (toolsRes.status === "fulfilled") {
          setTools(toolsRes.value);
        }
        if (selectableRes.status === "fulfilled") {
          setModelOptions(selectableRes.value);
        }

        // If all 3 main sources failed, report error
        if (
          assetsRes.status === "rejected" &&
          modelsRes.status === "rejected" &&
          toolsRes.status === "rejected"
        ) {
          setError("Failed to communicate with SoloTensor backend services.");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load discovery stream.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Handle Quick Tag click
  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
    } else {
      setSelectedTag(tag);
      setSearchQuery("");
    }
  };

  // Filtered Assets (Posts)
  const filteredAssets = useMemo(() => {
    let list = assets;
    const q = searchQuery.trim().toLowerCase();
    const tag = selectedTag ? selectedTag.toLowerCase() : null;

    if (tag) {
      list = list.filter((a) => {
        const prompt = (a.metadata?.prompt || "").toLowerCase();
        const modelTitle = (a.metadata?.model_title || "").toLowerCase();
        const tags = (a.metadata?.tags || []).map((t) => t.toLowerCase());
        return prompt.includes(tag) || modelTitle.includes(tag) || tags.some((t) => t.includes(tag));
      });
    }

    if (q) {
      list = list.filter((a) => {
        const prompt = (a.metadata?.prompt || "").toLowerCase();
        const modelTitle = (a.metadata?.model_title || "").toLowerCase();
        const key = (a.key || "").toLowerCase();
        const tags = (a.metadata?.tags || []).map((t) => t.toLowerCase());
        return (
          prompt.includes(q) ||
          modelTitle.includes(q) ||
          key.includes(q) ||
          tags.some((t) => t.includes(q))
        );
      });
    }

    return list;
  }, [assets, searchQuery, selectedTag]);

  // Filtered Models
  const filteredModels = useMemo(() => {
    let list = models;
    const q = searchQuery.trim().toLowerCase();
    const tag = selectedTag ? selectedTag.toLowerCase() : null;

    if (tag) {
      list = list.filter((m) => {
        const title = m.title.toLowerCase();
        const cat = m.category.toLowerCase();
        const tags = (m.tags || []).map((t) => t.toLowerCase());
        return title.includes(tag) || cat.includes(tag) || tags.some((t) => t.includes(tag));
      });
    }

    if (q) {
      list = list.filter((m) => {
        const title = m.title.toLowerCase();
        const cat = m.category.toLowerCase();
        const base = (m.base_model || "").toLowerCase();
        const type = m.model_type.toLowerCase();
        const tags = (m.tags || []).map((t) => t.toLowerCase());
        return (
          title.includes(q) ||
          cat.includes(q) ||
          base.includes(q) ||
          type.includes(q) ||
          tags.some((t) => t.includes(q))
        );
      });
    }

    return list;
  }, [models, searchQuery, selectedTag]);

  // Filtered Tools
  const filteredTools = useMemo(() => {
    let list = tools;
    const q = searchQuery.trim().toLowerCase();
    const tag = selectedTag ? selectedTag.toLowerCase() : null;

    if (tag) {
      list = list.filter((t) => {
        const name = t.name.toLowerCase();
        const mode = t.mode.toLowerCase();
        return name.includes(tag) || mode.includes(tag);
      });
    }

    if (q) {
      list = list.filter((t) => {
        const name = t.name.toLowerCase();
        const mode = t.mode.toLowerCase();
        return name.includes(q) || mode.includes(q);
      });
    }

    return list;
  }, [tools, searchQuery, selectedTag]);

  const hasFilter = searchQuery.trim() !== "" || selectedTag !== null;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTag(null);
  };

  const openAssetInspection = useCallback((item: AssetRecord | GalleryItem) => {
    setInspectedAsset(item as AssetRecord);
  }, []);

  return (
    <main
      id="main-content"
      className="workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)]"
    >
      {/* 1. Tensor.Art-Inspired Discovery Hero & Banner */}
      <section className="relative overflow-hidden border-b border-[var(--line)] bg-[var(--surface-sunken)]">
        {/* Subtle Ambient Radial Glow */}
        <div
          className="pointer-events-none absolute -top-40 left-1/2 -z-0 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-[var(--accent)]/10 blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            {/* Top Tagline Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)]/80 px-3.5 py-1 text-xs font-medium text-[var(--ink-soft)] backdrop-blur-md mb-4 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>SoloTensor Visual Discovery</span>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">v2.4</span>
            </div>

            <h1 className="font-sans text-3xl font-extrabold tracking-tight text-[var(--ink)] sm:text-5xl">
              Local AI creation,{" "}
              <span className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-8">
                unbounded craft.
              </span>
            </h1>
            <p className="mt-3 text-sm text-[var(--ink-soft)] sm:text-base max-w-xl">
              Explore generative assets, checkpoint models, and automated tool pipelines powered directly by your local ComfyUI GPU backend.
            </p>

            {/* Quick CTAs */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/generate"
                className="workspace-action-primary flex items-center gap-2 px-5 py-2.5 text-xs font-bold shadow-md hover:scale-[1.02] active:scale-[0.98]"
              >
                <Wand2 className="h-4 w-4" />
                <span>Open Studio Canvas</span>
              </Link>
              <Link
                href="/models"
                className="workspace-action-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-semibold hover:border-[var(--line-strong)]"
              >
                <Box className="h-4 w-4 text-[var(--accent)]" />
                <span>Browse Models ({models.length})</span>
              </Link>
            </div>
          </div>

          {/* Feature Highlights Bento Rail */}
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {HERO_HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-all duration-300 hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] hover:shadow-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--accent)] group-hover:scale-105 transition-transform">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-wider font-semibold text-[var(--ink-faint)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded border border-[var(--line)]">
                      {item.badge}
                    </span>
                  </div>
                  <div className="mt-3">
                    <h2 className="font-heading text-sm font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--ink-soft)] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Unified Search & Discovery Filter Bar */}
          <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/90 p-3 shadow-xl backdrop-blur-md">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              {/* Search Field */}
              <div className="relative flex-1 group">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)] group-focus-within:text-[var(--accent)] transition-colors" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search prompts, models, styles, tags, or workflows..."
                  className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] pl-10 pr-10 text-xs font-normal text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-all duration-200 hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* View / Content Tabs */}
              <div className="flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-1">
                {(
                  [
                    { id: "all", label: "All Works", icon: Compass },
                    { id: "posts", label: "Latest Posts", icon: Sparkles },
                    { id: "models", label: "Models", icon: Box },
                    { id: "tools", label: "AI Tools", icon: Wrench },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                        isActive
                          ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                          : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Inspiration Tags Carousel */}
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)] pr-1">
                Trends:
              </span>
              {QUICK_TAGS.map((tag) => {
                const isSelected = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagClick(tag)}
                    className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
              {hasFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="shrink-0 text-[11px] font-semibold text-[var(--danger)] hover:underline ml-2"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Main Discovery Sections */}
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 space-y-12">
        {/* Error Notice */}
        {error && (
          <div className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-[var(--danger)] animate-ping" />
              <p className="text-xs text-[var(--ink)]">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="workspace-action-secondary px-3 py-1.5 text-xs font-medium"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {/* SECTION 1: LATEST POSTS / GENERATIONS */}
        {(activeTab === "all" || activeTab === "posts") && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="font-heading text-lg font-bold text-[var(--ink)]">
                  Latest Creations
                </h3>
                <span className="font-mono text-xs text-[var(--ink-faint)]">
                  ({filteredAssets.length})
                </span>
              </div>
              <Link
                href="/assets"
                className="group inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                <span>View all in Library</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <ModelCardSkeleton key={i} index={i} />
                ))}
              </div>
            ) : filteredAssets.length > 0 ? (
              <AssetCardList
                items={filteredAssets}
                aspectRatio="natural"
                onOpen={openAssetInspection}
              />
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/40 p-10 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-50" />
                <h4 className="mt-3 text-sm font-semibold text-[var(--ink)]">
                  {hasFilter ? "No generations match your search" : "No generations found yet"}
                </h4>
                <p className="mt-1 text-xs text-[var(--ink-soft)] max-w-sm mx-auto">
                  {hasFilter
                    ? "Try clearing tags or using broader keywords to find assets."
                    : "Create your first visual masterpiece in the SoloTensor workspace studio."}
                </p>
                <div className="mt-4">
                  {hasFilter ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="workspace-action-secondary px-3.5 py-1.5 text-xs font-semibold"
                    >
                      Clear search filters
                    </button>
                  ) : (
                    <Link
                      href="/generate"
                      className="workspace-action-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Start generating</span>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* SECTION 2: FEATURED CREATOR MODELS */}
        {(activeTab === "all" || activeTab === "models") && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="font-heading text-lg font-bold text-[var(--ink)]">
                  Trending Models & Checkpoints
                </h3>
                <span className="font-mono text-xs text-[var(--ink-faint)]">
                  ({filteredModels.length})
                </span>
              </div>
              <Link
                href="/models"
                className="group inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                <span>Browse all models</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ModelCardSkeleton key={i} index={i} />
                ))}
              </div>
            ) : filteredModels.length > 0 ? (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {filteredModels.slice(0, activeTab === "models" ? undefined : 12).map((item, idx) => (
                  <TensorModelCard key={item.model_id} item={item} index={idx} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/40 p-8 text-center">
                <Box className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-50" />
                <h4 className="mt-3 text-sm font-semibold text-[var(--ink)]">
                  No models match query
                </h4>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Try adjusting filters or import your own safetensors checkpoint.
                </p>
              </div>
            )}
          </section>
        )}

        {/* SECTION 3: AI TOOL STUDIO WORKFLOWS */}
        {(activeTab === "all" || activeTab === "tools") && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="font-heading text-lg font-bold text-[var(--ink)]">
                  Automated AI Tools & Pipelines
                </h3>
                <span className="font-mono text-xs text-[var(--ink-faint)]">
                  ({filteredTools.length})
                </span>
              </div>
              <Link
                href="/tools"
                className="group inline-flex items-center gap-1 font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                <span>Explore all tools</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="relative aspect-[16/10] rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] shimmer"
                  />
                ))}
              </div>
            ) : filteredTools.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {filteredTools.slice(0, activeTab === "tools" ? undefined : 8).map((tool) => (
                  <HomeToolCard key={tool.tool_id} tool={tool} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/40 p-8 text-center">
                <Wrench className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-50" />
                <h4 className="mt-3 text-sm font-semibold text-[var(--ink)]">
                  No automated tools available
                </h4>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Build and publish ComfyUI visual workflows in the Tool Studio.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 mt-12">
        <WorkspaceFooter />
      </div>

      {/* Asset Inspection Modal Dialog */}
      {inspectedAsset && (
        <WorkspaceModal
          open={Boolean(inspectedAsset)}
          onClose={() => setInspectedAsset(null)}
          title={inspectedAsset.metadata?.prompt || inspectedAsset.key}
          size="media"
          headless
        >
          <AssetInspectionStage
            asset={inspectedAsset}
            items={assets}
            modelOptions={modelOptions}
            mode="modal"
            onClose={() => setInspectedAsset(null)}
          />
        </WorkspaceModal>
      )}
    </main>
  );
}
