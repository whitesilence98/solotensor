"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlPanel, {
  type ActiveEmbedding,
  type ActiveLora,
  type FormatKey,
  type TensorMode,
} from "@/components/ControlPanel";
import CanvasPreview from "@/components/CanvasPreview";
import { type UpscaleConfig, DEFAULT_UPSCALE_CONFIG } from "@/components/UpscalePanel";
import { type DetailerConfig, DEFAULT_DETAILER_CONFIG } from "@/components/DetailerPanel";
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
import { useAuth } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/rbac";
import { findMatchingModel, resolveLoraDisplayName } from "@/lib/models";

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

interface TabState {
  prompt: string;
  negativePrompt: string;
  selection: ModelIdentity | null;
  baseSelection: ModelIdentity | null;
  loras: ActiveLora[];
  embeddings: ActiveEmbedding[];
  seed: string;
  steps: string;
  imageCount: string;
  cfg: string;
  denoise: string;
  format: FormatKey;
  customWidth: string;
  customHeight: string;
  referenceImage: string | null;
  isPrivate: boolean;
  enableDetailer: boolean;
  upscaleConfig: UpscaleConfig;
  detailerConfig: DetailerConfig;
  // Edit mode
  maskImage: string | null;
  maskBlur: number;
  inpaintFill: "original" | "latent_noise" | "latent_zero";
  // Video mode
  motionBucketId: number;
  videoFrames: number;
  videoFps: number;
  // Prime mode
  primePreset: string;
}

function getTabStorageKey(tensorMode: TensorMode): string {
  switch (tensorMode) {
    case "Text2Img":
      return SAVED_INPUTS_KEY;
    case "Img2Img":
      return "solotensor:studio:draft:img2img";
    case "Edit":
      return "solotensor:studio:draft:edit";
    case "Video":
      return "solotensor:studio:draft:video";
    case "Prime":
      return "solotensor:studio:draft:prime";
  }
}

function createDefaultTabState(
  mode: TensorMode,
  defaultFormat: FormatKey = "9:16",
  defaultSteps: number = 25
): TabState {
  switch (mode) {
    case "Text2Img":
      return {
        prompt: DEFAULT_SAMPLE_PROMPT,
        negativePrompt: "",
        selection: null,
        baseSelection: null,
        loras: [],
        embeddings: [],
        seed: "-1",
        steps: String(defaultSteps || 25),
        imageCount: "1",
        cfg: "7.0",
        denoise: "1",
        format: defaultFormat || "9:16",
        customWidth: "768",
        customHeight: "1344",
        referenceImage: null,
        isPrivate: false,
        enableDetailer: false,
        upscaleConfig: DEFAULT_UPSCALE_CONFIG,
        detailerConfig: DEFAULT_DETAILER_CONFIG,
        maskImage: null,
        maskBlur: 8,
        inpaintFill: "original",
        motionBucketId: 127,
        videoFrames: 25,
        videoFps: 16,
        primePreset: "portrait_pro",
      };

    case "Img2Img":
      return {
        prompt: "",
        negativePrompt: "",
        selection: null,
        baseSelection: null,
        loras: [],
        embeddings: [],
        seed: "-1",
        steps: "25",
        imageCount: "1",
        cfg: "7.0",
        denoise: "0.65",
        format: "custom",
        customWidth: "1024",
        customHeight: "1024",
        referenceImage: null,
        isPrivate: false,
        enableDetailer: false,
        upscaleConfig: DEFAULT_UPSCALE_CONFIG,
        detailerConfig: DEFAULT_DETAILER_CONFIG,
        maskImage: null,
        maskBlur: 8,
        inpaintFill: "original",
        motionBucketId: 127,
        videoFrames: 25,
        videoFps: 16,
        primePreset: "portrait_pro",
      };

    case "Edit":
      return {
        prompt: "",
        negativePrompt: "",
        selection: null,
        baseSelection: null,
        loras: [],
        embeddings: [],
        seed: "-1",
        steps: "30",
        imageCount: "1",
        cfg: "7.0",
        denoise: "0.75",
        format: "custom",
        customWidth: "1024",
        customHeight: "1024",
        referenceImage: null,
        isPrivate: false,
        enableDetailer: false,
        upscaleConfig: DEFAULT_UPSCALE_CONFIG,
        detailerConfig: DEFAULT_DETAILER_CONFIG,
        maskImage: null,
        maskBlur: 8,
        inpaintFill: "original",
        motionBucketId: 127,
        videoFrames: 25,
        videoFps: 16,
        primePreset: "portrait_pro",
      };

    case "Video":
      return {
        prompt: "",
        negativePrompt: "",
        selection: null,
        baseSelection: null,
        loras: [],
        embeddings: [],
        seed: "-1",
        steps: "25",
        imageCount: "1",
        cfg: "2.5",
        denoise: "1",
        format: "16:9",
        customWidth: "1024",
        customHeight: "576",
        referenceImage: null,
        isPrivate: false,
        enableDetailer: false,
        upscaleConfig: DEFAULT_UPSCALE_CONFIG,
        detailerConfig: DEFAULT_DETAILER_CONFIG,
        maskImage: null,
        maskBlur: 8,
        inpaintFill: "original",
        motionBucketId: 127,
        videoFrames: 25,
        videoFps: 16,
        primePreset: "portrait_pro",
      };

    case "Prime":
      return {
        prompt: DEFAULT_SAMPLE_PROMPT,
        negativePrompt: "",
        selection: null,
        baseSelection: null,
        loras: [],
        embeddings: [],
        seed: "-1",
        steps: "30",
        imageCount: "1",
        cfg: "7.0",
        denoise: "1",
        format: defaultFormat || "9:16",
        customWidth: "768",
        customHeight: "1344",
        referenceImage: null,
        isPrivate: false,
        enableDetailer: true,
        upscaleConfig: { ...DEFAULT_UPSCALE_CONFIG, enabled: true, scale: 1.5 },
        detailerConfig: { ...DEFAULT_DETAILER_CONFIG, enabled: true },
        maskImage: null,
        maskBlur: 8,
        inpaintFill: "original",
        motionBucketId: 127,
        videoFrames: 25,
        videoFps: 16,
        primePreset: "portrait_pro",
      };
  }
}

