"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BrandLogo } from "@/components/BrandLogo";

type VerificationStatus = "idle" | "verifying" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const { verifyEmail, resendVerification, user } = useAuth();

  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);

  // 6-digit OTP code input state
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleAutoVerify = useCallback(
    async (token: string) => {
      setStatus("verifying");
      setErrorMessage(null);
      try {
        const res = await verifyEmail({ token });
        if (res.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage(res.message);
        }
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Verification token is invalid or expired."
        );
      }
    },
    [verifyEmail]
  );

  // Auto-verify if ?token=... is present in searchParams
  useEffect(() => {
    if (tokenParam && status === "idle") {
      void handleAutoVerify(tokenParam);
    }
  }, [tokenParam, status, handleAutoVerify]);

  const handleDigitChange = (index: number, val: string) => {
    // Only accept alphanumeric characters
    const clean = val.replace(/[^a-zA-Z0-9]/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // Handle paste of multiple characters
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split("");
      const next = [...digits];
      for (let i = 0; i < 6; i++) {
        next[i] = chars[i] || "";
      }
      setDigits(next);
      const targetFocus = Math.min(chars.length, 5);
      inputRefs.current[targetFocus]?.focus();
      return;
    }

    // Single digit input
    const next = [...digits];
    next[index] = clean.slice(-1);
    setDigits(next);

    // Auto-advance to next input
    if (index < 5 && clean) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join("").trim();
    if (code.length < 6) {
      setErrorMessage("Please enter all 6 characters of the verification code");
      return;
    }
    setStatus("verifying");
    setErrorMessage(null);
    try {
      const res = await verifyEmail({ otp_code: code, token: tokenParam || undefined });
      if (res.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(res.message);
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Verification failed. Code may be invalid or expired."
      );
    }
  };

  const handleResend = async () => {
    const target = emailParam || user?.email;
    setResendBusy(true);
    setResendStatus(null);
    try {
      const res = await resendVerification(target);
      setResendStatus(res.message);
      setTimeout(() => setResendStatus(null), 4000);
    } catch {
      setResendStatus("Failed to resend verification email");
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center p-4">
      <div className="workspace-bezel w-full max-w-md p-1 shadow-[0_32px_96px_rgba(0,0,0,0.85)]">
        <div className="workspace-core rounded-[var(--radius-panel)] p-6 md:p-8">
          {/* Header Badge */}
          <div className="mb-6 flex items-center justify-between border-b border-[var(--line)] pb-4">
            <BrandLogo size="md" subtitle="NODE VERIFICATION // SEC-NODE" href="/" />
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>

          {/* STATE: VERIFYING */}
          {status === "verifying" && (
            <div className="space-y-6 py-6 text-center animate-in fade-in duration-200">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-[var(--accent)] opacity-20 animate-ping" />
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--accent)]/50 bg-[var(--surface-raised)] text-[var(--accent)] shadow-[0_0_24px_rgba(213,240,111,0.3)]">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              </div>

              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
                  VALIDATING SIGNATURE // SEC-NODE
                </span>
                <p className="mt-2 font-mono text-xs text-[var(--ink-soft)]">
                  Cryptographic verification in progress. Synchronizing account state…
                </p>
              </div>
            </div>
          )}

          {/* STATE: SUCCESS */}
          {status === "success" && (
            <div className="space-y-6 py-4 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_36px_rgba(213,240,111,0.3)]">
                <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
              </div>

              <div>
                <span className="rounded bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] border border-[var(--accent)]/20">
                  SEC-NODE ACTIVE
                </span>
                <h2 className="mt-3 font-mono text-base font-bold text-[var(--ink)]">
                  EMAIL VERIFIED
                </h2>
                <p className="mt-2 font-mono text-xs leading-relaxed text-[var(--ink-soft)]">
                  Email verified. Full studio capabilities and model enclaves unlocked.
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
          )}

          {/* STATE: IDLE OR ERROR (SHOW FORM) */}
          {(status === "idle" || status === "error") && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {status === "error" && errorMessage && (
                <div className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-xs font-mono text-[var(--danger)]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1 leading-relaxed">{errorMessage}</div>
                </div>
              )}

              <p className="font-mono text-xs leading-relaxed text-[var(--ink-soft)]">
                Enter the 6-character verification code dispatched to your email address to unlock all studio features.
              </p>

              {/* 6-Digit OTP Block */}
              <form onSubmit={handleManualSubmit} className="space-y-5">
                <div>
                  <label className="block mb-2 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase">
                    Security Passcode
                  </label>
                  <div className="flex justify-between gap-2">
                    {digits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          inputRefs.current[i] = el;
                        }}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        autoFocus={i === 0}
                        className="h-12 w-12 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] text-center font-mono text-lg font-bold text-[var(--ink)] uppercase outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface)]"
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={digits.join("").length < 6}
                  className="workspace-action-primary flex h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] disabled:opacity-40"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Verify Passcode ⚡</span>
                </button>
              </form>

              {/* Resend & Secondary Actions */}
              <div className="space-y-2 border-t border-[var(--line)] pt-4 text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendBusy}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
                >
                  <RefreshCw className={`h-3 w-3 ${resendBusy ? "animate-spin" : ""}`} />
                  <span>Request New Verification Link</span>
                </button>

                {resendStatus && (
                  <p className="font-mono text-[10px] text-[var(--accent)]">
                    {resendStatus}
                  </p>
                )}

                <div>
                  <Link
                    href="/"
                    className="inline-block pt-1 font-mono text-[10px] uppercase text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  >
                    ← Return to Studio
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Footer Note */}
          <div className="mt-6 border-t border-[var(--line)] pt-3 text-center">
            <span className="font-mono text-[9px] tracking-wider text-[var(--ink-faint)] uppercase">
              ENCLAVE ENCRYPTION ACTIVE // LOCAL ZERO-TRUST VERIFIER
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center p-4">
          <div className="font-mono text-xs text-[var(--ink-faint)] flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            <span>LOADING VERIFIER // SEC-NODE…</span>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
