"use client";

import { ChangeEvent, DragEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type CreatorModel,
  type CreatorModelCompatibility,
  type CreatorModelFile,
  type CreatorModelGeneration,
  type CreatorModelPermissions,
  type CreatorModelSample,
  type CreatorModelVersion,
  type CreatorModelPayload,
  type CreatorModelCategory,
  type CreatorModelType,
  type ModelPrecision,
  type ModelVisibility,
  type LocalModelSummary,
  type InstalledGalleryModel,
} from "@/lib/api";
import {
  Archive, Check, ChevronDown, CircleHelp, CloudUpload, Copy, Eye, FileArchive,
  FileCode2, FileImage, GripVertical, ImagePlus, Info, Layers3, MoreHorizontal,
  Plus, Save, Search, Settings2, ShieldCheck, Sparkles, Tag, Trash2, UploadCloud, X,
} from "lucide-react";

type TabId = "identity" | "generation" | "files" | "samples" | "access";

const tabs: { id: TabId; label: string; hint: string }[] = [
  { id: "identity", label: "Identity", hint: "Branding and compatibility" },
  { id: "generation", label: "Generation", hint: "Triggers and defaults" },
  { id: "files", label: "Model files", hint: "Versions and downloads" },
  { id: "samples", label: "Showcase", hint: "Samples and PNG info" },
  { id: "access", label: "Access", hint: "Rights and visibility" },
];

const baseModels = [
  "FLUX.1", "Stable Diffusion XL (SDXL)", "Stable Diffusion 1.5 (SD 1.5)", "Stable Diffusion 3.5",
  "Pony Diffusion V6 XL", "Illustrious XL", "KREA_2", "Wan 2.1 / Wan 2.8", "Z-Image / Z-Image-Turbo",
  "Qwen-Image-2.1", "Hunyuan-DiT", "CogVideoX", "Anima", "Realistic Vision",
];

const inputClass = "workspace-field h-10 w-full px-3 text-sm outline-none";
const selectClass = `${inputClass} appearance-none pr-8`;
const labelClass = "mb-2 block text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--ink-soft)]";

function SectionHeading({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Info }) {
  return <div className="mb-5 flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]"><Icon className="h-4 w-4" strokeWidth={1.8} /></div><div><h2 className="text-[15px] font-semibold tracking-[-.02em] text-[var(--ink)]">{title}</h2><p className="mt-1 text-xs leading-5 text-[var(--ink-faint)]">{description}</p></div></div>;
}

function Field({ label, children, helper }: { label: string; children: React.ReactNode; helper?: string }) {
  return <label className="block space-y-2"><span className={labelClass}>{label}</span>{children}{helper && <span className="block text-[11px] leading-4 text-[var(--ink-faint)]">{helper}</span>}</label>;
}

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--accent-ink)] transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} /></button>;
}

function TagEditor({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const value = draft.trim(); if (value && !tags.includes(value)) onChange([...tags, value]); setDraft(""); };
  return <div className="workspace-field flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1.5">{tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)]/10 px-2 py-1 text-xs font-medium text-[var(--accent)]">{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(tags.filter((item) => item !== tag))}><X className="h-3 w-3" /></button></span>)}<input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } }} onBlur={add} placeholder={tags.length ? "Add another" : placeholder} className="min-w-[9rem] flex-1 bg-transparent px-1 py-1 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]" /></div>;
}

function MediaDropzone({ accept, label, onFiles, disabled = false }: { accept: string; label: string; onFiles: (files: File[]) => void; disabled?: boolean }) {
  const [dragging, setDragging] = useState(false);
  const drop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(false); if (!disabled) onFiles(Array.from(event.dataTransfer.files)); };
  const input = (event: ChangeEvent<HTMLInputElement>) => { if (!disabled) onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; };
  return <label onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center transition ${dragging ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line-strong)] bg-[var(--surface-sunken)]/40 hover:border-[var(--accent)]"} ${disabled ? "pointer-events-none opacity-50" : ""}`}><input type="file" accept={accept} multiple className="sr-only" onChange={input} /><span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent)]"><UploadCloud className="h-5 w-5" /></span><span className="text-sm font-medium text-[var(--ink)]">{label}</span><span className="mt-1 text-xs text-[var(--ink-faint)]">Choose files or drop them here</span></label>;
}

function ConfirmationDialog({ title, item, onCancel, onConfirm, cancelRef }: { title: string; item: string; onCancel: () => void; onConfirm: () => void; cancelRef: React.RefObject<HTMLButtonElement | null> }) {
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><div role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" onKeyDown={trapFocus} className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-5 shadow-2xl"><h2 id="confirmation-title" className="text-base font-semibold text-[var(--ink)]">{title}</h2><p id="confirmation-description" className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">This action affects <span className="font-medium text-[var(--ink)]">{item}</span>.</p><div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" onClick={onCancel} className="workspace-action-secondary h-9 px-3 text-xs">Cancel</button><button type="button" onClick={onConfirm} className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--danger)] px-3 text-xs font-bold text-[var(--ground)]">{title}</button></div></div></div>;
}

