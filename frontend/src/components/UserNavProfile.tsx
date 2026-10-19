"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Key,
  LogOut,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import RoleBadge from "@/components/RoleBadge";
import UserAvatar from "@/components/UserAvatar";

export default function UserNavProfile() {
  const {
    user,
    credits,
    isAuthenticated,
    logout,
    openAuthModal,
    claimDaily,
    resendVerification,
    primaryRole,
    isMod,
    isAdmin,
    pendingReviewCount,
    switchRoleDemo,
  } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const [switchingRole, setSwitchingRole] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside or escape key
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuOpen]);

  const initials = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "ST";

  const handleClaim = async () => {
    const res = await claimDaily();
    setClaimFeedback(res.message);
    setTimeout(() => setClaimFeedback(null), 3000);
  };

  const handleResendVerification = async () => {
    setResendBusy(true);
    setResendFeedback(null);
    try {
      const res = await resendVerification();
      setResendFeedback(res.message);
      setTimeout(() => setResendFeedback(null), 4000);
    } catch {
      setResendFeedback("Could not resend verification email");
    } finally {
      setResendBusy(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={openAuthModal}
          aria-label="Sign In to SoloTensor"
          title="Sign In to SoloTensor"
          className="group relative flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] transition-all duration-200 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:border-[var(--accent)]"
        >
          <User className="h-4.5 w-4.5" />
          {/* Active Acid-Lime Presence Indicator */}
          <span
            aria-hidden="true"
            className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(213,240,111,0.6)]"
          />
          {/* Tooltip on desktop */}
          <span className="pointer-events-none absolute left-[calc(100%+.85rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase text-[var(--ink)] opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:block z-50">
            Sign In
          </span>
        </button>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative flex items-center justify-center">
      {/* Authenticated Avatar Trigger */}
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`User menu for ${user?.displayName || user?.username}`}
        className="group relative flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] transition-all duration-200 hover:border-[var(--accent)] hover:shadow-[0_0_12px_rgba(213,240,111,0.25)] focus-visible:outline-none focus-visible:border-[var(--accent)]"
      >
        <UserAvatar
          src={user?.avatarUrl}
          name={user?.displayName}
          username={user?.username}
          role={primaryRole}
          size="md"
          showRoleRing={true}
          online={true}
        />

        {/* Tooltip on desktop when menu is closed */}
        {!menuOpen && (
          <span className="pointer-events-none absolute left-[calc(100%+.85rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wider text-[var(--ink)] opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:block z-50">
            {user?.displayName || user?.username}
          </span>
        )}
      </button>

      {/* Obsidian Flyout Menu */}
      {menuOpen && (
        <div
          role="menu"
          aria-label="User Account Menu"
          className="absolute bottom-[calc(100%+0.75rem)] right-0 md:bottom-0 md:right-auto md:left-[calc(100%+0.75rem)] z-50 w-64 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-3.5 shadow-[0_24px_72px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* User Identity Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-[var(--line)]">
            <UserAvatar
              src={user?.avatarUrl}
              name={user?.displayName}
              username={user?.username}
              role={primaryRole}
              size="lg"
              showRoleRing={true}
              online={true}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="truncate text-xs font-bold text-[var(--ink)]">
                  {user?.displayName || user?.username}
                </span>
                <RoleBadge role={primaryRole} size="xs" />
              </div>
              <p className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
                @{user?.username}
              </p>
            </div>
          </div>

          {/* Tier Pill & Status */}
          <div className="my-2 flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              PRIMARY ROLE
            </span>
            <div className="flex items-center gap-1.5">
              {user?.is_verified === false && (
                <span className="rounded bg-[var(--warning-surface)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--warning)] border border-[var(--warning)]/30">
                  UNVERIFIED
                </span>
              )}
              <RoleBadge role={primaryRole} size="xs" />
            </div>
          </div>

          {/* Quick Persona Switcher for Pairing & Moderation Testing */}
          <div className="my-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                SWITCH PERSONA
              </span>
              <span className="font-mono text-[8px] font-bold text-[var(--accent)] tracking-wider">
                {switchingRole ? "AUTH…" : "DEV RBAC"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                disabled={switchingRole}
                onClick={async () => {
                  setSwitchingRole(true);
                  try {
                    await switchRoleDemo("creator");
                  } finally {
                    setSwitchingRole(false);
                  }
                }}
                className={`rounded py-1 font-mono text-[10px] uppercase font-bold transition disabled:opacity-50 ${
                  primaryRole === "creator"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
                title="Switch to Creator (@cyber_artisan)"
              >
                Creator
              </button>
              <button
                type="button"
                disabled={switchingRole}
                onClick={async () => {
                  setSwitchingRole(true);
                  try {
                    await switchRoleDemo("moderator");
                  } finally {
                    setSwitchingRole(false);
                  }
                }}
                className={`rounded py-1 font-mono text-[10px] uppercase font-bold transition disabled:opacity-50 ${
                  primaryRole === "moderator"
                    ? "bg-[#0284c7] text-white"
                    : "bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[#38bdf8]"
                }`}
                title="Switch to Moderator (@sentinel_mod)"
              >
                Mod
              </button>
              <button
                type="button"
                disabled={switchingRole}
                onClick={async () => {
                  setSwitchingRole(true);
                  try {
                    await switchRoleDemo("admin");
                  } finally {
                    setSwitchingRole(false);
                  }
                }}
                className={`rounded py-1 font-mono text-[10px] uppercase font-bold transition disabled:opacity-50 ${
                  primaryRole === "admin"
                    ? "bg-[#e11d48] text-white"
                    : "bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[#fb7185]"
                }`}
                title="Switch to Admin (@winnguyen282)"
              >
                Admin
              </button>
            </div>
          </div>

          {/* Unverified Warning & Action Banner */}
          {user?.is_verified === false && (
            <div className="mb-2.5 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-surface)] p-2.5">
              <div className="flex items-center gap-1.5 text-[var(--warning)] font-mono text-[10px] font-bold uppercase">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Verification Required</span>
              </div>
              <p className="mt-1 font-mono text-[9px] text-[var(--ink-soft)] leading-snug">
                Verify your email address to unlock model enclaves and remote tools.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendBusy}
                  className="flex-1 rounded border border-[var(--warning)]/40 bg-[var(--surface)] py-1 font-mono text-[10px] font-bold uppercase text-[var(--warning)] hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50"
                >
                  {resendBusy ? "Sending…" : "Resend Email"}
                </button>
                <Link
                  href="/verify-email"
                  onClick={() => setMenuOpen(false)}
                  className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] font-bold uppercase text-[var(--ink)] hover:bg-[var(--surface-raised)] transition-colors"
                >
                  Enter Code
                </Link>
              </div>
              {resendFeedback && (
                <p className="mt-1.5 font-mono text-[9px] text-[var(--accent)]">
                  {resendFeedback}
                </p>
              )}
            </div>
          )}

          {/* Credits Summary & Quick Claim */}
          <div className="space-y-2 mb-2.5">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-[var(--ink-soft)] flex items-center gap-1">
                <Zap className="h-3 w-3 text-[var(--accent)] fill-current" />
                Energy Pool
              </span>
              <span className="font-bold tabular-nums text-[var(--ink)]">
                {credits.balance} / {credits.dailyAllowance} ⚡
              </span>
            </div>

            {credits.balance < credits.dailyAllowance && (
              <button
                type="button"
                onClick={handleClaim}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20"
              >
                <Sparkles className="h-3 w-3" />
                <span>Claim +25 Daily Bonus</span>
              </button>
            )}
            {claimFeedback && (
              <p className="font-mono text-[9px] text-center text-[var(--accent)]">
                {claimFeedback}
              </p>
            )}
          </div>

          {/* Hairline Divider */}
          <div className="border-t border-[var(--line)] my-2" />

          {/* Navigation Links */}
          <div className="space-y-1">
            <Link
              href={`/user/${user?.username || "riiwa"}`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              <User className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Public Profile</span>
            </Link>

            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              <Settings className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
              <span>Studio Settings</span>
            </Link>

            <Link
              href="/settings#api-keys"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              <Key className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
              <span>API Enclaves & Keys</span>
            </Link>

            {(isMod || isAdmin) && (
              <Link
                href="/admin/moderation"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between rounded-lg border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2.5 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--surface-soft)] hover:text-white"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Moderation Darkroom</span>
                </div>
                {pendingReviewCount > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-mono font-bold text-amber-300 border border-amber-500/40 animate-pulse">
                    {pendingReviewCount}
                  </span>
                )}
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-surface)]"
            >
              <LogOut className="h-3.5 w-3.5 text-[var(--danger)]" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
