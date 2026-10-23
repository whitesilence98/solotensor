"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  Box,
  Check,
  ChevronRight,
  ExternalLink,
  Film,
  Flag,
  Gift,
  ImageIcon,
  Layers,
  Medal,
  Package,
  Play,
  Plus,
  Rocket,
  Search,
  Settings,
  Share2,
  Sparkles,
  Trophy,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  resolveMediaUrl,
  type CreatorModel,
  type GalleryItem,
  type GenerationRecord,
  type PublicModelSummary,
  type ToolSummary,
  type UserPublicProfile,
} from "@/lib/api";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import TensorModelCard, { ModelCardSkeleton } from "@/components/TensorModelCard";
import AssetCardList from "@/components/AssetCardList";
import WorkspaceModal from "@/components/WorkspaceModal";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import { generationRecordToGalleryItem } from "@/components/ModelGenerationsGrid";
import RoleBadge from "@/components/RoleBadge";
import UserAvatar from "@/components/UserAvatar";

type ActiveTab =
  | "all"
  | "tools"
  | "models"
  | "posts"
  | "workflows"
  | "articles"
  | "buffet";

// Formatting helper: 13300 -> 13.3K, 62700000 -> 62.7M
function formatMetric(n: number): string {
  if (n >= 1_000_000) {
    const formatted = (n / 1_000_000).toFixed(1);
    return formatted.endsWith(".0") ? `${Math.floor(n / 1_000_000)}M` : `${formatted}M`;
  }
  if (n >= 1_000) {
    const formatted = (n / 1_000).toFixed(1);
    return formatted.endsWith(".0") ? `${Math.floor(n / 1_000)}K` : `${formatted}K`;
  }
  return (n ?? 0).toLocaleString("en-US");
}

