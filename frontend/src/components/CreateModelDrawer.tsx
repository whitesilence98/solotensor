"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  Cpu,
  FileArchive,
  FileCode2,
  FileImage,
  FolderDown,
  HardDrive,
  Info,
  Layers3,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Plus,
  Sliders,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  X,
  Zap,
  CheckCheck,
  Copy,
} from "lucide-react";
import {
  api,
  type CreatorModel,
  type CreatorModelCategory,
  type CreatorModelPayload,
  type CreatorModelType,
  type InstalledGalleryModel,
  type LocalModelSummary,
  type ModelPrecision,
  type ModelVisibility,
  type WorkflowTemplateInfo,
} from "@/lib/api";
import TensorModelCard from "@/components/TensorModelCard";
import CustomSelect from "@/components/CustomSelect";
import HierarchicalSelect from "@/components/HierarchicalSelect";
import {
  BASE_MODEL_ARCHITECTURES,
  getFirstOptionValue,
  isArchitectureInList,
} from "@/lib/baseModelArchitectures";
import { useAuth } from "@/lib/auth-context";

const modelTypes: CreatorModelType[] = [
  "Checkpoint",
  "Hyper Network",
  "Embedding",
  "Aesthetic Gradient",
  "LoRA",
  "LoKr",
  "LoCon",
  "ControlNet",
  "Poses",
  "Wildcards",
  "LyCORIS",
  "SVD",
  "Motion LoRA",
  "VAE",
  "DoRA",
  "StyleModel",
];

export type ModelTierType =
  | "Core Base"
  | "Adapter"
  | "Autoencoder"
  | "Guidance"
  | "Inversion"
  | "Prompt Asset";

export function getModelTier(t: string): ModelTierType {
  switch (t) {
    case "Checkpoint":
    case "SVD":
    case "Diffusion Model":
    case "UNET":
      return "Core Base";
    case "LoRA":
    case "LoKr":
    case "LoCon":
    case "LyCORIS":
    case "DoRA":
    case "Motion LoRA":
      return "Adapter";
    case "VAE":
      return "Autoencoder";
    case "ControlNet":
    case "Poses":
    case "StyleModel":
      return "Guidance";
    case "Embedding":
    case "Aesthetic Gradient":
    case "Hyper Network":
      return "Inversion";
    case "Wildcards":
      return "Prompt Asset";
    default:
      return "Core Base";
  }
}

export const isPromptableModelType = (t: string) =>
  [
    "Checkpoint",
    "SVD",
    "LoRA",
    "LoKr",
    "LoCon",
    "LyCORIS",
    "DoRA",
    "Motion LoRA",
    "Embedding",
    "Aesthetic Gradient",
    "Hyper Network",
  ].includes(t);

