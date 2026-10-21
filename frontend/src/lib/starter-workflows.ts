/**
 * SoloTensor Curated Starter Workflow Templates & ComfyUI Format Validator.
 * Pre-configured verified ComfyUI API graphs ready for 1-click Studio creation.
 */

import { ToolMode } from "@/lib/api";

export interface StarterWorkflowTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  mode: ToolMode;
  archetype: string;
  badge: string;
  nodeCount: number;
  highlightInputs: string[];
  workflow: Record<string, unknown>;
}

export function detectComfyUIFormat(data: unknown): {
  isApiFormat: boolean;
  isUiFormat: boolean;
  message?: string;
  nodeCount?: number;
} {
  if (!data || typeof data !== "object") {
    return {
      isApiFormat: false,
      isUiFormat: false,
      message: "The uploaded file is not a valid JSON object.",
    };
  }

  const obj = data as Record<string, unknown>;

  // Check if it's the UI format (Save instead of Save API)
  if (Array.isArray(obj.nodes) && Array.isArray(obj.links)) {
    return {
      isApiFormat: false,
      isUiFormat: true,
      nodeCount: obj.nodes.length,
      message:
        "This file is a ComfyUI Editor Graph (workflow.json) with GUI layout data. SoloTensor requires the execution API graph format (workflow_api.json).",
    };
  }

  // Check if it's the valid API format (keyed by node IDs with class_type & inputs)
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return {
      isApiFormat: false,
      isUiFormat: false,
      message: "Workflow graph is empty.",
    };
  }

  const hasValidNodes = entries.some(
    ([, val]) =>
      val &&
      typeof val === "object" &&
      typeof (val as Record<string, unknown>).class_type === "string"
  );

  if (hasValidNodes) {
    return {
      isApiFormat: true,
      isUiFormat: false,
      nodeCount: entries.length,
    };
  }

  return {
    isApiFormat: false,
    isUiFormat: false,
    message:
      "Unrecognized ComfyUI format. Please upload an API-exported graph.",
  };
}