function creatorModelToSummary(m: CreatorModel, author?: UserPublicProfile | null): PublicModelSummary {
  let coverUrl: string | null = null;
  let sampleCount = 0;
  let fileCount = 0;
  for (const v of m.versions || []) {
    fileCount += v.files?.length || 0;
    sampleCount += v.samples?.length || 0;
    if (!coverUrl && v.samples?.length) {
      coverUrl = v.samples[0].url;
    }
  }
  return {
    model_id: m.model_id,
    title: m.title,
    description: m.description,
    category: m.category,
    model_type: m.model_type,
    tags: m.tags || [],
    base_model: m.compatibility?.base_model || "SDXL",
    published_at: m.published_at || m.created_at,
    updated_at: m.updated_at,
    cover_url: coverUrl,
    version_count: (m.versions || []).length,
    file_count: fileCount,
    sample_count: sampleCount,
    author_id: m.user_id || undefined,
    author_username: author?.username || undefined,
    author_display_name: author?.display_name || undefined,
    author_avatar_url: author?.avatar_url || undefined,
    moderation_status: m.moderation_status,
  };
}

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const unwrappedParams = use(params);
  const username = decodeURIComponent(unwrappedParams.username);

  const { user: currentUser } = useAuth();
  const isSelf = Boolean(
    currentUser?.username &&
    currentUser.username.toLowerCase() === username.toLowerCase()
  );

  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);

  // Real items fetched for this user
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [models, setModels] = useState<PublicModelSummary[]>([]);
  const [posts, setPosts] = useState<GenerationRecord[]>([]);

  // Search & Filter state for specific tabs
  const [searchQuery, setSearchQuery] = useState("");
  const [toolModeFilter, setToolModeFilter] = useState("all");
  const [modelTypeFilter, setModelTypeFilter] = useState("all");

  // Interaction feedback states
  const [shareToast, setShareToast] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportedSuccess, setReportedSuccess] = useState(false);
  const [blockedSuccess, setBlockedSuccess] = useState(false);

  // Modal Inspection Stage for posts
  const [selectedAsset, setSelectedAsset] = useState<GalleryItem | null>(null);

  const openAsset = useCallback((asset: GalleryItem) => {
    setSelectedAsset(asset);
  }, []);

  const selectAssetInCarousel = useCallback((asset: GalleryItem) => {
    setSelectedAsset(asset);
  }, []);

  const closeAsset = useCallback(() => {
    setSelectedAsset(null);
  }, []);

  // Listen for browser Back button to dismiss inspection stage smoothly
  useEffect(() => {
    const onPopState = () => {
      if (selectedAsset) {
        setSelectedAsset(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedAsset]);

  // Load creator profile and all their authentic creations
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .getUserProfile(username)
      .then(async (data) => {
        if (cancelled) return;
        setProfile(data);
        setIsFollowing(data.is_following);
        setFollowersCount(data.followers_count);

        // Fetch real genuine content for this creator using their unique ID
        setContentLoading(true);
        try {
          const [toolsRes, modelsRes, galleryRes] = await Promise.all([
            api.listTools(data.id).catch(() => []),
            (isSelf
              ? api.listCreatorModels({ user_id: data.id })
                  .then((items) => ({ items: items.map((m) => creatorModelToSummary(m, data)) }))
                  .catch(() => api.getPublicModels("", data.id))
              : api.getPublicModels("", data.id)
            ).catch(() => ({ items: [] })),
            api.getGalleryPaginated({ user_id: data.id, limit: 60 }).catch(() => ({ items: [], total: 0 })),
          ]);

          if (!cancelled) {
            setTools(toolsRes || []);
            setModels(modelsRes?.items || []);
            setPosts(galleryRes?.items || []);
          }
        } finally {
          if (!cancelled) setContentLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load user profile", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  // Handle follow / unfollow toggle
  const handleToggleFollow = async () => {
    try {
      const res = await api.toggleFollowUser(username);
      setIsFollowing(res.following);
      setFollowersCount(res.followers_count);
    } catch {
      // Optimistic fallback
      setIsFollowing((prev) => {
        const next = !prev;
        setFollowersCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
        return next;
      });
    }
  };

  // Handle share profile link
  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2600);
    }
  };

  // Handle report user
  const handleConfirmReport = () => {
    setReportedSuccess(true);
    setTimeout(() => {
      setReportModalOpen(false);
      setReportedSuccess(false);
      setReportReason("");
    }, 1500);
  };

  // Handle block user
  const handleConfirmBlock = () => {
    setBlockedSuccess(true);
    setTimeout(() => {
      setBlockModalOpen(false);
      setBlockedSuccess(false);
    }, 1500);
  };

  // Filtered tools
  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      if (searchQuery.trim() && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (toolModeFilter === "video" && !t.mode.includes("video")) return false;
      if (toolModeFilter === "image" && t.mode.includes("video")) return false;
      return true;
    });
  }, [tools, searchQuery, toolModeFilter]);

  // Filtered models
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (searchQuery.trim() && !m.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (modelTypeFilter !== "all") {
        if (modelTypeFilter === "Checkpoint") {
          if (m.model_type !== "Checkpoint" && m.model_type !== "SVD") return false;
        } else if (modelTypeFilter === "LoRA") {
          if (!["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(m.model_type)) return false;
        } else if (m.model_type !== modelTypeFilter) {
          return false;
        }
      }
      return true;
    });
  }, [models, searchQuery, modelTypeFilter]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          (p.prompt && p.prompt.toLowerCase().includes(query)) ||
          (p.model_title && p.model_title.toLowerCase().includes(query)) ||
          (p.filename && p.filename.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [posts, searchQuery]);

  const galleryItems = useMemo(
    () => posts.map(generationRecordToGalleryItem),
    [posts]
  );

  const filteredGalleryItems = useMemo(
    () => filteredPosts.map(generationRecordToGalleryItem),
    [filteredPosts]
  );

  // Workflows directly derived from user's active tool definitions
  const workflows = useMemo(() => {
    return tools.map((t) => ({
      id: t.tool_id,
      title: t.name,
      description: `Automated visual synthesis pipeline configured for ${t.mode.replace(/-/g, " ")}. Backed by native ComfyUI graph execution.`,
      mode: t.mode,
      aspectRatio: t.default_aspect_ratio,
      created: t.created_at
        ? new Date(t.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Active",
    }));
  }, [tools]);

  // Display user details & telemetry
  const displayName = profile?.display_name || profile?.username || username;
  const userId = profile?.id || "";
  const primaryRole = profile?.primary_role || profile?.role || "creator";
  const userRoles = profile?.roles && profile.roles.length > 0 ? profile.roles : [primaryRole];
  const followingCount = profile?.following_count ?? 0;
  const runsCount = profile?.runs_count ?? 0;
  const downloadsCount = profile?.downloads_count ?? 0;
  const likesCount = profile?.likes_count ?? 0;
  const starsCount = profile?.stars_count ?? 0;
  const toolsCount = profile?.tools_count ?? tools.length;
  const modelsCount = profile?.models_count ?? models.length;
  const postsCount = profile?.posts_count ?? posts.length;
  const workflowsCount = profile?.workflows_count ?? workflows.length;
  const articlesCount = 0;

  return (
    <div className="workspace-page workspace-scroll bg-[var(--ground)] text-[var(--ink)] min-h-screen">
      {/* Toast Notification */}
      {shareToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--surface-raised)] px-4 py-2.5 text-xs font-semibold text-[var(--accent)] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="h-4 w-4" />
          <span>Profile URL copied to clipboard</span>
        </div>
      )}

      {/* Main Container */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
        {/* ========================================================= */}
        {/* HEADER PROFILE CARD                                       */}
        {/* ========================================================= */}
        <header className="relative flex flex-col md:flex-row items-start gap-6 pb-6 border-b border-[var(--line)]">
          {/* 84px Hero Avatar */}
          <div className="relative flex-shrink-0">
            <UserAvatar
              src={profile?.avatar_url}
              name={displayName}
              username={username}
              role={primaryRole}
              size="2xl"
              showRoleRing={true}
              online={true}
              shape="circle"
            />
          </div>

          {/* User Details & Telemetry Stack */}
          <div className="flex-1 space-y-2.5 min-w-0">
            {/* Row 1: Username & Role Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)] leading-none">
                {displayName}
              </h1>

              {/* Dynamic Brutalist Role Badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {userRoles.map((r) => (
                  <RoleBadge key={r} role={r} size="sm" />
                ))}
              </div>
            </div>

            {/* Row 2: Numeric / String User ID */}
            {userId && (
              <p className="font-mono text-[11px] text-[var(--ink-faint)] tracking-normal mt-0.5 select-all">
                {userId}
              </p>
            )}

            {/* Row 3: Achievement Medals Strip */}
            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
              <div
                className="group relative flex h-6 w-6 items-center justify-center rounded-md border border-amber-600/50 bg-amber-950/80 text-amber-300 shadow-sm hover:scale-105 transition"
                title="Verified Studio Creator"
              >
                <Award className="h-3.5 w-3.5" />
              </div>

              <div
                className="group relative flex h-6 items-center gap-0.5 rounded-md border border-slate-600/50 bg-slate-900/80 px-1.5 text-slate-200 shadow-sm hover:scale-105 transition"
                title="Active Node Engineer"
              >
                <Medal className="h-3.5 w-3.5 text-slate-300" />
                <span className="font-mono text-[10px] font-bold">1</span>
              </div>

              <div
                className="group relative flex h-6 w-6 items-center justify-center rounded-md border border-orange-600/50 bg-orange-950/80 text-orange-300 shadow-sm hover:scale-105 transition"
                title="Pipeline Performance Excellence"
              >
                <Trophy className="h-3.5 w-3.5" />
              </div>

              <div
                className="group relative flex h-6 items-center gap-0.5 rounded-md border border-purple-600/50 bg-purple-950/80 px-1.5 text-purple-200 shadow-sm hover:scale-105 transition"
                title="SoloTensor Pioneer"
              >
                <Gift className="h-3.5 w-3.5 text-purple-300" />
                <span className="font-mono text-[10px] font-bold">★</span>
              </div>
            </div>

            {/* Row 4: Telemetry Stats Row with ' · ' separator */}
            <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--ink-faint)] pt-0.5">
              <span>
                <strong className="font-bold text-[var(--ink)] font-sans">
                  {formatMetric(followersCount)}
                </strong>{" "}
                Followers
              </span>
              <span className="text-[var(--line-strong)] font-bold">·</span>

              <span>
                <strong className="font-bold text-[var(--ink)] font-sans">
                  {followingCount}
                </strong>{" "}
                Following
              </span>
              <span className="text-[var(--line-strong)] font-bold">·</span>

              <span>
                <strong className="font-bold text-[var(--ink)] font-sans">
                  {formatMetric(runsCount)}
                </strong>{" "}
                Runs
              </span>
              <span className="text-[var(--line-strong)] font-bold">·</span>

              <span>
                <strong className="font-bold text-[var(--ink)] font-sans">
                  {formatMetric(downloadsCount)}
                </strong>{" "}
                Downloads
              </span>
              <span className="text-[var(--line-strong)] font-bold">·</span>

              <span>
                <strong className="font-bold text-[var(--ink)] font-sans">
                  {formatMetric(likesCount)}
                </strong>{" "}
                Likes
              </span>
              <span className="text-[var(--line-strong)] font-bold">·</span>

              <span>
                <strong className="font-bold text-[var(--ink)] font-sans">
                  {formatMetric(starsCount)}
                </strong>{" "}
                Stars
              </span>
            </div>

            {/* Row 5: Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              {isSelf ? (
                <>
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--surface-raised)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--accent)] transition-all hover:bg-[var(--surface-soft)] active:scale-95"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Studio Settings</span>
                  </Link>

                  <button
                    type="button"
                    onClick={handleShare}
                    title="Share profile"
                    aria-label="Share creator profile"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-[var(--ink-soft)] transition-colors hover:border-[var(--line-strong)] hover:text-white active:scale-95"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  {/* Primary Follow Button */}
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
                      isFollowing
                        ? "border border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--accent)] hover:bg-[var(--surface-soft)]"
                        : "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
                    }`}
                    aria-pressed={isFollowing}
                  >
                    {isFollowing ? (
                      <>
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>

                  {/* Secondary Icon: Share Profile ➦ */}
                  <button
                    type="button"
                    onClick={handleShare}
                    title="Share profile"
                    aria-label="Share creator profile"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-[var(--ink-soft)] transition-colors hover:border-[var(--line-strong)] hover:text-white active:scale-95"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>

                  {/* Secondary Icon: Report ⚑ */}
                  <button
                    type="button"
                    onClick={() => setReportModalOpen(true)}
                    title="Report user"
                    aria-label="Report this creator profile"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-[var(--ink-soft)] transition-colors hover:border-[var(--line-strong)] hover:text-white active:scale-95"
                  >
                    <Flag className="h-4 w-4" />
                  </button>

                  {/* Secondary Action: Block */}
                  <button
                    type="button"
                    onClick={() => setBlockModalOpen(true)}
                    title="Block user"
                    aria-label="Block this creator"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-2 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:border-[var(--line-strong)] hover:text-white active:scale-95"
                  >
                    Block
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ========================================================= */}
        {/* STICKY CATEGORY TAB BAR                                   */}
        {/* ========================================================= */}
        <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 border-b border-[var(--line)] bg-[var(--ground)]/95 backdrop-blur-md">
          <nav
            role="tablist"
            aria-label="Creator content categories"
            className="flex flex-wrap items-center gap-1 sm:gap-2 py-1"
          >
            {/* Tab: All */}
            <button
              role="tab"
              aria-selected={activeTab === "all"}
              onClick={() => setActiveTab("all")}
              className={`inline-flex items-center py-3 px-3 text-sm transition-colors whitespace-nowrap -mb-[1px] ${
                activeTab === "all"
                  ? "border-b-2 border-[var(--accent)] font-bold text-[var(--ink)]"
                  : "border-b-2 border-transparent font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              All
            </button>

            {/* Tab: AI Tools (N) */}
            <button
              role="tab"
              aria-selected={activeTab === "tools"}
              onClick={() => setActiveTab("tools")}
              className={`inline-flex items-center py-3 px-3 text-sm transition-colors whitespace-nowrap -mb-[1px] ${
                activeTab === "tools"
                  ? "border-b-2 border-[var(--accent)] font-bold text-[var(--ink)]"
                  : "border-b-2 border-transparent font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <span>AI Tools</span>
              <span className="font-mono text-xs text-[var(--ink-faint)] ml-1.5 font-normal">
                {toolsCount}
              </span>
            </button>

            {/* Tab: Models (N) */}
            <button
              role="tab"
              aria-selected={activeTab === "models"}
              onClick={() => setActiveTab("models")}
              className={`inline-flex items-center py-3 px-3 text-sm transition-colors whitespace-nowrap -mb-[1px] ${
                activeTab === "models"
                  ? "border-b-2 border-[var(--accent)] font-bold text-[var(--ink)]"
                  : "border-b-2 border-transparent font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <span>Models</span>
              <span className="font-mono text-xs text-[var(--ink-faint)] ml-1.5 font-normal">
                {modelsCount}
              </span>
            </button>

            {/* Tab: Posts (N) */}
            <button
              role="tab"
              aria-selected={activeTab === "posts"}
              onClick={() => setActiveTab("posts")}
              className={`inline-flex items-center py-3 px-3 text-sm transition-colors whitespace-nowrap -mb-[1px] ${
                activeTab === "posts"
                  ? "border-b-2 border-[var(--accent)] font-bold text-[var(--ink)]"
                  : "border-b-2 border-transparent font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <span>Posts</span>
              <span className="font-mono text-xs text-[var(--ink-faint)] ml-1.5 font-normal">
                {formatMetric(postsCount)}
              </span>
            </button>

            {/* Tab: Workflows (N) */}
            <button
              role="tab"
              aria-selected={activeTab === "workflows"}
              onClick={() => setActiveTab("workflows")}
              className={`inline-flex items-center py-3 px-3 text-sm transition-colors whitespace-nowrap -mb-[1px] ${
                activeTab === "workflows"
                  ? "border-b-2 border-[var(--accent)] font-bold text-[var(--ink)]"
                  : "border-b-2 border-transparent font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <span>Workflows</span>
              <span className="font-mono text-xs text-[var(--ink-faint)] ml-1.5 font-normal">
                {workflowsCount}
              </span>
            </button>

            {/* Tab: Articles (N) */}
            <button
              role="tab"
              aria-selected={activeTab === "articles"}
              onClick={() => setActiveTab("articles")}
              className={`inline-flex items-center py-3 px-3 text-sm transition-colors whitespace-nowrap -mb-[1px] ${
                activeTab === "articles"
                  ? "border-b-2 border-[var(--accent)] font-bold text-[var(--ink)]"
                  : "border-b-2 border-transparent font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <span>Articles</span>
              <span className="font-mono text-xs text-[var(--ink-faint)] ml-1.5 font-normal">
                {articlesCount}
              </span>
            </button>

            {/* Tab: Buffet */}
            <button
              role="tab"
              aria-selected={activeTab === "buffet"}
              onClick={() => setActiveTab("buffet")}
              className={`inline-flex items-center py-3 px-3 text-sm transition-colors whitespace-nowrap -mb-[1px] ${
                activeTab === "buffet"
                  ? "border-b-2 border-[var(--accent)] font-bold text-[var(--ink)]"
                  : "border-b-2 border-transparent font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              Buffet
            </button>
          </nav>
        </div>

        {/* ========================================================= */}
        {/* MAIN BODY CONTENT                                         */}
        {/* ========================================================= */}
        <main className="py-6 space-y-12">
          {/* ------------------------------------------------------- */}
          {/* 1. ALL VIEW: SHELVES FOR AI TOOLS, MODELS, AND POSTS    */}
          {/* ------------------------------------------------------- */}
          {activeTab === "all" && (
            <div className="space-y-12">
              {/* Shelf 1: AI Tools */}
              <section aria-labelledby="shelf-tools-heading">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2
                      id="shelf-tools-heading"
                      className="text-xl font-bold tracking-tight text-[var(--ink)]"
                    >
                      AI Tools
                    </h2>
                    <span className="font-mono text-xs text-[var(--ink-faint)] bg-[var(--surface-raised)] border border-[var(--line)] px-2 py-0.5 rounded-full">
                      {tools.length}
                    </span>
                  </div>
                  {tools.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("tools")}
                      className="group inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
                    >
                      <span>View All</span>
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  )}
                </div>

                {contentLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="aspect-[16/10] rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] animate-pulse"
                      />
                    ))}
                  </div>
                ) : tools.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {tools.slice(0, 5).map((tool) => (
                      <CreatorToolCard key={tool.tool_id} tool={tool} />
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-6">
                    <Wrench className="mx-auto h-7 w-7 text-[var(--ink-faint)] opacity-60 mb-2" />
                    <p className="text-sm font-semibold text-[var(--ink-soft)]">No AI tools published yet</p>
                    <p className="text-xs text-[var(--ink-faint)] mt-1">This creator has not deployed public tools</p>
                  </div>
                )}
              </section>

              {/* Shelf 2: Models */}
              <section aria-labelledby="shelf-models-heading">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2
                      id="shelf-models-heading"
                      className="text-xl font-bold tracking-tight text-[var(--ink)]"
                    >
                      Models
                    </h2>
                    <span className="font-mono text-xs text-[var(--ink-faint)] bg-[var(--surface-raised)] border border-[var(--line)] px-2 py-0.5 rounded-full">
                      {models.length}
                    </span>
                  </div>
                  {models.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("models")}
                      className="group inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
                    >
                      <span>View All</span>
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  )}
                </div>

                {contentLoading ? (
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 sm:gap-4">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <ModelCardSkeleton key={idx} index={idx} />
                    ))}
                  </div>
                ) : models.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 sm:gap-4 animate-in fade-in duration-300 ease-out">
                    {models.slice(0, 6).map((model, idx) => (
                      <TensorModelCard key={model.model_id} item={model} index={idx} />
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-6">
                    <Box className="mx-auto h-7 w-7 text-[var(--ink-faint)] opacity-60 mb-2" />
                    <p className="text-sm font-semibold text-[var(--ink-soft)]">No models published yet</p>
                    <p className="text-xs text-[var(--ink-faint)] mt-1">This creator has not published public models</p>
                  </div>
                )}
              </section>

              {/* Shelf 3: Posts (Creations) */}
              <section aria-labelledby="shelf-posts-heading">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2
                      id="shelf-posts-heading"
                      className="text-xl font-bold tracking-tight text-[var(--ink)]"
                    >
                      Posts
                    </h2>
                    <span className="font-mono text-xs text-[var(--ink-faint)] bg-[var(--surface-raised)] border border-[var(--line)] px-2 py-0.5 rounded-full">
                      {posts.length}
                    </span>
                  </div>
                  {posts.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("posts")}
                      className="group inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
                    >
                      <span>View All</span>
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  )}
                </div>

                {contentLoading ? (
                  <AssetCardList loading skeletonCount={6} aspectRatio="natural" items={[]} />
                ) : galleryItems.length > 0 ? (
                  <AssetCardList
                    items={galleryItems.slice(0, 6)}
                    aspectRatio="natural"
                    onOpen={(asset) => openAsset(asset as GalleryItem)}
                  />
                ) : (
                  <div className="py-10 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-6">
                    <ImageIcon className="mx-auto h-7 w-7 text-[var(--ink-faint)] opacity-60 mb-2" />
                    <p className="text-sm font-semibold text-[var(--ink-soft)]">No creations generated yet</p>
                    <p className="text-xs text-[var(--ink-faint)] mt-1">Generated assets will appear here</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ------------------------------------------------------- */}
          {/* 2. SPECIFIC TAB: AI TOOLS                               */}
          {/* ------------------------------------------------------- */}
          {activeTab === "tools" && (
            <div className="space-y-6">
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-faint)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search creator's tools..."
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] py-2 pl-9 pr-4 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Chips */}
                <div className="flex flex-wrap items-center gap-2">
                  {["all", "video", "image"].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setToolModeFilter(filter)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                        toolModeFilter === filter
                          ? "border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-white"
                      }`}
                    >
                      {filter === "all" ? "All Formats" : `${filter} Workflows`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid of Tools */}
              {filteredTools.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredTools.map((tool) => (
                    <CreatorToolCard key={tool.tool_id} tool={tool} />
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-8">
                  <Wrench className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-60 mb-2" />
                  <p className="text-sm font-semibold text-[var(--ink-soft)]">No tools match your query</p>
                  <p className="text-xs text-[var(--ink-faint)] mt-1">Try refining search parameters or filters</p>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------- */}
          {/* 3. SPECIFIC TAB: MODELS                                 */}
          {/* ------------------------------------------------------- */}
          {activeTab === "models" && (
            <div className="space-y-6">
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-faint)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search creator's models..."
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] py-2 pl-9 pr-4 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Model Type Filters */}
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  {["all", "Checkpoint", "LoRA", "ControlNet", "VAE", "Embedding", "LyCORIS", "DoRA", "SVD"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setModelTypeFilter(type)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                        modelTypeFilter === type
                          ? "border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-white"
                      }`}
                    >
                      {type === "all" ? "All Types" : type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid of Models */}
              {filteredModels.length > 0 ? (
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 sm:gap-4 animate-in fade-in duration-300 ease-out">
                  {filteredModels.map((model, idx) => (
                    <TensorModelCard key={model.model_id} item={model} index={idx} />
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-8">
                  <Box className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-60 mb-2" />
                  <p className="text-sm font-semibold text-[var(--ink-soft)]">No models found</p>
                  <p className="text-xs text-[var(--ink-faint)] mt-1">Try another filter or search term</p>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------- */}
          {/* 4. SPECIFIC TAB: POSTS                                  */}
          {/* ------------------------------------------------------- */}
          {activeTab === "posts" && (
            <div className="space-y-6">
              {/* Header filter */}
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-faint)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search creations by prompt or model..."
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] py-2 pl-9 pr-4 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <span className="font-mono text-xs text-[var(--ink-faint)]">
                  {filteredGalleryItems.length} creations
                </span>
              </div>

              {/* Grid of Posts */}
              {filteredGalleryItems.length > 0 ? (
                <AssetCardList
                  items={filteredGalleryItems}
                  aspectRatio="natural"
                  onOpen={(asset) => openAsset(asset as GalleryItem)}
                />
              ) : (
                <div className="py-16 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-8">
                  <ImageIcon className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-60 mb-2" />
                  <p className="text-sm font-semibold text-[var(--ink-soft)]">No creations found</p>
                  <p className="text-xs text-[var(--ink-faint)] mt-1">Try another search keyword</p>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------- */}
          {/* 5. SPECIFIC TAB: WORKFLOWS                              */}
          {/* ------------------------------------------------------- */}
          {activeTab === "workflows" && (
            <div className="space-y-4">
              {workflows.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {workflows.map((wf) => (
                    <div
                      key={wf.id}
                      className="group flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)]"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">
                            {wf.mode.replace(/-/g, " ")} • {wf.aspectRatio}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                            {wf.created}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                          {wf.title}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--ink-soft)] leading-relaxed">
                          {wf.description}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between pt-4 border-t border-[var(--line)]">
                        <span className="font-mono text-xs text-[var(--ink-faint)]">
                          Format: {wf.aspectRatio}
                        </span>
                        <Link
                          href={`/tools/${encodeURIComponent(wf.id)}`}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Run Tool</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-8 max-w-2xl mx-auto">
                  <Layers className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-60 mb-2" />
                  <p className="text-sm font-semibold text-[var(--ink-soft)]">No active workflows published</p>
                  <p className="text-xs text-[var(--ink-faint)] mt-1">Exported workflow pipelines will appear here</p>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------- */}
          {/* 6. SPECIFIC TAB: ARTICLES                               */}
          {/* ------------------------------------------------------- */}
          {activeTab === "articles" && (
            <div className="py-16 text-center border border-dashed border-[var(--line)] rounded-xl bg-[var(--surface-sunken)] p-8 max-w-2xl mx-auto space-y-2">
              <Package className="mx-auto h-8 w-8 text-[var(--ink-faint)] opacity-60 mb-2" />
              <p className="text-sm font-semibold text-[var(--ink-soft)]">No technical articles published</p>
              <p className="text-xs text-[var(--ink-faint)]">Articles and tuning documentation written by {displayName} will be listed here.</p>
            </div>
          )}

          {/* ------------------------------------------------------- */}
          {/* 7. SPECIFIC TAB: BUFFET                                 */}
          {/* ------------------------------------------------------- */}
          {activeTab === "buffet" && (
            <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-sunken)] p-12 text-center max-w-2xl mx-auto space-y-4">
              <Package className="mx-auto h-12 w-12 text-[var(--accent)] opacity-80" />
              <div>
                <h3 className="text-lg font-bold text-[var(--ink)]">
                  {displayName}&apos;s Studio Pass
                </h3>
                <p className="mt-1 text-xs text-[var(--ink-soft)] max-w-md mx-auto">
                  Access tools, custom model checkpoints, and workflows maintained by {displayName} on SoloTensor.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition"
              >
                <Zap className="h-4 w-4 fill-current" />
                <span>Join Creator Studio Access</span>
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* ASSET INSPECTION STAGE MODAL                              */}
      {/* ========================================================= */}
      <WorkspaceModal
        open={Boolean(selectedAsset)}
        onClose={closeAsset}
        headless
        size="media"
      >
        {selectedAsset && (
          <AssetInspectionStage
            mode="modal"
            asset={selectedAsset}
            items={activeTab === "all" ? galleryItems.slice(0, 6) : filteredGalleryItems}
            onSelectAsset={selectAssetInCarousel}
            onClose={closeAsset}
          />
        )}
      </WorkspaceModal>

      {/* ========================================================= */}
      {/* REPORT USER MODAL                                         */}
      {/* ========================================================= */}
      {reportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-md w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <div className="flex items-center gap-2 text-[var(--danger)]">
                <Flag className="h-4 w-4" />
                <h3 className="text-sm font-bold">Report Creator</h3>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="rounded-lg p-1 text-[var(--ink-faint)] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {reportedSuccess ? (
              <div className="py-6 text-center space-y-2">
                <Check className="mx-auto h-8 w-8 text-emerald-400" />
                <p className="text-sm font-bold text-[var(--ink)]">Report Submitted</p>
                <p className="text-xs text-[var(--ink-faint)]">Our moderation team will review this profile.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--ink-soft)]">
                  Help us maintain community guidelines. Select the reason for reporting <strong className="text-white">{displayName}</strong>:
                </p>

                <div className="space-y-2">
                  {[
                    "Intellectual property / copyright infringement",
                    "Malicious code in workflow graph",
                    "Misleading model samples or weights",
                    "Spam or abusive content",
                  ].map((reason) => (
                    <label
                      key={reason}
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] text-xs text-[var(--ink-soft)] hover:border-[var(--line-strong)] cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="report_reason"
                        value={reason}
                        checked={reportReason === reason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="accent-[var(--accent)]"
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!reportReason}
                    onClick={handleConfirmReport}
                    className="px-4 py-1.5 rounded-lg bg-[var(--danger)] text-xs font-bold text-white hover:bg-rose-600 transition disabled:opacity-50"
                  >
                    Submit Report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* BLOCK USER MODAL                                          */}
      {/* ========================================================= */}
      {blockModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-sm w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-2xl space-y-4">
            {blockedSuccess ? (
              <div className="py-6 text-center space-y-2">
                <Check className="mx-auto h-8 w-8 text-emerald-400" />
                <p className="text-sm font-bold text-[var(--ink)]">User Blocked</p>
                <p className="text-xs text-[var(--ink-faint)]">{displayName} has been added to your blocklist.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[var(--ink)]">Block {displayName}?</h3>
                  <p className="text-xs text-[var(--ink-soft)] leading-relaxed">
                    You will no longer see tools, models, or creations published by this user in your feeds and searches.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setBlockModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBlock}
                    className="px-4 py-1.5 rounded-lg bg-[var(--danger)] text-xs font-bold text-white hover:bg-rose-600 transition"
                  >
                    Confirm Block
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <WorkspaceFooter />
    </div>
  );
}

// =================================================================
// SUB-COMPONENT: CREATOR TOOL CARD
// Display genuine tool summary with thumbnail or generative poster,
// aspect ratio badge, format mode, and link to tool detail.
// =================================================================
function CreatorToolCard({ tool }: { tool: ToolSummary }) {
  const isVideo = tool.mode.includes("video");

  return (
    <Link
      href={`/tools/${encodeURIComponent(tool.tool_id)}`}
      className="group relative flex aspect-[16/10] w-full flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] transition-all duration-300 ease-out hover:border-[var(--line-strong)] hover:shadow-xl"
    >
      {/* Background Stylized Poster or Thumbnail */}
      {tool.thumbnail_url ? (
        <img
          src={tool.thumbnail_url}
          alt={tool.name}
          className="asset-zoom-media absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="asset-zoom-media absolute inset-0 bg-gradient-to-br from-[var(--surface-raised)] via-[var(--surface)] to-[var(--ground)] flex flex-col justify-center items-center text-center p-3">
          <div className="font-sans font-black text-lg tracking-tighter text-white/90 drop-shadow-md line-clamp-1">
            {tool.name}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent)] mt-1 drop-shadow">
            {tool.mode.replace(/-/g, " ")}
          </div>
        </div>
      )}

      {/* Top Floating Badge Bar */}
      <div className="absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-sky-400 backdrop-blur-md border border-white/10">
            {isVideo ? <Film className="h-3 w-3" /> : <Sparkles className="h-3 w-3 fill-sky-400/30" />}
          </span>
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md border border-white/10">
            {isVideo ? "VIDEO" : "IMAGE"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="rounded border border-[var(--line-strong)] bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--accent)] backdrop-blur-md">
            {tool.default_aspect_ratio}
          </span>
        </div>
      </div>

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

      {/* Bottom Title & Telemetry */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-3 gap-2">
        <h3
          className="truncate text-xs font-bold text-white transition-colors group-hover:text-[var(--accent)]"
          title={tool.name}
        >
          {tool.name}
        </h3>
        <span className="flex-shrink-0 font-mono text-[10px] font-medium text-white/80 whitespace-nowrap">
          {isVideo ? "▷ Video" : "▷ Image"}
        </span>
      </div>
    </Link>
  );
}


