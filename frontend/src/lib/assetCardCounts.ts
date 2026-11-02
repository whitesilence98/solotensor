/**
 * Server-count parsing for gallery cards. Cards only ever display numbers the
 * server actually returned; a missing or invalid count renders as `null` so the
 * caller can omit the row instead of showing a fabricated value.
 */
export function toRemixCount(...candidates: unknown[]): number | null {
  for (const raw of candidates) {
    const parsed = typeof raw === "string" ? Number(raw) : raw;
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
      continue;
    }
    // Truncate first, then require a positive integer: 0.5 is not "1 remix".
    const count = Math.trunc(parsed);
    if (count > 0) return count;
  }
  return null;
}
