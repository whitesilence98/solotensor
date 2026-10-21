export interface BaseArchitectureItem {
  label: string;
  value: string;
}

export interface BaseArchitectureGroup {
  label: string;
  options: BaseArchitectureItem[];
}

export type BaseArchitectureNode = BaseArchitectureItem | BaseArchitectureGroup;

export function isArchitectureGroup(
  node: BaseArchitectureNode,
): node is BaseArchitectureGroup {
  return "options" in node && Array.isArray((node as BaseArchitectureGroup).options);
}

export const BASE_MODEL_ARCHITECTURES: BaseArchitectureNode[] = [
  { label: "Allegro", value: "Allegro" },
  { label: "Anima", value: "Anima" },
  { label: "AuraFlow", value: "AuraFlow" },
  { label: "Bokeh Medium", value: "Bokeh Medium" },
  { label: "Boogu-Image", value: "Boogu-Image" },
  { label: "Chroma", value: "Chroma" },
  { label: "Chroma Radiance", value: "Chroma Radiance" },
  {
    label: "CogVideoX",
    options: [
      { label: "CogVideoX 5B", value: "CogVideoX 5B" },
      { label: "CogVideoX 2B", value: "CogVideoX 2B" },
      { label: "CogVideoX1.5 5B", value: "CogVideoX1.5 5B" },
      { label: "CogVideoX Fun 2B", value: "CogVideoX Fun 2B" },
      { label: "CogVideoX Fun 5B", value: "CogVideoX Fun 5B" },
    ],
  },
  {
    label: "Cosmos",
    options: [
      { label: "Cosmos-Predict2", value: "Cosmos-Predict2" },
      { label: "Cosmos-1.0-7B", value: "Cosmos-1.0-7B" },
      { label: "Cosmos-1.0-14B", value: "Cosmos-1.0-14B" },
    ],
  },
  { label: "CosXL", value: "CosXL" },
  { label: "ERNIE-IMAGE", value: "ERNIE-IMAGE" },
  { label: "ERNIE-IMAGE-TURBO", value: "ERNIE-IMAGE-TURBO" },
  { label: "FireRed-Image-Edit", value: "FireRed-Image-Edit" },
  {
    label: "FLUX",
    options: [
      { label: "FLUX.1 Kontext Dev", value: "FLUX.1 Kontext Dev" },
      { label: "FLUX.1 Krea Dev", value: "FLUX.1 Krea Dev" },
      { label: "FLUX.1", value: "FLUX.1" },
      { label: "FLUX.1 Schnell", value: "FLUX.1 Schnell" },
      { label: "FLUX.1 De-Distill", value: "FLUX.1 De-Distill" },
      { label: "FLUX.2 Dev", value: "FLUX.2 Dev" },
      { label: "FLUX.2 Klein 4B Base", value: "FLUX.2 Klein 4B Base" },
      { label: "FLUX.2 Klein 4B Distilled", value: "FLUX.2 Klein 4B Distilled" },
      { label: "FLUX.2 Klein 9B Base", value: "FLUX.2 Klein 9B Base" },
      { label: "FLUX.2 Klein 9B Distilled", value: "FLUX.2 Klein 9B Distilled" },
      { label: "FLUX 3 Image Klein Distilled", value: "FLUX 3 Image Klein Distilled" },
      { label: "FLUX 3 Image Klein Base", value: "FLUX 3 Image Klein Base" },
    ],
  },
  {
    label: "HiDream",
    options: [
      { label: "HiDream-l1", value: "HiDream-l1" },
      { label: "HiDream-e1", value: "HiDream-e1" },
    ],
  },
  {
    label: "HunyuanDiT",
    options: [
      { label: "HunYuanDiT", value: "HunYuanDiT" },
      { label: "HunYuanDiT-v1.2", value: "HunYuanDiT-v1.2" },
      { label: "HunYuanDiT ComfyUI", value: "HunYuanDiT ComfyUI" },
    ],
  },
  { label: "HunyuanImage-2.1", value: "HunyuanImage-2.1" },
  {
    label: "HunyuanVideo",
    options: [
      { label: "HunyuanVideo", value: "HunyuanVideo" },
      { label: "HunyuanVideo Fast", value: "HunyuanVideo Fast" },
      { label: "HunyuanVideo 1.5 480P", value: "HunyuanVideo 1.5 480P" },
      { label: "HunyuanVideo 1.5 720P", value: "HunyuanVideo 1.5 720P" },
    ],
  },
  { label: "Illustrious", value: "Illustrious" },
  { label: "InfiniteTalk Multi", value: "InfiniteTalk Multi" },
  { label: "InfiniteTalk Single", value: "InfiniteTalk Single" },
  { label: "Janus Pro", value: "Janus Pro" },
  { label: "Kolors", value: "Kolors" },
  { label: "Krea-2", value: "Krea-2" },
  { label: "LatentSync", value: "LatentSync" },
  {
    label: "LTX",
    options: [
      { label: "LTX Video", value: "LTX Video" },
      { label: "LTX-Video 0.9.5", value: "LTX-Video 0.9.5" },
      { label: "LTX-Video 0.9.1", value: "LTX-Video 0.9.1" },
      { label: "LTX-2", value: "LTX-2" },
      { label: "LTX-2.3", value: "LTX-2.3" },
    ],
  },
  { label: "Lumina", value: "Lumina" },
  { label: "Mochi", value: "Mochi" },
  { label: "OmniGen", value: "OmniGen" },
  { label: "Open-Sora", value: "Open-Sora" },
  {
    label: "Other",
    options: [
      { label: "Other / Custom", value: "Other / Custom" },
      { label: "ConsisID", value: "ConsisID" },
      { label: "DiT", value: "DiT" },
      { label: "Film-Grain", value: "Film-Grain" },
      { label: "FlashFace", value: "FlashFace" },
      { label: "Hyper-SD", value: "Hyper-SD" },
      { label: "InstantX", value: "InstantX" },
      { label: "LCM", value: "LCM" },
      { label: "Lightx2v", value: "Lightx2v" },
      { label: "LivePortrait", value: "LivePortrait" },
      { label: "MMAudio", value: "MMAudio" },
      { label: "MoE", value: "MoE" },
      { label: "PuLID", value: "PuLID" },
      { label: "StoryDiffusion", value: "StoryDiffusion" },
      { label: "X-Adapter", value: "X-Adapter" },
    ],
  },
  { label: "PixArt a", value: "PixArt a" },
  { label: "PixArt E", value: "PixArt E" },
  {
    label: "Pony",
    options: [
      { label: "Pony", value: "Pony" },
      { label: "Pony V6", value: "Pony V6" },
      { label: "Pony V7", value: "Pony V7" },
    ],
  },
  {
    label: "Qwen",
    options: [
      { label: "Qwen", value: "Qwen" },
      { label: "Qwen-VL", value: "Qwen-VL" },
      { label: "Qwen-Image", value: "Qwen-Image" },
      { label: "Qwen2.5-VL", value: "Qwen2.5-VL" },
      { label: "Qwen-Image-Edit", value: "Qwen-Image-Edit" },
      { label: "Qwen-Image-Edit-2509", value: "Qwen-Image-Edit-2509" },
      { label: "Qwen-Image-Edit-2511", value: "Qwen-Image-Edit-2511" },
      { label: "Qwen-Image-Edit-Rapid-A1", value: "Qwen-Image-Edit-Rapid-A1" },
      { label: "Qwen-Image-Layered", value: "Qwen-Image-Layered" },
    ],
  },
  {
    label: "SD 1.x",
    options: [
      { label: "SD 1.4", value: "SD 1.4" },
      { label: "SD 1.5", value: "SD 1.5" },
      { label: "SD 1.5 LCM", value: "SD 1.5 LCM" },
      { label: "SD 1.5 Hyper", value: "SD 1.5 Hyper" },
    ],
  },
  {
    label: "SD 2.x",
    options: [
      { label: "SD 2.0", value: "SD 2.0" },
      { label: "SD 2.1", value: "SD 2.1" },
      { label: "SD 2.1 768", value: "SD 2.1 768" },
      { label: "SD 2.1 Unclip", value: "SD 2.1 Unclip" },
    ],
  },
  {
    label: "SD 3.x",
    options: [
      { label: "SD 3.0", value: "SD 3.0" },
      { label: "SD 3.5 Large", value: "SD 3.5 Large" },
      { label: "SD 3.5 Medium", value: "SD 3.5 Medium" },
    ],
  },
  {
    label: "SDXL",
    options: [
      { label: "SDXL 1.0", value: "SDXL 1.0" },
      { label: "SDXL Refiner", value: "SDXL Refiner" },
      { label: "SDXL Turbo", value: "SDXL Turbo" },
      { label: "SDXL Lightning", value: "SDXL Lightning" },
      { label: "SDXL Hyper", value: "SDXL Hyper" },
    ],
  },
  { label: "SVD", value: "SVD" },
  { label: "SVD XT", value: "SVD XT" },
  {
    label: "StepVideo",
    options: [
      { label: "StepVideo", value: "StepVideo" },
      { label: "StepVideo-T2V", value: "StepVideo-T2V" },
    ],
  },
  {
    label: "Vchitect",
    options: [
      { label: "Vchitect", value: "Vchitect" },
      { label: "Vchitect-2.0", value: "Vchitect-2.0" },
    ],
  },
  {
    label: "Wan",
    options: [
      { label: "WAN_2_6", value: "WAN_2_6" },
      { label: "Wan2.1", value: "Wan2.1" },
      { label: "Wan2.1 1.3B", value: "Wan2.1 1.3B" },
      { label: "Wan2.1 14B", value: "Wan2.1 14B" },
      { label: "Wan2.2 5B", value: "Wan2.2 5B" },
      { label: "Wan2.2 A14B Low Noise", value: "Wan2.2 A14B Low Noise" },
      { label: "Wan2.2 A14B High Noise", value: "Wan2.2 A14B High Noise" },
      { label: "Wan2.2 S2V 14B", value: "Wan2.2 S2V 14B" },
      { label: "Wan2.2-Animate-14B", value: "Wan2.2-Animate-14B" },
    ],
  },
  {
    label: "Z-Image",
    options: [
      { label: "Z-Image", value: "Z-Image" },
      { label: "Z-Image-Turbo", value: "Z-Image-Turbo" },
      { label: "Z-Image-Omni", value: "Z-Image-Omni" },
    ],
  },
  { label: "Universal", value: "Universal" },
];

