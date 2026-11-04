/**
 * Pure helpers for owner-scoped media renewal and signed-URL hygiene.
 *
 * Deliberately dependency-free so the renewal/stale-session rules can run in a
 * plain node check without React or a browser. The React hook and the studio's
 * persistence sanitizer are the only consumers.
 */

/** Renew this long before the server-provided expiry elapses. */
export const MEDIA_RENEW_LEAD_MS = 60_000;
/** Stop retrying a media load failure after this many renewals. */
export const MAX_MEDIA_ERROR_RETRIES = 2;

export interface MediaDescriptor {
  is_private?: boolean | null;
  url_expires_at?: string | null;
}

/** A URL is owner-scoped if the server marked it private or gave it an expiry. */
export function isPrivateMedia(item: MediaDescriptor | null | undefined): boolean {
  if (!item) return false;
  return item.is_private === true || Boolean(item.url_expires_at);
}

/** Parse an ISO-8601 expiry into epoch ms; null when absent or unparseable. */
export function mediaExpiryMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Delay before the next renewal. Null means "no scheduled renewal": either no
 * expiry was reported or it is unparseable. Never negative.
 */
export function mediaRenewDelayMs(
  iso: string | null | undefined,
  now: number = Date.now(),
): number | null {
  const expiry = mediaExpiryMs(iso);
  if (expiry === null) return null;
  return Math.max(0, expiry - now - MEDIA_RENEW_LEAD_MS);
}

/**
 * True while another bounded refresh is allowed after a media load error.
 * `retries` is the count already spent.
 */
export function canRetryMediaLoad(
  retries: number,
  max: number = MAX_MEDIA_ERROR_RETRIES,
): boolean {
  return retries < max;
}

/**
 * Drop the signing query from a stored `/files/` reference while keeping the
 * stable path. The generation endpoint resolves reference bytes from local
 * storage by path (it strips any query itself), so a de-signed stable path is
 * still submittable; the capability is only needed for HTTP preview.
 *
 * Data/blob URLs and non-`/files/` URLs are returned unchanged.
 */
export function stableMediaRef(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (!value.includes("/files/")) return value;
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  const query = value.indexOf("?");
  return query === -1 ? value : value.slice(0, query);
}

/**
 * True for a stored `/files/` reference that carries no capability. Its preview
 * may need an authenticated re-resolve (private) while public ones load as-is.
 */
export function needsMediaRefresh(value: string | null | undefined): boolean {
  if (!value || !value.includes("/files/")) return false;
  return !value.includes("?");
}

/** Storage key (path after `/files/`) for a `/files/` reference, else null. */
export function fileKeyFromRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const marker = "/files/";
  const at = value.indexOf(marker);
  if (at === -1) return null;
  const rest = value.slice(at + marker.length);
  const query = rest.indexOf("?");
  return query === -1 ? rest : rest.slice(0, query);
}
