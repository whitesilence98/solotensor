"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Info,
  Loader2,
  Package,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import {
  api,
  type NotificationCategory,
  type NotificationItem,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
}

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
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
        badgeText: "Installed to Vault",
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
        badgeText: "Update",
      };
  }
}

export default function NotificationPopover({
  isOpen,
  onClose,
}: NotificationPopoverProps) {
  const router = useRouter();
  const { refreshUnreadNotificationCount, unreadNotificationCount } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | NotificationCategory>("all");
  const [, startTransition] = useTransition();

  const fetchList = async (categoryFilter?: string) => {
    setLoading(true);
    try {
      const res = await api.getNotifications({
        category: categoryFilter && categoryFilter !== "all" ? categoryFilter : undefined,
        limit: 15,
      });
      setNotifications(res.items || []);
    } catch (err) {
      console.warn("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchList(activeTab);
    }
  }, [isOpen, activeTab]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      void refreshUnreadNotificationCount();
    } catch (err) {
      console.warn("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      void refreshUnreadNotificationCount();
    } catch (err) {
      console.warn("Failed to mark all notifications as read:", err);
    }
  };

  const handleItemClick = (notif: NotificationItem) => {
    if (!notif.is_read) {
      void handleMarkAsRead(notif.id);
    }
    onClose();
    if (notif.link) {
      startTransition(() => {
        router.push(notif.link as string);
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-1.5rem)] z-50 rounded-xl border border-[var(--line-strong)] bg-[var(--ground)]/95 shadow-[0_24px_60px_rgba(0,0,0,0.95)] backdrop-blur-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      role="dialog"
      aria-label="In-app Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 bg-[var(--surface-sunken)]/60">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
            Notifications
          </span>
          {unreadNotificationCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[9px] font-black text-[var(--accent-ink)]">
              {unreadNotificationCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadNotificationCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="h-3 w-3" />
              <span>Mark all read</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--ink-faint)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] transition-colors"
            aria-label="Close notifications popover"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--line)] bg-[var(--surface-sunken)]/30 px-3 py-1.5">
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
            onClick={() => setActiveTab(tab.id)}
            className={`rounded px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--surface-soft)] text-[var(--accent)] shadow-sm"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List Content */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-[var(--line)]/50">
        {loading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--ink-faint)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
            <span className="mt-2 font-mono text-xs">Scanning signals...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)]">
              <Check className="h-4 w-4" />
            </div>
            <p className="mt-3 font-heading text-xs font-semibold text-[var(--ink)]">
              All caught up
            </p>
            <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
              No new alerts or review updates in this channel.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const visuals = getNotificationVisuals(notif);
            const Icon = visuals.icon;
            return (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`group relative flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                  notif.is_read
                    ? "bg-transparent hover:bg-[var(--surface-soft)]/50"
                    : "bg-[var(--surface-raised)]/70 hover:bg-[var(--surface-raised)]"
                }`}
              >
                {/* Unread dot */}
                {!notif.is_read && (
                  <span
                    aria-hidden
                    className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
                  />
                )}

                {/* Left Visual Icon / Actor Avatar */}
                <div className="relative mt-0.5 shrink-0">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border ${visuals.badgeBg}`}
                  >
                    <Icon className={`h-4 w-4 ${visuals.iconColor}`} />
                  </div>
                </div>

                {/* Center Content */}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider border ${visuals.badgeBg} ${visuals.iconColor}`}
                    >
                      {visuals.badgeText}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)] ml-auto shrink-0">
                      {formatRelativeTime(notif.created_at)}
                    </span>
                  </div>

                  <h4 className="mt-1 font-heading text-xs font-bold tracking-tight text-[var(--ink)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                    {notif.title}
                  </h4>

                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-soft)] line-clamp-2">
                    {notif.message}
                  </p>

                  {notif.actor_username && (
                    <div className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)]">
                      <span>By @{notif.actor_username}</span>
                      {notif.actor_role && (
                        <span className="rounded bg-[var(--surface-soft)] px-1 py-0.2 text-[8px] uppercase">
                          {notif.actor_role}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Hover Controls */}
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!notif.is_read && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkAsRead(notif.id, e)}
                      title="Mark as read"
                      className="rounded p-1 text-[var(--ink-faint)] hover:bg-[var(--surface-soft)] hover:text-[var(--accent)]"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                  {notif.link && (
                    <span className="text-[var(--ink-faint)]">
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-2.5 flex items-center justify-between">
        <Link
          href="/notifications"
          onClick={onClose}
          className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent)] hover:underline flex items-center gap-1.5"
        >
          <span>Open Full Dashboard</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
          Realtime Hub
        </span>
      </div>
    </div>
  );
}
