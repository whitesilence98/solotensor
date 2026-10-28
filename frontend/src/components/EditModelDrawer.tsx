"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Save,
  Loader2,
  Tag,
  Sliders,
  Shield,
  FileCode,
  Layers,
  RefreshCw,
  AlertCircle,
  Plus,
  Lock,
  Globe,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  Trash2,
  Edit3,
  Film,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Check,
  CheckCircle2,
} from "lucide-react";
import {
  api,
  type CreatorModel,
  type CreatorModelPayload,
  type CreatorModelCategory,
  type ModelVisibility,
  type InstalledGalleryModel,
  type ModelSample,
} from "@/lib/api";
import CustomSelect from "@/components/CustomSelect";
import HierarchicalSelect from "@/components/HierarchicalSelect";
import {
  BASE_MODEL_ARCHITECTURES,
  getFirstOptionValue,
  isArchitectureInList,
  isArchitectureCompatible,
  videoFamilyOf,
} from "@/lib/baseModelArchitectures";
import StudioStepperTabs, { type StudioStepItem } from "@/components/StudioStepperTabs";
import { getBaseFilename } from "@/lib/models";

export const isPromptableModelType = (t: string): boolean =>
  ![
    "VAE",
    "Wildcards",
    "Poses",
    "ControlNet",
    "StyleModel",
  ].includes(t);

