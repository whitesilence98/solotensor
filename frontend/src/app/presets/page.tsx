"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Plus, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import WorkspaceNavbar from "@/components/WorkspaceNavbar";
import { ProtectedRoute } from "@/components/rbac";
import {
  api,
  type GenerationMode,
  type GenerationPreset,
  type GenerationPresetPayload,
  type InstalledGalleryModel,
} from "@/lib/api";
import { buildPresetHref } from "@/lib/generateDeepLink";
import { useAuth } from "@/lib/auth-context";

const MODES: { value: GenerationMode; label: string }[] = [
  { value: "text-to-image", label: "Text to Image" },
  { value: "image-to-image", label: "Image to Image" },
  { value: "detailer", label: "Detailer" },
  { value: "upscale", label: "Upscale" },
  { value: "edit", label: "Edit" },
  { value: "video", label: "Video" },
];

const FORMATS: NonNullable<GenerationPresetPayload["format"]>[] = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:2",
];

const DURATIONS: NonNullable<GenerationPresetPayload["duration"]>[] = [3, 5, 10, 15];
const FPS: NonNullable<GenerationPresetPayload["fps"]>[] = [16, 24, 30, 49];

const VIDEO_MODES: NonNullable<GenerationPresetPayload["video_mode"]>[] = [
  "text-to-video",
  "image-to-video",
];

const MAX_SEED = 2 ** 32 - 1;

interface Draft {
  name: string;
  mode: GenerationMode;
  videoMode: GenerationPresetPayload["video_mode"];
  prompt: string;
  negativePrompt: string;
  seed: string;
  format: NonNullable<GenerationPresetPayload["format"]>;
  duration: NonNullable<GenerationPresetPayload["duration"]>;
  fps: NonNullable<GenerationPresetPayload["fps"]>;
  modelKey: string;
}

function emptyDraft(): Draft {
  return {
    name: "",
    mode: "text-to-image",
    videoMode: null,
    prompt: "",
    negativePrompt: "",
    seed: "",
    format: "1:1",
    duration: 5,
    fps: 24,
    modelKey: "",
  };
}

function toDraft(preset: GenerationPreset): Draft {
  const payload = preset.payload;
  if (!payload) return { ...emptyDraft(), name: preset.name };
  return {
    name: preset.name,
    mode: payload.mode,
    videoMode: payload.video_mode ?? null,
    prompt: payload.prompt ?? "",
    negativePrompt: payload.negative_prompt ?? "",
    seed: payload.seed === null || payload.seed === undefined ? "" : String(payload.seed),
    format: payload.format ?? "1:1",
    duration: payload.duration ?? 5,
    fps: payload.fps ?? 24,
    modelKey: payload.model_id && payload.version_id && payload.file_id
      ? `${payload.model_id}|${payload.version_id}|${payload.file_id}`
      : "",
  };
}

/** Null/blank fields are omitted so the deep link leaves the tab untouched.
 *  The negative prompt is always emitted (empty included) so a saved blank
 *  negative deliberately clears the generator's previous one. */
function toPayload(
  draft: Draft,
  modelIds: ModelIds
): GenerationPresetPayload {
  const seedRaw = draft.seed.trim();
  let seed: number | null = null;
  if (/^\d+$/.test(seedRaw)) {
    const parsed = Number(seedRaw);
    if (Number.isSafeInteger(parsed) && parsed <= MAX_SEED) seed = parsed;
  }
  return {
    mode: draft.mode,
    video_mode: draft.mode === "video" ? draft.videoMode : null,
    prompt: draft.prompt.trim() ? draft.prompt : null,
    negative_prompt: draft.negativePrompt,
    seed,
    format: draft.format,
    duration: draft.mode === "video" ? draft.duration : null,
    fps: draft.mode === "video" ? draft.fps : null,
    model_id: modelIds.model_id,
    version_id: modelIds.version_id,
    file_id: modelIds.file_id,
    base_model_id: modelIds.base_model_id,
    base_file_id: modelIds.base_file_id,
  };
}

interface ModelIds {
  model_id: string | null;
  version_id: string | null;
  file_id: string | null;
  base_model_id: string | null;
  base_file_id: string | null;
}

const NO_MODEL: ModelIds = {
  model_id: null,
  version_id: null,
  file_id: null,
  base_model_id: null,
  base_file_id: null,
};

