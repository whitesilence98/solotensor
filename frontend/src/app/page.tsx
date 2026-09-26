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
  type ProgressEvent,
} from "@/lib/api";

const DEFAULT_UNET = "krea2\\krea2_turbo_fp8_scaled.safetensors";
const DEFAULT_CLIP = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors";
const DEFAULT_VAE = "wan_2.1_vae.safetensors";
const SAVED_INPUTS_KEY = "solotensor:last-successful-inputs:v1";
const FORMATS: Record<Exclude<FormatKey, "custom">, readonly [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 896],
  "3:2": [1216, 832],
};
const FORMAT_KEYS: FormatKey[] = ["1:1", "16:9", "9:16", "4:3", "3:2", "custom"];

interface SavedInputs {
  mode: GenerationMode;
  prompt: string;
  negativePrompt: string;
  unetName: string;
  clipName: string;
  vaeName: string;
  seed: string;
  steps: string;
  format: FormatKey;
  customWidth: string;
  customHeight: string;
}

function loadSavedInputs(): Partial<SavedInputs> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_INPUTS_KEY) ?? "null") as unknown;
    if (!saved || typeof saved !== "object") return null;
    const values = saved as Record<string, unknown>;
    const inputs: Partial<SavedInputs> = {};
    if (values.mode === "text-to-image" || values.mode === "image-to-image") inputs.mode = values.mode;
    for (const key of ["prompt", "negativePrompt", "unetName", "clipName", "vaeName", "seed", "steps", "customWidth", "customHeight"] as const) {
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
  const [unetName, setUnetName] = useState(DEFAULT_UNET);
  const [clipName, setClipName] = useState(DEFAULT_CLIP);
  const [vaeName, setVaeName] = useState(DEFAULT_VAE);
  const [unetOptions, setUnetOptions] = useState<string[]>([DEFAULT_UNET]);
  const [clipOptions, setClipOptions] = useState<string[]>([DEFAULT_CLIP]);
  const [vaeOptions, setVaeOptions] = useState<string[]>([DEFAULT_VAE]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [seed, setSeed] = useState("");
  const [steps, setSteps] = useState("10");
  const [format, setFormat] = useState<FormatKey>("9:16");
  const [customWidth, setCustomWidth] = useState("768");
  const [customHeight, setCustomHeight] = useState("1344");
  const [references, setReferences] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>("");

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
      setHydrated(true);
      return;
    }
    if (saved.mode !== undefined) setMode(saved.mode);
    if (saved.prompt !== undefined) setPrompt(saved.prompt);
    if (saved.negativePrompt !== undefined) setNegativePrompt(saved.negativePrompt);
    if (saved.unetName !== undefined) setUnetName(saved.unetName);
    if (saved.clipName !== undefined) setClipName(saved.clipName);
    if (saved.vaeName !== undefined) setVaeName(saved.vaeName);
    if (saved.seed !== undefined) setSeed(saved.seed);
    if (saved.steps !== undefined) setSteps(saved.steps);
    if (saved.format !== undefined) setFormat(saved.format);
    if (saved.customWidth !== undefined) setCustomWidth(saved.customWidth);
    if (saved.customHeight !== undefined) setCustomHeight(saved.customHeight);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SAVED_INPUTS_KEY, JSON.stringify({
        mode,
        prompt,
        negativePrompt,
        unetName,
        clipName,
        vaeName,
        seed,
        steps,
        format,
        customWidth,
        customHeight,
      } satisfies SavedInputs));
    } catch {
      /* storage can be unavailable without blocking edits */
    }
  }, [hydrated, mode, prompt, negativePrompt, unetName, clipName, vaeName, seed, steps, format, customWidth, customHeight]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getModels("diffusion_models"),
      api.getModels("text_encoders"),
      api.getModels("vae"),
    ]).then(([unets, clips, vaes]) => {
      if (cancelled) return;
      if (unets.length) {
        setUnetOptions(unets);
        setUnetName((current) => unets.includes(current) ? current : unets[0]);
      }
      if (clips.length) {
        setClipOptions(clips);
        setClipName((current) => clips.includes(current) ? current : clips[0]);
      }
      if (vaes.length) {
        setVaeOptions(vaes);
        setVaeName((current) => vaes.includes(current) ? current : vaes[0]);
      }
    }).catch((err: unknown) => {
      if (!cancelled) setModelsError(err instanceof Error ? err.message : "Could not load model lists.");
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
    const [resolvedWidth, resolvedHeight] = format === "custom"
      ? [customWidth, customHeight]
      : FORMATS[format].map(String);
    const parsedSteps = Number(steps);
    const parsedWidth = Number(resolvedWidth);
    const parsedHeight = Number(resolvedHeight);
    const parsedSeed = seed.trim() ? Number(seed) : undefined;
    if (!Number.isInteger(parsedSteps) || parsedSteps < 1 || parsedSteps > 100 ||
        !Number.isInteger(parsedWidth) || parsedWidth < 64 || parsedWidth > 4096 || parsedWidth % 8 !== 0 ||
        !Number.isInteger(parsedHeight) || parsedHeight < 64 || parsedHeight > 4096 || parsedHeight % 8 !== 0 ||
        (parsedSeed !== undefined && (!Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 2 ** 32 - 1))) {
      setError("Steps, seed, and dimensions must be valid ComfyUI values.");
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
        mode,
        prompt,
        negative_prompt: negativePrompt,
        unet_name: unetName,
        clip_name: clipName,
        vae_name: vaeName,
        seed: parsedSeed,
        steps: parsedSteps,
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
  }, [mode, prompt, negativePrompt, unetName, clipName, vaeName, seed, steps, format, customWidth, customHeight, busy, refreshGallery]);

  const canGenerate = useMemo(() => mode === "text-to-image" && prompt.trim().length > 0 && !busy, [mode, prompt, busy]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-transparent lg:flex-row lg:overflow-hidden">
      <ControlPanel
        mode={mode}
        onModeChange={setMode}
        prompt={prompt}
        onPromptChange={setPrompt}
        negativePrompt={negativePrompt}
        onNegativePromptChange={setNegativePrompt}
        unetName={unetName}
        unetOptions={unetOptions}
        onUnetNameChange={setUnetName}
        clipName={clipName}
        clipOptions={clipOptions}
        onClipNameChange={setClipName}
        vaeName={vaeName}
        vaeOptions={vaeOptions}
        onVaeNameChange={setVaeName}
        seed={seed}
        onSeedChange={setSeed}
        steps={steps}
        onStepsChange={setSteps}
        customWidth={customWidth}
        onCustomWidthChange={setCustomWidth}
        customHeight={customHeight}
        onCustomHeightChange={setCustomHeight}
        format={format}
        onFormatChange={setFormat}
        references={references}
        onReferencesChange={setReferences}
        busy={busy}
        progress={progress}
        progressLabel={progressLabel}
        canGenerate={canGenerate}
        onGenerate={handleGenerate}
      />
      <CanvasPreview
        busy={busy}
        progress={progress}
        progressLabel={progressLabel}
        gallery={gallery}
        error={error ?? modelsError}
        outputWidth={outputDimensions.width}
        outputHeight={outputDimensions.height}
      />
    </div>
  );
}
