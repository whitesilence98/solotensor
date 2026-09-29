"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, ImageIcon } from "lucide-react";
import { api, type GalleryItem } from "@/lib/api";
import { formatBytes } from "@/components/AssetCard";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-t border-[#292d28] py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#6f716d]">{label}</dt>
      <dd className="mt-1 break-words font-mono text-xs leading-5 text-[#deddd6]">{value}</dd>
    </div>
  );
}

export default function ImageDetailPage() {
  const params = useParams<{ key: string[] }>();
  const key = params.key.map(decodeURIComponent).join("/");
  const [asset, setAsset] = useState<GalleryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getImage(key)
      .then((item) => { if (!cancelled) setAsset(item); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load image details.");
      });
    return () => { cancelled = true; };
  }, [key]);

  return (
    <main id="main-content" className="workspace-scroll h-full min-h-0 flex-1 bg-[radial-gradient(circle_at_34%_20%,rgba(213,240,111,.045),transparent_30rem)]">
      <header className="sticky top-0 z-20 border-b border-[#292d28] bg-[#0b0c0b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/assets" className="flex items-center gap-2 text-xs font-semibold text-[#aaa8a1] transition-colors hover:text-[#d5f06f]">
            <ArrowLeft className="h-4 w-4" />Library
          </Link>
          {asset && <span className="max-w-[50vw] truncate font-mono text-[10px] text-[#6f716d]">{asset.key}</span>}
        </div>
      </header>

      {error ? (
        <section className="grid min-h-[70vh] place-items-center px-5 text-center">
          <div><ImageIcon className="mx-auto h-8 w-8 text-[#ef8c79]" /><h1 className="mt-4 text-2xl font-semibold text-[#f2f0e9]">Image unavailable</h1><p className="mt-2 text-sm text-[#8a8d85]">{error}</p></div>
        </section>
      ) : !asset ? (
        <section className="mx-auto grid min-h-[70vh] max-w-[96rem] gap-5 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem] sm:px-8">
          <div className="shimmer min-h-[32rem] rounded-[.6rem]" /><div className="shimmer min-h-[24rem] rounded-[.6rem]" />
        </section>
      ) : (
        <div className="mx-auto grid max-w-[96rem] gap-8 px-5 pb-20 pt-7 lg:grid-cols-[minmax(0,1fr)_22rem] sm:px-8 sm:pt-10">
          <section>
            <div className="flex min-h-[32rem] items-center justify-center overflow-hidden rounded-[.55rem] border border-[#292d28] bg-[#0e100e] p-3 sm:p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={asset.metadata?.prompt || basename(asset.key)} className="max-h-[78vh] max-w-full object-contain" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={asset.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[.5rem] bg-[#d5f06f] px-4 py-2.5 text-xs font-bold text-[#171b08] transition-all hover:bg-[#e2f88a] active:scale-[.97]"><ExternalLink className="h-3.5 w-3.5" />Open original</a>
              <a href={asset.url} download className="inline-flex items-center gap-2 rounded-[.5rem] border border-[#3a4038] px-4 py-2.5 text-xs font-semibold text-[#deddd6] transition-colors hover:bg-[#20231f]"><Download className="h-3.5 w-3.5" />Download</a>
            </div>
          </section>

          <aside className="self-start lg:sticky lg:top-20">
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#d5f06f]">Generated image</p>
            <h1 className="mt-2 text-3xl font-semibold leading-none tracking-[-.055em] text-[#f2f0e9]">Generation data</h1>

            {asset.metadata ? (
              <>
                <section className="mt-7 border-l-2 border-[#d5f06f] pl-4">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#6f716d]">Prompt</h2>
                  <p className="mt-2 text-sm leading-6 text-[#deddd6]">{asset.metadata.prompt}</p>
                </section>
                {asset.metadata.negative_prompt && <section className="mt-5 border-l border-[#3a4038] pl-4"><h2 className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#6f716d]">Excluded</h2><p className="mt-2 text-sm leading-6 text-[#aaa8a1]">{asset.metadata.negative_prompt}</p></section>}
                <dl className="mt-7">
                  <Detail label="Format" value={`${asset.metadata.format_name} · ${asset.metadata.width} × ${asset.metadata.height}`} />
                  <Detail label="Seed" value={asset.metadata.seed ?? "—"} />
                  <Detail label="Steps" value={asset.metadata.steps ?? "—"} />
                  <Detail label="Images" value={asset.metadata.image_count ?? 1} />
                  <Detail label="CFG" value={asset.metadata.cfg ?? 1} />
                  <Detail label="Denoise" value={asset.metadata.denoise ?? 1} />
                  <Detail label="UNET" value={basename(asset.metadata.unet_name ?? "")} />
                  <Detail label="Encoder" value={basename(asset.metadata.clip_name ?? "")} />
                  <Detail label="VAE" value={basename(asset.metadata.vae_name ?? "")} />
                  <Detail label="Render time" value={`${(asset.metadata.elapsed_ms / 1000).toFixed(1)} s`} />
                  <Detail label="Generated" value={formatDate(asset.metadata.created_at)} />
                  <Detail label="Prompt ID" value={asset.metadata.prompt_id} />
                </dl>
              </>
            ) : (
              <div className="mt-7 border border-[#292d28] bg-[#111311] p-4 text-sm leading-6 text-[#8a8d85]">Generation settings were not recorded for this older image. File details remain available below.</div>
            )}

            <dl className="mt-5">
              <Detail label="File" value={basename(asset.key)} />
              <Detail label="Size" value={formatBytes(asset.size)} />
              <Detail label="Last modified" value={formatDate(asset.last_modified)} />
            </dl>
          </aside>
        </div>
      )}
    </main>
  );
}
