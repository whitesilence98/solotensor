/**
 * ComfyUI loader input name -> local model category.
 *
 * Keyed by *input name* because that is the API contract `build_graph` writes to;
 * class names vary across custom node packs. Slugs mirror
 * `LOCAL_MODEL_CATEGORIES` in `backend/app/services/models.py:57` and are the
 * values `api.listLocalModels(q, category)` accepts.
 */

export type ModelFileCategory =
  | "checkpoints"
  | "diffusion_models"
  | "loras"
  | "vae"
  | "text_encoders"
  | "controlnet"
  | "style_models";

const INPUT_CATEGORY: Record<string, ModelFileCategory> = {
  ckpt_name: "checkpoints",
  unet_name: "diffusion_models",
  lora_name: "loras",
  vae_name: "vae",
  clip_name: "text_encoders",
  clip_name1: "text_encoders",
  clip_name2: "text_encoders",
  clip_name3: "text_encoders",
  control_net_name: "controlnet",
  style_model_name: "style_models",
};

/**
 * Returns the model category for a loader input, or `null` when unmapped.
 * `classType` is accepted for future class-specific overrides; no input name
 * currently needs one, so it is unused on purpose (no guessing = no false pickers).
 */
export function modelCategoryForInput(
  inputName: string,
  classType?: string,
): ModelFileCategory | null {
  void classType;
  return INPUT_CATEGORY[inputName] ?? null;
}

/** Advisory vault identity recorded alongside the raw filename. */
export interface VaultMeta {
  sourceModelId: string;
  sourceVersionId: string;
  sourceFileId: string;
  sourceFilename: string;
}
