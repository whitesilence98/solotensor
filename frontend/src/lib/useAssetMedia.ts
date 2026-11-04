"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type AssetMediaResponse,
  type GalleryItem,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  canRetryMediaLoad,
  isPrivateMedia,
  mediaRenewDelayMs,
} from "@/lib/mediaRenewal";

/**
 * Owner-scoped media can be served through a short-lived, purpose-scoped
 * capability in the URL. This hook keeps the *current* signed URL in React
 * state only — never in localStorage or sessionStorage — renews it shortly
 * before it expires, and refreshes once more if the browser reports the media
 * failed to load. Public assets (no expiry, or not private) render exactly as
 * before with no extra request.
 */

export type AssetMediaState = "idle" | "renewing" | "error";

export interface AssetMedia {
  /** Best available URL for main media; falls back to the item's own URL. */
  url: string;
  thumbnailUrl: string | null;
  beforeDetailerUrl: string | null;
  state: AssetMediaState;
  /** True once a renewal failed and no fresh URL is available. */
  failed: boolean;
  /** Call after an <img>/<video> onError to attempt one bounded refresh. */
  handleMediaError: () => void;
}

/**
 * A signed URL is only valid for the asset *and* viewer it was minted for.
 * Carrying both alongside the URLs lets the render path reject a stale
 * capability synchronously — not one effect later — so an account or asset
 * switch can never paint the previous capability.
 */
interface SignedMedia {
  key: string;
  viewerId: string | null;
  url: string;
  thumbnailUrl: string | null;
  beforeDetailerUrl: string | null;
  expiresAt: string | null;
}

/**
 * @param item     The descriptor returned by the gallery/asset endpoint.
 * @param options.enabled  Set false to skip renewal entirely.
 */
export function useAssetMedia(
  item: GalleryItem | null | undefined,
  options: { enabled?: boolean } = {},
): AssetMedia {
  const { enabled = true } = options;
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const key = item?.key ?? "";
  const privateAsset = Boolean(item && enabled && isPrivateMedia(item));

  const [signed, setSigned] = useState<SignedMedia | null>(null);
  const [state, setState] = useState<AssetMediaState>("idle");
  const [failed, setFailed] = useState(false);

  // Latest identity, written during render so an in-flight response is
  // checked against the identity that is actually on screen right now.
  const identityRef = useRef<{ key: string; viewerId: string | null }>({
    key,
    viewerId,
  });
  identityRef.current = { key, viewerId };

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const retriesRef = useRef(0);

  // Only a capability minted for this exact asset/viewer may render. This is a
  // render-time comparison, so a prop/account switch shows the new item's own
  // URL (or nothing) immediately, before any effect has had a chance to run.
  const current =
    signed && signed.key === key && signed.viewerId === viewerId
      ? signed
      : null;

  // Reset retry/in-flight bookkeeping and drop the previous capability whenever
  // the asset or viewer changes; abort anything still in flight.
  useEffect(() => {
    retriesRef.current = 0;
    inFlightRef.current = false;
    setSigned(null);
    setState("idle");
    setFailed(false);
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, [key, viewerId]);

  const renew = useCallback(
    async (reason: "expiry" | "error") => {
      if (!privateAsset || !key) return;
      if (inFlightRef.current) return;
      if (reason === "error") {
        // Spend the retry *before* the request: a failed refresh must count,
        // otherwise repeated onError events would refresh forever.
        if (!canRetryMediaLoad(retriesRef.current)) {
          setFailed(true);
          setState("error");
          return;
        }
        retriesRef.current += 1;
      }
      inFlightRef.current = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState("renewing");
      try {
        const fresh: AssetMediaResponse = await api.refreshAssetMedia(
          key,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const identity = identityRef.current;
        if (identity.key !== key || identity.viewerId !== viewerId) return;
        setSigned({
          key,
          viewerId,
          url: fresh.url,
          thumbnailUrl: fresh.thumbnail_url ?? null,
          beforeDetailerUrl: fresh.before_detailer_url ?? null,
          expiresAt: fresh.url_expires_at ?? null,
        });
        // Do not reset the retry budget on success: a server renewal can
        // succeed while the media itself keeps failing, which would otherwise
        // make the onError path unbounded. Reset only on key/viewer change.
        setFailed(false);
        setState("idle");
      } catch {
        if (controller.signal.aborted) return;
        const identity = identityRef.current;
        if (identity.key !== key || identity.viewerId !== viewerId) return;
        setFailed(true);
        setState("error");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          inFlightRef.current = false;
        }
      }
    },
    [key, viewerId, privateAsset],
  );

  // Schedule a deterministic renewal shortly before expiry. When the server
  // reports no expiry the URL is treated as long-lived and left alone.
  useEffect(() => {
    if (!privateAsset) return;
    const delay = mediaRenewDelayMs(
      current?.expiresAt ?? item?.url_expires_at,
    );
    if (delay === null) return;
    const timer = setTimeout(() => void renew("expiry"), delay);
    return () => clearTimeout(timer);
  }, [privateAsset, current?.expiresAt, item?.url_expires_at, renew]);

  const handleMediaError = useCallback(() => {
    void renew("error");
  }, [renew]);

  return {
    url: current?.url ?? item?.url ?? "",
    thumbnailUrl: current?.thumbnailUrl ?? item?.thumbnail_url ?? null,
    beforeDetailerUrl:
      current?.beforeDetailerUrl ?? item?.before_detailer_url ?? null,
    state,
    failed,
    handleMediaError,
  };
}
