"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUpRight,
  Check,
  Clipboard,
  Film,
  LoaderCircle,
  RefreshCw,
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
  type DirectorShot,
} from "@/lib/api";
import { usePersistentState, STORAGE_KEYS } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import {
  buildShotGenerateHref,
  DEFAULT_VIDEO_DURATION_SECONDS,
  DEFAULT_VIDEO_FPS,
  snapVideoDuration,
  snapVideoFps,
} from "@/lib/generateDeepLink";

/** One assistant turn's provenance. Stored alongside the transcript so a
 *  restored conversation keeps the provider that actually answered it. */
interface FlowTurnMeta {
  provider: string;
  model: string;
  shots: DirectorShot[];
}

interface FlowState {
  provider: DirectorProvider | null;
  messages: DirectorMessage[];
  /** Index-aligned with `messages`; assistant slots carry meta, user slots are null.
   *  Optional because transcripts persisted before shot cards have no turns. */
  turns?: (FlowTurnMeta | null)[];
}

const DEFAULT_FLOW_STATE: FlowState = { provider: null, messages: [], turns: [] };

const EXAMPLES = [
  "A five-shot night drive, neon reflections, consistent subject",
  "Slow push-in on a character portrait, soft window light",
  "An aerial establishing shot at golden hour, then match-cut to street level",
];

function isProviderId(value: string | undefined | null): value is DirectorProvider {
  return value === "local" || value === "anthropic";
}

function shotModelLabel(shot: DirectorShot): string {
  return shot.model_label?.trim() || "No installed model matched";
}

