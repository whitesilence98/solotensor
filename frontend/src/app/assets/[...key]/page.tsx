"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, ExternalLink, ImageIcon } from "lucide-react";
import { api, assetTypeOf, type GalleryItem } from "@/lib/api";
import { formatBytes } from "@/components/AssetCard";
import { VideoResultPreview } from "@/components/VideoResultPreview";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

function displayValue(value: string | number | null | undefined): string | number {
  return value === null || value === undefined || value === "" ? "Not recorded" : value;
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  const shown = displayValue(value);

  return (
    <div className="min-w-0 border-t border-[#292d28] py-2.5 [@media(max-height:650px)]:py-0.5">
      <dt className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#6f716d]">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[11px] leading-4 text-[#deddd6]" title={String(shown)}>{shown}</dd>
    </div>
  );
}

type InspectorView = "prompt" | "generation" | "file";
type MobileView = "preview" | "details";

const mobileTabs: MobileView[] = ["preview", "details"];

const inspectorTabs: { id: InspectorView; label: string }[] = [
  { id: "prompt", label: "Prompt" },
  { id: "generation", label: "Generation" },
  { id: "file", label: "File" },
];

function moveTab<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  tabs: readonly T[],
  current: T,
  select: (tab: T) => void,
  idPrefix: string
) {
  const index = tabs.indexOf(current);
  let nextIndex: number;

  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (index + 1) % tabs.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (index - 1 + tabs.length) % tabs.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = tabs.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  const next = tabs[nextIndex];
  select(next);
  requestAnimationFrame(() => document.getElementById(`${idPrefix}-${next}`)?.focus());
}

