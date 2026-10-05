"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlPanel, {
  type ActiveEmbedding,
  type ActiveLora,
  type FormatKey,
} from "@/components/ControlPanel";
import CanvasPreview from "@/components/CanvasPreview";
import {
  api,
  uuid,
  type GalleryItem,
  type GeneratePayload,
  type GenerationMode,
  type GenerationResult,
  type InstalledGalleryModel,
  type LoraAdapterPayload,
  type ProgressEvent,
} from "@/lib/api";
import { loadSettings } from "@/lib/settings";

const SAVED_INPUTS_KEY = "solotensor:last-successful-inputs:v3";

const FORMATS: Record<Exclude<FormatKey, "custom">, readonly [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 896],
  "3:2": [1216, 832],
};

const FORMAT_KEYS: FormatKey[] = ["1:1", "16:9", "9:16", "4:3", "3:2", "custom"];

const DEFAULT_SAMPLE_PROMPT =
  "Authentic, dynamic medium close-up cinematic action still, shot on a medium format camera with 85mm lens, atmospheric haze, volumetric rim lighting, fine textures";

const DEFAULT_LORAS: ActiveLora[] = [
  {
    id: "lora-apex",
    title: "Apex Detailer ⚜ - Krea 2",
    baseModel: "KREA_2",
    weight: 0.7,
  },
  {
    id: "lora-fever",
    title: "Fever Dream Mood | KR2 & ZIT …",
    baseModel: "KREA_2",
    weight: 0.6,
  },
  {
    id: "lora-han",
    title: "Han Solo CHARACTER - KREA-2",
    baseModel: "KREA_2",
    weight: 1.0,
  },
];

const DEFAULT_EMBEDDINGS: ActiveEmbedding[] = [
  {
    id: "emb-nxfang",
    title: "*NxFang 𝕓 - Test",
    baseModel: "KREA_2",
    weight: 0.4,
  },
];

interface ModelIdentity {
  modelId: string;
  versionId: string;
  fileId: string;
}

function modelKey(model: ModelIdentity): string {
  return `${model.modelId}:${model.versionId}:${model.fileId}`;
}

function galleryModelKey(model: InstalledGalleryModel): string {
  return modelKey({
    modelId: model.model_id,
    versionId: model.version_id,
    fileId: model.file_id,
  });
}

