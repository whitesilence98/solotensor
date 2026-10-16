"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  Cpu,
  FileArchive,
  FileImage,
  FolderDown,
  HardDrive,
  Info,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  type CreatorModel,
  type CreatorModelCategory,
  type CreatorModelCompatibility,
  type CreatorModelGeneration,
  type CreatorModelPermissions,
  type CreatorModelType,
  type CreatorModelPayload,
  type LocalModelSummary,
  type ModelVisibility,
} from "@/lib/api";
import TensorModelCard from "@/components/TensorModelCard";
import CustomSelect from "@/components/CustomSelect";

const baseModelPresets = [
  "FLUX.1",
  "Stable Diffusion XL (SDXL)",
  "Stable Diffusion 1.5 (SD 1.5)",
  "Stable Diffusion 3.5",
  "Pony Diffusion V6 XL",
  "Illustrious XL",
  "Wan 2.1 / Wan 2.8",
  "Z-Image / Z-Image-Turbo",
  "Qwen-Image-2.1",
  "Hunyuan-DiT",
];

const modelTypes: CreatorModelType[] = [
  "Checkpoint",
  "LoRA",
  "LyCORIS",
  "Diffusion Model",
  "VAE",
  "Embedding",
];

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Identity & Architecture
  const [title, setTitle] = useState("");
  const [modelType, setModelType] = useState<CreatorModelType>("Checkpoint");
  const [category, setCategory] = useState<CreatorModelCategory>("General");
  const [baseModel, setBaseModel] = useState("Stable Diffusion XL (SDXL)");
  const [customBaseModel, setCustomBaseModel] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

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

  // Step 3: Files & Weights
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState<LocalModelSummary | null>(null);
  const [showLocalPicker, setShowLocalPicker] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [localFiles, setLocalFiles] = useState<LocalModelSummary[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Step 4: Showcase & Permissions
  const [showcaseFile, setShowcaseFile] = useState<File | null>(null);
  const [showcasePreview, setShowcasePreview] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ModelVisibility>("Public");
  const [commercial, setCommercial] = useState(true);
  const [remix, setRemix] = useState(false);
  const [creditRequired, setCreditRequired] = useState(true);

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

  // Handle showcase preview cleanup
  useEffect(() => {
    if (!showcaseFile) {
      setShowcasePreview(null);
      return;
    }
    const url = URL.createObjectURL(showcaseFile);
    setShowcasePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [showcaseFile]);

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
  const comfyCategory =
    modelType === "Checkpoint"
      ? "checkpoints"
      : modelType === "Diffusion Model"
        ? "diffusion_models"
        : modelType === "LoRA" || modelType === "LyCORIS"
          ? "loras"
          : modelType === "VAE"
            ? "vae"
            : "embeddings";

  // Scan local ComfyUI models when picker opens
  useEffect(() => {
    if (!showLocalPicker || !open) return;
    let cancelled = false;
    setLocalLoading(true);
    setLocalError(null);
    api
      .listLocalModels(localSearch, comfyCategory)
      .then((res) => {
        if (!cancelled) setLocalFiles(res.items || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setLocalFiles([]);
          setLocalError(err instanceof Error ? err.message : "Could not scan ComfyUI files");
        }
      })
      .finally(() => {
        if (!cancelled) setLocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showLocalPicker, localSearch, comfyCategory, open]);

  // Tag helper
  const addTag = () => {
    const clean = tagInput.trim().toLowerCase();
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput("");
  };

  // Trigger word helper
  const addTriggerWord = () => {
    const clean = triggerInput.trim();
    if (clean && !triggerWords.includes(clean)) {
      setTriggerWords([...triggerWords, clean]);
    }
    setTriggerInput("");
  };

  // Submission Pipeline
  const submit = async () => {
    const modelTitle = title.trim() || (selectedLocalFile ? selectedLocalFile.filename.replace(/\.[^/.]+$/, "") : "Untitled model");
    setBusy(true);
    setError(null);

    try {
      const activeBaseModel = baseModel === "Other / Custom" ? customBaseModel.trim() || "Universal" : baseModel;

      const payload: CreatorModelPayload = {
        title: modelTitle,
        category,
        model_type: modelType,
        tags,
        compatibility: {
          base_model: activeBaseModel,
          base_model_id: null,
          base_version_id: null,
          base_file_id: null,
          vae: null,
          text_encoder: null,
          clip_type: null,
          parent_model: null,
        },
        generation: {
          trigger_words: modelType === "LoRA" || modelType === "LyCORIS" ? triggerWords : [],
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
          remix,
          generation_services: true,
          credit_required: creditRequired,
        },
        visibility: "Private", // will publish right after
      };

      // 1. Create model metadata
      const created = await api.createCreatorModel(payload);
      const versionId = created.versions[0]?.version_id;

      // 2. Attach weights (local ComfyUI import or uploaded file)
      if (versionId) {
        if (selectedLocalFile) {
          await api.importLocalModelFile(
            created.model_id,
            versionId,
            selectedLocalFile.category,
            selectedLocalFile.filename,
          );
        } else if (uploadedFile) {
          await api.uploadModelFile(created.model_id, versionId, uploadedFile);
        }

        // 3. Attach showcase thumbnail if present
        if (showcaseFile) {
          await api.uploadModelSample(created.model_id, versionId, showcaseFile, {
            role: "showcase",
          });
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publish Creator Model"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={drawerRef}
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl animate-in slide-in-from-right duration-250 ease-out sm:max-w-3xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)] shadow-sm">
              <Box className="h-4 w-4 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold tracking-widest text-[var(--accent)] uppercase">
                  MODEL STUDIO
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

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close panel"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Step Navigation Pill Bar */}
        <div className="flex items-center border-b border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-2">
          <div className="grid w-full grid-cols-4 gap-1.5 font-mono text-[10px]">
            {[
              { s: 1, label: "01 Identity" },
              { s: 2, label: "02 Presets" },
              { s: 3, label: "03 Weights" },
              { s: 4, label: "04 Showcase" },
            ].map(({ s, label }) => {
              const isActive = step === s;
              const isPast = step > s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(s as 1 | 2 | 3 | 4)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-bold transition-all ${
                    isActive
                      ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                      : isPast
                        ? "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:border-[var(--accent)]/50"
                        : "border border-transparent text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                  }`}
                >
                  {isPast ? <Check className="h-3 w-3 text-[var(--accent)]" /> : null}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="mx-5 mt-4 flex items-center justify-between rounded-md border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 font-mono text-xs text-[var(--danger)]"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* STEP 1: IDENTITY & ARCHITECTURE */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3.5">
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                  <Cpu className="h-4 w-4 text-[var(--accent)]" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    MODEL IDENTITY & BASE ARCHITECTURE
                  </span>
                </div>

                {/* Title */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Model Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Cyberpunk Cinematic Lighting, RealVisV5..."
                    className="workspace-field h-7.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none transition-colors"
                  />
                </div>

                {/* Type & Category 2-Column */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Model Type
                    </label>
                    <CustomSelect
                      value={modelType}
                      onChange={(val) => setModelType(val as CreatorModelType)}
                      options={modelTypes.map((t) => ({ value: t, label: t }))}
                      className="w-full"
                      buttonClassName="w-full h-8"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Category
                    </label>
                    <CustomSelect
                      value={category}
                      onChange={(val) => setCategory(val as CreatorModelCategory)}
                      options={categories.map((c) => ({ value: c, label: c }))}
                      className="w-full"
                      buttonClassName="w-full h-8"
                    />
                  </div>
                </div>

                {/* Base Architecture Chips */}
                <div>
                  <label className="mb-1.5 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Base Model Architecture
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {baseModelPresets.map((bp) => {
                      const isSel = baseModel === bp;
                      return (
                        <button
                          key={bp}
                          type="button"
                          onClick={() => setBaseModel(bp)}
                          className={`rounded-md px-2.5 py-1 font-mono text-[10px] transition-colors ${
                            isSel
                              ? "border border-[var(--accent)] bg-[var(--accent)]/15 font-bold text-[var(--accent)]"
                              : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                          }`}
                        >
                          {bp}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setBaseModel("Other / Custom")}
                      className={`rounded-md px-2.5 py-1 font-mono text-[10px] transition-colors ${
                        baseModel === "Other / Custom"
                          ? "border border-[var(--accent)] bg-[var(--accent)]/15 font-bold text-[var(--accent)]"
                          : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                      }`}
                    >
                      Custom…
                    </button>
                  </div>
                  {baseModel === "Other / Custom" && (
                    <input
                      type="text"
                      value={customBaseModel}
                      onChange={(e) => setCustomBaseModel(e.target.value)}
                      placeholder="Enter custom base architecture name…"
                      className="mt-2 workspace-field h-7.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                    />
                  )}
                </div>

                {/* Tags Editor */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Search Tags
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="Type tag and press Enter…"
                      className="workspace-field h-7.5 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="h-7.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-[10px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      Add Tag
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink)]"
                        >
                          #{t}
                          <button
                            type="button"
                            onClick={() => setTags(tags.filter((x) => x !== t))}
                            className="text-[var(--ink-faint)] hover:text-[var(--danger)]"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PRESETS & GENERATION PARAMETERS */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3.5">
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    INFERENCE PRESETS & TRIGGER WORDS
                  </span>
                </div>

                {/* Trigger Words (Essential for LoRAs) */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Recommended Trigger Words {modelType === "LoRA" ? "(Recommended for LoRA)" : "(Optional)"}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={triggerInput}
                      onChange={(e) => setTriggerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTriggerWord();
                        }
                      }}
                      placeholder="e.g. anime girl, retro style, sora-cinematic..."
                      className="workspace-field h-7.5 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={addTriggerWord}
                      className="h-7.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-[10px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      Add Trigger
                    </button>
                  </div>
                  {triggerWords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {triggerWords.map((tw) => (
                        <span
                          key={tw}
                          className="inline-flex items-center gap-1 rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]"
                        >
                          ⚡ {tw}
                          <button
                            type="button"
                            onClick={() =>
                              setTriggerWords(triggerWords.filter((x) => x !== tw))
                            }
                            className="text-[var(--accent)]/60 hover:text-[var(--danger)]"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sampler & Clip Skip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Recommended Sampler
                    </label>
                    <CustomSelect
                      value={sampler}
                      onChange={setSampler}
                      options={[
                        "DPM++ 2M Karras",
                        "Euler a",
                        "Euler",
                        "UniPC",
                        "DPM++ SDE Karras",
                        "LCM",
                      ]}
                      className="w-full"
                      buttonClassName="w-full h-8"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Clip Skip
                    </label>
                    <div className="flex gap-2">
                      {[1, 2].map((cs) => (
                        <button
                          key={cs}
                          type="button"
                          onClick={() => setClipSkip(cs)}
                          className={`h-7.5 flex-1 rounded-md font-mono text-[11px] font-bold transition-colors ${
                            clipSkip === cs
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

                {/* Steps & CFG Range */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Min Steps
                    </label>
                    <input
                      type="number"
                      value={stepsMin}
                      onChange={(e) => setStepsMin(Number(e.target.value))}
                      className="workspace-field h-7.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[11px] text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Max Steps
                    </label>
                    <input
                      type="number"
                      value={stepsMax}
                      onChange={(e) => setStepsMax(Number(e.target.value))}
                      className="workspace-field h-7.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[11px] text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Min CFG
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={cfgMin}
                      onChange={(e) => setCfgMin(Number(e.target.value))}
                      className="workspace-field h-7.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[11px] text-[var(--ink)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Max CFG
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={cfgMax}
                      onChange={(e) => setCfgMax(Number(e.target.value))}
                      className="workspace-field h-7.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] px-2 font-mono text-[11px] text-[var(--ink)]"
                    />
                  </div>
                </div>

                {/* Default Starter Prompt & Negative Prompt */}
                <div>
                  <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                    Recommended Prompt Template
                  </label>
                  <textarea
                    rows={2}
                    value={recommendedPrompt}
                    onChange={(e) => setRecommendedPrompt(e.target.value)}
                    placeholder="Recommended prompt conditioning for best model fidelity…"
                    className="workspace-field w-full rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] p-2 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] outline-none resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: FILES & WEIGHTS */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3.5">
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                  <HardDrive className="h-4 w-4 text-[var(--accent)]" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    MODEL WEIGHTS (.SAFETENSORS / .CKPT)
                  </span>
                </div>

                {/* Attached File Preview if present */}
                {(selectedLocalFile || uploadedFile) && (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface-raised)] text-[var(--accent)]">
                        <Check className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-[var(--ink)]">
                          {selectedLocalFile ? selectedLocalFile.filename : uploadedFile?.name}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--ink-soft)]">
                          {selectedLocalFile
                            ? `Local ComfyUI (${selectedLocalFile.category}) · ${formatBytes(selectedLocalFile.size)}`
                            : uploadedFile
                              ? `Uploaded file · ${formatBytes(uploadedFile.size)}`
                              : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocalFile(null);
                        setUploadedFile(null);
                      }}
                      className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[10px] text-[var(--danger)] hover:bg-[var(--danger-surface)]"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {/* Option A: Dropzone for Upload */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 p-4 text-center transition hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".safetensors,.ckpt,.pt,.bin"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setUploadedFile(f);
                        setSelectedLocalFile(null);
                      }
                      e.target.value = "";
                    }}
                  />
                  <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                    <Upload className="h-3.5 w-3.5" />
                  </div>
                  <p className="font-mono text-[11px] font-semibold text-[var(--ink)]">
                    Upload .safetensors or .ckpt file
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">
                    Direct local storage upload into SoloTensor vault
                  </p>
                </div>

                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-[var(--line)]" />
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                    OR 1-CLICK INSTANT IMPORT
                  </span>
                  <div className="flex-1 h-px bg-[var(--line)]" />
                </div>

                {/* Option B: Local ComfyUI Directory Explorer */}
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[11px] font-bold text-[var(--ink)]">
                        Local ComfyUI Vault Explorer
                      </p>
                      <p className="text-[10px] text-[var(--ink-faint)]">
                        Scan your local <span className="font-mono text-[var(--accent)]">{comfyCategory}/</span> folder
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLocalPicker((v) => !v)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[10px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Search className="h-3 w-3" />
                      <span>{showLocalPicker ? "Close Scanner" : "Scan ComfyUI"}</span>
                    </button>
                  </div>

                  {showLocalPicker && (
                    <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
                        <input
                          type="search"
                          value={localSearch}
                          onChange={(e) => setLocalSearch(e.target.value)}
                          placeholder={`Search ${comfyCategory} files…`}
                          className="workspace-field h-7.5 w-full pl-8 pr-3 font-mono text-[11px] bg-[var(--surface)] border border-[var(--line)] rounded-md text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none"
                        />
                      </div>

                      {localLoading ? (
                        <div className="p-4 text-center font-mono text-[11px] text-[var(--ink-faint)] animate-pulse">
                          Scanning ComfyUI model enclave…
                        </div>
                      ) : localError ? (
                        <div className="p-3 rounded border border-[var(--danger-line)] bg-[var(--danger-surface)] font-mono text-[10px] text-[var(--danger)]">
                          {localError}
                        </div>
                      ) : localFiles.length === 0 ? (
                        <div className="p-4 text-center font-mono text-[11px] text-[var(--ink-faint)]">
                          No files found in {comfyCategory}.
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">
                          {localFiles.map((item) => {
                            const isSelected =
                              selectedLocalFile?.filename === item.filename &&
                              selectedLocalFile?.category === item.category;
                            return (
                              <button
                                key={`${item.category}/${item.filename}`}
                                type="button"
                                onClick={() => {
                                  setSelectedLocalFile(item);
                                  setUploadedFile(null);
                                }}
                                className={`flex w-full items-center justify-between p-2 text-left transition-colors ${
                                  isSelected
                                    ? "bg-[var(--accent)]/15 text-[var(--accent)] font-bold"
                                    : "hover:bg-[var(--surface-raised)] text-[var(--ink)]"
                                }`}
                              >
                                <span className="truncate font-mono text-[10px] mr-2">
                                  {item.filename}
                                </span>
                                <span className="shrink-0 font-mono text-[9px] text-[var(--ink-faint)]">
                                  {formatBytes(item.size)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SHOWCASE & PUBLISHING */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Thumbnail & Live Mockup */}
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                    <FileImage className="h-4 w-4 text-[var(--accent)]" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      SHOWCASE COVER & CARD PREVIEW
                    </span>
                  </div>

                  {/* Dropzone for Cover */}
                  <div
                    onClick={() => showcaseInputRef.current?.click()}
                    className="flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 p-3 text-center transition hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                  >
                    <input
                      ref={showcaseInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setShowcaseFile(f);
                        e.target.value = "";
                      }}
                    />
                    <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]">
                      <Upload className="h-3 w-3" />
                    </div>
                    <p className="font-mono text-[11px] font-semibold text-[var(--ink)]">
                      {showcaseFile ? "Change Cover Image" : "Upload Hero Cover Image"}
                    </p>
                    <p className="text-[9px] text-[var(--ink-faint)]">
                      PNG, JPG, WebP 3:4 or 16:9 sample
                    </p>
                  </div>

                  {/* 1:1 Live Preview Card */}
                  <div className="pt-2">
                    <p className="mb-2 font-mono text-[9px] font-bold tracking-wider text-[var(--ink-faint)] uppercase text-center">
                      GALLERY CARD LIVE MOCKUP
                    </p>
                    <div className="w-full max-w-[220px] mx-auto">
                      <TensorModelCard
                        item={{
                          title: title.trim() || "Untitled model",
                          model_type: modelType,
                          category,
                          base_model: baseModel,
                          cover_url: showcasePreview,
                          sample_count: showcasePreview ? 1 : 0,
                        }}
                        isLink={false}
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Rights, Permissions & Recap */}
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm space-y-3.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                    <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      RIGHTS & VISIBILITY
                    </span>
                  </div>

                  {/* Visibility Setting */}
                  <div>
                    <label className="mb-1 block font-mono text-[9px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Gallery Visibility
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setVisibility("Public")}
                        className={`h-7.5 rounded-md font-mono text-[10px] font-bold transition-colors ${
                          visibility === "Public"
                            ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        Public (Gallery)
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibility("Private")}
                        className={`h-7.5 rounded-md font-mono text-[10px] font-bold transition-colors ${
                          visibility === "Private"
                            ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                        }`}
                      >
                        Private (Draft)
                      </button>
                    </div>
                  </div>

                  {/* Permissions Toggles */}
                  <div className="space-y-2 pt-2 border-t border-[var(--line)] font-mono text-[11px]">
                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[var(--surface-sunken)]">
                      <span className="text-[var(--ink)]">Allow commercial use</span>
                      <input
                        type="checkbox"
                        checked={commercial}
                        onChange={(e) => setCommercial(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[var(--surface-sunken)]">
                      <span className="text-[var(--ink)]">Allow remix / merges</span>
                      <input
                        type="checkbox"
                        checked={remix}
                        onChange={(e) => setRemix(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[var(--surface-sunken)]">
                      <span className="text-[var(--ink)]">Attribution required</span>
                      <input
                        type="checkbox"
                        checked={creditRequired}
                        onChange={(e) => setCreditRequired(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </label>
                  </div>

                  {/* Specs Summary */}
                  <div className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 font-mono text-[10px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-faint)]">Type & Arch:</span>
                      <span className="text-[var(--ink)]">{modelType} • {baseModel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-faint)]">Weights File:</span>
                      <span className="text-[var(--accent)] truncate max-w-[150px]">
                        {selectedLocalFile ? selectedLocalFile.filename : uploadedFile ? uploadedFile.name : "None attached"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ink-faint)]">Trigger Words:</span>
                      <span className="text-[var(--ink)]">
                        {triggerWords.length ? triggerWords.join(", ") : "None"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-raised)] px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[11px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors disabled:opacity-40"
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

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                disabled={step === 1 && !title.trim()}
                onClick={() => setStep((s) => (s + 1) as 2 | 3 | 4)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
              >
                <span>Next Step</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !title.trim()}
                onClick={() => void submit()}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)] disabled:opacity-40"
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
