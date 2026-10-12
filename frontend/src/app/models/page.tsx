"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  type ModelVisibility,
  type LocalModelSummary,
  type InstalledGalleryModel,
} from "@/lib/api";
import {
  Archive,
  Check,
  ChevronDown,
  CircleHelp,
  CloudUpload,
  Copy,
  Eye,
  FileArchive,
  FileCode2,
  FileImage,
  GripVertical,
  ImagePlus,
  Info,
  Layers3,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import TensorModelCard from "@/components/TensorModelCard";

const baseModels = [
  "FLUX.1",
  "Stable Diffusion XL (SDXL)",
  "Stable Diffusion 1.5 (SD 1.5)",
  "Stable Diffusion 3.5",
  "Pony Diffusion V6 XL",
  "Illustrious XL",
  "KREA_2",
  "Wan 2.1 / Wan 2.8",
  "Z-Image / Z-Image-Turbo",
  "Qwen-Image-2.1",
  "Hunyuan-DiT",
  "CogVideoX",
  "Anima",
  "Realistic Vision",
];

const inputClass =
  "workspace-field h-10 w-full px-3 text-xs font-mono outline-none bg-[var(--surface-sunken)] border border-[var(--line)] rounded-lg text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors";
const selectClass = `${inputClass} appearance-none pr-8 cursor-pointer`;
const labelClass =
  "mb-1.5 block font-mono text-[10px] font-bold tracking-wider text-[var(--ink-soft)] uppercase";

function SectionCardHeader({
  number,
  title,
  subtitle,
  icon: Icon,
  badge,
}: {
  number: string;
  title: string;
  subtitle?: string;
  icon: typeof Info;
  badge?: string | number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)] shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase">
              {number}
            </span>
            <span className="font-mono text-[10px] text-[var(--line-strong)]">
              /
            </span>
            <h2 className="font-mono text-xs font-bold tracking-wider text-[var(--ink)] uppercase">
              {title}
            </h2>
            {badge !== undefined && (
              <span className="ml-1 rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: React.ReactNode;
  helper?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
      {helper && (
        <span className="block text-[11px] leading-4 text-[var(--ink-faint)]">
          {helper}
        </span>
      )}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--accent-ink)] transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function TagEditor({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (value && !tags.includes(value)) onChange([...tags, value]);
    setDraft("");
  };
  return (
    <div className="workspace-field flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1.5 focus-within:border-[var(--accent)] transition-colors">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--accent)]"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(tags.filter((item) => item !== tag))}
            className="hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={tags.length ? "Add another…" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 font-mono text-xs text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
      />
    </div>
  );
}

function MediaDropzone({
  accept,
  label,
  onFiles,
  disabled = false,
}: {
  accept: string;
  label: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  };
  const input = (event: ChangeEvent<HTMLInputElement>) => {
    if (!disabled) onFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center transition ${
        dragging
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={input}
      />
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-soft)] text-[var(--accent)] border border-[var(--line)]">
        <UploadCloud className="h-4.5 w-4.5" />
      </span>
      <span className="font-mono text-xs font-semibold text-[var(--ink)]">
        {label}
      </span>
      <span className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
        Drop files or browse local disk
      </span>
    </label>
  );
}

