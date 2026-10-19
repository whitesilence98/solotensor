"use client";

import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import {
  api,
  type CreatorModel,
  type CreatorModelPayload,
  type CreatorModelCategory,
  type ModelVisibility,
  type InstalledGalleryModel,
} from "@/lib/api";
import CustomSelect from "@/components/CustomSelect";
import HierarchicalSelect from "@/components/HierarchicalSelect";
import { BASE_MODEL_ARCHITECTURES } from "@/lib/baseModelArchitectures";

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
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab 1: Identity & Metadata
  const [title, setTitle] = useState(model.title);
  const [description, setDescription] = useState(model.description || "");
  const [category, setCategory] = useState<CreatorModelCategory>(model.category);
  const [tags, setTags] = useState<string[]>(model.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState<ModelVisibility>(model.visibility);

  // Tab 2: Architecture & Conditioning
  const [baseModel, setBaseModel] = useState(model.compatibility?.base_model || "Allegro");
  const [customBaseModel, setCustomBaseModel] = useState("");
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
  const [remix, setRemix] = useState(model.permissions?.remix ?? false);
  const [generationServices, setGenerationServices] = useState(model.permissions?.generation_services ?? true);
  const [creditRequired, setCreditRequired] = useState(model.permissions?.credit_required ?? true);

  const drawerRef = useRef<HTMLDivElement>(null);

  // Reset / sync state when model or open prop changes
  useEffect(() => {
    if (open && model) {
      setError(null);
      setTitle(model.title);
      setDescription(model.description || "");
      setCategory(model.category);
      setTags(model.tags || []);
      setTagInput("");
      setVisibility(model.visibility);

      setBaseModel(model.compatibility?.base_model || "Allegro");
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
      setRemix(model.permissions?.remix ?? false);
      setGenerationServices(model.permissions?.generation_services ?? true);
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
      const resolvedBaseModel =
        (baseModel === "Other" || baseModel === "Other / Custom") && customBaseModel.trim()
          ? customBaseModel.trim()
          : baseModel;

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
          remix,
          generation_services: generationServices,
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
                <span className="rounded-[3px] border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--ink-faint)]">
                  {model.model_type}
                </span>
              </div>
              <h2 className="truncate text-sm font-bold text-[var(--ink)]">
                {title || model.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors disabled:opacity-40"
            title="Close Drawer (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Tab Navigation Bar */}
        <div className="flex shrink-0 border-b border-[var(--line)] bg-[var(--surface-sunken)] px-6">
          <nav className="flex space-x-1" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setActiveTab(1)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === 1
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)]"
                  : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Identity & Metadata</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(2)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === 2
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)]"
                  : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Architecture & Conditioning</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(3)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === 3
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)]"
                  : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Prompts & Presets</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(4)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === 4
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)]"
                  : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Licensing & Permissions</span>
            </button>
          </nav>
        </div>

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
                    className={`font-mono text-[10px] ${
                      description.length >= 5000
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

              {/* Visibility Toggle */}
              <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                  Visibility
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVisibility("Public")}
                    className={`flex items-center justify-center gap-2 h-10 rounded-[5px] border font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                      visibility === "Public"
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                    <span>Public (Catalog)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility("Private")}
                    className={`flex items-center justify-center gap-2 h-10 rounded-[5px] border font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                      visibility === "Private"
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                        : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                    <span>Private (Draft)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ARCHITECTURE & CONDITIONING */}
          {activeTab === 2 && (
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

              {/* Adapter Enclave Selector */}
              {isAdapterModelType(model.model_type) && (
                <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase">
                      Exact Base Checkpoint Enclave{" "}
                      <span className="text-[var(--accent)]">(Installed in Gallery)</span>
                    </label>
                  </div>
                  <CustomSelect
                    value={selectedBaseKey}
                    onChange={(val) => setSelectedBaseKey(val)}
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
                    Binding this adapter to an installed base model auto-inherits its verified architecture, VAE, and text encoder.
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
                      ...clipTypeOptions.map((ct) => ({ value: ct, label: ct })),
                    ]}
                    className="w-full"
                    buttonClassName="w-full h-8 rounded-[5px] text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PROMPTS & PRESETS */}
          {activeTab === 3 && (
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
                            className={`h-8 flex-1 rounded-[5px] font-mono text-xs font-bold transition-all ${
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

          {/* TAB 4: LICENSING & PERMISSIONS */}
          {activeTab === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-1">
                <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  Licensing Terms & Creator Governance
                </h4>
                <p className="font-mono text-xs text-[var(--ink-soft)] leading-relaxed">
                  Control how the community may utilize, monetize, remix, and run inference with this model across SoloTensor and third-party environments.
                </p>
              </div>

              <div className="divide-y divide-[var(--line)] rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] font-mono text-xs">
                {/* Commercial Use Toggle */}
                <label className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-[var(--surface-soft)]/50 transition-colors">
                  <div>
                    <span className="font-bold text-[var(--ink)] block">
                      Commercial Generation & Content Sale
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
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

                {/* Remix / Merges Toggle */}
                <label className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-[var(--surface-soft)]/50 transition-colors">
                  <div>
                    <span className="font-bold text-[var(--ink)] block">
                      Model Remix & Merges
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
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

                {/* SoloTensor Generation Services Toggle */}
                <label className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-[var(--surface-soft)]/50 transition-colors">
                  <div>
                    <span className="font-bold text-[var(--ink)] block">
                      SoloTensor Generation Services
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
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

                {/* Attribution Credit Required Toggle */}
                <label className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-[var(--surface-soft)]/50 transition-colors">
                  <div>
                    <span className="font-bold text-[var(--ink)] block">
                      Attribution & Credit Required
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
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
          )}
        </div>

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
