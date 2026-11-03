/**
 * Sampler & scheduler vocabularies for the local ComfyUI engine.
 *
 * Two disjoint enum families exist on the backend:
 * - Flat keys (63 entries) shared by `KSampler`, `KSamplerAdvanced` and
 *   `KSamplerSelect` — used by Text2Img, Img2Img, Video and Prime.
 * - Clownshar `family/name` keys (119 entries) exposed by
 *   `ClownsharKSampler_Beta` — used by the Edit pipeline.
 *
 * Values read back from PNG metadata can be manufactured composites
 * (e.g. `exponential/ddim_beta57`) that belong to neither family, so every
 * adoption site sanitises them against the active tab's list instead of
 * copying them verbatim.
 */

export interface SamplingOption {
  value: string;
  label: string;
}

/** Flat sampler enum shared by KSampler / KSamplerAdvanced / KSamplerSelect. */
export const COMFY_SAMPLER_KEYS: readonly SamplingOption[] = [
  { value: "euler", label: "Euler" },
  { value: "euler_ancestral", label: "Euler A (Ancestral)" },
  { value: "dpmpp_2m", label: "DPM++ 2M" },
  { value: "dpmpp_sde", label: "DPM++ SDE" },
  { value: "dpmpp_2m_sde", label: "DPM++ 2M SDE" },
  { value: "dpmpp_3m_sde", label: "DPM++ 3M SDE" },
  { value: "heun", label: "Heun" },
  { value: "ddim", label: "DDIM" },
  { value: "uni_pc", label: "UniPC" },
  { value: "lcm", label: "LCM" },
];

/** Scheduler enum, identical across every sampler-bearing node class. */
export const COMFY_SCHEDULER_KEYS: readonly SamplingOption[] = [
  { value: "normal", label: "Normal" },
  { value: "karras", label: "Karras" },
  { value: "exponential", label: "Exponential" },
  { value: "sgm_uniform", label: "SGM Uniform" },
  { value: "simple", label: "Simple" },
  { value: "ddim_uniform", label: "DDIM Uniform" },
  { value: "beta", label: "Beta" },
];

/**
 * Curated Clownshar `family/name` samplers, verified present in the live
 * `/object_info/ClownsharKSampler_Beta` enum. Do not extend by pattern —
 * the families are not uniform (e.g. `exponential/res_4s` does not exist).
 */
export const EDIT_SAMPLER_KEYS: readonly SamplingOption[] = [
  { value: "linear/euler", label: "Euler (linear)" },
  { value: "linear/midpoint_2s", label: "Midpoint 2S (linear)" },
  { value: "linear/heun_2s", label: "Heun 2S (linear)" },
  { value: "linear/rk4_4s", label: "RK4 4S (linear)" },
  { value: "multistep/dpmpp_2m", label: "DPM++ 2M (multistep)" },
  { value: "multistep/dpmpp_3m", label: "DPM++ 3M (multistep)" },
  { value: "multistep/res_2m", label: "RES 2M (multistep)" },
  { value: "exponential/ddim", label: "DDIM (exponential)" },
  { value: "exponential/dpmpp_2s", label: "DPM++ 2S (exponential)" },
  { value: "exponential/dpmpp_3s", label: "DPM++ 3S (exponential)" },
  { value: "exponential/res_2s", label: "RES 2S (exponential)" },
  { value: "exponential/res_3s", label: "RES 3S (exponential)" },
];

/** Edit schedulers. `beta57` is node 141's tuned default, so it leads. */
export const EDIT_SCHEDULER_KEYS: readonly SamplingOption[] = [
  { value: "beta57", label: "Beta 57" },
  { value: "normal", label: "Normal" },
  { value: "simple", label: "Simple" },
  { value: "karras", label: "Karras" },
  { value: "beta", label: "Beta" },
  { value: "exponential", label: "Exponential" },
  { value: "linear_quadratic", label: "Linear Quadratic" },
  { value: "sgm_uniform", label: "SGM Uniform" },
  { value: "ddim_uniform", label: "DDIM Uniform" },
];

/**
 * Return `value` only when it is a member of `allowed`; otherwise `null`.
 * Callers must choose their own fallback, which keeps vocabulary mistakes
 * visible instead of hiding them behind a default.
 */
export function sanitizeSampler(
  value: unknown,
  allowed: readonly { value: string }[]
): string | null {
  if (typeof value !== "string") return null;
  const match = allowed.find((option) => option.value === value);
  return match ? match.value : null;
}

/** Scheduler counterpart of {@link sanitizeSampler}. */
export function sanitizeScheduler(
  value: unknown,
  allowed: readonly { value: string }[]
): string | null {
  return sanitizeSampler(value, allowed);
}