const isAdapterModelType = (t: string) =>
  ["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(t);

const categories: CreatorModelCategory[] = [
  "General",
  "Character",
  "Style",
  "Concept",
  "Clothing",
  "Pose",
];

function formatBytes(size: number): string {
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(2)} MB`;
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
}

export interface StagedModelFile {
  id: string;
  kind: "upload" | "local";
  filename: string;
  size: number;
  precision: ModelPrecision;
  file?: File;
  local?: LocalModelSummary;
}

export interface StagedModelVersion {
  id: string;
  name: string;
  files: StagedModelFile[];
}

export interface StagedShowcaseItem {
  id: string;
  file: File;
  previewUrl: string;
}

export interface CreateModelDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (model: CreatorModel) => void;
}

export default function CreateModelDrawer({
  open,
  onClose,
  onCreated,
}: CreateModelDrawerProps) {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Auth gate interception on drawer open
  useEffect(() => {
    if (open && !isAuthenticated) {
      openAuthModal("create_model");
    }
  }, [open, isAuthenticated, openAuthModal]);

  // Step 1: Identity & Architecture
  const [title, setTitle] = useState("");
  const [modelType, setModelType] = useState<CreatorModelType>("Checkpoint");
  const [category, setCategory] = useState<CreatorModelCategory>("General");
  const [baseModel, setBaseModel] = useState(() => getFirstOptionValue(BASE_MODEL_ARCHITECTURES));
  const [customBaseModel, setCustomBaseModel] = useState("");

  // Base Model link for LoRA / LyCORIS
  const [selectedBaseKey, setSelectedBaseKey] = useState("");
  const [baseOptions, setBaseOptions] = useState<InstalledGalleryModel[]>([]);
  const [baseOptionsLoading, setBaseOptionsLoading] = useState(false);

  // Dynamic Compatibility: VAE (from ComfyUI models/vae/ & workflow)
  const [vae, setVae] = useState("");
  const [isCustomVae, setIsCustomVae] = useState(false);
  const [customVae, setCustomVae] = useState("");
  const [vaeFiles, setVaeFiles] = useState<string[]>([]);
  const [vaeLoading, setVaeLoading] = useState(false);
  const [vaeError, setVaeError] = useState<string | null>(null);

  // Dynamic Compatibility: Text Encoder (from ComfyUI models/text_encoders/ & workflow)
  const [textEncoder, setTextEncoder] = useState("");
  const [isCustomEncoder, setIsCustomEncoder] = useState(false);
  const [customEncoder, setCustomEncoder] = useState("");
  const [encoderFiles, setEncoderFiles] = useState<string[]>([]);
  const [encoderLoading, setEncoderLoading] = useState(false);
  const [encoderError, setEncoderError] = useState<string | null>(null);

  // Dynamic Compatibility: CLIP Type (from ComfyUI clip-options & workflow)
  const [clipType, setClipType] = useState("");
  const [clipTypes, setClipTypes] = useState<string[]>([]);
  const [clipTypesLoading, setClipTypesLoading] = useState(false);

  // Polymorphic conditioning stack state
  const [showAdapterOverride, setShowAdapterOverride] = useState(false);
  const [latentProfile, setLatentProfile] = useState("16-Channel Latent (FLUX.1 / SD3.5 / SD3 - ae.sft, ae.safetensors)");
  const [preprocessorModality, setPreprocessorModality] = useState("Canny Edge");
  const [inversionDimension, setInversionDimension] = useState("4096-dim (FLUX.1 / SD3 T5-XXL)");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleCopyToken = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedToken(text);
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  // Backend reference info from active template
  const [workflowInfo, setWorkflowInfo] = useState<WorkflowTemplateInfo | null>(null);

  // Step 2: Presets & Generation Parameters
  const [triggerWords, setTriggerWords] = useState<string[]>([]);
  const [triggerInput, setTriggerInput] = useState("");
  const [sampler, setSampler] = useState("DPM++ 2M Karras");
  const [stepsMin, setStepsMin] = useState(20);
  const [stepsMax, setStepsMax] = useState(30);
  const [cfgMin, setCfgMin] = useState(3.5);
  const [cfgMax, setCfgMax] = useState(7.0);
  const [clipSkip, setClipSkip] = useState(1);
  const [recommendedPrompt, setRecommendedPrompt] = useState("");
  const [recommendedNegative, setRecommendedNegative] = useState("");

  // Step 3: Files, Versions & Weights
  const [versions, setVersions] = useState<StagedModelVersion[]>([
    {
      id: "ver-1",
      name: "v1.0",
      files: [],
    },
  ]);
  const [activeVersionId, setActiveVersionId] = useState<string>("ver-1");
  const [isEditingVersionName, setIsEditingVersionName] = useState(false);
  const [versionNameInput, setVersionNameInput] = useState("v1.0");
  const [selectedPrecision, setSelectedPrecision] = useState<ModelPrecision>("FP16");

  const [showLocalPicker, setShowLocalPicker] = useState(false);
  const [vaultFilter, setVaultFilter] = useState<"all" | "checkpoints" | "diffusion_models">("all");
  const [localSearch, setLocalSearch] = useState("");
  const [localFiles, setLocalFiles] = useState<LocalModelSummary[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const activeVersion = useMemo(() => {
    return versions.find((v) => v.id === activeVersionId) || versions[0];
  }, [versions, activeVersionId]);

  const isModularBackbone = useMemo(() => {
    if (!activeVersion?.files?.length) return false;
    return activeVersion.files.some((file) => {
      if (file.local?.category === "diffusion_models") return true;
      const lower = file.filename.toLowerCase();
      return (
        lower.includes("unet") ||
        /(?:^|[^a-z0-9])dit(?:[^a-z0-9]|$)/i.test(lower) ||
        lower.includes("transformer") ||
        lower.includes("diffusion_pytorch_model") ||
        lower.includes("diffusion_model")
      );
    });
  }, [activeVersion?.files]);

  const totalFilesCount = useMemo(() => {
    return versions.reduce((sum, v) => sum + v.files.length, 0);
  }, [versions]);

  const addVersion = () => {
    const nextNum = versions.length + 1;
    const nextName = `v${nextNum}.0`;
    const newVer: StagedModelVersion = {
      id: `ver-${Date.now()}`,
      name: nextName,
      files: [],
    };
    setVersions((prev) => [...prev, newVer]);
    setActiveVersionId(newVer.id);
    setVersionNameInput(nextName);
    setIsEditingVersionName(false);
  };

  const removeVersion = (verId: string) => {
    if (versions.length <= 1) return;
    const remaining = versions.filter((v) => v.id !== verId);
    setVersions(remaining);
    if (activeVersionId === verId) {
      setActiveVersionId(remaining[0].id);
      setVersionNameInput(remaining[0].name);
      setIsEditingVersionName(false);
    }
  };

  const startRenameVersion = () => {
    setVersionNameInput(activeVersion.name);
    setIsEditingVersionName(true);
  };

  const saveVersionName = () => {
    const clean = versionNameInput.trim() || activeVersion.name;
    setVersions((prev) =>
      prev.map((v) => (v.id === activeVersion.id ? { ...v, name: clean } : v)),
    );
    setIsEditingVersionName(false);
  };

  const addUploadedFile = (file: File) => {
    const newFile: StagedModelFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "upload",
      filename: file.name,
      size: file.size,
      precision: selectedPrecision,
      file,
    };
    setVersions((prev) =>
      prev.map((v) =>
        v.id === activeVersion.id ? { ...v, files: [...v.files, newFile] } : v,
      ),
    );
  };

  const addLocalFile = (item: LocalModelSummary) => {
    const exists = activeVersion.files.some(
      (f) =>
        f.kind === "local" &&
        f.local?.filename === item.filename &&
        f.local?.category === item.category,
    );
    if (exists) return;

    const newFile: StagedModelFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "local",
      filename: item.filename,
      size: item.size,
      precision: selectedPrecision,
      local: item,
    };
    setVersions((prev) =>
      prev.map((v) =>
        v.id === activeVersion.id ? { ...v, files: [...v.files, newFile] } : v,
      ),
    );
    setShowLocalPicker(false);
  };

  const removeFile = (fileId: string) => {
    setVersions((prev) =>
      prev.map((v) =>
        v.id === activeVersion.id
          ? { ...v, files: v.files.filter((f) => f.id !== fileId) }
          : v,
      ),
    );
  };

  const updateFilePrecision = (fileId: string, precision: ModelPrecision) => {
    setVersions((prev) =>
      prev.map((v) =>
        v.id === activeVersion.id
          ? {
              ...v,
              files: v.files.map((f) =>
                f.id === fileId ? { ...f, precision } : f,
              ),
            }
          : v,
      ),
    );
  };

  // Step 4: Showcase & Permissions
  const [showcaseFiles, setShowcaseFiles] = useState<StagedShowcaseItem[]>([]);
  const [thumbnailId, setThumbnailId] = useState<string | null>(null);
  const [isDraggingShowcase, setIsDraggingShowcase] = useState(false);
  const [visibility, setVisibility] = useState<ModelVisibility>("Public");
  const [commercial, setCommercial] = useState(true);
  const [sellModel, setSellModel] = useState(false);
  const [remix, setRemix] = useState(false);
  const [generationServices, setGenerationServices] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [creditRequired, setCreditRequired] = useState(true);

  const activeThumbnail = useMemo(() => {
    if (showcaseFiles.length === 0) return null;
    return showcaseFiles.find((s) => s.id === thumbnailId) || showcaseFiles[0];
  }, [showcaseFiles, thumbnailId]);

  const coverPreviewUrl = activeThumbnail ? activeThumbnail.previewUrl : null;

  const addShowcaseFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const newItems: StagedShowcaseItem[] = list.map((f) => ({
      id: `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));

    setShowcaseFiles((prev) => {
      const updated = [...prev, ...newItems];
      if (!thumbnailId && updated.length > 0) {
        setThumbnailId(updated[0].id);
      }
      return updated;
    });
  };

  const removeShowcaseItem = (id: string) => {
    setShowcaseFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      const remaining = prev.filter((item) => item.id !== id);
      if (thumbnailId === id) {
        setThumbnailId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  const setAsThumbnail = (id: string) => {
    setThumbnailId(id);
  };

  // Submission State
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const showcaseInputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
    }
  }, [open]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      showcaseFiles.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  // Escape key close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, onClose]);

  // ComfyUI category resolution
  const comfyCategory = useMemo(() => {
    switch (modelType) {
      case "Checkpoint":
      case "SVD":
        return "checkpoints";
      case "Hyper Network":
        return "hypernetworks";
      case "Embedding":
      case "Aesthetic Gradient":
        return "embeddings";
      case "LoRA":
      case "LoKr":
      case "LoCon":
      case "LyCORIS":
      case "DoRA":
      case "Motion LoRA":
        return "loras";
      case "ControlNet":
        return "controlnet";
      case "Poses":
        return "poses";
      case "Wildcards":
        return "wildcards";
      case "VAE":
        return "vae";
      case "StyleModel":
        return "style_models";
      default:
        return "checkpoints";
    }
  }, [modelType]);

  // Scan local ComfyUI models when picker opens
  useEffect(() => {
    if (!showLocalPicker || !open) return;
    let cancelled = false;
    setLocalLoading(true);
    setLocalError(null);
    const fetchPromises =
      modelType === "Checkpoint"
        ? [
            api.listLocalModels(localSearch, "checkpoints"),
            api.listLocalModels(localSearch, "diffusion_models"),
          ]
        : [api.listLocalModels(localSearch, comfyCategory)];

    Promise.allSettled(fetchPromises)
      .then((results) => {
        if (!cancelled) {
          const combinedItems: LocalModelSummary[] = [];
          for (const res of results) {
            if (res.status === "fulfilled" && res.value.items) {
              combinedItems.push(...res.value.items);
            }
          }
          // Deduplicate by category + filename
          const seen = new Set<string>();
          const deduped = combinedItems.filter((item) => {
            const key = `${item.category}/${item.filename}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setLocalFiles(deduped);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLocalFiles([]);
          setLocalError(
            err instanceof Error ? err.message : "Could not scan ComfyUI files",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showLocalPicker, localSearch, comfyCategory, modelType, open]);

  // Load ComfyUI local models & workflow info when drawer opens
  const refreshComfyEnclave = () => {
    // 1. Scan VAE files from local ComfyUI directory and live ComfyUI instance
    setVaeLoading(true);
    setVaeError(null);
    Promise.allSettled([
      api.listLocalModels("", "vae"),
      api.getModels("vae"),
    ])
      .then(([localRes, comfyRes]) => {
        const found = new Set<string>();
        if (localRes.status === "fulfilled" && localRes.value?.items) {
          localRes.value.items.forEach((x) => {
            if (x.filename) found.add(x.filename);
          });
        }
        if (comfyRes.status === "fulfilled" && Array.isArray(comfyRes.value)) {
          comfyRes.value.forEach((x) => {
            if (x) found.add(x);
          });
        }
        setVaeFiles(Array.from(found));
      })
      .catch((err) =>
        setVaeError(err instanceof Error ? err.message : "Could not scan ComfyUI VAE directory"),
      )
      .finally(() => setVaeLoading(false));

    // 2. Scan Text Encoder files from local ComfyUI directory and live ComfyUI instance
    setEncoderLoading(true);
    setEncoderError(null);
    Promise.allSettled([
      api.listLocalModels("", "text_encoders"),
      api.getModels("text_encoders"),
    ])
      .then(([localRes, comfyRes]) => {
        const found = new Set<string>();
        if (localRes.status === "fulfilled" && localRes.value?.items) {
          localRes.value.items.forEach((x) => {
            if (x.filename) found.add(x.filename);
          });
        }
        if (comfyRes.status === "fulfilled" && Array.isArray(comfyRes.value)) {
          comfyRes.value.forEach((x) => {
            if (x) found.add(x);
          });
        }
        setEncoderFiles(Array.from(found));
      })
      .catch((err) =>
        setEncoderError(
          err instanceof Error ? err.message : "Could not scan ComfyUI text encoders directory",
        ),
      )
      .finally(() => setEncoderLoading(false));

    // 3. Scan CLIP conditioning types and additional encoders
    setClipTypesLoading(true);
    api
      .getClipOptions()
      .then((res) => {
        if (res?.types?.length) setClipTypes(res.types);
        if (res?.encoders?.length) {
          setEncoderFiles((prev) => {
            const combined = [...prev];
            res.encoders.forEach((enc) => {
              if (!combined.includes(enc)) combined.push(enc);
            });
            return combined;
          });
        }
      })
      .catch(() => {})
      .finally(() => setClipTypesLoading(false));

    // 4. Load Selectable Base Models (Installed Checkpoints & Diffusion models)
    setBaseOptionsLoading(true);
    api
      .listSelectableModels()
      .then((items) => {
        setBaseOptions(
          items.filter(
            (item) => item.model_type === "Checkpoint" || item.model_type === "SVD",
          ),
        );
      })
      .catch(() => {})
      .finally(() => setBaseOptionsLoading(false));

    // 5. Query default model configuration from active backend template
    api
      .getWorkflowTemplateInfo()
      .then((info) => {
        if (info?.has_template) {
          setWorkflowInfo(info);
          applyWorkflowDefaults(info);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (open) {
      refreshComfyEnclave();
    }
  }, [open]);

  // Apply reference node values from backend template
  const applyWorkflowDefaults = (info: WorkflowTemplateInfo) => {
    if (info.vae_name) {
      setVae(info.vae_name);
    }
    if (info.clip_name) {
      setTextEncoder(info.clip_name);
    }
    if (info.base_architecture && isArchitectureInList(info.base_architecture, BASE_MODEL_ARCHITECTURES)) {
      setBaseModel(info.base_architecture);
    }
    if (info.sampler_name) {
      setSampler(info.sampler_name);
    }
    if (typeof info.cfg === "number") {
      setCfgMin(Math.max(1, info.cfg - 1));
      setCfgMax(info.cfg);
    }
    if (typeof info.steps === "number") {
      setStepsMin(Math.max(1, info.steps - 5));
      setStepsMax(info.steps);
    }
    if (info.prompt) {
      setRecommendedPrompt(info.prompt);
    }
    if (info.negative_prompt) {
      setRecommendedNegative(info.negative_prompt);
    }
  };

  // Base model select handler for LoRA / LyCORIS
  const onSelectBaseModel = (key: string) => {
    setSelectedBaseKey(key);
    const chosen = baseOptions.find(
      (item) => `${item.model_id}:${item.version_id}:${item.file_id}` === key,
    );
    if (chosen) {
      if (chosen.filename.toLowerCase().includes("flux")) {
        setBaseModel("FLUX.1");
      } else if (chosen.filename.toLowerCase().includes("krea")) {
        setBaseModel("Krea-2");
      } else if (
        chosen.filename.toLowerCase().includes("z-image") ||
        chosen.filename.toLowerCase().includes("z_image")
      ) {
        setBaseModel("Z-Image");
      } else if (chosen.filename.toLowerCase().includes("wan")) {
        setBaseModel("Wan2.1");
      }
      if (chosen.vae) setVae(chosen.vae);
      if (chosen.text_encoder) setTextEncoder(chosen.text_encoder);
      if (chosen.clip_type) setClipType(chosen.clip_type);
    }
  };

  // Dynamic VAE options from ComfyUI enclave & workflow nodes
  const vaeOptions = useMemo(() => {
    const list: string[] = [];
    if (workflowInfo?.vae_name && !list.includes(workflowInfo.vae_name)) {
      list.push(workflowInfo.vae_name);
    }
    vaeFiles.forEach((name) => {
      if (!list.includes(name)) list.push(name);
    });
    // Ensure standard .safetensors & .sft options are readily available
    const standardVaers = ["ae.safetensors", "ae.sft"];
    standardVaers.forEach((std) => {
      if (!list.includes(std)) list.push(std);
    });
    return list;
  }, [workflowInfo?.vae_name, vaeFiles]);

  // Dynamic Text Encoder options from ComfyUI enclave & workflow nodes
  const encoderOptions = useMemo(() => {
    const list: string[] = [];
    if (workflowInfo?.clip_name && !list.includes(workflowInfo.clip_name)) {
      list.push(workflowInfo.clip_name);
    }
    encoderFiles.forEach((name) => {
      if (!list.includes(name)) list.push(name);
    });
    return list;
  }, [workflowInfo?.clip_name, encoderFiles]);

  // Dynamic CLIP conditioning types (natural order, unpinned)
  const clipTypeOptions = useMemo(() => {
    const defaultTypes = [
      "stable_diffusion",
      "sdxl",
      "sd3",
      "flux2",
      "wan",
      "lumina2",
      "qwen_image",
      "krea2",
    ];
    const source = clipTypes.length ? clipTypes : defaultTypes;
    const list: string[] = [];
    source.forEach((name) => {
      if (!list.includes(name)) list.push(name);
    });
    if (workflowInfo?.clip_type && !list.includes(workflowInfo.clip_type)) {
      list.push(workflowInfo.clip_type);
    }
    return list;
  }, [workflowInfo?.clip_type, clipTypes]);

  // Auto-select first available option as default
  useEffect(() => {
    if (vaeOptions.length > 0 && (!vae || (!vaeOptions.includes(vae) && !isCustomVae))) {
      setVae(vaeOptions[0]);
    }
  }, [vaeOptions, vae, isCustomVae]);

  useEffect(() => {
    if (encoderOptions.length > 0 && (!textEncoder || (!encoderOptions.includes(textEncoder) && !isCustomEncoder))) {
      setTextEncoder(encoderOptions[0]);
    }
  }, [encoderOptions, textEncoder, isCustomEncoder]);

  useEffect(() => {
    if (clipTypeOptions.length > 0 && (!clipType || !clipTypeOptions.includes(clipType))) {
      setClipType(clipTypeOptions[0]);
    }
  }, [clipTypeOptions, clipType]);


  // Trigger word helper
  const addTriggerWord = () => {
    const clean = triggerInput.trim();
    if (clean && !triggerWords.includes(clean)) {
      setTriggerWords([...triggerWords, clean]);
    }
    setTriggerInput("");
  };

  // Resolved Compatibility values
  const resolvedBaseModel =
    baseModel === "Other / Custom" || baseModel === "Other"
      ? customBaseModel.trim() || "Universal"
      : baseModel;

  const resolvedVae = (isCustomVae ? customVae.trim() : vae.trim()) || null;

  const resolvedEncoder = (isCustomEncoder ? customEncoder.trim() : textEncoder.trim()) || null;

  const resolvedClipType = clipType.trim() || null;

  // Submission Pipeline
  const submit = async () => {
    if (!isAuthenticated) {
      openAuthModal("create_model");
      return;
    }

    const firstStagedFile = versions[0]?.files[0];
    const modelTitle =
      title.trim() ||
      (firstStagedFile
        ? firstStagedFile.filename.replace(/\.[^/.]+$/, "")
        : "Untitled model");

    if (!isAuthenticated) {
      openAuthModal("create_model");
      setError("Please sign in before publishing your model.");
      return;
    }

    if (totalFilesCount === 0) {
      setError("Please attach at least one weights file (.safetensors / .sft / .ckpt) before creating the model.");
      setStep(3);
      return;
    }

    setBusy(true);
    setError(null);

    const selectedBase = baseOptions.find(
      (item) => `${item.model_id}:${item.version_id}:${item.file_id}` === selectedBaseKey,
    );

    const currentTier = getModelTier(modelType);
    let resolvedVaePayload: string | null = null;
    let resolvedEncoderPayload: string | null = null;
    let resolvedClipPayload: string | null = null;

    if (currentTier === "Core Base") {
      resolvedVaePayload = resolvedVae;
      resolvedEncoderPayload = resolvedEncoder;
      resolvedClipPayload = resolvedClipType;
    } else if (currentTier === "Adapter") {
      if (showAdapterOverride) {
        resolvedVaePayload = resolvedVae;
        resolvedEncoderPayload = resolvedEncoder;
        resolvedClipPayload = resolvedClipType;
      } else {
        resolvedVaePayload = selectedBase?.vae || null;
        resolvedEncoderPayload = selectedBase?.text_encoder || null;
        resolvedClipPayload = selectedBase?.clip_type || null;
      }
    } else {
      // Autoencoder, Guidance, Inversion, Prompt Asset
      resolvedVaePayload = null;
      resolvedEncoderPayload = null;
      resolvedClipPayload = null;
    }

    // Co-dependency rule: text_encoder and clip_type must either both be non-null or both be null
    if (!resolvedEncoderPayload || !resolvedClipPayload) {
      resolvedEncoderPayload = null;
      resolvedClipPayload = null;
    }

    try {
      const payload: CreatorModelPayload = {
        title: modelTitle,
        category,
        model_type: modelType,
        tags: [],
        compatibility: {
          base_model:
            modelType === "Wildcards" && (baseModel === "Allegro" || !baseModel)
              ? "Universal"
              : resolvedBaseModel,
          base_model_id: selectedBase?.model_id ?? null,
          base_version_id: selectedBase?.version_id ?? null,
          base_file_id: selectedBase?.file_id ?? null,
          vae: resolvedVaePayload,
          text_encoder: resolvedEncoderPayload,
          clip_type: resolvedClipPayload,
          parent_model: null,
        },
        generation: {
          trigger_words:
            isAdapterModelType(modelType) ? triggerWords : [],
          sampler,
          steps_min: stepsMin,
          steps_max: stepsMax,
          cfg_min: cfgMin,
          cfg_max: cfgMax,
          clip_skip: clipSkip,
          prompt: recommendedPrompt,
          negative_prompt: recommendedNegative,
        },
        permissions: {
          commercial,
          sell_model: sellModel,
          remix,
          generation_services: generationServices,
          allow_download: allowDownload,
          credit_required: creditRequired,
        },
        visibility: "Private", // will publish right after
      };

      // 1. Create model metadata
      const created = await api.createCreatorModel(payload);
      const initialVerId = created.versions[0]?.version_id;

      // 2. Attach weights across all staged versions
      for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        let targetVerId: string | null = null;
        if (i === 0) {
          targetVerId = initialVerId;
        } else {
          const res = await api.createModelVersion(created.model_id, v.name);
          targetVerId = res.version_id;
        }

        if (targetVerId) {
          for (const f of v.files) {
            if (f.kind === "local" && f.local) {
              await api.importLocalModelFile(
                created.model_id,
                targetVerId,
                f.local.category,
                f.local.filename,
                f.precision,
              );
            } else if (f.kind === "upload" && f.file) {
              await api.uploadModelFile(
                created.model_id,
                targetVerId,
                f.file,
                f.precision,
              );
            }
          }
        }
      }

      // 3. Attach showcase thumbnail & gallery samples (thumbnail first)
      if (initialVerId && showcaseFiles.length > 0) {
        const thumbnailItem =
          showcaseFiles.find((s) => s.id === thumbnailId) || showcaseFiles[0];
        const otherItems = showcaseFiles.filter((s) => s.id !== thumbnailItem.id);

        // Upload primary thumbnail first so backend resolves it as the cover
        await api.uploadModelSample(
          created.model_id,
          initialVerId,
          thumbnailItem.file,
          {
            role: "showcase",
            is_cover: true,
          },
        );

        // Upload any remaining showcase images
        for (const item of otherItems) {
          await api.uploadModelSample(
            created.model_id,
            initialVerId,
            item.file,
            {
              role: "gallery",
              is_cover: false,
            },
          );
        }
      }

      // 4. Publish if selected
      const finalModel =
        visibility === "Public"
          ? await api.publishCreatorModel(created.model_id, "Public")
          : created;

      if (onCreated) {
        onCreated(finalModel);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create model");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const currentDisplayTitle = title.trim() || "Untitled model";

  const stepsList = [
    { s: 1 as const, label: "Identity & Arch", num: "01", icon: Cpu },
    { s: 2 as const, label: "Weights & Versions", num: "02", icon: HardDrive },
    { s: 3 as const, label: "Showcase & Governance", num: "03", icon: FileImage },
  ];

  const activeStepIndex = stepsList.findIndex((item) => item.s === step);
  const currentStepNumber = activeStepIndex !== -1 ? activeStepIndex + 1 : 1;
  const totalSteps = stepsList.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publish Creator Model"
      className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={drawerRef}
        className="relative flex h-full w-full max-w-4xl lg:max-w-5xl flex-col border-l border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* Header Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--accent)] shadow-sm">
              <Box className="h-4 w-4 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold tracking-widest text-[var(--accent)] uppercase">
                  MODEL VAULT
                </span>
                <span className="font-mono text-[9px] text-[var(--line-strong)]">/</span>
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">
                  PUBLISH WIZARD
                </span>
              </div>
              <h2 className="font-mono text-xs font-bold tracking-wider text-[var(--ink)] uppercase">
                Publish Creator Model
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-[10px] text-[var(--ink-soft)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              Live Preview Synchronized
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close panel"
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Obsidian & Acid-Lime Sign-In Notice Banner */}
        {!isAuthenticated && (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--accent)]/30 bg-[var(--surface-sunken)] px-6 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Creator Access Required
                </p>
                <p className="font-sans text-xs text-[var(--ink-soft)]">
                  Sign in to publish creator models and recipes
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal("create_model")}
              className="shrink-0 rounded-[5px] bg-[var(--accent)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98]"
            >
              Sign In
            </button>
          </div>
        )}

        {/* Step Stepper Navigation Bar */}
        <div className="flex items-center border-b border-[var(--line)] bg-[var(--surface-sunken)] px-6 py-2">
          <div className="grid w-full grid-cols-3 gap-2 font-mono text-[11px]">
            {stepsList.map(({ s, label, num, icon: Icon }, index) => {
              const isActive = step === s;
              const isPast = activeStepIndex > index;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(s)}
                  className={`group relative flex items-center justify-center gap-2 rounded-[5px] py-2 px-2 transition-all ${
                    isActive
                      ? "border border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm shadow-[var(--accent)]/5"
                      : isPast
                        ? "border border-[var(--line)] bg-[var(--surface-raised)]/60 text-[var(--ink)] hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
                        : "border border-transparent text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold ${
                      isActive
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : isPast
                          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                          : "bg-[var(--surface-soft)] text-[var(--ink-faint)]"
                    }`}
                  >
                    {isPast ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : num}
                  </span>
                  <span className="truncate font-semibold tracking-wide uppercase text-[10px]">
                    {label}
                  </span>
                  {isActive && (
                    <div className="absolute inset-x-2 -bottom-2 h-0.5 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Notification Banner */}
        {error && (
          <div
            role="alert"
            className="mx-6 mt-4 flex items-center justify-between rounded-[5px] border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 font-mono text-xs text-[var(--danger)] animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Dual-Pane Workspace Body: Form Left + Realtime Preview Right */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Step Form Inputs */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 border-r border-[var(--line)]">
            {/* STEP 1: IDENTITY & COMPATIBILITY STACK */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Panel 1A: Basic Identity */}
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--line)]">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                      <Cpu className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                        Model Identity & Taxonomy
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                        Core metadata displayed across SoloTensor search & catalog
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Model Title <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Cyberpunk Cinematic Lighting, RealVisV5..."
                      className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-[12px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none transition-colors"
                    />
                    {modelType === "Wildcards" && (
                      <div className="mt-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3 space-y-1.5 animate-in fade-in duration-150">
                        {(() => {
                          const cleanToken = (title.trim() || "wildcard")
                            .toLowerCase()
                            .replace(/[^a-z0-9_-]/g, "_");
                          const syntax = `__${cleanToken}__`;
                          const isCopied = copiedToken === syntax;

                          return (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                                  Wildcard Invocation Syntax Preview
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyToken(syntax)}
                                  className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[var(--accent)] hover:underline"
                                >
                                  {isCopied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  <span>{isCopied ? "Copied" : "Copy Token"}</span>
                                </button>
                              </div>
                              <div className="rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--accent)] flex items-center justify-between">
                                <code>{syntax}</code>
                              </div>
                              <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                                Attach text files (.txt, .yaml, .json) with list items. Each prompt evaluation will randomly substitute this tag with an entry from the file.
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Type & Category 2-Column */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Model Type
                      </label>
                      <CustomSelect
                        value={modelType}
                        onChange={(val) => setModelType(val as CreatorModelType)}
                        options={modelTypes.map((t) => ({ value: t, label: t }))}
                        className="w-full"
                        buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Category
                      </label>
                      <CustomSelect
                        value={category}
                        onChange={(val) => setCategory(val as CreatorModelCategory)}
                        options={categories.map((c) => ({ value: c, label: c }))}
                        className="w-full"
                        buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Base Architecture Dropdown */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Base Model Architecture
                    </label>
                    <HierarchicalSelect
                      value={baseModel}
                      onChange={setBaseModel}
                      options={BASE_MODEL_ARCHITECTURES}
                      placeholder="Select Base Architecture…"
                    />
                    {(baseModel === "Other" || baseModel === "Other / Custom") && (
                      <input
                        type="text"
                        value={customBaseModel}
                        onChange={(e) => setCustomBaseModel(e.target.value)}
                        placeholder="Enter custom base architecture name (e.g. Lumina-Next, Playground v2.5)…"
                        className="mt-2 workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-[12px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                      />
                    )}
                  </div>
                </div>

                {/* Panel 1B: Compatibility Stack (Polymorphic Tiers 1-5, omitted for Wildcards & Poses) */}
                {modelType !== "Wildcards" && modelType !== "Poses" && (
                  <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                          <Network className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                              Compatibility & Conditioning Stack
                            </span>
                            <span className="inline-flex items-center rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30">
                              {getModelTier(modelType)}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                            {getModelTier(modelType) === "Core Base" && "Base Architecture Conditioning & Decoders"}
                            {getModelTier(modelType) === "Adapter" && "Upstream Enclave Binding & Conditioning Inheritance"}
                            {getModelTier(modelType) === "Autoencoder" && "Latent Space Compression & Channel Encoding"}
                            {getModelTier(modelType) === "Guidance" && "Spatial Conditioners & Preprocessor Modalities"}
                            {getModelTier(modelType) === "Inversion" && "Textual Inversion & Cross-Attention Vectors"}
                          </span>
                        </div>
                      </div>

                      {(getModelTier(modelType) === "Core Base" || getModelTier(modelType) === "Adapter") && (
                        <button
                          type="button"
                          onClick={refreshComfyEnclave}
                          disabled={vaeLoading || encoderLoading}
                          title="Re-scan local ComfyUI models folder"
                          className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                        >
                          <RefreshCw className={`h-3 w-3 ${vaeLoading || encoderLoading ? "animate-spin" : ""}`} />
                          <span>Rescan</span>
                        </button>
                      )}
                    </div>

                    {/* TIER 1: CORE BASE (Checkpoint, SVD) */}
                    {getModelTier(modelType) === "Core Base" && (
                      <div className="space-y-4 animate-in fade-in duration-150">
                        {/* Contextual Architecture Banner */}
                        {isModularBackbone ? (
                          <div className="flex items-start gap-3 rounded-[5px] border border-purple-500/30 bg-purple-500/5 p-3">
                            <Layers3 className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="rounded border border-purple-500/40 bg-purple-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase text-purple-300">
                                  [MODULAR DIFFUSION BACKBONE DETECTED]
                                </span>
                              </div>
                              <p className="font-mono text-[10px] leading-relaxed text-[var(--ink-soft)]">
                                This checkpoint uses a modular UNET/DiT backbone (<code className="text-purple-300">models/diffusion_models/</code>). External VAE decoder and Text Encoder / CLIP protocol configured below are active and required for generation.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                            <Box className="h-4 w-4 shrink-0 text-[var(--ink-soft)] mt-0.5" />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="rounded border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase text-[var(--ink-soft)]">
                                  [MONOLITHIC CHECKPOINT]
                                </span>
                              </div>
                              <p className="font-mono text-[10px] leading-relaxed text-[var(--ink-faint)]">
                                Standard all-in-one checkpoint (<code className="text-[var(--ink-soft)]">models/checkpoints/</code>). Bundled CLIP and VAE will be used during inference unless overridden below.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Recommended VAE Selection */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                              Recommended VAE{" "}
                              <span className="text-[var(--accent)] font-semibold">
                                ({vaeFiles.length} detected · .safetensors, .sft)
                              </span>
                            </label>
                            {vaeLoading && (
                              <span className="font-mono text-[9px] text-[var(--ink-faint)] animate-pulse">
                                Scanning VAEs…
                              </span>
                            )}
                          </div>

                          <CustomSelect
                            value={isCustomVae ? "__custom__" : vae}
                            onChange={(val) => {
                              if (val === "__custom__") {
                                setIsCustomVae(true);
                                setVae(customVae);
                              } else {
                                setIsCustomVae(false);
                                setVae(val);
                              }
                            }}
                            options={[
                              ...vaeOptions.map((vp) => ({
                                value: vp,
                                label: vp,
                              })),
                              {
                                value: "__custom__",
                                label: "Custom VAE filename (.safetensors, .sft)…",
                              },
                            ]}
                            className="w-full"
                            buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                          />

                          {isCustomVae && (
                            <input
                              type="text"
                              value={customVae}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomVae(val);
                                setVae(val);
                              }}
                              placeholder="e.g. ae.sft, ae.safetensors, or custom_vae.sft…"
                              className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                            />
                          )}

                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {vaeOptions.map((vp) => {
                              const isSel = !isCustomVae && vae === vp;
                              return (
                                <button
                                  key={vp}
                                  type="button"
                                  onClick={() => {
                                    setIsCustomVae(false);
                                    setVae(vp);
                                  }}
                                  className={`rounded-[5px] border px-2.5 py-1 font-mono text-[11px] font-bold transition-all ${
                                    isSel
                                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                                      : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                                  }`}
                                >
                                  <span>{vp}</span>
                                </button>
                              );
                            })}
                          </div>

                          {vaeError && (
                            <div className="flex items-center justify-between rounded-[4px] border border-[var(--danger-line)] bg-[var(--danger-surface)] px-2.5 py-1 font-mono text-[10px] text-[var(--danger)]">
                              <span>{vaeError}</span>
                              <button
                                type="button"
                                onClick={refreshComfyEnclave}
                                className="font-bold underline hover:no-underline"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>

                        {/* CLIP & Text Encoder 2-Column Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {/* Text Encoder Model */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                                Text Encoder / CLIP{" "}
                                <span className="text-[var(--ink-faint)]">
                                  ({encoderFiles.length} detected)
                                </span>
                              </label>
                              {encoderLoading && (
                                <span className="font-mono text-[9px] text-[var(--ink-faint)] animate-pulse">
                                  Scanning…
                                </span>
                              )}
                            </div>

                            <CustomSelect
                              value={isCustomEncoder ? "__custom__" : textEncoder}
                              onChange={(val) => {
                                if (val === "__custom__") {
                                  setIsCustomEncoder(true);
                                  setTextEncoder(customEncoder);
                                } else {
                                  setIsCustomEncoder(false);
                                  setTextEncoder(val);
                                }
                              }}
                              options={[
                                { value: "", label: "None / Not Required" },
                                ...encoderOptions.map((enc) => ({
                                  value: enc,
                                  label: enc,
                                })),
                                {
                                  value: "__custom__",
                                  label: "Custom Encoder filename (.safetensors, .sft)…",
                                },
                              ]}
                              className="w-full"
                              buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                            />

                            {isCustomEncoder && (
                              <input
                                type="text"
                                value={customEncoder}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomEncoder(val);
                                  setTextEncoder(val);
                                }}
                                placeholder="e.g. t5xxl_fp8_e4m3fn.sft or clip_l.safetensors…"
                                className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                              />
                            )}

                            {encoderError && (
                              <p className="font-mono text-[9px] text-[var(--danger)]">
                                {encoderError}
                              </p>
                            )}
                          </div>

                          {/* CLIP Type / Protocol */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                                CLIP Type Protocol
                              </label>
                              {clipTypesLoading && (
                                <span className="font-mono text-[9px] text-[var(--ink-faint)] animate-pulse">
                                  Loading…
                                </span>
                              )}
                            </div>

                            <CustomSelect
                              value={clipType}
                              onChange={(val) => setClipType(val)}
                              options={clipTypeOptions.map((c) => ({
                                value: c,
                                label: c,
                              }))}
                              className="w-full"
                              buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TIER 2: ADAPTER (LoRA, LoKr, LoCon, LyCORIS, DoRA, Motion LoRA) */}
                    {getModelTier(modelType) === "Adapter" && (
                      <div className="space-y-3.5 animate-in fade-in duration-150">
                        {/* Base Model Enclave Binding */}
                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                              Exact Base Checkpoint / Diffusion Enclave{" "}
                              <span className="text-[var(--accent)]">(Installed in Gallery)</span>
                            </label>
                            {baseOptionsLoading && (
                              <span className="font-mono text-[9px] text-[var(--ink-faint)] animate-pulse">
                                Scanning gallery…
                              </span>
                            )}
                          </div>
                          <CustomSelect
                            value={selectedBaseKey}
                            onChange={onSelectBaseModel}
                            options={[
                              { value: "", label: "Universal / Any Base Architecture" },
                              ...baseOptions.map((opt) => ({
                                value: `${opt.model_id}:${opt.version_id}:${opt.file_id}`,
                                label: `${opt.title} · ${opt.filename} (${opt.model_type})`,
                              })),
                            ]}
                            className="w-full"
                            buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                          />
                          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                            Binding to an installed base model auto-inherits its verified architecture, VAE, and text encoder.
                          </p>
                        </div>

                        {/* Auto-Inheritance Summary Card */}
                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                                Conditioning Auto-Inheritance
                              </span>
                            </div>
                            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 font-bold">
                              {selectedBaseKey ? "Enclave Synced" : "Dynamic Runtime"}
                            </span>
                          </div>
                          {selectedBaseKey ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
                              <div className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                                <span className="text-[var(--ink-faint)] block text-[9px] uppercase">Base Architecture</span>
                                <span className="text-[var(--ink)] font-bold truncate block">{baseModel}</span>
                              </div>
                              <div className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                                <span className="text-[var(--ink-faint)] block text-[9px] uppercase">Inherited VAE</span>
                                <span className="text-[var(--ink)] font-bold truncate block">{vae || "Auto-resolved"}</span>
                              </div>
                              <div className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                                <span className="text-[var(--ink-faint)] block text-[9px] uppercase">CLIP Protocol</span>
                                <span className="text-[var(--ink)] font-bold truncate block">{clipType || "Auto-resolved"}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="font-mono text-[10px] text-[var(--ink-soft)] leading-relaxed">
                              Universal adapter configuration: weight modifications and rank decompositions are applied dynamically across compatible diffusion backbones during inference.
                            </p>
                          )}
                        </div>

                        {/* Advanced Conditioning Override Toggle */}
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => setShowAdapterOverride(!showAdapterOverride)}
                            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors"
                          >
                            <SlidersHorizontal className="h-3 w-3" />
                            <span>{showAdapterOverride ? "Hide Conditioning Override" : "Specialized Conditioning Override (Optional)"}</span>
                            <ChevronDown className={`h-3 w-3 transition-transform ${showAdapterOverride ? "rotate-180" : ""}`} />
                          </button>
                        </div>

                        {showAdapterOverride && (
                          <div className="rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface)] p-3.5 space-y-3.5 animate-in fade-in duration-150">
                            <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                              Override inherited VAE or text encoder if this adapter was fine-tuned on specialized conditioning.
                            </p>

                            {/* Override VAE */}
                            <div className="space-y-1.5">
                              <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                                Override VAE (.safetensors, .sft)
                              </label>
                              <CustomSelect
                                value={isCustomVae ? "__custom__" : vae}
                                onChange={(val) => {
                                  if (val === "__custom__") {
                                    setIsCustomVae(true);
                                    setVae(customVae);
                                  } else {
                                    setIsCustomVae(false);
                                    setVae(val);
                                  }
                                }}
                                options={[
                                  ...vaeOptions.map((vp) => ({ value: vp, label: vp })),
                                  { value: "__custom__", label: "Custom VAE filename (.safetensors, .sft)…" },
                                ]}
                                className="w-full"
                                buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                              />
                              {isCustomVae && (
                                <input
                                  type="text"
                                  value={customVae}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomVae(val);
                                    setVae(val);
                                  }}
                                  placeholder="e.g. ae.sft, ae.safetensors…"
                                  className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                                />
                              )}
                            </div>

                            {/* Override Text Encoder & CLIP */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                                  Override CLIP
                                </label>
                                <CustomSelect
                                  value={isCustomEncoder ? "__custom__" : textEncoder}
                                  onChange={(val) => {
                                    if (val === "__custom__") {
                                      setIsCustomEncoder(true);
                                      setTextEncoder(customEncoder);
                                    } else {
                                      setIsCustomEncoder(false);
                                      setTextEncoder(val);
                                    }
                                  }}
                                  options={[
                                    { value: "", label: "None / Not Required" },
                                    ...encoderOptions.map((enc) => ({ value: enc, label: enc })),
                                    { value: "__custom__", label: "Custom Encoder filename (.safetensors, .sft)…" },
                                  ]}
                                  className="w-full"
                                  buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                                  CLIP Type Protocol
                                </label>
                                <CustomSelect
                                  value={clipType}
                                  onChange={(val) => setClipType(val)}
                                  options={clipTypeOptions.map((c) => ({ value: c, label: c }))}
                                  className="w-full"
                                  buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TIER 3: AUTOENCODER (VAE) */}
                    {modelType === "VAE" && (
                      <div className="space-y-3 animate-in fade-in duration-150">
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                            Latent Space Profile & Channel Depth
                          </label>
                          <CustomSelect
                            value={latentProfile}
                            onChange={setLatentProfile}
                            options={[
                              {
                                value: "16-Channel Latent (FLUX.1 / SD3.5 / SD3 - ae.sft, ae.safetensors)",
                                label: "16-Channel Latent (FLUX.1 / SD3.5 / SD3 - ae.sft, ae.safetensors)",
                              },
                              {
                                value: "4-Channel Latent (SDXL / SD 1.5 - sdxl_vae, vae-ft-mse)",
                                label: "4-Channel Latent (SDXL / SD 1.5 - sdxl_vae, vae-ft-mse)",
                              },
                              {
                                value: "8-Channel Video Latent (Wan2.1 / SVD / VideoVAE)",
                                label: "8-Channel Video Latent (Wan2.1 / SVD / VideoVAE)",
                              },
                              { value: "Custom Latent Space", label: "Custom Latent Space" },
                            ]}
                            className="w-full"
                            buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                          />
                        </div>

                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-3.5 w-3.5 text-[var(--accent)]" />
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                              Pixel-to-Latent Autoencoder Bridge
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-[var(--ink-soft)] leading-relaxed">
                            This asset functions directly as the continuous autoencoder, transforming spatial RGB pixel arrays into compressed latent representations and reconstructing latent tensors back to image canvas. Downstream VAE decoders, text encoders, and CLIP protocols are inactive for this tier.
                          </p>
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="font-mono text-[9px] text-[var(--ink-faint)]">Supported file extensions:</span>
                            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--line)] text-[var(--accent)]">
                              .safetensors
                            </span>
                            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--line)] text-[var(--accent)]">
                              .sft
                            </span>
                            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--line)] text-[var(--accent)]">
                              .pt
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TIER 4: GUIDANCE (ControlNet, StyleModel) */}
                    {(modelType === "ControlNet" || modelType === "StyleModel") && (
                      <div className="space-y-3 animate-in fade-in duration-150">
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                            Preprocessor Modality & Vision Encoding
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              "Canny Edge",
                              "Depth (Z-Buffer)",
                              "OpenPose Body",
                              "Normal Map",
                              "LineArt",
                              "Style / IP-Adapter",
                              "MLSD Wireframe",
                              "Tile / Upscale",
                            ].map((mod) => {
                              const isSel = preprocessorModality === mod;
                              return (
                                <button
                                  key={mod}
                                  type="button"
                                  onClick={() => setPreprocessorModality(mod)}
                                  className={`rounded-[5px] border px-2.5 py-1 font-mono text-[11px] font-bold transition-all ${
                                    isSel
                                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                                      : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                                  }`}
                                >
                                  <span>{mod}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <Layers3 className="h-3.5 w-3.5 text-[var(--accent)]" />
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                              Spatial Guidance Conditioning
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-[var(--ink-soft)] leading-relaxed">
                            Guidance tensors inject structural edge, depth, or vision conditioning cues directly into diffusion transformer blocks (DiT / U-Net zero-convolutions), maintaining geometric fidelity without altering prompt conditioning or requiring external VAE/CLIP decoders.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* TIER 5: INVERSION (Embedding, Aesthetic Gradient, Hyper Network) */}
                    {getModelTier(modelType) === "Inversion" && (
                      <div className="space-y-3 animate-in fade-in duration-150">
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                            Target Vector Dimension & Cross-Attention Space
                          </label>
                          <CustomSelect
                            value={inversionDimension}
                            onChange={setInversionDimension}
                            options={[
                              { value: "4096-dim (FLUX.1 / SD3 T5-XXL)", label: "4096-dim (FLUX.1 / SD3 T5-XXL Tokenizer)" },
                              { value: "2048-dim (SDXL OpenCLIP ViT-bigG + CLIP-ViT/L)", label: "2048-dim (SDXL OpenCLIP ViT-bigG + CLIP-ViT/L)" },
                              { value: "768-dim (SD 1.5 CLIP ViT-L/14)", label: "768-dim (SD 1.5 CLIP ViT-L/14)" },
                              { value: "Custom Dimension", label: "Custom Dimension" },
                            ]}
                            className="w-full"
                            buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                          />
                        </div>

                        {/* Dynamic Prompt Token Syntax Preview */}
                        {(() => {
                          const cleanToken = (title.trim() || "concept")
                            .toLowerCase()
                            .replace(/[^a-z0-9_-]/g, "_");
                          const syntax =
                            modelType === "Hyper Network"
                              ? `<hypernet:${cleanToken}:1.0>`
                              : `embedding:${cleanToken}`;
                          const isCopied = copiedToken === syntax;

                          return (
                            <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                                  Prompt Token Syntax Preview
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyToken(syntax)}
                                  className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[var(--accent)] hover:underline"
                                >
                                  {isCopied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  <span>{isCopied ? "Copied" : "Copy Token"}</span>
                                </button>
                              </div>
                              <div className="rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-xs font-bold text-[var(--accent)] flex items-center justify-between">
                                <code>{syntax}</code>
                              </div>
                              <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                                Injects learned concept vectors directly into the text conditioning embedding space during generation.
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: FILES & WEIGHTS */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  {/* Step Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                        <HardDrive className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                          Model Weights & Release Versions
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                          Attach weights, manage release branches
                        </span>
                      </div>
                    </div>
                    <span className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent)] font-semibold">
                      {activeVersion.files.length} {activeVersion.files.length === 1 ? "file" : "files"} in {activeVersion.name}
                    </span>
                  </div>

                  {/* Version Branching Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)] mr-1">
                        RELEASES:
                      </span>
                      {versions.map((v) => {
                        const isActive = v.id === activeVersion.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              setActiveVersionId(v.id);
                              setVersionNameInput(v.name);
                              setIsEditingVersionName(false);
                            }}
                            className={`flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 font-mono text-[11px] font-semibold transition-all ${
                              isActive
                                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm font-bold"
                                : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                            }`}
                          >
                            <span>{v.name}</span>
                            <span
                              className={`rounded px-1 text-[9px] ${
                                isActive
                                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                                  : "bg-[var(--surface-sunken)] text-[var(--ink-faint)]"
                              }`}
                            >
                              {v.files.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Inline Version Name Edit */}
                      {isEditingVersionName ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={versionNameInput}
                            onChange={(e) => setVersionNameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveVersionName();
                              if (e.key === "Escape") setIsEditingVersionName(false);
                            }}
                            className="h-7 w-24 rounded-[4px] border border-[var(--accent)] bg-[var(--surface)] px-2 font-mono text-[11px] text-[var(--ink)] outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={saveVersionName}
                            className="h-7 rounded-[4px] bg-[var(--accent)] px-2 font-mono text-[10px] font-bold text-[var(--accent-ink)]"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={startRenameVersion}
                          className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-2 font-mono text-[10px] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
                          title="Rename active release"
                        >
                          Rename
                        </button>
                      )}

                      {/* Delete non-default version */}
                      {versions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeVersion(activeVersion.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-2 font-mono text-[10px] text-[var(--danger)] hover:bg-[var(--danger-surface)] transition-colors"
                          title="Delete this release branch"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}

                      {/* Add Version Button */}
                      <button
                        type="button"
                        onClick={addVersion}
                        className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Release</span>
                      </button>
                    </div>
                  </div>

                  {/* Dual Action Ingestion Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Upload Card */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                      }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) addUploadedFile(f);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex min-h-[95px] cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed p-3.5 text-center transition ${
                        isDraggingFile
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : "border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".safetensors,.sft,.ckpt,.pt,.bin,.gguf"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) addUploadedFile(f);
                          e.target.value = "";
                        }}
                      />
                      <Upload className="h-4 w-4 text-[var(--accent)] mb-1.5" />
                      <p className="font-mono text-[11px] font-bold text-[var(--ink)]">
                        Upload Raw Binary Weights
                      </p>
                      <p className="font-mono text-[9px] text-[var(--ink-faint)] mt-0.5">
                        .safetensors, .sft, .ckpt, or .gguf to {activeVersion.name}
                      </p>
                    </div>

                    {/* ComfyUI Vault Card */}
                    <div className="flex flex-col justify-between rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)]/60 p-3.5">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <FolderDown className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <p className="font-mono text-[11px] font-bold text-[var(--ink)]">
                            ComfyUI Local Vault
                          </p>
                        </div>
                        <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                          Link instantly from{" "}
                          <span className="text-[var(--accent)]">
                            {modelType === "Checkpoint"
                              ? "models/checkpoints/ & models/diffusion_models/"
                              : `models/${comfyCategory}/`}
                          </span>{" "}
                          with zero disk copy
                        </p>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">Precision:</span>
                          {(["FP16", "BF16", "FP32"] as ModelPrecision[]).map((prec) => (
                            <button
                              key={prec}
                              type="button"
                              onClick={() => setSelectedPrecision(prec)}
                              className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold transition-colors ${
                                selectedPrecision === prec
                                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                  : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                              }`}
                            >
                              {prec}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowLocalPicker((v) => !v)}
                          className="inline-flex h-6 items-center gap-1 rounded-[4px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 font-mono text-[9px] font-bold uppercase text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                          <Search className="h-2.5 w-2.5" />
                          <span>{showLocalPicker ? "Close Scanner" : "Scan Vault"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Local Scanner Drawer/Panel */}
                  {showLocalPicker && (
                    <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3 space-y-2.5">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
                        <input
                          type="search"
                          value={localSearch}
                          onChange={(e) => setLocalSearch(e.target.value)}
                          placeholder={
                            modelType === "Checkpoint"
                              ? `Search checkpoints & modular UNET/DiT files to add to ${activeVersion.name}…`
                              : `Search ${comfyCategory} files to add to ${activeVersion.name}…`
                          }
                          className="workspace-field h-8 w-full pl-8 pr-3 font-mono text-[11px] bg-[var(--surface)] border border-[var(--line)] rounded-[5px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none"
                        />
                      </div>

                      {/* Quick filter button bar inside the picker header when modelType === "Checkpoint" */}
                      {modelType === "Checkpoint" && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] mr-0.5">
                            Filter:
                          </span>
                          {(
                            [
                              { id: "all", label: "All" },
                              { id: "checkpoints", label: "Monolithic Checkpoints" },
                              { id: "diffusion_models", label: "Modular UNET / DiT" },
                            ] as const
                          ).map((tab) => {
                            const isSelected = vaultFilter === tab.id;
                            const count =
                              tab.id === "all"
                                ? localFiles.length
                                : localFiles.filter((f) => f.category === tab.id).length;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setVaultFilter(tab.id)}
                                className={`rounded px-2 py-0.5 font-mono text-[9px] font-semibold transition-colors ${
                                  isSelected
                                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                    : "bg-[var(--surface)] border border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                                }`}
                              >
                                {tab.label}
                                <span className="ml-1 opacity-70">({count})</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(() => {
                        const displayedFiles =
                          modelType === "Checkpoint" && vaultFilter !== "all"
                            ? localFiles.filter((f) => f.category === vaultFilter)
                            : localFiles;
                        return localLoading ? (
                          <div className="p-4 text-center font-mono text-[11px] text-[var(--ink-faint)] animate-pulse">
                            Scanning ComfyUI model enclave…
                          </div>
                        ) : localError ? (
                          <div className="p-3 rounded-[5px] border border-[var(--danger-line)] bg-[var(--danger-surface)] font-mono text-[10px] text-[var(--danger)]">
                            {localError}
                          </div>
                        ) : displayedFiles.length === 0 ? (
                          <div className="p-4 text-center font-mono text-[11px] text-[var(--ink-faint)]">
                            {modelType === "Checkpoint"
                              ? vaultFilter === "checkpoints"
                                ? "No monolithic checkpoints found."
                                : vaultFilter === "diffusion_models"
                                ? "No modular UNET / DiT models found."
                                : "No checkpoints or diffusion models found."
                              : `No files found in ${comfyCategory}.`}
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto rounded-[5px] border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">
                            {displayedFiles.map((item) => {
                              const isAlreadyAttached = activeVersion.files.some(
                                (f) =>
                                  f.kind === "local" &&
                                  f.local?.filename === item.filename &&
                                  f.local?.category === item.category,
                              );
                              return (
                                <button
                                  key={`${item.category}/${item.filename}`}
                                  type="button"
                                  disabled={isAlreadyAttached}
                                  onClick={() => addLocalFile(item)}
                                  className={`flex w-full items-center justify-between p-2.5 text-left transition-colors ${
                                    isAlreadyAttached
                                      ? "opacity-50 cursor-not-allowed bg-[var(--surface-sunken)]"
                                      : "hover:bg-[var(--surface-raised)] text-[var(--ink)]"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 mr-2">
                                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                                    <span className="truncate font-mono text-[11px]">
                                      {item.filename}
                                    </span>
                                    <span
                                      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider border ${
                                        item.category === "diffusion_models"
                                          ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                                          : item.category === "checkpoints"
                                          ? "border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--ink-soft)]"
                                          : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)]"
                                      }`}
                                    >
                                      {item.category === "diffusion_models"
                                        ? "MODULAR UNET"
                                        : item.category === "checkpoints"
                                        ? "MONOLITHIC"
                                        : item.category}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                                      {formatBytes(item.size)}
                                    </span>
                                    {isAlreadyAttached ? (
                                      <span className="text-[9px] font-mono text-[var(--accent)] font-semibold">
                                        Attached
                                      </span>
                                    ) : (
                                      <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-mono text-[var(--accent)] font-semibold hover:bg-[var(--accent)]/20">
                                        + Attach
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Attached Files Registry for Active Version */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                        Attached Weights for {activeVersion.name} ({activeVersion.files.length})
                      </span>
                    </div>

                    {activeVersion.files.length === 0 ? (
                      <div className="rounded-[5px] border border-dashed border-[var(--line)] bg-[var(--surface-sunken)] p-6 text-center">
                        <FileArchive className="mx-auto h-6 w-6 text-[var(--ink-faint)] mb-2" />
                        <p className="font-mono text-xs font-bold text-[var(--ink-soft)]">
                          No binaries attached to release {activeVersion.name}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--ink-faint)] mt-1">
                          Upload weights above or link directly from your ComfyUI local vault.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)]">
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead className="border-b border-[var(--line)] bg-[var(--surface)] text-[9px] text-[var(--ink-faint)] uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2">FILE NAME</th>
                              <th className="px-2.5 py-2">SOURCE</th>
                              <th className="px-2.5 py-2">SIZE</th>
                              <th className="px-2.5 py-2">PRECISION</th>
                              <th className="px-3 py-2 text-right">ACTION</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--line)]">
                            {activeVersion.files.map((file) => (
                              <tr key={file.id} className="hover:bg-[var(--surface-soft)]/50 transition-colors">
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                                    <span className="truncate font-bold text-[var(--ink)]" title={file.filename}>
                                      {file.filename}
                                    </span>
                                    {(modelType === "Checkpoint" ||
                                      file.local?.category === "diffusion_models" ||
                                      file.local?.category === "checkpoints") && (
                                      <span
                                        className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
                                          file.local?.category === "diffusion_models"
                                            ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                                            : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-soft)]"
                                        }`}
                                      >
                                        {file.local?.category === "diffusion_models"
                                          ? "Modular UNET (diffusion_models)"
                                          : "Checkpoint (checkpoints)"}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                                      file.kind === "local"
                                        ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                                        : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)]"
                                    }`}
                                  >
                                    {file.kind === "local" ? "ComfyUI Vault" : "Direct Upload"}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2.5 text-[var(--ink-soft)] whitespace-nowrap">
                                  {formatBytes(file.size)}
                                </td>
                                <td className="px-2.5 py-2.5 whitespace-nowrap">
                                  <div className="flex items-center gap-1">
                                    {(["FP16", "BF16", "FP32"] as ModelPrecision[]).map((prec) => (
                                      <button
                                        key={prec}
                                        type="button"
                                        onClick={() => updateFilePrecision(file.id, prec)}
                                        className={`rounded px-1.5 py-0.5 text-[9px] font-mono transition-colors ${
                                          file.precision === prec
                                            ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                                            : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                                        }`}
                                      >
                                        {prec}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => removeFile(file.id)}
                                    className="rounded p-1 text-[var(--ink-faint)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] transition-colors"
                                    title="Remove this file"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: SHOWCASE & GOVERNANCE */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--line)]">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                      <FileImage className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                        Showcase Cover & Permissions
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                        Add hero thumbnail and define open licensing terms
                      </span>
                    </div>
                  </div>

                  {/* Showcase Images & Thumbnail Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Showcase Images & Thumbnail ({showcaseFiles.length})
                      </label>
                      {activeThumbnail && (
                        <span className="font-mono text-[9px] text-[var(--accent)] font-semibold flex items-center gap-1">
                          <Star className="h-2.5 w-2.5 fill-[var(--accent)]" />
                          <span>Cover: {activeThumbnail.file.name}</span>
                        </span>
                      )}
                    </div>

                    {/* Multi-file Dropzone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingShowcase(true);
                      }}
                      onDragLeave={() => setIsDraggingShowcase(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingShowcase(false);
                        const files = e.dataTransfer.files;
                        if (files && files.length > 0) addShowcaseFiles(files);
                      }}
                      onClick={() => showcaseInputRef.current?.click()}
                      className={`flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed p-3.5 text-center transition ${
                        isDraggingShowcase
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : "border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                      }`}
                    >
                      <input
                        ref={showcaseInputRef}
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) addShowcaseFiles(files);
                          e.target.value = "";
                        }}
                      />
                      <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                        <Upload className="h-3.5 w-3.5" />
                      </div>
                      <p className="font-mono text-xs font-bold text-[var(--ink)]">
                        {showcaseFiles.length > 0
                          ? "Upload more showcase images…"
                          : "Upload Showcase Images (Select one or multiple)"}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-faint)]">
                        PNG, JPG, WebP. Upload multiple sample images and click any image to pick it as the primary cover thumbnail.
                      </p>
                    </div>

                    {/* Showcase Cards Grid with Thumbnail Selector */}
                    {showcaseFiles.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                          Click any image to set it as the primary catalog thumbnail (marked with ★ Cover):
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                          {showcaseFiles.map((item) => {
                            const isThumb = item.id === activeThumbnail?.id;
                            return (
                              <div
                                key={item.id}
                                onClick={() => setAsThumbnail(item.id)}
                                className={`group relative cursor-pointer overflow-hidden rounded-[5px] border transition-all ${
                                  isThumb
                                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 bg-[var(--surface-raised)] shadow-md"
                                    : "border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:shadow-sm"
                                }`}
                              >
                                {/* Thumbnail Image Preview */}
                                <div className="aspect-[3/4] w-full overflow-hidden bg-black/30">
                                  <img
                                    src={item.previewUrl}
                                    alt={item.file.name}
                                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                  />
                                </div>

                                {/* Active Cover Badge */}
                                {isThumb && (
                                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--accent-ink)] shadow">
                                    <Star className="h-2.5 w-2.5 fill-current" />
                                    <span>Cover</span>
                                  </div>
                                )}

                                {/* Make Cover Button on Hover if not active */}
                                {!isThumb && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="rounded bg-[var(--surface-raised)] border border-[var(--line-strong)] px-2 py-1 font-mono text-[9px] font-bold text-[var(--ink)] shadow">
                                      Set as Cover
                                    </span>
                                  </div>
                                )}

                                {/* Delete Button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeShowcaseItem(item.id);
                                  }}
                                  className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-white/80 hover:bg-[var(--danger)] hover:text-white transition-colors"
                                  title="Remove image"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>

                                {/* File Name Footer */}
                                <div className="p-1.5 border-t border-[var(--line)] bg-[var(--surface)]">
                                  <p className="truncate font-mono text-[9px] text-[var(--ink)]" title={item.file.name}>
                                    {item.file.name}
                                  </p>
                                  <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                                    {formatBytes(item.file.size)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Visibility Setting */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Catalog Visibility
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setVisibility("Public")}
                        className={`h-8 rounded-[5px] font-mono text-[11px] font-bold uppercase tracking-wider transition-colors ${
                          visibility === "Public"
                            ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                            : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        Public (Gallery)
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibility("Private")}
                        className={`h-8 rounded-[5px] font-mono text-[11px] font-bold uppercase tracking-wider transition-colors ${
                          visibility === "Private"
                            ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                            : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        Private (Draft)
                      </button>
                    </div>
                    {visibility === "Public" ? (
                      <p className="mt-1.5 text-[10px] text-[var(--accent)] flex items-start gap-1 font-mono">
                        <span>ℹ️</span>
                        <span>Public models are submitted to the Darkroom moderation queue for review before appearing in the public gallery.</span>
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-[var(--ink-faint)] font-mono">
                        Private models are saved as drafts and visible only to you.
                      </p>
                    )}
                  </div>

                  {/* Permissions Toggles */}
                  <div className="space-y-2 pt-2 border-t border-[var(--line)] font-mono text-[11px]">
                    <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-soft)] mb-1">
                      Licensing & Usage Permissions
                    </div>

                    {/* 1. Commercial Use */}
                    <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all">
                      <div>
                        <span className="text-[var(--ink)] font-bold block text-[11px]">
                          Commercial Generation & Content Sale
                        </span>
                        <span className="text-[9px] text-[var(--ink-faint)]">
                          Allow users to sell content generated by this model commercially
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={commercial}
                        onChange={(e) => setCommercial(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </label>

                    {/* 2. Commercial Resale of Weights */}
                    <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all">
                      <div>
                        <span className="text-[var(--ink)] font-bold block text-[11px]">
                          Commercial Resale of Model Weights
                        </span>
                        <span className="text-[9px] text-[var(--ink-faint)]">
                          Allow third parties to sell this model checkpoint, fine-tunes, or merged weights
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={sellModel}
                        onChange={(e) => setSellModel(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </label>

                    {/* 3. Model Remix & Merges */}
                    <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all">
                      <div>
                        <span className="text-[var(--ink)] font-bold block text-[11px]">
                          Model Remix & Merges
                        </span>
                        <span className="text-[9px] text-[var(--ink-faint)]">
                          Allow downstream creators to merge weights or share fine-tunes
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={remix}
                        onChange={(e) => setRemix(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </label>

                    {/* 4. SoloTensor Generation Services */}
                    <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all">
                      <div>
                        <span className="text-[var(--ink)] font-bold block text-[11px]">
                          SoloTensor Generation Services
                        </span>
                        <span className="text-[9px] text-[var(--ink-faint)]">
                          Allow hosting and running this model on SoloTensor online generation services
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={generationServices}
                        onChange={(e) => setGenerationServices(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </label>

                    {/* 5. Direct Weights Download */}
                    <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all">
                      <div>
                        <span className="text-[var(--ink)] font-bold block text-[11px]">
                          Direct Weights Download
                        </span>
                        <span className="text-[9px] text-[var(--ink-faint)]">
                          Allow visitors to download raw model weight files to their local machine
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={allowDownload}
                        onChange={(e) => setAllowDownload(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </label>

                    {/* 6. Attribution */}
                    <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all">
                      <div>
                        <span className="text-[var(--ink)] font-bold block text-[11px]">
                          Attribution & Credit Required
                        </span>
                        <span className="text-[9px] text-[var(--ink-faint)]">
                          Require creators and downstream users to credit you as the original author
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={creditRequired}
                        onChange={(e) => setCreditRequired(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Live Preview Inspector Panel (Always Visible) */}
          <div className="w-[310px] shrink-0 bg-[var(--surface-sunken)] p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              {/* Preview Header Frame */}
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                  <span>Card Live Mockup</span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-[5px] border border-[var(--accent)]/20">
                  Step {currentStepNumber}/{totalSteps}
                </span>
              </div>

              {/* Machined Card Container */}
              <div className="relative rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-2 shadow-xl">
                <TensorModelCard
                  item={{
                    title: currentDisplayTitle,
                    model_type: modelType,
                    category,
                    base_model: resolvedBaseModel,
                    cover_url: coverPreviewUrl,
                    sample_count: showcaseFiles.length,
                  }}
                  isLink={false}
                />
              </div>

              {/* Dynamic Telemetry Specs */}
              <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-[11px] space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Model Type:</span>
                  <span className="font-bold text-[var(--accent)]">{modelType}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Base Arch:</span>
                  <span className="font-semibold text-[var(--ink)] truncate max-w-[140px]">
                    {resolvedBaseModel}
                  </span>
                </div>
                {resolvedVae && (
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-[var(--ink-faint)]">Target VAE:</span>
                    <span className="font-semibold text-[var(--accent)] truncate max-w-[140px]">
                      {resolvedVae}
                    </span>
                  </div>
                )}
                {[resolvedEncoder, resolvedClipType].filter(Boolean).length > 0 && (
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-[var(--ink-faint)]">CLIP / Encoder:</span>
                    <span className="font-semibold text-[var(--ink)] truncate max-w-[140px]">
                      {[resolvedEncoder, resolvedClipType].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}

                {selectedBaseKey && (
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-[var(--ink-faint)]">Base Enclave:</span>
                    <span className="font-semibold text-[var(--accent)] truncate max-w-[140px]">
                      {baseOptions.find((b) => `${b.model_id}:${b.version_id}:${b.file_id}` === selectedBaseKey)?.title || "Linked Checkpoint"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Weights File:</span>
                  <span className="font-semibold text-[var(--ink)] truncate max-w-[140px]">
                    {totalFilesCount > 0
                      ? totalFilesCount === 1
                        ? versions[0]?.files[0]?.filename || "1 attached"
                        : `${totalFilesCount} files (${versions.length} release${versions.length > 1 ? "s" : ""})`
                      : "Pending…"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--ink-faint)]">Visibility:</span>
                  <span
                    className={`font-semibold ${
                      visibility === "Public"
                        ? "text-[var(--accent)]"
                        : "text-[var(--ink-soft)]"
                    }`}
                  >
                    {visibility}
                  </span>
                </div>
              </div>
            </div>

            {/* Micro Hint */}
            <p className="mt-4 text-center font-mono text-[9px] text-[var(--ink-faint)]">
              Updates in real-time as you complete wizard parameters
            </p>
          </div>
        </div>

        {/* Footer Actions Bar */}
        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--surface-raised)] px-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (step === 1) {
                onClose();
              } else if (step === 2) {
                setStep(1);
              } else if (step === 3) {
                setStep(2);
              }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-[11px] font-bold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors disabled:opacity-40"
          >
            {step === 1 ? (
              <span>Cancel</span>
            ) : (
              <>
                <ArrowLeft className="h-3 w-3" />
                <span>Back</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 && !title.trim()}
                onClick={() => {
                  if (step === 1) {
                    setStep(2);
                  } else if (step === 2) {
                    setStep(3);
                  }
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
              >
                <span>Next Step</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !title.trim()}
                onClick={() => void submit()}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.25)] disabled:opacity-40"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{busy ? "Publishing Pipeline…" : "Publish Model ⚡"}</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
