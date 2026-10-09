"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
 AlertCircle,
 Box,
 Check,
 ChevronDown,
 ChevronRight,
 Eye,
 EyeOff,
 Filter,
 HelpCircle,
 Info,
 Layers,
 Lock,
 Minus,
 Plus,
 RefreshCw,
 Search,
 SlidersHorizontal,
 Sparkles,
 Tag,
 Trash2,
 Wand2,
 X,
 Zap,
} from "lucide-react";
import {
 api,
 resolveMediaUrl,
 type InstalledGalleryModel,
 type PublicModelSummary,
} from "@/lib/api";
import WorkspaceModal from "@/components/WorkspaceModal";

export type FormatKey = "1:1" | "16:9" | "9:16" | "4:3" | "3:2" | "custom";
export type TensorMode = "Text2Img" | "Img2Img" | "Edit" | "Video" | "Prime";

export interface ActiveLora {
 id: string;
 title: string;
 baseModel: string;
 weight: number;
 modelId?: string;
 versionId?: string;
 fileId?: string;
 thumbnailUrl?: string;
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

const MODES: { id: TensorMode; label: string; icon?: typeof Sparkles; isPrime?: boolean }[] = [
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
 selectedBaseModelName: string
): boolean {
 if (!selectedModel) return true;

 // 1. Direct Base Model ID match (exact parent model file/model ID)
 if (lora.baseModelId) {
  if (lora.baseModelId === selectedModel.model_id) return true;
  if (selectedModel.base_model_id && lora.baseModelId === selectedModel.base_model_id) return true;
 }

 // 2. Base Model name match (e.g. "Z Image Turbo", "SDXL 1.0", "Pony Diffusion V6 XL")
 const targetNames = [
  selectedModel.title.toLowerCase().trim(),
  selectedBaseModelName ? selectedBaseModelName.toLowerCase().trim() : "",
 ].filter(Boolean);

 if (lora.baseModelName) {
  const loraName = lora.baseModelName.toLowerCase().trim();
  for (const target of targetNames) {
   if (loraName === target) return true;
   if (loraName.includes(target) || target.includes(loraName)) return true;
  }
 }

 // If a LoRA explicitly points to a different base model ID, it is not compatible
 if (lora.baseModelId && lora.baseModelId !== selectedModel.model_id) {
  return false;
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
 negativePrompt: string;
 onNegativePromptChange: (v: string) => void;
 customWidth: string;
 onCustomWidthChange: (v: string) => void;
 customHeight: string;
 onCustomHeightChange: (v: string) => void;
 format: FormatKey;
 onFormatChange: (v: FormatKey) => void;
 busy: boolean;
 modelsLoading?: boolean;
 modelsError?: string | null;
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
  negativePrompt,
  onNegativePromptChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  format,
  onFormatChange,
  busy,
  modelsLoading,
  modelsError,
 } = props;

 const [activeMode, setActiveMode] = useState<TensorMode>("Text2Img");
 const [modelPickerOpen, setModelPickerOpen] = useState(false);
 const [loraPickerOpen, setLoraPickerOpen] = useState(false);
 const [embeddingPickerOpen, setEmbeddingPickerOpen] = useState(false);

 // Model Picker Filter States
 const [modelSearchQuery, setModelSearchQuery] = useState("");
 const [modelCategoryFilter, setModelCategoryFilter] = useState<string>("all");

 // LoRA Picker Filter States (Tensor.art style)
 const [loraSearchQuery, setLoraSearchQuery] = useState("");
 const [loraCategoryFilter, setLoraCategoryFilter] = useState<string>("all");
 const [onlyCompatibleLora, setOnlyCompatibleLora] = useState<boolean>(true);

 const [advancedOpen, setAdvancedOpen] = useState(false);
 const [infoTooltip, setInfoTooltip] = useState<string | null>(null);
 const isValidDimension = (value: string) => {
  const dimension = Number(value);
  return Number.isInteger(dimension) && dimension >= 64 && dimension <= 4096 && dimension % 8 === 0;
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

 // Available base models (Checkpoint or Diffusion Model) from backend
 const baseModels = useMemo(
  () => modelOptions.filter((m) => m.model_type === "Checkpoint" || m.model_type === "Diffusion Model"),
  [modelOptions]
 );

 // Available LoRA models from backend
 const galleryLoras = useMemo(
  () => modelOptions.filter((m) => m.model_type === "LoRA" || m.model_type === "LyCORIS"),
  [modelOptions]
 );

 // Derive active base model name tag from backend model metadata
 const baseModelTag = useMemo(() => {
  if (!selectedModel) return "";
  const pub = publicModelMap.get(selectedModel.model_id);
  if (pub?.base_model) {
   const lower = pub.base_model.toLowerCase();
   if (lower.includes("sdxl")) return "SDXL";
   if (lower.includes("flux")) return "FLUX.1";
   if (lower.includes("z-image") || lower.includes("turbo")) return "Z-Image";
   if (lower.includes("sd 1.5") || lower.includes("sd1.5")) return "SD 1.5";
   return pub.base_model;
  }
  const titleLower = selectedModel.title.toLowerCase();
  if (titleLower.includes("krea")) return "KREA_2";
  if (titleLower.includes("sdxl")) return "SDXL";
  if (titleLower.includes("flux")) return "FLUX.1";
  if (titleLower.includes("turbo") || titleLower.includes("z image")) return "Z-Image";
  if (titleLower.includes("sd 1.5") || titleLower.includes("sd1.5")) return "SD 1.5";
  return selectedModel.title.split(" ")[0] || "Custom";
 }, [selectedModel, publicModelMap]);

 // Cover image for currently selected model from backend
 const currentModelCover = useMemo(() => {
  if (!selectedModel) return null;
  const cover = selectedModel.cover_url || publicModelMap.get(selectedModel.model_id)?.cover_url || null;
  return resolveMediaUrl(cover);
 }, [selectedModel, publicModelMap]);

 // Adjust LoRA weight
 const updateLoraWeight = (id: string, nextWeight: number) => {
  const clamped = Math.round(Math.min(2.0, Math.max(-2.0, nextWeight)) * 10) / 10;
  onLorasChange(loras.map((l) => (l.id === id ? { ...l, weight: clamped } : l)));
 };

 // Toggle LoRA enabled/disabled state (Mute / Unmute matching Tensor.art)
 const toggleLora = (id: string) => {
  onLorasChange(
   loras.map((l) => (l.id === id ? { ...l, enabled: l.enabled === false ? true : false } : l))
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
  const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (regex.test(current)) return;
  onPromptChange(`${current.trim()}, ${word}`);
 };

 const insertAllTriggerWords = (words: string[]) => {
  if (!onPromptChange || !words.length) return;
  const current = prompt ?? "";
  const toAdd: string[] = [];
  for (const w of words) {
   const regex = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
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
  const clamped = Math.round(Math.min(2.0, Math.max(0.0, nextWeight)) * 10) / 10;
  onEmbeddingsChange(embeddings.map((e) => (e.id === id ? { ...e, weight: clamped } : e)));
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

   // Determine the specific Base Model of this LoRA
   let loraBaseModelName = "";
   if (g.base_model_id) {
    const parent = modelOptions.find((m) => m.model_id === g.base_model_id);
    if (parent) {
     loraBaseModelName = parent.title;
    }
   }
   if (!loraBaseModelName && pub?.base_model) {
    loraBaseModelName = pub.base_model;
   }
   if (!loraBaseModelName) {
    loraBaseModelName = selectedModel?.title || "Base Model";
   }

   return {
    id: `${g.model_id}:${g.file_id}`,
    title: g.title,
    baseModel: loraBaseModelName,
    baseModelId: g.base_model_id,
    filename: g.filename,
    triggerWords: pub?.tags || [],
    category: (pub?.category as string) || "LoRA",
    thumbnailUrl: resolveMediaUrl(g.cover_url || pub?.cover_url) ?? undefined,
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
     selectedBaseModelName
    )
   ) {
    return false;
   }
   // Category filter
   if (loraCategoryFilter !== "all" && item.category.toLowerCase() !== loraCategoryFilter.toLowerCase()) {
    return false;
   }
   // Search query
   if (loraSearchQuery.trim()) {
    const q = loraSearchQuery.toLowerCase();
    const matchesTitle = item.title.toLowerCase().includes(q);
    const matchesFilename = item.filename.toLowerCase().includes(q);
    const matchesBaseModel = item.baseModel.toLowerCase().includes(q);
    const matchesTrigger = item.triggerWords.some((tw) => tw.toLowerCase().includes(q));
    if (!matchesTitle && !matchesFilename && !matchesBaseModel && !matchesTrigger) return false;
   }
   return true;
  });
 }, [availableLoraItems, onlyCompatibleLora, selectedModel, selectedBaseModelName, loraCategoryFilter, loraSearchQuery]);