function parseSavedTabState(raw: string, defaults: TabState): TabState {
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return defaults;
    return {
      ...defaults,
      prompt: typeof saved.prompt === "string" ? saved.prompt : defaults.prompt,
      negativePrompt: typeof saved.negativePrompt === "string" ? saved.negativePrompt : defaults.negativePrompt,
      seed: typeof saved.seed === "string" ? saved.seed : typeof saved.seed === "number" ? String(saved.seed) : defaults.seed,
      steps: typeof saved.steps === "string" ? saved.steps : typeof saved.steps === "number" ? String(saved.steps) : defaults.steps,
      imageCount: typeof saved.imageCount === "string" ? saved.imageCount : defaults.imageCount,
      cfg: typeof saved.cfg === "string" ? saved.cfg : typeof saved.cfg === "number" ? String(saved.cfg) : defaults.cfg,
      denoise: typeof saved.denoise === "string" ? saved.denoise : typeof saved.denoise === "number" ? String(saved.denoise) : defaults.denoise,
      format: typeof saved.format === "string" && FORMAT_KEYS.includes(saved.format) ? saved.format : defaults.format,
      customWidth: typeof saved.customWidth === "string" ? saved.customWidth : defaults.customWidth,
      customHeight: typeof saved.customHeight === "string" ? saved.customHeight : defaults.customHeight,
      referenceImage: typeof saved.referenceImage === "string" ? saved.referenceImage : defaults.referenceImage,
      selection:
        saved.modelId && saved.versionId && saved.fileId
          ? { modelId: saved.modelId, versionId: saved.versionId, fileId: saved.fileId }
          : saved.selection || defaults.selection,
      baseSelection: saved.baseSelection || defaults.baseSelection,
      loras: Array.isArray(saved.loras)
        ? saved.loras.map((l: ActiveLora) => ({
            ...l,
            weight: typeof l.weight === "number" ? Math.max(0, Math.min(1, l.weight)) : 0.8,
          }))
        : defaults.loras,
      embeddings: Array.isArray(saved.embeddings) ? saved.embeddings : defaults.embeddings,
      isPrivate: typeof saved.isPrivate === "boolean" ? saved.isPrivate : defaults.isPrivate,
      enableDetailer: typeof saved.enableDetailer === "boolean" ? saved.enableDetailer : defaults.enableDetailer,
      upscaleConfig: saved.upscaleConfig ? { ...defaults.upscaleConfig, ...saved.upscaleConfig } : defaults.upscaleConfig,
      detailerConfig: saved.detailerConfig ? { ...defaults.detailerConfig, ...saved.detailerConfig } : defaults.detailerConfig,
      maskImage: typeof saved.maskImage === "string" ? saved.maskImage : defaults.maskImage,
      maskBlur: typeof saved.maskBlur === "number" ? saved.maskBlur : defaults.maskBlur,
      inpaintFill: ["original", "latent_noise", "latent_zero"].includes(saved.inpaintFill) ? saved.inpaintFill : defaults.inpaintFill,
      motionBucketId: typeof saved.motionBucketId === "number" ? saved.motionBucketId : defaults.motionBucketId,
      videoFrames: typeof saved.videoFrames === "number" ? saved.videoFrames : defaults.videoFrames,
      videoFps: typeof saved.videoFps === "number" ? saved.videoFps : defaults.videoFps,
      primePreset: typeof saved.primePreset === "string" ? saved.primePreset : defaults.primePreset,
    };
  } catch {
    return defaults;
  }
}

