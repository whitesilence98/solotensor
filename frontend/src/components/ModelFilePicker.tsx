"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FolderOpen, Search, X } from "lucide-react";
import { ApiError, api, type InstalledGalleryModel, type LocalModelSummary } from "@/lib/api";
import { type ModelFileCategory, type VaultMeta } from "@/lib/comfy-model-inputs";

type Tab = "comfy" | "vault";

const FIELD =
  "workspace-field w-full px-3 py-2 text-xs outline-none rounded-lg";
const ROW =
  "flex w-full items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)] focus-visible:border-[var(--accent)]";

function isUnconfigured(reason: unknown): boolean {
  if (!(reason instanceof ApiError)) return false;
  return /COMFY_MODEL_ROOT|not configured/i.test(reason.message);
}

export default function ModelFilePicker({
  open,
  category,
  title,
  onSelect,
  onClose,
}: {
  open: boolean;
  category: ModelFileCategory;
  title?: string;
  onSelect: (filename: string, meta?: VaultMeta) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const [tab, setTab] = useState<Tab>("comfy");
  const [query, setQuery] = useState("");
  const [localModels, setLocalModels] = useState<LocalModelSummary[]>([]);
  const [vaultModels, setVaultModels] = useState<InstalledGalleryModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  // Modal lifecycle: showModal on open, restore focus on close/unmount.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const raf = requestAnimationFrame(() =>
      dialog.querySelector<HTMLElement>("button, input, [href], [tabindex]:not([tabindex='-1'])")?.focus(),
    );
    return () => {
      cancelAnimationFrame(raf);
      if (dialog.open) dialog.close();
      openerRef.current?.focus();
    };
  }, [open]);

  // Reset to the ComfyUI tab each time the picker reopens for a category.
  useEffect(() => {
    if (!open) return;
    setTab("comfy");
    setQuery("");
  }, [open, category]);

  // ComfyUI files: debounced search, ignore stale responses.
  useEffect(() => {
    if (!open || tab !== "comfy") return;
    let ignore = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      api
        .listLocalModels(query, category)
        .then((res) => {
          if (ignore) return;
          setLocalModels(res.items ?? []);
          setUnconfigured(false);
        })
        .catch((reason: unknown) => {
          if (ignore) return;
          if (isUnconfigured(reason)) {
            setUnconfigured(true);
            setLocalModels([]);
          } else {
            setError(reason instanceof Error ? reason.message : "Could not load ComfyUI models");
          }
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, query ? 200 : 0);
    return () => {
      ignore = true;
      clearTimeout(timer);
      setLoading(false);
    };
  }, [open, tab, query, category]);

  // Solo vault: load once per open, filter client-side by category.
  useEffect(() => {
    if (!open || tab !== "vault") return;
    let ignore = false;
    setLoading(true);
    setError(null);
    api
      .listSelectableModels()
      .then((items) => {
        if (!ignore) setVaultModels(items);
      })
      .catch((reason: unknown) => {
        if (!ignore) setError(reason instanceof Error ? reason.message : "Could not load the Solo vault");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [open, tab]);

  if (!open) return null;

  const vaultFiltered = vaultModels.filter((m) => m.category === category);
  const needle = query.trim().toLowerCase();
  const vaultVisible = needle
    ? vaultFiltered.filter(
        (m) => m.title.toLowerCase().includes(needle) || m.filename.toLowerCase().includes(needle),
      )
    : vaultFiltered;

  const pick = (filename: string, meta?: VaultMeta) => {
    onSelect(filename, meta);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="workspace-modal !max-w-2xl"
    >
      <div className="workspace-modal-card flex max-h-[80vh] flex-col">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="workspace-kicker mb-2">Model source</div>
            <h2 id={titleId} className="workspace-heading truncate text-xl font-semibold">
              {title ?? "Choose a model file"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="workspace-action-quiet workspace-action-icon -mr-1 -mt-1 shrink-0"
            aria-label="Close model picker"
          >
            <X className="h-4.5 w-4.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-5 flex gap-1" role="tablist" aria-label="Model source">
          {(["comfy", "vault"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                tab === key
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              {key === "comfy" ? "ComfyUI files" : "Solo vault"}
            </button>
          ))}
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "comfy" ? "Search ComfyUI models" : "Search the Solo vault"}
            aria-label="Search model files"
            className={`${FIELD} pl-8 font-mono text-xs`}
          />
        </div>

        <div className="mt-4 min-h-[8rem] flex-1 space-y-2 overflow-y-auto">
          {unconfigured ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-8 text-center">
              <FolderOpen className="h-5 w-5 text-[var(--ink-faint)]" strokeWidth={1.5} />
              <p className="text-xs font-semibold text-[var(--ink)]">ComfyUI model browsing not configured</p>
              <p className="text-[10px] text-[var(--ink-soft)]">
                Set <span className="font-mono">COMFY_MODEL_ROOT</span> on the backend to browse local model folders.
              </p>
            </div>
          ) : error ? (
            <p className="rounded-lg border border-[var(--line)] px-3 py-4 text-xs text-[var(--ink-soft)]">{error}</p>
          ) : loading ? (
            <p className="px-3 py-4 text-xs text-[var(--ink-faint)]">Loading…</p>
          ) : tab === "comfy" ? (
            localModels.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--ink-faint)]">No files in this category.</p>
            ) : (
              localModels.map((model) => (
                <button
                  key={`${model.category}/${model.filename}`}
                  type="button"
                  onClick={() => pick(model.filename)}
                  className={ROW}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--ink)]">{model.filename}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
                    {(model.size / 1024 ** 3).toFixed(1)} GB
                  </span>
                </button>
              ))
            )
          ) : vaultVisible.length === 0 ? (
            <p className="px-3 py-4 text-xs text-[var(--ink-faint)]">No installed vault models in this category.</p>
          ) : (
            vaultVisible.map((model) => (
              <button
                key={`${model.model_id}/${model.version_id}/${model.file_id}`}
                type="button"
                onClick={() =>
                  pick(model.filename, {
                    sourceModelId: model.model_id,
                    sourceVersionId: model.version_id,
                    sourceFileId: model.file_id,
                    sourceFilename: model.filename,
                  })
                }
                className={ROW}
              >
                {model.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- /files media, fixed thumbnail box
                  <img
                    src={model.cover_url}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-9 w-9 shrink-0 rounded bg-[var(--surface)]" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[var(--ink)]">{model.title}</span>
                  <span className="block truncate font-mono text-[10px] text-[var(--ink-soft)]">{model.filename}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </dialog>
  );
}