 // Add LoRA from modal
 const handleAddLoraItem = (item: (typeof availableLoraItems)[0]) => {
  if (loras.length >= 5) return;
  const exists = loras.some(
   (l) => l.id === item.id || (item.modelId && l.modelId === item.modelId && l.fileId === item.fileId)
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
  <aside className="workspace-core workspace-scroll h-full min-h-0 w-full shrink-0 rounded-[1.35rem] border border-white/10 bg-[var(--surface)] text-[var(--ink)] shadow-[0_24px_80px_rgba(19,28,17,.16)] lg:h-full lg:w-[24.5rem]">
   {/* Top Mode Tabs: Text2Img, Img2Img, Edit, Video, Prime */}
   <div className="flex items-center justify-between border-b border-[var(--line)] px-3 pt-2">
    <div className="flex items-center gap-1 overflow-x-auto workspace-scroll-x">
     {MODES.map((mode) => {
      const active = activeMode === mode.id;
      return (
       <button
        key={mode.id}
        type="button"
        onClick={() => setActiveMode(mode.id)}
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

   <div className="p-4 space-y-4">
    {/* Section Title: Models */}
    <div className="flex items-center justify-between">
     <h2 className="text-[14px] font-bold text-[var(--ink)] tracking-tight">Models</h2>
     {modelsLoading && (
      <span className="text-[11px] text-[var(--ink-faint)]">Loading models…</span>
     )}
    </div>

    {modelsError && (
     <div className="flex items-start gap-2 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-2.5 text-xs text-[var(--danger)]">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{modelsError}</span>
     </div>
    )}

    {/* 1. Basic Model Card (Tensor.art layout & controls) */}
    <div className="space-y-1.5">
     <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
       <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
        Basic Model
       </span>
       {baseModelTag && (
        <span className="rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[9px] font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)]">
         {baseModelTag}
        </span>
       )}
      </div>
      <button
       type="button"
       onClick={() => setModelPickerOpen(true)}
       className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] focus-visible:text-[var(--accent-hover)] transition"
       title="Replace Basic Model"
      >
       <RefreshCw className="h-3 w-3" />
       <span>Replace</span>
      </button>
     </div>

     <div className="flex items-stretch gap-1.5">
      <button
       type="button"
       aria-label="Choose basic model"
       onClick={() => setModelPickerOpen(true)}
       className="workspace-command  group flex flex-1 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-[border-color,background-color,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)]"
      >
      <div className="flex items-center gap-3">
       {/* Model Thumbnail */}
       <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]">
        {currentModelCover ? (
         <img
          src={currentModelCover}
          alt={selectedModel?.title ?? "Model preview"}
          className="h-full w-full object-cover transition group-hover:scale-105 group-focus-within:scale-105"
          onError={(e) => {
           (e.currentTarget as HTMLElement).style.display = "none";
          }}
         />
        ) : (
         <div className="grid h-full w-full place-items-center bg-[var(--surface-soft)]  text-[var(--accent)]">
          <Box className="h-6 w-6 opacity-75" />
         </div>
        )}
        <div className="absolute inset-0 bg-[var(--surface-soft)]  pointer-events-none" />
        {selectedModel && (
         <span className="absolute bottom-0.5 left-1 font-mono text-[8px] font-bold text-[var(--ink)] ">
          {selectedModel.version_name || "v1.0"}
         </span>
        )}
       </div>

       {/* Title, Category & Specs */}
       <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
         <span className="truncate text-xs font-bold text-[var(--ink)] group-hover:text-[var(--accent)] group-focus-within:text-[var(--accent)] transition">
          {selectedModel?.title ?? "Select Basic Model"}
         </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
         {selectedModel ? (
          <>
           <span className="inline-flex items-center rounded-xl bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--ink-faint)]">
            {selectedModel.model_type}
           </span>
           <p className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
            {selectedModel.filename}
           </p>
          </>
         ) : (
          <p className="truncate text-[10px] text-[var(--ink-faint)]">
           Click to choose a model from gallery
          </p>
         )}
        </div>
       </div>

       {/* Action Chevron */}
       <div className="flex items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--surface-raised)] text-[var(--ink-faint)] group-hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] group-focus-within:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] group-hover:text-[var(--accent)] group-focus-within:text-[var(--accent)] transition">
         <ChevronRight className="h-4 w-4" />
        </span>
       </div>
      </div>
      </button>
      {selectedModel && (
       <button
        type="button"
        aria-label="Model details"
        title="Model Details"
        onClick={() => setInfoTooltip(`${selectedModel.title} • ${selectedModel.model_type} • File: ${selectedModel.filename}`)}
        className="rounded-xl border border-[var(--line)] px-2 text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:text-[var(--accent)] transition"
       >
        <Info className="h-3.5 w-3.5" />
       </button>
      )}
     </div>
    </div>

    {/* 2. LoRA Cards Section (Tensor.art layout & controls) */}
    <div className="space-y-2">
     {/* Section Header with count and clear action */}
     <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
       <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
        LoRA
       </span>
       <span className="rounded-xl bg-[var(--surface-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--ink-faint)]">
        {loras.length}/5
       </span>
      </div>
      {loras.length > 0 && (
       <button
        type="button"
        onClick={() => onLorasChange([])}
        className="text-[10px] font-medium text-[var(--ink-faint)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)] transition"
       >
        Clear all
       </button>
      )}
     </div>

     {/* Stacked Active LoRA Cards */}
     {loras.length > 0 && (
      <div className="space-y-2.5">
       {loras.map((lora) => {
        const isMuted = lora.enabled === false;

        return (
         <div
          key={lora.id}
          className={`relative rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 transition hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] ${
           isMuted ? "opacity-60 bg-[var(--surface-raised)]" : ""
          }`}
         >
          {/* Top Row: Badge, Title & Power/Delete Actions */}
          <div className="flex items-start gap-3">
           {/* Thumbnail */}
           <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] grid place-items-center">
            {lora.thumbnailUrl ? (
             <img
              src={resolveMediaUrl(lora.thumbnailUrl) || lora.thumbnailUrl}
              alt={lora.title}
              className="h-full w-full object-cover"
              onError={(e) => {
               (e.currentTarget as HTMLElement).style.display = "none";
              }}
             />
            ) : (
             <Layers className="h-5 w-5 text-[var(--accent)] opacity-80" />
            )}
            <div className="absolute inset-0 bg-[var(--surface-soft)] " />
           </div>

           <div className="min-w-0 flex-1">
            {/* Title Row */}
            <div className="flex items-center justify-between gap-1">
             <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-xs font-bold text-[var(--ink)]">
               {lora.title}
              </span>
              <span className="shrink-0 rounded-xl bg-[var(--surface-soft)] px-1.5 py-0.2 text-[9px] font-semibold text-[var(--ink-faint)]">
               {lora.baseModel}
              </span>
             </div>

             {/* Quick Action Icons: Mute/Power & Remove */}
             <div className="flex items-center gap-1 shrink-0">
              <button
               type="button"
               onClick={() => toggleLora(lora.id)}
               title={isMuted ? "Enable LoRA" : "Mute LoRA"}
               className={`p-1 rounded-xl transition ${
                isMuted
                 ? "text-[var(--ink-faint)] hover:text-[var(--accent)] focus-visible:text-[var(--accent)]"
                 : "text-[var(--accent)] hover:text-[var(--ink-faint)] focus-visible:text-[var(--ink-faint)]"
               }`}
              >
               {isMuted ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
               type="button"
               onClick={() => removeLora(lora.id)}
               title="Remove LoRA"
               className="p-1 rounded-xl text-[var(--ink-faint)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)] transition"
              >
               <Trash2 className="h-3.5 w-3.5" />
              </button>
             </div>
            </div>

            {/* Slider Row with fine steppers */}
            <div className="mt-2.5 flex items-center gap-2">
             <div className="relative flex-1 flex items-center">
              <input
               type="range"
               min="-2.0"
               max="2.0"
               step="0.05"
               value={lora.weight}
               disabled={isMuted}
               onChange={(e) => updateLoraWeight(lora.id, parseFloat(e.target.value))}
               className="workspace-range w-full"
              />
             </div>

             {/* Numeric Weight Badge */}
             <div className="flex h-6 min-w-[2.4rem] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-1.5 font-mono text-[11px] font-bold text-[var(--ink)]">
              {lora.weight.toFixed(1)}
             </div>

             {/* Decrement Stepper */}
             <button
              type="button"
              disabled={isMuted}
              onClick={() => updateLoraWeight(lora.id, lora.weight - 0.1)}
              className="flex h-6 w-6 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] active:scale-95 disabled:opacity-40 transition"
              title="Decrease (-0.1)"
             >
              <Minus className="h-3 w-3" />
             </button>

             {/* Increment Stepper */}
             <button
              type="button"
              disabled={isMuted}
              onClick={() => updateLoraWeight(lora.id, lora.weight + 0.1)}
              className="flex h-6 w-6 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] active:scale-95 disabled:opacity-40 transition"
              title="Increase (+0.1)"
             >
              <Plus className="h-3 w-3" />
             </button>
            </div>

            {/* Trigger Words Section (Tensor.art hallmark feature) */}
            {lora.triggerWords && lora.triggerWords.length > 0 && (
             <div className="mt-2 border-t border-[var(--line)] pt-1.5">
              <div className="flex items-center justify-between mb-1">
               <span className="text-[9px] font-semibold text-[var(--ink-faint)] uppercase tracking-wider">
                Trigger Words
               </span>
               <button
                type="button"
                onClick={() => insertAllTriggerWords(lora.triggerWords!)}
                className="text-[9px] font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
               >
                + Add all
               </button>
              </div>
              <div className="flex flex-wrap gap-1">
               {lora.triggerWords.map((tw) => (
                <button
                 key={tw}
                 type="button"
                 onClick={() => insertTriggerWord(tw)}
                 title={`Click to append "${tw}" to prompt`}
                 className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-soft)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] hover:text-[var(--accent)] focus-visible:text-[var(--accent)] border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-soft)] transition"
                >
                 <span>{tw}</span>
                 <Plus className="h-2.5 w-2.5 opacity-60" />
                </button>
               ))}
              </div>
             </div>
            )}
           </div>
          </div>
         </div>
        );
       })}
      </div>
     )}