export default function StudioPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<GenerationMode>("text-to-image");
  const [activeTensorMode, setActiveTensorMode] = useState<TensorMode>("Text2Img");

  const [tabStates, setTabStates] = useState<Record<TensorMode, TabState>>(() => {
    const settings = loadSettings();
    return {
      Text2Img: createDefaultTabState("Text2Img", settings.defaultFormat, settings.defaultSteps),
      Img2Img: createDefaultTabState("Img2Img", settings.defaultFormat, settings.defaultSteps),
      Edit: createDefaultTabState("Edit", settings.defaultFormat, settings.defaultSteps),
      Video: createDefaultTabState("Video", settings.defaultFormat, settings.defaultSteps),
      Prime: createDefaultTabState("Prime", settings.defaultFormat, settings.defaultSteps),
    };
  });

  const activeTab = tabStates[activeTensorMode];

  const updateActiveTab = useCallback(
    (patch: Partial<TabState> | ((prev: TabState) => Partial<TabState>)) => {
      setTabStates((prev) => {
        const current = prev[activeTensorMode];
        const update = typeof patch === "function" ? patch(current) : patch;
        return {
          ...prev,
          [activeTensorMode]: {
            ...current,
            ...update,
          },
        };
      });
    },
    [activeTensorMode]
  );

  const handleTensorModeChange = useCallback((newMode: TensorMode) => {
    setActiveTensorMode(newMode);
    if (newMode === "Img2Img" || newMode === "Edit") {
      setMode("image-to-image");
    } else {
      setMode("text-to-image");
    }
  }, []);

  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>("");

  // Find currently selected Basic Model for the active tab
  const selectedModel = useMemo(() => {
    if (activeTab.selection) {
      return (
        modelOptions.find((item) => galleryModelKey(item) === modelKey(activeTab.selection!)) ??
        null
      );
    }
    const baseFirst = modelOptions.find((item) => isBaseModel(item.model_type));
    return baseFirst ?? null;
  }, [modelOptions, activeTab.selection]);

  const baseModel = useMemo(() => {
    if (activeTab.baseSelection) {
      return (
        modelOptions.find((item) => galleryModelKey(item) === modelKey(activeTab.baseSelection!)) ??
        null
      );
    }
    if (selectedModel && isBaseModel(selectedModel.model_type)) {
      return selectedModel;
    }
    return modelOptions.find((item) => isBaseModel(item.model_type)) ?? null;
  }, [modelOptions, activeTab.baseSelection, selectedModel]);

  const baseModelOptions = useMemo(() => {
    return modelOptions.filter((item) => isBaseModel(item.model_type));
  }, [modelOptions]);

  const refreshGallery = useCallback(async () => {
    try {
      setGallery(await api.getMyGallery());
    } catch {
      /* gallery is non-critical */
    }
  }, []);

  // Hydrate all tab states from partitioned localStorage
  useEffect(() => {
    try {
      const settings = loadSettings();
      const modes: TensorMode[] = ["Text2Img", "Img2Img", "Edit", "Video", "Prime"];
      const loaded: Partial<Record<TensorMode, TabState>> = {};

      for (const m of modes) {
        const key = getTabStorageKey(m);
        let raw = localStorage.getItem(key);
        if (!raw && m === "Text2Img") {
          raw =
            localStorage.getItem("solotensor:last-successful-inputs:v4") ??
            localStorage.getItem("comfy_studio_saved_inputs");
        }
        const def = createDefaultTabState(m, settings.defaultFormat, settings.defaultSteps);
        loaded[m] = raw ? parseSavedTabState(raw, def) : def;
      }

      setTabStates(loaded as Record<TensorMode, TabState>);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const resetStudioDefaults = useCallback(() => {
    const settings = loadSettings();
    const defaultState = createDefaultTabState(
      activeTensorMode,
      settings.defaultFormat,
      settings.defaultSteps
    );
    setTabStates((prev) => ({
      ...prev,
      [activeTensorMode]: defaultState,
    }));
    try {
      localStorage.removeItem(getTabStorageKey(activeTensorMode));
      if (activeTensorMode === "Text2Img") {
        localStorage.removeItem("solotensor:last-successful-inputs:v4");
        localStorage.removeItem("comfy_studio_saved_inputs");
      }
    } catch {
      // ignore
    }
  }, [activeTensorMode]);

  // Persist the currently active tab whenever it changes
  useEffect(() => {
    if (!hydrated || modelsLoading) return;
    try {
      const currentState = tabStates[activeTensorMode];
      localStorage.setItem(
        getTabStorageKey(activeTensorMode),
        JSON.stringify({
          ...currentState,
          modelId: selectedModel?.model_id ?? currentState.selection?.modelId ?? "",
          versionId: selectedModel?.version_id ?? currentState.selection?.versionId ?? "",
          fileId: selectedModel?.file_id ?? currentState.selection?.fileId ?? "",
        })
      );
    } catch {
      /* ignore */
    }
  }, [hydrated, modelsLoading, activeTensorMode, tabStates, selectedModel]);

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
  }, [refreshGallery, user?.id]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const outputDimensions = useMemo(() => {
    const values =
      activeTab.format === "custom"
        ? [Number(activeTab.customWidth), Number(activeTab.customHeight)]
        : FORMATS[activeTab.format];
    return {
      width: Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1024,
      height: Number.isFinite(values[1]) && values[1] > 0 ? values[1] : 1024,
    };
  }, [activeTab.format, activeTab.customWidth, activeTab.customHeight]);

  const canGenerate = useMemo(() => {
    if (!activeTab.prompt.trim() || busy) return false;
    if ((activeTensorMode === "Img2Img" || activeTensorMode === "Edit") && !activeTab.referenceImage) {
      return false;
    }
    return true;
  }, [activeTab.prompt, busy, activeTensorMode, activeTab.referenceImage]);

  const handleGenerate = useCallback(async () => {
    if (!activeTab.prompt.trim() || busy) return;
    if ((activeTensorMode === "Img2Img" || activeTensorMode === "Edit") && !activeTab.referenceImage) {
      setError(`Please upload a reference image for ${activeTensorMode} generation.`);
      return;
    }

    // Determine effective model to use
    let targetModel = selectedModel;
    let effectiveBase = baseModel;

    const isPrimaryLora = isAdapterModel(targetModel?.model_type);

    if (!targetModel) {
      targetModel =
        modelOptions.find((m) => isBaseModel(m.model_type)) ?? modelOptions[0] ?? null;
    }

    if (!targetModel) {
      setError("Please ensure at least one model is available in the gallery before generating.");
      return;
    }

    // Build active lora_adapters from the active tab's stacked LoRA cards
    const loraAdapters: LoraAdapterPayload[] = activeTab.loras
      .filter((l) => Boolean(l.modelId && l.fileId && l.versionId) && l.enabled !== false)
      .map((l) => ({
        model_id: l.modelId!,
        version_id: l.versionId!,
        file_id: l.fileId!,
        strength: l.weight,
        on: l.enabled !== false,
      }));

    const [resolvedWidth, resolvedHeight] =
      activeTab.format === "custom"
        ? [activeTab.customWidth, activeTab.customHeight]
        : FORMATS[activeTab.format].map(String);

    const parsedSteps = Math.max(1, Math.min(100, Number(activeTab.steps) || 20));
    const parsedImageCount = Math.max(1, Math.min(4, Number(activeTab.imageCount) || 1));
    const parsedCfg = Math.max(0, Math.min(30, Number(activeTab.cfg) || 7.0));
    const parsedDenoise = Math.max(0, Math.min(1, Number(activeTab.denoise) || 1.0));
    const parsedWidth = Math.floor((Number(resolvedWidth) || 1024) / 8) * 8;
    const parsedHeight = Math.floor((Number(resolvedHeight) || 1024) / 8) * 8;
    const rawSeed = activeTab.seed.trim();
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

    // Denoise routing: 1.0 in Text2Img, Video, Prime; configurable in Img2Img and Edit
    const effectiveDenoise =
      activeTensorMode === "Img2Img" || activeTensorMode === "Edit"
        ? parsedDenoise
        : 1.0;

    const effectiveMode: GenerationMode =
      activeTensorMode === "Img2Img" || activeTensorMode === "Edit"
        ? "image-to-image"
        : "text-to-image";

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
        mode: effectiveMode,
        ...(effectiveMode === "image-to-image" && activeTab.referenceImage
          ? { reference_images: [activeTab.referenceImage] }
          : {}),
        prompt: activeTab.prompt,
        negative_prompt: activeTab.negativePrompt,
        seed: parsedSeed,
        steps: parsedSteps,
        image_count: parsedImageCount,
        cfg: parsedCfg,
        denoise: effectiveDenoise,
        width: parsedWidth,
        height: parsedHeight,
        format_name: activeTab.format,
        client_id: clientId,
        lora_adapters: loraAdapters,
        is_private: activeTab.isPrivate,
        enable_detailer:
          activeTab.enableDetailer ||
          activeTab.detailerConfig.enabled ||
          activeTensorMode === "Prime",
        upscale: {
          enabled: activeTab.upscaleConfig.enabled || activeTensorMode === "Prime",
          scale:
            activeTab.upscaleConfig.scale === 0
              ? activeTab.upscaleConfig.customScale ?? 2
              : activeTab.upscaleConfig.scale,
          dit_model: activeTab.upscaleConfig.ditModel,
          color_correction: activeTab.upscaleConfig.colorCorrection,
          input_noise_scale: activeTab.upscaleConfig.inputNoiseScale,
          latent_noise_scale: activeTab.upscaleConfig.latentNoiseScale,
          upscaler: activeTab.upscaleConfig.upscaler,
          hires_steps: activeTab.upscaleConfig.hiresSteps,
          denoising_strength: activeTab.upscaleConfig.denoisingStrength,
        },
        detailer: {
          enabled:
            activeTab.detailerConfig.enabled ||
            activeTab.enableDetailer ||
            activeTensorMode === "Prime",
          items: activeTab.detailerConfig.items.map((item) => ({
            type: item.type,
            enabled: item.enabled,
            detector_model: item.detectorModel || undefined,
            prompt: item.prompt,
            negative_prompt: item.negativePrompt,
            steps: item.steps,
            cfg_scale: item.cfgScale,
            denoising_strength: item.denoisingStrength,
            inpaint_mask_blur: item.inpaintMaskBlur,
            inpaint_only_masked: item.inpaintOnlyMasked,
            bbox_threshold: item.bboxThreshold,
            bbox_dilation: item.bboxDilation,
          })),
        },
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
    activeTab,
    activeTensorMode,
    selectedModel,
    baseModel,
    modelOptions,
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
            updateActiveTab((prev) => {
              const alreadyExists = prev.loras.some(
                (l) =>
                  l.modelId === target.model_id &&
                  (!target.file_id || l.fileId === target.file_id)
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
              return { loras: [...prev.loras, newLora] };
            });

            if (urlBaseModelId) {
              const baseMatch =
                modelOptions.find(
                  (m) =>
                    m.model_id === urlBaseModelId &&
                    (!urlBaseFileId || m.file_id === urlBaseFileId)
                ) || modelOptions.find((m) => m.model_id === urlBaseModelId);
              if (baseMatch) {
                updateActiveTab({
                  baseSelection: {
                    modelId: baseMatch.model_id,
                    versionId: baseMatch.version_id,
                    fileId: baseMatch.file_id,
                  },
                });
              }
            }
          } else {
            updateActiveTab({
              selection: {
                modelId: target.model_id,
                versionId: target.version_id,
                fileId: target.file_id,
              },
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, [modelOptions, updateActiveTab]);

  const handleRemix = useCallback(
    (meta: GalleryMetadata) => {
      updateActiveTab((prev) => {
        const next: Partial<TabState> = {};
        if (meta.prompt) next.prompt = meta.prompt;
        if (typeof meta.negative_prompt === "string") next.negativePrompt = meta.negative_prompt;
        if (meta.seed !== undefined && meta.seed !== null) next.seed = String(meta.seed);
        if (meta.steps !== undefined && meta.steps !== null) next.steps = String(meta.steps);
        if (meta.cfg !== undefined && meta.cfg !== null) next.cfg = String(meta.cfg);
        if (meta.denoise !== undefined && meta.denoise !== null) next.denoise = String(meta.denoise);
        if (meta.format_name && FORMAT_KEYS.includes(meta.format_name as FormatKey)) {
          next.format = meta.format_name as FormatKey;
        }
        if (meta.width && meta.height) {
          next.customWidth = String(meta.width);
          next.customHeight = String(meta.height);
        }
        if (meta.model_id && meta.version_id && meta.file_id) {
          next.selection = {
            modelId: meta.model_id,
            versionId: meta.version_id,
            fileId: meta.file_id,
          };
        }
        if (Array.isArray(meta.loras) && meta.loras.length > 0) {
          const activeLoras: ActiveLora[] = meta.loras.map((l, index) => {
            const matched = findMatchingModel(
              {
                modelId: (l as any).model_id || (l as any).modelId,
                fileId: (l as any).file_id || (l as any).fileId,
                filename: l.lora,
                title: (l as any).title,
              },
              modelOptions
            );
            const resolvedTitle = matched?.title || resolveLoraDisplayName(l, modelOptions);
            return {
              id: `remix-${index}-${l.lora}`,
              title: resolvedTitle,
              baseModel: matched?.version_name || "SDXL",
              weight: typeof l.strength === "number" ? Math.max(0, Math.min(1, l.strength)) : 0.8,
              enabled: l.on,
              modelId: l.model_id || matched?.model_id,
              versionId: l.version_id || matched?.version_id,
              fileId: l.file_id || matched?.file_id,
              thumbnailUrl: matched?.cover_url,
            };
          });
          next.loras = activeLoras;
        }
        return next;
      });
    },
    [modelOptions, updateActiveTab]
  );

  const handleDeleteOutput = useCallback(
    async (key: string) => {
      try {
        await api.deleteAsset(key);
        await refreshGallery();
      } catch (err) {
        console.error("Failed to delete asset:", err);
      }
    },
    [refreshGallery]
  );

  return (
    <ProtectedRoute
      requireAuth={true}
      title="Studio Access"
      description="Sign in to generate assets, adjust parametric samplers, and view your private creative history."
    >
      <div className="workspace-bezel relative flex h-full min-h-0 w-full flex-col overflow-y-auto bg-transparent p-2 sm:p-3 lg:flex-row lg:gap-3 lg:overflow-hidden">
        {/* Left Control Panel (Collapsible) */}
        <div
          className={`min-h-0 shrink-0 ${
            isSidebarCollapsed
              ? "hidden lg:block lg:h-full lg:w-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none"
              : "h-auto w-full lg:h-full lg:w-[24.5rem]"
          }`}
        >
          <ControlPanel
            activeMode={activeTensorMode}
            onActiveModeChange={handleTensorModeChange}
            referenceImage={activeTab.referenceImage}
            onReferenceImageChange={(img) => updateActiveTab({ referenceImage: img })}
            prompt={activeTab.prompt}
            onPromptChange={(p) => updateActiveTab({ prompt: p })}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            onModelChange={(key) => {
              const model = modelOptions.find((item) => galleryModelKey(item) === key) ?? null;
              const next = model
                ? { modelId: model.model_id, versionId: model.version_id, fileId: model.file_id }
                : null;
              updateActiveTab({ selection: next });
              setModelsError(null);
            }}
            baseModel={baseModel}
            baseModelOptions={baseModelOptions}
            onBaseModelChange={(key) => {
              const model = baseModelOptions.find((item) => galleryModelKey(item) === key) ?? null;
              updateActiveTab({
                baseSelection: model
                  ? { modelId: model.model_id, versionId: model.version_id, fileId: model.file_id }
                  : null,
              });
            }}
            loras={activeTab.loras}
            onLorasChange={(loras) => updateActiveTab({ loras })}
            embeddings={activeTab.embeddings}
            onEmbeddingsChange={(embeddings) => updateActiveTab({ embeddings })}
            seed={activeTab.seed}
            onSeedChange={(seed) => updateActiveTab({ seed })}
            steps={activeTab.steps}
            onStepsChange={(steps) => updateActiveTab({ steps })}
            cfg={activeTab.cfg}
            onCfgChange={(cfg) => updateActiveTab({ cfg })}
            denoise={activeTab.denoise}
            onDenoiseChange={(denoise) => updateActiveTab({ denoise })}
            negativePrompt={activeTab.negativePrompt}
            onNegativePromptChange={(negativePrompt) => updateActiveTab({ negativePrompt })}
            customWidth={activeTab.customWidth}
            onCustomWidthChange={(customWidth) => updateActiveTab({ customWidth })}
            customHeight={activeTab.customHeight}
            onCustomHeightChange={(customHeight) => updateActiveTab({ customHeight })}
            format={activeTab.format}
            onFormatChange={(format) => updateActiveTab({ format })}
            isPrivate={activeTab.isPrivate}
            onPrivateChange={(isPrivate) => updateActiveTab({ isPrivate })}
            enableDetailer={activeTab.enableDetailer}
            onDetailerChange={(enableDetailer) => updateActiveTab({ enableDetailer })}
            upscaleConfig={activeTab.upscaleConfig}
            onUpscaleConfigChange={(upscaleConfig) => updateActiveTab({ upscaleConfig })}
            detailerConfig={activeTab.detailerConfig}
            onDetailerConfigChange={(detailerConfig) => updateActiveTab({ detailerConfig })}
            maskImage={activeTab.maskImage}
            onMaskImageChange={(maskImage) => updateActiveTab({ maskImage })}
            maskBlur={activeTab.maskBlur}
            onMaskBlurChange={(maskBlur) => updateActiveTab({ maskBlur })}
            inpaintFill={activeTab.inpaintFill}
            onInpaintFillChange={(inpaintFill) => updateActiveTab({ inpaintFill })}
            motionBucketId={activeTab.motionBucketId}
            onMotionBucketIdChange={(motionBucketId) => updateActiveTab({ motionBucketId })}
            videoFrames={activeTab.videoFrames}
            onVideoFramesChange={(videoFrames) => updateActiveTab({ videoFrames })}
            videoFps={activeTab.videoFps}
            onVideoFpsChange={(videoFps) => updateActiveTab({ videoFps })}
            primePreset={activeTab.primePreset}
            onPrimePresetChange={(primePreset) => updateActiveTab({ primePreset })}
            busy={busy}
            canGenerate={canGenerate}
            onGenerate={handleGenerate}
            progress={progress}
            progressLabel={progressLabel}
            imageCount={activeTab.imageCount}
            onImageCountChange={(imageCount) => updateActiveTab({ imageCount })}
            modelsLoading={modelsLoading}
            modelsError={modelsError}
            onResetDefaults={resetStudioDefaults}
          />
        </div>

        {/* Main Canvas Area */}
        <CanvasPreview
          prompt={activeTab.prompt}
          onPromptChange={(p) => updateActiveTab({ prompt: p })}
          activeModelTitle={selectedModel?.title || "Krea 2 Turbo"}
          aspectRatio={activeTab.format}
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
          busy={busy}
          progress={progress}
          progressLabel={progressLabel}
          gallery={gallery}
          error={error}
          outputWidth={outputDimensions.width}
          outputHeight={outputDimensions.height}
          referenceImage={activeTab.referenceImage}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={() => setIsSidebarCollapsed((v) => !v)}
          onReload={refreshGallery}
          onRemix={handleRemix}
          onSetReferenceImage={(url) => updateActiveTab({ referenceImage: url })}
          onDeleteOutput={handleDeleteOutput}
          modelOptions={modelOptions}
        />
      </div>
    </ProtectedRoute>
  );
}