function modelIdsFrom(payload: GenerationPresetPayload | null): ModelIds {
  if (!payload) return NO_MODEL;
  return {
    model_id: payload.model_id ?? null,
    version_id: payload.version_id ?? null,
    file_id: payload.file_id ?? null,
    base_model_id: payload.base_model_id ?? null,
    base_file_id: payload.base_file_id ?? null,
  };
}

function modelKeyOf(ids: ModelIds): string {
  return ids.model_id && ids.version_id && ids.file_id
    ? `${ids.model_id}|${ids.version_id}|${ids.file_id}`
    : "";
}

/** Resolves the chosen model key, or returns null when the key is not a real
 *  installed model and does not match the preset's original identity. */
function resolveModelIds(
  modelKey: string,
  models: InstalledGalleryModel[],
  original: ModelIds
): ModelIds | null {
  if (!modelKey) return NO_MODEL;
  const found = models.find(
    (m) => `${m.model_id}|${m.version_id}|${m.file_id}` === modelKey
  );
  if (found) {
    return {
      model_id: found.model_id,
      version_id: found.version_id,
      file_id: found.file_id,
      base_model_id: found.base_model_id ?? null,
      base_file_id: found.base_file_id ?? null,
    };
  }
  // The catalog may be unavailable or the model uninstalled. Keep the stored
  // identity only when the user did not change the selection.
  return modelKeyOf(original) === modelKey ? original : null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const fieldLabel = "block text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)] font-mono";
const fieldClass =
  "mt-1.5 w-full rounded-lg border border-[var(--line-strong)]/40 bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30";

export default function PresetsPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [presets, setPresets] = useState<GenerationPreset[]>([]);
  // Installed models are public catalog data, not account-owned: load once.
  const [models, setModels] = useState<InstalledGalleryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [originalModel, setOriginalModel] = useState<ModelIds>(NO_MODEL);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState("Configured");
  const identityToken = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void api
      .listSelectableModels()
      .then((items) => {
        if (!cancelled) setModels(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    const token = identityToken.current;
    setLoading(true);
    setError(null);
    try {
      const items = await api.getPresets();
      if (identityToken.current === token) setPresets(items);
    } catch (err) {
      if (identityToken.current === token) {
        setError(errorMessage(err, "Could not load presets."));
      }
    } finally {
      if (identityToken.current === token) setLoading(false);
    }
  }, [isAuthenticated]);

  // Bind to the signed-in identity: no unauthenticated fetch, and signing in
  // from the route gate reloads. An account switch drops every prior surface.
  useEffect(() => {
    identityToken.current += 1;
    setPresets([]);
    setEditingId(null);
    setDraft(emptyDraft());
    setOriginalModel(NO_MODEL);
    setFormError(null);
    setError(null);
    setSaving(false);
    setLoading(Boolean(isAuthenticated));
    void load();
  }, [user?.id, isAuthenticated, load]);

  const startCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setOriginalModel(NO_MODEL);
    setFormError(null);
  };

  const startEdit = (preset: GenerationPreset) => {
    setEditingId(preset.id);
    setDraft(toDraft(preset));
    setOriginalModel(modelIdsFrom(preset.payload));
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setFormError("Give the preset a name.");
      return;
    }
    // A non-blank but unparseable seed must be rejected, not silently dropped.
    const seedRaw = draft.seed.trim();
    if (seedRaw) {
      const seed = Number(seedRaw);
      if (!/^\d+$/.test(seedRaw) || !Number.isSafeInteger(seed) || seed > MAX_SEED) {
        setFormError(`Seed must be a whole number from 0 to ${MAX_SEED}, or blank.`);
        return;
      }
    }
    const ids = resolveModelIds(draft.modelKey, models, originalModel);
    if (ids === null) {
      setFormError(
        "The selected model is no longer in the installed catalog. Re-select a model or clear it."
      );
      return;
    }
    const token = identityToken.current;
    setSaving(true);
    setFormError(null);
    try {
      const payload = toPayload(draft, ids);
      if (editingId) {
        const updated = await api.updatePreset(editingId, { name, payload });
        if (identityToken.current !== token) return;
        setPresets((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setStatus("Preset saved");
      } else {
        const created = await api.createPreset({ name, payload });
        if (identityToken.current !== token) return;
        setPresets((prev) => [created, ...prev]);
        setStatus("Preset created");
      }
      setEditingId(null);
      setDraft(emptyDraft());
      setOriginalModel(NO_MODEL);
    } catch (err) {
      if (identityToken.current !== token) return;
      setFormError(errorMessage(err, "Could not save the preset."));
    } finally {
      if (identityToken.current === token) setSaving(false);
    }
  };

  const remove = async (preset: GenerationPreset) => {
    if (!window.confirm(`Delete the preset "${preset.name}"?`)) return;
    const token = identityToken.current;
    try {
      await api.deletePreset(preset.id);
      if (identityToken.current !== token) return;
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
      if (editingId === preset.id) startCreate();
      setStatus("Preset deleted");
    } catch (err) {
      if (identityToken.current !== token) return;
      setFormError(errorMessage(err, "Could not delete the preset."));
    }
  };

  const usePreset = (preset: GenerationPreset) => {
    if (!preset.payload) return;
    router.push(buildPresetHref(preset.payload));
  };

  const modelOptions = useMemo(() => {
    const options = models.map((model) => ({
      key: `${model.model_id}|${model.version_id}|${model.file_id}`,
      label: `${model.title} — ${model.version_name || model.filename}`,
    }));
    // Keep a stored model visible when the catalog cannot resolve it, instead of
    // rendering an unmatched select value (which would look like "no model").
    const originalKey = modelKeyOf(originalModel);
    if (originalKey && !options.some((option) => option.key === originalKey)) {
      options.push({ key: originalKey, label: "Stored model (not in the installed catalog)" });
    }
    return options;
  }, [models, originalModel]);

  return (
    <ProtectedRoute
      requireAuth={true}
      title="Presets"
      description="Sign in to save and reuse generation presets."
    >
      <main id="main-content" className="flex min-h-full w-full flex-1 flex-col bg-[var(--ground)] antialiased">
        <WorkspaceNavbar
          subtitle="GENERATION PRESETS"
          href="/presets"
          maxWidth="max-w-5xl"
          statusText={status}
          actions={
            <Link
              href="/generate"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[11px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Open Studio
            </Link>
          }
        />

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
          <header className="border-b border-[var(--line)] pb-5">
            <h1 className="workspace-title">Generation Presets</h1>
            <p className="workspace-copy mt-2">
              Save a named set of generation parameters and open it in the studio with one click.
              A preset only carries what a studio deep link can apply — prompts, seed, format,
              video duration/fps, and an optional installed model. It is not a snapshot of every
              generator setting, and it never renders on its own.
            </p>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
            {/* List */}
            <section className="workspace-bezel p-5 md:p-6" aria-label="Saved presets">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <h2 className="text-sm font-semibold text-[var(--ink)]">Saved presets</h2>
                <button
                  type="button"
                  onClick={startCreate}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 font-mono text-[11px] font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New preset
                </button>
              </div>

              {loading ? (
                <p className="py-8 text-center font-mono text-xs text-[var(--ink-faint)]">Loading presets…</p>
              ) : error ? (
                <div className="py-8 text-center" role="alert">
                  <p className="text-xs font-medium text-[var(--danger)]">{error}</p>
                  <button type="button" onClick={() => void load()} className="workspace-action-secondary mt-3 px-3 py-1.5 text-xs">
                    Try again
                  </button>
                </div>
              ) : presets.length === 0 ? (
                <div className="py-10 text-center">
                  <Wand2 className="mx-auto h-8 w-8 text-[var(--ink-faint)]" />
                  <p className="mt-2 text-xs font-semibold text-[var(--ink)]">No presets yet</p>
                  <p className="text-[11px] text-[var(--ink-faint)]">Create one from the form to reuse a known-good setup.</p>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--line)]">
                  {presets.map((preset) => {
                    const usable = Boolean(preset.payload);
                    return (
                      <li key={preset.id} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)]">{preset.name}</p>
                            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                              {preset.payload ? preset.payload.mode : "unreadable payload"}
                              {preset.payload?.format ? ` · ${preset.payload.format}` : ""}
                              {preset.payload?.duration ? ` · ${preset.payload.duration}s` : ""}
                              {preset.payload?.fps ? ` · ${preset.payload.fps}fps` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => usePreset(preset)}
                              disabled={!usable}
                              title={usable ? "Open in the studio" : "Preset payload is unreadable; edit or delete it"}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 font-mono text-[11px] font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Use preset
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit preset ${preset.name}`}
                              onClick={() => startEdit(preset)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-faint)] hover:text-[var(--accent)]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete preset ${preset.name}`}
                              onClick={() => void remove(preset)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-faint)] hover:text-[var(--danger)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {!usable && (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {preset.warning || "This preset's stored payload could not be read. Edit it to repair, or delete it."}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Editor */}
            <section className="workspace-bezel p-5 md:p-6" aria-label="Preset editor">
              <h2 className="text-sm font-semibold text-[var(--ink)]">
                {editingId ? "Edit preset" : "New preset"}
              </h2>
              <form onSubmit={submit} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="preset-name" className={fieldLabel}>
                    Name
                  </label>
                  <input
                    id="preset-name"
                    type="text"
                    required
                    maxLength={80}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Neon portrait · 16:9"
                    className={fieldClass}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="preset-mode" className={fieldLabel}>
                      Mode
                    </label>
                    <select
                      id="preset-mode"
                      value={draft.mode}
                      onChange={(e) => setDraft({ ...draft, mode: e.target.value as GenerationMode })}
                      className={fieldClass}
                    >
                      {MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="preset-format" className={fieldLabel}>
                      Format
                    </label>
                    <select
                      id="preset-format"
                      value={draft.format}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          format: e.target.value as NonNullable<GenerationPresetPayload["format"]>,
                        })
                      }
                      className={fieldClass}
                    >
                      {FORMATS.map((format) => (
                        <option key={format} value={format}>
                          {format}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="preset-prompt" className={fieldLabel}>
                    Prompt
                  </label>
                  <textarea
                    id="preset-prompt"
                    rows={3}
                    maxLength={50_000}
                    value={draft.prompt}
                    onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                    placeholder="Subject, lighting, style…"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="preset-negative" className={fieldLabel}>
                    Negative prompt
                  </label>
                  <textarea
                    id="preset-negative"
                    rows={2}
                    maxLength={50_000}
                    value={draft.negativePrompt}
                    onChange={(e) => setDraft({ ...draft, negativePrompt: e.target.value })}
                    placeholder="What to avoid…"
                    className={fieldClass}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="preset-seed" className={fieldLabel}>
                      Seed (optional)
                    </label>
                    <input
                      id="preset-seed"
                      type="text"
                      inputMode="numeric"
                      value={draft.seed}
                      onChange={(e) => setDraft({ ...draft, seed: e.target.value })}
                      placeholder="Blank = leave the draft's seed"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="preset-model" className={fieldLabel}>
                      Model (optional)
                    </label>
                    <select
                      id="preset-model"
                      value={draft.modelKey}
                      onChange={(e) => setDraft({ ...draft, modelKey: e.target.value })}
                      className={fieldClass}
                    >
                      <option value="">Leave the draft's model</option>
                      {modelOptions.map((model) => (
                        <option key={model.key} value={model.key}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {draft.mode === "video" && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label htmlFor="preset-video-mode" className={fieldLabel}>
                        Sub-mode
                      </label>
                      <select
                        id="preset-video-mode"
                        value={draft.videoMode ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            videoMode: (e.target.value || null) as Draft["videoMode"],
                          })
                        }
                        className={fieldClass}
                      >
                        <option value="">Keep the draft's sub-mode</option>
                        {VIDEO_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode === "text-to-video" ? "Text to Video" : "Image to Video"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="preset-duration" className={fieldLabel}>
                        Duration
                      </label>
                      <select
                        id="preset-duration"
                        value={draft.duration}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            duration: Number(e.target.value) as Draft["duration"],
                          })
                        }
                        className={fieldClass}
                      >
                        {DURATIONS.map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {seconds}s
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="preset-fps" className={fieldLabel}>
                        FPS
                      </label>
                      <select
                        id="preset-fps"
                        value={draft.fps}
                        onChange={(e) =>
                          setDraft({ ...draft, fps: Number(e.target.value) as Draft["fps"] })
                        }
                        className={fieldClass}
                      >
                        {FPS.map((fps) => (
                          <option key={fps} value={fps}>
                            {fps} fps
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {formError && (
                  <p className="text-[11px] font-medium text-[var(--danger)]" role="alert">
                    {formError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
                  {editingId && (
                    <button
                      type="button"
                      onClick={startCreate}
                      className="rounded-md px-3 py-1.5 font-mono text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-[11px] font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {editingId ? "Save changes" : "Create preset"}
                  </button>
                </div>
              </form>

              <p className="mt-4 text-[11px] leading-5 text-[var(--ink-faint)]">
                Steps, CFG, sampler and scheduler are not part of a deep link, so they are not
                stored here. A preset never starts a render by itself.
              </p>
            </section>
          </div>
        </div>

        <WorkspaceFooter containerClassName="max-w-5xl" />
      </main>
    </ProtectedRoute>
  );
}
