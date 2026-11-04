"use client";

import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type HealthResponse } from "@/lib/api";

export function generationBlockReason(health: HealthResponse | null): string | null {
  if (!health) return null;
  if (health.storage === "down") return "Storage is unavailable. Generation cannot save outputs.";
  if (health.database_status === "down") return "The studio database is unavailable. Generation is paused.";
  if (health.comfy === "down") return "Studio Engine is offline. Start the engine to generate.";
  return null;
}

export function enginePollDelay(failures: number): number {
  return Math.min(30_000 * 2 ** Math.min(failures, 2), 120_000);
}

interface EngineStatus {
  health: HealthResponse | null;
  unreachable: boolean;
  checking: boolean;
  retry: () => void;
}

const EngineStatusContext = createContext<EngineStatus | null>(null);

export function EngineStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<EngineStatus, "retry">>({ health: null, unreachable: false, checking: true });
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const cancel = () => {
      revision += 1;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller?.abort();
    };
    const poll = async () => {
      cancel();
      if (disposed || document.hidden) return;
      const current = revision;
      controller = new AbortController();
      const signal = controller.signal;
      setState((previous) => ({ ...previous, checking: true }));
      deadline = setTimeout(() => controller?.abort(), 10_000);
      try {
        const health = await api.health(signal);
        if (disposed || document.hidden || current !== revision) return;
        failures = 0;
        setState({ health, unreachable: false, checking: false });
      } catch {
        if (disposed || document.hidden || current !== revision) return;
        failures += 1;
        // A failed probe is unknown, not proof the engine remains down.
        setState({ health: null, unreachable: true, checking: false });
      } finally {
        if (!disposed && !document.hidden && current === revision) {
          clearTimeout(deadline);
          timer = setTimeout(() => void poll(), enginePollDelay(failures));
        }
      }
    };
    const onVisibility = () => {
      cancel();
      if (!document.hidden) void poll();
    };
    retryRef.current = () => void poll();
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      disposed = true;
      cancel();
      retryRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return createElement(EngineStatusContext.Provider, { value: { ...state, retry: () => retryRef.current() } }, children);
}

export function useEngineStatus(): EngineStatus {
  const status = useContext(EngineStatusContext);
  if (!status) throw new Error("useEngineStatus requires EngineStatusProvider");
  return status;
}
