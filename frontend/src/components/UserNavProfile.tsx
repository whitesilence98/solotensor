"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
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
    unreadNotificationCount,
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
          aria-label="Sign In to Solo Studio"
          title="Sign In to Solo Studio"
          className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--ink-faint)] transition-all duration-200 hover:border-[var(--accent)] hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:border-[var(--accent)]"
        >
          <User className="h-4.5 w-4.5" />
          {/* Dual status indicators: warm top, accent bottom */}
          <span
            aria-hidden="true"
            className="absolute top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--warning)] border border-[var(--ground)] shadow-[0_0_6px_color-mix(in_srgb,var(--warning)_80%,transparent)] z-20"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--accent)] border border-[var(--ground)] shadow-[0_0_6px_color-mix(in_srgb,var(--accent)_80%,transparent)] z-20"
          />
          {/* Tooltip on desktop */}
          <span className="pointer-events-none absolute left-[calc(100%+.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[var(--surface-raised)] px-3 py-1 font-mono text-[11px] font-semibold tracking-wider uppercase text-white opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:block z-50">
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
        className="group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 hover:ring-2 hover:ring-[var(--accent)] hover:shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <UserAvatar
          src={user?.avatarUrl}
          name={user?.displayName}
          username={user?.username}
          role={primaryRole}
          size="sm"
          shape="circle"
          showRoleRing={false}
          online={false}
        />

        {/* Dual status indicators: warm top, accent bottom */}
        <span
          aria-hidden="true"
          className="absolute top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--warning)] border border-[var(--ground)] shadow-[0_0_6px_color-mix(in_srgb,var(--warning)_80%,transparent)] z-20"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--accent)] border border-[var(--ground)] shadow-[0_0_6px_color-mix(in_srgb,var(--accent)_80%,transparent)] z-20"
        />

        {/* Tooltip on desktop when menu is closed */}
        {!menuOpen && (
          <span className="pointer-events-none absolute left-[calc(100%+.75rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[var(--surface-raised)] px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-white opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.8)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:block z-50">
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
              {[
                { role: "creator" as const, label: "Creator", title: "Standard Creator (@cyber_artisan)" },
                { role: "pro_creator" as const, label: "Pro VIP", title: "Pro Creator (@neon_architect)" },
                { role: "verified_creator" as const, label: "Verified", title: "Verified Author (@lora_mastermind)" },
                { role: "moderator" as const, label: "Mod", title: "Community Moderator (@sentinel_mod)" },
                { role: "admin" as const, label: "Admin", title: "System Admin (@winnguyen282)" },
                { role: "guest" as const, label: "Guest", title: "Anonymous Guest Session" },
              ].map(({ role: r, label, title }) => {
                const isActive = primaryRole === r;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={switchingRole}
                    onClick={async () => {
                      setSwitchingRole(true);
                      try {
                        await switchRoleDemo(r);
                      } finally {
                        setSwitchingRole(false);
                      }
                    }}
                    className={`rounded py-1 px-1 font-mono text-[9px] uppercase font-bold transition disabled:opacity-50 text-center truncate ${
                      isActive
                        ? r === "pro_creator"
                          ? "border border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)] shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
                          : r === "verified_creator"
                          ? "border border-amber-500/40 bg-amber-950/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                          : r === "moderator"
                          ? "border border-sky-500/40 bg-sky-950/40 text-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.2)]"
                          : r === "admin"
                          ? "border border-rose-500/40 bg-rose-950/40 text-rose-300 shadow-[0_0_8px_rgba(251,113,133,0.2)]"
                          : r === "guest"
                          ? "border border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--ink-faint)]"
                          : "border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)]"
                        : "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:border-[var(--line-strong)]"
                    }`}
                    title={title}
                  >
                    {label}
                  </button>
                );
              })}
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
              href="/notifications"
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              <div className="flex items-center gap-2.5">
                <Bell className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Notifications</span>
              </div>
              {unreadNotificationCount > 0 && (
                <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.2 font-mono text-[9px] font-black text-[var(--accent-ink)]">
                  {unreadNotificationCount}
                </span>
              )}
            </Link>

            <Link
              href={user?.username ? `/user/${user.username}` : "/settings"}
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
