"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Box,
  Brush,
  Crown,
  Film,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ExternalLink,
  Filter,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  fileToDataUrl,
  dataUrlToBlob,
  resolveMediaUrl,
  type InstalledGalleryModel,
  type PublicModelSummary,
  type TagInterrogateResult,
  type VideoAudioMode,
  type VideoResizeMode,
  type VideoSubMode,
} from "@/lib/api";
import { resolveModelGalleryUrl } from "@/lib/models";
import { isArchitectureCompatible } from "@/lib/baseModelArchitectures";
import WorkspaceModal from "@/components/WorkspaceModal";
import { useAuth } from "@/lib/auth-context";
import RoleBadge from "@/components/RoleBadge";
import SeedInput from "@/components/SeedInput";
import AspectRatioSelector from "@/components/AspectRatioSelector";
import UpscalePanel, {
  type UpscaleConfig,
  DEFAULT_UPSCALE_CONFIG,
} from "@/components/UpscalePanel";
import DetailerPanel, {
  type DetailerConfig,
  DEFAULT_DETAILER_CONFIG,
} from "@/components/DetailerPanel";
import AdvancedSamplingPanel from "@/components/AdvancedSamplingPanel";
import LoraStackPanel from "@/components/LoraStackPanel";
import GenerationModelCard from "@/components/GenerationModelCard";

export type FormatKey = "1:1" | "16:9" | "9:16" | "4:3" | "3:2" | "custom";
export type TensorMode = "Text2Img" | "Img2Img" | "Edit" | "Video" | "Prime";

/** Selectable video frame rates. Keep in sync with DEFAULT_VIDEO_FIELDS in /generate. */
export const VIDEO_FPS_OPTIONS = [16, 24, 30, 49] as const;
/** Selectable video durations, in seconds. */
export const VIDEO_DURATION_OPTIONS = [3, 5, 10, 15] as const;

export interface ActiveLora {
  id: string;
  title: string;
  baseModel: string;
  weight: number;
  modelId?: string;
  versionId?: string;
  fileId?: string;
  thumbnailUrl?: string | null;
  enabled?: boolean;
  triggerWords?: string[];
  category?: string;
}

export interface ActiveEmbedding {
  id: string;
  title: string;
  baseModel: string;
  weight: number;
  thumbnailUrl?: string;
}

const FORMATS: { value: FormatKey; label: string }[] = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "custom", label: "Custom" },
];

const MODES: {
  id: TensorMode;
  label: string;
  icon?: typeof Sparkles;
  isPrime?: boolean;
}[] = [
  { id: "Text2Img", label: "Text2Img" },
  { id: "Img2Img", label: "Img2Img" },
  { id: "Edit", label: "Edit" },
  { id: "Video", label: "Video" },
  { id: "Prime", label: "Prime", isPrime: true },
];

interface LoraModelCheck {
  baseModelId?: string | null;
  baseModelName?: string | null;
}

function isLoraCompatibleWithModel(
  lora: LoraModelCheck,
  selectedModel: InstalledGalleryModel | null,
  selectedBaseModelName: string,
): boolean {
  if (!selectedModel) return true;

  // 1. Direct Base Model ID match (if specifically nominated)
  if (lora.baseModelId) {
    if (lora.baseModelId === selectedModel.model_id) return true;
    if (
      selectedModel.base_model_id &&
      lora.baseModelId === selectedModel.base_model_id
    )
      return true;
  }

  // 2. Cross-checkpoint Base Model Architecture Family match
  const targetArchs = [
    selectedModel.base_model,
    selectedBaseModelName,
    selectedModel.title,
    selectedModel.filename,
  ].filter(Boolean) as string[];

  const loraArchs = [lora.baseModelName].filter(Boolean) as string[];

  for (const t of targetArchs) {
    for (const l of loraArchs) {
      if (isArchitectureCompatible(t, l)) return true;
    }
  }

  return false;
}

interface Props {
  prompt?: string;
  onPromptChange?: (v: string) => void;
  selectedModel: InstalledGalleryModel | null;
  modelOptions: InstalledGalleryModel[];
  onModelChange: (key: string) => void;
  baseModel: InstalledGalleryModel | null;
  baseModelOptions: InstalledGalleryModel[];
  onBaseModelChange: (key: string) => void;
  loras: ActiveLora[];
  onLorasChange: (loras: ActiveLora[]) => void;
  embeddings: ActiveEmbedding[];
  onEmbeddingsChange: (embeddings: ActiveEmbedding[]) => void;
  seed: string;
  onSeedChange: (v: string) => void;
  steps: string;
  onStepsChange: (v: string) => void;
  cfg: string;
  onCfgChange: (v: string) => void;
  denoise: string;
  onDenoiseChange: (v: string) => void;
  onNegativePromptChange: (v: string) => void;
  customWidth: string;
  onCustomWidthChange: (v: string) => void;
  customHeight: string;
  onCustomHeightChange: (v: string) => void;
  format: FormatKey;
  onFormatChange: (v: FormatKey) => void;
  busy: boolean;
  canGenerate?: boolean;
  onGenerate?: () => void;
  progress?: number;
  progressLabel?: string;
  imageCount?: string;
  onImageCountChange?: (v: string) => void;
  modelsLoading?: boolean;
  modelsError?: string | null;
  onResetDefaults?: () => void;
  isPrivate?: boolean;
  onPrivateChange?: (v: boolean) => void;
  enableDetailer?: boolean;
  onDetailerChange?: (v: boolean) => void;
  upscaleConfig?: UpscaleConfig;
  onUpscaleConfigChange?: (cfg: UpscaleConfig) => void;
  detailerConfig?: DetailerConfig;
  onDetailerConfigChange?: (cfg: DetailerConfig) => void;
  activeMode?: TensorMode;
  onActiveModeChange?: (mode: TensorMode) => void;
  referenceImage?: string | null;
  onReferenceImageChange?: (image: string | null) => void;
  maskImage?: string | null;
  onMaskImageChange?: (mask: string | null) => void;
  maskBlur?: number;
  onMaskBlurChange?: (blur: number) => void;
  inpaintFill?: "original" | "latent_noise" | "latent_zero";
  onInpaintFillChange?: (
    fill: "original" | "latent_noise" | "latent_zero",
  ) => void;
  motionBucketId?: number;
  onMotionBucketIdChange?: (id: number) => void;
  videoFps?: number;
  onVideoFpsChange?: (fps: number) => void;
  videoDurationSeconds?: number;
  onVideoDurationSecondsChange?: (sec: number) => void;
  stage2Upscale?: boolean;
  onStage2UpscaleChange?: (enabled: boolean) => void;
  audioMode?: VideoAudioMode;
  onAudioModeChange?: (mode: VideoAudioMode) => void;
  referenceAudio?: string | null;
  onReferenceAudioChange?: (audio: string | null) => void;
  extractVoice?: boolean;
  onExtractVoiceChange?: (enabled: boolean) => void;
  lastFrameImage?: string | null;
  onLastFrameImageChange?: (image: string | null) => void;
  resizeMode?: VideoResizeMode;
  onResizeModeChange?: (mode: VideoResizeMode) => void;
  videoMegapixels?: number;
  onVideoMegapixelsChange?: (megapixels: number) => void;
  firstFrameStrength?: number;
  onFirstFrameStrengthChange?: (strength: number) => void;
  lastFrameStrength?: number;
  onLastFrameStrengthChange?: (strength: number) => void;
  rifeMultiplier?: number;
  onRifeMultiplierChange?: (multiplier: number) => void;
  highFps?: boolean;
  onHighFpsChange?: (enabled: boolean) => void;
  filmGrain?: boolean;
  onFilmGrainChange?: (enabled: boolean) => void;
  matchColor?: boolean;
  onMatchColorChange?: (enabled: boolean) => void;
  tiledVaeDecode?: boolean;
  onTiledVaeDecodeChange?: (enabled: boolean) => void;
  /** False when the picked checkpoint is not LTX-family (video graph is hardwired to LTX-2.3). */
  videoModelIsLtx?: boolean;
  primePreset?: string;
  onPrimePresetChange?: (preset: string) => void;
  img2imgSubTab?: "image_to_image" | "detailer" | "upscaler";
  onImg2imgSubTabChange?: (tab: "image_to_image" | "detailer" | "upscaler") => void;
  videoSubMode?: VideoSubMode;
  onVideoSubModeChange?: (mode: VideoSubMode) => void;
  samplerName?: string;
  onSamplerNameChange?: (v: string) => void;
  scheduler?: string;
  onSchedulerChange?: (v: string) => void;
}