/**
 * Returns the value of the first option on the list.
 */
export function getFirstOptionValue(options: BaseArchitectureNode[] = BASE_MODEL_ARCHITECTURES): string {
  if (!options || options.length === 0) return "";
  const first = options[0];
  if (isArchitectureGroup(first)) {
    return first.options[0]?.value || "";
  }
  return first.value || "";
}

/**
 * Checks whether a given value exists in the architecture options list.
 */
export function isArchitectureInList(value: string, options: BaseArchitectureNode[] = BASE_MODEL_ARCHITECTURES): boolean {
  if (!value) return false;
  for (const node of options) {
    if (isArchitectureGroup(node)) {
      if (node.options.some((opt) => opt.value === value)) return true;
    } else if (node.value === value) {
      return true;
    }
  }
  return false;
}

/**
 * Helper to find the display label of a selected architecture value
 */
export function getArchitectureLabel(value: string): string {
  if (!value) return "";
  for (const item of BASE_MODEL_ARCHITECTURES) {
    if (isArchitectureGroup(item)) {
      const found = item.options.find((opt) => opt.value === value);
      if (found) return `${item.label} / ${found.label}`;
    } else if (item.value === value) {
      return item.label;
    }
  }
  return value;
}

export function getArchitectureDisplay(value: string): { label: string; group?: string } {
  if (!value) return { label: "" };
  for (const item of BASE_MODEL_ARCHITECTURES) {
    if (isArchitectureGroup(item)) {
      const found = item.options.find((opt) => opt.value === value);
      if (found) return { label: found.label, group: item.label };
    } else if (item.value === value) {
      return { label: item.label };
    }
  }
  return { label: value };
}