     {/* Add LoRA Adapter Button */}
     <button
      type="button"
      onClick={() => setLoraPickerOpen(true)}
      disabled={loras.length >= 5}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] py-2.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] focus-visible:bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] disabled:opacity-50 transition active:scale-[0.99]"
     >
      <Plus className="h-4 w-4 text-[var(--accent)]" />
      <span>
       {loras.length >= 5
        ? "LoRA Limit Reached (5/5)"
        : `Add LoRA Adapter (${loras.length}/5)`}
      </span>
     </button>
    </div>

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
           <div className="absolute inset-0 bg-[var(--surface-soft)] " />
          </div>

          <div className="min-w-0 flex-1">
           <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
             <span className="truncate text-xs font-semibold text-[var(--ink)]">
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
             <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.05"
              value={emb.weight}
              onChange={(e) => updateEmbeddingWeight(emb.id, parseFloat(e.target.value))}
              className="workspace-range w-full"
             />
            </div>
            <div className="flex h-6 min-w-[2.25rem] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-1.5 font-mono text-[11px] font-semibold text-[var(--ink)]">
             {emb.weight.toFixed(1)}
            </div>
            <button
             type="button"
             onClick={() => updateEmbeddingWeight(emb.id, emb.weight - 0.1)}
             className="flex h-6 w-6 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] active:scale-95 transition"
            >
             <Minus className="h-3 w-3" />
            </button>
            <button
             type="button"
             onClick={() => updateEmbeddingWeight(emb.id, emb.weight + 0.1)}
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
      <div className="mb-2 flex items-center justify-between">
       <span className="text-[11px] font-semibold text-[var(--ink-faint)] uppercase tracking-wide">
        Aspect Ratio
       </span>
       <span className="font-mono text-[10px] text-[var(--accent)]">{format}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
       {FORMATS.map(({ value, label }) => {
        const active = format === value;
        return (
         <button
          key={value}
          type="button"
          onClick={() => onFormatChange(value)}
          disabled={busy}
          className={`rounded-xl border py-2 text-center font-mono text-[11px] font-semibold transition active:scale-95 disabled:opacity-40 ${
           active
            ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] "
            : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
          }`}
         >
          {label}
         </button>
        );
       })}
      </div>

      {format === "custom" && (
       <>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
         <div>
          <label htmlFor="custom-width" className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold">Width</label>
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
           aria-describedby={customWidthInvalid ? "custom-dimension-validation" : undefined}
           className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
         </div>
         <div>
          <label htmlFor="custom-height" className="text-[10px] text-[var(--ink-faint)] uppercase font-semibold">Height</label>
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
           aria-describedby={customHeightInvalid ? "custom-dimension-validation" : undefined}
           className="workspace-field mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
         </div>
        </div>
        {(customWidthInvalid || customHeightInvalid) && (
         <p id="custom-dimension-validation" className="mt-1.5 text-[10px] text-[var(--danger)]">
          Use 64–4096 pixels in multiples of 8.
         </p>
        )}
       </>
      )}
     </div>

     {/* Advanced Settings Accordion */}
     <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      <button
       type="button"
       onClick={() => setAdvancedOpen((v) => !v)}
       aria-expanded={advancedOpen}
       aria-controls="advanced-settings-panel"
       className="flex w-full items-center justify-between p-3 text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
      >
       <span className="flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
        Advanced Settings
       </span>
       <ChevronDown
        className={`h-4 w-4 transition-transform duration-200 ${
         advancedOpen ? "rotate-180" : ""
        }`}
       />
      </button>

      {advancedOpen && (
       <div className="space-y-3.5 border-t border-[var(--line)] p-3 pt-3.5">
        {/* Negative Prompt */}
        <div>
         <label htmlFor="neg-prompt" className="mb-1.5 block text-[10px] font-semibold uppercase text-[var(--ink-faint)]">
          Negative Prompt (Exclude)
         </label>
         <textarea
          id="neg-prompt"
          value={negativePrompt}
          onChange={(e) => onNegativePromptChange(e.target.value)}
          placeholder="worst quality, low quality, blurry, distorted…"
          rows={3}
          disabled={busy}
          className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--accent)]"
         />
        </div>

        {/* Seed, Steps, CFG */}
        <div className="grid grid-cols-3 gap-2">
         <div>
          <label htmlFor="param-seed" className="block text-[10px] font-semibold uppercase text-[var(--ink-faint)]">Seed</label>
          <input
           id="param-seed"
           type="number"
           min="0"
           value={seed}
           onChange={(e) => onSeedChange(e.target.value)}
           placeholder="Random"
           disabled={busy}
           className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--accent)]"
          />
         </div>
         <div>
          <label htmlFor="param-steps" className="block text-[10px] font-semibold uppercase text-[var(--ink-faint)]">Steps</label>
          <input
           id="param-steps"
           type="number"
           min="1"
           max="100"
           value={steps}
           onChange={(e) => onStepsChange(e.target.value)}
           disabled={busy}
           className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
         </div>
         <div>
          <label htmlFor="param-cfg" className="block text-[10px] font-semibold uppercase text-[var(--ink-faint)]">CFG</label>
          <input
           id="param-cfg"
           type="number"
           min="0"
           max="30"
           step="0.1"
           value={cfg}
           onChange={(e) => onCfgChange(e.target.value)}
           disabled={busy}
           className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
         </div>
        </div>

        {/* Denoise Slider */}
        <div>
         <div className="flex items-center justify-between text-[10px] text-[var(--ink-faint)] uppercase font-semibold">
          <span>Denoise</span>
          <span className="font-mono text-[var(--ink)]">{denoise}</span>
         </div>
         <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={denoise}
          onChange={(e) => onDenoiseChange(e.target.value)}
          disabled={busy}
          className="workspace-range mt-2 w-full"
         />
        </div>
       </div>
      )}
     </div>
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
        <h3 className="text-base font-bold text-[var(--ink)]">Select Basic Model</h3>
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
       <div className="flex items-center gap-1.5 overflow-x-auto workspace-scroll-x pb-1">
        {[
         { id: "all", label: "All Types" },
         { id: "Checkpoint", label: "Checkpoints" },
         { id: "Diffusion Model", label: "Diffusion Models" },
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
          if (modelCategoryFilter !== "all" && m.model_type !== modelCategoryFilter) {
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
           `${selectedModel.model_id}:${selectedModel.version_id}:${selectedModel.file_id}` === key;
          const pub = publicModelMap.get(m.model_id);
          const cover = resolveMediaUrl(m.cover_url || pub?.cover_url);

          return (
           <button
            key={key}
            type="button"
            onClick={() => {
             onModelChange(key);
             setModelPickerOpen(false);
            }}
            className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition ${
             isCurrent
              ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
              : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] "
            }`}
           >
            {/* Cover image header */}
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--surface-soft)] border-b border-[var(--line)]">
             {cover ? (
              <img
               src={cover}
               alt={m.title}
               className="h-full w-full object-cover transition group-hover:scale-105 group-focus-within:scale-105"
               onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
               }}
              />
             ) : (
              <div className="grid h-full w-full place-items-center bg-[var(--surface-soft)]  text-[var(--accent)]">
               <Box className="h-8 w-8 opacity-60" />
              </div>
             )}
             <div className="absolute inset-0 bg-[var(--surface-soft)]  pointer-events-none" />

             {/* Top Tag Overlays */}
             <div className="absolute top-2 left-2 flex items-center gap-1">
              <span className="rounded-xl bg-[var(--media-scrim-strong)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--ink)] uppercase">
               {m.model_type === "Checkpoint" ? "CKPT" : "DIFF"}
              </span>
             </div>

             {/* Current Active Indicator Badge */}
             {isCurrent && (
              <div className="absolute top-2 right-2 flex items-center gap-1 rounded-xl bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-ink)] ">
               <Check className="h-3 w-3" />
               <span>Active</span>
              </div>
             )}

             <span className="absolute bottom-1.5 left-2 font-mono text-[9px] font-bold text-[var(--ink)] ">
              {m.version_name || "v1.0"}
             </span>
            </div>

            {/* Card Details */}
            <div className="p-3">
             <h4 className="truncate text-xs font-bold text-[var(--ink)] group-hover:text-[var(--accent)] group-focus-within:text-[var(--accent)] transition">
              {m.title}
             </h4>
             <p className="mt-1 truncate font-mono text-[10px] text-[var(--ink-faint)]">
              {m.filename}
             </p>
             <div className="mt-2.5 flex items-center justify-between pt-1 border-t border-[var(--line)]">
              <span className="text-[10px] font-medium text-[var(--ink-faint)]">
               {pub?.category || m.model_type}
              </span>
              <span className="text-[11px] font-bold text-[var(--accent)] group-hover:underline group-focus-within:underline">
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
          href="/models/gallery"
          className="mt-2 inline-block font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
         >
          Explore Public Model Gallery
         </Link>
        </div>
       )}
      </div>

      {/* Modal Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-faint)]">
       <span>Looking for more checkpoints?</span>
       <Link
        href="/models/gallery"
        onClick={() => setModelPickerOpen(false)}
        className="font-semibold text-[var(--accent)] hover:underline focus-visible:underline"
       >
        Browse Model Gallery →
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
        <h3 className="text-base font-bold text-[var(--ink)]">Add LoRA Adapter</h3>
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
           <span className="text-[var(--accent)] font-bold">{selectedModel.title}</span>
          </span>
         </label>
        )}
       </div>

       {/* Category Filter Pills (dynamically derived from installed LoRAs) */}
       {availableLoraItems.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto workspace-scroll-x pb-1">
         {Array.from(new Set(["all", ...availableLoraItems.map((item) => item.category.toLowerCase())])).map(
          (cat) => {
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
          }
         )}
        </div>
       )}
      </div>

      {/* LoRA Cards Grid (Tensor.art visual style) */}
      <div className="max-h-96 overflow-y-auto space-y-2.5 py-2 pr-1">
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredModalLoras.map((item) => {
         const isAdded = loras.some(
          (l) => l.id === item.id || (item.modelId && l.modelId === item.modelId && l.fileId === item.fileId)
         );

         return (
          <div
           key={item.id}
           className={`flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 transition hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover: ${
            isAdded ? "bg-[var(--surface-raised)]" : ""
           }`}
          >
           <div className="flex items-start gap-3">
            {/* Thumbnail */}
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] grid place-items-center">
             {item.thumbnailUrl ? (
              <img
               src={resolveMediaUrl(item.thumbnailUrl) || item.thumbnailUrl}
               alt={item.title}
               className="h-full w-full object-cover"
               onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
               }}
              />
             ) : (
              <Layers className="h-6 w-6 text-[var(--accent)] opacity-75" />
             )}
            </div>

            {/* Title & Metadata */}
            <div className="min-w-0 flex-1">
             <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold text-[var(--ink)]">
               {item.title}
              </span>
             </div>
             <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.2 text-[9px] font-bold text-[var(--accent)]">
               {item.baseModel}
              </span>
              <span className="rounded-xl bg-[var(--surface-soft)] px-1.5 py-0.2 text-[9px] font-medium text-[var(--ink-faint)]">
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
            <span className="font-mono text-[10px] text-[var(--ink-faint)] truncate max-w-[150px]">
             {item.filename}
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
           <p>No LoRA adapters installed in your local ComfyUI gallery.</p>
           <Link
            href="/models/gallery"
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
              <span className="font-bold text-[var(--ink)]">{selectedModel.title}</span>
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
        href="/models/gallery"
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
       <h3 className="text-base font-bold text-[var(--ink)]">Add Embedding</h3>
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
        Type the name or trigger word of an embedding / textual inversion token:
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
         const input = document.getElementById("embedding-name-input") as HTMLInputElement | null;
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

   {/* Info Tooltip Toast */}
   {infoTooltip && (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-xs text-[var(--ink)] ">
     <Info className="h-3.5 w-3.5 text-[var(--accent)]" />
     <span>{infoTooltip}</span>
     <button
      type="button"
      onClick={() => setInfoTooltip(null)}
      className="ml-2 text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
     >
      <X className="h-3 w-3" />
     </button>
    </div>
   )}
  </aside>
 );
}
