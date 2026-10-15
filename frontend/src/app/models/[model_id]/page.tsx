"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  HardDriveDownload,
  Star,
  Share2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Maximize2,
  Flame,
  Heart,
  CornerDownRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
} from "lucide-react";
import { api, type CreatorModel, type CreatorModelFile, type GalleryItem } from "@/lib/api";
import ModelGenerationsGrid from "@/components/ModelGenerationsGrid";
import WorkspaceModal from "@/components/WorkspaceModal";
import AssetInspectionStage from "@/components/AssetInspectionStage";

interface CommentItem {
  id: string;
  author: string;
  initials: string;
  date: string;
  text: string;
  likes: number;
  liked?: boolean;
}

export default function PublicModelDetailPage({
  params,
}: {
  params: Promise<{ model_id: string }>;
}) {
  const router = useRouter();
  const [model, setModel] = useState<CreatorModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [activeSampleIndex, setActiveSampleIndex] = useState(0);

  // Interaction states
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [starCount, setStarCount] = useState(6920);
  const [isFollowed, setIsFollowed] = useState(false);
  const [copiedTrigger, setCopiedTrigger] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [runDropdownOpen, setRunDropdownOpen] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [commentTab, setCommentTab] = useState<"latest" | "liked">("latest");
  const [commentInput, setCommentInput] = useState("");
  const [comments, setComments] = useState<CommentItem[]>([
    {
      id: "c1",
      author: "user_1034544682488576099",
      initials: "U1",
      date: "2 months ago",
      text: "Incredible model! The skin textures and ambient lighting match porcelain doll aesthetics perfectly without losing anatomical realism.",
      likes: 24,
    },
    {
      id: "c2",
      author: "user_998231273019323125",
      initials: "U2",
      date: "2 months ago",
      text: "Works like magic with CFG 4.5 and Euler a sampler. Best Niji-realistic merge I've tested this month.",
      likes: 18,
    },
    {
      id: "c3",
      author: "user_981858362691973493",
      initials: "U3",
      date: "2 months ago",
      text: "Prompt adherence is top notch! Remember to include the trigger words in the beginning of your prompt for best fidelity.",
      likes: 9,
    },
  ]);
  const [selectedSample, setSelectedSample] = useState<GalleryItem | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void params.then(({ model_id }) =>
      api
        .getPublicModel(model_id)
        .then((value) => {
          if (!cancelled) {
            setModel(value);
            if (value.versions.length > 0) {
              setSelectedVersionId(value.versions[0].version_id);
            }
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled)
            setError(
              reason instanceof Error ? reason.message : "Could not load model",
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => load(), [load]);

  const activeVersion =
    model?.versions.find((v) => v.version_id === selectedVersionId) ||
    model?.versions[0];

  const allSamples = model ? model.versions.flatMap((v) => v.samples) : [];
  const currentSamples =
    activeVersion?.samples && activeVersion.samples.length > 0
      ? activeVersion.samples
      : allSamples.length > 0
        ? allSamples
        : [
            {
              sample_id: "placeholder-1",
              filename: "sample-preview.jpg",
              url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop",
              kind: "image" as const,
              metadata: {},
            },
          ];

  const activeSample =
    currentSamples[activeSampleIndex % currentSamples.length] || currentSamples[0];
  const prevSampleIndex =
    (activeSampleIndex - 1 + currentSamples.length) % currentSamples.length;
  const nextSampleIndex =
    (activeSampleIndex + 1) % currentSamples.length;
  const prevSample = currentSamples[prevSampleIndex];
  const nextSample = currentSamples[nextSampleIndex];

  const activeFiles =
    activeVersion?.files.filter((f) => f.visible) || [];
  const primaryFile = activeFiles[0] || activeVersion?.files[0];

  const sampleItems: GalleryItem[] = useMemo(() => {
    if (!model) return [];
    return model.versions.flatMap((version) =>
      version.samples.map((sample) => ({
        key: sample.filename || sample.sample_id,
        url: sample.url,
        size: 0,
        last_modified: version.created_at || "",
        metadata: {
          prompt_id: sample.sample_id,
          created_at: version.created_at || "",
          elapsed_ms: 0,
          prompt:
            typeof sample.metadata?.prompt === "string"
              ? sample.metadata.prompt
              : sample.filename,
          negative_prompt:
            typeof sample.metadata?.negative_prompt === "string"
              ? sample.metadata.negative_prompt
              : undefined,
          seed:
            typeof sample.metadata?.seed === "number"
              ? sample.metadata.seed
              : undefined,
          steps:
            typeof sample.metadata?.steps === "number"
              ? sample.metadata.steps
              : undefined,
          cfg:
            typeof sample.metadata?.cfg === "number"
              ? sample.metadata.cfg
              : undefined,
          width:
            typeof sample.metadata?.width === "number"
              ? sample.metadata.width
              : undefined,
          height:
            typeof sample.metadata?.height === "number"
              ? sample.metadata.height
              : undefined,
          model_id: model.model_id,
          model_title: model.title,
        },
      }))
    );
  }, [model]);

  const install = async (
    file: CreatorModelFile,
    versionId: string,
    useAfterInstall = false,
  ) => {
    if (!model) return;
    setInstalling(file.file_id);
    setInstallMessage(null);
    setInstallError(null);
    try {
      const result = await api.installModelFile(
        model.model_id,
        versionId,
        file.file_id,
      );
      if (useAfterInstall) {
        runInStudio(versionId, file.file_id);
        return;
      }
      setInstallMessage(
        result.already_present
          ? `${file.filename} is already installed in ComfyUI.`
          : `${file.filename} installed in ComfyUI.`,
      );
    } catch (reason) {
      setInstallError(
        reason instanceof Error
          ? reason.message
          : "Could not install model file",
      );
    } finally {
      setInstalling(null);
    }
  };

  const runInStudio = (versionId?: string, fileId?: string) => {
    if (!model) return;
    const vId =
      versionId || activeVersion?.version_id || model.versions[0]?.version_id;
    const fId =
      fileId || primaryFile?.file_id || activeVersion?.files[0]?.file_id;
    const queryParams: Record<string, string> = {
      model_id: model.model_id,
    };
    if (vId) queryParams.version_id = vId;
    if (fId) queryParams.file_id = fId;
    if (
      (model.model_type === "LoRA" || model.model_type === "LyCORIS") &&
      model.compatibility.base_model_id &&
      model.compatibility.base_version_id &&
      model.compatibility.base_file_id
    ) {
      queryParams.base_model_id = model.compatibility.base_model_id;
      queryParams.base_version_id = model.compatibility.base_version_id;
      queryParams.base_file_id = model.compatibility.base_file_id;
    }
    const query = new URLSearchParams(queryParams);
    router.push(`/?${query}`);
  };

  const handleCopyTrigger = (word: string) => {
    navigator.clipboard.writeText(word);
    setCopiedTrigger(word);
    setTimeout(() => setCopiedTrigger(null), 2000);
  };

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const toggleStar = () => {
    if (isStarred) {
      setIsStarred(false);
      setStarCount((c) => c - 1);
    } else {
      setIsStarred(true);
      setStarCount((c) => c + 1);
    }
  };

  const handleAddComment = () => {
    if (!commentInput.trim()) return;
    const newComment: CommentItem = {
      id: `c_${Date.now()}`,
      author: "you (creator)",
      initials: "ME",
      date: "Just now",
      text: commentInput.trim(),
      likes: 1,
      liked: true,
    };
    setComments([newComment, ...comments]);
    setCommentInput("");
  };

  const toggleCommentLike = (id: string) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const liked = !c.liked;
          return {
            ...c,
            liked,
            likes: liked ? c.likes + 1 : c.likes - 1,
          };
        }
        return c;
      }),
    );
  };

  const backLink = (
    <Link
      href="/models"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-faint)] transition-colors duration-150 hover:text-[var(--accent)]"
    >
      <ArrowLeft className="h-4 w-4" /> Back to models
    </Link>
  );

  if (loading) {
    return (
      <main
        id="main-content"
        className="workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)] text-[var(--ink)]"
      >
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <div className="shimmer h-4 w-28 rounded-md" />
          <div className="mt-4 flex items-center justify-between">
            <div className="shimmer h-8 w-72 rounded-md" />
            <div className="shimmer h-9 w-32 rounded-lg" />
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
            <div className="shimmer aspect-[4/5] h-[520px] rounded-xl" />
            <div className="space-y-4">
              <div className="shimmer h-12 rounded-lg" />
              <div className="shimmer h-48 rounded-xl" />
              <div className="shimmer h-64 rounded-xl" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !model) {
    return (
      <main
        id="main-content"
        className="workspace-scroll grid h-full min-h-0 flex-1 place-items-center bg-[var(--ground)] p-8 text-[var(--ink)]"
      >
        <div className="max-w-md text-center">
          <p role="alert" className="text-sm font-medium text-[var(--danger)]">
            {error || "Model not found"}
          </p>
          <div className="mt-5 flex justify-center gap-4">
            {backLink}
            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-surface)]/80"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  const updatedDate = new Date(
    model.updated_at || model.created_at || Date.now(),
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <main
      id="main-content"
      className="workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)] text-[var(--ink-soft)]"
    >
      {/* 1. TOP HEADER & IDENTITY BAR */}
      <header className="z-30 border-b border-[var(--line)] bg-[var(--ground)]/95">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <div className="mb-2 flex items-center justify-between">
            {backLink}
            {shareCopied && (
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] animate-fade-in">
                Link copied to clipboard!
              </span>
            )}
          </div>

          {/* Title & Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink)]">
                {model.title}
              </h1>
              <span className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                {model.model_type}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleStar}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isStarred
                    ? "border-[var(--warning)] bg-[var(--warning-surface)] text-[var(--warning)]"
                    : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                }`}
              >
                <Star
                  className={`h-3.5 w-3.5 ${
                    isStarred ? "fill-[var(--warning)] text-[var(--warning)]" : ""
                  }`}
                />
                <span className="font-mono text-[11px]">
                  {(starCount / 1000).toFixed(1)}K star
                </span>
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-[var(--ink-faint)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                title="Share model link"
              >
                <Share2 className="h-4 w-4" />
              </button>

              <button
                type="button"
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-2 text-[var(--ink-faint)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                title="More options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Metadata Row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] text-[var(--ink-faint)]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--accent)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
              ORIGINAL · SOLOTENSOR MODEL
            </span>
            <span className="text-[var(--line-strong)]">|</span>
            <span className="inline-flex items-center gap-1.5 text-[var(--ink)]">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-soft)] border border-[var(--line)] text-[9px] font-bold text-[var(--accent)]">
                {model.category.slice(0, 1)}
              </span>
              <span>Arleth 🎓</span>
            </span>
            <span className="text-[var(--line-strong)]">|</span>
            <span>UPDATED: {updatedDate}</span>
          </div>

          {/* Tags & Categories Row */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning-surface)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--warning)]">
              EXCLUSIVE
            </span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]">
              {model.category}
            </span>
            {model.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-0.5 font-mono text-[10px] text-[var(--ink-soft)] hover:border-[var(--line-strong)]"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Version Switcher Bar */}
          {model.versions.length > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-[var(--line)] pt-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                Version:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {model.versions.map((version) => {
                  const isActive =
                    (selectedVersionId || model.versions[0].version_id) ===
                    version.version_id;
                  return (
                    <button
                      key={version.version_id}
                      type="button"
                      onClick={() => {
                        setSelectedVersionId(version.version_id);
                        setActiveSampleIndex(0);
                      }}
                      className={`rounded-md px-3 py-1 font-mono text-xs transition ${
                        isActive
                          ? "border border-[var(--accent)] bg-[var(--accent)]/10 font-bold text-[var(--accent)]"
                          : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {version.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2. MAIN SHOWCASE & TELEMETRY STAGE (2-COLUMN) */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
          {/* LEFT COLUMN: Media Showcase, Description, Comments, Related */}
          <section className="space-y-6">
            {/* 3-Slide Peeking Carousel */}
            <div className="relative flex h-[480px] sm:h-[540px] items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] select-none">
              {/* Prev Slide (Peeking Left) */}
              {currentSamples.length > 1 && (
                <div
                  onClick={() => setActiveSampleIndex(prevSampleIndex)}
                  className="absolute left-[-4%] sm:left-[2%] z-10 h-[84%] w-[24%] cursor-pointer overflow-hidden rounded-xl opacity-35 transition-all duration-300 hover:opacity-60"
                >
                  <img
                    src={prevSample.url}
                    alt={prevSample.filename}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50" />
                </div>
              )}

              {/* Prev Button */}
              {currentSamples.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveSampleIndex(prevSampleIndex)}
                  className="absolute left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line-strong)] bg-black/70 text-[var(--ink)] shadow-lg backdrop-blur-md transition hover:bg-black/90 hover:scale-105"
                  title="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* Center Active Slide */}
              <div className="relative z-10 flex h-[94%] w-[68%] sm:w-[58%] items-center justify-center overflow-hidden rounded-xl border border-[var(--line-strong)] shadow-2xl">
                {activeSample.kind === "video" ? (
                  <video
                    src={activeSample.url}
                    controls
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={activeSample.url}
                    alt={activeSample.filename}
                    className="h-full w-full object-cover"
                  />
                )}

                {/* Slide Counter Badge */}
                <div className="absolute bottom-3 left-3 rounded-md border border-[var(--line)] bg-black/70 px-2.5 py-1 font-mono text-[11px] text-[var(--ink)] backdrop-blur-md">
                  {(activeSampleIndex % currentSamples.length) + 1} /{" "}
                  {currentSamples.length}
                </div>

                {/* Inspect Action */}
                <button
                  type="button"
                  onClick={() => {
                    const found = sampleItems.find(
                      (s) =>
                        s.url === activeSample.url ||
                        s.key === activeSample.filename ||
                        s.key === activeSample.sample_id,
                    );
                    if (found) {
                      setSelectedSample(found);
                    } else {
                      setSelectedSample({
                        key: activeSample.filename || activeSample.sample_id,
                        url: activeSample.url,
                        size: 0,
                        last_modified: "",
                        metadata: {
                          prompt_id: activeSample.sample_id,
                          created_at: "",
                          elapsed_ms: 0,
                          prompt:
                            typeof activeSample.metadata?.prompt === "string"
                              ? activeSample.metadata.prompt
                              : activeSample.filename,
                          model_id: model.model_id,
                          model_title: model.title,
                        },
                      });
                    }
                  }}
                  className="absolute bottom-3 right-3 rounded-md border border-[var(--line)] bg-black/70 p-2 text-[var(--ink)] backdrop-blur-md transition hover:bg-black/90 hover:text-[var(--accent)]"
                  title="Inspect sample"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>

              {/* Next Slide (Peeking Right) */}
              {currentSamples.length > 1 && (
                <div
                  onClick={() => setActiveSampleIndex(nextSampleIndex)}
                  className="absolute right-[-4%] sm:right-[2%] z-10 h-[84%] w-[24%] cursor-pointer overflow-hidden rounded-xl opacity-35 transition-all duration-300 hover:opacity-60"
                >
                  <img
                    src={nextSample.url}
                    alt={nextSample.filename}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50" />
                </div>
              )}

              {/* Next Button */}
              {currentSamples.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveSampleIndex(nextSampleIndex)}
                  className="absolute right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line-strong)] bg-black/70 text-[var(--ink)] shadow-lg backdrop-blur-md transition hover:bg-black/90 hover:scale-105"
                  title="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Thumbnail Filmstrip */}
            {currentSamples.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {currentSamples.map((sample, idx) => (
                  <button
                    key={sample.sample_id}
                    type="button"
                    onClick={() => setActiveSampleIndex(idx)}
                    className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-lg transition ${
                      idx === activeSampleIndex % currentSamples.length
                        ? "border-2 border-[var(--accent)] shadow-[0_0_12px_rgba(199,227,106,0.3)]"
                        : "border border-[var(--line)] opacity-60 hover:opacity-100 hover:border-[var(--line-strong)]"
                    }`}
                  >
                    <img
                      src={sample.url}
                      alt={sample.filename}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Model Description & Prose */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              <p className="text-sm leading-relaxed text-[var(--ink)]">
                This {model.model_type} is designed to sit between{" "}
                <span className="font-semibold text-[var(--accent)]">
                  semi-realistic illustration
                </span>{" "}
                and{" "}
                <span className="font-semibold text-[var(--accent)]">soft realism</span>
                , blending a dreamy,{" "}
                <span className="font-semibold text-[var(--accent)]">doll-like</span>{" "}
                aesthetic with grounded facial structure and natural studio lighting.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
                It emphasizes porcelain-smooth skin, delicate facial features, and
                subtle iris depth. The style leans toward an ethereal visual
                rather than hyper-realism — eyes are luminous and expressive, skin
                appears clean and refined, and overall tones remain gentle and airy.
              </p>

              {/* Key Features Dropdown */}
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setExpandedDescription(!expandedDescription)}
                  className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink)] transition hover:text-[var(--accent)]"
                >
                  <span>Key Features & Settings</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      expandedDescription ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {expandedDescription && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 animate-fade-in">
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Sampler
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {model.generation.sampler || "Euler a"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Steps Range
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {model.generation.steps_min || 20} –{" "}
                        {model.generation.steps_max || 30}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        CFG Scale
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {model.generation.cfg_min || 3.5} –{" "}
                        {model.generation.cfg_max || 7.0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Clip Skip
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {model.generation.clip_skip || 1}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Reaction Pill */}
              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1.5 text-xs text-[var(--ink-soft)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                >
                  <Flame className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Buffet</span>
                  <span className="font-mono text-[10px] text-[var(--ink-faint)]">42</span>
                </button>
              </div>
            </div>

            {/* Comments Section */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[var(--ink)] text-sm uppercase tracking-wider">
                  Comments ({comments.length})
                </h3>
                <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setCommentTab("latest")}
                    className={`rounded px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                      commentTab === "latest"
                        ? "bg-[var(--surface-raised)] text-[var(--ink)] border border-[var(--line)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Latest
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentTab("liked")}
                    className={`rounded px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                      commentTab === "liked"
                        ? "bg-[var(--surface-raised)] text-[var(--ink)] border border-[var(--line)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Most Liked
                  </button>
                </div>
              </div>

              {/* Comment Input */}
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] border border-[var(--line)] font-mono text-xs font-bold text-[var(--accent)]">
                  U
                </div>
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 focus-within:border-[var(--accent)]">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    placeholder="Enter your comments here..."
                    className="w-full bg-transparent text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddComment}
                    disabled={!commentInput.trim()}
                    className="rounded bg-[var(--accent)] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
                  >
                    Post
                  </button>
                </div>
              </div>

              {/* Comments Thread */}
              <div className="mt-5 space-y-4">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="flex items-start gap-3 border-t border-[var(--line)] pt-3 text-xs"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] border border-[var(--line)] font-mono text-[10px] font-bold text-[var(--ink-soft)]">
                      {comment.initials}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--ink)]">
                          {comment.author}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                          {comment.date}
                        </span>
                      </div>
                      <p className="mt-1 text-[var(--ink-soft)] leading-relaxed">
                        {comment.text}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-[11px] text-[var(--ink-faint)]">
                        <button
                          type="button"
                          onClick={() => toggleCommentLike(comment.id)}
                          className={`inline-flex items-center gap-1 transition ${
                            comment.liked
                              ? "text-[var(--danger)]"
                              : "hover:text-[var(--ink)]"
                          }`}
                        >
                          <Heart
                            className={`h-3 w-3 ${
                              comment.liked ? "fill-[var(--danger)]" : ""
                            }`}
                          />
                          <span className="font-mono text-[10px]">{comment.likes}</span>
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-[var(--ink)] transition"
                        >
                          <CornerDownRight className="h-3 w-3" />
                          <span>Reply</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Related Creations Showcase Grid */}
            <div className="pt-2">
              <ModelGenerationsGrid
                modelId={model.model_id}
                modelTitle={model.title}
              />
            </div>
          </section>

          {/* RIGHT COLUMN: Sticky Telemetry, Actions & License Rail (350px) */}
          <aside className="space-y-4 self-start lg:sticky lg:top-24">
            {/* Primary Action Button (Split Run Button) */}
            <div className="relative">
              <div className="flex rounded-lg shadow-[0_0_16px_rgba(213,240,111,0.2)]">
                <button
                  type="button"
                  onClick={() => runInStudio()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-l-lg bg-[var(--accent)] px-4 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]"
                >
                  <Play className="h-4 w-4 fill-[var(--accent-ink)]" />
                  <span>Run</span>
                  <span className="font-mono text-[10px] opacity-80">⚡ 2M</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRunDropdownOpen(!runDropdownOpen)}
                  className="flex items-center justify-center rounded-r-lg border-l border-[var(--accent-ink)]/15 bg-[var(--accent)] px-3 text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]"
                  title="Run options"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      runDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Dropdown Menu */}
              {runDropdownOpen && (
                <div className="absolute right-0 top-full z-20 mt-1.5 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1.5 shadow-2xl animate-fade-in text-xs">
                  {primaryFile && activeVersion && (
                    <button
                      type="button"
                      onClick={() => {
                        setRunDropdownOpen(false);
                        void install(primaryFile, activeVersion.version_id, true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--ink)] hover:bg-[var(--surface-soft)] transition"
                    >
                      <HardDriveDownload className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>Install to ComfyUI & Run</span>
                    </button>
                  )}
                  {primaryFile && (
                    <a
                      href={primaryFile.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download file directly</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRunDropdownOpen(false);
                      handleShare();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>Copy share link</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions Row */}
            <div className="flex gap-2">
              {primaryFile && (
                <a
                  href={primaryFile.download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] py-2 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download file</span>
                </a>
              )}
              {primaryFile && activeVersion && (
                <button
                  type="button"
                  onClick={() =>
                    void install(primaryFile, activeVersion.version_id)
                  }
                  disabled={installing === primaryFile.file_id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent)]/10 py-2 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:opacity-50"
                >
                  <HardDriveDownload className="h-3.5 w-3.5" />
                  <span>
                    {installing === primaryFile.file_id
                      ? "Installing…"
                      : "ComfyUI"}
                  </span>
                </button>
              )}
            </div>

            {/* Install status alerts */}
            {installMessage && (
              <p
                aria-live="polite"
                className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 font-mono text-xs text-[var(--accent)]"
              >
                {installMessage}
              </p>
            )}
            {installError && (
              <p
                role="alert"
                className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] px-3 py-2 font-mono text-xs text-[var(--danger)]"
              >
                Install failed: {installError}
              </p>
            )}

            {/* CARD 1: Version Detail */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <h4 className="font-bold text-[var(--ink)] text-xs font-mono uppercase tracking-wider">
                Version Detail
              </h4>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">Uploaded</span>
                  <div className="text-right">
                    <span className="font-mono text-[var(--ink)]">{updatedDate}</span>{" "}
                    <span className="font-mono text-[var(--accent)] text-[11px] font-medium">
                      Trained by SoloTensor
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">Base Model</span>
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    {model.compatibility.base_model || "Illustrious"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)]">Epoch / Steps</span>
                  <span className="font-mono text-[var(--ink)]">
                    {model.generation.steps_max || 8}
                  </span>
                </div>

                {primaryFile && (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-faint)]">Precision & Size</span>
                    <span className="font-mono text-[var(--ink)]">
                      {primaryFile.precision} ·{" "}
                      {(primaryFile.size / 1024 ** 2).toFixed(1)} MB
                    </span>
                  </div>
                )}

                {/* Trigger Words Section */}
                <div className="border-t border-[var(--line)] pt-2.5">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px] uppercase tracking-wider">
                    Trigger Words
                  </span>
                  {model.generation.trigger_words &&
                  model.generation.trigger_words.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {model.generation.trigger_words.map((tw) => (
                        <button
                          key={tw}
                          type="button"
                          onClick={() => handleCopyTrigger(tw)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[11px] text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
                          title="Click to copy trigger word"
                        >
                          <span>{tw}</span>
                          {copiedTrigger === tw ? (
                            <Check className="h-3 w-3 text-[var(--accent)]" />
                          ) : (
                            <Copy className="h-3 w-3 opacity-70" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {["semi-realistic", "realistic facial structure"].map(
                        (tw) => (
                          <button
                            key={tw}
                            type="button"
                            onClick={() => handleCopyTrigger(tw)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[11px] text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
                            title="Click to copy trigger word"
                          >
                            <span>{tw}</span>
                            {copiedTrigger === tw ? (
                              <Check className="h-3 w-3 text-[var(--accent)]" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-70" />
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CARD 2: Project Permissions */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--ink)] text-xs font-mono uppercase tracking-wider">
                  Project Permissions
                </h4>
              </div>
              <p className="mt-1 flex items-center gap-1 font-mono text-[11px] font-medium text-[var(--warning)]">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>REPRINTING IS STRICTLY PROHIBITED</span>
              </p>

              {/* Use Permissions */}
              <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-2.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                  Use Permissions
                </p>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Use in SoloTensor Online</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>As an online training base model on SoloTensor</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Use without crediting me</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <XCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
                  <span>Share merges of this model</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <XCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
                  <span>Use different permissions on merges</span>
                </div>
              </div>

              {/* Commercial Use */}
              <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-2.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                  Commercial Use
                </p>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <XCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
                  <span>Sell generated contents</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <XCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
                  <span>Use on generation services</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-soft)]">
                  <XCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
                  <span>Sell this model or merges</span>
                </div>
              </div>
            </div>

            {/* CARD 3: Creator Profile Box */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-soft)] border border-[var(--line)] font-mono text-xs font-bold text-[var(--accent)] shadow">
                  A
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[var(--ink)]">Arleth</span>
                    <span className="rounded border border-[var(--warning)]/40 bg-[var(--warning-surface)] px-1 py-0.2 font-mono text-[9px] font-bold text-[var(--warning)]">
                      PRO
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-[var(--ink-faint)]">Creator</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFollowed(!isFollowed)}
                className={`rounded-lg px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition ${
                  isFollowed
                    ? "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)]"
                    : "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
                }`}
              >
                {isFollowed ? "Following" : "Follow"}
              </button>
            </div>
          </aside>
        </div>
      </div>

      <WorkspaceModal
        open={Boolean(selectedSample)}
        onClose={() => setSelectedSample(null)}
        headless
        size="media"
      >
        {selectedSample && (
          <AssetInspectionStage
            mode="modal"
            asset={selectedSample}
            items={sampleItems}
            currentIndex={sampleItems.findIndex((a) => a.key === selectedSample.key)}
            onSelectAsset={(asset) => setSelectedSample(asset)}
            onClose={() => setSelectedSample(null)}
          />
        )}
      </WorkspaceModal>
    </main>
  );
}
