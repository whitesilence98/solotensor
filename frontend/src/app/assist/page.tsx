"use client";

import { useState } from "react";
import { AlertCircle, Check, Clipboard, Code2, LoaderCircle, Send, Server, Sparkles } from "lucide-react";
import { api, ApiError, type AssistantPersona } from "@/lib/api";

const PERSONAS: Array<{ id: AssistantPersona; title: string; description: string; icon: typeof Server }> = [
  { id: "backend", title: "Backend", description: "FastAPI, contracts, ComfyUI, tests", icon: Server },
  { id: "frontend", title: "Frontend", description: "Next.js, React, UI, accessibility", icon: Code2 },
];

export default function AssistPage() {
  const [persona, setPersona] = useState<AssistantPersona>("backend");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerPersona, setAnswerPersona] = useState<AssistantPersona | null>(null);
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
        setError("Code Assist is unavailable. Enable it in the backend environment, then restart the API.");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not reach Code Assist.");
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
    <main id="main-content" className="workspace-page bg-[radial-gradient(circle_at_84%_0%,rgba(213,240,111,.07),transparent_28rem)]">
      <div className="mx-auto max-w-5xl">
        <header className="workspace-header">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--accent)]"><Sparkles className="h-3.5 w-3.5" /> Local code guidance</div>
          <h1 className="workspace-title">Code Assist</h1>
          <p className="workspace-copy mt-3">Ask for implementation guidance. Answers use the selected SoloTensor persona; no files, images, secrets, or workspace history are sent.</p>
        </header>

        <form onSubmit={submit} className="mt-6 grid gap-4">
          <fieldset>
            <legend className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-[#aaa8a1]">Focus</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {PERSONAS.map(({ id, title, description, icon: Icon }) => {
                const selected = persona === id;
                return <button key={id} type="button" disabled={pending} onClick={() => setPersona(id)} aria-pressed={selected} className={`flex items-start gap-3 border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5f06f] disabled:cursor-wait disabled:opacity-70 ${selected ? "border-[#d5f06f]/50 bg-[#d5f06f]/10" : "border-[#292d28] bg-[#111311] hover:border-[#3a4038]"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[.45rem] ${selected ? "bg-[#d5f06f] text-[#171b08]" : "bg-[#20231f] text-[#8a8d85]"}`}><Icon className="h-4 w-4" /></span>
                  <span><span className="block text-sm font-semibold text-[#f2f0e9]">{title}</span><span className="mt-1 block text-xs text-[#8a8d85]">{description}</span></span>
                </button>;
              })}
            </div>
          </fieldset>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[.16em] text-[#aaa8a1]">Question</span>
            <textarea value={message} onChange={(event) => { setMessage(event.target.value); setError(null); }} maxLength={12000} rows={8} placeholder="Example: Where should a new ComfyUI endpoint live, and how should I test it?" className="workspace-field w-full resize-y p-4 text-sm leading-6 outline-none" />
            <span className="text-right text-[10px] text-[#6f716d]">{message.length.toLocaleString()} / 12,000</span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#292d28] pt-4">
            <p className="max-w-lg text-xs leading-5 text-[#6f716d]">Single response only. Code Assist cannot read or change your files.</p>
            <button type="submit" disabled={!message.trim() || pending} className="inline-flex items-center gap-2 rounded-[.55rem] bg-[#d5f06f] px-4 py-3 text-sm font-bold text-[#171b08] transition hover:bg-[#e2f88a] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5f06f]">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{pending ? "Thinking" : "Ask assistant"}</button>
          </div>
        </form>

        {error && <div role="alert" className="mt-5 flex gap-3 border border-[#6d332e] bg-[#241412] p-4 text-sm text-[#ef8c79]"><AlertCircle className="h-5 w-5 shrink-0" /><p>{error}</p></div>}

        {answer && <section aria-live="polite" className="mt-6 border border-[#292d28] bg-[#111311]">
          <div className="flex items-center justify-between gap-4 border-b border-[#292d28] px-4 py-3"><h2 className="text-xs font-semibold uppercase tracking-[.16em] text-[#d5f06f]">{answerPersona} guidance</h2>          <div className="flex items-center gap-3">
            <span role="status" aria-live="polite" className="text-xs text-[var(--danger)]">{copyError}</span>
            <button type="button" onClick={copyAnswer} className="workspace-action-quiet gap-1.5 text-xs">{copied ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : <Clipboard className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button>
          </div></div>
          <pre className="whitespace-pre-wrap break-words p-5 font-sans text-sm leading-7 text-[#deddd6]">{answer}</pre>
        </section>}
      </div>
    </main>
  );
}
