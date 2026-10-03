"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, HardDriveDownload } from "lucide-react";
import { api, type CreatorModel, type CreatorModelFile } from "@/lib/api";

export default function PublicModelDetailPage({ params }: { params: Promise<{ model_id: string }> }) {
  const router = useRouter();
  const [model, setModel] = useState<CreatorModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void params.then(({ model_id }) => api.getPublicModel(model_id).then((value) => { if (!cancelled) setModel(value); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load model"); }).finally(() => { if (!cancelled) setLoading(false); }));
    return () => { cancelled = true; };
  }, [params]);

  useEffect(() => load(), [load]);

  const install = async (file: CreatorModelFile, versionId: string, useAfterInstall = false) => {
    if (!model) return;
    setInstalling(file.file_id);
    setInstallMessage(null);
    setInstallError(null);
    try {
      const result = await api.installModelFile(model.model_id, versionId, file.file_id);
      if (useAfterInstall) {
        const query = new URLSearchParams({ model_id: model.model_id, version_id: versionId, file_id: file.file_id });
        router.push(`/?${query}`);
        return;
      }
      setInstallMessage(result.already_present ? `${file.filename} is already installed in ComfyUI.` : `${file.filename} installed in ComfyUI.`);
    } catch (reason) { setInstallError(reason instanceof Error ? reason.message : "Could not install model file"); } finally { setInstalling(null); }
  };

  const back = <Link href="/models/gallery" className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--accent)]"><ArrowLeft className="h-4 w-4" /> Back to gallery</Link>;

  if (loading) return <main id="main-content" className="workspace-scroll h-full min-h-0 flex-1"><header className="border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_90%,transparent)]"><div className="mx-auto max-w-[1200px] px-5 py-4 sm:px-7">{back}<div className="shimmer mt-4 h-7 w-56 rounded" /></div></header><div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-7 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px]"><div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="shimmer aspect-[4/5] rounded-lg" />)}</div><div className="shimmer mt-7 h-40 rounded-lg" /></div><div className="shimmer h-72 rounded-xl" /></div></main>;
  if (error) return <main id="main-content" className="workspace-scroll grid h-full min-h-0 flex-1 place-items-center p-8"><div className="max-w-md text-center"><p role="alert" className="text-sm text-[#ef8c79]">{error}</p><div className="mt-5 flex justify-center gap-4">{back}<button type="button" onClick={load} className="rounded-md border border-[#ef8c79]/40 px-3 py-2 text-xs font-semibold text-[#ef8c79]">Retry</button></div></div></main>;
  if (!model) return null;

  return <main id="main-content" className="workspace-scroll h-full min-h-0 flex-1"><header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_90%,transparent)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1200px] items-center gap-4 px-5 py-4 sm:px-7">{back}<div className="border-l border-[var(--line)] pl-4"><p className="workspace-kicker">Public creator model</p><h1 className="text-xl font-semibold text-[var(--ink)]">{model.title}</h1></div></div></header><div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-7 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px]"><section><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{model.versions.flatMap((version) => version.samples).map((sample) => sample.kind === "video" ? <video key={sample.sample_id} src={sample.url} controls className="aspect-[4/5] w-full rounded-lg object-cover" /> : <img key={sample.sample_id} src={sample.url} alt={sample.filename} className="aspect-[4/5] w-full rounded-lg object-cover" />)}</div><div className="mt-7 space-y-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Files and versions</h2>{model.versions.map((version) => <section key={version.version_id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-[var(--ink)]">{version.name}</h3><span className="text-xs text-[var(--ink-faint)]">{version.files.length} files</span></div>{version.files.filter((file) => file.visible).map((file) => <div key={file.file_id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-3"><div><p className="text-sm text-[var(--ink)]">{file.filename}</p><p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">{file.precision} · {(file.size / 1024 ** 2).toFixed(1)} MB</p></div><div className="flex gap-2"><a href={file.download_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-2.5 py-2 text-[11px] text-[var(--ink)]"><Download className="h-3.5 w-3.5" /> Download file</a><button type="button" onClick={() => void install(file, version.version_id)} disabled={installing === file.file_id} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-2 text-[11px] font-bold text-[var(--accent-ink)] disabled:opacity-50"><HardDriveDownload className="h-3.5 w-3.5" /> {installing === file.file_id ? "Installing…" : "Install to ComfyUI"}</button>{(model.model_type === "Checkpoint" || model.model_type === "Diffusion Model") && <button type="button" onClick={() => void install(file, version.version_id, true)} disabled={installing === file.file_id} className="inline-flex items-center gap-1.5 rounded-md border border-[#d5f06f]/60 px-2.5 py-2 text-[11px] font-bold text-[#d5f06f] disabled:opacity-50">Install and use</button>}</div></div>)}</section>)}</div></section><aside className="self-start rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:sticky lg:top-20"><span className="rounded bg-[#d5f06f]/10 px-2 py-1 text-[10px] text-[#d5f06f]">{model.model_type}</span><h2 className="mt-4 text-2xl font-semibold tracking-[-.04em] text-[var(--ink)]">{model.title}</h2><p className="mt-2 text-sm text-[var(--ink-faint)]">{model.category} · {model.compatibility.base_model}</p><div className="mt-5 flex flex-wrap gap-1.5">{model.tags.map((tag) => <span key={tag} className="rounded bg-[var(--surface-soft)] px-2 py-1 text-[10px] text-[var(--ink-faint)]">{tag}</span>)}</div>{installMessage && <p aria-live="polite" className="mt-5 border-l-2 border-[#d5f06f] bg-[#d5f06f]/5 px-3 py-2 text-xs leading-5 text-[#d5f06f]">{installMessage}</p>}{installError && <p role="alert" className="mt-5 border-l-2 border-[#ef8c79] bg-[#ef8c79]/10 px-3 py-2 text-xs leading-5 text-[#ef8c79]">Install failed: {installError}</p>}<p className="mt-6 text-xs leading-5 text-[var(--ink-faint)]">Install copies this published file into your configured local ComfyUI model directory. Download file saves a copy through your browser. The Create page continues using ComfyUI’s exact filename catalog.</p></aside></div></main>;
}
