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
import AssetInspectionStage from "@/components/AssetInspectionStage";
import WorkspaceModal from "@/components/WorkspaceModal";
import WorkspaceFooter from "@/components/WorkspaceFooter";

export default function HomePage() {
  // Data states
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [models, setModels] = useState<PublicModelSummary[]>([]);
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [modelOptions, setModelOptions] = useState<InstalledGalleryModel[]>([]);

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Asset Inspection Stage Modal
  const [inspectedAsset, setInspectedAsset] = useState<AssetRecord | null>(null);

  // Fetch initial data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      api.getAssets(60),
      api.getPublicModels(""),
      api.getTools(),
      api.listSelectableModels(),
    ])
      .then(([assetsRes, modelsRes, toolsRes, selectableRes]) => {
        if (cancelled) return;

        if (assetsRes.status === "fulfilled") {
          setAssets(withTypes(assetsRes.value));
        }
        if (modelsRes.status === "fulfilled") {
          setModels(modelsRes.value.items || []);
        }
        if (toolsRes.status === "fulfilled") {
          setTools(toolsRes.value);
        }
        if (selectableRes.status === "fulfilled") {
          setModelOptions(selectableRes.value);
        }

        // If all 3 main sources failed, report error
        if (
          assetsRes.status === "rejected" &&
          modelsRes.status === "rejected" &&
          toolsRes.status === "rejected"
        ) {
          setError("Failed to communicate with SoloTensor backend services.");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load discovery stream."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const openAssetInspection = useCallback((item: AssetRecord | GalleryItem) => {
    setInspectedAsset(item as AssetRecord);
  }, []);

  return (
    <main
      id="main-content"
      className="workspace-scroll flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)]">
      <div className="mx-auto flex w-full max-w-[1720px] flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex-1 space-y-10">
        {/* Error Notice */}
        {error && (
          <div className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-[var(--danger)] animate-ping" />
              <p className="text-xs text-[var(--ink)]">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="workspace-action-secondary px-3 py-1.5 text-xs font-medium"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {/* 1. Top Promo / Ad Banner Carousel */}
        <section aria-label="Featured announcements and models">
          <HomePromoCarousel />
        </section>

        {/* 2. "Featured" = AI Tools (2x5 compact grid) */}
        <HomeFeaturedTools tools={tools} />

        {/* 3. "Models" Section */}
        <HomeModelsSection models={models} loading={loading} />

        {/* 4. "Posts" = Assets (Latest User Creations Feed) */}
        <HomePostsSection
          assets={assets}
          loading={loading}
          onOpenAsset={openAssetInspection}
        />

        </div>
      </div>

      {/* Asset Inspection Modal Dialog */}
      {inspectedAsset && (
        <WorkspaceModal
          open={Boolean(inspectedAsset)}
          onClose={() => setInspectedAsset(null)}
          title={inspectedAsset.metadata?.prompt || inspectedAsset.key}
          size="media"
          headless
        >
          <AssetInspectionStage
            asset={inspectedAsset}
            items={assets}
            modelOptions={modelOptions}
            mode="modal"
            onClose={() => setInspectedAsset(null)}
          />
        </WorkspaceModal>
      )}
      {/* Footer */}
      <WorkspaceFooter containerClassName="max-w-[1720px]" />
    </main>
  );
}
