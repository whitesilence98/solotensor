"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  Info,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import WorkspaceNavbar from "@/components/WorkspaceNavbar";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  type NotificationCategory,
  type NotificationItem,
} from "@/lib/api";

type CategoryFilter = "all" | NotificationCategory;

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "recently";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "recently";
  }
}

function getNotificationVisuals(notif: NotificationItem) {
  switch (notif.type) {
    case "model_submitted":
      return {
        icon: Clock,
        iconColor: "text-amber-400",
        badgeBg: "bg-amber-400/10 border-amber-400/30",
        badgeText: "Pending Review",
      };
    case "model_approved":
      return {
        icon: CheckCircle2,
        iconColor: "text-[var(--accent)]",
        badgeBg: "bg-[var(--accent)]/10 border-[var(--accent)]/30",
        badgeText: "Approved",
      };
    case "model_vault_installed":
      return {
        icon: Package,
        iconColor: "text-emerald-400",
        badgeBg: "bg-emerald-400/10 border-emerald-400/30",
        badgeText: "Vault Installed",
      };
    case "model_rejected":
      return {
        icon: XCircle,
        iconColor: "text-rose-400",
        badgeBg: "bg-rose-400/10 border-rose-400/30",
        badgeText: "Action Required",
      };
    case "content_flagged":
      return {
        icon: ShieldAlert,
        iconColor: "text-amber-400",
        badgeBg: "bg-amber-400/10 border-amber-400/30",
        badgeText: "Safety Flag",
      };
    case "flag_resolved":
      return {
        icon: ShieldCheck,
        iconColor: "text-emerald-400",
        badgeBg: "bg-emerald-400/10 border-emerald-400/30",
        badgeText: "Flag Resolved",
      };
    case "generation_completed":
      return {
        icon: Sparkles,
        iconColor: "text-sky-400",
        badgeBg: "bg-sky-400/10 border-sky-400/30",
        badgeText: "Generation Done",
      };
    case "generation_failed":
      return {
        icon: XCircle,
        iconColor: "text-rose-400",
        badgeBg: "bg-rose-400/10 border-rose-400/30",
        badgeText: "Generation Failed",
      };
    case "credits_refilled":
      return {
        icon: Flame,
        iconColor: "text-amber-400",
        badgeBg: "bg-amber-400/10 border-amber-400/30",
        badgeText: "Energy Refill",
      };
    default:
      return {
        icon: Info,
        iconColor: "text-[var(--ink-soft)]",
        badgeBg: "bg-[var(--surface-soft)] border-[var(--line)]",
        badgeText: "System Update",
      };
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    openAuthModal,
    refreshUnreadNotificationCount,
    unreadNotificationCount,
  } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [, startTransition] = useTransition();

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getNotifications({
        category: activeCategory !== "all" ? activeCategory : undefined,
        unread_only: unreadOnly,
        page,
        limit,
      });
      setNotifications(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.warn("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeCategory, unreadOnly, page]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      void refreshUnreadNotificationCount();
    } catch (err) {
      console.warn("Failed to mark as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      void refreshUnreadNotificationCount();
    } catch (err) {
      console.warn("Failed to mark all as read:", err);
    }
  };

  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      void refreshUnreadNotificationCount();
    } catch (err) {
      console.warn("Failed to delete notification:", err);
    }
  };

  const handleItemClick = (notif: NotificationItem) => {
    if (!notif.is_read) {
      void handleMarkAsRead(notif.id);
    }
    if (notif.link) {
      startTransition(() => {
        router.push(notif.link as string);
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-[var(--ground)] text-[var(--ink)] flex flex-col">
      <WorkspaceNavbar
        subtitle="Signal Stream"
        href="/notifications"
        badge={
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
            Hub / In-App Notifications
          </span>
        }
      />

      <main className="flex-1 mx-auto w-full max-w-[1200px] px-4 py-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--line)]">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)]">
                <Bell className="h-5 w-5" />
              </div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--ink)]">
                Notifications
              </h1>
              {unreadNotificationCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 font-mono text-[10px] font-black text-[var(--accent-ink)]">
                  {unreadNotificationCount}
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-xs text-[var(--ink-faint)]">
              Realtime telemetry, model moderation alerts, and workflow completion dispatch.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1.5 font-mono text-xs text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
              title="Refresh notifications"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Sync</span>
            </button>

            {unreadNotificationCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--surface-soft)] transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        {/* Not Authenticated State */}
        {!isAuthLoading && !isAuthenticated && (
          <div className="my-12 flex flex-col items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[var(--surface-sunken)] p-12 text-center">
            <Bell className="h-10 w-10 text-[var(--ink-faint)] mb-3" />
            <h2 className="font-heading text-lg font-bold text-[var(--ink)]">
              Authentication Required
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--ink-faint)] max-w-md">
              Please sign in with your SoloTensor account to receive model approvals, moderation updates, and generation signals.
            </p>
            <button
              type="button"
              onClick={() => openAuthModal("notifications")}
              className="mt-6 rounded-lg bg-[var(--accent)] px-5 py-2 font-mono text-xs font-black uppercase tracking-wider text-[var(--accent-ink)] shadow-md hover:bg-[var(--accent-hover)] transition-colors"
            >
              Sign In to View Signals
            </button>
          </div>
        )}

        {/* Authenticated Dashboard */}
        {isAuthenticated && (
          <div className="mt-6 space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "moderation", label: "Moderation" },
                    { id: "generation", label: "Generation" },
                    { id: "system", label: "System" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(tab.id);
                      setPage(1);
                    }}
                    className={`rounded-md px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                      activeCategory === tab.id
                        ? "bg-[var(--surface-soft)] text-[var(--accent)] shadow-sm border border-[var(--line-strong)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(e) => {
                      setUnreadOnly(e.target.checked);
                      setPage(1);
                    }}
                    className="h-3.5 w-3.5 rounded border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)] focus:ring-0 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-[var(--ink-soft)]">
                    Unread Only
                  </span>
                </label>

                <div className="h-4 w-px bg-[var(--line)]" />

                <span className="font-mono text-xs text-[var(--ink-faint)]">
                  {total} {total === 1 ? "signal" : "signals"}
                </span>
              </div>
            </div>

            {/* Notifications List */}
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-[var(--ink-faint)]">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                <span className="mt-3 font-mono text-xs">
                  Querying telemetry nodes...
                </span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] py-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-faint)]">
                  <Check className="h-6 w-6 text-[var(--accent)]" />
                </div>
                <h3 className="mt-4 font-heading text-sm font-bold text-[var(--ink)]">
                  No signals found
                </h3>
                <p className="mt-1 font-mono text-xs text-[var(--ink-faint)] max-w-sm">
                  {unreadOnly
                    ? "You have marked all alerts as read."
                    : "No notifications have been recorded for this filter criteria."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)]/60 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] overflow-hidden">
                {notifications.map((notif) => {
                  const visuals = getNotificationVisuals(notif);
                  const Icon = visuals.icon;
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleItemClick(notif)}
                      className={`group relative flex items-start gap-4 p-4 transition-colors cursor-pointer ${
                        notif.is_read
                          ? "bg-transparent hover:bg-[var(--surface-soft)]/40"
                          : "bg-[var(--surface-raised)]/60 hover:bg-[var(--surface-raised)]"
                      }`}
                    >
                      {/* Unread indicator */}
                      {!notif.is_read && (
                        <span
                          aria-hidden
                          className="absolute left-2 top-6 h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
                        />
                      )}

                      {/* Icon */}
                      <div className="shrink-0 mt-0.5">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl border ${visuals.badgeBg}`}
                        >
                          <Icon className={`h-5 w-5 ${visuals.iconColor}`} />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider border ${visuals.badgeBg} ${visuals.iconColor}`}
                          >
                            {visuals.badgeText}
                          </span>
                          <span className="font-mono text-xs text-[var(--ink-faint)] ml-auto">
                            {formatRelativeTime(notif.created_at)}
                          </span>
                        </div>

                        <h3 className="mt-1.5 font-heading text-sm font-bold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                          {notif.title}
                        </h3>

                        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">
                          {notif.message}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] text-[var(--ink-faint)]">
                          {notif.actor_username && (
                            <span className="flex items-center gap-1">
                              <span>Actor: @{notif.actor_username}</span>
                              {notif.actor_role && (
                                <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.2 text-[9px] uppercase border border-[var(--line)]">
                                  {notif.actor_role}
                                </span>
                              )}
                            </span>
                          )}

                          {notif.link && (
                            <span className="text-[var(--accent)] flex items-center gap-1 font-bold">
                              <span>Action target</span>
                              <ExternalLink className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex items-center gap-1.5 self-center">
                        {!notif.is_read && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            title="Mark as read"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleDeleteNotification(notif.id, e)}
                          title="Dismiss notification"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:border-rose-500/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="font-mono text-xs text-[var(--ink-faint)]">
                  Page {page} of {totalPages}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
