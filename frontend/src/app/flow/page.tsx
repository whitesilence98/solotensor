"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  Check,
  Clipboard,
  Film,
  LoaderCircle,
  RotateCcw,
  Send,
  Square,
} from "lucide-react";
import {
  api,
  ApiError,
  type DirectorMessage,
  type DirectorProvider,
  type DirectorProviderStatus,
} from "@/lib/api";
import { usePersistentState, STORAGE_KEYS } from "@/lib/storage";

interface FlowState {
  provider: DirectorProvider | null;
  messages: DirectorMessage[];
}

const DEFAULT_FLOW_STATE: FlowState = { provider: null, messages: [] };

const EXAMPLES = [
  "A five-shot night drive, neon reflections, consistent subject",
  "Slow push-in on a character portrait, soft window light",
  "An aerial establishing shot at golden hour, then match-cut to street level",
];

export default function FlowPage() {
  const [state, setState] = usePersistentState<FlowState>(
    STORAGE_KEYS.FLOW_STATE,
    DEFAULT_FLOW_STATE,
  );
  const [draft, setDraft] = useState("");
  const [providers, setProviders] = useState<DirectorProviderStatus[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnMeta, setTurnMeta] = useState<Array<{ provider: string; model: string } | null>>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const nearBottomRef = useRef(true);
  const cancelledRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getDirectorProviders()
      .then((list) => {
        if (cancelled) return;
        setProviders(list);
        const available = list.filter((p) => p.available);
        if (available.length === 1) {
          const only = available[0].id as DirectorProvider;
          setState((prev) => (prev.provider ? prev : { ...prev, provider: only }));
        }
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = useCallback(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    nearBottomRef.current = true;
    setNearBottom(true);
  }, []);

  // Only follow new turns when the reader is already at the bottom.
  useEffect(() => {
    if (!nearBottomRef.current) return;
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state.messages.length, pending]);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    setPending(false);
  }, []);

  // Esc stops an in-flight reply even when focus has left the composer.
  // Cmd/Ctrl+K returns focus to the composer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        textareaRef.current?.focus();
        return;
      }
      if (event.key === "Escape" && pending && !event.isComposing) {
        event.preventDefault();
        stop();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, stop]);

  const ready = providers.some((p) => p.available);
  const noProviderAvailable =
    providers.length > 0 && !providers.some((p) => p.available);

  const runTurn = async (
    content: string,
    baseMessages: DirectorMessage[],
    rollbackMessages: DirectorMessage[],
    provider: DirectorProvider | undefined,
    restoreDraft: boolean,
  ) => {
    if (!content || pending) return;
    const nextMessages: DirectorMessage[] = [
      ...baseMessages,
      { role: "user", content },
    ];
    setState((prev) => ({ ...prev, messages: nextMessages }));
    if (restoreDraft) setDraft("");
    setError(null);
    setCopiedIndex(null);
    setCopyError(null);
    setPending(true);
    cancelledRef.current = false;
    try {
      const reply = await api.askDirector(nextMessages, provider);
      if (cancelledRef.current) {
        setState((prev) => ({ ...prev, messages: rollbackMessages }));
        if (restoreDraft) setDraft(content);
        return;
      }
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          { role: "assistant", content: reply.answer },
        ],
      }));
      setTurnMeta((prev) => {
        const next = prev.slice(0, nextMessages.length);
        next[nextMessages.length] = {
          provider: reply.provider,
          model: reply.model,
        };
        return next;
      });
    } catch (cause) {
      if (cancelledRef.current) {
        setState((prev) => ({ ...prev, messages: rollbackMessages }));
        if (restoreDraft) setDraft(content);
        return;
      }
      if (cause instanceof ApiError && cause.status === 503) {
        setError(
          "Creative Director is disabled. Set DIRECTOR_ENABLED=true in the backend environment and restart the API.",
        );
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not reach the Creative Director.",
        );
      }
    } finally {
      if (!cancelledRef.current) setPending(false);
    }
  };

  const send = () => {
    void runTurn(
      draft.trim(),
      state.messages,
      state.messages,
      state.provider ?? undefined,
      true,
    );
  };

  const retryTurn = (index: number) => {
    if (pending) return;
    const reply = state.messages[index];
    const prompt = state.messages[index - 1];
    if (reply?.role !== "assistant" || prompt?.role !== "user") return;
    const meta = turnMeta[index];
    const provider = meta
      ? (meta.provider as DirectorProvider)
      : state.provider ?? undefined;
    void runTurn(
      prompt.content,
      state.messages.slice(0, index - 1),
      state.messages,
      provider,
      false,
    );
  };

  const reset = () => {
    cancelledRef.current = true;
    setState(DEFAULT_FLOW_STATE);
    setTurnMeta([]);
    setDraft("");
    setError(null);
    setCopiedIndex(null);
    setCopyError(null);
    setPending(false);
  };

  const copyTurn = async (index: number, content: string) => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
    } catch {
      setCopyError("Could not copy the response.");
    }
  };

  const onThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = next;
    setNearBottom((prev) => (prev === next ? prev : next));
  };

  const providerDetail =
    providers.find((p) => p.detail)?.detail ?? "No director provider is available.";

  return (
    <main
      id="main-content"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent antialiased"
    >
      <div
        ref={scrollRef}
        onScroll={onThreadScroll}
        className="workspace-scroll flex min-h-0 flex-1 flex-col"
      >
        <div
          role="log"
          aria-live="polite"
          aria-label="Shot direction transcript"
          className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 pb-6 sm:px-6"
        >
          {state.messages.length === 0 && !pending ? (
            <div className="workspace-empty workspace-bezel flex flex-col items-center p-1.5 text-center">
              <div className="workspace-core flex w-full flex-col items-center px-6 py-14">
                <div className="workspace-icon-island h-16 w-16 rounded-2xl border border-[var(--accent-ambient)] bg-[var(--surface-soft)] text-[var(--accent)] shadow-ambient-glow">
                  <Film className="h-7 w-7" strokeWidth={1.5} />
                </div>
                <div className="workspace-kicker mt-8">Shot direction</div>
                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
                  Describe the scene and the director will break it into shots. Pick a
                  starting brief below or write your own.
                </p>
                <div className="mt-7 flex w-full max-w-lg flex-col gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setDraft(example);
                        textareaRef.current?.focus();
                      }}
                      className="workspace-panel px-3 py-2 text-left text-sm leading-6 text-[var(--ink-soft)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] motion-reduce:transition-none"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {error && (
            <div role="alert" className="workspace-alert flex gap-3 p-4 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {state.messages.map((message, index) => {
            if (message.role === "user") {
              return (
                <div
                  key={index}
                  className="workspace-panel ml-auto max-w-[85%] whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-[var(--ink)]"
                >
                  {message.content}
                </div>
              );
            }
            const meta = turnMeta[index];
            const providerLabel =
              providers.find((p) => p.id === state.provider)?.label ?? "Director";
            return (
              <div key={index} className="group">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="workspace-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {meta ? `${meta.provider} · ${meta.model}` : providerLabel}
                  </span>
                  <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => copyTurn(index, message.content)}
                      className="workspace-action-quiet gap-1.5 px-2 py-1 text-xs"
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
                      ) : (
                        <Clipboard className="h-3.5 w-3.5" />
                      )}
                      {copiedIndex === index ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => retryTurn(index)}
                      disabled={pending}
                      className="workspace-action-quiet gap-1.5 px-2 py-1 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retry
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--ink)]">
                  {message.content}
                </pre>
              </div>
            );
          })}

          {pending && (
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Directing…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mobile-nav-clearance shrink-0 px-3 pb-3 sm:px-6 sm:pb-6">
        <div className="workspace-command relative z-40 mx-auto w-full max-w-3xl shrink-0 space-y-2 rounded-2xl border border-[var(--line-strong)] bg-[rgba(15,18,15,0.92)] p-2.5 backdrop-blur-xl sm:p-3">
          {!nearBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="workspace-command absolute -top-11 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Latest
            </button>
          )}
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {providers.length >= 2 ? (
                <div
                  role="group"
                  aria-label="Director provider"
                  className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5"
                >
                  {providers.map((provider) => {
                    const selected = state.provider === provider.id;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={!provider.available}
                        title={provider.detail ?? undefined}
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            provider: provider.id as DirectorProvider,
                          }))
                        }
                        className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition motion-reduce:transition-none ${
                          selected
                            ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
                            : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                        } ${provider.available ? "" : "cursor-not-allowed opacity-45"}`}
                      >
                        {provider.label}
                      </button>
                    );
                  })}
                </div>
              ) : providers.length === 1 ? (
                <span
                  className="workspace-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]"
                  title={providers[0].model}
                >
                  {providers[0].label} · {providers[0].model}
                </span>
              ) : null}
              {noProviderAvailable && (
                <span className="truncate text-[11px] text-[var(--ink-faint)]">
                  {providerDetail}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]"
                title={ready ? "Director available" : "No provider available"}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    ready ? "bg-[var(--accent)]" : "bg-amber-400"
                  }`}
                />
                {ready ? "Live" : "No provider"}
              </span>
              {state.messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="workspace-action-quiet gap-1.5 px-2 py-1 text-[11px] font-semibold"
                  title="Reset conversation"
                >
                  <RotateCcw className="h-3 w-3" />
                  New
                </button>
              )}
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                send();
                return;
              }
              if (event.key === "Escape" && pending && !event.nativeEvent.isComposing) {
                event.preventDefault();
                stop();
              }
            }}
            rows={3}
            maxLength={8000}
            aria-label="Shot brief"
            placeholder="Describe the shot, the subject, the light, the cut…"
            className="workspace-field min-h-[76px] w-full resize-none rounded-xl p-2.5 text-sm leading-6 outline-none sm:p-3"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="workspace-data text-[10px] text-[var(--ink-faint)]">
                {draft.length.toLocaleString()} / 8,000
              </span>
              <span className="workspace-data hidden text-[10px] uppercase tracking-wider text-[var(--ink-faint)] sm:inline">
                ↵ SEND · ⇧↵ LINE · ESC STOP
              </span>
              <span
                role="status"
                aria-live="polite"
                className="text-xs text-[var(--danger)]"
              >
                {copyError}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {pending && (
                <button
                  type="button"
                  onClick={stop}
                  className="workspace-action-secondary gap-2 px-3 py-2 text-xs font-semibold"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || pending || noProviderAvailable}
                className="workspace-action-primary gap-2 px-4 py-2 text-sm"
              >
                {pending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {pending ? "Directing" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
