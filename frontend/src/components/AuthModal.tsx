"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import BrandLogo from "@/components/BrandLogo";

export default function AuthModal() {
  const router = useRouter();
  const {
    isAuthModalOpen,
    authModalReason,
    closeAuthModal,
    login,
    register,
    forgotPassword,
  } = useAuth();
  const [tab, setTab] = useState<"signin" | "register" | "forgot">("signin");

  // Sign In state
  const [signinIdentifier, setSigninIdentifier] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  // Register state
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const initialInputRef = useRef<HTMLInputElement>(null);
  // Element that opened the dialog, captured once on open and restored on close.
  const openerRef = useRef<HTMLElement | null>(null);

  // Capture the opener on open and restore focus on close. Kept separate from
  // the keydown effect (which re-runs on tab changes) so switching tabs can
  // never overwrite the real opener with a control inside the dialog.
  useEffect(() => {
    if (!isAuthModalOpen) return;
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      opener?.focus();
    };
  }, [isAuthModalOpen]);

  // Focus trap & escape key handler
  useEffect(() => {
    if (!isAuthModalOpen) {
      setError(null);
      setSuccessMessage(null);
      setForgotSuccess(false);
      setTab("signin");
      return;
    }

    // Auto-focus first input when opened
    const timer = setTimeout(() => {
      initialInputRef.current?.focus();
    }, 50);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAuthModal();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        // Focus that has escaped the dialog (or never entered it) is pulled
        // back to the correct edge before the normal wrap-around logic.
        if (!active || !dialogRef.current.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isAuthModalOpen, closeAuthModal, tab]);

  if (!isAuthModalOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signinIdentifier.trim()) {
      setError("Please enter your email or username");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const authenticatedUser = await login(signinIdentifier.trim(), signinPassword);
      if (authenticatedUser?.username) {
        router.push(`/user/${encodeURIComponent(authenticatedUser.username)}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to sign in. Please verify credentials."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerUsername.trim()) {
      setError("Username is required");
      return;
    }
    if (!registerEmail.trim() || !registerEmail.includes("@")) {
      setError("Valid email address is required");
      return;
    }
    if (registerPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const registeredUser = await register(
        registerEmail.trim(),
        registerUsername.trim(),
        registerPassword
      );
      if (registeredUser?.username) {
        router.push(`/user/${encodeURIComponent(registeredUser.username)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await forgotPassword(forgotEmail.trim());
      setSuccessMessage(res.message);
      setForgotSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to dispatch recovery instructions"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Dark Obsidian Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--overlay-backdrop)] backdrop-blur-md transition-opacity"
        onClick={closeAuthModal}
        aria-hidden="true"
      />

      {/* Brutalist Dialog Card */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-[0_32px_96px_rgba(0,0,0,0.85)] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Accessible name for aria-labelledby; the visible brand wordmark carries no id. */}
        <h2 id="auth-modal-title" className="sr-only">
          {tab === "forgot" ? "Account recovery" : "Creator sign in"}
        </h2>
        {/* Top Header with BrandLogo & Close Button */}
        <div className="flex items-start justify-between mb-5 pb-4 border-b border-[var(--line)]">
          <BrandLogo
            size="md"
            subtitle={
              tab === "forgot"
                ? "ACCOUNT RECOVERY"
                : "CREATOR SIGN IN"
            }
          />
          <button
            type="button"
            onClick={closeAuthModal}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:border-[var(--accent)]"
            aria-label="Close authentication modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contextual Action Prompt Banner */}
        {authModalReason && (
          <div className="mb-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-sunken)] p-3 text-left">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
              <span>⚡</span>
              <span>
                {authModalReason === "generation"
                  ? "Neural Compute Clearance Required"
                  : authModalReason === "tool_execution"
                  ? "Workflow Tool Execution"
                  : authModalReason === "create_model"
                  ? "Publish Creator Model"
                  : authModalReason === "create_tool"
                  ? "Author Parametric Tool"
                  : authModalReason === "download_weights"
                  ? "Model Checkpoint Access"
                  : authModalReason === "flag_content"
                  ? "Community Moderation Report"
                  : authModalReason === "flow_director"
                  ? "Shot Director Access"
                  : "Authentication Required"}
              </span>
            </div>
            <p className="mt-1 font-sans text-xs text-[var(--ink-soft)] leading-snug">
              {authModalReason === "generation"
                ? "Sign in with a free Creator account to claim your 100 daily energy pool and launch generative pipelines."
                : authModalReason === "tool_execution"
                ? "Sign in to dispatch studio tool workflows and sync results to your private studio library."
                : authModalReason === "create_model"
                ? "Sign in to publish creator models, upload safetensors weights, and share workflow recipes."
                : authModalReason === "create_tool"
                ? "Sign in to author parametric studio tools and deploy studio pipelines."
                : authModalReason === "download_weights"
                ? "Sign in to download safetensors checkpoint files and workstation weights."
                : authModalReason === "flag_content"
                ? "Sign in to submit content flags directly to the Solo Studio Trust & Safety darkroom."
                : authModalReason === "flow_director"
                ? "Sign in to plan shots with the creative director."
                : "Sign in to access privileged studio capabilities and preserve your studio workflows."}
            </p>
          </div>
        )}

        {/* Normal Mode: Account Switcher */}
        {tab !== "forgot" && (
          <>
            {/* Tab Switcher: Sign In vs Create Account */}
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-1 mb-4">
              <button
                type="button"
                onClick={() => {
                  setTab("signin");
                  setError(null);
                }}
                className={`flex h-8 items-center justify-center rounded-md font-mono text-[11px] font-bold tracking-wider uppercase transition-all ${
                  tab === "signin"
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] border border-[var(--line-strong)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setError(null);
                }}
                className={`flex h-8 items-center justify-center rounded-md font-mono text-[11px] font-bold tracking-wider uppercase transition-all ${
                  tab === "register"
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] border border-[var(--line-strong)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                Create Account
              </button>
            </div>
          </>
        )}

        {/* Forgot Mode: Breadcrumb Return */}
        {tab === "forgot" && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setError(null);
                setSuccessMessage(null);
                setForgotSuccess(false);
              }}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Sign In</span>
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-xs font-mono text-[var(--danger)]"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1 leading-snug">{error}</span>
          </div>
        )}

        {/* Success Banner */}
        {successMessage && !forgotSuccess && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs font-mono text-[var(--accent)]"
          >
            <Check className="h-4 w-4 shrink-0" />
            <span className="flex-1 leading-snug">{successMessage}</span>
          </div>
        )}

        {/* Sign In Form */}
        {tab === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-3.5">
            <div>
              <label
                htmlFor="signin-identifier"
                className="block mb-1.5 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
              >
                Email or Username
              </label>
              <div className="relative">
                <input
                  id="signin-identifier"
                  ref={initialInputRef}
                  type="text"
                  value={signinIdentifier}
                  onChange={(e) => setSigninIdentifier(e.target.value)}
                  placeholder="creator@solotensor.studio"
                  disabled={busy}
                  autoComplete="username"
                  required
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                />
                <User className="absolute left-3 top-3 h-3.5 w-3.5 text-[var(--ink-faint)]" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="signin-password"
                  className="font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setTab("forgot");
                    setError(null);
                    setSuccessMessage(null);
                    setForgotSuccess(false);
                  }}
                  className="font-mono text-[10px] text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors focus-visible:outline-none focus-visible:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="signin-password"
                  type="password"
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={busy}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                />
                <Lock className="absolute left-3 top-3 h-3.5 w-3.5 text-[var(--ink-faint)]" />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Verifying Enclave…</span>
                </>
              ) : (
                <span>Sign In to Studio</span>
              )}
            </button>
          </form>
        )}

        {/* Register Form */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label
                htmlFor="register-username"
                className="block mb-1 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
              >
                Creator Username
              </label>
              <div className="relative">
                <input
                  id="register-username"
                  ref={initialInputRef}
                  type="text"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  placeholder="solocreator"
                  disabled={busy}
                  autoComplete="username"
                  required
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                />
                <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--ink-faint)]" />
              </div>
            </div>

            <div>
              <label
                htmlFor="register-email"
                className="block mb-1 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
              >
                Email Address
              </label>
              <div className="relative">
                <input
                  id="register-email"
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="creator@domain.com"
                  disabled={busy}
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                />
                <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--ink-faint)]" />
              </div>
            </div>

            <div>
              <label
                htmlFor="register-password"
                className="block mb-1 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  disabled={busy}
                  autoComplete="new-password"
                  required
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                />
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--ink-faint)]" />
              </div>
            </div>

            <div>
              <label
                htmlFor="register-confirm"
                className="block mb-1 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="register-confirm"
                  type="password"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  disabled={busy}
                  autoComplete="new-password"
                  required
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                />
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--ink-faint)]" />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating Account…</span>
                </>
              ) : (
                <span>Register & Claim 100 ⚡</span>
              )}
            </button>
          </form>
        )}

        {/* Forgot Password Flow */}
        {tab === "forgot" && (
          <div>
            {forgotSuccess ? (
              <div className="space-y-4 py-2">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_24px_rgba(213,240,111,0.25)]">
                    <Check className="h-6 w-6" strokeWidth={2.5} />
                  </div>
                  <h3 className="font-mono text-sm font-bold text-[var(--ink)]">
                    RECOVERY TOKEN DISPATCHED
                  </h3>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-[var(--ink-soft)]">
                    A recovery link and 6-digit code have been dispatched to{" "}
                    <span className="text-[var(--accent)] font-bold">
                      {forgotEmail}
                    </span>
                    .
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <Link
                    href={`/reset-password?email=${encodeURIComponent(forgotEmail)}`}
                    onClick={closeAuthModal}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98]"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Enter Code on Reset Page</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setTab("signin");
                      setForgotSuccess(false);
                      setSuccessMessage(null);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2 font-mono text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                  >
                    <span>Back to Sign In</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-3.5">
                <p className="font-mono text-xs leading-relaxed text-[var(--ink-soft)]">
                  Enter your registered creator email address. An enclave reset link and security verification code will be dispatched.
                </p>

                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block mb-1.5 font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase"
                  >
                    Creator Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="forgot-email"
                      ref={initialInputRef}
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="creator@solotensor.studio"
                      disabled={busy}
                      autoComplete="email"
                      required
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 pl-9 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--accent)]"
                    />
                    <Mail className="absolute left-3 top-3 h-3.5 w-3.5 text-[var(--ink-faint)]" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Dispatching Token…</span>
                    </>
                  ) : (
                    <span>Send Reset Link ⚡</span>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer Technical Microcopy */}
        <div className="mt-5 border-t border-[var(--line)] pt-3 text-center">
          <p className="font-mono text-[9px] tracking-wider text-[var(--ink-faint)] uppercase">
            SECURE ENCRYPTED SESSION
          </p>
        </div>
      </div>
    </div>
  );
}
