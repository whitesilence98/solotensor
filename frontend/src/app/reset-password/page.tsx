"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BrandLogo } from "@/components/BrandLogo";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const { resetPassword } = useAuth();

  const [tokenInput, setTokenInput] = useState(tokenParam);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveToken = tokenInput.trim() || tokenParam.trim();
    if (!effectiveToken) {
      setError("A valid reset token or 6-digit code is required");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const res = await resetPassword(effectiveToken, newPassword);
      if (res.success) {
        setIsSuccess(true);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset password. Token may be expired."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center p-4">
      <div className="workspace-bezel w-full max-w-md p-1 shadow-[0_32px_96px_rgba(0,0,0,0.85)]">
        <div className="workspace-core rounded-[var(--radius-panel)] p-6 md:p-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between border-b border-[var(--line)] pb-4">
            <BrandLogo size="md" subtitle="SECURITY CREDENTIALS // UPDATE" href="/" />
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)]">
              <KeyRound className="h-5 w-5" />
            </div>
          </div>

          {/* Success State */}
          {isSuccess ? (
            <div className="space-y-6 py-4 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_36px_rgba(213,240,111,0.3)]">
                <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
              </div>

              <div>
                <span className="rounded bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] border border-[var(--accent)]/20">
                  CREDENTIALS UPDATED
                </span>
                <h2 className="mt-3 font-mono text-base font-bold text-[var(--ink)]">
                  PASSWORD RESET COMPLETE
                </h2>
                <p className="mt-2 font-mono text-xs leading-relaxed text-[var(--ink-soft)]">
                  Your new credentials have been validated and saved to the enclave. You can now launch the studio.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/"
                  className="workspace-action-primary flex h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)]"
                >
                  <span>Launch Studio</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in duration-150">
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-xs font-mono text-[var(--danger)]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1 leading-relaxed">{error}</div>
                </div>
              )}

              {emailParam && (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2.5 font-mono text-xs text-[var(--ink-soft)]">
                  Resetting credentials for:{" "}
                  <span className="text-[var(--accent)] font-semibold">{emailParam}</span>
                </div>
              )}

              {/* Token Input if not provided via URL query */}
              {!tokenParam && (
                <div>
                  <label
                    htmlFor="reset-token"
                    className="block mb-1.5 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
                  >
                    Reset Token or Code
                  </label>
                  <div className="relative">
                    <input
                      id="reset-token"
                      type="text"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste token or enter code"
                      disabled={busy}
                      required
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                    />
                    <KeyRound className="absolute left-3 top-3 h-3.5 w-3.5 text-[var(--ink-faint)]" />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="new-password"
                  className="block mb-1.5 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    disabled={busy}
                    autoComplete="new-password"
                    required
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                  />
                  <Lock className="absolute left-3 top-3 h-3.5 w-3.5 text-[var(--ink-faint)]" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block mb-1.5 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    disabled={busy}
                    autoComplete="new-password"
                    required
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                  />
                  <Lock className="absolute left-3 top-3 h-3.5 w-3.5 text-[var(--ink-faint)]" />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="workspace-action-primary flex h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Updating Credentials…</span>
                  </>
                ) : (
                  <span>Set New Password ⚡</span>
                )}
              </button>

              <div className="border-t border-[var(--line)] pt-3 text-center">
                <Link
                  href="/"
                  className="font-mono text-[10px] uppercase text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  ← Return to Studio
                </Link>
              </div>
            </form>
          )}

          {/* Footer Note */}
          <div className="mt-6 border-t border-[var(--line)] pt-3 text-center">
            <span className="font-mono text-[9px] tracking-wider text-[var(--ink-faint)] uppercase">
              LOCAL-FIRST CIPHER // TOKENS ARE NEVER SHARED WITH THIRD PARTIES
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center p-4">
          <div className="font-mono text-xs text-[var(--ink-faint)] flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            <span>INITIALIZING SECURITY PROTOCOL…</span>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
