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
  type GalleryMetadata,
  type GeneratePayload,
  type GenerationMode,
  type GenerationResult,
  type InstalledGalleryModel,
  type LoraAdapterPayload,
  type ProgressEvent,
} from "@/lib/api";
import { loadSettings } from "@/lib/settings";
import { STORAGE_KEYS } from "@/lib/storage";

const SAVED_INPUTS_KEY = STORAGE_KEYS.STUDIO_DRAFT;

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

const isBaseModel = (type?: string) => (type ? ["Checkpoint", "SVD"].includes(type) : false);
const isAdapterModel = (type?: string) => (type ? ["LoRA", "LoKr", "LoCon", "LyCORIS", "DoRA", "Motion LoRA"].includes(type) : false);

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
  const [loras, setLoras] = useState<ActiveLora[]>([]);
  const [embeddings, setEmbeddings] = useState<ActiveEmbedding[]>([]);

  const [seed, setSeed] = useState("-1");
  const [steps, setSteps] = useState("25");
  const [imageCount, setImageCount] = useState("1");
  const [cfg, setCfg] = useState("7.0");
  const [denoise, setDenoise] = useState("1");
  const [format, setFormat] = useState<FormatKey>("9:16");
  const [customWidth, setCustomWidth] = useState("768");
  const [customHeight, setCustomHeight] = useState("1344");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

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
    // Default to the first Checkpoint or base model if available
    const baseFirst = modelOptions.find((item) => isBaseModel(item.model_type));
    return baseFirst ?? null;
  }, [modelOptions, selection]);

  const baseModel = useMemo(() => {
    if (baseSelection) {
      return (
        modelOptions.find((item) => galleryModelKey(item) === modelKey(baseSelection)) ??
        null
      );
    }
    if (selectedModel && isBaseModel(selectedModel.model_type)) {
      return selectedModel;
    }
    return modelOptions.find((item) => isBaseModel(item.model_type)) ?? null;
  }, [modelOptions, baseSelection, selectedModel]);

  const baseModelOptions = useMemo(() => {
    return modelOptions.filter((item) => isBaseModel(item.model_type));
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
      const raw =
        localStorage.getItem(SAVED_INPUTS_KEY) ??
        localStorage.getItem("solotensor:last-successful-inputs:v4") ??
        localStorage.getItem("comfy_studio_saved_inputs") ??
        "null";
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        if (typeof saved.prompt === "string" && saved.prompt) setPrompt(saved.prompt);
        if (typeof saved.negativePrompt === "string") setNegativePrompt(saved.negativePrompt);
        if (typeof saved.seed === "string") setSeed(saved.seed || "-1");
        else if (typeof saved.seed === "number") setSeed(String(saved.seed));
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

  const resetStudioDefaults = useCallback(() => {
    setPrompt(DEFAULT_SAMPLE_PROMPT);
    setNegativePrompt("");
    setSeed("-1");
    const settings = loadSettings();
    setSteps(String(settings.defaultSteps));
    setImageCount("1");
    setCfg("7.0");
    setDenoise("1");
    setFormat(settings.defaultFormat);
    setLoras([]);
    setSelection(null);
    try {
      localStorage.removeItem(SAVED_INPUTS_KEY);
      localStorage.removeItem("solotensor:last-successful-inputs:v4");
      localStorage.removeItem("comfy_studio_saved_inputs");
    } catch {
      // ignore
    }
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

    const isPrimaryLora = isAdapterModel(targetModel?.model_type);

    if (!targetModel) {
      // Fallback: pick first available base model if any
      targetModel =
        modelOptions.find((m) => isBaseModel(m.model_type)) ?? modelOptions[0] ?? null;
    }

    if (!targetModel) {
      setError("Please ensure at least one model is available in the gallery before generating.");
      return;
    }

    // Build active lora_adapters from the Tensor.Art stacked LoRA cards
    const loraAdapters: LoraAdapterPayload[] = loras
      .filter((l) => Boolean(l.modelId && l.fileId && l.versionId) && l.enabled !== false)
      .map((l) => ({
        model_id: l.modelId!,
        version_id: l.versionId!,
        file_id: l.fileId!,
        strength: l.weight,
        on: l.enabled !== false,
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
    const rawNum = rawSeed ? Number(rawSeed) : undefined;
    const isRandomSeed =
      rawSeed === "" ||
      rawSeed === "-1" ||
      rawNum === -1 ||
      rawSeed.toLowerCase() === "random";
    const parsedSeed = isRandomSeed ? undefined : rawNum;

    if (
      !isRandomSeed &&
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

  // Handle incoming query params (e.g. from gallery "Install and use")
  useEffect(() => {
    if (!modelOptions.length) return;
    try {
      const search = new URLSearchParams(window.location.search);
      const urlModelId = search.get("model_id");
      const urlVersionId = search.get("version_id");
      const urlFileId = search.get("file_id");
      const urlBaseModelId = search.get("base_model_id");
      const urlBaseFileId = search.get("base_file_id");

      if (urlModelId) {
        const target =
          modelOptions.find(
            (m) =>
              m.model_id === urlModelId &&
              (!urlFileId || m.file_id === urlFileId) &&
              (!urlVersionId || m.version_id === urlVersionId)
          ) || modelOptions.find((m) => m.model_id === urlModelId);

        if (target) {
          if (isAdapterModel(target.model_type)) {
            setLoras((prev) => {
              const alreadyExists = prev.some(
                (l) => l.modelId === target.model_id && (!target.file_id || l.fileId === target.file_id)
              );
              if (alreadyExists) return prev;
              const newLora: ActiveLora = {
                id: `${target.model_id}:${target.file_id}`,
                title: target.title,
                baseModel: target.version_name || "SDXL",
                weight: 0.8,
                enabled: true,
                modelId: target.model_id,
                versionId: target.version_id,
                fileId: target.file_id,
                thumbnailUrl: target.cover_url,
              };
              return [...prev, newLora];
            });

            if (urlBaseModelId) {
              const baseMatch =
                modelOptions.find(
                  (m) =>
                    m.model_id === urlBaseModelId &&
                    (!urlBaseFileId || m.file_id === urlBaseFileId)
                ) || modelOptions.find((m) => m.model_id === urlBaseModelId);
              if (baseMatch) {
                setBaseSelection({
                  modelId: baseMatch.model_id,
                  versionId: baseMatch.version_id,
                  fileId: baseMatch.file_id,
                });
              }
            }
          } else {
            setSelection({
              modelId: target.model_id,
              versionId: target.version_id,
              fileId: target.file_id,
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, [modelOptions]);

  const handleRemix = useCallback((meta: GalleryMetadata) => {
    if (meta.prompt) setPrompt(meta.prompt);
    if (typeof meta.negative_prompt === "string") setNegativePrompt(meta.negative_prompt);
    if (meta.seed !== undefined && meta.seed !== null) setSeed(String(meta.seed));
    if (meta.steps !== undefined && meta.steps !== null) setSteps(String(meta.steps));
    if (meta.cfg !== undefined && meta.cfg !== null) setCfg(String(meta.cfg));
    if (meta.denoise !== undefined && meta.denoise !== null) setDenoise(String(meta.denoise));
    if (meta.format_name && FORMAT_KEYS.includes(meta.format_name as FormatKey)) {
      setFormat(meta.format_name as FormatKey);
    }
    if (meta.width && meta.height) {
      setCustomWidth(String(meta.width));
      setCustomHeight(String(meta.height));
    }
    if (meta.model_id && meta.version_id && meta.file_id) {
      setSelection({
        modelId: meta.model_id,
        versionId: meta.version_id,
        fileId: meta.file_id,
      });
    }
    if (Array.isArray(meta.loras) && meta.loras.length > 0) {
      const activeLoras: ActiveLora[] = meta.loras.map((l, index) => {
        const matched = modelOptions.find(
          (m) =>
            (l.model_id && m.model_id === l.model_id) ||
            m.filename === l.lora ||
            m.title === l.lora ||
            l.lora.includes(m.filename) ||
            m.filename.includes(l.lora)
        );
        return {
          id: `remix-${index}-${l.lora}`,
          title: matched?.title || l.lora,
          baseModel: matched?.version_name || "SDXL",
          weight: l.strength,
          enabled: l.on,
          modelId: l.model_id || matched?.model_id,
          versionId: l.version_id || matched?.version_id,
          fileId: l.file_id || matched?.file_id,
          thumbnailUrl: matched?.cover_url,
        };
      });
      setLoras(activeLoras);
    }
  }, [modelOptions]);

  const handleDeleteOutput = useCallback(async (key: string) => {
    try {
      await api.deleteAsset(key);
      await refreshGallery();
    } catch (err) {
      console.error("Failed to delete asset:", err);
    }
  }, [refreshGallery]);

  return (
    <div className="workspace-bezel relative flex h-full min-h-0 w-full flex-col overflow-y-auto bg-transparent p-2 sm:p-3 lg:flex-row lg:gap-3 lg:overflow-hidden">
      {/* Left Control Panel (Collapsible) */}
      <div
        className={`min-h-0 shrink-0 ${
          isSidebarCollapsed ? "hidden lg:block lg:h-full lg:w-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none" : "h-auto w-full lg:h-full lg:w-[24.5rem]"
        }`}
      >
        <ControlPanel
          prompt={prompt}
          onPromptChange={setPrompt}
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
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
          progress={progress}
          progressLabel={progressLabel}
          imageCount={imageCount}
          onImageCountChange={setImageCount}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          onResetDefaults={resetStudioDefaults}
        />
      </div>

      {/* Main Canvas Area */}
      <CanvasPreview
        canGenerate={canGenerate}
        onGenerate={handleGenerate}
        busy={busy}
        progress={progress}
        progressLabel={progressLabel}
        gallery={gallery}
        error={error}
        outputWidth={outputDimensions.width}
        outputHeight={outputDimensions.height}
        referenceImage={referenceImage}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebarCollapse={() => setIsSidebarCollapsed((v) => !v)}
        onReload={refreshGallery}
        onRemix={handleRemix}
        onSetReferenceImage={setReferenceImage}
        onDeleteOutput={handleDeleteOutput}
        modelOptions={modelOptions}
      />
    </div>
  );
}
