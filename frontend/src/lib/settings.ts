export const SETTINGS_KEY = "solotensor:settings:v1";

export const SETTING_FORMATS = ["1:1", "16:9", "9:16", "4:3", "3:2"] as const;

export interface StudioSettings {
  defaultFormat: (typeof SETTING_FORMATS)[number];
  defaultSteps: number;
  defaultImageCount: number;
  defaultSampler?: string;
  defaultScheduler?: string;
  defaultCfg?: number;
  defaultPrivacy?: boolean;
  soundChime?: boolean;
  streamPreviews?: boolean;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  defaultFormat: "9:16",
  defaultSteps: 10,
  defaultImageCount: 1,
  defaultSampler: "euler",
  defaultScheduler: "normal",
  defaultCfg: 7.0,
  defaultPrivacy: false,
  soundChime: true,
  streamPreviews: true,
};

function isFormat(value: unknown): value is StudioSettings["defaultFormat"] {
  return typeof value === "string" && SETTING_FORMATS.includes(value as StudioSettings["defaultFormat"]);
}

function normalizeSettings(value: unknown): StudioSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const record = value as Record<string, unknown>;
  const defaultSteps = typeof record.defaultSteps === "number" && Number.isInteger(record.defaultSteps)
    ? Math.min(100, Math.max(1, record.defaultSteps))
    : DEFAULT_SETTINGS.defaultSteps;
  const defaultImageCount = typeof record.defaultImageCount === "number" && Number.isInteger(record.defaultImageCount)
    ? Math.min(4, Math.max(1, record.defaultImageCount))
    : DEFAULT_SETTINGS.defaultImageCount;
  const defaultCfg = typeof record.defaultCfg === "number"
    ? Math.min(30, Math.max(1, record.defaultCfg))
    : DEFAULT_SETTINGS.defaultCfg;

  return {
    defaultFormat: isFormat(record.defaultFormat) ? record.defaultFormat : DEFAULT_SETTINGS.defaultFormat,
    defaultSteps,
    defaultImageCount,
    defaultSampler: typeof record.defaultSampler === "string" ? record.defaultSampler : DEFAULT_SETTINGS.defaultSampler,
    defaultScheduler: typeof record.defaultScheduler === "string" ? record.defaultScheduler : DEFAULT_SETTINGS.defaultScheduler,
    defaultCfg,
    defaultPrivacy: typeof record.defaultPrivacy === "boolean" ? record.defaultPrivacy : DEFAULT_SETTINGS.defaultPrivacy,
    soundChime: typeof record.soundChime === "boolean" ? record.soundChime : DEFAULT_SETTINGS.soundChime,
    streamPreviews: typeof record.streamPreviews === "boolean" ? record.streamPreviews : DEFAULT_SETTINGS.streamPreviews,
  };
}

export function loadSettings(): StudioSettings {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: StudioSettings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function resetSettings(): boolean {
  return saveSettings(DEFAULT_SETTINGS);
}
