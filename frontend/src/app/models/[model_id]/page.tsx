"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  Edit3,
  Trash2,
  Sparkles,
  Layers,
  Plus,
  Pencil,
  Eye,
  EyeOff,
  UploadCloud,
  FilePlus,
  ImagePlus,
  Loader2,
} from "lucide-react";
import {
  api,
  type CreatorModel,
  type CreatorModelFile,
  type GalleryItem,
  type ModelPrecision,
  type LocalModelSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Can } from "@/components/rbac";
import ModelGenerationsGrid from "@/components/ModelGenerationsGrid";
import WorkspaceModal from "@/components/WorkspaceModal";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import EditModelDrawer from "@/components/EditModelDrawer";
import UserAvatar from "@/components/UserAvatar";
import { detectPrecisionFromFilename } from "@/lib/models";

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
  const [installedFileIds, setInstalledFileIds] = useState<Set<string>>(new Set());
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [starCount, setStarCount] = useState(6920);
  const [isFollowed, setIsFollowed] = useState(false);
  const [copiedTrigger, setCopiedTrigger] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
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

  // Authentication & RBAC Actions
  const { isAuthenticated, openAuthModal, user, isAdmin, isMod, switchRoleDemo } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);

  const handleCopyPrompt = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleCopyNegative = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedNegative(true);
      setTimeout(() => setCopiedNegative(false), 2000);
    }
  };

  const handleDeleteModel = async () => {
    if (!model) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteCreatorModel(model.model_id);
      router.push("/models");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete model");
      setDeleting(false);
    }
  };

  const handleOpenEdit = () => {
    if (!model) return;
    setShowEditDrawer(true);
  };

  // Phase 4: Version Management State
  const [showAddVersionModal, setShowAddVersionModal] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [showRenameVersionModal, setShowRenameVersionModal] = useState(false);
  const [renameVersionName, setRenameVersionName] = useState("");
  const [renamingVersion, setRenamingVersion] = useState(false);
  const [showDeleteVersionModal, setShowDeleteVersionModal] = useState(false);
  const [deletingVersion, setDeletingVersion] = useState(false);
  const [versionActionError, setVersionActionError] = useState<string | null>(null);

  // Phase 4: File Management State
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [addFileMode, setAddFileMode] = useState<"upload" | "import">("upload");
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedFilePrecision, setSelectedFilePrecision] = useState<ModelPrecision>("FP16");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileActionError, setFileActionError] = useState<string | null>(null);
  const [localModelsList, setLocalModelsList] = useState<LocalModelSummary[]>([]);
  const [loadingLocalModels, setLoadingLocalModels] = useState(false);
  const [selectedLocalModel, setSelectedLocalModel] = useState<LocalModelSummary | null>(null);
  const [importingLocalFile, setImportingLocalFile] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<CreatorModelFile | null>(null);
  const [deletingFile, setDeletingFile] = useState(false);
  const [togglingFileId, setTogglingFileId] = useState<string | null>(null);

  // Phase 4: Sample Media Management State
  const [showAddSampleModal, setShowAddSampleModal] = useState(false);
  const [selectedSampleFile, setSelectedSampleFile] = useState<File | null>(null);
  const [samplePreviewUrl, setSamplePreviewUrl] = useState<string | null>(null);
  const [samplePromptInput, setSamplePromptInput] = useState("");
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleActionError, setSampleActionError] = useState<string | null>(null);
  const [sampleToDelete, setSampleToDelete] = useState<string | null>(null);
  const [deletingSample, setDeletingSample] = useState(false);

  // Phase 4 Handlers
  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !newVersionName.trim()) return;
    setCreatingVersion(true);
    setVersionActionError(null);
    try {
      const createdVer = await api.createModelVersion(model.model_id, newVersionName.trim());
      const updated = await api.getPublicModel(model.model_id);
      setModel(updated);
      setSelectedVersionId(createdVer.version_id);
      setActiveSampleIndex(0);
      setShowAddVersionModal(false);
      setNewVersionName("");
    } catch (err) {
      setVersionActionError(err instanceof Error ? err.message : "Failed to create version");
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleRenameVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !activeVersion || !renameVersionName.trim()) return;
    setRenamingVersion(true);
    setVersionActionError(null);
    try {
      const updated = await api.updateModelVersion(model.model_id, activeVersion.version_id, renameVersionName.trim());
      setModel(updated);
      setShowRenameVersionModal(false);
    } catch (err) {
      setVersionActionError(err instanceof Error ? err.message : "Failed to rename version");
    } finally {
      setRenamingVersion(false);
    }
  };

  const handleDeleteVersion = async () => {
    if (!model || !activeVersion || model.versions.length <= 1) return;
    setDeletingVersion(true);
    setVersionActionError(null);
    try {
      const updated = await api.deleteModelVersion(model.model_id, activeVersion.version_id);
      setModel(updated);
      if (updated.versions.length > 0) {
        setSelectedVersionId(updated.versions[0].version_id);
      }
      setActiveSampleIndex(0);
      setShowDeleteVersionModal(false);
    } catch (err) {
      setVersionActionError(err instanceof Error ? err.message : "Failed to delete version");
    } finally {
      setDeletingVersion(false);
    }
  };

  const handleToggleFileVisibility = async (file: CreatorModelFile) => {
    if (!model || !activeVersion) return;
    setTogglingFileId(file.file_id);
    try {
      const updated = await api.patchModelFile(model.model_id, activeVersion.version_id, file.file_id, {
        visible: !file.visible,
      });
      setModel(updated);
    } catch (err) {
      console.error("Failed to toggle file visibility:", err);
    } finally {
      setTogglingFileId(null);
    }
  };

  const handleDeleteFile = async () => {
    if (!model || !activeVersion || !fileToDelete) return;
    setDeletingFile(true);
    try {
      await api.deleteModelFile(model.model_id, activeVersion.version_id, fileToDelete.file_id);
      const updated = await api.getPublicModel(model.model_id);
      setModel(updated);
      setFileToDelete(null);
    } catch (err) {
      console.error("Failed to delete model file:", err);
    } finally {
      setDeletingFile(false);
    }
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !activeVersion || !selectedUploadFile) return;
    setUploadingFile(true);
    setFileActionError(null);
    try {
      const updated = await api.uploadModelFile(
        model.model_id,
        activeVersion.version_id,
        selectedUploadFile,
        selectedFilePrecision
      );
      setModel(updated);
      setShowAddFileModal(false);
      setSelectedUploadFile(null);
    } catch (err) {
      setFileActionError(err instanceof Error ? err.message : "Failed to upload model file");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFetchLocalModels = async () => {
    setLoadingLocalModels(true);
    try {
      const res = await api.listLocalModels();
      setLocalModelsList(res.items || []);
      if (res.items && res.items.length > 0) {
        setSelectedLocalModel(res.items[0]);
      }
    } catch (err) {
      console.error("Failed to load local models:", err);
    } finally {
      setLoadingLocalModels(false);
    }
  };

  const handleImportLocalFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !activeVersion || !selectedLocalModel) return;
    setImportingLocalFile(true);
    setFileActionError(null);
    try {
      const updated = await api.importLocalModelFile(
        model.model_id,
        activeVersion.version_id,
        selectedLocalModel.category,
        selectedLocalModel.filename,
        selectedFilePrecision
      );
      setModel(updated);
      setShowAddFileModal(false);
      setSelectedLocalModel(null);
    } catch (err) {
      setFileActionError(err instanceof Error ? err.message : "Failed to import model file");
    } finally {
      setImportingLocalFile(false);
    }
  };

  const handleSampleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedSampleFile(file);
      setSamplePreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !activeVersion || !selectedSampleFile) return;
    setUploadingSample(true);
    setSampleActionError(null);
    try {
      const metadata = samplePromptInput.trim() ? { prompt: samplePromptInput.trim() } : {};
      const updated = await api.uploadModelSample(
        model.model_id,
        activeVersion.version_id,
        selectedSampleFile,
        metadata
      );
      setModel(updated);
      setShowAddSampleModal(false);
      setSelectedSampleFile(null);
      setSamplePreviewUrl(null);
      setSamplePromptInput("");
    } catch (err) {
      setSampleActionError(err instanceof Error ? err.message : "Failed to upload sample");
    } finally {
      setUploadingSample(false);
    }
  };

  const handleDeleteSample = async () => {
    if (!model || !activeVersion || !sampleToDelete) return;
    setDeletingSample(true);
    try {
      await api.deleteModelSample(model.model_id, activeVersion.version_id, sampleToDelete);
      const updated = await api.getPublicModel(model.model_id);
      setModel(updated);
      setSampleToDelete(null);
      setActiveSampleIndex(0);
    } catch (err) {
      console.error("Failed to delete sample:", err);
    } finally {
      setDeletingSample(false);
    }
  };

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

  const showcaseScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [naturalRatios, setNaturalRatios] = useState<Record<string, string>>({});

  const checkScrollLimits = useCallback(() => {
    const el = showcaseScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  useEffect(() => {
    const el = showcaseScrollRef.current;
    if (!el) return;

    checkScrollLimits();
    el.addEventListener("scroll", checkScrollLimits, { passive: true });
    window.addEventListener("resize", checkScrollLimits);
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => checkScrollLimits())
        : null;
    if (ro) ro.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScrollLimits);
      window.removeEventListener("resize", checkScrollLimits);
      if (ro) ro.disconnect();
    };
  }, [checkScrollLimits, currentSamples, naturalRatios]);

  const scrollShowcase = (direction: "left" | "right") => {
    if (!showcaseScrollRef.current) return;
    const container = showcaseScrollRef.current;
    const scrollAmount = container.clientWidth * 0.75;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    setTimeout(checkScrollLimits, 400);
  };

  const handlePrev = () => {
    scrollShowcase("left");
  };

  const handleNext = () => {
    scrollShowcase("right");
  };

  const handleSelectSample = (idx: number) => {
    setActiveSampleIndex(idx);
  };

  const handleInspectSample = (
    sample: (typeof currentSamples)[0],
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!model) return;
    const found = sampleItems.find(
      (s) =>
        s.url === sample.url ||
        s.key === sample.filename ||
        s.key === sample.sample_id,
    );
    if (found) {
      setSelectedSample(found);
    } else {
      setSelectedSample({
        key: sample.filename || sample.sample_id,
        url: sample.url,
        size: 0,
        last_modified: "",
        metadata: {
          prompt_id: sample.sample_id,
          created_at: "",
          elapsed_ms: 0,
          prompt:
            typeof sample.metadata?.prompt === "string"
              ? sample.metadata.prompt
              : sample.filename,
          model_id: model.model_id,
          model_title: model.title,
        },
      });
    }
  };

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
      setInstalledFileIds((prev) => new Set([...prev, file.file_id]));
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
      ["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(model.model_type) &&
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
      {/* Moderation Status Alert Banners */}
      {model.moderation_status === "pending_review" && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-300">
              <Clock className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
              <span>
                <strong>Pending Moderator Approval:</strong> This model has been submitted for review. It will become visible in the public gallery and search once approved by a moderator.
              </span>
            </div>
            {(isAdmin || isMod) ? (
              <Link
                href="/admin/moderation"
                className="shrink-0 rounded bg-amber-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
              >
                Review in Darkroom &rarr;
              </Link>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await switchRoleDemo("moderator");
                  router.push("/admin/moderation");
                }}
                className="shrink-0 rounded bg-amber-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                title="Switch to Moderator session and review this submission"
              >
                Switch to Mod & Review &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {model.moderation_status === "rejected" && (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>
                <strong>Moderation Feedback (Action Required):</strong>{" "}
                {model.moderation_notes || "The model requires adjustments before it can be published to the public gallery."}
              </span>
            </div>
            <Can do="model:edit" ownerId={model.user_id}>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="shrink-0 rounded bg-rose-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-rose-200 border border-rose-500/40 hover:bg-rose-500/30 transition-colors"
              >
                Edit & Resubmit
              </button>
            </Can>
          </div>
        </div>
      )}

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
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isStarred
                    ? "border-[var(--warning)] bg-[var(--warning-surface)] text-[var(--warning)]"
                    : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                  }`}
              >
                <Star
                  className={`h-3.5 w-3.5 ${isStarred ? "fill-[var(--warning)] text-[var(--warning)]" : ""
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

              <Can do="model:edit" ownerId={model.user_id}>
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-soft)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                  title="Edit Model"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Model</span>
                </button>
              </Can>

              <Can do="model:delete" ownerId={model.user_id}>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--danger-line)]/50 bg-[var(--danger-surface)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--danger)] transition hover:border-[var(--danger-line)] hover:bg-[var(--danger)]/20"
                  title="Delete Model"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Model</span>
                </button>
              </Can>

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
            <Link
              href={`/user/${encodeURIComponent(model.author_username || model.user_id || "creator")}`}
              className="inline-flex items-center gap-1.5 text-[var(--ink)] hover:text-[var(--accent)] transition-colors"
            >
              <UserAvatar
                src={model.author_avatar_url}
                username={model.author_username || model.user_id}
                name={model.author_display_name || model.author_username || "SoloTensor Creator"}
                size="xs"
                shape="circle"
              />
              <span>{model.author_display_name || model.author_username || "SoloTensor Creator"}</span>
            </Link>
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

          {/* Version Switcher Bar & Management Controls */}
          {model.versions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] mr-1">
                  Version:
                </span>
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
                      className={`rounded-md px-3 py-1 font-mono text-xs transition ${isActive
                          ? "border border-[var(--accent)] bg-[var(--accent)]/10 font-bold text-[var(--accent)] shadow-[0_0_10px_rgba(213,240,111,0.15)]"
                          : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                        }`}
                    >
                      {version.name}
                    </button>
                  );
                })}

                <Can do="model:edit" ownerId={model.user_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setNewVersionName("");
                      setVersionActionError(null);
                      setShowAddVersionModal(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-xs text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
                    title="Add a new release version"
                  >
                    <Plus className="h-3 w-3" />
                    <span>New Version</span>
                  </button>
                </Can>
              </div>

              {activeVersion && (
                <Can do="model:edit" ownerId={model.user_id}>
                  <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.5">
                    <span className="font-mono text-[10px] text-[var(--ink-faint)] px-1">
                      {activeVersion.name} actions:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameVersionName(activeVersion.name);
                        setVersionActionError(null);
                        setShowRenameVersionModal(true);
                      }}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-raised)] transition"
                      title="Rename this version"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      disabled={model.versions.length <= 1}
                      onClick={() => {
                        if (model.versions.length <= 1) return;
                        setVersionActionError(null);
                        setShowDeleteVersionModal(true);
                      }}
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] transition ${model.versions.length <= 1
                          ? "opacity-30 cursor-not-allowed text-[var(--ink-faint)]"
                          : "text-[var(--ink-soft)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        }`}
                      title={model.versions.length <= 1 ? "Cannot delete the only version" : "Delete this version"}
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </Can>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 2. MAIN SHOWCASE & TELEMETRY STAGE (2-COLUMN) */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
          {/* LEFT COLUMN: Media Showcase, Description, Comments, Related */}
          <section className="space-y-6">
            {/* Showcase Header with Add Media button for creators */}
            <div className="flex items-center justify-between pb-1">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]" >
                Showcase
              </span>
              <Can do="model:edit" ownerId={model.user_id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSampleFile(null);
                    setSamplePreviewUrl(null);
                    setSamplePromptInput("");
                    setSampleActionError(null);
                    setShowAddSampleModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 py-1 font-mono text-xs text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5 transition"
                  title="Upload additional showcase preview"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>Add Sample Media</span>
                </button>
              </Can>
            </div>

            {/* Horizontal Multi-Card Portrait Showcase matching reference */}
            <div className="relative group/showcase w-full overflow-hidden rounded-2xl select-none">
              {/* Floating Left Navigation Chevron */}
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 border border-white/20 text-white shadow-xl backdrop-blur-md transition-all duration-200 hover:bg-black/80 hover:scale-105 active:scale-95"
                  title="Previous sample"
                  aria-label="Previous showcase sample"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* Floating Right Navigation Chevron */}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 border border-white/20 text-white shadow-xl backdrop-blur-md transition-all duration-200 hover:bg-black/80 hover:scale-105 active:scale-95"
                  title="Next sample"
                  aria-label="Next showcase sample"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}

              {/* Horizontal Scroll Track */}
              <div
                ref={showcaseScrollRef}
                className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-1"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {currentSamples.map((sample, idx) => {
                  const isSelected = activeSampleIndex === idx;
                  const sampleKey = sample.sample_id || sample.url || `sample-${idx}`;
                  const metaWidth =
                    typeof sample.metadata?.width === "number" || typeof sample.metadata?.width === "string"
                      ? Number(sample.metadata.width)
                      : null;
                  const metaHeight =
                    typeof sample.metadata?.height === "number" || typeof sample.metadata?.height === "string"
                      ? Number(sample.metadata.height)
                      : null;
                  const hasMetaRatio = Boolean(metaWidth && metaHeight && metaWidth > 0 && metaHeight > 0);
                  const cardRatio = hasMetaRatio
                    ? `${metaWidth} / ${metaHeight}`
                    : naturalRatios[sampleKey] || "3 / 4";

                  return (
                    <div
                      key={sampleKey}
                      onClick={() => handleSelectSample(idx)}
                      style={{ aspectRatio: cardRatio }}
                      className={`group relative h-[440px] sm:h-[480px] md:h-[520px] w-auto max-w-[85vw] shrink-0 snap-start cursor-pointer overflow-hidden rounded-xl transition-all duration-300 select-none ${isSelected
                          ? "opacity-100 shadow-2xl scale-[1.005]"
                          : "opacity-85 hover:opacity-100"
                        }`}
                    >
                      {/* Media (Image or Video) */}
                      {sample.kind === "video" ? (
                        <video
                          src={sample.url}
                          onLoadedMetadata={(e) => {
                            const vid = e.currentTarget;
                            if (vid.videoWidth && vid.videoHeight) {
                              const ratioStr = `${vid.videoWidth} / ${vid.videoHeight}`;
                              setNaturalRatios((prev) => {
                                if (prev[sampleKey] === ratioStr) return prev;
                                return { ...prev, [sampleKey]: ratioStr };
                              });
                            }
                          }}
                          className="asset-zoom-media h-full w-full object-cover"
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={sample.url}
                          alt=""
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              const ratioStr = `${img.naturalWidth} / ${img.naturalHeight}`;
                              setNaturalRatios((prev) => {
                                if (prev[sampleKey] === ratioStr) return prev;
                                return { ...prev, [sampleKey]: ratioStr };
                              });
                            }
                          }}
                          className="asset-zoom-media h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}

                      {/* Owner Delete Action */}
                      <Can do="model:edit" ownerId={model.user_id}>
                        {sample.sample_id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSampleToDelete(sample.sample_id);
                            }}
                            className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 backdrop-blur-md transition-all hover:bg-[var(--danger)] hover:text-white hover:scale-105"
                            title="Delete sample from version"
                            aria-label="Delete sample"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </Can>

                      {/* Hover-only Inspect Action */}
                      <button
                        type="button"
                        onClick={(e) => handleInspectSample(sample, e)}
                        className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 backdrop-blur-md transition-all hover:bg-black/90 hover:text-[var(--accent)] hover:scale-105"
                        title="Inspect full image"
                        aria-label="Inspect sample"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}

                {/* Optional + Add Card at the end of track for Owners */}
                <Can do="model:edit" ownerId={model.user_id}>
                  <div
                    onClick={() => {
                      setSelectedSampleFile(null);
                      setSamplePreviewUrl(null);
                      setSamplePromptInput("");
                      setSampleActionError(null);
                      setShowAddSampleModal(true);
                    }}
                    style={{ aspectRatio: "3 / 4" }}
                    className="relative flex h-[440px] sm:h-[480px] md:h-[520px] w-auto shrink-0 snap-start cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)]/40 hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition text-[var(--ink-soft)] hover:text-[var(--accent)]"
                    title="Add new sample media"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--line-strong)] mb-2 group-hover:border-[var(--accent)]">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                    <span className="font-mono text-xs font-bold uppercase tracking-wider">
                      Add Media
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)] mt-1">
                      PNG, JPG, MP4
                    </span>
                  </div>
                </Can>
              </div>
            </div>

            {/* Model Description & Prose */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              {model.description && model.description.trim() ? (
                <div className="space-y-3 text-sm leading-relaxed text-[var(--ink)] whitespace-pre-line">
                  {model.description.split("\n\n").map((para, i) => (
                    <p key={i} className="text-sm leading-relaxed text-[var(--ink)]">
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-[var(--ink-faint)]">
                  No description provided.
                </p>
              )}

              {/* Key Features Dropdown */}
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setExpandedDescription(!expandedDescription)}
                  className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink)] transition hover:text-[var(--accent)]"
                >
                  <span>Key Features & Settings</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${expandedDescription ? "rotate-180" : ""
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
                        {model.generation?.sampler || "Euler a"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Steps Range
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {model.generation?.steps_min || 20} –{" "}
                        {model.generation?.steps_max || 30}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        CFG Scale
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {model.generation?.cfg_min || 3.5} –{" "}
                        {model.generation?.cfg_max || 7.0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Clip Skip
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {model.generation?.clip_skip || 1}
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

            {/* Recommended Prompts & Presets Card */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Recommended Prompts & Presets
                  </h3>
                </div>
                <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent)] font-semibold">
                  Verified Parameters
                </span>
              </div>

              {/* Starter Prompt */}
              {model.generation?.prompt ? (
                <div className="space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                      Starter Prompt
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(model.generation.prompt)}
                      className="inline-flex items-center gap-1.5 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/30 px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/25 transition-colors"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="h-3 w-3 text-[var(--accent)]" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 opacity-70" />
                          <span>Copy Prompt</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-xs text-[var(--ink)] leading-relaxed select-all">
                    {model.generation.prompt}
                  </p>
                </div>
              ) : null}

              {/* Negative Prompt */}
              {model.generation?.negative_prompt ? (
                <div className="space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                      Negative Avoidance Prompt
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyNegative(model.generation.negative_prompt)}
                      className="inline-flex items-center gap-1.5 rounded bg-[var(--surface-raised)] border border-[var(--line-strong)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      {copiedNegative ? (
                        <>
                          <Check className="h-3 w-3 text-[var(--accent)]" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 opacity-70" />
                          <span>Copy Negative</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-xs text-[var(--ink-soft)] leading-relaxed select-all">
                    {model.generation.negative_prompt}
                  </p>
                </div>
              ) : null}

              {/* Trigger Words */}
              <div className="space-y-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                  Trigger Words (Click to Copy)
                </span>
                {model.generation?.trigger_words && model.generation.trigger_words.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {model.generation.trigger_words.map((tw) => (
                      <button
                        key={tw}
                        type="button"
                        onClick={() => handleCopyTrigger(tw)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all hover:scale-[1.02]"
                        title="Click to copy trigger word"
                      >
                        <span>{tw}</span>
                        {copiedTrigger === tw ? (
                          <Check className="h-3 w-3 text-[var(--accent)]" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-60" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-xs text-[var(--ink-faint)]">
                    No trigger words required for this model.
                  </p>
                )}
              </div>

              {/* Sampler, Steps, CFG Ranges Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--line)] font-mono">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Sampler
                  </p>
                  <p className="mt-1 text-xs font-bold text-[var(--ink)] truncate">
                    {model.generation?.sampler || "Euler a"}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Steps Range
                  </p>
                  <p className="mt-1 text-xs font-bold text-[var(--ink)]">
                    {model.generation?.steps_min || 20} – {model.generation?.steps_max || 30}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    CFG Scale
                  </p>
                  <p className="mt-1 text-xs font-bold text-[var(--ink)]">
                    {model.generation?.cfg_min || 3.5} – {model.generation?.cfg_max || 7.0}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Clip Skip
                  </p>
                  <p className="mt-1 text-xs font-bold text-[var(--ink)]">
                    {model.generation?.clip_skip || 1}
                  </p>
                </div>
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
                    className={`rounded px-2.5 py-1 font-mono text-[11px] font-medium transition ${commentTab === "latest"
                        ? "bg-[var(--surface-raised)] text-[var(--ink)] border border-[var(--line)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      }`}
                  >
                    Latest
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentTab("liked")}
                    className={`rounded px-2.5 py-1 font-mono text-[11px] font-medium transition ${commentTab === "liked"
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
                          className={`inline-flex items-center gap-1 transition ${comment.liked
                              ? "text-[var(--danger)]"
                              : "hover:text-[var(--ink)]"
                            }`}
                        >
                          <Heart
                            className={`h-3 w-3 ${comment.liked ? "fill-[var(--danger)]" : ""
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
            {/* Primary Action Button (Run in Studio) */}
            <button
              type="button"
              onClick={() => runInStudio()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--accent-ink)] shadow-[0_0_16px_rgba(213,240,111,0.2)] transition hover:bg-[var(--accent-hover)] active:scale-[0.99]"
            >
              <Play className="h-4 w-4 fill-[var(--accent-ink)]" />
              <span>Run</span>
              <span className="font-mono text-[10px] opacity-80">⚡ 2M</span>
            </button>

            {/* Quick Actions Row */}
            <div className="flex gap-2">
              {primaryFile && (
                (() => {
                  const isDownloadPermitted =
                    model.permissions?.allow_download !== false ||
                    user?.id === model.user_id ||
                    isAdmin ||
                    isMod;

                  if (!isDownloadPermitted) {
                    return (
                      <button
                        type="button"
                        disabled
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] py-2 text-xs font-medium text-[var(--ink-faint)] cursor-not-allowed opacity-60"
                        title="Direct download disabled by model creator"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Restricted</span>
                      </button>
                    );
                  }

                  return (
                    <a
                      href={isAuthenticated ? primaryFile.download_url : "#"}
                      target={isAuthenticated ? "_blank" : undefined}
                      rel="noreferrer"
                      onClick={(e) => {
                        if (!isAuthenticated) {
                          e.preventDefault();
                          openAuthModal("download_weights");
                        }
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] py-2 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </a>
                  );
                })()
              )}
              {primaryFile && activeVersion && isAuthenticated && (isAdmin || isMod) && (
                primaryFile.from_vault || primaryFile.in_vault || installedFileIds.has(primaryFile.file_id) ? (
                  <div
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 py-2 px-3 text-xs font-mono font-bold text-emerald-400"
                    title={primaryFile.from_vault ? "Weights sourced directly from local ComfyUI vault" : "Weights already mounted into ComfyUI vault"}
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{primaryFile.from_vault ? "Vault Source" : "In Vault"}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void install(primaryFile, activeVersion.version_id)
                    }
                    disabled={installing === primaryFile.file_id}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent)]/10 py-2 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:opacity-50"
                    title="Install weight file into ComfyUI vault (Moderator Tool)"
                  >
                    <HardDriveDownload className="h-3.5 w-3.5" />
                    <span>
                      {installing === primaryFile.file_id
                        ? "Installing…"
                        : "Install to ComfyUI"}
                    </span>
                    <span className="rounded bg-[var(--accent)]/20 px-1 py-0.2 font-mono text-[9px] uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)]/30">
                      Mod
                    </span>
                  </button>
                )
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

            {/* CARD 1: Full Compatibility & Conditioning Card */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--ink)] text-xs font-mono uppercase tracking-wider">
                  Compatibility & Conditioning
                </h4>
                <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">
                  {model.model_type}
                </span>
              </div>

              <div className="space-y-2 text-xs border-t border-[var(--line)] pt-2.5">
                {/* Uploaded / Updated Date */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Updated</span>
                  <span className="font-mono text-[var(--ink)]">{updatedDate}</span>
                </div>

                {/* Base Architecture Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Base Architecture</span>
                  <span className="rounded-[4px] border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--accent)]">
                    {model.compatibility?.base_model || "Universal"}
                  </span>
                </div>

                {/* Paired VAE */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Paired VAE</span>
                  {model.compatibility?.vae ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--ink)]">
                      <span className="font-semibold truncate max-w-[140px]" title={model.compatibility.vae}>
                        {model.compatibility.vae}
                      </span>
                      <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1 py-0.2 text-[9px] text-[var(--accent)] font-bold shrink-0">
                        {model.compatibility.vae.endsWith(".sft") ? ".sft" : ".safetensors"}
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-[var(--ink-faint)]">Bundled / None</span>
                  )}
                </div>

                {/* Text Encoder */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">Text Encoder</span>
                  <span className="font-mono text-xs text-[var(--ink)] truncate max-w-[160px]" title={model.compatibility?.text_encoder || "Bundled / Auto"}>
                    {model.compatibility?.text_encoder || "Bundled / Auto"}
                  </span>
                </div>

                {/* CLIP Protocol */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-faint)] font-mono text-[11px]">CLIP Protocol</span>
                  <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                    {model.compatibility?.clip_type || "Auto-detected"}
                  </span>
                </div>

                {/* Tested / Recommended Base Checkpoint (if adapter) */}
                {model.compatibility?.base_model_id ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-faint)] font-mono text-[11px]">Tested On</span>
                    <Link
                      href={`/models/${model.compatibility.base_model_id}`}
                      className="font-mono text-xs font-semibold text-[var(--accent)] hover:underline truncate max-w-[150px]"
                      title={model.compatibility.base_model_id}
                    >
                      {model.compatibility.base_model_id.slice(0, 12)}…
                    </Link>
                  </div>
                ) : ["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(model.model_type) ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-faint)] font-mono text-[11px]">Compatibility</span>
                    <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                      All {model.compatibility?.base_model || "Compatible"} Checkpoints
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Full list of all files in active version (v.files) & Management */}
              {activeVersion && (
                <div className="border-t border-[var(--line)] pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                      Version Files ({activeVersion.files?.length || 0})
                    </span>
                    <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">
                      {activeVersion.name}
                    </span>
                  </div>

                  {activeVersion.files && activeVersion.files.length > 0 ? (
                    <div className="space-y-1.5">
                      {activeVersion.files.map((file) => {
                        const isDownloadPermitted =
                          model.permissions?.allow_download !== false ||
                          user?.id === model.user_id ||
                          isAdmin ||
                          isMod;

                        return (
                          <div
                            key={file.file_id}
                            className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2 text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <p className="font-mono text-xs font-bold text-[var(--ink)] truncate" title={file.filename}>
                                  {file.filename}
                                </p>
                                {!file.visible && (
                                  <span className="rounded bg-[var(--surface-raised)] border border-[var(--line)] px-1 py-0.2 font-mono text-[9px] text-[var(--ink-faint)] uppercase">
                                    Hidden
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--ink-faint)] mt-0.5">
                                <span className="rounded bg-[var(--surface-raised)] border border-[var(--line)] px-1 py-0.2 text-[var(--accent)] font-semibold">
                                  {file.precision}
                                </span>
                                <span>{(file.size / 1024 ** 2).toFixed(1)} MB</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Owner File Management Actions */}
                              <Can do="model:edit" ownerId={model.user_id}>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleFileVisibility(file)}
                                  disabled={togglingFileId === file.file_id}
                                  className={`inline-flex items-center justify-center h-6 w-6 rounded border transition-colors ${file.visible
                                      ? "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
                                      : "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)]/20"
                                    }`}
                                  title={file.visible ? "Visible in catalog (click to hide)" : "Hidden from catalog (click to show)"}
                                >
                                  {file.visible ? (
                                    <Eye className="h-3 w-3" />
                                  ) : (
                                    <EyeOff className="h-3 w-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFileToDelete(file)}
                                  className="inline-flex items-center justify-center h-6 w-6 rounded border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:text-[var(--danger)] hover:border-[var(--danger)]/50 transition-colors"
                                  title="Delete file from version"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </Can>

                              {isDownloadPermitted ? (
                                <a
                                  href={isAuthenticated ? file.download_url : "#"}
                                  target={isAuthenticated ? "_blank" : undefined}
                                  rel="noreferrer"
                                  onClick={(e) => {
                                    if (!isAuthenticated) {
                                      e.preventDefault();
                                      openAuthModal("download_weights");
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                                  title={`Download ${file.filename}`}
                                >
                                  <Download className="h-3 w-3" />
                                  <span>Get</span>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--ink-faint)] cursor-not-allowed opacity-50"
                                  title="Direct download disabled by model creator"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>Get</span>
                                </button>
                              )}
                              {isAuthenticated && (isAdmin || isMod) && (
                                (file.from_vault || file.in_vault || installedFileIds.has(file.file_id)) ? (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-950/30 px-2 py-1 font-mono text-[10px] font-bold text-emerald-400"
                                    title={file.from_vault ? "Imported from local ComfyUI vault" : "Already installed in ComfyUI vault"}
                                  >
                                    <Check className="h-3 w-3" />
                                    <span>{file.from_vault ? "Vault Source" : "In Vault"}</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void install(file, activeVersion.version_id)}
                                    disabled={installing === file.file_id}
                                    className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-1 font-mono text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-40"
                                    title={`Install ${file.filename} into ComfyUI (Moderator Tool)`}
                                  >
                                    <HardDriveDownload className="h-3 w-3" />
                                    <span>{installing === file.file_id ? "Installing…" : "Install to ComfyUI"}</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-[var(--ink-faint)] italic py-1">
                      No weight files linked to this release yet.
                    </p>
                  )}

                  {/* Add File button for owners */}
                  <Can do="model:edit" ownerId={model.user_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUploadFile(null);
                        setSelectedFilePrecision("FP16");
                        setFileActionError(null);
                        setAddFileMode("upload");
                        setShowAddFileModal(true);
                      }}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] py-2 font-mono text-xs text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5 transition"
                    >
                      <FilePlus className="h-3.5 w-3.5" />
                      <span>Add Weight File</span>
                    </button>
                  </Can>
                </div>
              )}
            </div>

            {/* CARD 2: Real Permissions Card */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--ink)] text-xs font-mono uppercase tracking-wider">
                  Project Permissions
                </h4>
                <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">
                  {model.visibility}
                </span>
              </div>

              <div className="space-y-2.5 border-t border-[var(--line)] pt-3">
                {/* Commercial Use */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {model.permissions?.commercial ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-[var(--danger)] shrink-0" />
                    )}
                    <span className="text-[var(--ink-soft)]">Commercial Use</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${model.permissions?.commercial
                        ? "text-[var(--accent)]"
                        : "text-[var(--danger)]"
                      }`}
                  >
                    {model.permissions?.commercial ? "Allowed" : "Not Permitted"}
                  </span>
                </div>

                {/* Weight Resale */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {model.permissions?.sell_model ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-[var(--danger)] shrink-0" />
                    )}
                    <span className="text-[var(--ink-soft)]">Weight Resale</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${model.permissions?.sell_model
                        ? "text-[var(--accent)]"
                        : "text-[var(--danger)]"
                      }`}
                  >
                    {model.permissions?.sell_model ? "Allowed" : "Prohibited"}
                  </span>
                </div>

                {/* Remix / Merges */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {model.permissions?.remix ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-[var(--danger)] shrink-0" />
                    )}
                    <span className="text-[var(--ink-soft)]">Remix / Merges</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${model.permissions?.remix
                        ? "text-[var(--accent)]"
                        : "text-[var(--danger)]"
                      }`}
                  >
                    {model.permissions?.remix ? "Allowed" : "Prohibited"}
                  </span>
                </div>

                {/* Generation Services */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {model.permissions?.generation_services ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-[var(--danger)] shrink-0" />
                    )}
                    <span className="text-[var(--ink-soft)]">Generation Services</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${model.permissions?.generation_services
                        ? "text-[var(--accent)]"
                        : "text-[var(--danger)]"
                      }`}
                  >
                    {model.permissions?.generation_services ? "Permitted" : "Prohibited"}
                  </span>
                </div>

                {/* Direct Download */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {model.permissions?.allow_download !== false ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-[var(--danger)] shrink-0" />
                    )}
                    <span className="text-[var(--ink-soft)]">Direct Download</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${model.permissions?.allow_download !== false
                        ? "text-[var(--accent)]"
                        : "text-[var(--danger)]"
                      }`}
                  >
                    {model.permissions?.allow_download !== false ? "Allowed" : "Disabled"}
                  </span>
                </div>

                {/* Attribution */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {model.permissions?.credit_required ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ink-faint)] shrink-0" />
                    )}
                    <span className="text-[var(--ink-soft)]">Attribution</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${model.permissions?.credit_required
                        ? "text-[var(--warning)]"
                        : "text-[var(--ink-soft)]"
                      }`}
                  >
                    {model.permissions?.credit_required ? "Required" : "Optional"}
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 3: Creator Profile Box */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-xs">
              <Link
                href={`/user/${encodeURIComponent(model.author_username || model.user_id || "creator")}`}
                className="flex items-center gap-2.5 min-w-0 group"
              >
                <UserAvatar
                  src={model.author_avatar_url}
                  username={model.author_username || model.user_id}
                  name={model.author_display_name || model.author_username || "Creator"}
                  size="md"
                  shape="circle"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[var(--ink)] truncate group-hover:text-[var(--accent)] transition-colors">
                      {model.author_display_name || model.author_username || "SoloTensor Creator"}
                    </span>
                    <span className="shrink-0 rounded border border-[var(--warning)]/40 bg-[var(--warning-surface)] px-1 py-0.2 font-mono text-[9px] font-bold text-[var(--warning)]">
                      CREATOR
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-[var(--ink-faint)] truncate">
                    @{model.author_username || (model.user_id ? model.user_id.slice(0, 12) : "creator")}
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setIsFollowed(!isFollowed)}
                className={`rounded-lg px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition ${isFollowed
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

      {/* Delete Model Confirmation Modal */}
      {model && (
        <WorkspaceModal
          open={showDeleteModal}
          onClose={() => {
            if (!deleting) {
              setShowDeleteModal(false);
              setDeleteError(null);
            }
          }}
          destructive
          title="Delete model permanently?"
          description={`"${model.title}" and all associated weights and sample versions will be deleted from disk. This action cannot be undone.`}
          eyebrow="Confirm Deletion"
        >
          <div className="space-y-4">
            {deleteError && (
              <p className="text-xs font-semibold text-[var(--danger)]" role="alert">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-soft)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteModel}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--danger)]/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete Model"}
              </button>
            </div>
          </div>
        </WorkspaceModal>
      )}

      {/* Edit Model Drawer */}
      {model && (
        <EditModelDrawer
          open={showEditDrawer}
          model={model}
          onClose={() => setShowEditDrawer(false)}
          onUpdated={(updated) => setModel(updated)}
        />
      )}

      {/* PHASE 4: MODALS */}
      {/* 1. Add Version Modal */}
      {model && (
        <WorkspaceModal
          open={showAddVersionModal}
          onClose={() => {
            if (!creatingVersion) setShowAddVersionModal(false);
          }}
          title="Create Model Version"
          description={`Add a new release version for "${model.title}".`}
          eyebrow="Release Management"
        >
          <form onSubmit={handleCreateVersion} className="space-y-4">
            {versionActionError && (
              <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                {versionActionError}
              </div>
            )}
            <div>
              <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)] mb-1">
                Version Tag / Name *
              </label>
              <input
                type="text"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder="e.g. v1.1, v2.0, Inpainting-v1"
                className="workspace-field w-full font-mono text-xs"
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddVersionModal(false)}
                disabled={creatingVersion}
                className="workspace-action-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingVersion || !newVersionName.trim()}
                className="workspace-action-primary px-4 py-1.5 text-xs font-bold disabled:opacity-50"
              >
                {creatingVersion ? "Creating…" : "Create Version"}
              </button>
            </div>
          </form>
        </WorkspaceModal>
      )}

      {/* 2. Rename Version Modal */}
      {model && activeVersion && (
        <WorkspaceModal
          open={showRenameVersionModal}
          onClose={() => {
            if (!renamingVersion) setShowRenameVersionModal(false);
          }}
          title="Rename Version"
          description={`Rename version "${activeVersion.name}".`}
          eyebrow="Release Management"
        >
          <form onSubmit={handleRenameVersion} className="space-y-4">
            {versionActionError && (
              <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                {versionActionError}
              </div>
            )}
            <div>
              <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)] mb-1">
                New Version Name *
              </label>
              <input
                type="text"
                value={renameVersionName}
                onChange={(e) => setRenameVersionName(e.target.value)}
                className="workspace-field w-full font-mono text-xs"
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRenameVersionModal(false)}
                disabled={renamingVersion}
                className="workspace-action-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renamingVersion || !renameVersionName.trim()}
                className="workspace-action-primary px-4 py-1.5 text-xs font-bold disabled:opacity-50"
              >
                {renamingVersion ? "Saving…" : "Save Name"}
              </button>
            </div>
          </form>
        </WorkspaceModal>
      )}

      {/* 3. Delete Version Modal */}
      {model && activeVersion && (
        <WorkspaceModal
          open={showDeleteVersionModal}
          onClose={() => {
            if (!deletingVersion) setShowDeleteVersionModal(false);
          }}
          title={`Delete version "${activeVersion.name}"?`}
          description={`Are you sure you want to delete version "${activeVersion.name}"? All associated weight files and samples in this release will be removed.`}
          destructive
          eyebrow="Warning"
        >
          <div className="space-y-4">
            {versionActionError && (
              <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                {versionActionError}
              </div>
            )}
            <p className="text-xs text-[var(--ink-soft)]">
              This action cannot be undone. Models must retain at least one release version.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteVersionModal(false)}
                disabled={deletingVersion}
                className="workspace-action-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteVersion}
                disabled={deletingVersion || model.versions.length <= 1}
                className="rounded-lg bg-[var(--danger)] px-4 py-1.5 text-xs font-bold text-white hover:bg-[var(--danger)]/90 transition disabled:opacity-50"
              >
                {deletingVersion ? "Deleting…" : "Delete Version"}
              </button>
            </div>
          </div>
        </WorkspaceModal>
      )}

      {/* 4. Add Weight File Modal */}
      {model && activeVersion && (
        <WorkspaceModal
          open={showAddFileModal}
          onClose={() => {
            if (!uploadingFile && !importingLocalFile) setShowAddFileModal(false);
          }}
          title="Add Model Weight File"
          description={`Add weights to version "${activeVersion.name}".`}
          eyebrow="Weights Management"
          size="wide"
        >
          <div className="space-y-4">
            {fileActionError && (
              <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                {fileActionError}
              </div>
            )}

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-[var(--line)]">
              <button
                type="button"
                onClick={() => setAddFileMode("upload")}
                className={`flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold transition border-b-2 ${addFileMode === "upload"
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  }`}
              >
                <UploadCloud className="h-4 w-4" />
                <span>Upload From Computer</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddFileMode("import");
                  if (localModelsList.length === 0) {
                    void handleFetchLocalModels();
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold transition border-b-2 ${addFileMode === "import"
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  }`}
              >
                <HardDriveDownload className="h-4 w-4" />
                <span>Import from ComfyUI Vault</span>
              </button>
            </div>

            {addFileMode === "upload" ? (
              <form onSubmit={handleUploadFile} className="space-y-4">
                <div>
                  <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)] mb-1">
                    Select Weights File * (.safetensors, .ckpt, .pt, .bin)
                  </label>
                  <input
                    type="file"
                    accept=".safetensors,.ckpt,.pt,.bin"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setSelectedUploadFile(f);
                      if (f) {
                        setSelectedFilePrecision(detectPrecisionFromFilename(f.name));
                      }
                    }}
                    className="workspace-field w-full text-xs font-mono file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent)]/10 file:text-[var(--accent)] hover:file:bg-[var(--accent)]/20"
                    required
                  />
                  {selectedUploadFile && (
                    <p className="mt-1 font-mono text-[10px] text-[var(--accent)]">
                      Selected: {selectedUploadFile.name} ({(selectedUploadFile.size / 1024 ** 2).toFixed(1)} MB)
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)] mb-1">
                    Floating Point Precision
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["FP8", "FP16", "BF16", "FP32", "Quantized"] as ModelPrecision[]).map((prec) => (
                      <button
                        key={prec}
                        type="button"
                        onClick={() => setSelectedFilePrecision(prec)}
                        className={`rounded-lg border px-2 py-1.5 font-mono text-xs transition ${selectedFilePrecision === prec
                            ? "border-[var(--accent)] bg-[var(--accent)]/15 font-bold text-[var(--accent)]"
                            : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          }`}
                      >
                        {prec}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddFileModal(false)}
                    disabled={uploadingFile}
                    className="workspace-action-secondary px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingFile || !selectedUploadFile}
                    className="workspace-action-primary px-4 py-1.5 text-xs font-bold disabled:opacity-50"
                  >
                    {uploadingFile ? "Uploading Weights…" : "Upload File"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleImportLocalFile} className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)]">
                    Scanned Vault Files ({localModelsList.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleFetchLocalModels()}
                    disabled={loadingLocalModels}
                    className="font-mono text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
                  >
                    {loadingLocalModels && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>Rescan Vault</span>
                  </button>
                </div>

                {loadingLocalModels ? (
                  <div className="flex items-center justify-center p-8 text-xs font-mono text-[var(--ink-soft)] gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                    <span>Scanning ComfyUI model directories…</span>
                  </div>
                ) : localModelsList.length === 0 ? (
                  <p className="font-mono text-xs text-[var(--ink-faint)] italic p-4 text-center border border-dashed border-[var(--line)] rounded-lg">
                    No files found in ComfyUI models directory.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                    {localModelsList.map((item) => {
                      const isChosen =
                        selectedLocalModel?.category === item.category &&
                        selectedLocalModel?.filename === item.filename;
                      return (
                        <div
                          key={`${item.category}/${item.filename}`}
                          onClick={() => {
                            setSelectedLocalModel(item);
                            setSelectedFilePrecision(detectPrecisionFromFilename(item.filename));
                          }}
                          className={`flex items-center justify-between rounded p-2 text-xs font-mono cursor-pointer transition ${isChosen
                              ? "bg-[var(--accent)]/15 border border-[var(--accent)] text-[var(--accent)] font-bold"
                              : "hover:bg-[var(--surface-raised)] text-[var(--ink)] border border-transparent"
                            }`}
                        >
                          <span className="truncate pr-2">{item.filename}</span>
                          <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] text-[var(--ink-faint)]">
                            {item.category}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div>
                  <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)] mb-1">
                    Precision
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["FP8", "FP16", "BF16", "FP32", "Quantized"] as ModelPrecision[]).map((prec) => (
                      <button
                        key={prec}
                        type="button"
                        onClick={() => setSelectedFilePrecision(prec)}
                        className={`rounded-lg border px-2 py-1.5 font-mono text-xs transition ${selectedFilePrecision === prec
                            ? "border-[var(--accent)] bg-[var(--accent)]/15 font-bold text-[var(--accent)]"
                            : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          }`}
                      >
                        {prec}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddFileModal(false)}
                    disabled={importingLocalFile}
                    className="workspace-action-secondary px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importingLocalFile || !selectedLocalModel}
                    className="workspace-action-primary px-4 py-1.5 text-xs font-bold disabled:opacity-50"
                  >
                    {importingLocalFile ? "Importing…" : "Import File"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </WorkspaceModal>
      )}

      {/* 5. Delete File Confirmation Modal */}
      {fileToDelete && activeVersion && (
        <WorkspaceModal
          open={Boolean(fileToDelete)}
          onClose={() => {
            if (!deletingFile) setFileToDelete(null);
          }}
          title={`Delete file "${fileToDelete.filename}"?`}
          description={`Remove this weight file from release version "${activeVersion.name}".`}
          destructive
          eyebrow="Warning"
        >
          <div className="space-y-4">
            <p className="text-xs text-[var(--ink-soft)]">
              This action will remove the file association. It cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={deletingFile}
                className="workspace-action-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFile}
                disabled={deletingFile}
                className="rounded-lg bg-[var(--danger)] px-4 py-1.5 text-xs font-bold text-white hover:bg-[var(--danger)]/90 transition disabled:opacity-50"
              >
                {deletingFile ? "Deleting…" : "Delete File"}
              </button>
            </div>
          </div>
        </WorkspaceModal>
      )}

      {/* 6. Add Showcase Media Modal */}
      {model && activeVersion && (
        <WorkspaceModal
          open={showAddSampleModal}
          onClose={() => {
            if (!uploadingSample) {
              setShowAddSampleModal(false);
              setSelectedSampleFile(null);
              setSamplePreviewUrl(null);
            }
          }}
          title="Add Showcase Sample"
          description={`Upload a preview image or video for version "${activeVersion.name}".`}
          eyebrow="Showcase Management"
        >
          <form onSubmit={handleUploadSample} className="space-y-4">
            {sampleActionError && (
              <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                {sampleActionError}
              </div>
            )}

            <div>
              <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)] mb-1">
                Media File * (PNG, JPG, WEBP, MP4)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                onChange={handleSampleFileChange}
                className="workspace-field w-full text-xs font-mono file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent)]/10 file:text-[var(--accent)] hover:file:bg-[var(--accent)]/20"
                required
              />
            </div>

            {samplePreviewUrl && (
              <div className="relative rounded-lg overflow-hidden border border-[var(--line)] bg-black/40 h-48 flex items-center justify-center">
                {selectedSampleFile?.type?.startsWith("video/") ? (
                  <video src={samplePreviewUrl} controls className="max-h-full max-w-full object-contain" />
                ) : (
                  <img src={samplePreviewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                )}
              </div>
            )}

            <div>
              <label className="block font-mono text-[11px] font-bold uppercase text-[var(--ink-soft)] mb-1">
                Generation Prompt / Caption (Optional)
              </label>
              <textarea
                value={samplePromptInput}
                onChange={(e) => setSamplePromptInput(e.target.value)}
                placeholder="Positive prompt or description used to create this sample…"
                rows={2}
                className="workspace-field w-full text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddSampleModal(false);
                  setSelectedSampleFile(null);
                  setSamplePreviewUrl(null);
                }}
                disabled={uploadingSample}
                className="workspace-action-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadingSample || !selectedSampleFile}
                className="workspace-action-primary px-4 py-1.5 text-xs font-bold disabled:opacity-50"
              >
                {uploadingSample ? "Uploading…" : "Upload Sample"}
              </button>
            </div>
          </form>
        </WorkspaceModal>
      )}

      {/* 7. Delete Showcase Sample Modal */}
      {sampleToDelete && activeVersion && (
        <WorkspaceModal
          open={Boolean(sampleToDelete)}
          onClose={() => {
            if (!deletingSample) setSampleToDelete(null);
          }}
          title="Delete Showcase Sample?"
          description={`Remove this sample from version "${activeVersion.name}".`}
          destructive
          eyebrow="Warning"
        >
          <div className="space-y-4">
            <p className="text-xs text-[var(--ink-soft)]">
              This sample image/video will be permanently deleted from the model gallery.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSampleToDelete(null)}
                disabled={deletingSample}
                className="workspace-action-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSample}
                disabled={deletingSample}
                className="rounded-lg bg-[var(--danger)] px-4 py-1.5 text-xs font-bold text-white hover:bg-[var(--danger)]/90 transition disabled:opacity-50"
              >
                {deletingSample ? "Deleting…" : "Delete Sample"}
              </button>
            </div>
          </div>
        </WorkspaceModal>
      )}
    </main>
  );
}