export default function StudioPage() {
  const [mode] = useState<GenerationMode>("text-to-image");
  const [prompt, setPrompt] = useState(DEFAULT_SAMPLE_PROMPT);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selection, setSelection] = useState<ModelIdentity | null>(null);
  const [baseSelection, setBaseSelection] = useState<ModelIdentity | null>(null);
  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Active LoRAs & Embeddings (matching Tensor.Art stacked list)
  const [loras, setLoras] = useState<ActiveLora[]>(DEFAULT_LORAS);
  const [embeddings, setEmbeddings] = useState<ActiveEmbedding[]>(DEFAULT_EMBEDDINGS);

  const [seed, setSeed] = useState("");
  const [steps, setSteps] = useState("25");
  const [imageCount, setImageCount] = useState("1");
  const [cfg, setCfg] = useState("7.0");
  const [denoise, setDenoise] = useState("1");
  const [format, setFormat] = useState<FormatKey>("9:16");
  const [customWidth, setCustomWidth] = useState("768");
  const [customHeight, setCustomHeight] = useState("1344");

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>("");

  // Find currently selected Basic Model
  const selectedModel = useMemo(() => {
    if (selection) {
      return (
        modelOptions.find((item) => galleryModelKey(item) === modelKey(selection)) ??
        null
      );
    }
    // Default to the first Checkpoint or Diffusion Model if available
    const baseFirst = modelOptions.find(
      (item) => item.model_type === "Checkpoint" || item.model_type === "Diffusion Model"
    );
    return baseFirst ?? null;
  }, [modelOptions, selection]);

  const baseModel = useMemo(() => {
    if (baseSelection) {
      return (
        modelOptions.find((item) => galleryModelKey(item) === modelKey(baseSelection)) ??
        null
      );
    }
    if (selectedModel && (selectedModel.model_type === "Checkpoint" || selectedModel.model_type === "Diffusion Model")) {
      return selectedModel;
    }
    return modelOptions.find((item) => item.model_type === "Checkpoint" || item.model_type === "Diffusion Model") ?? null;
  }, [modelOptions, baseSelection, selectedModel]);

  const baseModelOptions = useMemo(() => {
    return modelOptions.filter(
      (item) => item.model_type === "Checkpoint" || item.model_type === "Diffusion Model"
    );
  }, [modelOptions]);

  const refreshGallery = useCallback(async () => {
    try {
      setGallery(await api.getGallery());
    } catch {
      /* gallery is non-critical */
    }
  }, []);

  // Hydrate settings
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_INPUTS_KEY) ?? "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.prompt === "string" && saved.prompt) setPrompt(saved.prompt);
        if (typeof saved.negativePrompt === "string") setNegativePrompt(saved.negativePrompt);
        if (typeof saved.seed === "string") setSeed(saved.seed);
        if (typeof saved.steps === "string") setSteps(saved.steps);
        if (typeof saved.imageCount === "string") setImageCount(saved.imageCount);
        if (typeof saved.cfg === "string") setCfg(saved.cfg);
        if (typeof saved.denoise === "string") setDenoise(saved.denoise);
        if (typeof saved.format === "string" && FORMAT_KEYS.includes(saved.format)) setFormat(saved.format);
        if (saved.modelId && saved.versionId && saved.fileId) {
          setSelection({ modelId: saved.modelId, versionId: saved.versionId, fileId: saved.fileId });
        }
        if (Array.isArray(saved.loras) && saved.loras.length > 0) {
          setLoras(saved.loras);
        }
      } else {
        const settings = loadSettings();
        setFormat(settings.defaultFormat);
        setSteps(String(settings.defaultSteps));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist settings
  useEffect(() => {
    if (!hydrated || modelsLoading) return;
    try {
      localStorage.setItem(
        SAVED_INPUTS_KEY,
        JSON.stringify({
          prompt,
          negativePrompt,
          modelId: selectedModel?.model_id ?? "",
          versionId: selectedModel?.version_id ?? "",
          fileId: selectedModel?.file_id ?? "",
          loras,
          seed,
          steps,
          imageCount,
          cfg,
          denoise,
          format,
        })
      );
    } catch {
      /* ignore */
    }
  }, [hydrated, modelsLoading, prompt, negativePrompt, selectedModel, loras, seed, steps, imageCount, cfg, denoise, format]);

  // Load models from API
  useEffect(() => {
    let cancelled = false;
    void api
      .listSelectableModels()
      .then((items) => {
        if (cancelled) return;
        setModelOptions(items);

        // If local LoRAs exist in gallery, update DEFAULT_LORAS with real gallery IDs if matched
        const realLoras = items.filter((m) => m.model_type === "LoRA" || m.model_type === "LyCORIS");
        if (realLoras.length > 0) {
          setLoras((prev) => {
            const hasReal = prev.some((p) => p.modelId);
            if (!hasReal) {
              const firstReal = realLoras[0];
              return [
                {
                  id: `${firstReal.model_id}:${firstReal.file_id}`,
                  title: firstReal.title,
                  baseModel: firstReal.base_model_id ? "KREA_2" : "SDXL",
                  weight: 0.8,
                  modelId: firstReal.model_id,
                  versionId: firstReal.version_id,
                  fileId: firstReal.file_id,
                },
                ...prev.slice(0, 2),
              ];
            }
            return prev;
          });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setModelsError(reason instanceof Error ? reason.message : "Could not load models");
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshGallery();
  }, [refreshGallery]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const outputDimensions = useMemo(() => {
    const values = format === "custom" ? [Number(customWidth), Number(customHeight)] : FORMATS[format];
    return {
      width: Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1024,
      height: Number.isFinite(values[1]) && values[1] > 0 ? values[1] : 1024,
    };
  }, [format, customWidth, customHeight]);

  const canGenerate = useMemo(() => {
    if (!prompt.trim() || busy) return false;
    return true;
  }, [prompt, busy]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || busy) return;

    // Determine effective model to use
    let targetModel = selectedModel;
    let effectiveBase = baseModel;

    const isPrimaryLora =
      targetModel?.model_type === "LoRA" || targetModel?.model_type === "LyCORIS";

    if (!targetModel) {
      // Fallback: pick first available model if any
      targetModel =
        modelOptions.find(
          (m) => m.model_type === "Checkpoint" || m.model_type === "Diffusion Model"
        ) ?? modelOptions[0] ?? null;
    }

    if (!targetModel) {
      setError("Please ensure at least one model is available in the gallery before generating.");
      return;
    }

    // Build active lora_adapters from the Tensor.Art stacked LoRA cards
    const loraAdapters: LoraAdapterPayload[] = loras
      .filter((l) => Boolean(l.modelId && l.fileId && l.versionId))
      .map((l) => ({
        model_id: l.modelId!,
        version_id: l.versionId!,
        file_id: l.fileId!,
        strength: l.weight,
        on: true,
      }));

    const [resolvedWidth, resolvedHeight] =
      format === "custom" ? [customWidth, customHeight] : FORMATS[format].map(String);

    const parsedSteps = Math.max(1, Math.min(100, Number(steps) || 20));
    const parsedImageCount = Math.max(1, Math.min(4, Number(imageCount) || 1));
    const parsedCfg = Math.max(0, Math.min(30, Number(cfg) || 7.0));
    const parsedDenoise = Math.max(0, Math.min(1, Number(denoise) || 1.0));
    const parsedWidth = Math.floor((Number(resolvedWidth) || 1024) / 8) * 8;
    const parsedHeight = Math.floor((Number(resolvedHeight) || 1024) / 8) * 8;
    const rawSeed = seed.trim();
    const parsedSeed = rawSeed ? Number(rawSeed) : undefined;

    if (
      rawSeed &&
      (parsedSeed === undefined ||
        !Number.isInteger(parsedSeed) ||
        parsedSeed < 0 ||
        parsedSeed > 2 ** 32 - 1)
    ) {
      setError("Seed must be an integer from 0 to 4,294,967,295.");
      return;
    }

    setBusy(true);
    setError(null);
    setProgress(0);
    setProgressLabel("Queuing workflow…");

    clientIdRef.current = uuid();
    const clientId = clientIdRef.current;

    const ws = api.openProgressSocket(clientId, (event: ProgressEvent) => {
      if (event.type === "progress" && event.max) {
        const pct = Math.round(((event.value ?? 0) / event.max) * 100);
        setProgress(pct);
        setProgressLabel(`Rendering… node ${event.node ?? ""} ${pct}%`);
      } else if (event.type === "executing") {
        setProgressLabel(`Executing node ${event.node ?? ""}`);
      } else if (event.type === "error") {
        setError(event.message ?? "Generation failed");
      }
    });
    wsRef.current = ws;

    try {
      const payload: GeneratePayload = {
        model_id: targetModel.model_id,
        version_id: targetModel.version_id,
        file_id: targetModel.file_id,
        ...(isPrimaryLora && effectiveBase
          ? {
              base_model_id: effectiveBase.model_id,
              base_version_id: effectiveBase.version_id,
              base_file_id: effectiveBase.file_id,
            }
          : {}),
        mode,
        prompt,
        negative_prompt: negativePrompt,
        seed: parsedSeed,
        steps: parsedSteps,
        image_count: parsedImageCount,
        cfg: parsedCfg,
        denoise: parsedDenoise,
        width: parsedWidth,
        height: parsedHeight,
        format_name: format,
        client_id: clientId,
        lora_adapters: loraAdapters,
      };

      const result: GenerationResult = await api.generate(payload);
      if (result.status === "completed") {
        setProgress(100);
        setProgressLabel("Done");
        void refreshGallery();
      } else {
        setError(result.error ?? `Generation ${result.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
      setTimeout(() => ws.close(), 1500);
    }
  }, [
    prompt,
    negativePrompt,
    selectedModel,
    baseModel,
    loras,
    modelOptions,
    mode,
    seed,
    steps,
    imageCount,
    cfg,
    denoise,
    format,
    customWidth,
    customHeight,
    busy,
    refreshGallery,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[var(--ground)]">
      {/* Left Control Panel (Collapsible) */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? "w-0 overflow-hidden opacity-0 pointer-events-none" : "w-full lg:w-[24.5rem]"
        }`}
      >
        <ControlPanel
          selectedModel={selectedModel}
          modelOptions={modelOptions}
          onModelChange={(key) => {
            const model = modelOptions.find((item) => galleryModelKey(item) === key) ?? null;
            const next = model
              ? { modelId: model.model_id, versionId: model.version_id, fileId: model.file_id }
              : null;
            setSelection(next);
            setModelsError(null);
          }}
          baseModel={baseModel}
          baseModelOptions={baseModelOptions}
          onBaseModelChange={(key) => {
            const model = baseModelOptions.find((item) => galleryModelKey(item) === key) ?? null;
            setBaseSelection(
              model
                ? { modelId: model.model_id, versionId: model.version_id, fileId: model.file_id }
                : null
            );
          }}
          loras={loras}
          onLorasChange={setLoras}
          embeddings={embeddings}
          onEmbeddingsChange={setEmbeddings}
          seed={seed}
          onSeedChange={setSeed}
          steps={steps}
          onStepsChange={setSteps}
          cfg={cfg}
          onCfgChange={setCfg}
          denoise={denoise}
          onDenoiseChange={setDenoise}
          negativePrompt={negativePrompt}
          onNegativePromptChange={setNegativePrompt}
          customWidth={customWidth}
          onCustomWidthChange={setCustomWidth}
          customHeight={customHeight}
          onCustomHeightChange={setCustomHeight}
          format={format}
          onFormatChange={setFormat}
          busy={busy}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
        />
      </div>

      {/* Main Canvas Area */}
      <CanvasPreview
        prompt={prompt}
        onPromptChange={setPrompt}
        imageCount={imageCount}
        onImageCountChange={setImageCount}
        canGenerate={canGenerate}
        onGenerate={handleGenerate}
        busy={busy}
        progress={progress}
        progressLabel={progressLabel}
        gallery={gallery}
        error={error}
        outputWidth={outputDimensions.width}
        outputHeight={outputDimensions.height}
        referenceImage={null}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebarCollapse={() => setIsSidebarCollapsed((v) => !v)}
        onReload={refreshGallery}
      />
    </div>
  );
}
