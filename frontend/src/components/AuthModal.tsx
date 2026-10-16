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
    closeAuthModal,
    login,
    loginWithOAuth,
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
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
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

  const handleSocialSignIn = async (provider: "google" | "discord") => {
    setError(null);
    setBusy(true);
    try {
      const socialUser = await loginWithOAuth(provider);
      if (socialUser?.username) {
        router.push(`/user/${encodeURIComponent(socialUser.username)}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to authenticate with ${provider}`
      );
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
        {/* Top Header with BrandLogo & Close Button */}
        <div className="flex items-start justify-between mb-5 pb-4 border-b border-[var(--line)]">
          <BrandLogo
            size="md"
            subtitle={
              tab === "forgot"
                ? "ACCESS RECOVERY // NODE RESET"
                : "STUDIO AUTH // SEC-NODE"
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

        {/* Normal Mode: Social Buttons and Switcher */}
        {tab !== "forgot" && (
          <>
            {/* 1-Click Social Sign-in Buttons */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <button
                type="button"
                onClick={() => handleSocialSignIn("google")}
                disabled={busy}
                className="flex h-10 items-center justify-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] transition-all hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] active:scale-[0.98] disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
                  />
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleSocialSignIn("discord")}
                disabled={busy}
                className="flex h-10 items-center justify-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] transition-all hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] active:scale-[0.98] disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4 shrink-0 fill-[#5865F2]"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <span>Discord</span>
              </button>
            </div>

            {/* Hairline Divider with Technical Monospace Notice */}
            <div className="relative mb-5 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--line)]" />
              </div>
              <span className="relative bg-[var(--surface-raised)] px-3 font-mono text-[10px] tracking-widest text-[var(--ink-faint)] uppercase">
                OR CONTINUE WITH ACCOUNT
              </span>
            </div>

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
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-xs font-mono text-[var(--danger)]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1 leading-snug">{error}</span>
          </div>
        )}

        {/* Success Banner */}
        {successMessage && !forgotSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs font-mono text-[var(--accent)]">
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
                  placeholder="creator@solotensor.local"
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
                      placeholder="creator@solotensor.local"
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
            LOCAL-FIRST ENCLAVE // JWT TOKENS CACHED IN LOCAL STORAGE
          </p>
        </div>
      </div>
    </div>
  );
}
