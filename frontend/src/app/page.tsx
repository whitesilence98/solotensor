"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlPanel, { type FormatKey } from "@/components/ControlPanel";
import CanvasPreview from "@/components/CanvasPreview";
import {
  api,
  uuid,
  type GalleryItem,
  type GenerationMode,
  type GenerationResult,
  type InstalledGalleryModel,
  type ProgressEvent,
} from "@/lib/api";
import { loadSettings } from "@/lib/settings";

const SAVED_INPUTS_KEY = "solotensor:last-successful-inputs:v2";
const FORMATS: Record<Exclude<FormatKey, "custom">, readonly [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 896],
  "3:2": [1216, 832],
};
const FORMAT_KEYS: FormatKey[] = ["1:1", "16:9", "9:16", "4:3", "3:2", "custom"];

interface ModelIdentity {
  modelId: string;
  versionId: string;
  fileId: string;
}

interface SavedInputs extends ModelIdentity {
  mode: GenerationMode;
  prompt: string;
  negativePrompt: string;
  seed: string;
  steps: string;
  imageCount: string;
  cfg: string;
  denoise: string;
  format: FormatKey;
  customWidth: string;
  customHeight: string;
}

function modelKey(model: ModelIdentity): string {
  return `${model.modelId}:${model.versionId}:${model.fileId}`;
}

function galleryModelKey(model: InstalledGalleryModel): string {
  return modelKey({ modelId: model.model_id, versionId: model.version_id, fileId: model.file_id });
}

function loadSavedInputs(): Partial<SavedInputs> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_INPUTS_KEY) ?? "null") as unknown;
    if (!saved || typeof saved !== "object") return null;
    const values = saved as Record<string, unknown>;
    const inputs: Partial<SavedInputs> = {};
    if (values.mode === "text-to-image") inputs.mode = values.mode;
    for (const key of ["modelId", "versionId", "fileId", "prompt", "negativePrompt", "seed", "steps", "imageCount", "cfg", "denoise", "customWidth", "customHeight"] as const) {
      if (typeof values[key] === "string") inputs[key] = values[key];
    }
    if (typeof values.format === "string" && FORMAT_KEYS.includes(values.format as FormatKey)) {
      inputs.format = values.format as FormatKey;
    }
    return inputs;
  } catch {
    return null;
  }
}