function ShotCard({
  shot,
  cardId,
  copyKey,
  copied,
  onCopy,
}: {
  shot: DirectorShot;
  cardId: string;
  copyKey: string;
  copied: boolean;
  onCopy: (key: string, text: string) => void;
}) {
  const href = buildShotGenerateHref(shot);
  const isVideo = shot.media === "video";
  // Show what the link will actually apply: the backend options are a fixed
  // list, so the card snaps the same way instead of advertising a value the
  // Video tab cannot display.
  const shownDuration = isVideo
    ? snapVideoDuration(shot.duration_seconds) ?? DEFAULT_VIDEO_DURATION_SECONDS
    : null;
  const shownFps = isVideo ? snapVideoFps(shot.fps) ?? DEFAULT_VIDEO_FPS : null;
  return (
    <article
      aria-labelledby={`${cardId}-title`}
      className="workspace-panel mt-3 p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          id={`${cardId}-title`}
          className="font-heading text-sm font-semibold tracking-tight text-[var(--ink)]"
        >
          {shot.title}
        </h3>
        <div className="workspace-data flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="workspace-chip px-2 py-0.5">{isVideo ? "Video" : "Image"}</span>
          <span className="workspace-chip px-2 py-0.5">{shot.aspect}</span>
          {isVideo && shownDuration !== null && (
            <span className="workspace-chip px-2 py-0.5">{shownDuration}s</span>
          )}
          {isVideo && shownFps !== null && (
            <span className="workspace-chip px-2 py-0.5">{shownFps} fps</span>
          )}
        </div>
      </div>

      <pre className="mt-2.5 whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-[var(--ink)]">
        {shot.prompt}
      </pre>

      {(shot.negative_prompt ?? "").trim().length > 0 && (
        <p className="mt-2 text-[11px] leading-5 text-[var(--ink-faint)]">
          <span className="workspace-data uppercase tracking-wider">Negative</span>{" "}
          {shot.negative_prompt}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span
          className="workspace-data min-w-0 truncate text-[10px] uppercase tracking-wider text-[var(--ink-faint)]"
          title={shot.model_label ?? undefined}
        >
          {shotModelLabel(shot)}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onCopy(copyKey, shot.prompt)}
            className="workspace-action-quiet gap-1.5 px-2 py-1 text-[11px] font-semibold"
            aria-label={`Copy prompt for ${shot.title}`}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy prompt"}
          </button>
          {href ? (
            <Link
              href={href}
              className="workspace-action-secondary gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold"
            >
              Open in Generate
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              title="This shot has no complete installed model bound, so it cannot open in Generate."
              className="workspace-action-secondary cursor-not-allowed gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold opacity-45"
            >
              Open in Generate
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>

      {isVideo && (
        <p className="mt-2.5 border-t border-[var(--line)] pt-2 text-[10px] leading-5 text-[var(--ink-faint)]">
          Video renders with the bundled LTX workflow; the opened model does not drive
          the video graph.
        </p>
      )}
    </article>
  );
}

export default function FlowPage() {
  const { isAdmin, openAuthModal } = useAuth();
  const [state, setState] = usePersistentState<FlowState>(
    STORAGE_KEYS.FLOW_STATE,
    DEFAULT_FLOW_STATE,
  );
  const [draft, setDraft] = useState("");
  const [providers, setProviders] = useState<DirectorProviderStatus[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [providersDisabled, setProvidersDisabled] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const nearBottomRef = useRef(true);
  // Request identity: a stale reply may only land when it is still the newest
  // request. This replaces a boolean, which could not tell an aborted turn
  // from one superseded later.
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);
  const rollbackRef = useRef<{
    messages: DirectorMessage[];
    turns: (FlowTurnMeta | null)[];
    content: string;
    restoreDraft: boolean;
  } | null>(null);
  const providersRequestRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadProviders = useCallback(() => {
    const token = ++providersRequestRef.current;
    setProvidersError(null);
    setProvidersLoaded(false);
    void api
      .getDirectorProviders()
      .then((list) => {
        if (token !== providersRequestRef.current) return;
        setProviders(list);
        setProvidersLoaded(true);
        setProvidersDisabled(false);
        const available = list.filter((p) => p.available);
        if (available.length === 1) {
          const only = available[0].id;
          if (isProviderId(only)) {
            setState((prev) => (prev.provider ? prev : { ...prev, provider: only }));
          }
        }
      })
      .catch((cause: unknown) => {
        if (token !== providersRequestRef.current) return;
        setProviders([]);
        setProvidersLoaded(true);
        // A missing DIRECTOR_ENABLED flag is answered with a hard 503. That is
        // a configuration state, not a transient outage — say so plainly.
        if (cause instanceof ApiError && cause.status === 503) {
          setProvidersDisabled(true);
          setProvidersError(null);
          return;
        }
        setProvidersDisabled(false);
        setProvidersError(
          cause instanceof Error
            ? cause.message
            : "Could not load the director provider list.",
        );
      });
  }, [setState]);

  useEffect(() => {
    loadProviders();
    return () => {
      providersRequestRef.current += 1;
    };
  }, [loadProviders]);

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
  }, [(state.messages ?? []).length, pending]);

  const stop = useCallback(() => {
    const rollback = rollbackRef.current;
    requestIdRef.current += 1;
    pendingRef.current = false;
    rollbackRef.current = null;
    setPending(false);
    if (rollback) {
      setState((prev) => ({
        ...prev,
        messages: rollback.messages,
        turns: rollback.turns,
      }));
      if (rollback.restoreDraft) setDraft(rollback.content);
    }
  }, [setState]);

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
  // A failed fetch says nothing about what is configured — never claim the
  // studio has no model on the strength of a network error.
  const noProviderConfigured =
    providersLoaded && !providersDisabled && !providersError && !ready;
  // A failed provider fetch is not authority over the POST; the POST is.
  const sendDisabled =
    !draft.trim() || pending || (!providersError && providersLoaded && !ready);

  const runTurn = async (
    content: string,
    baseMessages: DirectorMessage[],
    rollbackMessages: DirectorMessage[],
    rollbackTurns: (FlowTurnMeta | null)[],
    provider: DirectorProvider | undefined,
    restoreDraft: boolean,
  ) => {
    if (!content || pendingRef.current) return;
    const token = ++requestIdRef.current;
    pendingRef.current = true;
    const nextMessages: DirectorMessage[] = [
      ...baseMessages,
      { role: "user", content },
    ];
    rollbackRef.current = {
      messages: rollbackMessages,
      turns: rollbackTurns,
      content,
      restoreDraft,
    };
    setState((prev) => {
      // Keep the turns array index-aligned: the optimistic user slot has no meta.
      const turns = (prev.turns ?? []).slice(0, nextMessages.length);
      turns[nextMessages.length - 1] = null;
      return { ...prev, messages: nextMessages, turns };
    });
    if (restoreDraft) setDraft("");
    setError(null);
    setCopiedKey(null);
    setCopyError(null);
    setPending(true);

    try {
      const reply = await api.askDirector(nextMessages, provider);
      // Superseded by a newer request or by Stop: stop() already restored state.
      if (token !== requestIdRef.current) return;
      rollbackRef.current = null;

      const shots = reply.shots ?? [];
      const answer =
        reply.answer.trim() ||
        (shots.length > 0
          ? `${shots.length} shot${shots.length === 1 ? "" : "s"} planned: ${shots
              .map((shot) => shot.title)
              .join(", ")}`
          : "");
      if (!answer) {
        throw new Error("The director returned an empty answer. Try again.");
      }

      setState((prev) => {
        const messages: DirectorMessage[] = [
          ...(prev.messages ?? []),
          { role: "assistant", content: answer },
        ];
        const turns = (prev.turns ?? []).slice(0, messages.length - 1);
        turns[messages.length - 1] = {
          provider: reply.provider,
          model: reply.model,
          shots,
        };
        return { ...prev, messages, turns };
      });
    } catch (cause) {
      if (token !== requestIdRef.current) return;
      rollbackRef.current = null;
      // Keep the transcript to answered turns only. A trailing unanswered user
      // message would be replayed on the next send (two user turns in a row),
      // so the optimistic turn is rolled back and the brief handed back.
      setState((prev) => ({
        ...prev,
        messages: rollbackMessages,
        turns: rollbackTurns,
      }));
      if (restoreDraft) setDraft(content);
      if (cause instanceof ApiError && cause.status === 401) {
        setError(null);
        openAuthModal("flow_director");
        return;
      }
      if (cause instanceof ApiError && cause.status === 503) {
        if (/disabled|DIRECTOR_ENABLED/i.test(cause.message)) {
          setProvidersDisabled(true);
          setError(
            "The Creative Director is switched off on this server. Ask an administrator to enable it under AI runtime.",
          );
        } else {
          setError(
            cause.message || "The director is temporarily unreachable. Try again.",
          );
        }
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the Creative Director.",
      );
    } finally {
      if (token === requestIdRef.current) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  const send = () => {
    if (!draft.trim() || pendingRef.current) return;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const turns = Array.isArray(state.turns) ? state.turns : [];
    void runTurn(
      draft.trim(),
      messages,
      messages,
      turns,
      state.provider ?? undefined,
      true,
    );
  };

  const retryTurn = (index: number) => {
    if (pendingRef.current) return;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const turns = Array.isArray(state.turns) ? state.turns : [];
    const reply = messages[index];
    const prompt = messages[index - 1];
    if (reply?.role !== "assistant" || prompt?.role !== "user") return;
    const meta = turns[index] ?? null;
    const provider = isProviderId(meta?.provider)
      ? meta.provider
      : state.provider ?? undefined;
    void runTurn(
      prompt.content,
      messages.slice(0, index - 1),
      messages,
      turns,
      provider,
      false,
    );
  };

  const reset = () => {
    requestIdRef.current += 1;
    pendingRef.current = false;
    rollbackRef.current = null;
    setState(DEFAULT_FLOW_STATE);
    setDraft("");
    setError(null);
    setCopiedKey(null);
    setCopyError(null);
    setPending(false);
  };

  const copyText = async (key: string, content: string) => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(key);
    } catch {
      setCopyError("Could not copy to the clipboard.");
    }
  };

  const onThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = next;
    setNearBottom((prev) => (prev === next ? prev : next));
  };

  const messages = Array.isArray(state.messages) ? state.messages : [];
  const turns = Array.isArray(state.turns) ? state.turns : [];
  const statusLabel = !providersLoaded
    ? "Checking providers"
    : providersDisabled
      ? "Director disabled"
      : providersError
        ? "Provider list unreachable"
        : ready
          ? "Configured"
          : "Not configured";
  const statusDot =
    providersLoaded && !providersDisabled && !providersError && ready
      ? "bg-[var(--accent)]"
      : "bg-[var(--warning)]";

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
          {messages.length === 0 && !pending ? (
            <div className="workspace-empty workspace-bezel flex flex-col items-center p-1.5 text-center">
              <div className="workspace-core flex w-full flex-col items-center px-6 py-14">
                <div className="workspace-icon-island h-16 w-16 rounded-2xl border border-[var(--accent-ambient)] bg-[var(--surface-soft)] text-[var(--accent)] shadow-ambient-glow">
                  <Film className="h-7 w-7" strokeWidth={1.5} />
                </div>
                <div className="workspace-kicker mt-8">Shot direction</div>
                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
                  Describe the scene and the director will break it into shots. Each
                  shot arrives as a card you can copy or open in Generate. Pick a
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

          {providersError && (
            <div
              role="status"
              className="workspace-panel flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs leading-5 text-[var(--ink-soft)]"
            >
              <p className="min-w-0">
                Provider status could not be loaded. The director may still answer —
                sending is enabled.
              </p>
              <button
                type="button"
                onClick={loadProviders}
                className="workspace-action-secondary shrink-0 gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}

          {(providersDisabled || noProviderConfigured) && (
            <section
              aria-label="Director configuration"
              className="workspace-panel p-4 text-sm leading-6 text-[var(--ink-soft)]"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <h2 className="workspace-kicker text-[var(--ink)]">
                    {providersDisabled
                      ? "Creative director is switched off"
                      : "No director model is configured"}
                  </h2>
                  {providersDisabled ? (
                    <p>
                      Shot planning needs a language model, and this server has the
                      director disabled. Nothing will be generated or invented while it
                      is off.
                    </p>
                  ) : (
                    <>
                      <p>
                        Shot planning needs a language model. This studio requires one of
                        the following:
                      </p>
                      <ul className="space-y-1">
                        {providers.map((provider) => (
                          <li key={provider.id} className="flex flex-wrap gap-x-1.5">
                            <span className="font-semibold text-[var(--ink)]">
                              {provider.label}
                            </span>
                            <span className="text-[var(--ink-faint)]">
                              {provider.detail ?? "Not configured"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {isAdmin ? (
                    <Link
                      href="/admin/settings"
                      className="workspace-action-secondary mt-1 inline-flex gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold"
                    >
                      Open AI runtime
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <p className="text-[11px] text-[var(--ink-faint)]">
                      Ask an administrator to configure an AI runtime for this studio.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="workspace-alert flex gap-3 p-4 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {messages.map((message, index) => {
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
            const meta = turns[index] ?? null;
            return (
              <div key={index} className="group">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="workspace-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {meta ? `${meta.provider} · ${meta.model}` : "Director"}
                  </span>
                  <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    {message.content.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => copyText(`turn:${index}`, message.content)}
                        className="workspace-action-quiet gap-1.5 px-2 py-1 text-xs"
                      >
                        {copiedKey === `turn:${index}` ? (
                          <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
                        ) : (
                          <Clipboard className="h-3.5 w-3.5" />
                        )}
                        {copiedKey === `turn:${index}` ? "Copied" : "Copy"}
                      </button>
                    )}
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
                {message.content.trim().length > 0 && (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--ink)]">
                    {message.content}
                  </pre>
                )}
                {(meta?.shots ?? []).map((shot, shotIndex) => (
                  <ShotCard
                    key={`${index}:${shotIndex}`}
                    shot={shot}
                    cardId={`shot-${index}-${shotIndex}`}
                    copyKey={`shot:${index}:${shotIndex}`}
                    copied={copiedKey === `shot:${index}:${shotIndex}`}
                    onCopy={copyText}
                  />
                ))}
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

      <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-6">
        <div className="workspace-command relative z-40 mx-auto w-full max-w-3xl shrink-0 space-y-2 rounded-2xl border border-[var(--line-strong)] bg-[var(--core)] p-2.5 backdrop-blur-xl sm:p-3">
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
                    const providerId = provider.id;
                    return (
                      <button
                        key={providerId}
                        type="button"
                        aria-pressed={selected}
                        disabled={!provider.available}
                        title={provider.detail ?? undefined}
                        onClick={() => {
                          if (!isProviderId(providerId)) return;
                          setState((prev) => ({ ...prev, provider: providerId }));
                        }}
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
                  title={providers[0].detail ?? providers[0].model}
                >
                  {providers[0].label} · {providers[0].model || "not configured"}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]"
                title="Available means configured, not verified online."
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                {statusLabel}
              </span>
              {messages.length > 0 && (
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
                disabled={sendDisabled}
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
