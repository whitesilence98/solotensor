"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ImageIcon, Sparkles } from "lucide-react";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import { api, type GalleryItem, type InstalledGalleryModel } from "@/lib/api";

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams<{ key?: string[] | string }>();
  const rawKey = params?.key;
  const key = Array.isArray(rawKey)
    ? rawKey.map(decodeURIComponent).join("/")
    : typeof rawKey === "string"
    ? decodeURIComponent(rawKey)
    : "";

  const [asset, setAsset] = useState<GalleryItem | null>(null);
  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Load asset
  useEffect(() => {
    let cancelled = false;
    if (!key) return;
    setLoading(true);
    setError(null);

    api
      .getAsset(key)
      .then((item) => {
        if (!cancelled) setAsset(item);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load asset details."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, retryKey]);

  // Load selectable models for LoRA / model name resolution
  useEffect(() => {
    let cancelled = false;
    void api
      .listSelectableModels()
      .then((items) => {
        if (!cancelled) setModelOptions(items);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (targetKey: string) => {
    try {
      await api.deleteAsset(targetKey);
      router.push("/assets");
    } catch {
      // Handled gracefully
    }
  };

  const filename = key ? basename(key) : "";

  return (
    <main
      id="main-content"
      className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)]"
    >
      {/* Pinned Top Navigation Breadcrumbs */}
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_90%,transparent)] px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/assets"
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-soft)] transition hover:text-[var(--accent)]"
            title="Return to asset library"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Library</span>
          </Link>
          <span className="text-[var(--ink-faint)] select-none">/</span>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-faint)] transition hover:text-[var(--accent)]"
            title="Return to Studio"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">Studio</span>
          </Link>
        </div>

        <div className="flex items-center gap-2 max-w-[50vw]">
          <span
            className="truncate font-mono text-[10px] text-[var(--ink-faint)]"
            title={key}
          >
            {filename || key}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-center p-3 sm:p-5 lg:p-6 min-h-0">
        {loading ? (
          <div
            className="relative grid min-h-[580px] w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] lg:grid-cols-[minmax(0,1fr)_24.5rem] shadow-2xl"
            aria-busy="true"
            aria-label="Loading asset details"
          >
            <div className="flex min-h-[460px] items-center justify-center bg-[var(--surface-sunken)] p-6">
              <div className="h-48 w-48 rounded-xl shimmer opacity-40" />
            </div>
            <div className="p-5 space-y-4 border-t border-[var(--line)] lg:border-t-0 lg:border-l">
              <div className="h-6 w-3/4 rounded-md shimmer" />
              <div className="h-20 w-full rounded-xl shimmer" />
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="h-12 rounded-xl shimmer" />
                <div className="h-12 rounded-xl shimmer" />
                <div className="h-12 rounded-xl shimmer" />
                <div className="h-12 rounded-xl shimmer" />
              </div>
              <div className="h-11 w-full rounded-xl shimmer mt-4" />
            </div>
          </div>
        ) : error ? (
          <section
            className="mx-auto my-auto flex max-w-md flex-col items-center justify-center p-8 text-center"
            role="alert"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger)]">
              <ImageIcon className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-[var(--ink)]">
              Asset unavailable
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">
              {error}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link
                href="/assets"
                className="workspace-action-secondary px-4 py-2 text-xs"
              >
                Back to library
              </Link>
              <button
                type="button"
                onClick={() => setRetryKey((v) => v + 1)}
                className="workspace-action-primary px-4 py-2 text-xs font-bold"
              >
                Try again
              </button>
            </div>
          </section>
        ) : asset ? (
          <AssetInspectionStage
            mode="standalone"
            asset={asset}
            items={[asset]}
            modelOptions={modelOptions}
            backHref="/assets"
            onDeleteOutput={handleDelete}
          />
        ) : null}
      </div>
    </main>
  );
}
