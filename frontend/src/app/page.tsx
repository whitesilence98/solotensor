"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  api,
  withTypes,
  type AssetRecord,
  type GalleryItem,
  type InstalledGalleryModel,
  type PublicModelSummary,
  type ToolSummary,
} from "@/lib/api";
import HomePromoCarousel from "@/components/HomePromoCarousel";
import HomeFeaturedTools from "@/components/HomeFeaturedTools";
import HomeModelsSection from "@/components/HomeModelsSection";
import HomePostsSection from "@/components/HomePostsSection";
import AssetDetailOverlay from "@/components/AssetDetailOverlay";
import WorkspaceFooter from "@/components/WorkspaceFooter";

const loadAssets = async () => withTypes(await api.getAssets(60));
const loadModels = async () => (await api.getPublicModels("")).items || [];
const loadTools = () => api.getTools();
const loadSelectable = () => api.listSelectableModels();

function useHomeSection<T>(load: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void load().then((result) => {
      if (!cancelled) setData(result);
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [load, reload]);
  return { data, loading, error, retry: () => setReload((value) => value + 1) };
}

function SectionNotice({ label, section }: { label: string; section: { loading: boolean; error: boolean; retry: () => void } }) {
  if (!section.loading && !section.error) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs text-[var(--ink)]">
      <p>{section.loading ? `Loading ${label}…` : `Could not load ${label}. Other sections remain available.`}</p>
      {section.error && <button type="button" onClick={section.retry} className="workspace-action-secondary px-3 py-1.5 text-xs font-medium" aria-label={`Retry ${label}`}><RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />Retry</button>}
    </div>
  );
}

export default function HomePage() {
  const assetsSection = useHomeSection<AssetRecord>(loadAssets);
  const modelsSection = useHomeSection<PublicModelSummary>(loadModels);
  const toolsSection = useHomeSection<ToolSummary>(loadTools);
  const selectableSection = useHomeSection<InstalledGalleryModel>(loadSelectable);
  const assets = assetsSection.data;
  const models = modelsSection.data;
  const tools = toolsSection.data;
  const modelOptions = selectableSection.data;

  const [inspectedAsset, setInspectedAsset] = useState<AssetRecord | null>(null);

  const openAssetInspection = useCallback((item: AssetRecord | GalleryItem) => {
    setInspectedAsset(item as AssetRecord);
    try {
      if (typeof window !== "undefined") {
        const encoded = item.key.split("/").map(encodeURIComponent).join("/");
        window.history.pushState({ assetKey: item.key }, "", `/assets/${encoded}`);
      }
    } catch {
      // Ignore in restricted environments
    }
  }, []);

  const closeAssetInspection = useCallback(() => {
    setInspectedAsset(null);
    try {
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", "/");
      }
    } catch {
      // Ignore
    }
  }, []);

  const selectAssetInModal = useCallback((item: GalleryItem) => {
    setInspectedAsset(item as AssetRecord);
    try {
      if (typeof window !== "undefined") {
        const encoded = item.key.split("/").map(encodeURIComponent).join("/");
        window.history.replaceState({ assetKey: item.key }, "", `/assets/${encoded}`);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Listen for browser Back/Forward navigation to sync modal with URL
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && typeof e.state === "object" && "assetKey" in e.state && e.state.assetKey) {
        const match = assets.find((a) => a.key === e.state.assetKey);
        if (match) {
          setInspectedAsset(match);
          return;
        }
      }
      setInspectedAsset(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [assets]);

  return (
    <main
      id="main-content"
      className="flex min-h-full w-full flex-1 flex-col bg-[var(--ground)]">
      <div className="mx-auto flex w-full max-w-[1720px] flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex-1 space-y-10">
        <SectionNotice label="selectable models" section={selectableSection} />

        {/* 1. Top Promo / Ad Banner Carousel */}
        <section aria-label="Featured announcements and models">
          <HomePromoCarousel />
        </section>

        {/* 2. "Featured" = AI Tools (2x5 compact grid) */}
        <SectionNotice label="tools" section={toolsSection} />
        <HomeFeaturedTools tools={tools} />

        {/* 3. "Models" Section */}
        <SectionNotice label="models" section={modelsSection} />
        {(!modelsSection.error || models.length > 0) && <HomeModelsSection models={models} loading={modelsSection.loading} />}

        {/* 4. "Posts" = Assets (Latest User Creations Feed) */}
        <SectionNotice label="assets" section={assetsSection} />
        {(!assetsSection.error || assets.length > 0) && <HomePostsSection
          assets={assets}
          loading={assetsSection.loading}
          onOpenAsset={openAssetInspection}
        />}

        </div>
      </div>

      {/* Asset Inspection Modal Dialog with Deep-Linking */}
      <AssetDetailOverlay
        asset={inspectedAsset}
        items={assets}
        title={inspectedAsset?.metadata?.prompt || inspectedAsset?.key || "Asset Details"}
        modelOptions={modelOptions}
        onSelectAsset={selectAssetInModal}
        onClose={closeAssetInspection}
      />
      {/* Footer */}
      <WorkspaceFooter containerClassName="max-w-[1720px]" />
    </main>
  );
}
