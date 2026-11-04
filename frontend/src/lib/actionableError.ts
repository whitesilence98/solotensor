/**
 * Maps a failed request to a short, honest, actionable presentation.
 *
 * Pure and dependency-free: callers pass the HTTP status (from `ApiError`) plus
 * the message the server already sent, and get back optional guidance and an
 * action kind. It never invents access — a 403 is explained, not "unlocked".
 *
 *   - 401 -> sign in again through the existing auth modal
 *   - 403 -> permission guidance, no bypass
 *   - 404 -> the referenced file/asset is gone; re-select it
 *   - no HTTP response at all (fetch rejected, status null/0) -> recheck health;
 *     the paid job is NOT re-submitted
 *
 * `engineOffline` is only a fallback for failures that never produced an HTTP
 * response. A real status (422 validation, 409 conflict, 500, etc.) always
 * keeps its own message, even when a stale health probe still says offline.
 */

export type ErrorAction =
  | "sign-in"
  | "permissions"
  | "reselect"
  | "recheck-engine";

export interface ActionableError {
  /** The message to show. Server text is kept; a fallback is used when empty. */
  message: string;
  /** What the user can do, or null when the error needs no special action. */
  action: ErrorAction | null;
  /** Short sentence explaining the action. Null for plain errors. */
  guidance: string | null;
}

export interface ErrorInput {
  status?: number | null;
  message?: string | null;
  /** True when the engine probe says the backend/engine cannot be reached. */
  engineOffline?: boolean;
  /** What the failed request was about, so 404 guidance is accurate. */
  context?: "reference" | "tool";
}

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

function trimmed(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Classify an error for display. A real HTTP status always wins; the offline
 * flag is only consulted when the request produced no HTTP response at all.
 * Status 0 is the network-failure sentinel some clients use for that case.
 */
export function classifyError(input: ErrorInput): ActionableError {
  const message = trimmed(input.message) || FALLBACK_MESSAGE;
  const status =
    typeof input.status === "number" && Number.isFinite(input.status)
      ? input.status
      : null;
  const networkFailure = status === null || status === 0;

  if (status === 401) {
    return {
      message,
      action: "sign-in",
      guidance: "Your session has expired. Sign in again to continue.",
    };
  }

  if (status === 403) {
    return {
      message,
      action: "permissions",
      guidance:
        "This action needs an account with access to this resource. Sign in as its owner — access cannot be granted from here.",
    };
  }

  if (status === 404) {
    return {
      message,
      action: "reselect",
      guidance:
        input.context === "tool"
          ? "This tool was not found. It may have been deleted — go back to the tools list."
          : "The referenced file was not found. It may have been deleted or moved — re-select it before running again.",
    };
  }

  // No HTTP response: an unreachable engine is the one honest retry case, and
  // the action is a health recheck, never an automatic (paid) re-submit. An
  // actual status (422/409/500...) is never relabeled from a stale probe.
  if (input.engineOffline && networkFailure) {
    return {
      message,
      action: "recheck-engine",
      guidance:
        "Studio Engine is offline or unreachable. Recheck the connection; this job was not re-submitted.",
    };
  }

  return { message, action: null, guidance: null };
}

/** True when the value is an `ApiError` (avoids importing the class). */
export function isApiErrorLike(
  value: unknown,
): value is { status: number; message?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "number"
  );
}

/**
 * Classify a thrown unknown using its HTTP status when available. `engineOffline`
 * should be the current engine probe result; it is only used for non-HTTP
 * failures.
 */
export function classifyThrown(
  error: unknown,
  options: { engineOffline?: boolean; context?: "reference" | "tool" } = {},
): ActionableError {
  return classifyError({
    status: isApiErrorLike(error) ? error.status : null,
    message:
      error instanceof Error ? error.message : trimmed(String(error ?? "")),
    engineOffline: options.engineOffline,
    context: options.context,
  });
}
