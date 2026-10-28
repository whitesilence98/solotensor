"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Network,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { api, ApiError, type AppSettingsSnapshot, type AppSettingsUpdate, type DirectorProvider } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import WorkspaceNavbar from "@/components/WorkspaceNavbar";

type Notice = { type: "ok" | "error"; text: string } | null;

const SOURCE_LABEL: Record<string, string> = {
  file: "FROM ADMIN",
  env: "FROM .ENV",
  default: "DEFAULT",
};

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
        {children}
      </label>
      {hint && <span className="font-mono text-[10px] text-[var(--ink-faint)]">{hint}</span>}
    </div>
  );
}

function SourceTag({ source }: { source?: string }) {
  if (!source) return null;
  return (
    <span className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--ink)]">{label}</div>
        <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked
            ? "border-[var(--accent)] bg-[var(--accent)]"
            : "border-[var(--line-strong)] bg-[var(--surface-sunken)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            checked ? "left-[18px] bg-[var(--accent-ink)]" : "left-0.5 bg-[var(--ink-faint)]"
          }`}
        />
      </button>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { isAdmin, hasPermission } = useAuth();
  const canAccess = isAdmin || hasPermission("admin:full_access");

  const [snapshot, setSnapshot] = useState<AppSettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<AppSettingsUpdate>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<DirectorProvider | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAppSettings();
      setSnapshot(data);
      setDraft({
        director_enabled: data.director_enabled,
        director_provider: data.director_provider,
        director_model: data.director_model,
        assistant_enabled: data.assistant_enabled,
        assistant_model: data.assistant_model,
        local_llm_url: data.local_llm_url,
        local_llm_model: data.local_llm_model,
        proxy_url: data.proxy_url,
        proxy_bypass_local: data.proxy_bypass_local,
      });
      setNotice(null);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setNotice({
        type: "error",
        text:
          status === 401 || status === 403
            ? "Your session lacks the 'admin:full_access' permission."
            : status === 404
              ? "The settings endpoint is missing — restart the FastAPI backend so the new route is loaded."
              : "Could not load the current settings.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canAccess) void load();
  }, [canAccess, load]);

  const set = <K extends keyof AppSettingsUpdate>(key: K, value: AppSettingsUpdate[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const data = await api.updateAppSettings(draft);
      setSnapshot(data);
      setDraft((prev) => ({ ...prev, anthropic_api_key: "", local_llm_api_key: "" }));
      setNotice({ type: "ok", text: "Saved. Changes apply immediately — no restart." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof ApiError ? error.message : "Could not save the settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const test = async (provider: DirectorProvider) => {
    setTesting(provider);
    try {
      const result = await api.testAppProvider(provider);
      setTestResult((prev) => ({ ...prev, [provider]: result }));
    } catch {
      setTestResult((prev) => ({
        ...prev,
        [provider]: { ok: false, detail: "The probe request failed." },
      }));
    } finally {
      setTesting(null);
    }
  };

  const clearKey = async (provider: DirectorProvider) => {
    if (!window.confirm(`Delete the stored ${provider} API key?`)) return;
    try {
      setSnapshot(await api.clearProviderKey(provider));
      setNotice({ type: "ok", text: "Key deleted." });
    } catch {
      setNotice({ type: "error", text: "Could not delete the key." });
    }
  };

  if (!canAccess) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[var(--ground)] p-6 text-[var(--ink)]">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-[var(--danger-line)] bg-[var(--surface-raised)] p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger)]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-base font-semibold">Administrator access required</h1>
          <p className="text-xs text-[var(--ink-soft)]">
            This page configures provider credentials for the whole studio. Ask an
            administrator for the <code className="font-mono">admin:full_access</code> permission.
          </p>
        </div>
      </div>
    );
  }

  const source = (field: string) => snapshot?.sources?.[field];

  return (
    <main
      id="main-content"
      className="workspace-scroll flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)] antialiased"
    >
      <WorkspaceNavbar
        subtitle="CONTROL // AI RUNTIME"
        href="/admin/settings"
        maxWidth="max-w-5xl"
        statusText="ADMIN"
        statusVariant="warning"
      />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
        <header className="border-b border-[var(--line)] pb-5">
          <h1 className="workspace-title">AI Runtime</h1>
          <p className="workspace-copy mt-1">
            Provider keys, models and the outbound proxy. Values save to{" "}
            <code className="font-mono text-[var(--ink-soft)]">backend/app_settings.json</code> and
            take effect without restarting the API.
          </p>
        </header>

        {notice && (
          <div
            role="status"
            className={`mt-4 flex items-start gap-2.5 rounded-lg p-3 text-xs ${
              notice.type === "ok"
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "workspace-alert"
            }`}
          >
            {notice.type === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        {loading ? (
          <div className="mt-6 flex items-center gap-2 font-mono text-xs text-[var(--ink-faint)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading configuration…
          </div>
        ) : !snapshot ? (
          <div className="workspace-empty mt-6 flex flex-col items-start gap-3 p-5">
            <p className="text-sm text-[var(--ink-soft)]">
              Settings could not be loaded.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="workspace-action-secondary inline-flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11px]"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* --- Anthropic ------------------------------------------------- */}
            <section className="workspace-bezel mt-6 p-6 md:p-8" aria-label="Anthropic provider">
              <div className="workspace-core p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]">
                      Anthropic
                    </h2>
                    <SourceTag source={source("anthropic_api_key")} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void test("anthropic")}
                    disabled={testing !== null}
                    className="workspace-action-secondary inline-flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11px]"
                  >
                    {testing === "anthropic" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    Test
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <FieldLabel hint={snapshot.anthropic_api_key_set ? "Stored" : "Not set"}>
                      API key
                    </FieldLabel>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={reveal.anthropic ? "text" : "password"}
                          value={draft.anthropic_api_key ?? ""}
                          onChange={(e) => set("anthropic_api_key", e.target.value)}
                          placeholder={
                            snapshot.anthropic_api_key_set
                              ? `Stored · ${snapshot.anthropic_api_key_hint} — leave blank to keep`
                              : "sk-ant-…"
                          }
                          autoComplete="off"
                          className="workspace-field w-full px-3 py-2 pr-9 font-mono text-xs placeholder:text-[var(--ink-faint)]"
                        />
                        <button
                          type="button"
                          aria-label={reveal.anthropic ? "Hide key" : "Show key"}
                          onClick={() =>
                            setReveal((prev) => ({ ...prev, anthropic: !prev.anthropic }))
                          }
                          className="absolute right-2 top-2 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                        >
                          {reveal.anthropic ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {snapshot.anthropic_api_key_set && (
                        <button
                          type="button"
                          onClick={() => void clearKey("anthropic")}
                          aria-label="Delete stored Anthropic key"
                          className="workspace-action-secondary inline-flex h-[34px] w-[34px] items-center justify-center text-[var(--danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <FieldLabel hint="claude-opus-5-5 recommended">
                      Director model
                    </FieldLabel>
                    <input
                      value={draft.director_model ?? ""}
                      onChange={(e) => set("director_model", e.target.value)}
                      spellCheck={false}
                      className="workspace-field w-full px-3 py-2 font-mono text-xs"
                    />
                  </div>

                  <div className="border-t border-[var(--line)] pt-2">
                    <Toggle
                      checked={draft.director_enabled ?? false}
                      onChange={(next) => set("director_enabled", next)}
                      label="Flow director"
                      description="Enables the /flow creative-director chat."
                    />
                    <Toggle
                      checked={draft.assistant_enabled ?? false}
                      onChange={(next) => set("assistant_enabled", next)}
                      label="Code assist"
                      description="Enables the /assist code assistant (billed per request)."
                    />
                  </div>

                  {testResult.anthropic && (
                    <p
                      className={`font-mono text-[11px] ${
                        testResult.anthropic.ok ? "text-emerald-400" : "text-[var(--danger)]"
                      }`}
                    >
                      {testResult.anthropic.ok ? "OK — " : "Failed — "}
                      {testResult.anthropic.detail}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* --- Local / OpenAI-compatible --------------------------------- */}
            <section className="workspace-bezel mt-6 p-6 md:p-8" aria-label="Local model provider">
              <div className="workspace-core p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
                  <div className="flex items-center gap-2.5">
                    <Network className="h-4 w-4 text-[var(--accent)]" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]">
                      Local / OpenAI-compatible
                    </h2>
                    <SourceTag source={source("local_llm_url")} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void test("local")}
                    disabled={testing !== null}
                    className="workspace-action-secondary inline-flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11px]"
                  >
                    {testing === "local" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    Test
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <FieldLabel hint="Ollama Cloud: https://ollama.com">
                      Base URL
                    </FieldLabel>
                    <input
                      value={draft.local_llm_url ?? ""}
                      onChange={(e) => set("local_llm_url", e.target.value)}
                      spellCheck={false}
                      placeholder="http://127.0.0.1:11434"
                      className="workspace-field w-full px-3 py-2 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <FieldLabel>Model</FieldLabel>
                    <input
                      value={draft.local_llm_model ?? ""}
                      onChange={(e) => set("local_llm_model", e.target.value)}
                      spellCheck={false}
                      placeholder="llama3.2"
                      className="workspace-field w-full px-3 py-2 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <FieldLabel
                      hint={snapshot.local_llm_api_key_set ? "Stored" : "Optional"}
                    >
                      API key
                    </FieldLabel>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={reveal.local ? "text" : "password"}
                          value={draft.local_llm_api_key ?? ""}
                          onChange={(e) => set("local_llm_api_key", e.target.value)}
                          placeholder={
                            snapshot.local_llm_api_key_set
                              ? `Stored · ${snapshot.local_llm_api_key_hint} — leave blank to keep`
                              : "Only needed for a hosted endpoint"
                          }
                          autoComplete="off"
                          className="workspace-field w-full px-3 py-2 pr-9 font-mono text-xs placeholder:text-[var(--ink-faint)]"
                        />
                        <button
                          type="button"
                          aria-label={reveal.local ? "Hide key" : "Show key"}
                          onClick={() =>
                            setReveal((prev) => ({ ...prev, local: !prev.local }))
                          }
                          className="absolute right-2 top-2 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                        >
                          {reveal.local ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {snapshot.local_llm_api_key_set && (
                        <button
                          type="button"
                          onClick={() => void clearKey("local")}
                          aria-label="Delete stored local endpoint key"
                          className="workspace-action-secondary inline-flex h-[34px] w-[34px] items-center justify-center text-[var(--danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Default director provider</FieldLabel>
                    <div className="flex gap-1.5">
                      {(["local", "anthropic"] as const).map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          aria-pressed={draft.director_provider === provider}
                          data-active={draft.director_provider === provider}
                          onClick={() => set("director_provider", provider)}
                          className="workspace-chip px-3 py-1.5 font-mono text-[11px]"
                        >
                          {provider}
                        </button>
                      ))}
                    </div>
                  </div>

                  {testResult.local && (
                    <p
                      className={`font-mono text-[11px] ${
                        testResult.local.ok ? "text-emerald-400" : "text-[var(--danger)]"
                      }`}
                    >
                      {testResult.local.ok ? "OK — " : "Failed — "}
                      {testResult.local.detail}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* --- Network --------------------------------------------------- */}
            <section className="workspace-bezel mt-6 p-6 md:p-8" aria-label="Network">
              <div className="workspace-core p-5 md:p-6">
                <div className="border-b border-[var(--line)] pb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]">
                    Outbound proxy
                  </h2>
                  <p className="mt-1 text-xs text-[var(--ink-faint)]">
                    Transport-only HTTP proxy for outbound AI calls. It cannot change the model
                    behind a request — for that, point the local endpoint at a translating gateway.
                  </p>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <FieldLabel hint="Blank disables the proxy">
                      Proxy URL
                    </FieldLabel>
                    <input
                      value={draft.proxy_url ?? ""}
                      onChange={(e) => set("proxy_url", e.target.value)}
                      spellCheck={false}
                      placeholder="http://proxy.example.com:8080"
                      className="workspace-field w-full px-3 py-2 font-mono text-xs"
                    />
                  </div>
                  <Toggle
                    checked={draft.proxy_bypass_local ?? true}
                    onChange={(next) => set("proxy_bypass_local", next)}
                    label="Bypass for local addresses"
                    description="Keep localhost, 127.0.0.1 and ::1 off the proxy. ComfyUI is never proxied."
                  />
                </div>
              </div>
            </section>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-4">
              <p className="max-w-lg text-[11px] leading-relaxed text-[var(--ink-faint)]">
                Keys are stored unencrypted in{" "}
                <code className="font-mono">backend/app_settings.json</code>, which is gitignored.
                Anyone who can read that file on this machine can read the keys.
              </p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="workspace-action-primary inline-flex h-9 items-center gap-2 px-4 text-xs"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save settings
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