function CompatibilityFields({ compatibility, setCompatibility, disabled, modelType }: { compatibility: CreatorModelCompatibility; setCompatibility: (value: CreatorModelCompatibility) => void; disabled: boolean; modelType: CreatorModelType }) {
  const [vaeFiles, setVaeFiles] = useState<string[]>([]);
  const [encoderFiles, setEncoderFiles] = useState<string[]>([]);
  const [clipTypes, setClipTypes] = useState<string[]>([]);
  const [baseOptions, setBaseOptions] = useState<InstalledGalleryModel[]>([]);
  const [vaeLoading, setVaeLoading] = useState(true);
  const [encoderLoading, setEncoderLoading] = useState(true);
  const [clipTypesLoading, setClipTypesLoading] = useState(true);
  const [vaeError, setVaeError] = useState<string | null>(null);
  const [encoderError, setEncoderError] = useState<string | null>(null);
  const [clipTypesError, setClipTypesError] = useState<string | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const isAdapter = modelType === "LoRA" || modelType === "LyCORIS";

  const loadFiles = (category: "vae" | "text_encoders") => {
    const setLoading = category === "vae" ? setVaeLoading : setEncoderLoading;
    const setError = category === "vae" ? setVaeError : setEncoderError;
    setLoading(true); setError(null);
    void api.listLocalModels("", category).then((response) => {
      const filenames = response.items.map((item) => item.filename);
      if (category === "vae") setVaeFiles(filenames); else setEncoderFiles(filenames);
    }).catch((error: unknown) => setError(error instanceof Error ? error.message : `Could not load ${category}`)).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFiles("vae"); loadFiles("text_encoders");
    void api.getClipOptions().then((options) => setClipTypes(options.types)).catch((error: unknown) => setClipTypesError(error instanceof Error ? error.message : "Could not load CLIP types")).finally(() => setClipTypesLoading(false));
    void api.listSelectableModels().then((items) => setBaseOptions(items.filter((item) => item.model_type === "Checkpoint" || item.model_type === "Diffusion Model"))).catch((error: unknown) => setBaseError(error instanceof Error ? error.message : "Could not load installed base models"));
  }, []);

  const vaeOptions = compatibility.vae && !vaeFiles.includes(compatibility.vae) ? [compatibility.vae, ...vaeFiles] : vaeFiles;
  const encoderOptions = compatibility.text_encoder && !encoderFiles.includes(compatibility.text_encoder) ? [compatibility.text_encoder, ...encoderFiles] : encoderFiles;
  const typeOptions = compatibility.clip_type && !clipTypes.includes(compatibility.clip_type) ? [compatibility.clip_type, ...clipTypes] : clipTypes;
  const baseKey = compatibility.base_model_id && compatibility.base_version_id && compatibility.base_file_id ? `${compatibility.base_model_id}:${compatibility.base_version_id}:${compatibility.base_file_id}` : "";
  const setEncoder = (text_encoder: string | null) => setCompatibility({ ...compatibility, text_encoder, clip_type: text_encoder ? compatibility.clip_type : null });
  const setClipType = (clip_type: string | null) => setCompatibility({ ...compatibility, text_encoder: clip_type ? compatibility.text_encoder : null, clip_type });

  return <section className="workspace-panel p-5"><SectionHeading title="Compatibility" description={isAdapter ? "Attach this adapter to one exact installed base model." : "Save the text encoder and CLIP type as one model-owned conditioning stack."} icon={Settings2} /><div className="grid gap-4 md:grid-cols-2">{isAdapter && <div className="md:col-span-2 space-y-2"><label htmlFor="lora-base-model" className={labelClass}>Base model</label><div className="relative"><select id="lora-base-model" className={selectClass} value={baseKey} onChange={(event) => { const selected = baseOptions.find((item) => `${item.model_id}:${item.version_id}:${item.file_id}` === event.target.value); setCompatibility({ ...compatibility, base_model_id: selected?.model_id ?? null, base_version_id: selected?.version_id ?? null, base_file_id: selected?.file_id ?? null }); }} disabled={disabled}><option value="">Select the exact base file</option>{baseOptions.map((item) => <option key={`${item.model_id}:${item.version_id}:${item.file_id}`} value={`${item.model_id}:${item.version_id}:${item.file_id}`}>{item.title} · {item.filename}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /></div>{baseError && <p role="alert" className="text-[11px] text-[var(--danger)]">{baseError}</p>}<p className="text-[11px] text-[var(--ink-faint)]">This adapter can only be used with the selected base file.</p></div>}<Field label="Base architecture"><div className="relative"><select className={selectClass} value={compatibility.base_model} onChange={(event) => setCompatibility({ ...compatibility, base_model: event.target.value })} disabled={disabled}>{baseModels.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /></div></Field>{!isAdapter && <><div className="space-y-2"><label htmlFor="recommended-vae" className={labelClass}>Recommended VAE</label><div className="relative"><select id="recommended-vae" className={selectClass} value={compatibility.vae ?? ""} onChange={(event) => setCompatibility({ ...compatibility, vae: event.target.value || null })} disabled={disabled}><option value="">None</option>{vaeOptions.map((name) => <option key={name} value={name}>{name}{!vaeFiles.includes(name) ? " (unavailable)" : ""}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /></div>{vaeLoading && <p className="text-[11px] text-[var(--ink-faint)]">Scanning local VAE files...</p>}{vaeError && <div role="alert" className="text-[11px] text-[var(--danger)]">{vaeError}</div>}</div><div className="space-y-2"><label htmlFor="text-encoder" className={labelClass}>Text encoder</label><div className="relative"><select id="text-encoder" className={selectClass} value={compatibility.text_encoder ?? ""} onChange={(event) => setEncoder(event.target.value || null)} disabled={disabled || encoderLoading}><option value="">None</option>{encoderOptions.map((name) => <option key={name} value={name}>{name}{!encoderFiles.includes(name) ? " (unavailable)" : ""}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /></div>{encoderLoading && <p className="text-[11px] text-[var(--ink-faint)]">Scanning local text encoders...</p>}{encoderError && <div role="alert" className="text-[11px] text-[var(--danger)]">{encoderError}</div>}</div><div className="space-y-2"><label htmlFor="clip-type" className={labelClass}>CLIP type</label><div className="relative"><select id="clip-type" className={selectClass} value={compatibility.clip_type ?? ""} onChange={(event) => setClipType(event.target.value || null)} disabled={disabled || clipTypesLoading || !compatibility.text_encoder}><option value="">None</option>{typeOptions.map((item) => <option key={item} value={item}>{item}{!clipTypes.includes(item) ? " (unavailable)" : ""}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /></div>{clipTypesLoading && <p className="text-[11px] text-[var(--ink-faint)]">Loading CLIP types...</p>}{clipTypesError && <div role="alert" className="text-[11px] text-[var(--danger)]">{clipTypesError}</div>}<p className="text-[11px] text-[var(--ink-faint)]">Saved together with the selected text encoder.</p></div></>}<Field label="Parent model"><input className={inputClass} value={compatibility.parent_model ?? ""} onChange={(event) => setCompatibility({ ...compatibility, parent_model: event.target.value || null })} disabled={disabled || isAdapter} placeholder="No parent linked" /></Field></div></section>;
}

function IdentityTab({ title, setTitle, tags, setTags, category, setCategory, type, setType, compatibility, setCompatibility, onMediaFiles, disabled }: {
  title: string; setTitle: (value: string) => void; tags: string[]; setTags: (value: string[]) => void; category: CreatorModelCategory; setCategory: (value: CreatorModelCategory) => void; type: CreatorModelType; setType: (value: CreatorModelType) => void; compatibility: CreatorModelCompatibility; setCompatibility: (value: CreatorModelCompatibility) => void; onMediaFiles: (files: File[]) => void; disabled: boolean;
}) {
  return <div className="space-y-6"><section className="workspace-panel p-5"><SectionHeading title="Model identity" description="Make the model easy to find, understand, and remember." icon={Sparkles} /><div className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><Field label="Model title"><input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} disabled={disabled} /></Field></div><Field label="Category"><div className="relative"><select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value as CreatorModelCategory)} disabled={disabled}>{["Character", "Style", "Concept", "Pose", "Clothing", "General"].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /></div></Field><Field label="Model type"><div className="relative"><select className={selectClass} value={type} onChange={(event) => setType(event.target.value as CreatorModelType)} disabled={disabled}>{["Checkpoint", "Diffusion Model", "LoRA", "LyCORIS", "VAE", "Embedding"].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /></div></Field><div className="md:col-span-2"><Field label="Search tags"><TagEditor tags={tags} onChange={setTags} placeholder="portrait, cinematic, fashion" /></Field></div></div></section><CompatibilityFields compatibility={compatibility} setCompatibility={setCompatibility} disabled={disabled} modelType={type} /><section className="workspace-panel p-5"><SectionHeading title="Cover media" description="Upload showcase media. Mark a sample as cover in the metadata convention." icon={ImagePlus} /><MediaDropzone accept="image/*,video/*,.gif" label="Drop a cover image or short video" onFiles={onMediaFiles} disabled={disabled} /></section></div>;
}

function GenerationTab({ generation, setGeneration, type, disabled }: { generation: CreatorModelGeneration; setGeneration: (value: CreatorModelGeneration) => void; type: CreatorModelType; disabled: boolean }) {
  const update = (patch: Partial<CreatorModelGeneration>) => setGeneration({ ...generation, ...patch });
  return <div className="space-y-6">{type === "LoRA" && <section className="workspace-panel p-5"><SectionHeading title="Trigger words" description="Optional terms creators can include when using this LoRA." icon={Tag} /><Field label="Optional trigger words"><TagEditor tags={generation.trigger_words} onChange={(trigger_words) => update({ trigger_words })} placeholder="Add a trigger word" /></Field><div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 text-xs text-[var(--accent)]"><GripVertical className="h-4 w-4 shrink-0" /> Put the most important trigger first.</div></section>}<section className="workspace-panel p-5"><SectionHeading title="Recommended parameters" description="Give creators a useful first render without hiding the controls." icon={Settings2} /><div className="grid gap-4 md:grid-cols-2"><Field label="Preferred sampler"><input className={inputClass} value={generation.sampler} onChange={(event) => update({ sampler: event.target.value })} disabled={disabled} /></Field><Field label="Clip skip"><select className={selectClass} value={generation.clip_skip} onChange={(event) => update({ clip_skip: Number(event.target.value) })} disabled={disabled}><option value={1}>1</option><option value={2}>2</option></select></Field><Field label="Steps range"><div className="flex items-center gap-2"><input type="number" className={inputClass} value={generation.steps_min} onChange={(event) => update({ steps_min: Number(event.target.value) })} disabled={disabled} /><span className="text-xs text-[var(--ink-faint)]">to</span><input type="number" className={inputClass} value={generation.steps_max} onChange={(event) => update({ steps_max: Number(event.target.value) })} disabled={disabled} /></div></Field><Field label="CFG scale"><div className="flex items-center gap-2"><input type="number" step="0.1" className={inputClass} value={generation.cfg_min} onChange={(event) => update({ cfg_min: Number(event.target.value) })} disabled={disabled} /><span className="text-xs text-[var(--ink-faint)]">to</span><input type="number" step="0.1" className={inputClass} value={generation.cfg_max} onChange={(event) => update({ cfg_max: Number(event.target.value) })} disabled={disabled} /></div></Field></div></section><section className="workspace-panel p-5"><SectionHeading title="Prompt templates" description="Optional starting points shown alongside the model in the feed." icon={FileCode2} /><div className="space-y-4"><Field label="Recommended prompt"><textarea className="workspace-field min-h-[118px] w-full resize-y p-3 font-mono text-xs leading-5 outline-none" value={generation.prompt} onChange={(event) => update({ prompt: event.target.value })} disabled={disabled} /></Field><Field label="Negative prompt"><textarea className="workspace-field min-h-[94px] w-full resize-y p-3 font-mono text-xs leading-5 outline-none" value={generation.negative_prompt} onChange={(event) => update({ negative_prompt: event.target.value })} disabled={disabled} /></Field></div></section></div>;
}

function formatBytes(size: number): string { if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`; if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(2)} MB`; return `${(size / 1024 ** 3).toFixed(2)} GB`; }

function LocalModelPicker({ modelType, version, onImport, busy }: { modelType: CreatorModelType; version?: CreatorModelVersion; onImport: (item: LocalModelSummary) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<LocalModelSummary[]>([]);
  const [selected, setSelected] = useState<LocalModelSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const category = modelType === "Checkpoint" ? "checkpoints" : modelType === "Diffusion Model" ? "diffusion_models" : modelType === "LoRA" || modelType === "LyCORIS" ? "loras" : modelType === "VAE" ? "vae" : "embeddings";

  useEffect(() => { const timeout = window.setTimeout(() => setDebouncedQuery(query), 250); return () => window.clearTimeout(timeout); }, [query]);
  useEffect(() => { setSelected(null); }, [category]);
  useEffect(() => {
    if (!open || !version) return;
    let cancelled = false;
    setLoading(true); setError(null);
    void api.listLocalModels(debouncedQuery, category).then((response) => { if (!cancelled) { setItems(response.items); setSelected((current) => current && response.items.some((item) => item.filename === current.filename && item.category === current.category) ? current : null); } }).catch((reason: unknown) => { if (!cancelled) { setItems([]); setSelected(null); setError(reason instanceof Error ? reason.message : "Could not browse ComfyUI models"); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [category, debouncedQuery, open, version]);

  return <section className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)]/70 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--ink)]">Use an existing ComfyUI model</p><p className="mt-1 text-[11px] text-[var(--ink-faint)]">Browse files from the configured {category} folder.</p></div><button type="button" onClick={() => setOpen((value) => !value)} disabled={busy || !version} className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--line-strong)] px-2.5 text-[11px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 disabled:opacity-40"><Search className="h-3.5 w-3.5" /> {open ? "Close browser" : "Choose from ComfyUI"}</button></div>{open && <div className="mt-4 space-y-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--ink-faint)]" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${category} by filename`} className={`${inputClass} pl-9`} /></div><div className="flex items-center justify-between text-[10px] uppercase tracking-[.1em] text-[var(--ink-faint)]"><span>{query ? "Search results" : "Suggested files"}</span><span>{loading ? "Scanning…" : `${items.length} found`}</span></div>{error ? <div role="alert" className="rounded-md border border-[var(--danger-line)] bg-[var(--danger-surface)] px-3 py-3 text-[11px] leading-5 text-[var(--danger)]">{error}. Set COMFY_MODEL_ROOT to your ComfyUI folder, then retry.</div> : <div role="listbox" aria-label="ComfyUI model files" className="max-h-56 overflow-y-auto rounded-md border border-[var(--line)]">{loading && !items.length ? <div className="space-y-2 p-3"><div className="h-9 animate-pulse rounded bg-[var(--surface-soft)]" /><div className="h-9 animate-pulse rounded bg-[var(--surface-soft)]" /><div className="h-9 animate-pulse rounded bg-[var(--surface-soft)]" /></div> : items.length ? items.map((item) => { const active = selected?.category === item.category && selected.filename === item.filename; return <button key={`${item.category}:${item.filename}`} type="button" role="option" aria-selected={active} onClick={() => setSelected(item)} disabled={busy} className={`flex min-h-11 w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5 text-left transition last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]/70 disabled:opacity-40 ${active ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "hover:bg-[var(--surface-soft)]"}`}><span className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-[var(--accent)]" : "border border-[var(--line-strong)]"}`} /><span className="min-w-0 truncate font-mono text-[11px]">{item.filename}</span></span><span className="shrink-0 text-[10px] text-[var(--ink-faint)]">{formatBytes(item.size)}</span></button>; }) : <div className="px-4 py-8 text-center"><FileArchive className="mx-auto h-5 w-5 text-[var(--ink-faint)]" /><p className="mt-2 text-xs text-[var(--ink-soft)]">No matching {category} files</p><p className="mt-1 text-[11px] text-[var(--ink-faint)]">Try another filename or check the ComfyUI folder.</p></div>}</div>}{selected && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-3"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.1em] text-[var(--accent)]/70">Selected file</p><p className="mt-1 truncate font-mono text-xs text-[var(--ink)]">{selected.filename}</p><p className="mt-1 text-[10px] text-[var(--ink-faint)]">{selected.category} · {formatBytes(selected.size)}</p></div><button type="button" onClick={() => onImport(selected)} disabled={busy} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)] transition hover:brightness-105 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 disabled:opacity-40"><Check className="h-4 w-4" /> {busy ? "Importing…" : "Import selected"}</button></div>}</div>}</section>;
}

function FilesTab({ versions, selectedVersionId, onSelectVersion, onCreateVersion, onUpload, onImport, onPatch, onDelete, modelType, busy }: { versions: CreatorModelVersion[]; selectedVersionId: string | null; onSelectVersion: (id: string) => void; onCreateVersion: () => void; onUpload: (file: File) => void; onImport: (item: LocalModelSummary) => void; onPatch: (file: CreatorModelFile) => void; onDelete: (file: CreatorModelFile) => void; modelType: CreatorModelType; busy: boolean }) {
  const version = versions.find((item) => item.version_id === selectedVersionId) ?? versions[0];
  return <div className="space-y-6"><section className="workspace-panel p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><SectionHeading title="Version control" description="Ship stable releases without losing previous files." icon={Archive} /><button type="button" onClick={onCreateVersion} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--line-strong)] px-3 text-xs font-semibold text-[var(--ink)] disabled:opacity-40"><Plus className="h-4 w-4" /> Add version</button></div>{versions.length ? <div className="flex flex-wrap gap-2">{versions.map((item) => <button key={item.version_id} type="button" onClick={() => onSelectVersion(item.version_id)} className={`rounded-md border px-3 py-2 text-xs font-semibold ${version?.version_id === item.version_id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-faint)]"}`}>{item.name}</button>)}</div> : <p className="text-xs text-[var(--ink-faint)]">Save the model to create its first version.</p>}</section><section className="workspace-panel overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-[15px] font-semibold text-[var(--ink)]">File slots</h2><p className="mt-1 text-xs text-[var(--ink-faint)]">{version?.name ?? "No version"} accepts safetensors and GGUF variants.</p></div><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)]"><input type="file" accept=".safetensors,.ckpt,.pt,.pth,.bin,.gguf" className="sr-only" disabled={busy || !version} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} /><CloudUpload className="h-4 w-4" /> Upload file</label></div><div className="px-5"><LocalModelPicker modelType={modelType} version={version} onImport={onImport} busy={busy} /></div>{!version?.files.length ? <div className="px-5 py-10 text-center text-xs text-[var(--ink-faint)]">No model files yet. Upload a checkpoint, adapter, or compatible weights file.</div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-[var(--surface-sunken)] text-[10px] uppercase tracking-[.12em] text-[var(--ink-faint)]"><tr><th className="px-5 py-3">File</th><th className="px-3 py-3">Size</th><th className="px-3 py-3">SHA256</th><th className="px-3 py-3">Precision</th><th className="px-5 py-3 text-right">Visible</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{version.files.map((file) => <tr key={file.file_id} className="group hover:bg-[var(--surface-soft)]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface-soft)] text-[var(--accent)]"><FileArchive className="h-4 w-4" /></span><div><div className="font-medium text-[var(--ink)]">{file.filename}</div><a href={file.download_url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[11px] text-[var(--ink-faint)] hover:text-[var(--accent)]">Download</a></div></div></td><td className="px-3 py-4 tabular-nums text-[var(--ink-soft)]">{formatBytes(file.size)}</td><td className="px-3 py-4 font-mono text-[11px] text-[var(--ink-faint)]">{file.sha256.slice(0, 12)}…<button type="button" aria-label={`Copy hash for ${file.filename}`} onClick={() => void navigator.clipboard?.writeText(file.sha256)} className="ml-2"><Copy className="inline h-3 w-3" /></button></td><td className="px-3 py-4"><span className="rounded bg-[var(--surface-soft)] px-2 py-1 text-[11px] text-[var(--ink-soft)]">{file.precision}</span></td><td className="px-5 py-4"><div className="flex items-center justify-end gap-3"><Toggle label={`Toggle visibility for ${file.filename}`} checked={file.visible} onChange={() => onPatch(file)} disabled={busy} /><button type="button" aria-label={`Delete ${file.filename}`} onClick={() => onDelete(file)} disabled={busy} className="text-[var(--ink-faint)] transition hover:text-[var(--danger)] disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div><div className="space-y-3 p-4 md:hidden">{version.files.map((file) => <article key={file.file_id} className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium text-[var(--ink)]">{file.filename}</p><p className="mt-1 text-[11px] text-[var(--ink-faint)]">{formatBytes(file.size)} · {file.precision}</p></div><button type="button" aria-label={`Delete ${file.filename}`} onClick={() => onDelete(file)} disabled={busy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3"><div className="min-w-0"><p className="truncate font-mono text-[10px] text-[var(--ink-faint)]">{file.sha256.slice(0, 12)}…</p><div className="mt-2 flex gap-3"><a href={file.download_url} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[var(--accent)]">Download</a><button type="button" onClick={() => void navigator.clipboard?.writeText(file.sha256)} className="text-[11px] text-[var(--ink-soft)]">Copy hash</button></div></div><div className="flex shrink-0 items-center gap-2"><span className="text-[10px] text-[var(--ink-faint)]">Visible</span><Toggle label={`Toggle visibility for ${file.filename}`} checked={file.visible} onChange={() => onPatch(file)} disabled={busy} /></div></div></article>)}</div></>}</section></div>;
}

function SamplesTab({ samples, onUpload, onDelete, busy }: { samples: CreatorModelSample[]; onUpload: (file: File) => void; onDelete: (sample: CreatorModelSample) => void; busy: boolean }) {
  return <div className="space-y-6"><section className="workspace-panel p-5"><SectionHeading title="Showcase gallery" description="Select the images that best explain what this model can make." icon={ImagePlus} />{samples.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{samples.map((item) => <div key={item.sample_id} className="group relative aspect-[4/5] overflow-hidden rounded-lg bg-[var(--surface-soft)]">{item.kind === "video" ? <video src={item.url} controls className="h-full w-full object-cover" /> : <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />}<div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-[var(--ground)]/80 to-transparent px-3 pb-3 pt-10"><span className="truncate text-xs text-white">{item.filename}</span><button type="button" aria-label={`Remove ${item.filename}`} onClick={() => onDelete(item)} disabled={busy} className="text-white/70 hover:text-[var(--danger)]"><Trash2 className="h-3.5 w-3.5" /></button></div></div>)}</div> : <div className="border border-dashed border-[var(--line-strong)] px-5 py-10 text-center text-xs text-[var(--ink-faint)]">No showcase samples uploaded yet.</div>}<div className="mt-4"><MediaDropzone accept="image/*,video/*,.gif" label="Add showcase samples" onFiles={(files) => files.forEach(onUpload)} disabled={busy} /></div></section><section className="workspace-panel p-5"><SectionHeading title="PNG info" description="Metadata supplied with each sample is preserved by the backend." icon={FileImage} /><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3"><div className="text-[10px] uppercase tracking-[.12em] text-[var(--ink-faint)]">Sampler</div><div className="mt-2 text-sm text-[var(--ink)]">Stored per model generation settings</div></div><div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3"><div className="text-[10px] uppercase tracking-[.12em] text-[var(--ink-faint)]">Samples</div><div className="mt-2 text-sm text-[var(--ink)]">{samples.length} uploaded</div></div></div></section></div>;
}

function AccessTab({ visibility, setVisibility, permissions, setPermissions, disabled }: { visibility: ModelVisibility; setVisibility: (value: ModelVisibility) => void; permissions: CreatorModelPermissions; setPermissions: (value: CreatorModelPermissions) => void; disabled: boolean }) {
  const rights: Array<[keyof CreatorModelPermissions, string, string]> = [["commercial", "Commercial use", "Allow outputs to be used in paid work."], ["remix", "Re-upload and remix", "Allow modified versions to be published."], ["generation_services", "Generation services", "Allow hosted generation services to use this model."], ["credit_required", "Credit required", "Ask creators to credit your profile."]];
  return <div className="space-y-6"><section className="workspace-panel p-5"><SectionHeading title="Publishing status" description="Control who can find and download this model." icon={Eye} /><div className="grid gap-3 sm:grid-cols-3">{(["Public", "Unlisted", "Private"] as const).map((item) => <button type="button" key={item} onClick={() => setVisibility(item)} disabled={disabled} className={`rounded-lg border p-4 text-left transition disabled:opacity-40 ${visibility === item ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line)] bg-[var(--surface-sunken)]"}`}><div className={`text-sm font-semibold ${visibility === item ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>{item}</div><div className="mt-1 text-[11px] leading-4 text-[var(--ink-faint)]">{item === "Public" ? "Visible in discovery" : item === "Unlisted" ? "Only shared links" : "Draft workspace only"}</div></button>)}</div></section><section className="workspace-panel p-5"><SectionHeading title="Usage permissions" description="State the rules clearly before someone downloads." icon={ShieldCheck} /><div className="divide-y divide-[var(--line)]">{rights.map(([key, label, helper]) => <div key={key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"><div><div className="text-sm font-medium text-[var(--ink)]">{label}</div><div className="mt-1 text-xs text-[var(--ink-faint)]">{helper}</div></div><Toggle label={label} checked={permissions[key]} disabled={disabled} onChange={() => setPermissions({ ...permissions, [key]: !permissions[key] })} /></div>)}</div></section></div>;
}

function PreviewCard({ title, type, base, tags, samples, version, visibility }: { title: string; type: string; base: string; tags: string[]; samples: CreatorModelSample[]; version: string; visibility: string }) {
  const cover = samples[0];
  return <aside className="workspace-panel sticky top-5 overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--ink-faint)]">Discovery preview</span></div><span className="text-[11px] text-[var(--ink-faint)]">{visibility}</span></div><div className="aspect-[4/3] overflow-hidden bg-[var(--surface-soft)]">{cover ? (cover.kind === "video" ? <video src={cover.url} muted autoPlay loop className="h-full w-full object-cover" /> : <img src={cover.url} alt="Model cover preview" className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-xs text-[var(--ink-faint)]">Add cover media</div>}</div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-[-.03em] text-[var(--ink)]">{title || "Untitled model"}</h2><p className="mt-1 text-xs text-[var(--ink-faint)]">by you · {type} · {base}</p></div><MoreHorizontal className="h-5 w-5 text-[var(--ink-faint)]" /></div><div className="mt-4 flex flex-wrap gap-1.5">{tags.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-[var(--surface-soft)] px-2 py-1 text-[11px] text-[var(--ink-soft)]">{tag}</span>)}</div><div className="mt-5 grid grid-cols-3 gap-2 border-y border-[var(--line)] py-3 text-center"><div><div className="text-sm font-semibold text-[var(--ink)]">{version || "—"}</div><div className="mt-1 text-[10px] uppercase tracking-[.1em] text-[var(--ink-faint)]">version</div></div><div><div className="text-sm font-semibold text-[var(--ink)]">{samples.length}</div><div className="mt-1 text-[10px] uppercase tracking-[.1em] text-[var(--ink-faint)]">samples</div></div><div><div className="truncate text-sm font-semibold text-[var(--ink)]">{base}</div><div className="mt-1 text-[10px] uppercase tracking-[.1em] text-[var(--ink-faint)]">base</div></div></div></div></aside>;
}

const initialCompatibility: CreatorModelCompatibility = { base_model: "Stable Diffusion XL (SDXL)", base_model_id: null, base_version_id: null, base_file_id: null, vae: null, text_encoder: null, clip_type: null, parent_model: null };
const initialGeneration: CreatorModelGeneration = { trigger_words: [], sampler: "DPM++ 2M Karras", steps_min: 20, steps_max: 30, cfg_min: 3.5, cfg_max: 7, clip_skip: 1, prompt: "", negative_prompt: "" };
const initialPermissions: CreatorModelPermissions = { commercial: true, remix: false, generation_services: true, credit_required: true };

export default function ModelsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("identity");
  const [title, setTitle] = useState("Untitled model");
  const [category, setCategory] = useState<CreatorModelCategory>("General");
  const [type, setType] = useState<CreatorModelType>("Checkpoint");
  const [tags, setTags] = useState<string[]>([]);
  const [compatibility, setCompatibility] = useState(initialCompatibility);
  const [generation, setGeneration] = useState(initialGeneration);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [visibility, setVisibility] = useState<ModelVisibility>("Private");
  const [model, setModel] = useState<CreatorModel | null>(null);
  const [models, setModels] = useState<CreatorModel[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; item: string; confirm: () => void } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);

  const selectedVersion = useMemo(() => model?.versions.find((item) => item.version_id === selectedVersionId) ?? model?.versions[0], [model, selectedVersionId]);
  const samples = selectedVersion?.samples ?? [];
  const versions = model?.versions ?? [];
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2400); };
  const changed = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setDirty(true); };

  const applyModel = (value: CreatorModel) => {
    setModel(value); setTitle(value.title); setCategory(value.category); setType(value.model_type); setTags(value.tags);
    setCompatibility(value.compatibility); setGeneration(value.generation); setPermissions(value.permissions); setVisibility(value.visibility);
    setSelectedVersionId((current) => value.versions.some((item) => item.version_id === current) ? current : value.versions[0]?.version_id ?? null);
  };

  useEffect(() => {
    let cancelled = false;
    api.listCreatorModels().then(async (items) => {
      const values = await Promise.all(items.map((item) => api.getCreatorModel(item.model_id)));
      if (!cancelled) { setModels(values); if (values[0]) { applyModel(values[0]); setDirty(false); } }
    }).catch((error: unknown) => { if (!cancelled) setBackendError(error instanceof Error ? error.message : "Could not load saved models"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, saving]);

  const createNewModel = () => {
    setModel(null); setTitle("Untitled model"); setCategory("General"); setType("Checkpoint"); setTags([]);
    setCompatibility(initialCompatibility); setGeneration(initialGeneration); setPermissions(initialPermissions); setVisibility("Private");
    setSelectedVersionId(null); setDirty(true); setActiveTab("identity"); setBackendError(null);
  };

  const importLocalFile = async (item: LocalModelSummary) => {
    const saved = await ensureModel(); const versionId = selectedVersionId ?? saved?.versions[0]?.version_id;
    if (!saved || !versionId) return;
    setSaving(true); setBackendError(null);
    try { const value = await api.importLocalModelFile(saved.model_id, versionId, item.category, item.filename); applyModel(value); setModels((current) => current.map((entry) => entry.model_id === value.model_id ? value : entry)); setDirty(false); notify("Local ComfyUI model imported"); }
    catch (error) { setBackendError(error instanceof Error ? error.message : "Could not import local model"); }
    finally { setSaving(false); }
  };

  const requestConfirmation = (title: string, item: string, confirm: () => void) => {
    confirmationTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation({ title, item, confirm });
  };
  const dismissConfirmation = () => {
    setConfirmation(null);
    window.setTimeout(() => confirmationTriggerRef.current?.focus(), 0);
  };
  useEffect(() => {
    if (!confirmation) return;
    cancelConfirmationRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") dismissConfirmation(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmation]);

  const loadModel = async (modelId: string) => {
    setSaving(true);
    try { const value = await api.getCreatorModel(modelId); applyModel(value); setDirty(false); }
    catch (error) { setBackendError(error instanceof Error ? error.message : "Could not load model"); }
    finally { setSaving(false); }
  };

  const switchModel = async (modelId: string) => {
    if (dirty) {
      requestConfirmation("Discard changes", models.find((item) => item.model_id === modelId)?.title ?? "this model", () => void loadModel(modelId));
      return;
    }
    await loadModel(modelId);
  };

  const payload = (): CreatorModelPayload => ({ title, category, model_type: type, tags, compatibility, generation: { ...generation, trigger_words: type === "LoRA" ? generation.trigger_words : [] }, permissions, visibility });
  const saveModel = async (publish = false): Promise<CreatorModel | null> => {
    setSaving(true); setBackendError(null);
    try {
      const saved = model ? await api.updateCreatorModel(model.model_id, payload()) : await api.createCreatorModel(payload());
      const published = publish ? await api.publishCreatorModel(saved.model_id, visibility) : saved;
      setModels((current) => current.some((item) => item.model_id === published.model_id) ? current.map((item) => item.model_id === published.model_id ? published : item) : [published, ...current]);
      applyModel(published); setDirty(false); notify(publish ? `Model ${visibility.toLowerCase()}` : "Draft saved"); return published;
    } catch (error) { setBackendError(error instanceof Error ? error.message : "Could not save model"); return null; } finally { setSaving(false); }
  };

  const ensureModel = async (): Promise<CreatorModel | null> => model && !dirty ? model : saveModel(false);
  const runMutation = async (action: () => Promise<CreatorModel>, message: string) => { setSaving(true); setBackendError(null); try { const value = await action(); applyModel(value); setDirty(false); notify(message); } catch (error) { setBackendError(error instanceof Error ? error.message : "Could not update model"); } finally { setSaving(false); } };

  const createVersion = async () => {
    const saved = await ensureModel(); if (!saved) return;
    const next = `v${saved.versions.length + 1}.0`;
    setSaving(true); try { await api.createModelVersion(saved.model_id, next); const refreshed = await api.getCreatorModel(saved.model_id); applyModel(refreshed); setDirty(false); notify(`Created ${next}`); } catch (error) { setBackendError(error instanceof Error ? error.message : "Could not create version"); } finally { setSaving(false); }
  };
  const uploadFile = async (file: File) => { const saved = await ensureModel(); const versionId = selectedVersionId ?? saved?.versions[0]?.version_id; if (!saved || !versionId) return; setSaving(true); try { const value = await api.uploadModelFile(saved.model_id, versionId, file); applyModel(value); setDirty(false); notify("Model file uploaded"); } catch (error) { setBackendError(error instanceof Error ? error.message : "Could not upload model file"); } finally { setSaving(false); } };
  const uploadSample = async (file: File) => { const saved = await ensureModel(); const versionId = selectedVersionId ?? saved?.versions[0]?.version_id; if (!saved || !versionId) return; setSaving(true); try { const value = await api.uploadModelSample(saved.model_id, versionId, file, { role: "showcase" }); applyModel(value); setDirty(false); notify("Showcase sample uploaded"); } catch (error) { setBackendError(error instanceof Error ? error.message : "Could not upload sample"); } finally { setSaving(false); } };
  const patchFile = async (file: CreatorModelFile) => { const saved = await ensureModel(); if (!saved || !selectedVersionId) return; await runMutation(() => api.patchModelFile(saved.model_id, selectedVersionId, file.file_id, { visible: !file.visible }), "File visibility updated"); };
  const deleteFile = (file: CreatorModelFile) => { if (!model || !selectedVersion) return; requestConfirmation("Delete file", file.filename, () => void (async () => { const saved = await ensureModel(); if (!saved || !selectedVersionId) return; setSaving(true); try { await api.deleteModelFile(saved.model_id, selectedVersionId, file.file_id); const refreshed = await api.getCreatorModel(saved.model_id); applyModel(refreshed); notify("Model file deleted"); } catch (error) { setBackendError(error instanceof Error ? error.message : "Could not delete model file"); } finally { setSaving(false); } })()); };
  const deleteSample = (sample: CreatorModelSample) => { if (!model || !selectedVersion) return; requestConfirmation("Delete sample", sample.filename, () => void (async () => { const saved = await ensureModel(); if (!saved || !selectedVersionId) return; setSaving(true); try { await api.deleteModelSample(saved.model_id, selectedVersionId, sample.sample_id); const refreshed = await api.getCreatorModel(saved.model_id); applyModel(refreshed); notify("Sample deleted"); } catch (error) { setBackendError(error instanceof Error ? error.message : "Could not delete sample"); } finally { setSaving(false); } })()); };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.id === activeTab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % tabs.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index - 1 + tabs.length) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    setActiveTab(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  if (loading) return <main id="main-content" className="workspace-scroll h-full p-5 sm:p-7" aria-busy="true" aria-label="Loading Model Studio"><div className="mx-auto max-w-[1700px]"><div className="shimmer h-16 rounded-lg" /><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]"><div className="space-y-4"><div className="shimmer h-56 rounded-lg" /><div className="shimmer h-72 rounded-lg" /></div><div className="shimmer h-96 rounded-lg" /></div></div></main>;

  return <div id="main-content" className="workspace-scroll h-full min-h-0 bg-transparent">{backendError && <div role="alert" className="mx-auto max-w-[1700px] border-b border-[var(--danger-line)] bg-[var(--danger-surface)] px-5 py-2 text-xs text-[var(--danger)] sm:px-7">{backendError}</div>}<header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_90%,transparent)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4 px-5 py-4 sm:px-7"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-soft)] text-[var(--accent)]"><Layers3 className="h-5 w-5" /></div><div className="min-w-0"><p className="workspace-kicker">Creator workspace / Models</p><h1 className="mt-1 truncate text-xl font-semibold tracking-[-.04em] text-[var(--ink)] sm:text-2xl">Model studio</h1></div></div><div className="hidden items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--ink-faint)] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> {saving ? "Syncing" : "Server persistence"}</div></div><div className="mx-auto flex max-w-[1700px] items-center gap-2 px-5 pb-3 sm:px-7">{models.length > 0 ? <select aria-label="Select creator model" value={model?.model_id ?? ""} onChange={(event) => void switchModel(event.target.value)} disabled={saving} className="workspace-field h-9 max-w-[22rem] px-3 text-xs outline-none">{models.map((item) => <option key={item.model_id} value={item.model_id}>{item.title} · {item.model_type}</option>)}</select> : <span className="text-[11px] text-[var(--ink-faint)]">No saved models yet. Start a new model.</span>}<button type="button" onClick={createNewModel} disabled={saving} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--line-strong)] px-2.5 text-[11px] font-semibold text-[var(--ink)]"><Plus className="h-3.5 w-3.5" /> New model</button></div><div className="mx-auto max-w-[1700px] px-5 sm:px-7"><nav role="tablist" aria-label="Model editor sections" className="flex min-w-max gap-5">{tabs.map((tab, index) => <button ref={(element) => { tabRefs.current[index] = element; }} key={tab.id} id={`model-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`model-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => setActiveTab(tab.id)} className={`relative flex items-center gap-2 pb-3 pt-1 text-xs font-semibold ${activeTab === tab.id ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}`}><span>{tab.label}</span>{tab.id === "files" && <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 text-[10px] text-[var(--ink-faint)]">{selectedVersion?.files.length ?? 0}</span>}<span className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--accent)] ${activeTab === tab.id ? "opacity-100" : "opacity-0"}`} /></button>)}</nav></div></header><main className="mx-auto grid max-w-[1700px] gap-6 px-5 pb-28 pt-6 mobile-content-clearance sm:px-7 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]"><div className="min-w-0"><div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-xs text-[var(--ink-faint)]">{loading ? "Loading saved model…" : currentTab.hint}</p><h2 className="mt-1 text-sm font-medium text-[var(--ink-soft)]">{currentTab.label}</h2></div><div className="flex items-center gap-2 text-[11px] text-[var(--ink-faint)]"><CircleHelp className="h-4 w-4" /> Changes save to local backend</div></div><div id={`model-panel-${activeTab}`} role="tabpanel" aria-labelledby={`model-tab-${activeTab}`}>{activeTab === "identity" && <IdentityTab title={title} setTitle={changed(setTitle)} tags={tags} setTags={changed(setTags)} category={category} setCategory={changed(setCategory)} type={type} setType={(nextType) => { setType(nextType); setCompatibility((current) => ({ ...current, base_model_id: nextType === "LoRA" || nextType === "LyCORIS" ? current.base_model_id : null, base_version_id: nextType === "LoRA" || nextType === "LyCORIS" ? current.base_version_id : null, base_file_id: nextType === "LoRA" || nextType === "LyCORIS" ? current.base_file_id : null })); }} compatibility={compatibility} setCompatibility={changed(setCompatibility)} onMediaFiles={(files) => files.forEach(uploadSample)} disabled={saving} />}{activeTab === "generation" && <GenerationTab generation={generation} setGeneration={changed(setGeneration)} type={type} disabled={saving} />}{activeTab === "files" && <FilesTab versions={versions} selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} onCreateVersion={createVersion} onUpload={uploadFile} onImport={importLocalFile} onPatch={patchFile} onDelete={deleteFile} modelType={type} busy={saving} />}{activeTab === "samples" && <SamplesTab samples={samples} onUpload={uploadSample} onDelete={deleteSample} busy={saving} />}{activeTab === "access" && <AccessTab visibility={visibility} setVisibility={changed(setVisibility)} permissions={permissions} setPermissions={changed(setPermissions)} disabled={saving} />}</div></div><PreviewCard title={title} type={type} base={compatibility.base_model} tags={tags} samples={samples} version={selectedVersion?.name ?? ""} visibility={visibility} /></main><div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mobile-nav-clearance flex justify-center px-4 pb-4"><div className="pointer-events-auto flex w-full max-w-[760px] items-center justify-between gap-4 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 px-4 py-3 shadow-[0_-18px_48px_-28px_rgba(6,182,212,.35)] backdrop-blur-xl"><div className="flex min-w-0 items-center gap-3"><span className={`h-2 w-2 shrink-0 rounded-full ${dirty ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--ink)]">{dirty ? "Unsaved changes" : "All changes saved"}</p><p className="mt-0.5 truncate text-[11px] text-[var(--ink-faint)]">{model ? "Saved on this backend" : "Save to create a model record"}</p></div></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => void saveModel(false)} disabled={!dirty || saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-4 w-4" /> {saving ? "Saving" : "Save draft"}</button><button type="button" onClick={() => void saveModel(true)} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--line-strong)] px-3 text-xs font-semibold text-[var(--ink)] disabled:opacity-40"><Check className="h-4 w-4" /> Publish</button></div></div></div>{confirmation && <ConfirmationDialog title={confirmation.title} item={confirmation.item} cancelRef={cancelConfirmationRef} onCancel={dismissConfirmation} onConfirm={() => { const action = confirmation.confirm; setConfirmation(null); action(); }} />}{toast && <div role="status" className="fixed right-5 top-20 z-50 flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--surface-soft)] px-4 py-3 text-xs font-medium text-[var(--accent)]"><Check className="h-4 w-4" /> {toast}</div>}</div>;
}