function ConfirmationDialog({
  title,
  item,
  onCancel,
  onConfirm,
  cancelRef,
}: {
  title: string;
  item: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
        onKeyDown={trapFocus}
        className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-[0_32px_96px_rgba(0,0,0,0.85)]"
      >
        <h2
          id="confirmation-title"
          className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--ink)]"
        >
          {title}
        </h2>
        <p
          id="confirmation-description"
          className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]"
        >
          This action affects{" "}
          <span className="font-semibold text-[var(--ink)]">{item}</span>.
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-xs text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-[var(--danger)] px-3.5 font-mono text-xs font-bold text-white transition-opacity hover:opacity-90"
          >
            {title}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompatibilityFields({
  compatibility,
  setCompatibility,
  disabled,
  modelType,
}: {
  compatibility: CreatorModelCompatibility;
  setCompatibility: (value: CreatorModelCompatibility) => void;
  disabled: boolean;
  modelType: CreatorModelType;
}) {
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
    setLoading(true);
    setError(null);
    void api
      .listLocalModels("", category)
      .then((response) => {
        const filenames = response.items.map((item) => item.filename);
        if (category === "vae") setVaeFiles(filenames);
        else setEncoderFiles(filenames);
      })
      .catch((error: unknown) =>
        setError(
          error instanceof Error ? error.message : `Could not load ${category}`,
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFiles("vae");
    loadFiles("text_encoders");
    void api
      .getClipOptions()
      .then((options) => setClipTypes(options.types))
      .catch((error: unknown) =>
        setClipTypesError(
          error instanceof Error ? error.message : "Could not load CLIP types",
        ),
      )
      .finally(() => setClipTypesLoading(false));
    void api
      .listSelectableModels()
      .then((items) =>
        setBaseOptions(
          items.filter(
            (item) =>
              item.model_type === "Checkpoint" ||
              item.model_type === "Diffusion Model",
          ),
        ),
      )
      .catch((error: unknown) =>
        setBaseError(
          error instanceof Error
            ? error.message
            : "Could not load installed base models",
        ),
      );
  }, []);

  const vaeOptions =
    compatibility.vae && !vaeFiles.includes(compatibility.vae)
      ? [compatibility.vae, ...vaeFiles]
      : vaeFiles;
  const encoderOptions =
    compatibility.text_encoder &&
    !encoderFiles.includes(compatibility.text_encoder)
      ? [compatibility.text_encoder, ...encoderFiles]
      : encoderFiles;
  const typeOptions =
    compatibility.clip_type && !clipTypes.includes(compatibility.clip_type)
      ? [compatibility.clip_type, ...clipTypes]
      : clipTypes;
  const baseKey =
    compatibility.base_model_id &&
    compatibility.base_version_id &&
    compatibility.base_file_id
      ? `${compatibility.base_model_id}:${compatibility.base_version_id}:${compatibility.base_file_id}`
      : "";
  const setEncoder = (text_encoder: string | null) =>
    setCompatibility({
      ...compatibility,
      text_encoder,
      clip_type: text_encoder ? compatibility.clip_type : null,
    });
  const setClipType = (clip_type: string | null) =>
    setCompatibility({
      ...compatibility,
      text_encoder: clip_type ? compatibility.text_encoder : null,
      clip_type,
    });

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--line)]">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-[var(--accent)]" />
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
          COMPATIBILITY MATRIX
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {isAdapter && (
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="lora-base-model" className={labelClass}>
              Exact installed base model
            </label>
            <div className="relative">
              <select
                id="lora-base-model"
                className={selectClass}
                value={baseKey}
                onChange={(event) => {
                  const selected = baseOptions.find(
                    (item) =>
                      `${item.model_id}:${item.version_id}:${item.file_id}` ===
                      event.target.value,
                  );
                  setCompatibility({
                    ...compatibility,
                    base_model_id: selected?.model_id ?? null,
                    base_version_id: selected?.version_id ?? null,
                    base_file_id: selected?.file_id ?? null,
                  });
                }}
                disabled={disabled}
              >
                <option value="">Select the exact base file</option>
                {baseOptions.map((item) => (
                  <option
                    key={`${item.model_id}:${item.version_id}:${item.file_id}`}
                    value={`${item.model_id}:${item.version_id}:${item.file_id}`}
                  >
                    {item.title} · {item.filename}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
            </div>
            {baseError && (
              <p role="alert" className="text-[11px] text-[var(--danger)]">
                {baseError}
              </p>
            )}
            <p className="text-[11px] text-[var(--ink-faint)]">
              This adapter can only be used with the selected base file.
            </p>
          </div>
        )}
        <Field label="Base architecture">
          <div className="relative">
            <select
              className={selectClass}
              value={compatibility.base_model}
              onChange={(event) =>
                setCompatibility({
                  ...compatibility,
                  base_model: event.target.value,
                })
              }
              disabled={disabled}
            >
              {baseModels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
          </div>
        </Field>
        {!isAdapter && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="recommended-vae" className={labelClass}>
                Recommended VAE
              </label>
              <div className="relative">
                <select
                  id="recommended-vae"
                  className={selectClass}
                  value={compatibility.vae ?? ""}
                  onChange={(event) =>
                    setCompatibility({
                      ...compatibility,
                      vae: event.target.value || null,
                    })
                  }
                  disabled={disabled}
                >
                  <option value="">None</option>
                  {vaeOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                      {!vaeFiles.includes(name) ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
              </div>
              {vaeLoading && (
                <p className="text-[11px] text-[var(--ink-faint)]">
                  Scanning local VAE files…
                </p>
              )}
              {vaeError && (
                <div role="alert" className="text-[11px] text-[var(--danger)]">
                  {vaeError}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="text-encoder" className={labelClass}>
                Text encoder
              </label>
              <div className="relative">
                <select
                  id="text-encoder"
                  className={selectClass}
                  value={compatibility.text_encoder ?? ""}
                  onChange={(event) => setEncoder(event.target.value || null)}
                  disabled={disabled || encoderLoading}
                >
                  <option value="">None</option>
                  {encoderOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                      {!encoderFiles.includes(name) ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
              </div>
              {encoderLoading && (
                <p className="text-[11px] text-[var(--ink-faint)]">
                  Scanning local text encoders…
                </p>
              )}
              {encoderError && (
                <div role="alert" className="text-[11px] text-[var(--danger)]">
                  {encoderError}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="clip-type" className={labelClass}>
                CLIP type
              </label>
              <div className="relative">
                <select
                  id="clip-type"
                  className={selectClass}
                  value={compatibility.clip_type ?? ""}
                  onChange={(event) => setClipType(event.target.value || null)}
                  disabled={
                    disabled || clipTypesLoading || !compatibility.text_encoder
                  }
                >
                  <option value="">None</option>
                  {typeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                      {!clipTypes.includes(item) ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
              </div>
              {clipTypesLoading && (
                <p className="text-[11px] text-[var(--ink-faint)]">
                  Loading CLIP types…
                </p>
              )}
              {clipTypesError && (
                <div role="alert" className="text-[11px] text-[var(--danger)]">
                  {clipTypesError}
                </div>
              )}
            </div>
          </>
        )}
        <Field label="Parent model linkage">
          <input
            className={inputClass}
            value={compatibility.parent_model ?? ""}
            onChange={(event) =>
              setCompatibility({
                ...compatibility,
                parent_model: event.target.value || null,
              })
            }
            disabled={disabled || isAdapter}
            placeholder="No parent model linked"
          />
        </Field>
      </div>
    </div>
  );
}

function formatBytes(size: number): string {
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(2)} MB`;
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
}

function LocalModelPicker({
  modelType,
  version,
  onImport,
  busy,
}: {
  modelType: CreatorModelType;
  version?: CreatorModelVersion;
  onImport: (item: LocalModelSummary) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<LocalModelSummary[]>([]);
  const [selected, setSelected] = useState<LocalModelSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const category =
    modelType === "Checkpoint"
      ? "checkpoints"
      : modelType === "Diffusion Model"
        ? "diffusion_models"
        : modelType === "LoRA" || modelType === "LyCORIS"
          ? "loras"
          : modelType === "VAE"
            ? "vae"
            : "embeddings";

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    setSelected(null);
  }, [category]);
  useEffect(() => {
    if (!open || !version) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .listLocalModels(debouncedQuery, category)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setSelected((current) =>
            current &&
            response.items.some(
              (item) =>
                item.filename === current.filename &&
                item.category === current.category,
            )
              ? current
              : null,
          );
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setItems([]);
          setSelected(null);
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not browse ComfyUI models",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, debouncedQuery, open, version]);

  return (
    <section className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-[var(--ink)]">
            IMPORT FROM LOCAL COMFYUI
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
            Select files directly from the configured <span className="font-mono text-[var(--accent)]">{category}</span> enclave.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={busy || !version}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[11px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
        >
          <Search className="h-3.5 w-3.5" />
          {open ? "Close browser" : "Browse ComfyUI"}
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter ${category} by filename…`}
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] text-[var(--ink-faint)] uppercase">
            <span>{query ? "Search results" : "Available files"}</span>
            <span>{loading ? "Scanning…" : `${items.length} discovered`}</span>
          </div>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]"
            >
              {error}. Ensure COMFY_MODEL_ROOT is configured, then retry.
            </div>
          ) : (
            <div
              role="listbox"
              aria-label="ComfyUI model files"
              className="max-h-56 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]"
            >
              {loading && !items.length ? (
                <div className="space-y-2 p-3">
                  <div className="h-9 animate-pulse rounded bg-[var(--surface-soft)]" />
                  <div className="h-9 animate-pulse rounded bg-[var(--surface-soft)]" />
                </div>
              ) : items.length ? (
                items.map((item) => {
                  const active =
                    selected?.category === item.category &&
                    selected.filename === item.filename;
                  return (
                    <button
                      key={`${item.category}:${item.filename}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelected(item)}
                      disabled={busy}
                      className={`flex min-h-10 w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 text-left transition last:border-b-0 ${
                        active
                          ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "hover:bg-[var(--surface-soft)] text-[var(--ink)]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            active
                              ? "bg-[var(--accent)]"
                              : "border border-[var(--line-strong)]"
                          }`}
                        />
                        <span className="min-w-0 truncate font-mono text-[11px]">
                          {item.filename}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
                        {formatBytes(item.size)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center">
                  <FileArchive className="mx-auto h-5 w-5 text-[var(--ink-faint)]" />
                  <p className="mt-2 text-xs text-[var(--ink-soft)]">
                    No matching {category} files found
                  </p>
                </div>
              )}
            </div>
          )}
          {selected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Selected model file
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-[var(--ink)]">
                  {selected.filename}
                </p>
                <p className="text-[10px] text-[var(--ink-faint)]">
                  {selected.category} · {formatBytes(selected.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onImport(selected)}
                disabled={busy}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                {busy ? "Importing…" : "Import to Version"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PreviewCard({
  title,
  type,
  category,
  base,
  tags,
  samples,
  version,
  visibility,
  triggerWords = [],
  fileCount = 0,
  permissions,
  modelId,
}: {
  title: string;
  type: string;
  category: string;
  base: string;
  tags: string[];
  samples: CreatorModelSample[];
  version: string;
  visibility: string;
  triggerWords?: string[];
  fileCount?: number;
  permissions?: CreatorModelPermissions;
  modelId?: string;
}) {
  const [copiedTrigger, setCopiedTrigger] = useState<string | null>(null);

  const copyTrigger = (word: string) => {
    void navigator.clipboard?.writeText(word);
    setCopiedTrigger(word);
    setTimeout(() => setCopiedTrigger(null), 1500);
  };

  const coverUrl = samples[0]?.url;

  return (
    <aside className="w-full space-y-3">
      {/* Top Status Header */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--ink-faint)] uppercase">
            GALLERY PREVIEW // LIVE 1:1 RENDERING
          </span>
        </div>
        <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
          {visibility}
        </span>
      </div>

      {/* 1:1 Canonical Aspect-[3/4] Gallery Card */}
      <TensorModelCard
        item={{
          model_id: modelId,
          title: title || "Untitled model",
          model_type: type,
          category: category,
          base_model: base,
          cover_url: coverUrl,
          sample_count: samples.length,
        }}
        isLink={false}
        className="shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
      />

      {/* Adjacent Technical Metadata Card Below the 3:4 Card */}
      <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-4 shadow-lg space-y-3.5">
        {/* Active Trigger Words Cloud */}
        {triggerWords.length > 0 && (
          <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent)]">
                ACTIVE TRIGGER WORDS
              </span>
              <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                Click to copy
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {triggerWords.map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => copyTrigger(word)}
                  className="inline-flex items-center gap-1 rounded border border-[var(--accent)]/30 bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-colors"
                >
                  <Tag className="h-2.5 w-2.5" />
                  <span>{word}</span>
                  {copiedTrigger === word && (
                    <Check className="h-2.5 w-2.5 text-[var(--accent)]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Technical Specs Readout */}
        <div className="grid grid-cols-3 gap-2 border-y border-[var(--line)] py-2.5 text-center">
          <div>
            <div className="font-mono text-xs font-bold text-[var(--ink)]">
              {version || "v1.0"}
            </div>
            <div className="mt-0.5 font-mono text-[9px] tracking-wider text-[var(--ink-faint)] uppercase">
              VERSION
            </div>
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-[var(--ink)]">
              {fileCount}
            </div>
            <div className="mt-0.5 font-mono text-[9px] tracking-wider text-[var(--ink-faint)] uppercase">
              FILES
            </div>
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-[var(--ink)]">
              {samples.length}
            </div>
            <div className="mt-0.5 font-mono text-[9px] tracking-wider text-[var(--ink-faint)] uppercase">
              SAMPLES
            </div>
          </div>
        </div>

        {/* Search tags if any */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Rights Readout */}
        {permissions && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                permissions.commercial
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-[var(--surface-soft)] text-[var(--ink-faint)]"
              }`}
            >
              {permissions.commercial ? "COMMERCIAL ALLOWED" : "NON-COMMERCIAL"}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                permissions.remix
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "bg-[var(--surface-soft)] text-[var(--ink-faint)]"
              }`}
            >
              {permissions.remix ? "REMIX OK" : "NO REMIX"}
            </span>
            {permissions.credit_required && (
              <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[var(--ink-soft)]">
                CREDIT REQ.
              </span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

const initialCompatibility: CreatorModelCompatibility = {
  base_model: "Stable Diffusion XL (SDXL)",
  base_model_id: null,
  base_version_id: null,
  base_file_id: null,
  vae: null,
  text_encoder: null,
  clip_type: null,
  parent_model: null,
};
const initialGeneration: CreatorModelGeneration = {
  trigger_words: [],
  sampler: "DPM++ 2M Karras",
  steps_min: 20,
  steps_max: 30,
  cfg_min: 3.5,
  cfg_max: 7,
  clip_skip: 1,
  prompt: "",
  negative_prompt: "",
};
const initialPermissions: CreatorModelPermissions = {
  commercial: true,
  remix: false,
  generation_services: true,
  credit_required: true,
};

const navSections = [
  { id: "sec-identity", num: "01", label: "IDENTITY & BASE" },
  { id: "sec-generation", num: "02", label: "PRESETS & TRIGGERS" },
  { id: "sec-files", num: "03", label: "FILES & VERSIONS" },
  { id: "sec-samples", num: "04", label: "SHOWCASE SAMPLES" },
  { id: "sec-access", num: "05", label: "ACCESS & RIGHTS" },
];

export default function ModelsPage() {
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
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    item: string;
    confirm: () => void;
  } | null>(null);
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);

  const selectedVersion = useMemo(
    () =>
      model?.versions.find((item) => item.version_id === selectedVersionId) ??
      model?.versions[0],
    [model, selectedVersionId],
  );
  const samples = selectedVersion?.samples ?? [];
  const versions = model?.versions ?? [];

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };
  const changed =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  const applyModel = (value: CreatorModel) => {
    setModel(value);
    setTitle(value.title);
    setCategory(value.category);
    setType(value.model_type);
    setTags(value.tags);
    setCompatibility(value.compatibility);
    setGeneration(value.generation);
    setPermissions(value.permissions);
    setVisibility(value.visibility);
    setSelectedVersionId((current) =>
      value.versions.some((item) => item.version_id === current)
        ? current
        : (value.versions[0]?.version_id ?? null),
    );
  };

  useEffect(() => {
    let cancelled = false;
    api
      .listCreatorModels()
      .then(async (items) => {
        const values = await Promise.all(
          items.map((item) => api.getCreatorModel(item.model_id)),
        );
        if (!cancelled) {
          setModels(values);
          if (values[0]) {
            applyModel(values[0]);
            setDirty(false);
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setBackendError(
            error instanceof Error
              ? error.message
              : "Could not load saved models",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  const createNewModel = () => {
    setModel(null);
    setTitle("Untitled model");
    setCategory("General");
    setType("Checkpoint");
    setTags([]);
    setCompatibility(initialCompatibility);
    setGeneration(initialGeneration);
    setPermissions(initialPermissions);
    setVisibility("Private");
    setSelectedVersionId(null);
    setDirty(true);
    setBackendError(null);
  };

  const importLocalFile = async (item: LocalModelSummary) => {
    const saved = await ensureModel();
    const versionId = selectedVersionId ?? saved?.versions[0]?.version_id;
    if (!saved || !versionId) return;
    setSaving(true);
    setBackendError(null);
    try {
      const value = await api.importLocalModelFile(
        saved.model_id,
        versionId,
        item.category,
        item.filename,
      );
      applyModel(value);
      setModels((current) =>
        current.map((entry) =>
          entry.model_id === value.model_id ? value : entry,
        ),
      );
      setDirty(false);
      notify("Local ComfyUI model imported");
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Could not import local model",
      );
    } finally {
      setSaving(false);
    }
  };

  const requestConfirmation = (
    title: string,
    item: string,
    confirm: () => void,
  ) => {
    confirmationTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setConfirmation({ title, item, confirm });
  };
  const dismissConfirmation = () => {
    setConfirmation(null);
    window.setTimeout(() => confirmationTriggerRef.current?.focus(), 0);
  };
  useEffect(() => {
    if (!confirmation) return;
    cancelConfirmationRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") dismissConfirmation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmation]);

  const loadModel = async (modelId: string) => {
    setSaving(true);
    try {
      const value = await api.getCreatorModel(modelId);
      applyModel(value);
      setDirty(false);
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Could not load model",
      );
    } finally {
      setSaving(false);
    }
  };

  const switchModel = async (modelId: string) => {
    if (dirty) {
      requestConfirmation(
        "Discard changes",
        models.find((item) => item.model_id === modelId)?.title ?? "this model",
        () => void loadModel(modelId),
      );
      return;
    }
    await loadModel(modelId);
  };

  const payload = (): CreatorModelPayload => ({
    title,
    category,
    model_type: type,
    tags,
    compatibility,
    generation: {
      ...generation,
      trigger_words: type === "LoRA" ? generation.trigger_words : [],
    },
    permissions,
    visibility,
  });

  const saveModel = async (publish = false): Promise<CreatorModel | null> => {
    setSaving(true);
    setBackendError(null);
    try {
      const saved = model
        ? await api.updateCreatorModel(model.model_id, payload())
        : await api.createCreatorModel(payload());
      const published = publish
        ? await api.publishCreatorModel(saved.model_id, visibility)
        : saved;
      setModels((current) =>
        current.some((item) => item.model_id === published.model_id)
          ? current.map((item) =>
              item.model_id === published.model_id ? published : item,
            )
          : [published, ...current],
      );
      applyModel(published);
      setDirty(false);
      notify(publish ? `Model ${visibility.toLowerCase()}` : "Draft saved");
      return published;
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Could not save model",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const ensureModel = async (): Promise<CreatorModel | null> =>
    model && !dirty ? model : saveModel(false);

  const runMutation = async (
    action: () => Promise<CreatorModel>,
    message: string,
  ) => {
    setSaving(true);
    setBackendError(null);
    try {
      const value = await action();
      applyModel(value);
      setDirty(false);
      notify(message);
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Could not update model",
      );
    } finally {
      setSaving(false);
    }
  };

  const createVersion = async () => {
    const saved = await ensureModel();
    if (!saved) return;
    const next = `v${saved.versions.length + 1}.0`;
    setSaving(true);
    try {
      await api.createModelVersion(saved.model_id, next);
      const refreshed = await api.getCreatorModel(saved.model_id);
      applyModel(refreshed);
      setDirty(false);
      notify(`Created ${next}`);
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Could not create version",
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    const saved = await ensureModel();
    const versionId = selectedVersionId ?? saved?.versions[0]?.version_id;
    if (!saved || !versionId) return;
    setSaving(true);
    try {
      const value = await api.uploadModelFile(saved.model_id, versionId, file);
      applyModel(value);
      setDirty(false);
      notify("Model file uploaded");
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Could not upload model file",
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadSample = async (file: File) => {
    const saved = await ensureModel();
    const versionId = selectedVersionId ?? saved?.versions[0]?.version_id;
    if (!saved || !versionId) return;
    setSaving(true);
    try {
      const value = await api.uploadModelSample(
        saved.model_id,
        versionId,
        file,
        { role: "showcase" },
      );
      applyModel(value);
      setDirty(false);
      notify("Showcase sample uploaded");
    } catch (error) {
      setBackendError(
        error instanceof Error ? error.message : "Could not upload sample",
      );
    } finally {
      setSaving(false);
    }
  };

  const patchFile = async (file: CreatorModelFile) => {
    const saved = await ensureModel();
    if (!saved || !selectedVersionId) return;
    await runMutation(
      () =>
        api.patchModelFile(saved.model_id, selectedVersionId, file.file_id, {
          visible: !file.visible,
        }),
      "File visibility updated",
    );
  };

  const deleteFile = (file: CreatorModelFile) => {
    if (!model || !selectedVersion) return;
    requestConfirmation(
      "Delete file",
      file.filename,
      () =>
        void (async () => {
          const saved = await ensureModel();
          if (!saved || !selectedVersionId) return;
          setSaving(true);
          try {
            await api.deleteModelFile(
              saved.model_id,
              selectedVersionId,
              file.file_id,
            );
            const refreshed = await api.getCreatorModel(saved.model_id);
            applyModel(refreshed);
            notify("Model file deleted");
          } catch (error) {
            setBackendError(
              error instanceof Error
                ? error.message
                : "Could not delete model file",
            );
          } finally {
            setSaving(false);
          }
        })(),
    );
  };

  const deleteSample = (sample: CreatorModelSample) => {
    if (!model || !selectedVersion) return;
    requestConfirmation(
      "Delete sample",
      sample.filename,
      () =>
        void (async () => {
          const saved = await ensureModel();
          if (!saved || !selectedVersionId) return;
          setSaving(true);
          try {
            await api.deleteModelSample(
              saved.model_id,
              selectedVersionId,
              sample.sample_id,
            );
            const refreshed = await api.getCreatorModel(saved.model_id);
            applyModel(refreshed);
            notify("Sample deleted");
          } catch (error) {
            setBackendError(
              error instanceof Error
                ? error.message
                : "Could not delete sample",
            );
          } finally {
            setSaving(false);
          }
        })(),
    );
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const updateGeneration = (patch: Partial<CreatorModelGeneration>) => {
    setGeneration({ ...generation, ...patch });
    setDirty(true);
  };

  if (loading)
    return (
      <main
        id="main-content"
        className="workspace-scroll h-full p-5 sm:p-7"
        aria-busy="true"
        aria-label="Loading Model Studio"
      >
        <div className="mx-auto max-w-[1720px]">
          <div className="h-14 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]" />
          <div className="mt-6 flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-[40%] h-[500px] animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]" />
            <div className="w-full lg:w-[60%] space-y-5">
              <div className="h-64 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]" />
              <div className="h-64 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]" />
            </div>
          </div>
        </div>
      </main>
    );

  return (
    <main
      id="main-content"
      className="workspace-scroll h-full min-h-0 bg-[var(--ground)]"
    >
      {backendError && (
        <div
          role="alert"
          className="border-b border-[var(--danger)]/30 bg-[var(--danger)]/10 px-5 py-2.5 font-mono text-xs text-[var(--danger)]"
        >
          {backendError}
        </div>
      )}

      {/* 1. Header & Model Switcher Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--ground)]/90 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4">
          {/* Left: Brand Identity & Model Switcher */}
          <div className="flex items-center gap-4 min-w-0">
            <BrandLogo
              size="sm"
              subtitle="MODEL STUDIO // WORKSTATION"
              href="/models"
            />
            <div className="hidden h-5 w-px bg-[var(--line-strong)] sm:block" />

            <div className="flex items-center gap-2 min-w-0">
              {models.length > 0 ? (
                <div className="relative min-w-0">
                  <select
                    aria-label="Select creator model"
                    value={model?.model_id ?? ""}
                    onChange={(event) => void switchModel(event.target.value)}
                    disabled={saving}
                    className="workspace-field h-8 max-w-[18rem] appearance-none pr-8 pl-3 font-mono text-xs outline-none bg-[var(--surface-sunken)] border border-[var(--line)] rounded-lg text-[var(--ink)] cursor-pointer"
                  >
                    {models.map((item) => (
                      <option key={item.model_id} value={item.model_id}>
                        {item.title} [{item.model_type}]
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[var(--ink-faint)]" />
                </div>
              ) : (
                <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                  No saved models
                </span>
              )}

              <button
                type="button"
                onClick={createNewModel}
                disabled={saving}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[11px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Model</span>
              </button>
            </div>
          </div>

          {/* Right: Server Persistence Status & Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1.5 font-mono text-[10px] text-[var(--ink-faint)] uppercase tracking-wider md:flex">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  saving
                    ? "bg-[var(--accent)] animate-ping"
                    : dirty
                      ? "bg-amber-400"
                      : "bg-[var(--accent)]"
                }`}
              />
              <span>
                {saving
                  ? "SYNCING…"
                  : dirty
                    ? "UNSAVED CHANGES"
                    : "SERVER PERSISTENCE"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void saveModel(false)}
              disabled={!dirty || saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {saving ? "Saving…" : "Save Draft"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void saveModel(true)}
              disabled={saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_16px_rgba(213,240,111,0.2)] disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Publish ⚡</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Dual-Column Studio Workstation Geometry */}
      <div className="mx-auto max-w-[1720px] px-4 sm:px-6 py-6 pb-28">
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* LEFT COLUMN: 40% Width Sticky Preview Card */}
          <div className="w-full lg:w-[40%] lg:max-w-[420px] xl:max-w-[440px] shrink-0 lg:sticky lg:top-20 z-20">
            <PreviewCard
              title={title}
              type={type}
              category={category}
              base={compatibility.base_model}
              tags={tags}
              samples={samples}
              version={selectedVersion?.name ?? "v1.0"}
              visibility={visibility}
              triggerWords={generation.trigger_words}
              fileCount={selectedVersion?.files.length ?? 0}
              permissions={permissions}
              modelId={model?.model_id}
            />
          </div>

          {/* RIGHT COLUMN: 60% Width Structured Form Panels */}
          <div className="w-full lg:flex-1 min-w-0">
            {/* Quick Navigation Jump Bar */}
            <nav
              aria-label="Studio section quick jump"
              className="sticky top-16 z-10 mb-5 flex flex-wrap gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)]/95 p-1.5 backdrop-blur-md shadow-lg"
            >
              {navSections.map(({ id, num, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => scrollToSection(id)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider uppercase text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)] transition-colors"
                >
                  <span className="text-[var(--accent)]">{num}</span>
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            {/* 01 // BASIC IDENTITY & BASE MODEL */}
            <section
              id="sec-identity"
              className="border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl p-5 mb-5 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            >
              <SectionCardHeader
                number="01"
                title="BASIC IDENTITY & BASE MODEL"
                subtitle="Core nomenclature, category classification, and architecture matrix."
                icon={Sparkles}
              />

              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Field label="Model title">
                      <input
                        className={inputClass}
                        value={title}
                        onChange={(event) => changed(setTitle)(event.target.value)}
                        disabled={saving}
                        placeholder="e.g. Cyberpunk Cinematic LoRA v1.0"
                      />
                    </Field>
                  </div>

                  <Field label="Category">
                    <div className="relative">
                      <select
                        className={selectClass}
                        value={category}
                        onChange={(event) =>
                          changed(setCategory)(
                            event.target.value as CreatorModelCategory,
                          )
                        }
                        disabled={saving}
                      >
                        {[
                          "Character",
                          "Style",
                          "Concept",
                          "Pose",
                          "Clothing",
                          "General",
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
                    </div>
                  </Field>

                  <Field label="Model type">
                    <div className="relative">
                      <select
                        className={selectClass}
                        value={type}
                        onChange={(event) => {
                          const nextType = event.target
                            .value as CreatorModelType;
                          setType(nextType);
                          setCompatibility((current) => ({
                            ...current,
                            base_model_id:
                              nextType === "LoRA" || nextType === "LyCORIS"
                                ? current.base_model_id
                                : null,
                            base_version_id:
                              nextType === "LoRA" || nextType === "LyCORIS"
                                ? current.base_version_id
                                : null,
                            base_file_id:
                              nextType === "LoRA" || nextType === "LyCORIS"
                                ? current.base_file_id
                                : null,
                          }));
                          setDirty(true);
                        }}
                        disabled={saving}
                      >
                        {[
                          "Checkpoint",
                          "Diffusion Model",
                          "LoRA",
                          "LyCORIS",
                          "VAE",
                          "Embedding",
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
                    </div>
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Search tags">
                      <TagEditor
                        tags={tags}
                        onChange={changed(setTags)}
                        placeholder="portrait, cinematic, 8k, cyberpunk"
                      />
                    </Field>
                  </div>
                </div>

                <CompatibilityFields
                  compatibility={compatibility}
                  setCompatibility={changed(setCompatibility)}
                  disabled={saving}
                  modelType={type}
                />

                <div className="pt-4 border-t border-[var(--line)]">
                  <Field label="Cover media upload">
                    <MediaDropzone
                      accept="image/*,video/*,.gif"
                      label="Drop primary showcase cover image or short video"
                      onFiles={(files) => files.forEach(uploadSample)}
                      disabled={saving}
                    />
                  </Field>
                </div>
              </div>
            </section>

            {/* 02 // INFERENCE PRESETS & TRIGGERS */}
            <section
              id="sec-generation"
              className="border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl p-5 mb-5 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            >
              <SectionCardHeader
                number="02"
                title="INFERENCE PRESETS & TRIGGERS"
                subtitle="Recommended hyperparameters, activation keywords, and prompt defaults."
                icon={Zap}
              />

              <div className="space-y-4">
                {type === "LoRA" && (
                  <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 space-y-2">
                    <Field
                      label="LoRA Trigger Words"
                      helper="Activation keywords that prompt the neural net to manifest the trained concepts."
                    >
                      <TagEditor
                        tags={generation.trigger_words}
                        onChange={(trigger_words) =>
                          updateGeneration({ trigger_words })
                        }
                        placeholder="Add activation token (e.g. cbrpnk_style)"
                      />
                    </Field>
                    <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-[var(--accent)]">
                      <GripVertical className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Ordering guideline: Place the primary subject trigger token first.
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Preferred sampler">
                    <input
                      className={inputClass}
                      value={generation.sampler}
                      onChange={(event) =>
                        updateGeneration({ sampler: event.target.value })
                      }
                      disabled={saving}
                    />
                  </Field>

                  <Field label="Clip skip">
                    <div className="relative">
                      <select
                        className={selectClass}
                        value={generation.clip_skip}
                        onChange={(event) =>
                          updateGeneration({
                            clip_skip: Number(event.target.value),
                          })
                        }
                        disabled={saving}
                      >
                        <option value={1}>1 (Standard)</option>
                        <option value={2}>2 (Anime / NovelAI layer)</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--ink-faint)]" />
                    </div>
                  </Field>

                  <Field label="Recommended steps range">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className={inputClass}
                        value={generation.steps_min}
                        onChange={(event) =>
                          updateGeneration({
                            steps_min: Number(event.target.value),
                          })
                        }
                        disabled={saving}
                      />
                      <span className="font-mono text-xs text-[var(--ink-faint)]">
                        to
                      </span>
                      <input
                        type="number"
                        className={inputClass}
                        value={generation.steps_max}
                        onChange={(event) =>
                          updateGeneration({
                            steps_max: Number(event.target.value),
                          })
                        }
                        disabled={saving}
                      />
                    </div>
                  </Field>

                  <Field label="CFG scale range">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        className={inputClass}
                        value={generation.cfg_min}
                        onChange={(event) =>
                          updateGeneration({
                            cfg_min: Number(event.target.value),
                          })
                        }
                        disabled={saving}
                      />
                      <span className="font-mono text-xs text-[var(--ink-faint)]">
                        to
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        className={inputClass}
                        value={generation.cfg_max}
                        onChange={(event) =>
                          updateGeneration({
                            cfg_max: Number(event.target.value),
                          })
                        }
                        disabled={saving}
                      />
                    </div>
                  </Field>
                </div>

                <div className="pt-4 border-t border-[var(--line)] space-y-4">
                  <Field label="Default recommended prompt template">
                    <textarea
                      className="workspace-field min-h-[96px] w-full resize-y p-3 font-mono text-xs leading-5 outline-none bg-[var(--surface-sunken)] border border-[var(--line)] rounded-lg text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors"
                      value={generation.prompt}
                      onChange={(event) =>
                        updateGeneration({ prompt: event.target.value })
                      }
                      disabled={saving}
                      placeholder="e.g. masterpiece, cinematic portrait, detailed lighting..."
                    />
                  </Field>

                  <Field label="Default negative prompt template">
                    <textarea
                      className="workspace-field min-h-[80px] w-full resize-y p-3 font-mono text-xs leading-5 outline-none bg-[var(--surface-sunken)] border border-[var(--line)] rounded-lg text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors"
                      value={generation.negative_prompt}
                      onChange={(event) =>
                        updateGeneration({
                          negative_prompt: event.target.value,
                        })
                      }
                      disabled={saving}
                      placeholder="e.g. lowres, bad anatomy, blur, watermark..."
                    />
                  </Field>
                </div>
              </div>
            </section>

            {/* 03 // MODEL FILES & VERSIONS */}
            <section
              id="sec-files"
              className="border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl p-5 mb-5 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            >
              <SectionCardHeader
                number="03"
                title="MODEL FILES & VERSIONS"
                subtitle="Weight binaries (.safetensors, .gguf), version branching, and ComfyUI imports."
                icon={Archive}
                badge={selectedVersion?.files.length ?? 0}
              />

              {/* Version Selector Tabs & Add Version Action */}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                    RELEASES:
                  </span>
                  {versions.length ? (
                    versions.map((item) => (
                      <button
                        key={item.version_id}
                        type="button"
                        onClick={() => setSelectedVersionId(item.version_id)}
                        className={`rounded-lg border px-3 py-1 font-mono text-xs font-semibold transition-colors ${
                          selectedVersion?.version_id === item.version_id
                            ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                            : "border-[var(--line)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {item.name}
                      </button>
                    ))
                  ) : (
                    <span className="font-mono text-xs text-[var(--ink-faint)]">
                      Save model to create first version
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={createVersion}
                    disabled={saving}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Version</span>
                  </button>

                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors">
                    <input
                      type="file"
                      accept=".safetensors,.ckpt,.pt,.pth,.bin,.gguf"
                      className="sr-only"
                      disabled={saving || !selectedVersion}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadFile(file);
                        event.target.value = "";
                      }}
                    />
                    <CloudUpload className="h-3.5 w-3.5" />
                    <span>Upload Binary</span>
                  </label>
                </div>
              </div>

              {/* Local ComfyUI Import Dialog Trigger */}
              <LocalModelPicker
                modelType={type}
                version={selectedVersion}
                onImport={importLocalFile}
                busy={saving}
              />

              {/* Model Files Table */}
              <div className="mt-5 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)]">
                {!selectedVersion?.files.length ? (
                  <div className="px-5 py-8 text-center font-mono text-xs text-[var(--ink-faint)]">
                    No binaries uploaded for {selectedVersion?.name ?? "this version"}. Upload safetensors or import from ComfyUI above.
                  </div>
                ) : (
                  <>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead className="border-b border-[var(--line)] bg-[var(--surface)] font-mono text-[10px] text-[var(--ink-faint)] uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-2.5">FILE NAME</th>
                            <th className="px-3 py-2.5">SIZE</th>
                            <th className="px-3 py-2.5">SHA256 HASH</th>
                            <th className="px-3 py-2.5">PRECISION</th>
                            <th className="px-4 py-2.5 text-right">VISIBILITY</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line)]">
                          {selectedVersion.files.map((file) => (
                            <tr
                              key={file.file_id}
                              className="hover:bg-[var(--surface-soft)] transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <FileArchive className="h-4 w-4 text-[var(--accent)] shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-mono font-semibold text-[var(--ink)] truncate max-w-[200px]">
                                      {file.filename}
                                    </div>
                                    <a
                                      href={file.download_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-mono text-[10px] text-[var(--accent)] hover:underline"
                                    >
                                      Download
                                    </a>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 font-mono text-xs tabular-nums text-[var(--ink-soft)]">
                                {formatBytes(file.size)}
                              </td>
                              <td className="px-3 py-3 font-mono text-[11px] text-[var(--ink-faint)]">
                                {file.sha256.slice(0, 10)}…
                                <button
                                  type="button"
                                  aria-label={`Copy hash for ${file.filename}`}
                                  onClick={() =>
                                    void navigator.clipboard?.writeText(
                                      file.sha256,
                                    )
                                  }
                                  className="ml-1.5 hover:text-[var(--accent)]"
                                >
                                  <Copy className="inline h-3 w-3" />
                                </button>
                              </td>
                              <td className="px-3 py-3 font-mono text-[11px]">
                                <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[var(--ink-soft)]">
                                  {file.precision}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-3">
                                  <Toggle
                                    label={`Toggle visibility for ${file.filename}`}
                                    checked={file.visible}
                                    onChange={() => patchFile(file)}
                                    disabled={saving}
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Delete ${file.filename}`}
                                    onClick={() => deleteFile(file)}
                                    disabled={saving}
                                    className="text-[var(--ink-faint)] hover:text-[var(--danger)] transition-colors disabled:opacity-40"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile File View */}
                    <div className="divide-y divide-[var(--line)] md:hidden">
                      {selectedVersion.files.map((file) => (
                        <div key={file.file_id} className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold text-[var(--ink)] truncate">
                              {file.filename}
                            </span>
                            <button
                              type="button"
                              aria-label={`Delete ${file.filename}`}
                              onClick={() => deleteFile(file)}
                              disabled={saving}
                              className="text-[var(--ink-faint)] hover:text-[var(--danger)]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[var(--ink-faint)] font-mono">
                            <span>
                              {formatBytes(file.size)} · {file.precision}
                            </span>
                            <div className="flex items-center gap-2">
                              <span>Visible</span>
                              <Toggle
                                label={`Toggle visibility for ${file.filename}`}
                                checked={file.visible}
                                onChange={() => patchFile(file)}
                                disabled={saving}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 04 // SHOWCASE SAMPLES & PROMPT METADATA */}
            <section
              id="sec-samples"
              className="border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl p-5 mb-5 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            >
              <SectionCardHeader
                number="04"
                title="SHOWCASE SAMPLES & PROMPT METADATA"
                subtitle="Visual output gallery and embedded PNG generation parameters."
                icon={ImagePlus}
                badge={samples.length}
              />

              <div className="space-y-4">
                {samples.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {samples.map((item) => (
                      <div
                        key={item.sample_id}
                        className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)]"
                      >
                        {item.kind === "video" ? (
                          <video
                            src={item.url}
                            controls
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={item.url}
                            alt={item.filename}
                            className="h-full w-full object-cover"
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[var(--ground)]/90 backdrop-blur-sm px-2.5 py-1.5 border-t border-[var(--line)]">
                          <span className="truncate font-mono text-[10px] text-[var(--ink)]">
                            {item.filename}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${item.filename}`}
                            onClick={() => deleteSample(item)}
                            disabled={saving}
                            className="text-[var(--ink-faint)] hover:text-[var(--danger)] transition-colors ml-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--line-strong)] p-6 text-center font-mono text-xs text-[var(--ink-faint)]">
                    No showcase samples uploaded yet. Upload sample renders below.
                  </div>
                )}

                <MediaDropzone
                  accept="image/*,video/*,.gif"
                  label="Add showcase render images or generation videos"
                  onFiles={(files) => files.forEach(uploadSample)}
                  disabled={saving}
                />

                <div className="pt-4 border-t border-[var(--line)]">
                  <div className="flex items-center gap-2 mb-3">
                    <FileImage className="h-4 w-4 text-[var(--accent)]" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      PNG INFO METADATA
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                      <div className="font-mono text-[10px] text-[var(--ink-faint)] uppercase">
                        Active Sampler Profile
                      </div>
                      <div className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {generation.sampler} · {generation.steps_min}-{generation.steps_max} steps
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
                      <div className="font-mono text-[10px] text-[var(--ink-faint)] uppercase">
                        Showcase Renders Count
                      </div>
                      <div className="mt-1 font-mono text-xs font-semibold text-[var(--ink)]">
                        {samples.length} sample media items linked
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 05 // ACCESS RIGHTS & DISTRIBUTION */}
            <section
              id="sec-access"
              className="border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl p-5 mb-5 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            >
              <SectionCardHeader
                number="05"
                title="ACCESS RIGHTS & DISTRIBUTION"
                subtitle="Model discovery visibility, commercial licensing, and redistribution rules."
                icon={ShieldCheck}
              />

              <div className="space-y-6">
                <div>
                  <label className={labelClass}>Publishing Visibility</label>
                  <div className="grid gap-3 sm:grid-cols-3 mt-2">
                    {(["Public", "Unlisted", "Private"] as const).map(
                      (item) => (
                        <button
                          type="button"
                          key={item}
                          onClick={() => changed(setVisibility)(item)}
                          disabled={saving}
                          className={`rounded-lg border p-3.5 text-left transition disabled:opacity-40 ${
                            visibility === item
                              ? "border-[var(--accent)] bg-[var(--accent)]/10"
                              : "border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)]"
                          }`}
                        >
                          <div
                            className={`font-mono text-xs font-bold uppercase tracking-wider ${
                              visibility === item
                                ? "text-[var(--accent)]"
                                : "text-[var(--ink)]"
                            }`}
                          >
                            {item}
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-[var(--ink-faint)]">
                            {item === "Public"
                              ? "Visible in discovery and model feed"
                              : item === "Unlisted"
                                ? "Only creators with direct URL access"
                                : "Private workspace enclave only"}
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--line)]">
                  <label className={labelClass}>
                    Commercial & Usage Permissions
                  </label>
                  <div className="divide-y divide-[var(--line)] mt-2">
                    {[
                      {
                        key: "commercial" as const,
                        label: "Commercial use outputs",
                        desc: "Permit creators to use model outputs in paid commercial work.",
                      },
                      {
                        key: "remix" as const,
                        label: "Re-upload & Remix",
                        desc: "Allow modified weights, fine-tunes, or merges to be published.",
                      },
                      {
                        key: "generation_services" as const,
                        label: "Hosted Generation Services",
                        desc: "Permit hosted generation SaaS APIs to run this model.",
                      },
                      {
                        key: "credit_required" as const,
                        label: "Creator Profile Attribution",
                        desc: "Require creators to attribute your SoloTensor handle.",
                      },
                    ].map(({ key, label, desc }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
                      >
                        <div>
                          <div className="font-mono text-xs font-semibold text-[var(--ink)]">
                            {label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                            {desc}
                          </div>
                        </div>
                        <Toggle
                          label={label}
                          checked={permissions[key]}
                          disabled={saving}
                          onChange={() =>
                            changed(setPermissions)({
                              ...permissions,
                              [key]: !permissions[key],
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Floating Action Bar for Unsaved Changes */}
      {dirty && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-raised)]/95 px-4 py-3 shadow-[0_16px_48px_rgba(0,0,0,0.8)] backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-ping" />
              <div className="font-mono text-xs font-bold text-[var(--ink)] uppercase">
                UNSAVED WORKSTATION EDITS
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveModel(false)}
                disabled={saving}
                className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => void saveModel(true)}
                disabled={saving}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
              >
                Publish ⚡
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal */}
      {confirmation && (
        <ConfirmationDialog
          title={confirmation.title}
          item={confirmation.item}
          cancelRef={cancelConfirmationRef}
          onCancel={dismissConfirmation}
          onConfirm={() => {
            const action = confirmation.confirm;
            setConfirmation(null);
            action();
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed right-5 top-20 z-50 flex items-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--surface-raised)] px-4 py-3 font-mono text-xs font-bold text-[var(--accent)] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md animate-in fade-in zoom-in-95"
        >
          <Check className="h-4 w-4" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