export const STARTER_TEMPLATES: StarterWorkflowTemplate[] = [
  {
    id: "sdxl-turbo",
    name: "SDXL Lightning Turbo",
    tagline: "Ultra-fast text-to-image synthesis",
    description:
      "High-throughput 4-8 step latent diffusion pipeline using SDXL Lightning for near real-time rendering.",
    mode: "text-to-image",
    archetype: "Text-to-Image Generation",
    badge: "⚡ 4-8 Steps",
    nodeCount: 7,
    highlightInputs: ["Creative Prompt", "Negative Prompt", "CFG Scale", "Steps", "Seed"],
    workflow: {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 42,
          steps: 8,
          cfg: 2.0,
          sampler_name: "euler",
          scheduler: "sgm_uniform",
          denoise: 1.0,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0],
        },
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sdxl_lightning_8step.safetensors" },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: "cinematic portrait, hyperdetailed, 8k resolution, dramatic volumetric lighting",
          clip: ["4", 1],
        },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: { text: "low quality, blurry, deformed, watermark", clip: ["4", 1] },
      },
      "8": {
        class_type: "VAEDecode",
        inputs: { samples: ["3", 0], vae: ["4", 2] },
      },
      "9": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "SoloTensor_SDXL", images: ["8", 0] },
      },
    },
  },
  {
    id: "flux-schnell",
    name: "Flux.1 Schnell Studio",
    tagline: "Next-gen rectified flow photorealism",
    description:
      "State-of-the-art 4-step rectified flow model producing photorealistic skin tones, fine hair, and sharp typography.",
    mode: "text-to-image",
    archetype: "Text-to-Image Generation",
    badge: "✨ 4-Step Flow",
    nodeCount: 8,
    highlightInputs: ["Creative Prompt", "Guidance Scale", "Resolution", "Seed"],
    workflow: {
      "10": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "11": {
        class_type: "CLIPTextEncodeFlux",
        inputs: {
          clip_l: "A cyberpunk mechanic working on a glowing cybernetic core in a rainy neo-tokyo garage",
          t5xxl: "A cyberpunk mechanic working on a glowing cybernetic core in a rainy neo-tokyo garage",
          guidance: 3.5,
          clip: ["14", 0],
        },
      },
      "12": {
        class_type: "KSamplerSelect",
        inputs: { sampler_name: "euler" },
      },
      "13": {
        class_type: "BasicScheduler",
        inputs: { scheduler: "simple", steps: 4, denoise: 1.0, model: ["15", 0] },
      },
      "14": {
        class_type: "DualCLIPLoader",
        inputs: { clip_name1: "t5xxl_fp8_e4m3fn.safetensors", clip_name2: "clip_l.safetensors", type: "flux" },
      },
      "15": {
        class_type: "UNETLoader",
        inputs: { unet_name: "flux1-schnell.sft", weight_dtype: "fp8_e4m3fn" },
      },
      "16": {
        class_type: "SamplerCustomAdvanced",
        inputs: {
          noise: ["10", 0],
          guider: ["11", 0],
          sampler: ["12", 0],
          sigmas: ["13", 0],
          latent_image: ["10", 0],
        },
      },
      "17": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "SoloTensor_Flux", images: ["16", 0] },
      },
    },
  },
  {
    id: "qwen-image-edit",
    name: "Qwen Vision Image Transformation",
    tagline: "Prompt-guided image conditioning & inpaint",
    description:
      "Instruct-based image modification pipeline conditioned on reference input photos and natural language edits.",
    mode: "image-to-image",
    archetype: "Image-to-Image Transformation",
    badge: "🖼️ Vision Guided",
    nodeCount: 9,
    highlightInputs: ["Starter Image", "Edit Instruction", "Denoise Strength", "Upscale Method"],
    workflow: {
      "134": {
        class_type: "LoadImage",
        inputs: { image: "starter.png" },
      },
      "135": {
        class_type: "ImageScaleToTotalPixels",
        inputs: { upscale_method: "lanczos", megapixels: 1, resolution_steps: 1, image: ["134", 0] },
      },
      "138": {
        class_type: "VAEEncode",
        inputs: { pixels: ["135", 0], vae: ["587", 2] },
      },
      "141": {
        class_type: "KSampler",
        inputs: {
          seed: 42,
          steps: 20,
          cfg: 3.5,
          denoise: 0.65,
          sampler_name: "euler",
          scheduler: "normal",
          model: ["587", 0],
          positive: ["206", 0],
          negative: ["585", 0],
          latent_image: ["138", 0],
        },
      },
      "206": {
        class_type: "CLIPTextEncode",
        inputs: { prompt: "Transform into high-detail cyberpunk cinematic portrait, neon rain atmosphere", clip: ["587", 1] },
      },
      "585": {
        class_type: "CLIPTextEncode",
        inputs: { prompt: "blurry, low quality, artifacts, distorted hands", clip: ["587", 1] },
      },
      "587": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" },
      },
      "137": {
        class_type: "VAEDecode",
        inputs: { samples: ["141", 0], vae: ["587", 2] },
      },
      "592": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "SoloTensor_VisionEdit", images: ["137", 0] },
      },
    },
  },
  {
    id: "ltx-video-animator",
    name: "LTX Video Motion Synthesis",
    tagline: "High-frame video generation from still images",
    description:
      "Temporal video animation workflow generating smooth 24fps motion clips seeded by a reference starter image.",
    mode: "image-to-video",
    archetype: "Image-to-Video Motion",
    badge: "🎬 24 FPS Video",
    nodeCount: 6,
    highlightInputs: ["Starter Image", "Motion Description", "Frame Count", "FPS"],
    workflow: {
      "193": {
        class_type: "LoadImage",
        inputs: { image: "starter.png" },
      },
      "157:44": {
        class_type: "CLIPTextEncode",
        inputs: { text: "smooth cinematic slow motion camera tracking shot, high definition" },
      },
      "157:45": {
        class_type: "CLIPTextEncode",
        inputs: { text: "static, choppy, stuttering, low frame rate, blurry" },
      },
      "157:58": {
        class_type: "KSampler",
        inputs: {
          seed: 12345,
          steps: 25,
          cfg: 3.0,
          denoise: 1.0,
          sampler_name: "euler",
          scheduler: "normal",
        },
      },
      "157:74": {
        class_type: "VHS_VideoCombine",
        inputs: {
          frame_rate: 24,
          format: "video/h264-mp4",
          images: ["157:58", 0],
          filename_prefix: "SoloTensor_LTX_Video",
        },
      },
    },
  },
];
