"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Clipboard,
  Code2,
  LoaderCircle,
  Send,
  Server,
  Sparkles,
} from "lucide-react";
import { api, ApiError, type AssistantPersona } from "@/lib/api";
import WorkspacePage from "@/components/WorkspacePage";
import WorkspacePageHeader from "@/components/WorkspacePageHeader";
import WorkspaceFooter from "@/components/WorkspaceFooter";

const PERSONAS: Array<{
  id: AssistantPersona;
  title: string;
  description: string;
  icon: typeof Server;
}> = [
  {
    id: "backend",
    title: "Backend",
    description: "FastAPI, contracts, ComfyUI, tests",
    icon: Server,
  },
  {
    id: "frontend",
    title: "Frontend",
    description: "Next.js, React, UI, accessibility",
    icon: Code2,
  },
];

export default function AssistPage() {
  const [persona, setPersona] = useState<AssistantPersona>("backend");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerPersona, setAnswerPersona] = useState<AssistantPersona | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = message.trim();
    if (!question || pending) return;
    setPending(true);
    setError(null);
    setCopied(false);
    setCopyError(null);
    try {
      const response = await api.askAssistant(persona, question);
      setAnswer(response.answer);
      setAnswerPersona(response.persona);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 503) {
        setError(
          "Code Assist is unavailable. Enable it in the backend environment, then restart the API.",
        );
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not reach Code Assist.",
        );
      }
    } finally {
      setPending(false);
    }
  };

  const copyAnswer = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
    } catch {
      setCopyError("Could not copy the response.");
    }
  };

  return (
    <WorkspacePage className="bg-[var(--ground)]">
      <WorkspacePageHeader
        eyebrow={
          <>
            <Sparkles className="inline h-3.5 w-3.5" /> Local code guidance
          </>
        }
        title="Code Assist"
        description="Ask for implementation guidance. Answers use the selected SoloTensor persona; no files, images, secrets, or workspace history are sent."
      />

      <form onSubmit={submit} className="workspace-bezel mt-6 grid gap-5 p-4 sm:p-5">
        <fieldset>
          <legend className="mb-3 text-xs font-semibold text-[var(--ink-soft)]">
            Focus
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {PERSONAS.map(({ id, title, description, icon: Icon }) => {
              const selected = persona === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={pending}
                  onClick={() => setPersona(id)}
                  aria-pressed={selected}
                  className={`flex items-start gap-3 workspace-core rounded-[var(--radius-panel)] border p-4 text-left transition-[transform,border-color,background-color] duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-70 ${selected ? "border-[var(--accent)]/50 bg-[var(--accent)]/5" : "border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--line-strong)]"}`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] ${selected ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface-soft)] text-[var(--ink-faint)]"}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--ink)]">
                      {title}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--ink-soft)]">
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="grid gap-2">
          <span className="text-xs font-semibold text-[var(--ink-soft)]">
            Question
          </span>
          <textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setError(null);
            }}
            maxLength={12000}
            rows={8}
            placeholder="Example: Where should a new ComfyUI endpoint live, and how should I test it?"
            className="workspace-field w-full resize-y p-4 text-sm leading-6 outline-none"
          />
          <span className="text-right text-[10px] text-[var(--ink-faint)]">
            {message.length.toLocaleString()} / 12,000
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
          <p className="max-w-lg text-xs leading-5 text-[var(--ink-faint)]">
            Single response only. Code Assist cannot read or change your files.
          </p>
          <button
            type="submit"
            disabled={!message.trim() || pending}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--accent-ink)] transition duration-200 hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {pending ? "Thinking" : "Ask assistant"}
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-5 flex gap-3 rounded-[var(--radius-panel)] border border-[var(--danger-line)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {answer && (
        <section
          aria-live="polite"
          className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-raised)]"
        >
          <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-xs font-semibold text-[var(--accent)]">
              {answerPersona} guidance
            </h2>{" "}
            <div className="flex items-center gap-3">
              <span
                role="status"
                aria-live="polite"
                className="text-xs text-[var(--danger)]"
              >
                {copyError}
              </span>
              <button
                type="button"
                onClick={copyAnswer}
                className="workspace-action-quiet gap-1.5 text-xs"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap break-words p-5 font-sans text-sm leading-7 text-[var(--ink)]">
            {answer}
          </pre>
        </section>
      )}
      <WorkspaceFooter />
    </WorkspacePage>
  );
}