export default function ControlPanel(props: Props) {
  const {
    prompt,
    onPromptChange,
    selectedModel,
    modelOptions,
    onModelChange,
    loras,
    onLorasChange,
    embeddings,
    onEmbeddingsChange,
    seed,
    onSeedChange,
    steps,
    onStepsChange,
    cfg,
    onCfgChange,
    denoise,
    onDenoiseChange,
    onNegativePromptChange,
    customWidth,
    onCustomWidthChange,
    customHeight,
    onCustomHeightChange,
    format,
    onFormatChange,
    busy,
    canGenerate = false,
    onGenerate,
    progress = 0,
    progressLabel,
    imageCount = "1",
    onImageCountChange,
    modelsLoading,
    modelsError,
    onResetDefaults,
    isPrivate,
    onPrivateChange,
    enableDetailer,
    onDetailerChange,
    upscaleConfig,
    onUpscaleConfigChange,
    detailerConfig,
    onDetailerConfigChange,
    maskImage = props.maskImage,
    onMaskImageChange = props.onMaskImageChange,
    maskBlur = props.maskBlur ?? 8,
    onMaskBlurChange = props.onMaskBlurChange,
    inpaintFill = props.inpaintFill ?? "original",
    onInpaintFillChange = props.onInpaintFillChange,
    motionBucketId = props.motionBucketId ?? 127,
    onMotionBucketIdChange = props.onMotionBucketIdChange,
    videoFps = props.videoFps ?? 25,
    onVideoFpsChange = props.onVideoFpsChange,
    videoDurationSeconds = props.videoDurationSeconds ?? 5,
    onVideoDurationSecondsChange = props.onVideoDurationSecondsChange,
    stage2Upscale = props.stage2Upscale ?? false,
    onStage2UpscaleChange = props.onStage2UpscaleChange,
    audioMode = props.audioMode ?? "silent",
    onAudioModeChange = props.onAudioModeChange,
    referenceAudio = props.referenceAudio ?? null,
    onReferenceAudioChange = props.onReferenceAudioChange,
    extractVoice = props.extractVoice ?? true,
    onExtractVoiceChange = props.onExtractVoiceChange,
    lastFrameImage = props.lastFrameImage ?? null,
    onLastFrameImageChange = props.onLastFrameImageChange,
    resizeMode = props.resizeMode ?? "source",
    onResizeModeChange = props.onResizeModeChange,
    videoMegapixels = props.videoMegapixels ?? 2.1,
    onVideoMegapixelsChange = props.onVideoMegapixelsChange,
    firstFrameStrength = props.firstFrameStrength ?? 1,
    onFirstFrameStrengthChange = props.onFirstFrameStrengthChange,
    lastFrameStrength = props.lastFrameStrength ?? 1,
    onLastFrameStrengthChange = props.onLastFrameStrengthChange,
    rifeMultiplier = props.rifeMultiplier ?? 2,
    onRifeMultiplierChange = props.onRifeMultiplierChange,
    highFps = props.highFps ?? false,
    onHighFpsChange = props.onHighFpsChange,
    filmGrain = props.filmGrain ?? false,
    onFilmGrainChange = props.onFilmGrainChange,
    matchColor = props.matchColor ?? true,
    onMatchColorChange = props.onMatchColorChange,
    tiledVaeDecode = props.tiledVaeDecode ?? false,
    onTiledVaeDecodeChange = props.onTiledVaeDecodeChange,
    videoModelIsLtx = props.videoModelIsLtx ?? true,
    primePreset = props.primePreset ?? "portrait_pro",
    onPrimePresetChange = props.onPrimePresetChange,
    samplerName = props.samplerName ?? "euler",
    onSamplerNameChange = props.onSamplerNameChange,
    scheduler = props.scheduler ?? "normal",
    onSchedulerChange = props.onSchedulerChange,
  } = props;

  const [internalUpscale, setInternalUpscale] = useState<UpscaleConfig>(
    DEFAULT_UPSCALE_CONFIG,
  );
  const activeUpscale = props.upscaleConfig ?? internalUpscale;
  const handleUpscaleChange = props.onUpscaleConfigChange ?? setInternalUpscale;

  const [internalDetailerCfg, setInternalDetailerCfg] =
    useState<DetailerConfig>(DEFAULT_DETAILER_CONFIG);
  const activeDetailerCfg = props.detailerConfig ?? internalDetailerCfg;
  const handleDetailerCfgChange = (cfg: DetailerConfig) => {
    if (props.onDetailerConfigChange) {
      props.onDetailerConfigChange(cfg);
    } else {
      setInternalDetailerCfg(cfg);
    }
    if (props.onDetailerChange) {
      props.onDetailerChange(cfg.enabled);
    }
  };

  const { isPro, isAdmin, switchRoleDemo, isAuthenticated, openAuthModal } =
    useAuth();
  const isProUser = isPro || isAdmin;

  const [internalPrivate, setInternalPrivate] = useState(false);
  const isPrivateActive =
    props.isPrivate !== undefined ? props.isPrivate : internalPrivate;

  const [hardwareModalOpen, setHardwareModalOpen] = useState(false);
  const [privateUpsellOpen, setPrivateUpsellOpen] = useState(false);

  const widthNum = format === "custom" ? Number(customWidth) || 1024 : 1024;
  const heightNum = format === "custom" ? Number(customHeight) || 1024 : 1024;
  const stepsNum = Number(steps) || 25;

  const exceedsHardwareEnvelope =
    !isProUser && (widthNum > 1024 || heightNum > 1024 || stepsNum > 35);

  const handleTogglePrivate = () => {
    if (!isAuthenticated) {
      openAuthModal("generation");
      return;
    }
    if (!isProUser) {
      setPrivateUpsellOpen(true);
      return;
    }
    const next = !isPrivateActive;
    if (props.onPrivateChange) {
      props.onPrivateChange(next);
    } else {
      setInternalPrivate(next);
    }
  };

  const handleGenerateClick = () => {
    if (!isAuthenticated) {
      openAuthModal("generation");
      return;
    }
    if (exceedsHardwareEnvelope) {
      setHardwareModalOpen(true);
      return;
    }
    onGenerate?.();
  };

  const [localActiveMode, setLocalActiveMode] =
    useState<TensorMode>("Text2Img");
  const activeMode = props.activeMode ?? localActiveMode;
  const handleModeClick = (modeId: TensorMode) => {
    setLocalActiveMode(modeId);
    props.onActiveModeChange?.(modeId);
  };
  const [internalImg2imgSubTab, setInternalImg2imgSubTab] = useState<
    "image_to_image" | "detailer" | "upscaler"
  >("image_to_image");
  const img2imgSubTab = props.img2imgSubTab ?? internalImg2imgSubTab;
  const setImg2imgSubTab = (tab: "image_to_image" | "detailer" | "upscaler") => {
    setInternalImg2imgSubTab(tab);
    props.onImg2imgSubTabChange?.(tab);
  };
  const [internalVideoSubMode, setInternalVideoSubMode] =
    useState<VideoSubMode>("text-to-video");
  const videoSubMode = props.videoSubMode ?? internalVideoSubMode;
  const setVideoSubMode = (mode: VideoSubMode) => {
    setInternalVideoSubMode(mode);
    props.onVideoSubModeChange?.(mode);
  };
  const [naturalDimensions, setNaturalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const img2imgFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.referenceImage) {
      setNaturalDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setNaturalDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = props.referenceImage;
  }, [props.referenceImage]);

  const handleMatchDimensions = () => {
    if (!naturalDimensions) return;
    const aspect = naturalDimensions.width / naturalDimensions.height;
    let targetW: number;
    let targetH: number;
    const maxDim = 1344;
    const minDim = 512;
    if (aspect >= 1) {
      targetW = Math.min(maxDim, Math.max(minDim, naturalDimensions.width));
      targetH = Math.round(targetW / aspect);
    } else {
      targetH = Math.min(maxDim, Math.max(minDim, naturalDimensions.height));
      targetW = Math.round(targetH * aspect);
    }
    const snappedW = Math.max(64, Math.min(2048, Math.round(targetW / 8) * 8));
    const snappedH = Math.max(64, Math.min(2048, Math.round(targetH / 8) * 8));
    onFormatChange("custom");
    onCustomWidthChange(String(snappedW));
    onCustomHeightChange(String(snappedH));
  };

  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null);

  const handleImg2ImgFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setSourceImageFile(file);
    try {
      const dataUrl = await fileToDataUrl(file);
      props.onReferenceImageChange?.(dataUrl);
    } catch (err) {
      console.error("Failed to read image file:", err);
    }
  };

  const handleImg2ImgDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void handleImg2ImgFileUpload(files[0]);
    }
  };

  // Video: reference-audio and last-frame dropzones
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const lastFrameFileInputRef = useRef<HTMLInputElement>(null);
  const [isAudioDragOver, setIsAudioDragOver] = useState(false);
  const [isLastFrameDragOver, setIsLastFrameDragOver] = useState(false);
  const [stage2QualityOpen, setStage2QualityOpen] = useState(false);

  const isAudioFile = (file: File) =>
    file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name);

  const handleAudioFileUpload = async (file: File) => {
    if (!isAudioFile(file)) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      props.onReferenceAudioChange?.(dataUrl);
    } catch (err) {
      console.error("Failed to read audio file:", err);
    }
  };

  const handleLastFrameFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      props.onLastFrameImageChange?.(dataUrl);
    } catch (err) {
      console.error("Failed to read last-frame image:", err);
    }
  };

  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [loraPickerOpen, setLoraPickerOpen] = useState(false);
  const [embeddingPickerOpen, setEmbeddingPickerOpen] = useState(false);
  const [imageCountOpen, setImageCountOpen] = useState(false);

  // Model Picker Filter States
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [modelCategoryFilter, setModelCategoryFilter] = useState<string>("all");

  // LoRA Picker Filter States (Tensor.art style)
  const [loraSearchQuery, setLoraSearchQuery] = useState("");
  const [loraCategoryFilter, setLoraCategoryFilter] = useState<string>("all");
  const [onlyCompatibleLora, setOnlyCompatibleLora] = useState<boolean>(true);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Image Interrogation & Metadata Extraction State
  const [interrogating, setInterrogating] = useState(false);
  const [interrogateToast, setInterrogateToast] = useState<string | null>(null);

  const applyInterrogateResult = (res: TagInterrogateResult) => {
    if (res.has_metadata && res.metadata) {
      const m = res.metadata;
      if (m.prompt && onPromptChange) {
        onPromptChange(m.prompt);
      }
      if (m.negative_prompt && onNegativePromptChange) {
        onNegativePromptChange(m.negative_prompt);
      }
      if (m.seed !== undefined && m.seed !== null) {
        onSeedChange(String(m.seed));
      }
      if (m.steps) {
        onStepsChange(String(m.steps));
      }
      if (m.cfg) {
        onCfgChange(String(m.cfg));
      }
      if (m.width && m.height) {
        const safeW = Math.max(64, Math.min(4096, Math.round(m.width / 8) * 8));
        const safeH = Math.max(
          64,
          Math.min(4096, Math.round(m.height / 8) * 8),
        );
        onFormatChange("custom");
        onCustomWidthChange(String(safeW));
        onCustomHeightChange(String(safeH));
      }
      if (m.model_name && onModelChange && modelOptions.length > 0) {
        const target = m.model_name.toLowerCase();
        const matched = modelOptions.find((opt) => {
          const title = (opt.title || "").toLowerCase();
          const fname = (opt.filename || "").toLowerCase();
          return (
            (title && target.includes(title)) ||
            (fname && target.includes(fname))
          );
        });
        if (matched) {
          onModelChange(matched.model_id);
        }
      }
      const label = m.source
        ? `⚡Loaded ${m.source.toUpperCase()} metadata!`
        : "⚡ Auto-prompt & settings loaded!";
      setInterrogateToast(label);
      setTimeout(() => setInterrogateToast(null), 3500);
    } else if (res.tags && res.tags.length > 0) {
      const tagString = res.tags.join(", ");
      if (onPromptChange) {
        const current = prompt?.trim() || "";
        onPromptChange(current ? `${current}, ${tagString}` : tagString);
      }
      setInterrogateToast(`+${res.tags.length} WD14 tags!`);
      setTimeout(() => setInterrogateToast(null), 3000);
    } else {
      setInterrogateToast("No metadata or tags detected");
      setTimeout(() => setInterrogateToast(null), 2500);
    }
  };

  const executeInterrogation = async (
    fileOrBlob: File | Blob,
    filename = "image.png",
  ) => {
    setInterrogating(true);
    setInterrogateToast(null);
    try {
      const res = await api.interrogateImage(fileOrBlob, filename);
      applyInterrogateResult(res);
    } catch (err) {
      setInterrogateToast(
        err instanceof Error ? err.message : "Auto-tagging failed",
      );
      setTimeout(() => setInterrogateToast(null), 3500);
    } finally {
      setInterrogating(false);
    }
  };

  const handleAutoPromptFromReference = async () => {
    if (sourceImageFile) {
      await executeInterrogation(sourceImageFile, sourceImageFile.name);
    } else if (props.referenceImage) {
      const blob = dataUrlToBlob(props.referenceImage);
      await executeInterrogation(blob, "reference_image.png");
    }
  };
  const isValidDimension = (value: string) => {
    const dimension = Number(value);
    return (
      Number.isInteger(dimension) &&
      dimension >= 64 &&
      dimension <= 4096 &&
      dimension % 8 === 0
    );
  };
  const customWidthInvalid = !isValidDimension(customWidth);
  const customHeightInvalid = !isValidDimension(customHeight);

  // Load public models from backend for gallery metadata (covers, tags)
  const [publicModels, setPublicModels] = useState<PublicModelSummary[]>([]);

  useEffect(() => {
    let active = true;
    api
      .listPublicModels()
      .then((res) => {
        if (active) setPublicModels(res.items || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const publicModelMap = useMemo(() => {
    const map = new Map<string, PublicModelSummary>();
    for (const m of publicModels) {
      map.set(m.model_id, m);
    }
    return map;
  }, [publicModels]);

  // Available base models (Checkpoint or SVD) from backend
  const baseModels = useMemo(
    () =>
      modelOptions.filter(
        (m) => m.model_type === "Checkpoint" || m.model_type === "SVD",
      ),
    [modelOptions],
  );

  // Available adapter models from backend
  const galleryLoras = useMemo(
    () =>
      modelOptions.filter((m) =>
        ["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(
          m.model_type,
        ),
      ),
    [modelOptions],
  );

  // Derive active base model name tag from backend model metadata
  const baseModelTag = useMemo(() => {
    if (!selectedModel) return "";
    const pub = publicModelMap.get(selectedModel.model_id);
    if (pub?.base_model) {
      const lower = pub.base_model.toLowerCase();
      if (lower.includes("sdxl")) return "SDXL";
      if (lower.includes("flux")) return "FLUX.1";
      if (lower.includes("z-image") || lower.includes("turbo"))
        return "Z-Image";
      if (lower.includes("sd 1.5") || lower.includes("sd1.5")) return "SD 1.5";
      return pub.base_model;
    }
    const titleLower = selectedModel.title.toLowerCase();
    if (titleLower.includes("krea")) return "Krea-2";
    if (titleLower.includes("sdxl")) return "SDXL";
    if (titleLower.includes("flux")) return "FLUX.1";
    if (titleLower.includes("turbo") || titleLower.includes("z image"))
      return "Z-Image";
    if (titleLower.includes("sd 1.5") || titleLower.includes("sd1.5"))
      return "SD 1.5";
    return selectedModel.title.split(" ")[0] || "Custom";
  }, [selectedModel, publicModelMap]);

  // Cover image for currently selected model from backend
  const currentModelCover = useMemo(() => {
    if (!selectedModel) return null;
    const cover =
      selectedModel.cover_url ||
      publicModelMap.get(selectedModel.model_id)?.cover_url ||
      publicModels.find(
        (p) =>
          p.model_id === selectedModel.model_id ||
          p.title.toLowerCase() === selectedModel.title.toLowerCase(),
      )?.cover_url ||
      null;
    return resolveMediaUrl(cover);
  }, [selectedModel, publicModelMap, publicModels]);

  // Adjust LoRA weight (clamped between 0.0 and 1.0)
  const updateLoraWeight = (id: string, nextWeight: number) => {
    const clamped =
      Math.round(Math.max(0.0, Math.min(1.0, nextWeight)) * 100) / 100;
    onLorasChange(
      loras.map((l) => (l.id === id ? { ...l, weight: clamped } : l)),
    );
  };

  // Toggle LoRA enabled/disabled state (Mute / Unmute matching Tensor.art)
  const toggleLora = (id: string) => {
    onLorasChange(
      loras.map((l) =>
        l.id === id ? { ...l, enabled: l.enabled === false ? true : false } : l,
      ),
    );
  };

  const removeLora = (id: string) => {
    onLorasChange(loras.filter((l) => l.id !== id));
  };

  // Insert trigger word into prompt (Tensor.art hallmark feature)
  const insertTriggerWord = (word: string) => {
    if (!onPromptChange) return;
    const current = prompt ?? "";
    if (!current.trim()) {
      onPromptChange(word);
      return;
    }
    const regex = new RegExp(
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    if (regex.test(current)) return;
    onPromptChange(`${current.trim()}, ${word}`);
  };

  const insertAllTriggerWords = (words: string[]) => {
    if (!onPromptChange || !words.length) return;
    const current = prompt ?? "";
    const toAdd: string[] = [];
    for (const w of words) {
      const regex = new RegExp(
        `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      );
      if (!regex.test(current)) {
        toAdd.push(w);
      }
    }
    if (!toAdd.length) return;
    if (!current.trim()) {
      onPromptChange(toAdd.join(", "));
    } else {
      onPromptChange(`${current.trim()}, ${toAdd.join(", ")}`);
    }
  };

  // Adjust Embedding weight
  const updateEmbeddingWeight = (id: string, nextWeight: number) => {
    const clamped =
      Math.round(Math.min(2.0, Math.max(0.0, nextWeight)) * 10) / 10;
    onEmbeddingsChange(
      embeddings.map((e) => (e.id === id ? { ...e, weight: clamped } : e)),
    );
  };

  const removeEmbedding = (id: string) => {
    onEmbeddingsChange(embeddings.filter((e) => e.id !== id));
  };

  // Selected Basic Model's true Base Model name (from public catalog or model title)
  const selectedBaseModelName = useMemo(() => {
    if (!selectedModel) return "";
    const pub = publicModelMap.get(selectedModel.model_id);
    return pub?.base_model || selectedModel.title;
  }, [selectedModel, publicModelMap]);

  // Available LoRAs exclusively from backend gallery
  const availableLoraItems = useMemo(() => {
    return galleryLoras.map((g) => {
      const pub = publicModelMap.get(g.model_id);

      // Determine the Base Architecture of this LoRA
      let loraBaseModelName = g.base_model || pub?.base_model || "";
      if (!loraBaseModelName && g.base_model_id) {
        const parent = modelOptions.find((m) => m.model_id === g.base_model_id);
        if (parent) {
          loraBaseModelName = parent.base_model || parent.title;
        }
      }
      if (!loraBaseModelName) {
        loraBaseModelName =
          selectedModel?.base_model || selectedModel?.title || "Universal";
      }

      return {
        id: `${g.model_id}:${g.file_id}`,
        title: g.title,
        baseModel: loraBaseModelName,
        baseModelId: g.base_model_id,
        filename: g.filename,
        triggerWords: pub?.tags || [],
        category: (pub?.category as string) || "LoRA",
        thumbnailUrl:
          resolveMediaUrl(g.cover_url || pub?.cover_url) ?? undefined,
        modelId: g.model_id,
        versionId: g.version_id,
        fileId: g.file_id,
        defaultWeight: 0.8,
      };
    });
  }, [galleryLoras, publicModelMap, modelOptions, selectedModel]);

  // Filtered LoRAs in picker modal checking Base Model compatibility
  const filteredModalLoras = useMemo(() => {
    return availableLoraItems.filter((item) => {
      // Compatibility filter against selected Base Model
      if (
        onlyCompatibleLora &&
        selectedModel &&
        !isLoraCompatibleWithModel(
          { baseModelId: item.baseModelId, baseModelName: item.baseModel },
          selectedModel,
          selectedBaseModelName,
        )
      ) {
        return false;
      }
      // Category filter
      if (
        loraCategoryFilter !== "all" &&
        item.category.toLowerCase() !== loraCategoryFilter.toLowerCase()
      ) {
        return false;
      }
      // Search query
      if (loraSearchQuery.trim()) {
        const q = loraSearchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesFilename = item.filename.toLowerCase().includes(q);
        const matchesBaseModel = item.baseModel.toLowerCase().includes(q);
        const matchesTrigger = item.triggerWords.some((tw) =>
          tw.toLowerCase().includes(q),
        );
        if (
          !matchesTitle &&
          !matchesFilename &&
          !matchesBaseModel &&
          !matchesTrigger
        )
          return false;
      }
      return true;
    });
  }, [
    availableLoraItems,
    onlyCompatibleLora,
    selectedModel,
    selectedBaseModelName,
    loraCategoryFilter,
    loraSearchQuery,
  ]);

  // Add LoRA from modal
  const handleAddLoraItem = (item: (typeof availableLoraItems)[0]) => {
    if (loras.length >= 5) return;
    const exists = loras.some(
      (l) =>
        l.id === item.id ||
        (item.modelId &&
          l.modelId === item.modelId &&
          l.fileId === item.fileId),
    );
    if (!exists) {
      onLorasChange([
        ...loras,
        {
          id: item.id,
          title: item.title,
          baseModel: item.baseModel || selectedBaseModelName || "Base Model",
          weight: item.defaultWeight ?? 0.8,
          enabled: true,
          triggerWords: item.triggerWords,
          category: item.category,
          thumbnailUrl: item.thumbnailUrl,
          modelId: item.modelId,
          versionId: item.versionId,
          fileId: item.fileId,
        },
      ]);
    }
    setLoraPickerOpen(false);
  };

  return (
    <aside className="workspace-core relative flex flex-col h-full min-h-0 w-full shrink-0 overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[0_24px_80px_rgba(19,28,17,.16)] lg:h-full lg:w-[24.5rem]">
      {/* Top Mode Tabs: Text2Img, Img2Img, Edit, Video, Prime */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 pt-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1">
          {MODES.map((mode) => {
            const active = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleModeClick(mode.id)}
                className={`relative flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-xs font-semibold transition ${
                  mode.isPrime
                    ? "text-[var(--accent)] hover:text-[var(--accent-hover)] focus-visible:text-[var(--accent-hover)]"
                    : active
                      ? "text-[var(--accent)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                }`}
              >
                {mode.isPrime && (
                  <Sparkles className="h-3 w-3 fill-current text-[var(--accent)]" />
                )}
                <span>{mode.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-xl bg-[var(--accent)] "
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shared source-image file input: used by the Img2Img, Edit and Video dropzones below */}
      <input
        ref={img2imgFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImg2ImgFileUpload(file);
          e.target.value = "";
        }}
      />
      {/* Video-only inputs: reference audio for voice clone, optional last frame */}
      <input
        ref={audioFileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleAudioFileUpload(file);
          e.target.value = "";
        }}
      />
      <input
        ref={lastFrameFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleLastFrameFileUpload(file);
          e.target.value = "";
        }}
      />

      {activeMode === "Img2Img" ? (
        <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* 1. Source Image Input & Preview Card (Pinned on Top across all sub-tabs) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                  SOURCE IMAGE
                </span>
                {props.referenceImage ? (
                  <span className="rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]">
                    LOADED
                  </span>
                ) : (
                  <span className="rounded-xl bg-[var(--accent)]/10 px-2 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)] border border-[var(--accent)]/20">
                    REQUIRED
                  </span>
                )}
              </div>
              {props.referenceImage && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceImageFile(null);
                    props.onReferenceImageChange?.(null);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--danger)] hover:underline transition"
                  title="Remove source image"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {!props.referenceImage ? (
              <div
                onClick={() => img2imgFileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleImg2ImgDrop}
                className={`group relative flex h-48 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-all duration-200 cursor-pointer ${
                  isDragOver
                    ? "border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]"
                    : "border-[var(--line-strong)] hover:border-[var(--accent)]/50 bg-[color-mix(in_srgb,var(--surface-raised)_60%,transparent)] hover:bg-[var(--surface-raised)]"
                }`}
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-soft)] text-[var(--accent)] mb-2.5 transition-transform duration-200 group-hover:scale-110">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-[var(--ink)]">
                  Drop image here or{" "}
                  <span className="text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2">
                    browse
                  </span>
                </p>
                <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)] uppercase tracking-wider">
                  PNG, JPG, WEBP · UP TO 25MB
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 space-y-2.5">
                <div className="relative rounded-lg overflow-hidden border border-[var(--line)] bg-[var(--surface-sunken)] flex h-48 w-full items-center justify-center group">
                  <img
                    src={props.referenceImage}
                    alt="Img2Img Source"
                    className="h-full w-full object-contain rounded-lg"
                  />
                  {naturalDimensions && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-[var(--overlay)] backdrop-blur-md px-2 py-0.5 font-mono text-[10px] text-[var(--ink)] border border-[var(--line)]">
                      {naturalDimensions.width} × {naturalDimensions.height}{" "}
                      PX
                    </span>
                  )}
                  {naturalDimensions &&
                    Number(customWidth) ===
                      Math.max(
                        64,
                        Math.min(
                          2048,
                          Math.round(naturalDimensions.width / 8) * 8,
                        ),
                      ) &&
                    Number(customHeight) ===
                      Math.max(
                        64,
                        Math.min(
                          2048,
                          Math.round(naturalDimensions.height / 8) * 8,
                        ),
                      ) && (
                      <span className="absolute bottom-2 right-2 rounded-md bg-[var(--accent)]/90 backdrop-blur-md px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--accent-ink)] uppercase">
                        CANVAS MATCHED
                      </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAutoPromptFromReference}
                    disabled={interrogating || busy}
                    title="Extract generation prompt, seed, cfg, steps & size from reference image metadata, or auto-tag with WD14"
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[var(--accent)]/60 text-[11px] font-bold text-[var(--accent)] transition disabled:opacity-50"
                  >
                    {interrogating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Tag className="h-3 w-3" />
                    )}
                    <span>
                      {interrogating ? "Reading…" : "Auto-Prompt"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleMatchDimensions}
                    disabled={!naturalDimensions}
                    title="Adjust canvas width & height to match this image natural aspect ratio"
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-soft)] hover:border-[var(--accent)]/40 text-[11px] font-medium text-[var(--ink)] transition disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                    <span>Match Size</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => img2imgFileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-soft)] hover:border-[var(--accent)]/40 text-[11px] font-medium text-[var(--ink)] transition"
                    title="Replace image"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Replace</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Img2Img Sub-tab Segmented Navigation */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)]">
            <button
              type="button"
              onClick={() => setImg2imgSubTab("image_to_image")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
                img2imgSubTab === "image_to_image"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Image to Image</span>
            </button>
            <button
              type="button"
              onClick={() => setImg2imgSubTab("detailer")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
                img2imgSubTab === "detailer"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Detailer</span>
              {activeDetailerCfg.enabled && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                  {activeDetailerCfg.items.filter((i) => i.enabled).length ||
                    "ON"}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setImg2imgSubTab("upscaler")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
                img2imgSubTab === "upscaler"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Upscaler</span>
              {activeUpscale.enabled && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                  {activeUpscale.scale === 0
                    ? `${activeUpscale.customScale ?? 2}x`
                    : `${activeUpscale.scale}x`}
                </span>
              )}
            </button>
          </div>

          {img2imgSubTab === "detailer" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[var(--ink-faint)]">
                  SEQUENTIAL DETAILER STAGE
                </span>
                <span className="text-[10px] font-mono text-[var(--accent)]">
                  STAGE 3
                </span>
              </div>
              <p className="text-[11px] text-[var(--ink-faint)] leading-relaxed px-1">
                Cascading face, hand, and anatomical detailers applied after
                Img2Img generation.
              </p>
              <DetailerPanel
                config={activeDetailerCfg}
                onChange={handleDetailerCfgChange}
                selectedModel={selectedModel}
              />
            </div>
          ) : img2imgSubTab === "upscaler" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[var(--ink-faint)]">
                  SUPER-RESOLUTION STAGE
                </span>
                <span className="text-[10px] font-mono text-[var(--accent)]">
                  STAGE 2
                </span>
              </div>
              <p className="text-[11px] text-[var(--ink-faint)] leading-relaxed px-1">
                SeedVR2 DiT Super-Resolution sharpens textures and enhances
                image resolution.
              </p>
              <UpscalePanel
                config={activeUpscale}
                onChange={handleUpscaleChange}
                outputWidth={widthNum}
                outputHeight={heightNum}
              />
            </div>
          ) : (
            /* img2imgSubTab === "image_to_image" */
            <div className="space-y-4">

              {/* 2. Denoising Strength Slider (Recommended Range 0.65 - 0.76 with Boundary Lines & Soft Gradient) */}
              {(() => {
                const parsedDenoise =
                  typeof denoise === "number"
                    ? denoise
                    : parseFloat(String(denoise));
                const numDenoise = Math.max(
                  0,
                  Math.min(1, isNaN(parsedDenoise) ? 0.7 : parsedDenoise),
                );
                const p = Math.round(numDenoise * 100);
                const isRecommended = numDenoise >= 0.65 && numDenoise <= 0.76;

                return (
                  <div className="space-y-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 select-none">
                    {/* Header Row: Label, Recommended Badge & Numeric Readout (Locked height prevents layout shift) */}
                    <div className="flex h-5 items-center justify-between">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-faint)] leading-none">
                        DENOISING STRENGTH
                      </span>
                      <div className="flex h-5 items-center gap-2">
                        {isRecommended && (
                          <span className="inline-flex h-4 items-center text-[9px] font-mono px-1.5 rounded bg-[var(--accent-ambient)] border border-[var(--accent)]/40 text-[var(--accent)] font-semibold leading-none">
                            Recommended
                          </span>
                        )}
                        <span className="font-mono text-xs font-bold text-[var(--accent)] leading-none">
                          {numDenoise.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Range Slider (Track with 2 boundary lines & clean gradient) */}
                    <div className="relative py-1 flex items-center">
                      {/* Visual Track Container */}
                      <div className="relative w-full h-2 rounded-full bg-[var(--surface-sunken)] border border-[var(--line)] overflow-hidden pointer-events-none">
                        {/* Recommended Range Base Marker (0.65 to 0.76 soft gradient preview) */}
                        <div
                          className="absolute top-0 bottom-0 pointer-events-none opacity-40"
                          style={{
                            left: "65%",
                            width: "11%",
                            background:
                              "linear-gradient(to right, var(--accent), var(--accent-hover))",
                          }}
                        />

                        {/* Active Fill from 0 to 65% (Standard old accent color) */}
                        {p > 0 && (
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-[var(--accent)]"
                            style={{ width: `${Math.min(p, 65)}%` }}
                          />
                        )}

                        {/* Active Fill inside Recommended Range (Clean Sky-to-Purple gradient) */}
                        {p > 65 && (
                          <div
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: "65%",
                              width: `${Math.min(p - 65, 11)}%`,
                              background:
                                "linear-gradient(to right, var(--accent), var(--accent-hover))",
                            }}
                          />
                        )}

                        {/* Active Fill above 76% (Returns to standard old accent color) */}
                        {p > 76 && (
                          <div
                            className="absolute top-0 bottom-0 bg-[var(--accent)]"
                            style={{ left: "76%", width: `${p - 76}%` }}
                          />
                        )}
                      </div>

                      {/* 2 Boundary Tick Lines framing the Recommended Range (0.65 & 0.76) */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[1.5px] h-3.5 rounded-full bg-[var(--ink-soft)] pointer-events-none z-20"
                        style={{ left: "65%" }}
                        title="Recommended range start (0.65)"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[1.5px] h-3.5 rounded-full bg-[var(--accent)] pointer-events-none z-20"
                        style={{ left: "76%" }}
                        title="Recommended range end (0.76)"
                      />

                      {/* Native Range Input (Transparent Overlay with Crisp Thumb) */}
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={numDenoise}
                        onChange={(e) => onDenoiseChange(e.target.value)}
                        disabled={busy}
                        className="workspace-range-clean"
                        aria-label="Denoising strength slider"
                      />
                    </div>

                    {/* Bottom Ruler & Recommended Legend */}
                    <div className="flex items-center justify-between font-mono text-[10px] text-[var(--ink-faint)] select-none pt-0.5">
                      <span>0.0</span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                        <span className="text-[var(--ink-soft)]">
                          0.65 – 0.76 (Recommended)
                        </span>
                      </span>
                      <span>1.0</span>
                    </div>
                  </div>
                );
              })()}

              {/* 3. Active Generation Model Card */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                    GENERATION MODEL
                  </span>
                  <button
                    type="button"
                    onClick={() => setModelPickerOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Change</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setModelPickerOpen(true)}
                  className="group flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]">
                    {currentModelCover ? (
                      <img
                        src={currentModelCover}
                        alt={selectedModel?.title ?? "Model preview"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[var(--accent)]">
                        <Box className="h-5 w-5 opacity-75" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-[var(--ink)]">
                        {selectedModel?.title || "Krea 2 Turbo"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {baseModelTag && (
                        <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)]">
                          {baseModelTag}
                        </span>
                      )}
                      <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--ink-faint)]">
                        {selectedModel?.model_type || "Diffusion Model"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[var(--ink-faint)] group-hover:text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>

              {/* 4. LoRA Adapters Stack (Under Model, matching Text2Img layout) */}
              <LoraStackPanel
                loras={loras}
                onLorasChange={onLorasChange}
                onOpenPicker={() => setLoraPickerOpen(true)}
                modelOptions={modelOptions}
                publicModels={publicModels}
                publicModelMap={publicModelMap}
                prompt={prompt}
                onPromptChange={onPromptChange}
                disabled={busy}
              />

              {/* 6. Format & Dimensions */}
              <div className="space-y-2 border-t border-[var(--line)] pt-3">
                <AspectRatioSelector
                  value={format}
                  onChange={onFormatChange}
                  options={FORMATS}
                  disabled={busy}
                  label="Aspect Ratio"
                  columns={3}
                />
                {format === "custom" && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="img2img-custom-width"
                        className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold"
                      >
                        Width
                      </label>
                      <input
                        id="img2img-custom-width"
                        type="number"
                        min="64"
                        max="4096"
                        step="8"
                        value={customWidth}
                        onChange={(e) => onCustomWidthChange(e.target.value)}
                        disabled={busy}
                        className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="img2img-custom-height"
                        className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold"
                      >
                        Height
                      </label>
                      <input
                        id="img2img-custom-height"
                        type="number"
                        min="64"
                        max="4096"
                        step="8"
                        value={customHeight}
                        onChange={(e) => onCustomHeightChange(e.target.value)}
                        disabled={busy}
                        className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Advanced Sampling Parameters (Seed, Steps, CFG, Sampler, Scheduler) */}
              <AdvancedSamplingPanel
                idPrefix="img2img"
                seed={seed}
                onSeedChange={onSeedChange}
                steps={steps}
                onStepsChange={onStepsChange}
                cfg={cfg}
                onCfgChange={onCfgChange}
                sampler={samplerName}
                onSamplerChange={onSamplerNameChange}
                scheduler={scheduler}
                onSchedulerChange={onSchedulerChange}
                busy={busy}
                isOpen={advancedOpen}
                onToggleOpen={() => setAdvancedOpen((v) => !v)}
                showDenoise={false}
              />

              {/* 6. Upscale Engine Panel */}
              <UpscalePanel
                config={activeUpscale}
                onChange={handleUpscaleChange}
                outputWidth={widthNum}
                outputHeight={heightNum}
              />

              {/* 7. ADetailer Cascading Passes */}
              <DetailerPanel
                config={activeDetailerCfg}
                onChange={handleDetailerCfgChange}
                selectedModel={selectedModel}
              />
            </div>
          )}
        </div>
      ) : activeMode === "Edit" ? (
        <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* Edit Mode Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
                <Brush className="h-3 w-3" />
              </span>
              <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-[var(--ink)]">
                Inpaint & Regional Edit
              </span>
            </div>
            <span className="rounded-md bg-[var(--surface-sunken)] border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] text-[var(--accent)]">
              MASK STAGE
            </span>
          </div>

          {/* 1. Source Image Input & Preview Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                  SOURCE IMAGE
                </span>
                {props.referenceImage ? (
                  <span className="rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]">
                    LOADED
                  </span>
                ) : (
                  <span className="rounded-xl bg-[var(--accent)]/10 px-2 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)] border border-[var(--accent)]/20">
                    REQUIRED
                  </span>
                )}
              </div>
              {props.referenceImage && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceImageFile(null);
                    props.onReferenceImageChange?.(null);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--danger)] hover:underline transition"
                  title="Remove source image"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {!props.referenceImage ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleImg2ImgDrop}
                onClick={() => img2imgFileInputRef.current?.click()}
                className={`group relative flex h-48 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-all duration-200 cursor-pointer ${
                  isDragOver
                    ? "border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]"
                    : "border-[var(--line-strong)] hover:border-[var(--accent)]/50 bg-[color-mix(in_srgb,var(--surface-raised)_60%,transparent)] hover:bg-[var(--surface-raised)]"
                }`}
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-soft)] text-[var(--accent)] mb-2.5 transition-transform duration-200 group-hover:scale-110">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-[var(--ink)]">
                  Drop image to inpaint or{" "}
                  <span className="text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2">
                    browse
                  </span>
                </p>
                <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)] uppercase tracking-wider">
                  PNG, JPG, WEBP · UP TO 25MB
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 space-y-2.5">
                <div className="relative rounded-lg overflow-hidden border border-[var(--line)] bg-[var(--surface-sunken)] flex h-48 w-full items-center justify-center group">
                  <img
                    src={props.referenceImage}
                    alt="Inpaint Source"
                    className="h-full w-full object-contain rounded-lg"
                  />
                  {naturalDimensions && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-[var(--overlay)] backdrop-blur-md px-2 py-0.5 font-mono text-[10px] text-[var(--ink)] border border-[var(--line)]">
                      {naturalDimensions.width} × {naturalDimensions.height} PX
                    </span>
                  )}
                  {naturalDimensions &&
                    Number(customWidth) ===
                      Math.max(
                        64,
                        Math.min(2048, Math.round(naturalDimensions.width / 8) * 8),
                      ) &&
                    Number(customHeight) ===
                      Math.max(
                        64,
                        Math.min(2048, Math.round(naturalDimensions.height / 8) * 8),
                      ) && (
                      <span className="absolute bottom-2 right-2 rounded-md bg-[var(--accent)]/90 backdrop-blur-md px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--accent-ink)] uppercase">
                        CANVAS MATCHED
                      </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAutoPromptFromReference}
                    disabled={interrogating || busy}
                    title="Extract generation prompt, seed, cfg, steps & size from reference image metadata, or auto-tag with WD14"
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[var(--accent)]/60 text-[11px] font-bold text-[var(--accent)] transition disabled:opacity-50"
                  >
                    {interrogating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Tag className="h-3 w-3" />
                    )}
                    <span>{interrogating ? "Reading…" : "Auto-Prompt"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleMatchDimensions}
                    disabled={!naturalDimensions}
                    title="Adjust canvas width & height to match this image natural aspect ratio"
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-soft)] hover:border-[var(--accent)]/40 text-[11px] font-medium text-[var(--ink)] transition disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                    <span>Match Size</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => img2imgFileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-soft)] hover:border-[var(--accent)]/40 text-[11px] font-medium text-[var(--ink)] transition"
                    title="Replace image"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Replace</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Inpaint Settings Card */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[var(--ink-faint)]">
                Inpaint Fill Mode
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--surface)] p-1 border border-[var(--line)]">
              {[
                {
                  id: "original",
                  label: "Original",
                  hint: "Preserves underlying colors & shapes",
                },
                {
                  id: "latent_noise",
                  label: "Latent Noise",
                  hint: "Drastic object replacement",
                },
                {
                  id: "latent_zero",
                  label: "Neutral Tone",
                  hint: "Clean object removal",
                },
              ].map((fill) => (
                <button
                  key={fill.id}
                  type="button"
                  onClick={() => onInpaintFillChange?.(fill.id as any)}
                  className={`py-1.5 px-2 rounded-md text-[10px] font-bold transition text-center ${
                    inpaintFill === fill.id
                      ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                  title={fill.hint}
                >
                  {fill.label}
                </button>
              ))}
            </div>

            {/* Mask Blur Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase">
                  Mask Feathering
                </span>
                <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                  {maskBlur}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={32}
                step={1}
                value={maskBlur}
                onChange={(e) => onMaskBlurChange?.(Number(e.target.value))}
                className="w-full accent-[var(--accent)] h-1.5 bg-[var(--surface-sunken)] rounded-lg cursor-pointer"
              />
            </div>

            {/* Inpaint Denoising Strength */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase">
                  Inpaint Denoise
                </span>
                <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                  {denoise}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={Number(denoise) || 0.75}
                onChange={(e) => onDenoiseChange(e.target.value)}
                className="w-full accent-[var(--accent)] h-1.5 bg-[var(--surface-sunken)] rounded-lg cursor-pointer"
              />
              <div className="flex items-center justify-between gap-1 pt-1">
                {[
                  { label: "Subtle (0.50)", val: "0.50" },
                  { label: "Balanced (0.75)", val: "0.75" },
                  { label: "Radical (0.95)", val: "0.95" },
                ].map((chip) => (
                  <button
                    key={chip.val}
                    type="button"
                    onClick={() => onDenoiseChange(chip.val)}
                    className={`flex-1 py-0.5 rounded text-[9px] font-mono border transition ${
                      denoise === chip.val
                        ? "bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] font-bold"
                        : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Generation Model Card */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                GENERATION MODEL
              </span>
              <button
                type="button"
                onClick={() => setModelPickerOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Change</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              className="group flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
            >
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]">
                {currentModelCover ? (
                  <img
                    src={currentModelCover}
                    alt={selectedModel?.title ?? "Model preview"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[var(--accent)]">
                    <Box className="h-5 w-5 opacity-75" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-[var(--ink)]">
                    {selectedModel?.title || "Krea 2 Turbo"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {baseModelTag && (
                    <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)]">
                      {baseModelTag}
                    </span>
                  )}
                  <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--ink-faint)]">
                    {selectedModel?.model_type || "Diffusion Model"}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--ink-faint)] group-hover:text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          {/* 5. Aspect Ratio Selector */}
          <AspectRatioSelector
            value={format}
            onChange={onFormatChange}
            options={FORMATS}
            disabled={busy}
            label="Canvas Bounds"
            columns={3}
          />

          {format === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="edit-custom-width"
                  className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold"
                >
                  Width
                </label>
                <input
                  id="edit-custom-width"
                  type="number"
                  min="64"
                  max="4096"
                  step="8"
                  value={customWidth}
                  onChange={(e) => onCustomWidthChange(e.target.value)}
                  disabled={busy}
                  aria-invalid={customWidthInvalid}
                  className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-custom-height"
                  className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold"
                >
                  Height
                </label>
                <input
                  id="edit-custom-height"
                  type="number"
                  min="64"
                  max="4096"
                  step="8"
                  value={customHeight}
                  onChange={(e) => onCustomHeightChange(e.target.value)}
                  disabled={busy}
                  aria-invalid={customHeightInvalid}
                  className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          )}

          {/* 6. LoRA Adapters (shared stack with thumbnails, mute & trigger words) */}
          <LoraStackPanel
            loras={loras}
            onLorasChange={onLorasChange}
            onOpenPicker={() => setLoraPickerOpen(true)}
            modelOptions={modelOptions}
            publicModels={publicModels}
            publicModelMap={publicModelMap}
            prompt={prompt}
            onPromptChange={onPromptChange}
            disabled={busy}
          />

          {/* 7. Sampling Parameters (Seed, Steps, CFG, Sampler, Scheduler) */}
          <AdvancedSamplingPanel
            idPrefix="edit"
            seed={seed}
            onSeedChange={onSeedChange}
            steps={steps}
            onStepsChange={onStepsChange}
            cfg={cfg}
            onCfgChange={onCfgChange}
            sampler={samplerName}
            onSamplerChange={onSamplerNameChange}
            scheduler={scheduler}
            onSchedulerChange={onSchedulerChange}
            busy={busy}
            isOpen={advancedOpen}
            onToggleOpen={() => setAdvancedOpen((v) => !v)}
            showDenoise={false}
          />

          {/* 8. Upscale Engine Panel */}
          <UpscalePanel
            config={activeUpscale}
            onChange={handleUpscaleChange}
            outputWidth={widthNum}
            outputHeight={heightNum}
          />

          {/* 9. ADetailer Cascading Passes */}
          <DetailerPanel
            config={activeDetailerCfg}
            onChange={handleDetailerCfgChange}
            selectedModel={selectedModel}
          />
        </div>
      ) : activeMode === "Video" ? (
        <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* LTX-Video 2.3 Studio Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
                <Film className="h-3 w-3" />
              </span>
              <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-[var(--ink)]">
                LTX-Video 2.3 Studio
              </span>
            </div>
            <span className="rounded-md bg-[var(--surface-sunken)] border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--accent)]">
              {videoSubMode === "image-to-video" ? "I2V GUIDED" : "T2V TEXT-DRIVEN"}
            </span>
          </div>

          {/* Video Sub-mode Segmented Navigation */}
          <div
            role="group"
            aria-label="Video mode"
            className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)]"
          >
            <button
              type="button"
              aria-pressed={videoSubMode === "text-to-video"}
              onClick={() => setVideoSubMode("text-to-video")}
              disabled={busy}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition motion-reduce:transition-none ${
                videoSubMode === "text-to-video"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <Film className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Text to Video</span>
            </button>
            <button
              type="button"
              aria-pressed={videoSubMode === "image-to-video"}
              onClick={() => setVideoSubMode("image-to-video")}
              disabled={busy}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition motion-reduce:transition-none ${
                videoSubMode === "image-to-video"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Image to Video</span>
            </button>
          </div>

          {/* Model capability warning: the video graph does not consume the picker */}
          {!videoModelIsLtx && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-2.5 text-[11px] leading-relaxed text-[var(--danger)]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                The video pipeline always runs the bundled LTX-Video 2.3 weights and
                ignores the selected checkpoint. Pick an LTX-family model for the
                gallery to reflect what actually renders.
              </span>
            </div>
          )}

          {/* Mode Pill Notice */}
          <div className={`flex items-center gap-2 rounded-xl p-2.5 border text-xs font-mono transition ${
            videoSubMode === "image-to-video"
              ? "bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--ink)]"
              : "bg-[var(--surface-sunken)] border-[var(--line)] text-[var(--ink-faint)]"
          }`}>
            <Sparkles className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <span>
              {videoSubMode === "image-to-video"
                ? "Image-to-Video: Motion seeded by Initial Frame"
                : "Text-to-Video: Generating motion purely from prompt"}
            </span>
          </div>

          {/* 1. Generation Model Card (labelling only: the graph keeps its bundled LTX weights) */}
          <GenerationModelCard
            selectedModel={selectedModel}
            coverUrl={currentModelCover}
            baseModelTag={baseModelTag}
            onOpenPicker={() => setModelPickerOpen(true)}
            fallbackTitle="No model selected"
          />

          {/* 2. LoRA Stack */}
          <LoraStackPanel
            loras={loras}
            onLorasChange={onLorasChange}
            onOpenPicker={() => setLoraPickerOpen(true)}
            modelOptions={modelOptions}
            publicModels={publicModels}
            publicModelMap={publicModelMap}
            prompt={prompt}
            onPromptChange={onPromptChange}
            disabled={busy}
          />

          {/* 3. Frames: first frame (I2V seed) + optional last frame (interpolation) */}
          {videoSubMode === "image-to-video" && (
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
              FRAMES & CONDITIONING
            </span>

            <div className="grid grid-cols-2 gap-2">
              {/* First frame */}
              <div className="space-y-1">
                <div className="flex h-4 items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
                    First frame
                  </span>
                  {props.referenceImage && (
                    <button
                      type="button"
                      onClick={() => {
                        setSourceImageFile(null);
                        props.onReferenceImageChange?.(null);
                      }}
                      aria-label="Remove first frame"
                      title="Remove first frame (switch to T2V)"
                      className="rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--danger)] focus-visible:text-[var(--danger)] motion-reduce:transition-none"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {!props.referenceImage ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleImg2ImgDrop}
                    onClick={() => img2imgFileInputRef.current?.click()}
                    className={`group flex h-[7.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center transition-colors motion-reduce:transition-none ${
                      isDragOver
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--line-strong)] bg-[var(--surface-sunken)] hover:border-[var(--ink-faint)]"
                    }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] transition-colors group-hover:text-[var(--accent)] motion-reduce:transition-none">
                      <UploadCloud className="h-4 w-4" />
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold text-[var(--ink)]">
                      Add starter frame
                    </p>
                    <p className="mt-0.5 text-[9px] leading-tight text-[var(--ink-faint)]">
                      Empty = text-only T2V
                    </p>
                  </div>
                ) : (
                  <div className="relative flex h-[7.5rem] items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-1.5">
                    <img
                      src={resolveMediaUrl(props.referenceImage) || props.referenceImage}
                      alt="First frame preview"
                      className="h-full w-full rounded-md object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Last frame */}
              <div className="space-y-1">
                <div className="flex h-4 items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
                    Last frame
                  </span>
                  {lastFrameImage && (
                    <button
                      type="button"
                      onClick={() => props.onLastFrameImageChange?.(null)}
                      aria-label="Remove last frame"
                      title="Remove last frame"
                      className="rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--danger)] focus-visible:text-[var(--danger)] motion-reduce:transition-none"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {!lastFrameImage ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsLastFrameDragOver(true);
                    }}
                    onDragLeave={() => setIsLastFrameDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsLastFrameDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) void handleLastFrameFileUpload(file);
                    }}
                    onClick={() => lastFrameFileInputRef.current?.click()}
                    className={`group flex h-[7.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center transition-colors motion-reduce:transition-none ${
                      isLastFrameDragOver
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--line-strong)] bg-[var(--surface-sunken)] hover:border-[var(--ink-faint)]"
                    }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] transition-colors group-hover:text-[var(--accent)] motion-reduce:transition-none">
                      <UploadCloud className="h-4 w-4" />
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold text-[var(--ink)]">
                      Optional end frame
                    </p>
                    <p className="mt-0.5 text-[9px] leading-tight text-[var(--ink-faint)]">
                      Interpolates toward it
                    </p>
                  </div>
                ) : (
                  <div className="relative flex h-[7.5rem] items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-1.5">
                    <img
                      src={resolveMediaUrl(lastFrameImage) || lastFrameImage}
                      alt="Last frame preview"
                      className="h-full w-full rounded-md object-contain"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Frame conditioning strength */}
            {(props.referenceImage || lastFrameImage) && (
              <div className="space-y-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                {props.referenceImage && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="video-first-frame-strength"
                        className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]"
                      >
                        First frame strength
                      </label>
                      <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                        {firstFrameStrength.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="video-first-frame-strength"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={firstFrameStrength}
                      disabled={busy}
                      onChange={(e) => props.onFirstFrameStrengthChange?.(Number(e.target.value))}
                      aria-label="First frame conditioning strength"
                      className="workspace-range w-full disabled:opacity-50"
                    />
                  </div>
                )}
                {lastFrameImage && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="video-last-frame-strength"
                        className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]"
                      >
                        Last frame strength
                      </label>
                      <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                        {lastFrameStrength.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="video-last-frame-strength"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={lastFrameStrength}
                      disabled={busy}
                      onChange={(e) => props.onLastFrameStrengthChange?.(Number(e.target.value))}
                      aria-label="Last frame conditioning strength"
                      className="workspace-range w-full disabled:opacity-50"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* 4. Audio track */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
              AUDIO TRACK
            </span>
            <div
              role="group"
              aria-label="Video audio track"
              className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5"
            >
              <button
                type="button"
                aria-pressed={audioMode === "silent"}
                onClick={() => props.onAudioModeChange?.("silent")}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${
                  audioMode === "silent"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                }`}
              >
                Model-generated audio
              </button>
              <button
                type="button"
                aria-pressed={audioMode === "voice_clone"}
                onClick={() => props.onAudioModeChange?.("voice_clone")}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${
                  audioMode === "voice_clone"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                }`}
              >
                Clone a reference voice
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--ink-faint)]">
              {audioMode === "silent"
                ? "The model scores its own audio for the clip. Switch to voice clone to copy a reference speaker instead."
                : "Voice clone needs a reference audio file. Upload a clean speech clip (mp3, wav, ogg, m4a, or flac)."}
            </p>

            {audioMode === "voice_clone" && (
              <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
                    Reference audio
                  </span>
                  {referenceAudio && (
                    <button
                      type="button"
                      onClick={() => props.onReferenceAudioChange?.(null)}
                      aria-label="Remove reference audio"
                      title="Remove reference audio"
                      className="rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--danger)] focus-visible:text-[var(--danger)] motion-reduce:transition-none"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {!referenceAudio ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsAudioDragOver(true);
                    }}
                    onDragLeave={() => setIsAudioDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsAudioDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) void handleAudioFileUpload(file);
                    }}
                    onClick={() => audioFileInputRef.current?.click()}
                    className={`group flex h-[3.25rem] cursor-pointer items-center gap-2.5 rounded-lg border border-dashed p-2.5 transition-colors motion-reduce:transition-none ${
                      isAudioDragOver
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--line-strong)] hover:border-[var(--ink-faint)]"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] transition-colors group-hover:text-[var(--accent)] motion-reduce:transition-none">
                      <UploadCloud className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block text-[11px] font-semibold text-[var(--ink)]">
                        Drop audio or <span className="text-[var(--accent)]">browse</span>
                      </span>
                      <span className="block text-[9px] text-[var(--ink-faint)]">
                        mp3 · wav · ogg · m4a · flac
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="flex h-[3.25rem] items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                    <span className="truncate font-mono text-[10px] text-[var(--ink)]">
                      Reference audio loaded
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  aria-pressed={extractVoice}
                  onClick={() => props.onExtractVoiceChange?.(!extractVoice)}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-2 text-left transition-colors hover:border-[var(--line-strong)] motion-reduce:transition-none"
                >
                  <span className="min-w-0 pr-2">
                    <span className="block text-[11px] font-semibold text-[var(--ink)]">
                      Extract voice
                    </span>
                    <span className="block text-[9px] leading-tight text-[var(--ink-faint)]">
                      Isolate vocals from the reference clip before cloning
                    </span>
                  </span>
                  <span
                    className={`relative h-4 w-7 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
                      extractVoice ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
                    }`}
                    aria-hidden="true"
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-[var(--accent-ink)] transition-transform motion-reduce:transition-none ${
                        extractVoice ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* 5. Performance Profile Toggle (Fast vs Pro) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
              PIPELINE EXECUTION PROFILE
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pipeline execution profile">
              <button
                type="button"
                aria-pressed={!stage2Upscale}
                onClick={() => onStage2UpscaleChange?.(false)}
                className={`rounded-xl border p-2.5 text-left transition-colors motion-reduce:transition-none ${
                  !stage2Upscale
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]"
                    : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)]"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent)]">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Fast Mode</span>
                </div>
                <p className="mt-1 text-[10px] leading-tight text-[var(--ink-faint)]">
                  Stage 1 base only (~15s)
                </p>
              </button>
              <button
                type="button"
                aria-pressed={stage2Upscale}
                onClick={() => onStage2UpscaleChange?.(true)}
                className={`rounded-xl border p-2.5 text-left transition-colors motion-reduce:transition-none ${
                  stage2Upscale
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]"
                    : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)]"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent)]">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pro Mode</span>
                </div>
                <p className="mt-1 text-[10px] leading-tight text-[var(--ink-faint)]">
                  2x upscale + RIFE (~45s)
                </p>
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--ink-faint)]">
              Fast mode prunes the Stage 2 subgraph, so film grain, RIFE interpolation,
              color match, and tiled VAE are skipped.
            </p>
          </div>

          {/* 6. Duration, frame rate, sizing */}
          <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase">
                  Video Duration
                </span>
                <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                  {videoDurationSeconds}s ({videoDurationSeconds * videoFps + 1} frames)
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1" role="group" aria-label="Video duration">
                {VIDEO_DURATION_OPTIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={videoDurationSeconds === sec}
                    onClick={() => onVideoDurationSecondsChange?.(sec)}
                    className={`rounded-md px-2 py-1.5 text-center text-[10px] font-bold transition-colors motion-reduce:transition-none ${
                      videoDurationSeconds === sec
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Frame Rate (FPS) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase">
                  Frame Rate (FPS)
                </span>
                <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                  {videoFps} FPS
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1" role="group" aria-label="Video frame rate">
                {VIDEO_FPS_OPTIONS.map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    aria-pressed={videoFps === fps}
                    onClick={() => onVideoFpsChange?.(fps)}
                    className={`rounded-md px-1 py-1.5 text-center text-[10px] font-bold transition-colors motion-reduce:transition-none ${
                      videoFps === fps
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>

            {/* Sizing mode: preset dimensions vs. follow the source image */}
            {videoSubMode === "image-to-video" && (
            <div className="space-y-1.5 border-t border-[var(--line)] pt-2.5">
              <span className="text-[10px] font-mono uppercase text-[var(--ink-faint)]">
                Video Sizing
              </span>
              <div
                role="group"
                aria-label="Video sizing mode"
                className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={resizeMode === "preset"}
                  onClick={() => onResizeModeChange?.("preset")}
                  className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors motion-reduce:transition-none ${
                    resizeMode === "preset"
                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                  }`}
                >
                  Match preset
                </button>
                <button
                  type="button"
                  aria-pressed={resizeMode === "source"}
                  onClick={() => onResizeModeChange?.("source")}
                  disabled={!props.referenceImage}
                  className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${
                    resizeMode === "source"
                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                  }`}
                >
                  Match source image
                </button>
              </div>
              {!props.referenceImage && (
                <p className="text-[9px] leading-relaxed text-[var(--ink-faint)]">
                  Source sizing needs a first frame. Without one, the preset dimensions
                  below are sent.
                </p>
              )}
              {resizeMode === "source" && props.referenceImage && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="video-megapixels"
                      className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]"
                    >
                      Source megapixels
                    </label>
                    <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                      {videoMegapixels.toFixed(1)} MP
                    </span>
                  </div>
                  <input
                    id="video-megapixels"
                    type="number"
                    min={0.5}
                    max={8}
                    step={0.1}
                    value={videoMegapixels}
                    disabled={busy}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value)) {
                        props.onVideoMegapixelsChange?.(
                          Math.max(0.5, Math.min(8, value))
                        );
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                  <p className="text-[9px] leading-relaxed text-[var(--ink-faint)]">
                    The source image is scaled to this budget and snapped to multiples
                    of 32.
                  </p>
                </div>
              )}
            </div>
            )}

            {/* Resolution presets (multiples of 32 for LTX-Video) */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase">
                {resizeMode === "source" && videoSubMode === "image-to-video"
                  ? "Preset Dimensions (unused)"
                  : "Preset Resolution"}
              </span>
              <div className={`grid grid-cols-2 gap-1.5 ${resizeMode === "source" && videoSubMode === "image-to-video" ? "opacity-50" : ""}`}>
                {[
                  { label: "16:9 Landscape", w: 1024, h: 576 },
                  { label: "3:2 Standard", w: 768, h: 512 },
                  { label: "1:1 Square", w: 704, h: 704 },
                  { label: "9:16 Portrait", w: 576, h: 1024 },
                ].map((res) => {
                  const isMatch =
                    format === "custom" &&
                    Number(customWidth) === res.w &&
                    Number(customHeight) === res.h;
                  return (
                    <button
                      key={res.label}
                      type="button"
                      aria-pressed={isMatch}
                      disabled={resizeMode === "source" && videoSubMode === "image-to-video"}
                      onClick={() => {
                        onFormatChange("custom");
                        onCustomWidthChange(String(res.w));
                        onCustomHeightChange(String(res.h));
                      }}
                      className={`rounded-lg border p-1.5 text-left font-mono text-[10px] transition-colors motion-reduce:transition-none disabled:cursor-not-allowed ${
                        isMatch
                          ? "border-[var(--accent)] bg-[var(--accent)]/15 font-bold text-[var(--accent)]"
                          : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <div className="font-bold">{res.label}</div>
                      <div className="text-[9px] opacity-75">
                        {res.w}×{res.h}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label
                    htmlFor="video-custom-width"
                    className="mb-1 block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-faint)]"
                  >
                    Width
                  </label>
                  <input
                    id="video-custom-width"
                    type="number"
                    min={64}
                    max={4096}
                    step={32}
                    value={customWidth}
                    disabled={busy}
                    aria-invalid={customWidthInvalid}
                    onChange={(e) => onCustomWidthChange(e.target.value)}
                    className={`w-full rounded-lg border bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50 ${
                      customWidthInvalid ? "border-[var(--danger-line)]" : "border-[var(--line)]"
                    }`}
                  />
                </div>
                <div>
                  <label
                    htmlFor="video-custom-height"
                    className="mb-1 block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-faint)]"
                  >
                    Height
                  </label>
                  <input
                    id="video-custom-height"
                    type="number"
                    min={64}
                    max={4096}
                    step={32}
                    value={customHeight}
                    disabled={busy}
                    aria-invalid={customHeightInvalid}
                    onChange={(e) => onCustomHeightChange(e.target.value)}
                    className={`w-full rounded-lg border bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50 ${
                      customHeightInvalid ? "border-[var(--danger-line)]" : "border-[var(--line)]"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 7. Stage 2 quality (Pro mode only) */}
          <div className={`rounded-xl border bg-[var(--surface-sunken)] transition-colors motion-reduce:transition-none ${
            stage2Upscale ? "border-[var(--line)]" : "border-[var(--line)] opacity-60"
          }`}>
            <button
              type="button"
              onClick={() => setStage2QualityOpen((v) => !v)}
              aria-expanded={stage2QualityOpen}
              aria-controls="video-stage2-quality"
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink)]">
                  Stage 2 Quality
                </span>
                {!stage2Upscale && (
                  <span className="rounded border border-[var(--line)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Pro only
                  </span>
                )}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform motion-reduce:transition-none ${
                  stage2QualityOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>
            {stage2QualityOpen && (
              <div id="video-stage2-quality" className="space-y-3 border-t border-[var(--line)] px-3 pb-3 pt-2.5">
                <p className="text-[10px] leading-relaxed text-[var(--ink-faint)]">
                  These only take effect in Pro mode. Fast mode prunes the Stage 2
                  subgraph entirely.
                </p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="video-rife-multiplier"
                      className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]"
                    >
                      RIFE multiplier
                    </label>
                    <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                      {rifeMultiplier}×
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1" role="group" aria-label="RIFE frame multiplier">
                    {[1, 2, 3, 4].map((multiplier) => (
                      <button
                        key={multiplier}
                        type="button"
                        aria-pressed={rifeMultiplier === multiplier}
                        disabled={!stage2Upscale || busy}
                        onClick={() => props.onRifeMultiplierChange?.(multiplier)}
                        className={`rounded-md px-1 py-1 text-[10px] font-bold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed ${
                          rifeMultiplier === multiplier
                            ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {multiplier}×
                      </button>
                    ))}
                  </div>
                </div>
                {[
                  {
                    label: "High FPS output",
                    hint: "Interpolate to a smoother frame rate",
                    active: highFps,
                    onToggle: () => props.onHighFpsChange?.(!highFps),
                  },
                  {
                    label: "Film grain",
                    hint: "Add a fine analog grain pass",
                    active: filmGrain,
                    onToggle: () => props.onFilmGrainChange?.(!filmGrain),
                  },
                  {
                    label: "Match colors",
                    hint: "Match Stage 2 colors back to Stage 1",
                    active: matchColor,
                    onToggle: () => props.onMatchColorChange?.(!matchColor),
                  },
                  {
                    label: "Tiled VAE decode",
                    hint: "Lower VRAM at some speed cost",
                    active: tiledVaeDecode,
                    onToggle: () => props.onTiledVaeDecodeChange?.(!tiledVaeDecode),
                  },
                ].map((toggle) => (
                  <button
                    key={toggle.label}
                    type="button"
                    aria-pressed={toggle.active}
                    disabled={!stage2Upscale || busy}
                    onClick={toggle.onToggle}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--line-strong)] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0 pr-2">
                      <span className="block text-[11px] font-semibold text-[var(--ink)]">
                        {toggle.label}
                      </span>
                      <span className="block text-[9px] leading-tight text-[var(--ink-faint)]">
                        {toggle.hint}
                      </span>
                    </span>
                    <span
                      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
                        toggle.active ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
                      }`}
                      aria-hidden="true"
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-[var(--accent-ink)] transition-transform motion-reduce:transition-none ${
                          toggle.active ? "translate-x-3.5" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 8. Sampling */}
          <AdvancedSamplingPanel
            idPrefix="video"
            seed={seed}
            onSeedChange={onSeedChange}
            steps={steps}
            onStepsChange={onStepsChange}
            cfg={cfg}
            onCfgChange={onCfgChange}
            sampler={samplerName}
            onSamplerChange={onSamplerNameChange}
            scheduler={scheduler}
            onSchedulerChange={onSchedulerChange}
            minSteps={1}
            maxSteps={50}
            minCfg={1}
            maxCfg={10}
            busy={busy}
            isOpen={advancedOpen}
            onToggleOpen={() => setAdvancedOpen((v) => !v)}
            showDenoise={false}
            title="Diffusion Parameters"
            badge="LTX distilled"
          />
          <p className="-mt-2 px-1 text-[10px] leading-relaxed text-[var(--ink-faint)]">
            This distilled LTX graph runs at CFG 1. At that guidance scale the negative
            prompt has no effect. Raise CFG only if you want classifier-free guidance.
          </p>
        </div>
      ) : activeMode === "Prime" ? (
        <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* Prime Luxury Header */}
          <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[var(--accent)]/10 via-[var(--accent)]/5 to-transparent p-3 border border-[var(--accent)]/20">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]/20 text-[var(--accent)]">
                <Crown className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
                  SOLO STUDIO PRIME™
                </h3>
                <p className="text-[10px] text-[var(--ink-faint)]">
                  Autonomous Multi-Stage Pro Pipeline
                </p>
              </div>
            </div>
            <span className="rounded-md bg-[var(--accent)]/15 border border-[var(--accent)]/30 px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--accent)]">
              PRO SUITE
            </span>
          </div>

          {/* 1. Prime Recipe Presets */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-faint)]">
              PRIME RECIPE PRESETS
            </span>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  id: "portrait_pro",
                  title: "Photoreal Studio Portrait",
                  desc: "Base SDXL/Flux + 1.5x SeedVR2 DiT Upscale + YOLO Face Detailer",
                  scale: 1.5,
                  detailer: true,
                },
                {
                  id: "cinematic",
                  title: "Cinematic Masterpiece",
                  desc: "Filmic 85mm medium format + DiT Super-Resolution + Color Grading",
                  scale: 2.0,
                  detailer: true,
                },
                {
                  id: "anime_hd",
                  title: "Hyper-Detail Anime",
                  desc: "Anime Base + Hand & Anatomical Mesh Fix + DiT Sharpening",
                  scale: 1.5,
                  detailer: true,
                },
              ].map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => {
                    onPrimePresetChange?.(recipe.id);
                    handleUpscaleChange({
                      ...activeUpscale,
                      enabled: true,
                      scale: recipe.scale,
                    });
                    handleDetailerCfgChange({
                      ...activeDetailerCfg,
                      enabled: recipe.detailer,
                    });
                  }}
                  className={`group flex flex-col p-2.5 rounded-xl border text-left transition-colors motion-reduce:transition-none ${
                    primePreset === recipe.id
                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 shadow-sm"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--accent)]/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--ink)] group-hover:text-[var(--accent)]">
                      {recipe.title}
                    </span>
                    {primePreset === recipe.id && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--ink-faint)] mt-1">
                    {recipe.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Active Pipeline Stages Status & Toggles */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3 space-y-2.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-faint)]">
              ACTIVE PIPELINE STAGES
            </span>
            {/* Stage 1 */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
                <span className="text-xs font-semibold text-[var(--ink)]">
                  Stage 1: Base Latent Synthesis
                </span>
              </div>
              <span className="text-[9px] font-mono font-bold text-[var(--success)] uppercase">
                ACTIVE
              </span>
            </div>
            {/* Stage 2 */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)]">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${activeUpscale.enabled ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`}
                />
                <div>
                  <span className="text-xs font-semibold text-[var(--ink)]">
                    Stage 2: DiT Super-Resolution
                  </span>
                  <span className="ml-1.5 text-[9px] font-mono text-[var(--accent)]">
                    ({activeUpscale.scale}x)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleUpscaleChange({
                    ...activeUpscale,
                    enabled: !activeUpscale.enabled,
                  })
                }
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border transition-colors motion-reduce:transition-none ${
                  activeUpscale.enabled
                    ? "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/40"
                    : "bg-[var(--surface-soft)] text-[var(--ink-faint)] border-[var(--line)]"
                }`}
              >
                {activeUpscale.enabled ? "ON" : "OFF"}
              </button>
            </div>
            {/* Stage 3 */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)]">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${activeDetailerCfg.enabled ? "bg-[var(--accent)]" : "bg-neutral-600"}`}
                />
                <span className="text-xs font-semibold text-[var(--ink)]">
                  Stage 3: Cascading YOLO Detailers
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleDetailerCfgChange({
                    ...activeDetailerCfg,
                    enabled: !activeDetailerCfg.enabled,
                  })
                }
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border transition ${
                  activeDetailerCfg.enabled
                    ? "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/40"
                    : "bg-neutral-800 text-neutral-400 border-neutral-700"
                }`}
              >
                {activeDetailerCfg.enabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {/* 3. Generation Model Card */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                GENERATION MODEL
              </span>
              <button
                type="button"
                onClick={() => setModelPickerOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Change</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              className="group flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
            >
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]">
                {currentModelCover ? (
                  <img
                    src={currentModelCover}
                    alt={selectedModel?.title ?? "Model preview"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[var(--accent)]">
                    <Box className="h-5 w-5 opacity-75" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-[var(--ink)]">
                    {selectedModel?.title || "Krea 2 Turbo"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {baseModelTag && (
                    <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--accent)]">
                      {baseModelTag}
                    </span>
                  )}
                  <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--ink-faint)]">
                    {selectedModel?.model_type || "Diffusion Model"}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--ink-faint)] group-hover:text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          {/* 5. Aspect Ratio Selector */}
          <AspectRatioSelector
            value={format}
            onChange={onFormatChange}
            options={FORMATS}
            disabled={busy}
            label="Aspect Ratio"
            columns={3}
          />

          {/* 6. Active LoRAs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                ACTIVE LORAS ({loras.length}/5)
              </span>
              <button
                type="button"
                disabled={loras.length >= 5}
                onClick={() => setLoraPickerOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                <span>Add LoRA</span>
              </button>
            </div>
            {loras.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-center">
                <p className="text-[11px] text-[var(--ink-faint)]">
                  No active LoRA modifiers attached
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {loras.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--ink)]">
                        {l.title}
                      </p>
                      <span className="text-[10px] font-mono text-[var(--accent)]">
                        {l.weight.toFixed(2)}x
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLora(l.id)}
                      className="text-[var(--danger)] hover:opacity-80 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 7. Sampling Parameters */}
          <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                PRO SAMPLING CONFIGURATION
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-[var(--ink-faint)] block mb-1">
                  STEPS
                </label>
                <input
                  type="number"
                  value={steps}
                  min={1}
                  max={100}
                  onChange={(e) => onStepsChange(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[var(--ink-faint)] block mb-1">
                  CFG SCALE
                </label>
                <input
                  type="number"
                  value={cfg}
                  step={0.5}
                  min={1}
                  max={30}
                  onChange={(e) => onCfgChange(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] focus:border-[var(--accent)] outline-none"
                />
              </div>
            </div>
            <SeedInput
              value={seed}
              onChange={(val) => onSeedChange(String(val))}
            />
          </div>
        </div>
      ) : (
        <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* Section Title: Models */}
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-[var(--ink)] tracking-tight">
              Models
            </h2>
            <div className="flex items-center gap-2">
              {modelsLoading && (
                <span className="text-[11px] text-[var(--ink-faint)]">
                  Loading models…
                </span>
              )}
              {onResetDefaults && (
                <button
                  type="button"
                  onClick={onResetDefaults}
                  title="Reset studio parameters to defaults"
                  className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-faint)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  <span>Reset defaults</span>
                </button>
              )}
            </div>
          </div>

          {modelsError && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-2.5 text-xs text-[var(--danger)]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{modelsError}</span>
            </div>
          )}

          {/* 1. Basic Model Card (Tensor.art layout & controls) */}
          {modelsLoading && !selectedModel ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                  Basic Model
                </span>
                <div className="h-4 w-14 rounded-xl bg-[var(--surface-soft)] shimmer" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 min-w-0">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-[var(--surface-soft)] shimmer border border-[var(--line)]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-[var(--surface-soft)] shimmer" />
                  <div className="h-2.5 w-1/2 rounded bg-[var(--surface-soft)] shimmer mt-1.5" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                    Basic Model
                  </span>
                  {baseModelTag && (
                    <span
                      className="shrink-0 max-w-[120px] truncate rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[9px] font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]"
                      title={baseModelTag}
                    >
                      {baseModelTag}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setModelPickerOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] focus-visible:text-[var(--accent-hover)] transition shrink-0"
                  title="Replace Basic Model"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Replace</span>
                </button>
              </div>

              <div className="flex items-stretch gap-1.5 min-w-0">
                <button
                  type="button"
                  aria-label="Choose basic model"
                  onClick={() => setModelPickerOpen(true)}
                  className="workspace-command group flex flex-1 items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-left transition-[border-color,background-color,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] min-w-0"
                >
                  <div className="flex items-center gap-2.5 w-full min-w-0">
                    {/* Model Thumbnail */}
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]">
                      {currentModelCover ? (
                        <>
                          <img
                            src={currentModelCover}
                            alt={selectedModel?.title ?? "Model preview"}
                            className="asset-zoom-media relative z-10 h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display =
                                "none";
                            }}
                          />
                          <div className="absolute inset-0 grid place-items-center text-[var(--accent)] opacity-60">
                            <Box className="h-5 w-5" />
                          </div>
                        </>
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-[var(--surface-soft)] text-[var(--accent)]">
                          <Box className="h-5 w-5 opacity-75" />
                        </div>
                      )}
                      {selectedModel && (
                        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[var(--media-scrim-strong)] via-[var(--media-scrim)] to-transparent pb-0.5 pt-2.5 px-1 pointer-events-none">
                          <span className="block truncate font-mono text-[8px] font-bold text-[var(--ink)] drop-shadow-[0_1px_2px_var(--overlay)]">
                            {selectedModel.version_name || "v1.0"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Title, Category & Specs */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="truncate min-w-0 block text-xs font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] group-focus-within:text-[var(--accent)] transition"
                          title={selectedModel?.title ?? "Select Basic Model"}
                        >
                          {selectedModel?.title ?? "Select Basic Model"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                        {selectedModel ? (
                          <span className="shrink-0 inline-flex items-center rounded-md bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--ink-faint)]">
                            {selectedModel.model_type}
                          </span>
                        ) : (
                          <p className="truncate min-w-0 text-[10px] text-[var(--ink-faint)]">
                            Click to choose a model from gallery
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Chevron */}
                    <div className="flex items-center shrink-0">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-[var(--ink-faint)] group-hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] group-focus-within:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] group-hover:text-[var(--accent)] group-focus-within:text-[var(--accent)] transition">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </button>
                {selectedModel &&
                  (() => {
                    const modelUrl = resolveModelGalleryUrl(
                      {
                        modelId: selectedModel.model_id,
                        title: selectedModel.title,
                        filename: selectedModel.filename,
                        fileId: selectedModel.file_id,
                      },
                      modelOptions,
                      publicModels,
                    );
                    if (!modelUrl) return null;
                    return (
                      <a
                        href={modelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View model in gallery"
                        title="View in Model Gallery"
                        className="flex items-center justify-center rounded-xl border border-[var(--line)] px-2.5 text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:text-[var(--accent)] transition shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    );
                  })()}
              </div>
            </div>
          )}

          {/* 2. LoRA Cards Section (Tensor.art layout & controls) */}
          <LoraStackPanel
            loras={loras}
            onLorasChange={onLorasChange}
            onOpenPicker={() => setLoraPickerOpen(true)}
            modelOptions={modelOptions}
            publicModels={publicModels}
            publicModelMap={publicModelMap}
            prompt={prompt}
            onPromptChange={onPromptChange}
            disabled={busy}
          />

          {/* 3. Embedding Cards Section */}
          {embeddings.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                  Embeddings
                </span>
              </div>
              {embeddings.map((emb) => {
                return (
                  <div
                    key={emb.id}
                    className="relative rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 transition hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-soft)] border border-[var(--line)] grid place-items-center">
                        <Wand2 className="h-5 w-5 text-[var(--ink-faint)]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <div className="flex items-center gap-1 min-w-0 flex-1 mr-1">
                            <span
                              className="truncate min-w-0 block text-xs font-semibold text-[var(--ink)]"
                              title={emb.title}
                            >
                              {emb.title}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEmbedding(emb.id)}
                            title="Remove Embedding"
                            className="ml-2 text-[var(--ink-faint)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)] transition p-0.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="relative flex-1 flex items-center">
                            {(() => {
                              const clamped = Math.max(
                                0,
                                Math.min(
                                  2,
                                  typeof emb.weight === "number"
                                    ? emb.weight
                                    : 1.0,
                                ),
                              );
                              const percent = Math.round((clamped / 2.0) * 100);
                              return (
                                <input
                                  type="range"
                                  min="0.0"
                                  max="2.0"
                                  step="0.05"
                                  value={clamped}
                                  onChange={(e) =>
                                    updateEmbeddingWeight(
                                      emb.id,
                                      parseFloat(e.target.value),
                                    )
                                  }
                                  style={{
                                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--surface-soft) ${percent}%, var(--surface-soft) 100%)`,
                                  }}
                                  className="workspace-range w-full"
                                />
                              );
                            })()}
                          </div>
                          <div className="flex h-6 min-w-[2.25rem] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-1.5 font-mono text-[11px] font-semibold text-[var(--ink)]">
                            {emb.weight.toFixed(1)}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              updateEmbeddingWeight(emb.id, emb.weight - 0.1)
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] active:scale-95 transition"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateEmbeddingWeight(emb.id, emb.weight + 0.1)
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] active:scale-95 transition"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Embedding Button */}
          <div>
            <button
              type="button"
              onClick={() => setEmbeddingPickerOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2 text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] transition active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Add Embedding Token</span>
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--line)] pt-4 space-y-4">
            {/* Format / Aspect Ratio */}
            <div>
              <AspectRatioSelector
                value={format}
                onChange={onFormatChange}
                options={FORMATS}
                disabled={busy}
                label="Aspect Ratio"
                columns={3}
              />

              {format === "custom" && (
                <>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="custom-width"
                        className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold"
                      >
                        Width
                      </label>
                      <input
                        id="custom-width"
                        type="number"
                        min="64"
                        max="4096"
                        step="8"
                        value={customWidth}
                        onChange={(e) => onCustomWidthChange(e.target.value)}
                        disabled={busy}
                        aria-invalid={customWidthInvalid}
                        aria-describedby={
                          customWidthInvalid
                            ? "custom-dimension-validation"
                            : undefined
                        }
                        className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="custom-height"
                        className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold"
                      >
                        Height
                      </label>
                      <input
                        id="custom-height"
                        type="number"
                        min="64"
                        max="4096"
                        step="8"
                        value={customHeight}
                        onChange={(e) => onCustomHeightChange(e.target.value)}
                        disabled={busy}
                        aria-invalid={customHeightInvalid}
                        aria-describedby={
                          customHeightInvalid
                            ? "custom-dimension-validation"
                            : undefined
                        }
                        className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                  {(customWidthInvalid || customHeightInvalid) && (
                    <p
                      id="custom-dimension-validation"
                      className="mt-1.5 text-[10px] text-[var(--danger)]"
                    >
                      Use 64–4096 pixels in multiples of 8.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Advanced Settings Accordion */}
            <AdvancedSamplingPanel
              idPrefix="text2img"
              seed={seed}
              onSeedChange={onSeedChange}
              steps={steps}
              onStepsChange={onStepsChange}
              cfg={cfg}
              onCfgChange={onCfgChange}
              sampler={samplerName}
              onSamplerChange={onSamplerNameChange}
              scheduler={scheduler}
              onSchedulerChange={onSchedulerChange}
              denoise={denoise}
              onDenoiseChange={onDenoiseChange}
              busy={busy}
              isOpen={advancedOpen}
              onToggleOpen={() => setAdvancedOpen((v) => !v)}
              showDenoise={true}
            />

            {/* Upscale Engine Panel */}
            <UpscalePanel
              config={activeUpscale}
              onChange={handleUpscaleChange}
              outputWidth={widthNum}
              outputHeight={heightNum}
            />

            {/* ADetailer Cascading Passes */}
            <DetailerPanel
              config={activeDetailerCfg}
              onChange={handleDetailerCfgChange}
              selectedModel={selectedModel}
            />
          </div>
        </div>
      )}

      {/* Sticky Bottom Generation Action Bar */}
      <div className="sticky bottom-0 z-20 shrink-0 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] backdrop-blur-md px-3.5 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.35)]">
        {/* Studio Pro Controls: Private Output Switch & Fast-Lane Status */}
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleTogglePrivate}
            className={`group inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold transition ${
              isPrivateActive
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_8px_rgba(213,240,111,0.15)]"
                : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:border-[var(--line-strong)]"
            }`}
            title={
              isProUser
                ? `Private Output: ${isPrivateActive ? "ENABLED (Confidential, hidden from gallery)" : "DISABLED (Visible in local gallery)"}`
                : "Private Output requires Solo Studio Pro"
            }
          >
            {isPrivateActive ? (
              <Lock className="h-3 w-3 text-[var(--accent)]" />
            ) : isProUser ? (
              <Eye className="h-3 w-3 opacity-60" />
            ) : (
              <Lock className="h-3 w-3 text-[var(--ink-faint)]" />
            )}
            <span>Private Output</span>
            {!isProUser && (
              <span className="rounded bg-[var(--accent)]/10 px-1 py-0.2 text-[8px] font-bold text-[var(--accent)] border border-[var(--accent)]/20">
                PRO
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
     Select Basic Model Modal (Tensor.art Gallery Grid & Filter System)
     ========================================================================= */}
      {modelPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 ">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 ">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--ink)]">
                  Select Basic Model
                </h3>
                <span className="rounded-xl bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-faint)]">
                  {baseModels.length} models
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModelPickerOpen(false)}
                className="rounded-xl p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-soft)] focus-visible:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search & Architecture Filter Tabs */}
            <div className="space-y-3 pt-3 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
                <input
                  type="text"
                  placeholder="Search basic models by title or filename…"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] py-2 pl-9 pr-8 text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--accent)]"
                />
                {modelSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setModelSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                {[
                  { id: "all", label: "All Types" },
                  { id: "Checkpoint", label: "Checkpoints" },
                  { id: "SVD", label: "SVD" },
                ].map((tab) => {
                  const active = modelCategoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setModelCategoryFilter(tab.id)}
                      className={`whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-semibold transition ${
                        active
                          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Models Cards Grid (Tensor.art visual style) */}
            <div className="max-h-96 overflow-y-auto space-y-2.5 py-2 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {baseModels
                  .filter((m) => {
                    if (
                      modelCategoryFilter !== "all" &&
                      m.model_type !== modelCategoryFilter
                    ) {
                      return false;
                    }
                    if (modelSearchQuery.trim()) {
                      const q = modelSearchQuery.toLowerCase();
                      const matchTitle = m.title.toLowerCase().includes(q);
                      const matchFile = m.filename.toLowerCase().includes(q);
                      if (!matchTitle && !matchFile) return false;
                    }
                    return true;
                  })
                  .map((m) => {
                    const key = `${m.model_id}:${m.version_id}:${m.file_id}`;
                    const isCurrent =
                      selectedModel &&
                      `${selectedModel.model_id}:${selectedModel.version_id}:${selectedModel.file_id}` ===
                        key;
                    const pub = publicModelMap.get(m.model_id);
                    const cover = resolveMediaUrl(
                      m.cover_url || pub?.cover_url,
                    );

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          onModelChange(key);
                          setModelPickerOpen(false);
                        }}
                        className={`group relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-[18px] border text-left transition-all duration-300 ease-out hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                          isCurrent
                            ? "border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
                            : "border-[var(--line)] bg-[var(--surface-soft)] hover:border-[var(--line-strong)]"
                        }`}
                      >
                        {/* Full-Bleed Cover Image with shimmer */}
                        {cover && (
                          <div className="absolute inset-0 shimmer opacity-50" />
                        )}
                        {cover ? (
                          <img
                            src={cover}
                            alt={m.title}
                            loading="lazy"
                            className="asset-zoom-media absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <div className="absolute inset-0 grid h-full w-full place-items-center bg-[var(--surface-soft)] text-[var(--accent)]">
                            <Box className="h-8 w-8 opacity-60" />
                          </div>
                        )}

                        {/* Atmospheric Bottom Gradient Scrim */}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--overlay)] via-[var(--media-scrim-strong)] via-50% to-transparent transition-opacity duration-300 ease-out group-hover:opacity-0 motion-reduce:transition-none" />

                        {/* Top Tag Overlays */}
                        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 pointer-events-none">
                          <span className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[9px] font-bold text-[var(--ink)] backdrop-blur-md uppercase tracking-wider">
                            {m.model_type === "Checkpoint"
                              ? "CKPT"
                              : m.model_type}
                          </span>
                          <span className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--ink-soft)] backdrop-blur-md">
                            {m.version_name || "v1.0"}
                          </span>
                        </div>

                        {/* Current Active Indicator Badge */}
                        {isCurrent && (
                          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-md border border-[var(--success)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-bold text-[var(--success)] shadow-sm">
                            <Check className="h-3 w-3" />
                            <span>Active</span>
                          </div>
                        )}

                        {/* Bottom Typography Overlay */}
                        <div className="relative z-10 p-3.5 flex flex-col justify-end w-full pointer-events-none">
                          <h4 className="truncate text-sm sm:text-base font-bold tracking-tight text-[var(--ink)] drop-shadow-sm group-hover:text-[var(--accent)] transition-colors motion-reduce:transition-none">
                            {m.title}
                          </h4>
                          <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--ink-soft)]">
                            {[
                              m.version_name || "v1.0",
                              pub?.category || m.model_type,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                          <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-[var(--line)] text-[10px]">
                            <span className="truncate text-[var(--ink-faint)] max-w-[65%]">
                              {pub?.base_model || m.model_type}
                            </span>
                            <span className="font-bold text-[var(--accent)] drop-shadow-sm">
                              {isCurrent ? "Current model" : "Select →"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>

              {baseModels.length === 0 && (
                <div className="py-12 text-center text-xs text-[var(--ink-faint)]">
                  <p>No installed basic models found in local gallery.</p>
                  <Link
                    href="/models"
                    className="mt-2 inline-block font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
                  >
                    Explore Public Models
                  </Link>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-faint)]">
              <span>Looking for more checkpoints?</span>
              <Link
                href="/models"
                onClick={() => setModelPickerOpen(false)}
                className="font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
              >
                Browse Models →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
     Add LoRA Adapter Modal (Tensor.art Compatibility & Grid System)
     ========================================================================= */}
      {loraPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 ">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 ">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--ink)]">
                  Add LoRA Adapter
                </h3>
                <span className="rounded-xl bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-faint)]">
                  {filteredModalLoras.length} available
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLoraPickerOpen(false)}
                className="rounded-xl p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-soft)] focus-visible:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter Bar: Compatibility Toggle + Search + Category Pills */}
            <div className="space-y-3 pt-3 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
                  <input
                    type="text"
                    placeholder="Search by title, trigger words, or filename…"
                    value={loraSearchQuery}
                    onChange={(e) => setLoraSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] py-2 pl-9 pr-8 text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--accent)]"
                  />
                  {loraSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLoraSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Tensor.art Signature: "Compatible with Base Model: {selectedModel.title}" Toggle */}
                {selectedModel && (
                  <label className="flex items-center gap-2 cursor-pointer select-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] transition">
                    <input
                      type="checkbox"
                      checked={onlyCompatibleLora}
                      onChange={(e) => setOnlyCompatibleLora(e.target.checked)}
                      className="h-3.5 w-3.5 rounded-xl border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <span className="text-[11px] font-semibold text-[var(--ink-soft)]">
                      Compatible with Base Model:{" "}
                      <span className="text-[var(--accent)] font-bold">
                        {selectedModel.title}
                      </span>
                    </span>
                  </label>
                )}
              </div>

              {/* Category Filter Pills (dynamically derived from installed LoRAs) */}
              {availableLoraItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pb-1">
                  {Array.from(
                    new Set([
                      "all",
                      ...availableLoraItems.map((item) =>
                        item.category.toLowerCase(),
                      ),
                    ]),
                  ).map((cat) => {
                    const active = loraCategoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setLoraCategoryFilter(cat)}
                        className={`capitalize whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-semibold transition ${
                          active
                            ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
                        }`}
                      >
                        {cat === "all" ? "All LoRAs" : cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* LoRA Cards Grid (Tensor.art visual style) */}
            <div className="max-h-96 overflow-y-auto space-y-2.5 py-2 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredModalLoras.map((item) => {
                  const isAdded = loras.some(
                    (l) =>
                      l.id === item.id ||
                      (item.modelId &&
                        l.modelId === item.modelId &&
                        l.fileId === item.fileId),
                  );

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 transition hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover: ${
                        isAdded ? "bg-[var(--surface-raised)]" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Thumbnail with shimmer */}
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] grid place-items-center">
                          {item.thumbnailUrl && (
                            <div className="absolute inset-0 shimmer opacity-40" />
                          )}
                          {item.thumbnailUrl ? (
                            <img
                              src={
                                resolveMediaUrl(item.thumbnailUrl) ||
                                item.thumbnailUrl
                              }
                              alt={item.title}
                              loading="lazy"
                              className="asset-zoom-media relative z-10 h-full w-full object-cover transition-opacity duration-300"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <Layers className="h-6 w-6 text-[var(--accent)] opacity-75" />
                          )}
                        </div>

                        {/* Title & Metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="truncate min-w-0 block text-xs font-bold text-[var(--ink)]"
                              title={item.title}
                            >
                              {item.title}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 min-w-0">
                            <span
                              className="shrink-0 max-w-[110px] truncate rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--accent)]"
                              title={item.baseModel}
                            >
                              {item.baseModel}
                            </span>
                            <span
                              className="shrink-0 max-w-[100px] truncate rounded-xl bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--ink-faint)]"
                              title={item.category}
                            >
                              {item.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Trigger Words Preview */}
                      {item.triggerWords && item.triggerWords.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1">
                          <span className="text-[9px] font-semibold text-[var(--ink-faint)] uppercase">
                            Triggers:
                          </span>
                          {item.triggerWords.map((tw) => (
                            <span
                              key={tw}
                              className="rounded-xl bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-faint)]"
                            >
                              {tw}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="mt-3 pt-2 border-t border-[var(--line)] flex items-center justify-between">
                        <span className="text-[10px] text-[var(--ink-faint)] truncate max-w-[150px]">
                          {item.baseModel || item.category || "LoRA"}
                        </span>
                        {isAdded ? (
                          <span className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-faint)]">
                            <Check className="h-3 w-3 text-[var(--accent)]" />
                            Added
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={loras.length >= 5}
                            onClick={() => handleAddLoraItem(item)}
                            className="rounded-xl bg-[var(--accent)] px-3 py-1 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] focus-visible:bg-[var(--accent-hover)] active:scale-95 disabled:opacity-40 transition"
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredModalLoras.length === 0 && (
                <div className="py-10 text-center text-xs text-[var(--ink-faint)] space-y-2">
                  {availableLoraItems.length === 0 ? (
                    <div>
                      <p>
                        No LoRA adapters installed in your local ComfyUI
                        gallery.
                      </p>
                      <Link
                        href="/models"
                        onClick={() => setLoraPickerOpen(false)}
                        className="mt-2 inline-block font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
                      >
                        Explore & Install LoRAs in Model Gallery →
                      </Link>
                    </div>
                  ) : (
                    <div>
                      <p>
                        No LoRAs found compatible with Base Model
                        {selectedModel ? (
                          <>
                            {" "}
                            <span className="font-bold text-[var(--ink)]">
                              {selectedModel.title}
                            </span>
                          </>
                        ) : null}
                        .
                      </p>
                      {onlyCompatibleLora && (
                        <button
                          type="button"
                          onClick={() => setOnlyCompatibleLora(false)}
                          className="mt-1 inline-block font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
                        >
                          Show all installed LoRAs regardless of Base Model
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-faint)]">
              <span>Looking for more LoRA models?</span>
              <Link
                href="/models"
                onClick={() => setLoraPickerOpen(false)}
                className="font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
              >
                Browse Model Gallery →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Embedding Picker Modal */}
      {embeddingPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 ">
          <div className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 ">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
              <h3 className="text-base font-bold text-[var(--ink)]">
                Add Embedding
              </h3>
              <button
                type="button"
                onClick={() => setEmbeddingPickerOpen(false)}
                className="rounded-xl p-1 text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-[var(--ink-faint)]">
                Type the name or trigger word of an embedding / textual
                inversion token:
              </p>
              <input
                type="text"
                placeholder="e.g. easynegative, badhandv4…"
                id="embedding-name-input"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-2.5 text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const target = e.currentTarget;
                    if (target.value.trim()) {
                      onEmbeddingsChange([
                        ...embeddings,
                        {
                          id: `emb-${Date.now()}`,
                          title: target.value.trim(),
                          baseModel: baseModelTag || "SDXL",
                          weight: 0.5,
                        },
                      ]);
                      setEmbeddingPickerOpen(false);
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById(
                    "embedding-name-input",
                  ) as HTMLInputElement | null;
                  if (input && input.value.trim()) {
                    onEmbeddingsChange([
                      ...embeddings,
                      {
                        id: `emb-${Date.now()}`,
                        title: input.value.trim(),
                        baseModel: baseModelTag || "SDXL",
                        weight: 0.5,
                      },
                    ]);
                    setEmbeddingPickerOpen(false);
                  }
                }}
                className="w-full rounded-xl bg-[var(--accent)] py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] focus-visible:bg-[var(--accent-hover)] transition"
              >
                Add Embedding Token
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hardware Envelope Pro Modal */}
      {hardwareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[var(--line)] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_16px_rgba(213,240,111,0.25)]">
                  <Zap className="h-5 w-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--ink)] tracking-tight">
                    Solo Studio Pro: 4K Synthesis & High-Step Pipelines
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold">
                    Hardware Envelope Guard
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHardwareModalOpen(false)}
                className="rounded-lg p-1 text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="py-4 space-y-4">
              <p className="text-xs text-[var(--ink-soft)] leading-relaxed">
                Standard Creator compute is bounded to{" "}
                <strong className="text-[var(--ink)]">1024×1024</strong>{" "}
                resolution and{" "}
                <strong className="text-[var(--ink)]">35 steps</strong> to
                ensure shared VRAM isolation. Extended pipelines require
                Solo Studio Pro.
              </p>

              {/* Current Request Exceeded Diagnostics */}
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 space-y-2">
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-faint)] uppercase block">
                  Parameter Envelope Breakdown
                </span>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-[var(--line)] pb-1">
                    <span className="text-[var(--ink-faint)]">Dimensions:</span>
                    <span
                      className={
                        widthNum > 1024 || heightNum > 1024
                          ? "text-[var(--accent)] font-bold"
                          : "text-[var(--ink)]"
                      }
                    >
                      {widthNum} × {heightNum} px{" "}
                      {widthNum > 1024 || heightNum > 1024
                        ? "(> 1024 Limit)"
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--line)] pb-1">
                    <span className="text-[var(--ink-faint)]">
                      Sampling Steps:
                    </span>
                    <span
                      className={
                        stepsNum > 35
                          ? "text-[var(--accent)] font-bold"
                          : "text-[var(--ink)]"
                      }
                    >
                      {stepsNum} {stepsNum > 35 ? "(> 35 Limit)" : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pro Capabilities Specs */}
              <div className="space-y-2">
                <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase block">
                  Solo Studio Pro Capabilities
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5">
                    <span className="block font-bold text-[var(--ink)]">
                      ⚡ Fast-Lane Priority
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      Instant ComfyUI queue dispatch (~4s)
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5">
                    <span className="block font-bold text-[var(--ink)]">
                      🖼 4K Synthesis
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      Up to 4096×4096 and 100 steps
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5">
                    <span className="block font-bold text-[var(--ink)]">
                      🔒 Private Output
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      Keep generations off public feeds
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5">
                    <span className="block font-bold text-[var(--ink)]">
                      🎛 5x LoRA Enclaves
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      High-concurrency adapter chaining
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--line)] pt-4">
              <button
                type="button"
                onClick={() => {
                  if (widthNum > 1024) onCustomWidthChange("1024");
                  if (heightNum > 1024) onCustomHeightChange("1024");
                  if (stepsNum > 35) onStepsChange("30");
                  setHardwareModalOpen(false);
                }}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition"
              >
                Clamp to Standard (1024px / 30 steps)
              </button>
              <button
                type="button"
                onClick={() => {
                  switchRoleDemo("pro_creator");
                  setHardwareModalOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition shadow-[0_0_12px_rgba(213,240,111,0.25)]"
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                <span>Unlock Pro (Local Studio Preview)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Private Output Pro Upsell Modal */}
      {privateUpsellOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--line)] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_16px_rgba(213,240,111,0.25)]">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--ink)] tracking-tight">
                    Private Generation Enclave
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold">
                    Solo Studio Pro Exclusive
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPrivateUpsellOpen(false)}
                className="rounded-lg p-1 text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-[var(--ink-soft)] leading-relaxed">
                By default, outputs are saved to your local gallery and eligible
                for community feeds.{" "}
                <strong className="text-[var(--ink)]">Private Output</strong>{" "}
                guarantees your generated artwork, workflow graph, and prompt
                tokens remain strictly confidential.
              </p>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-xs text-[var(--ink-faint)]">
                🔒 Omit prompts and seed metadata from public discovery feeds
                and shared model showcase reels.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--line)] pt-4">
              <button
                type="button"
                onClick={() => setPrivateUpsellOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  switchRoleDemo("pro_creator");
                  setPrivateUpsellOpen(false);
                  if (onPrivateChange) {
                    onPrivateChange(true);
                  } else {
                    setInternalPrivate(true);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition shadow-[0_0_12px_rgba(213,240,111,0.25)]"
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                <span>Unlock Pro (Local Studio Preview)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}