export default function StudioPage() {
  const [mode, setMode] = useState<GenerationMode>("text-to-image");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selection, setSelection] = useState<ModelIdentity | null>(null);
  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [seed, setSeed] = useState("");
  const [steps, setSteps] = useState("10");
  const [imageCount, setImageCount] = useState("1");
  const [cfg, setCfg] = useState("1");
  const [denoise, setDenoise] = useState("1");
  const [format, setFormat] = useState<FormatKey>("9:16");
  const [customWidth, setCustomWidth] = useState("768");
  const [customHeight, setCustomHeight] = useState("1344");
  const references: string[] = [];
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>("");

  const selectedModel = useMemo(
    () => selection ? modelOptions.find((item) => galleryModelKey(item) === modelKey(selection)) ?? null : null,
    [modelOptions, selection],
  );

  const refreshGallery = useCallback(async () => {
    try {
      setGallery(await api.getGallery());
    } catch {
      /* gallery is non-critical; keep the last known items */
    }
  }, []);

  useEffect(() => {
    const saved = loadSavedInputs();
    if (!saved) {
      const settings = loadSettings();
      setFormat(settings.defaultFormat);
      setSteps(String(settings.defaultSteps));
      setImageCount(String(settings.defaultImageCount));
    } else {
      if (saved.mode !== undefined) setMode(saved.mode);
      if (saved.prompt !== undefined) setPrompt(saved.prompt);
      if (saved.negativePrompt !== undefined) setNegativePrompt(saved.negativePrompt);
      if (saved.seed !== undefined) setSeed(saved.seed);
      if (saved.steps !== undefined) setSteps(saved.steps);
      if (saved.imageCount !== undefined) setImageCount(saved.imageCount);
      if (saved.cfg !== undefined) setCfg(saved.cfg);
      if (saved.denoise !== undefined) setDenoise(saved.denoise);
      if (saved.format !== undefined) setFormat(saved.format);
      if (saved.customWidth !== undefined) setCustomWidth(saved.customWidth);
      if (saved.customHeight !== undefined) setCustomHeight(saved.customHeight);
      if (saved.modelId && saved.versionId && saved.fileId) {
        setSelection({ modelId: saved.modelId, versionId: saved.versionId, fileId: saved.fileId });
      }
    }
    const params = new URLSearchParams(window.location.search);
    const modelId = params.get("model_id");
    const versionId = params.get("version_id");
    const fileId = params.get("file_id");
    if (modelId && versionId && fileId) setSelection({ modelId, versionId, fileId });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || modelsLoading) return;
    try {
      localStorage.setItem(SAVED_INPUTS_KEY, JSON.stringify({
        mode,
        prompt,
        negativePrompt,
        modelId: selectedModel?.model_id ?? "",
        versionId: selectedModel?.version_id ?? "",
        fileId: selectedModel?.file_id ?? "",
        seed,
        steps,
        imageCount,
        cfg,
        denoise,
        format,
        customWidth,
        customHeight,
      } satisfies SavedInputs));
    } catch {
      /* storage can be unavailable without blocking edits */
    }
  }, [hydrated, modelsLoading, mode, prompt, negativePrompt, selectedModel, seed, steps, imageCount, cfg, denoise, format, customWidth, customHeight]);

  useEffect(() => {
    let cancelled = false;
    void api.listSelectableModels().then((items) => {
      if (cancelled) return;
      setModelOptions(items);
      setSelection((current) => {
        if (!current) return null;
        const valid = items.some((item) => galleryModelKey(item) === modelKey(current));
        if (!valid) setModelsError("The selected gallery model is unavailable or no longer installed.");
        return valid ? current : null;
      });
    }).catch((reason: unknown) => {
      if (!cancelled) setModelsError(reason instanceof Error ? reason.message : "Could not load installed gallery models");
    }).finally(() => {
      if (!cancelled) setModelsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { void refreshGallery(); }, [refreshGallery]);
  useEffect(() => () => wsRef.current?.close(), []);

  const outputDimensions = useMemo(() => {
    const values = format === "custom" ? [Number(customWidth), Number(customHeight)] : FORMATS[format];
    return {
      width: Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1,
      height: Number.isFinite(values[1]) && values[1] > 0 ? values[1] : 1,
    };
  }, [format, customWidth, customHeight]);

  const handleGenerate = useCallback(async () => {
    if (mode !== "text-to-image" || !prompt.trim() || busy) return;
    if (!selectedModel) {
      setError("Select an installed model from Models Gallery before generating.");
      return;
    }
    const [resolvedWidth, resolvedHeight] = format === "custom"
      ? [customWidth, customHeight]
      : FORMATS[format].map(String);
    const parsedSteps = Number(steps);
    const parsedImageCount = Number(imageCount);
    const parsedCfg = Number(cfg);
    const parsedDenoise = Number(denoise);
    const parsedWidth = Number(resolvedWidth);
    const parsedHeight = Number(resolvedHeight);
    const parsedSeed = seed.trim() ? Number(seed) : undefined;
    if (!Number.isInteger(parsedSteps) || parsedSteps < 1 || parsedSteps > 100 ||
        !Number.isInteger(parsedImageCount) || parsedImageCount < 1 || parsedImageCount > 4 ||
        !Number.isFinite(parsedCfg) || parsedCfg < 0 || parsedCfg > 30 ||
        !Number.isFinite(parsedDenoise) || parsedDenoise < 0 || parsedDenoise > 1 ||
        !Number.isInteger(parsedWidth) || parsedWidth < 64 || parsedWidth > 4096 || parsedWidth % 8 !== 0 ||
        !Number.isInteger(parsedHeight) || parsedHeight < 64 || parsedHeight > 4096 || parsedHeight % 8 !== 0 ||
        (parsedSeed !== undefined && (!Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 2 ** 32 - 1))) {
      setError("Steps, image count, CFG, denoise, seed, and dimensions must be valid ComfyUI values.");
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
      const result: GenerationResult = await api.generate({
        model_id: selectedModel.model_id,
        version_id: selectedModel.version_id,
        file_id: selectedModel.file_id,
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
      });
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
  }, [mode, prompt, negativePrompt, selectedModel, seed, steps, imageCount, cfg, denoise, format, customWidth, customHeight, busy, refreshGallery]);

  const canGenerate = useMemo(() => mode === "text-to-image" && prompt.trim().length > 0 && selectedModel !== null && !busy, [mode, prompt, selectedModel, busy]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden overscroll-contain bg-transparent lg:flex-row">
      <ControlPanel
        prompt={prompt}
        onPromptChange={setPrompt}
        negativePrompt={negativePrompt}
        onNegativePromptChange={setNegativePrompt}
        selectedModel={selectedModel}
        modelOptions={modelOptions}
        onModelChange={(key) => {
          const model = modelOptions.find((item) => galleryModelKey(item) === key) ?? null;
          const next = model ? { modelId: model.model_id, versionId: model.version_id, fileId: model.file_id } : null;
          setSelection(next);
          setModelsError(null);
          const params = new URLSearchParams(window.location.search);
          if (next) {
            params.set("model_id", next.modelId);
            params.set("version_id", next.versionId);
            params.set("file_id", next.fileId);
          } else {
            params.delete("model_id");
            params.delete("version_id");
            params.delete("file_id");
          }
          const query = params.toString();
          window.history.replaceState(null, "", query ? `/?${query}` : "/");
        }}
        seed={seed}
        onSeedChange={setSeed}
        steps={steps}
        onStepsChange={setSteps}
        imageCount={imageCount}
        onImageCountChange={setImageCount}
        cfg={cfg}
        onCfgChange={setCfg}
        denoise={denoise}
        onDenoiseChange={setDenoise}
        customWidth={customWidth}
        onCustomWidthChange={setCustomWidth}
        customHeight={customHeight}
        onCustomHeightChange={setCustomHeight}
        format={format}
        onFormatChange={setFormat}
        busy={busy}
        progress={progress}
        progressLabel={progressLabel}
        modelsLoading={modelsLoading}
        modelsError={modelsError}
        canGenerate={canGenerate}
        onGenerate={handleGenerate}
      />
      <CanvasPreview
        busy={busy}
        progress={progress}
        progressLabel={progressLabel}
        gallery={gallery}
        error={error}
        outputWidth={outputDimensions.width}
        outputHeight={outputDimensions.height}
        referenceImage={references[0] ?? null}
      />
    </div>
  );
}