export const isAdapterModelType = (t: string): boolean =>
  ["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(t);

const CATEGORIES: CreatorModelCategory[] = [
  "General",
  "Character",
  "Style",
  "Concept",
  "Clothing",
  "Pose",
];

const SAMPLER_OPTIONS = [
  "Euler a",
  "Euler",
  "DPM++ 2M Karras",
  "DPM++ SDE Karras",
  "UniPC",
  "LCM",
];

const DEFAULT_CLIP_TYPES = [
  "clip_l",
  "clip_g",
  "t5xxl",
  "flux_clip",
  "sd3_clip",
  "sdxl_clip",
];

/** Bundled LTX-Video 2.3 autoencoders, surfaced first for video backbones. */
const VIDEO_VAE_QUICK_PICKS = [
  "LTX23_video_vae_bf16.safetensors",
  "taeltx2_3.safetensors",
] as const;

/** CLIP protocol token the bundled LTX-Video 2.3 graph loads. */
const VIDEO_CLIP_TYPE = "ltxv";

const EDIT_MODEL_TABS: StudioStepItem<1 | 2 | 3 | 4 | 5>[] = [
  { id: 1, code: "01", label: "Identity & Metadata" },
  { id: 2, code: "02", label: "Showcase & Media" },
  { id: 3, code: "03", label: "Architecture & Conditioning" },
  { id: 4, code: "04", label: "Prompts & Presets" },
  { id: 5, code: "05", label: "Licensing & Permissions" },
];

export interface EditModelDrawerProps {
  open: boolean;
  model: CreatorModel;
  onClose: () => void;
  onUpdated: (model: CreatorModel) => void;
}

export default function EditModelDrawer({
  open,
  model,
  onClose,
  onUpdated,
}: EditModelDrawerProps) {
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Model & Version state for live updates
  const [currentModel, setCurrentModel] = useState<CreatorModel>(model);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    model.versions[0]?.version_id || ""
  );

  // Media Tab Actions state
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingSamples, setUploadingSamples] = useState(false);
  const [sampleActionId, setSampleActionId] = useState<string | null>(null);

  // Sample prompt editing modal state
  const [editingSample, setEditingSample] = useState<ModelSample | null>(null);
  const [samplePrompt, setSamplePrompt] = useState("");
  const [sampleNegativePrompt, setSampleNegativePrompt] = useState("");
  const [sampleSeed, setSampleSeed] = useState<string>("");
  const [sampleSampler, setSampleSampler] = useState<string>("");
  const [sampleCfg, setSampleCfg] = useState<string>("");
  const [sampleSteps, setSampleSteps] = useState<string>("");

  // Tab 1: Identity & Metadata
  const [title, setTitle] = useState(model.title);
  const [description, setDescription] = useState(model.description || "");
  const [category, setCategory] = useState<CreatorModelCategory>(model.category);
  const [tags, setTags] = useState<string[]>(model.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState<ModelVisibility>(model.visibility);

  // Tab 2: Architecture & Conditioning
  const [baseModel, setBaseModel] = useState(() => {
    const raw = model.compatibility?.base_model;
    return raw && isArchitectureInList(raw, BASE_MODEL_ARCHITECTURES)
      ? raw
      : getFirstOptionValue(BASE_MODEL_ARCHITECTURES);
  });
  const [customBaseModel, setCustomBaseModel] = useState("");
  const resolvedBaseModel =
    (baseModel === "Other" || baseModel === "Other / Custom") && customBaseModel.trim()
      ? customBaseModel.trim()
      : baseModel;
  const [selectedBaseKey, setSelectedBaseKey] = useState<string>("");
  const [baseOptions, setBaseOptions] = useState<InstalledGalleryModel[]>([]);
  const [vae, setVae] = useState(model.compatibility?.vae || "");
  const [isCustomVae, setIsCustomVae] = useState(false);
  const [customVae, setCustomVae] = useState("");
  const [vaeOptions, setVaeOptions] = useState<string[]>([]);
  const [textEncoder, setTextEncoder] = useState(model.compatibility?.text_encoder || "");
  const [isCustomEncoder, setIsCustomEncoder] = useState(false);
  const [customEncoder, setCustomEncoder] = useState("");
  const [encoderOptions, setEncoderOptions] = useState<string[]>([]);
  const [clipType, setClipType] = useState(model.compatibility?.clip_type || "");
  const [clipTypeOptions, setClipTypeOptions] = useState<string[]>(DEFAULT_CLIP_TYPES);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const activeVideoFamily = useMemo(() => videoFamilyOf(resolvedBaseModel), [resolvedBaseModel]);
  // Only the LTX family runs in this studio's bundled video graph, so only its
  // known-good VAE/CLIP tokens join the pickers.
  const isLtxVideo = activeVideoFamily === "ltx";
  // The banner describes a backbone being recorded, so it belongs to base
  // models only — a Wan-based LoRA is an adapter, not a video backbone.
  const showVideoBanner =
    Boolean(activeVideoFamily) && ["Checkpoint", "SVD"].includes(model.model_type);

  // Video quick-picks are derived, never written back into the scanned arrays.
  const displayedVaeOptions = useMemo(() => {
    if (!isLtxVideo) return vaeOptions;
    return [
      ...VIDEO_VAE_QUICK_PICKS.filter((pick) => !vaeOptions.includes(pick)),
      ...vaeOptions,
    ];
  }, [isLtxVideo, vaeOptions]);

  const displayedClipTypeOptions = useMemo(() => {
    if (!isLtxVideo || clipTypeOptions.includes(VIDEO_CLIP_TYPE)) {
      return clipTypeOptions;
    }
    return [VIDEO_CLIP_TYPE, ...clipTypeOptions];
  }, [isLtxVideo, clipTypeOptions]);

  // Tab 3: Prompts & Presets
  const promptable = isPromptableModelType(model.model_type);
  const [triggerWords, setTriggerWords] = useState<string[]>(model.generation?.trigger_words || []);
  const [triggerInput, setTriggerInput] = useState("");
  const [recommendedPrompt, setRecommendedPrompt] = useState(model.generation?.prompt || "");
  const [recommendedNegative, setRecommendedNegative] = useState(model.generation?.negative_prompt || "");
  const [sampler, setSampler] = useState(model.generation?.sampler || "Euler a");
  const [stepsMin, setStepsMin] = useState(model.generation?.steps_min ?? 20);
  const [stepsMax, setStepsMax] = useState(model.generation?.steps_max ?? 30);
  const [cfgMin, setCfgMin] = useState(model.generation?.cfg_min ?? 3.5);
  const [cfgMax, setCfgMax] = useState(model.generation?.cfg_max ?? 7.0);
  const [clipSkip, setClipSkip] = useState(model.generation?.clip_skip ?? 1);

  // Tab 4: Licensing & Permissions
  const [commercial, setCommercial] = useState(model.permissions?.commercial ?? true);
  const [sellModel, setSellModel] = useState(model.permissions?.sell_model ?? false);
  const [remix, setRemix] = useState(model.permissions?.remix ?? false);
  const [generationServices, setGenerationServices] = useState(model.permissions?.generation_services ?? true);
  const [allowDownload, setAllowDownload] = useState(model.permissions?.allow_download ?? true);
  const [creditRequired, setCreditRequired] = useState(model.permissions?.credit_required ?? true);

  const drawerRef = useRef<HTMLDivElement>(null);

  // Reset / sync state when model or open prop changes
  useEffect(() => {
    if (open && model) {
      setError(null);
      setCurrentModel(model);
      setSelectedVersionId(model.versions[0]?.version_id || "");
      setTitle(model.title);
      setDescription(model.description || "");
      setCategory(model.category);
      setTags(model.tags || []);
      setTagInput("");
      setVisibility(model.visibility);

      const rawArch = model.compatibility?.base_model;
      setBaseModel(
        rawArch && isArchitectureInList(rawArch, BASE_MODEL_ARCHITECTURES)
          ? rawArch
          : getFirstOptionValue(BASE_MODEL_ARCHITECTURES)
      );
      const baseKey = model.compatibility?.base_model_id
        ? `${model.compatibility.base_model_id}:${model.compatibility.base_version_id || ""}:${model.compatibility.base_file_id || ""}`
        : "";
      setSelectedBaseKey(baseKey);

      setVae(model.compatibility?.vae || "");
      setIsCustomVae(false);
      setCustomVae("");

      setTextEncoder(model.compatibility?.text_encoder || "");
      setIsCustomEncoder(false);
      setCustomEncoder("");

      setClipType(model.compatibility?.clip_type || "");

      setTriggerWords(model.generation?.trigger_words || []);
      setTriggerInput("");
      setRecommendedPrompt(model.generation?.prompt || "");
      setRecommendedNegative(model.generation?.negative_prompt || "");
      setSampler(model.generation?.sampler || "Euler a");
      setStepsMin(model.generation?.steps_min ?? 20);
      setStepsMax(model.generation?.steps_max ?? 30);
      setCfgMin(model.generation?.cfg_min ?? 3.5);
      setCfgMax(model.generation?.cfg_max ?? 7.0);
      setClipSkip(model.generation?.clip_skip ?? 1);

      setCommercial(model.permissions?.commercial ?? true);
      setSellModel(model.permissions?.sell_model ?? false);
      setRemix(model.permissions?.remix ?? false);
      setGenerationServices(model.permissions?.generation_services ?? true);
      setAllowDownload(model.permissions?.allow_download ?? true);
      setCreditRequired(model.permissions?.credit_required ?? true);

      refreshEnclave();
    }
  }, [open, model]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  const refreshEnclave = () => {
    setScanning(true);
    setScanError(null);
    Promise.allSettled([
      api.listLocalModels("", "vae"),
      api.getModels("vae"),
      api.listLocalModels("", "text_encoders"),
      api.getModels("text_encoders"),
      api.getClipOptions(),
      api.listSelectableModels(),
    ])
      .then(([vaeLocalRes, vaeComfyRes, encLocalRes, encComfyRes, clipRes, baseRes]) => {
        const vSet = new Set<string>();
        if (vaeLocalRes.status === "fulfilled" && vaeLocalRes.value?.items) {
          vaeLocalRes.value.items.forEach((x) => x.filename && vSet.add(x.filename));
        }
        if (vaeComfyRes.status === "fulfilled" && Array.isArray(vaeComfyRes.value)) {
          vaeComfyRes.value.forEach((x) => x && vSet.add(x));
        }
        setVaeOptions(Array.from(vSet));

        const eSet = new Set<string>();
        if (encLocalRes.status === "fulfilled" && encLocalRes.value?.items) {
          encLocalRes.value.items.forEach((x) => x.filename && eSet.add(x.filename));
        }
        if (encComfyRes.status === "fulfilled" && Array.isArray(encComfyRes.value)) {
          encComfyRes.value.forEach((x) => x && eSet.add(x));
        }
        if (clipRes.status === "fulfilled" && clipRes.value?.encoders) {
          clipRes.value.encoders.forEach((x) => eSet.add(x));
        }
        setEncoderOptions(Array.from(eSet));

        if (clipRes.status === "fulfilled" && clipRes.value?.types?.length) {
          setClipTypeOptions(clipRes.value.types);
        }

        if (baseRes.status === "fulfilled" && Array.isArray(baseRes.value)) {
          setBaseOptions(
            baseRes.value.filter(
              (item) => item.model_type === "Checkpoint" || item.model_type === "SVD",
            ),
          );
        }
      })
      .catch((err) => {
        setScanError(err instanceof Error ? err.message : "Failed to scan ComfyUI enclave");
      })
      .finally(() => {
        setScanning(false);
      });
  };

  const handleAddTag = () => {
    const val = tagInput.trim().replace(/^,+|,+$/g, "");
    if (!val) return;
    if (tags.length >= 32) return;
    if (!tags.includes(val)) {
      setTags((prev) => [...prev, val]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleAddTriggerWord = () => {
    const val = triggerInput.trim().replace(/^,+|,+$/g, "");
    if (!val) return;
    if (!triggerWords.includes(val)) {
      setTriggerWords((prev) => [...prev, val]);
    }
    setTriggerInput("");
  };

  const handleRemoveTriggerWord = (twToRemove: string) => {
    setTriggerWords((prev) => prev.filter((t) => t !== twToRemove));
  };

  const activeVersion =
    currentModel.versions.find((v) => v.version_id === selectedVersionId) ||
    currentModel.versions[0];
  const currentSamples = activeVersion?.samples || [];
  const currentCover = currentSamples[0] || null;

  const handleSetCover = async (sampleId: string) => {
    if (!activeVersion) return;
    setSampleActionId(sampleId);
    setError(null);
    try {
      const updated = await api.setCoverModelSample(
        currentModel.model_id,
        activeVersion.version_id,
        sampleId
      );
      setCurrentModel(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set cover");
    } finally {
      setSampleActionId(null);
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeVersion) return;
    setUploadingCover(true);
    setError(null);
    try {
      const updated = await api.uploadModelSample(
        currentModel.model_id,
        activeVersion.version_id,
        file,
        { role: "showcase" },
        true
      );
      setCurrentModel(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload cover thumbnail");
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  };

  const handleUploadSamples = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeVersion) return;
    setUploadingSamples(true);
    setError(null);
    try {
      let lastUpdated = currentModel;
      for (let i = 0; i < files.length; i++) {
        lastUpdated = await api.uploadModelSample(
          currentModel.model_id,
          activeVersion.version_id,
          files[i],
          { role: "showcase" },
          false
        );
      }
      setCurrentModel(lastUpdated);
      onUpdated(lastUpdated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload showcase images");
    } finally {
      setUploadingSamples(false);
      e.target.value = "";
    }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!activeVersion) return;
    if (!confirm("Are you sure you want to delete this sample image?")) return;
    setSampleActionId(sampleId);
    setError(null);
    try {
      await api.deleteModelSample(
        currentModel.model_id,
        activeVersion.version_id,
        sampleId
      );
      const updatedModel: CreatorModel = {
        ...currentModel,
        versions: currentModel.versions.map((v) =>
          v.version_id === activeVersion.version_id
            ? { ...v, samples: v.samples.filter((s) => s.sample_id !== sampleId) }
            : v
        ),
      };
      setCurrentModel(updatedModel);
      onUpdated(updatedModel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sample");
    } finally {
      setSampleActionId(null);
    }
  };

  const handleMoveSample = async (fromIdx: number, toIdx: number) => {
    if (!activeVersion) return;
    if (toIdx < 0 || toIdx >= currentSamples.length) return;
    const reordered = [...currentSamples];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const sampleIds = reordered.map((s) => s.sample_id);

    try {
      const updated = await api.reorderModelSamples(
        currentModel.model_id,
        activeVersion.version_id,
        sampleIds
      );
      setCurrentModel(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder samples");
    }
  };

  const handleOpenPromptModal = (sample: ModelSample) => {
    setEditingSample(sample);
    const meta = (sample.metadata || {}) as Record<string, any>;
    setSamplePrompt(typeof meta.prompt === "string" ? meta.prompt : "");
    setSampleNegativePrompt(typeof meta.negative_prompt === "string" ? meta.negative_prompt : "");
    setSampleSeed(meta.seed !== undefined && meta.seed !== null ? String(meta.seed) : "");
    setSampleSampler(typeof meta.sampler === "string" ? meta.sampler : "");
    setSampleCfg(meta.cfg !== undefined && meta.cfg !== null ? String(meta.cfg) : "");
    setSampleSteps(meta.steps !== undefined && meta.steps !== null ? String(meta.steps) : "");
  };

  const handleSaveSamplePrompt = async () => {
    if (!editingSample || !activeVersion) return;
    try {
      const patchData: Record<string, any> = {
        ...(editingSample.metadata || {}),
        prompt: samplePrompt.trim() || undefined,
        negative_prompt: sampleNegativePrompt.trim() || undefined,
        seed: sampleSeed.trim() ? Number(sampleSeed.trim()) : undefined,
        sampler: sampleSampler.trim() || undefined,
        cfg: sampleCfg.trim() ? Number(sampleCfg.trim()) : undefined,
        steps: sampleSteps.trim() ? Number(sampleSteps.trim()) : undefined,
      };
      const updated = await api.patchModelSample(
        currentModel.model_id,
        activeVersion.version_id,
        editingSample.sample_id,
        patchData
      );
      setCurrentModel(updated);
      onUpdated(updated);
      setEditingSample(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sample prompt");
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Model title cannot be blank");
      setActiveTab(1);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const resolvedBaseKeyParts = selectedBaseKey ? selectedBaseKey.split(":") : [];

      const payload: Partial<CreatorModelPayload> = {
        title: title.trim(),
        description: description.trim(),
        category,
        model_type: model.model_type,
        tags,
        compatibility: {
          base_model: resolvedBaseModel,
          base_model_id: resolvedBaseKeyParts[0] || null,
          base_version_id: resolvedBaseKeyParts[1] || null,
          base_file_id: resolvedBaseKeyParts[2] || null,
          vae: isCustomVae ? customVae.trim() || null : vae.trim() || null,
          text_encoder: isCustomEncoder ? customEncoder.trim() || null : textEncoder.trim() || null,
          clip_type: clipType.trim() || null,
          parent_model: model.compatibility?.parent_model || null,
        },
        generation: {
          trigger_words: triggerWords,
          sampler,
          steps_min: Number(stepsMin),
          steps_max: Number(stepsMax),
          cfg_min: Number(cfgMin),
          cfg_max: Number(cfgMax),
          clip_skip: Number(clipSkip),
          prompt: recommendedPrompt.trim(),
          negative_prompt: recommendedNegative.trim(),
        },
        permissions: {
          commercial,
          sell_model: sellModel,
          remix,
          generation_services: generationServices,
          allow_download: allowDownload,
          credit_required: creditRequired,
        },
        visibility,
      };

      let updated = await api.updateCreatorModel(model.model_id, payload);

      if (visibility !== model.visibility) {
        updated = await api.publishCreatorModel(model.model_id, visibility);
      }

      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update model settings");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Model Drawer"
      className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={drawerRef}
        className="relative flex h-full w-full max-w-3xl lg:max-w-4xl flex-col border-l border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* Header Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--accent)] shadow-sm">
              <Sliders className="h-4 w-4 stroke-[2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold tracking-widest text-[var(--accent)] uppercase">
                  MODEL SETTINGS
                </span>
                <span className="font-mono text-[9px] text-[var(--line-strong)]">/</span>
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">
                  {model.model_type}
                </span>
              </div>
              <h2 className="truncate font-mono text-xs font-bold tracking-wider text-[var(--ink)] uppercase">
                {title || model.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-[10px] text-[var(--ink-soft)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              Live Sync Ready
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close panel"
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-40"
              title="Close Drawer (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Step Stepper Navigation Bar */}
        <StudioStepperTabs
          steps={EDIT_MODEL_TABS}
          activeStep={activeTab}
          onStepChange={(newTab) => setActiveTab(newTab as 1 | 2 | 3 | 4 | 5)}
          busy={saving}
          mode="tabs"
          ariaLabel="Edit model navigation"
        />

        {/* Scrollable Content Body */}
        <div className="workspace-scroll flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-[5px] border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-xs text-[var(--danger)]"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: IDENTITY & METADATA */}
          {activeTab === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                  Model Title <span className="text-[var(--accent)]">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cyberpunk Cinematic Lighting, RealVisV5..."
                  className="workspace-field h-9 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none transition-colors"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Model Description
                  </label>
                  <span
                    className={`font-mono text-[10px] ${description.length >= 5000
                      ? "text-[var(--danger)] font-bold"
                      : "text-[var(--ink-faint)]"
                      }`}
                  >
                    {description.length} / 5000
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
                  placeholder="Detailed markdown description, training nuances, aesthetic directions, and tips for best results…"
                  className="workspace-field w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none resize-y leading-relaxed"
                />
                <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                  Supports multiple paragraphs and formatting. Empty descriptions will display a default placeholder on the view page.
                </p>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                  Category
                </label>
                <CustomSelect
                  value={category}
                  onChange={(val) => setCategory(val as CreatorModelCategory)}
                  options={CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                  className="w-full"
                  buttonClassName="w-full h-9 rounded-[5px] text-xs font-mono"
                />
              </div>

              {/* Tags Manager */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Tags Manager
                  </label>
                  <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                    {tags.length} / 32 tags
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Type tag and press Enter or comma…"
                    disabled={tags.length >= 32}
                    className="workspace-field h-8 flex-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim() || tags.length >= 32}
                    className="inline-flex items-center gap-1.5 h-8 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-mono text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-xs text-[var(--ink)]"
                      >
                        <span>#{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-[var(--ink-faint)] hover:text-[var(--danger)] transition-colors"
                          title={`Remove #${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SHOWCASE & MEDIA */}
          {activeTab === 2 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Version Switcher if multiple versions */}
              {currentModel.versions.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="font-mono text-[10px] font-bold text-[var(--ink-soft)] uppercase">
                    Target Release Version:
                  </label>
                  <CustomSelect
                    value={selectedVersionId}
                    onChange={(val) => setSelectedVersionId(val)}
                    options={currentModel.versions.map((v) => ({
                      value: v.version_id,
                      label: `${v.name} (${v.samples.length} samples)`,
                    }))}
                    className="w-48"
                  />
                </div>
              )}

              {/* Primary Cover Thumbnail Showcase Card */}
              <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Primary Catalog Cover Thumbnail
                    </label>
                    <p className="font-mono text-[9px] text-[var(--ink-faint)] mt-0.5">
                      The hero image displayed on catalog grids, search cards, and social previews.
                    </p>
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-sm">
                    {uploadingCover ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                        <span>Uploading Cover…</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span>Quick Replace Cover</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingCover}
                      onChange={handleUploadCover}
                    />
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                  <div className="relative h-44 w-44 shrink-0 overflow-hidden rounded-[5px] border border-[var(--line-strong)] bg-black/40 shadow-inner">
                    {currentCover ? (
                      <>
                        <img
                          src={currentCover.url}
                          alt="Primary Thumbnail Cover"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-[var(--accent)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--accent-ink)] shadow-md">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          ★ Cover
                        </span>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-3 text-center">
                        <ImageIcon className="h-8 w-8 text-[var(--ink-faint)] mb-1" />
                        <span className="font-mono text-[10px] text-[var(--ink-soft)]">
                          No cover set
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 text-xs font-mono">
                    <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-3 space-y-1.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[var(--ink-faint)] uppercase">Filename</span>
                        <span className="font-bold text-[var(--ink)] truncate max-w-[200px]">
                          {currentCover?.filename || "None"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[var(--ink-faint)] uppercase">Status</span>
                        <span className="text-[var(--accent)] font-semibold">
                          {currentCover ? "Active in Catalog" : "Awaiting Cover Media"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[var(--ink-faint)] uppercase">Position</span>
                        <span className="text-[var(--ink-soft)]">
                          {currentCover ? "Slot 1 (Hero Index)" : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="text-[9px] text-[var(--ink-faint)] leading-relaxed">
                      💡 Tip: Click <strong>"Set as Cover"</strong> on any sample below to promote it to the primary catalog thumbnail.
                    </p>
                  </div>
                </div>
              </div>

              {/* Showcase Gallery Samples Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Showcase Gallery ({currentSamples.length})
                    </label>
                    <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                      Samples attached to this model release.
                    </p>
                  </div>

                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1 font-mono text-[11px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                    {uploadingSamples ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />
                        <span>Uploading…</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3 text-[var(--accent)]" />
                        <span>Add Samples</span>
                      </>
                    )}
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingSamples}
                      onChange={handleUploadSamples}
                    />
                  </label>
                </div>

                {currentSamples.length === 0 ? (
                  <div className="rounded-[5px] border border-dashed border-[var(--line)] bg-[var(--surface-sunken)] p-8 text-center space-y-2">
                    <ImageIcon className="mx-auto h-8 w-8 text-[var(--ink-faint)]" />
                    <p className="font-mono text-xs font-bold text-[var(--ink-soft)]">
                      No showcase images uploaded
                    </p>
                    <p className="font-mono text-[10px] text-[var(--ink-faint)] max-w-sm mx-auto">
                      Upload example generations or test outputs to show other creators what this model can produce.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {currentSamples.map((sample, idx) => {
                      const isCover = idx === 0;
                      const isBusy = sampleActionId === sample.sample_id;
                      const promptExcerpt =
                        typeof sample.metadata?.prompt === "string"
                          ? sample.metadata.prompt
                          : "";

                      return (
                        <div
                          key={sample.sample_id || idx}
                          className={`group relative flex flex-col overflow-hidden rounded-[5px] border transition-all ${
                            isCover
                              ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-md"
                              : "border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)]"
                          }`}
                        >
                          {/* Image preview */}
                          <div className="relative aspect-square w-full overflow-hidden bg-black/50">
                            <img
                              src={sample.url}
                              alt={sample.filename}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />

                            {/* Badge */}
                            {isCover ? (
                              <span className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 rounded bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[var(--accent-ink)] shadow">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Cover
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleSetCover(sample.sample_id)}
                                className="absolute top-1.5 left-1.5 z-10 opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[8px] font-bold text-white hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-all shadow"
                                title="Promote to primary catalog thumbnail"
                              >
                                <Star className="h-2.5 w-2.5" />
                                Set Cover
                              </button>
                            )}

                            {/* Delete button */}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteSample(sample.sample_id)}
                              className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded bg-black/75 text-white/80 hover:bg-[var(--danger)] hover:text-white transition-all shadow"
                              title="Delete sample"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Footer details & actions */}
                          <div className="p-2 space-y-1.5 bg-[var(--surface)]">
                            <p className="truncate font-mono text-[10px] text-[var(--ink)] font-semibold" title={sample.filename}>
                              {sample.filename}
                            </p>

                            {promptExcerpt ? (
                              <p className="line-clamp-1 font-mono text-[9px] text-[var(--ink-faint)]" title={promptExcerpt}>
                                💬 {promptExcerpt}
                              </p>
                            ) : (
                              <p className="font-mono text-[9px] text-[var(--ink-faint)] italic">
                                No prompt attached
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t border-[var(--line)]">
                              <button
                                type="button"
                                onClick={() => handleOpenPromptModal(sample)}
                                className="flex items-center gap-1 text-[9px] font-mono font-semibold text-[var(--accent)] hover:underline"
                              >
                                <Edit3 className="h-2.5 w-2.5" />
                                <span>Prompt</span>
                              </button>

                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  disabled={idx === 0 || isBusy}
                                  onClick={() => handleMoveSample(idx, idx - 1)}
                                  className="h-5 w-5 rounded flex items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-sunken)] disabled:opacity-20"
                                  title="Move earlier"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === currentSamples.length - 1 || isBusy}
                                  onClick={() => handleMoveSample(idx, idx + 1)}
                                  className="h-5 w-5 rounded flex items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-sunken)] disabled:opacity-20"
                                  title="Move later"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ARCHITECTURE & CONDITIONING */}
          {activeTab === 3 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Scan / Rescan Enclave Bar */}
              <div className="flex items-center justify-between rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <span className="font-mono text-xs font-bold text-[var(--ink)] block">
                      ComfyUI Model Enclave
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      {vaeOptions.length} VAEs · {encoderOptions.length} text encoders detected
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshEnclave}
                  disabled={scanning}
                  className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} />
                  <span>Rescan</span>
                </button>
              </div>

              {scanError && (
                <p className="font-mono text-[10px] text-[var(--danger)]">{scanError}</p>
              )}

              {/* Base Architecture */}
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
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
                    className="mt-2 workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                  />
                )}
              </div>

              {/* Video Backbone Profile (advisory) */}
              {showVideoBanner && activeVideoFamily && (
                <div className="flex items-start gap-3 rounded-[5px] border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-3">
                  <Film className="h-4 w-4 shrink-0 text-[var(--accent)] mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30">
                        [VIDEO BACKBONE · {activeVideoFamily.replace(/-/g, " ").toUpperCase()}]
                      </span>
                    </div>
                    <p className="font-mono text-[10px] leading-relaxed text-[var(--ink-soft)]">
                      Video generations run the bundled LTX-Video 2.3 graph, which loads its own transformer, VAE and text encoder. The values below are recorded as metadata so the gallery and the studio picker show what this model needs — they do not drive the video render.
                    </p>
                  </div>
                </div>
              )}

              {/* Adapter Enclave Selector */}
              {isAdapterModelType(model.model_type) && (
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Tested / Recommended Checkpoint{" "}
                      <span className="text-[var(--accent)] font-semibold">(Optional)</span>
                    </label>
                  </div>
                  <CustomSelect
                    value={selectedBaseKey}
                    onChange={(val) => setSelectedBaseKey(val)}
                    options={[
                      { value: "", label: `Universal / Any ${resolvedBaseModel || "Compatible"} Checkpoint` },
                      ...baseOptions
                        .filter((opt) => !resolvedBaseModel || isArchitectureCompatible(opt.base_model || opt.filename, resolvedBaseModel))
                        .map((opt) => ({
                          value: `${opt.model_id}:${opt.version_id}:${opt.file_id}`,
                          label: `${opt.title} · ${getBaseFilename(opt.filename)} (${opt.model_type})`,
                        })),
                    ]}
                    className="w-full"
                    buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                  />
                  <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                    LoRAs are compatible with any checkpoint sharing this base architecture ({resolvedBaseModel}). Specifying an installed checkpoint is optional and helps auto-inherit tested generation hyperparameters.
                  </p>
                </div>
              )}

              {/* Paired VAE Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Paired VAE (.safetensors, .sft)
                  </label>
                  <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                    {vaeOptions.length} detected
                  </span>
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
                    { value: "", label: "None / Bundled in Checkpoint" },
                    ...displayedVaeOptions.map((vp) => ({ value: vp, label: vp })),
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
                      setCustomVae(e.target.value);
                      setVae(e.target.value);
                    }}
                    placeholder="e.g. ae.sft, ae.safetensors, sdxl_vae.safetensors…"
                    className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                  />
                )}
              </div>

              {/* Text Encoder / CLIP Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Text Encoder / CLIP (.safetensors, .sft)
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
                      { value: "", label: "None / Bundled in Checkpoint" },
                      ...encoderOptions.map((enc) => ({ value: enc, label: enc })),
                      { value: "__custom__", label: "Custom Text Encoder filename…" },
                    ]}
                    className="w-full"
                    buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                  />
                  {isCustomEncoder && (
                    <input
                      type="text"
                      value={customEncoder}
                      onChange={(e) => {
                        setCustomEncoder(e.target.value);
                        setTextEncoder(e.target.value);
                      }}
                      placeholder="e.g. t5xxl_fp8_e4m3fn.sft, clip_l.safetensors…"
                      className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    CLIP Type Protocol
                  </label>
                  <CustomSelect
                    value={clipType}
                    onChange={(val) => setClipType(val)}
                    options={[
                      { value: "", label: "Auto / Standard" },
                      ...displayedClipTypeOptions.map((ct) => ({ value: ct, label: ct })),
                    ]}
                    className="w-full"
                    buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PROMPTS & PRESETS */}
          {activeTab === 4 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {!promptable ? (
                <div className="flex items-start gap-3 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-4">
                  <FileCode className="h-5 w-5 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      Non-Promptable Asset ({model.model_type})
                    </h4>
                    <p className="font-mono text-xs leading-relaxed text-[var(--ink-soft)]">
                      Prompts and generation parameter presets (trigger words, samplers, steps, CFG) are not applicable for {model.model_type} assets. Conditioning is applied structurally through workflow nodes rather than prompt conditioning.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Trigger Words Manager */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Recommended Trigger Words
                      </label>
                      <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">
                        {triggerWords.length} active
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={triggerInput}
                        onChange={(e) => setTriggerInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            handleAddTriggerWord();
                          }
                        }}
                        placeholder="e.g. porcelain doll, ethereal lighting…"
                        className="workspace-field h-8 flex-1 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddTriggerWord}
                        disabled={!triggerInput.trim()}
                        className="inline-flex items-center gap-1.5 h-8 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-mono text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add</span>
                      </button>
                    </div>

                    {triggerWords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {triggerWords.map((tw) => (
                          <span
                            key={tw}
                            className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-xs font-bold text-[var(--accent)]"
                          >
                            <span>{tw}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTriggerWord(tw)}
                              className="text-[var(--accent)]/70 hover:text-[var(--danger)] transition-colors"
                              title={`Remove ${tw}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recommended Prompt Template */}
                  <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                    <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Recommended Prompt Template
                    </label>
                    <textarea
                      rows={3}
                      value={recommendedPrompt}
                      onChange={(e) => setRecommendedPrompt(e.target.value)}
                      placeholder="e.g. Masterpiece, portrait of a delicate porcelain character, ethereal natural studio lighting, ultra detailed..."
                      className="workspace-field w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none resize-none"
                    />
                  </div>

                  {/* Recommended Negative Prompt */}
                  <div className="space-y-1.5">
                    <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Recommended Negative Prompt
                    </label>
                    <textarea
                      rows={2}
                      value={recommendedNegative}
                      onChange={(e) => setRecommendedNegative(e.target.value)}
                      placeholder="e.g. blurry, deformed, bad anatomy, lowres, oversaturated..."
                      className="workspace-field w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none resize-none"
                    />
                  </div>

                  {/* Sampler & Clip Skip */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--line)]">
                    <div className="space-y-1.5">
                      <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Recommended Sampler
                      </label>
                      <CustomSelect
                        value={sampler}
                        onChange={setSampler}
                        options={SAMPLER_OPTIONS}
                        className="w-full"
                        buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Clip Skip
                      </label>
                      <div className="flex gap-2">
                        {[1, 2].map((cs) => (
                          <button
                            key={cs}
                            type="button"
                            onClick={() => setClipSkip(cs)}
                            className={`h-8 flex-1 rounded-[5px] font-mono text-xs font-bold transition-all ${clipSkip === cs
                              ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                              : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                              }`}
                          >
                            Clip Skip {cs}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Steps & CFG Ranges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Min Steps
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={150}
                        value={stepsMin}
                        onChange={(e) => setStepsMin(Number(e.target.value))}
                        className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-xs text-[var(--ink)] tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Max Steps
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={150}
                        value={stepsMax}
                        onChange={(e) => setStepsMax(Number(e.target.value))}
                        className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-xs text-[var(--ink)] tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Min CFG
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min={1}
                        max={30}
                        value={cfgMin}
                        onChange={(e) => setCfgMin(Number(e.target.value))}
                        className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-xs text-[var(--ink)] tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                        Max CFG
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min={1}
                        max={30}
                        value={cfgMax}
                        onChange={(e) => setCfgMax(Number(e.target.value))}
                        className="workspace-field h-8 w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-xs text-[var(--ink)] tabular-nums"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 5: LICENSING & PERMISSIONS */}
          {activeTab === 5 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Catalog Visibility */}
              <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--line)]">
                  <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                    <Globe className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                      Catalog Visibility & Access
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      Control whether this model is publicly discoverable in the gallery or kept private
                    </span>
                  </div>
                </div>

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

              {/* Licensing Terms & Creator Governance */}
              <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--line)]">
                  <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--accent)]">
                    <Shield className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] block">
                      Licensing Terms & Creator Governance
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      Control how the community may utilize, monetize, remix, and run inference
                    </span>
                  </div>
                </div>

                <div className="space-y-2 font-mono text-[11px]">
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

                  {/* 4. Solo Studio Generation Services */}
                  <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] transition-all">
                    <div>
                      <span className="text-[var(--ink)] font-bold block text-[11px]">
                        Solo Studio Generation Services
                      </span>
                      <span className="text-[9px] text-[var(--ink-faint)]">
                        Allow hosting and running this model on Solo Studio online generation services
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

        {/* Sample Metadata Modal */}
        {editingSample && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          >
            <div className="relative w-full max-w-lg rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                    Edit Sample Generation Metadata
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSample(null)}
                  className="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--ink-soft)] uppercase">
                    Positive Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={samplePrompt}
                    onChange={(e) => setSamplePrompt(e.target.value)}
                    placeholder="Describe what was in the generation prompt…"
                    className="workspace-field w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--ink-soft)] uppercase">
                    Negative Prompt
                  </label>
                  <textarea
                    rows={2}
                    value={sampleNegativePrompt}
                    onChange={(e) => setSampleNegativePrompt(e.target.value)}
                    placeholder="Undesired elements…"
                    className="workspace-field w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-[var(--ink-soft)] uppercase">Seed</label>
                    <input
                      type="text"
                      value={sampleSeed}
                      onChange={(e) => setSampleSeed(e.target.value)}
                      placeholder="e.g. 42"
                      className="workspace-field h-8 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-[var(--ink-soft)] uppercase">Steps</label>
                    <input
                      type="text"
                      value={sampleSteps}
                      onChange={(e) => setSampleSteps(e.target.value)}
                      placeholder="e.g. 25"
                      className="workspace-field h-8 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-[var(--ink-soft)] uppercase">CFG</label>
                    <input
                      type="text"
                      value={sampleCfg}
                      onChange={(e) => setSampleCfg(e.target.value)}
                      placeholder="e.g. 6.5"
                      className="workspace-field h-8 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-[var(--ink-soft)] uppercase">Sampler</label>
                    <input
                      type="text"
                      value={sampleSampler}
                      onChange={(e) => setSampleSampler(e.target.value)}
                      placeholder="e.g. Euler a"
                      className="workspace-field h-8 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
                <button
                  type="button"
                  onClick={() => setEditingSample(null)}
                  className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSamplePrompt}
                  className="rounded-[5px] bg-[var(--accent)] px-4 py-1.5 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
                >
                  Save Metadata
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Footer */}
        <footer className="flex h-16 shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--surface-raised)] px-6">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--ink-faint)]">
              Changes apply across all version releases and catalog listings.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-9 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-4 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface)] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="inline-flex items-center gap-2 h-9 rounded-[5px] bg-[var(--accent)] px-5 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all disabled:opacity-40 shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving Changes…</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