export default function AssetDetailPage() {
  const params = useParams<{ key: string[] }>();
  const key = params.key.map(decodeURIComponent).join("/");
  const [asset, setAsset] = useState<GalleryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("preview");
  const [inspectorView, setInspectorView] = useState<InspectorView>("prompt");
  const [promptCopyState, setPromptCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [retryKey, setRetryKey] = useState(0);

  const copyPrompt = async () => {
    if (!asset?.metadata?.prompt) return;

    try {
      await navigator.clipboard.writeText(asset.metadata.prompt);
      setPromptCopyState("copied");
      window.setTimeout(() => setPromptCopyState("idle"), 1600);
    } catch {
      setPromptCopyState("error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setError(null);
    setPromptCopyState("idle");

    api.getAsset(key)
      .then((item) => { if (!cancelled) setAsset(item); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load asset details.");
      });
    return () => { cancelled = true; };
  }, [key, retryKey]);

  const assetType = asset ? assetTypeOf(asset) : null;
  const isVideo = assetType === "video";
  const filename = asset ? basename(asset.key) : "";

  return (
    <main id="main-content" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_34%_20%,rgba(213,240,111,.045),transparent_30rem)]">
      <header className="flex h-12 shrink-0 items-center border-b border-[#292d28] bg-[#0b0c0b]/92 px-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-[96rem] items-center justify-between gap-4">
          <Link href="/assets" className="flex shrink-0 items-center gap-2 text-xs font-semibold text-[#aaa8a1] transition-colors hover:text-[#d5f06f]">
            <ArrowLeft className="h-4 w-4" />Library
          </Link>
          {asset && <span className="max-w-[58vw] truncate font-mono text-[10px] text-[#6f716d]" title={asset.key}>{asset.key}</span>}
        </div>
      </header>

      {asset && !error && (
        <div className="grid h-11 shrink-0 grid-cols-2 border-b border-[#292d28] px-3 md:hidden" role="tablist" aria-label="Asset view">
          {mobileTabs.map((view) => (
            <button
              id={`asset-view-tab-${view}`}
              key={view}
              type="button"
              role="tab"
              tabIndex={mobileView === view ? 0 : -1}
              aria-selected={mobileView === view}
              aria-controls={`asset-view-panel-${view}`}
              onClick={() => setMobileView(view)}
              onKeyDown={(event) => moveTab(event, mobileTabs, mobileView, setMobileView, "asset-view-tab")}
              className={`relative text-xs font-semibold capitalize transition-colors ${mobileView === view ? "text-[#f2f0e9] after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-[#d5f06f]" : "text-[#6f716d] hover:text-[#aaa8a1]"}`}
            >
              {view}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <section className="grid min-h-0 flex-1 place-items-center px-5 text-center" role="alert">
          <div>
            <ImageIcon className="mx-auto h-8 w-8 text-[#ef8c79]" />
            <h1 className="mt-4 text-2xl font-semibold text-[#f2f0e9]">Asset unavailable</h1>
            <p className="mt-2 text-sm text-[#8a8d85]">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/assets" className="workspace-action-secondary px-3 py-2 text-xs">Back to library</Link>
              <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="workspace-action-primary px-3 py-2 text-xs">Try again</button>
            </div>
          </div>
        </section>
      ) : !asset ? (
        <section className="mx-auto grid h-full min-h-0 w-full max-w-[96rem] flex-1 gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_20rem] md:p-5" aria-label="Loading asset" aria-busy="true">
          <div className="shimmer min-h-0 rounded-[.7rem]" />
          <div className="shimmer hidden min-h-0 rounded-[.7rem] md:block" />
        </section>
      ) : (
        <div className="mx-auto grid h-full min-h-0 w-full max-w-[96rem] flex-1 gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_20rem] md:p-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section
            id="asset-view-panel-preview"
            role="tabpanel"
            aria-labelledby="asset-view-tab-preview"
            className={`${mobileView === "preview" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col gap-2 md:flex`}
          >
            {isVideo ? (
              <VideoResultPreview
                url={asset.url}
                filename={filename}
                ratio={asset.metadata?.aspect_ratio ?? "16:9"}
                bounded
              />
            ) : (
              <>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[.7rem] border border-[#292d28] bg-[#0e100e] p-2 sm:p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.metadata?.prompt || filename} className="h-full max-h-full w-full max-w-full object-contain" />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a href={asset.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 whitespace-nowrap rounded-[.5rem] bg-[#d5f06f] px-3.5 py-2 text-xs font-bold text-[#171b08] transition-colors hover:bg-[#e2f88a] active:scale-[.97]"><ExternalLink className="h-3.5 w-3.5" />Open original</a>
                  <a href={asset.url} download className="inline-flex items-center gap-2 whitespace-nowrap rounded-[.5rem] border border-[#3a4038] px-3.5 py-2 text-xs font-semibold text-[#deddd6] transition-colors hover:bg-[#20231f] active:scale-[.97]"><Download className="h-3.5 w-3.5" />Download</a>
                </div>
              </>
            )}
          </section>

          <aside
            id="asset-view-panel-details"
            role="tabpanel"
            aria-labelledby="asset-view-tab-details"
            className={`${mobileView === "details" ? "flex" : "hidden"} workspace-panel min-h-0 min-w-0 flex-col overflow-hidden p-4 md:flex`}
          >
            <div className="shrink-0">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[.14em] text-[#d5f06f]">{isVideo ? "Video asset" : "Image asset"}</p>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-[-.035em] text-[#f2f0e9]" title={filename}>{filename}</h1>
            </div>

            <div className="mt-4 grid shrink-0 grid-cols-3 border-b border-[#292d28]" role="tablist" aria-label="Asset information">
              {inspectorTabs.map((tab) => (
                <button
                  id={`asset-info-tab-${tab.id}`}
                  key={tab.id}
                  type="button"
                  role="tab"
                  tabIndex={inspectorView === tab.id ? 0 : -1}
                  aria-selected={inspectorView === tab.id}
                  aria-controls={`asset-panel-${tab.id}`}
                  onClick={() => setInspectorView(tab.id)}
                  onKeyDown={(event) => moveTab(event, inspectorTabs.map(({ id }) => id), inspectorView, setInspectorView, "asset-info-tab")}
                  className={`relative pb-2.5 text-[11px] font-semibold transition-colors ${inspectorView === tab.id ? "text-[#f2f0e9] after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-[#d5f06f]" : "text-[#6f716d] hover:text-[#aaa8a1]"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden pt-4">
              {inspectorView === "prompt" && (
                <section id="asset-panel-prompt" role="tabpanel" className="flex h-full min-h-0 flex-col gap-4">
                  {asset.metadata ? (
                    <>
                      <div className="min-h-0 border-l-2 border-[#d5f06f] pl-3">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#6f716d]">Prompt</h2>
                          <button
                            type="button"
                            onClick={copyPrompt}
                            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[#3a4038] px-2 text-[10px] font-semibold text-[#aaa8a1] transition-colors hover:border-[#596052] hover:bg-[#20231f] hover:text-[#f2f0e9] active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d5f06f]"
                            aria-label="Copy prompt to clipboard"
                          >
                            {promptCopyState === "copied" ? <Check className="h-3 w-3 text-[#d5f06f]" /> : <Copy className="h-3 w-3" />}
                            {promptCopyState === "copied" ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="mt-2 overflow-hidden text-sm leading-5 text-[#deddd6] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:9]" title={asset.metadata.prompt}>{asset.metadata.prompt}</p>
                        <span className="sr-only" role="status" aria-live="polite">
                          {promptCopyState === "copied" ? "Prompt copied to clipboard." : promptCopyState === "error" ? "Could not copy the prompt." : ""}
                        </span>
                      </div>
                      {asset.metadata.negative_prompt && (
                        <div className="min-h-0 border-l border-[#3a4038] pl-3">
                          <h2 className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#6f716d]">Excluded</h2>
                          <p className="mt-2 overflow-hidden text-xs leading-5 text-[#aaa8a1] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6]" title={asset.metadata.negative_prompt}>{asset.metadata.negative_prompt}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="grid h-full place-items-center text-center">
                      <p className="max-w-[17rem] text-sm leading-6 text-[#8a8d85]">Generation settings were not recorded for this older asset.</p>
                    </div>
                  )}
                </section>
              )}

              {inspectorView === "generation" && (
                <section id="asset-panel-generation" role="tabpanel" className="h-full min-h-0">
                  {asset.metadata ? (
                    <dl className="grid grid-cols-2 gap-x-4">
                      <Detail label="Format" value={`${displayValue(asset.metadata.format_name)} · ${displayValue(asset.metadata.width)} × ${displayValue(asset.metadata.height)}`} />
                      <Detail label="Seed" value={asset.metadata.seed} />
                      <Detail label="Steps" value={asset.metadata.steps} />
                      <Detail label="Images" value={asset.metadata.image_count ?? 1} />
                      <Detail label="CFG" value={asset.metadata.cfg} />
                      <Detail label="Denoise" value={asset.metadata.denoise} />
                      {asset.metadata.model_filename ? (
                        <>
                          <Detail label="Model" value={asset.metadata.model_title} />
                          <Detail label="Version" value={asset.metadata.model_version} />
                          <Detail label="Type" value={asset.metadata.model_type} />
                          <Detail label="File" value={basename(asset.metadata.model_filename)} />
                        </>
                      ) : (
                        <>
                          <Detail label="Diffusion Model" value={basename(asset.metadata.unet_name ?? "")} />
                          <Detail label="Encoder" value={basename(asset.metadata.clip_name ?? "")} />
                          <Detail label="VAE" value={basename(asset.metadata.vae_name ?? "")} />
                        </>
                      )}
                      <Detail label="Render time" value={`${(asset.metadata.elapsed_ms / 1000).toFixed(1)} s`} />
                      <Detail label="Generated" value={formatDate(asset.metadata.created_at)} />
                      <Detail label="Prompt ID" value={asset.metadata.prompt_id} />
                    </dl>
                  ) : (
                    <div className="grid h-full place-items-center text-center"><p className="text-sm text-[#8a8d85]">No generation data available.</p></div>
                  )}
                </section>
              )}

              {inspectorView === "file" && (
                <section id="asset-panel-file" role="tabpanel" className="h-full min-h-0">
                  <dl className="grid grid-cols-2 gap-x-4">
                    <div className="col-span-2"><Detail label="File" value={filename} /></div>
                    <Detail label="Type" value={assetType ?? "image"} />
                    <Detail label="Size" value={formatBytes(asset.size)} />
                    <div className="col-span-2"><Detail label="Last modified" value={formatDate(asset.last_modified)} /></div>
                    <div className="col-span-2"><Detail label="Storage key" value={asset.key} /></div>
                  </dl>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
