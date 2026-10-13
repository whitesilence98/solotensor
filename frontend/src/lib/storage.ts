/**
 * SoloTensor Centralized LocalStorage Persistence Layer
 *
 * Provides type-safe, SSR-safe persistence for client-side state across the app.
 * All keys are prefixed with 'solotensor:' to isolate application state.
 */

import { useCallback, useEffect, useState } from "react";

export const STORAGE_KEYS = {
  // Studio Workspace
  STUDIO_DRAFT: "solotensor:studio:draft",
  STUDIO_CANVAS_VIEW: "solotensor:studio:canvas_view",

  // Asset Library
  ASSETS_BOOKMARKS: "solotensor:assets:bookmarks",
  ASSETS_TAB: "solotensor:assets:tab",
  ASSETS_SOURCE: "solotensor:assets:source",
  ASSETS_TAGS: "solotensor:assets:tags",

  // Tool Studio
  TOOL_VALUES: (toolId: string) => `solotensor:tools:${toolId}:values`,

  // Creator Studio
  MODEL_CREATOR_DRAFT: "solotensor:models:creator_draft",

  // Code Assist
  ASSIST_STATE: "solotensor:assist:state",
} as const;

/** Safely read and parse a value from localStorage */
export function getStorageItem<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/** Safely write a JSON-serializable value to localStorage */
export function setStorageItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Handled: quota exceeded or privacy mode
  }
}

/** Safely remove an item from localStorage */
export function removeStorageItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * SSR-safe persistent state hook.
 *
 * Initializes with `defaultValue` on the first render to avoid Next.js hydration
 * mismatch, then synchronizes from localStorage in useEffect. Subsequent updates
 * are automatically written to localStorage.
 *
 * @returns [state, setState, resetState, isHydrated]
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, (valueOrUpdater: T | ((prev: T) => T)) => void, () => void, boolean] {
  const [state, setState] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setState(JSON.parse(raw));
      }
    } catch {
      // Fallback to default
    }
    setHydrated(true);
  }, [key]);

  const setPersistentState = useCallback(
    (valueOrUpdater: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next =
          typeof valueOrUpdater === "function"
            ? (valueOrUpdater as (prev: T) => T)(prev)
            : valueOrUpdater;
        setStorageItem(key, next);
        return next;
      });
    },
    [key]
  );

  const resetState = useCallback(() => {
    setState(defaultValue);
    removeStorageItem(key);
  }, [key, defaultValue]);

  return [state, setPersistentState, resetState, hydrated];
}
