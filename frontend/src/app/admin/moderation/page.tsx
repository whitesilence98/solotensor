"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Flame,
  HelpCircle,
  Keyboard,
  Layers,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  type ModerationActionPayload,
  type ModerationQueueItem,
  type SecurityAuditLogEntry,
  type UserRole,
} from "@/lib/api";
import RoleBadge from "@/components/RoleBadge";
import UserAvatar from "@/components/UserAvatar";

type QueueTab = "models" | "posts" | "audit";

export default function ModerationDashboardPage() {
  const {
    user,
    primaryRole,
    isMod,
    isAdmin,
    hasPermission,
    switchRoleDemo,
    isAuthenticated,
  } = useAuth();

  const canAccess =
    isMod ||
    isAdmin ||
    hasPermission("moderation:review_queue") ||
    hasPermission("admin:full_access");

  const [activeTab, setActiveTab] = useState<QueueTab>("models");
  const [queueItems, setQueueItems] = useState<ModerationQueueItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Load moderation queue & audit logs
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [items, logs] = await Promise.all([
        api.getModerationQueue(),
        api.getSecurityAuditLogs(),
      ]);
      setQueueItems(items || []);
      setAuditLogs(logs || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filter items by active tab and search query
  const filteredItems = useMemo(() => {
    return queueItems.filter((item) => {
      if (activeTab === "models" && item.target_type !== "model") return false;
      if (activeTab === "posts" && item.target_type !== "post") return false;

      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.reason.toLowerCase().includes(q) ||
          item.author_username.toLowerCase().includes(q) ||
          item.target_id.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [queueItems, activeTab, statusFilter, searchQuery]);

  // Selected item within the filtered list
  const selectedItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    const safeIndex = Math.min(selectedIndex, filteredItems.length - 1);
    return filteredItems[safeIndex] || null;
  }, [filteredItems, selectedIndex]);

  // Take moderation action on an item
  const handleAction = useCallback(
    async (
      action: "approve" | "hide" | "toggle_nsfw" | "takedown",
      target?: ModerationQueueItem
    ) => {
      const item = target || selectedItem;
      if (!item) return;

      const payload: ModerationActionPayload = {
        target_type: item.target_type,
        target_id: item.target_id,
        action,
        reason: item.reason,
        notes: `Action '${action}' applied from Moderation Darkroom by @${user?.username || "moderator"}`,
      };

      try {
        const res = await api.takeModerationAction(payload);
        setActionToast(res.message);
        setTimeout(() => setActionToast(null), 3000);
        await loadData();
      } catch (err) {
        setActionToast(err instanceof Error ? err.message : "Action failed");
        setTimeout(() => setActionToast(null), 3000);
      }
    },
    [selectedItem, user?.username, loadData]
  );

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "j") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, Math.max(0, filteredItems.length - 1))
        );
      } else if (key === "k") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (key === "a" && selectedItem) {
        e.preventDefault();
        void handleAction("approve");
      } else if (key === "h" && selectedItem) {
        e.preventDefault();
        void handleAction("hide");
      } else if (key === "t" && selectedItem) {
        e.preventDefault();
        void handleAction("takedown");
      } else if (key === "?") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredItems.length, selectedItem, handleAction]);

  // Stats calculation
  const stats = useMemo(() => {
    const pending = queueItems.filter((i) => i.status === "pending");
    const critical = pending.filter((i) => i.severity === "critical" || i.severity === "high");
    const modelsPending = pending.filter((i) => i.target_type === "model").length;
    const postsPending = pending.filter((i) => i.target_type === "post").length;

    return {
      totalPending: pending.length,
      criticalCount: critical.length,
      modelsCount: modelsPending,
      postsCount: postsPending,
      auditCount: auditLogs.length,
    };
  }, [queueItems, auditLogs]);

  // If user lacks moderator access, render authorization guard with local demo switcher
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-[var(--ground)] text-[var(--ink)] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--danger-line)] bg-[var(--surface-raised)] p-6 shadow-2xl text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-surface)] text-[var(--danger)]">
            <ShieldAlert className="h-6 w-6" />
          </div>

          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--ink)]">
              Access Restricted // Moderator Clearance Required
            </h1>
            <p className="mt-1 font-mono text-xs text-[var(--ink-faint)]">
              The Moderation Darkroom requires role <code className="text-[#38bdf8]">moderator</code> or <code className="text-[#fb7185]">admin</code>.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-left space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--ink-faint)]">Your Identity:</span>
              <span className="text-[var(--ink)]">@{user?.username || "anonymous"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--ink-faint)]">Current Role:</span>
              <RoleBadge role={primaryRole} size="xs" />
            </div>
          </div>

          {/* Local Studio Role Switcher for Pairing & Development */}
          <div className="border-t border-[var(--line)] pt-4 space-y-2">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold">
              SoloTensor Studio • Local RBAC Role Switcher
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => switchRoleDemo("moderator")}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[#0c4a6e] bg-[#082f49] py-2 font-mono text-xs font-bold text-[#38bdf8] hover:bg-[#0c4a6e]/50 transition"
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Switch to Moderator</span>
              </button>
              <button
                type="button"
                onClick={() => switchRoleDemo("admin")}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[#881337] bg-[#4c0519] py-2 font-mono text-xs font-bold text-[#fb7185] hover:bg-[#881337]/50 transition"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Switch to Admin</span>
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--ink-faint)] hover:text-[var(--ink)] transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Studio</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ground)] text-[var(--ink)] flex flex-col font-sans">
      {/* Toast Feedback */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-[#38bdf8] bg-[var(--surface-raised)] px-4 py-2.5 font-mono text-xs font-bold text-[#38bdf8] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Shield className="h-4 w-4" />
          <span>{actionToast}</span>
        </div>
      )}

      {/* Top Banner Navigation Bar */}
      <header className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-4 shrink-0">
        <div className="mx-auto max-w-[1600px] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--accent)] hover:border-[var(--line-strong)] transition"
              title="Return to Creation Studio"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                <h1 className="text-base font-bold tracking-tight text-[var(--ink)]">
                  MODERATION DARKROOM // GOVERNANCE CONSOLE
                </h1>
              </div>
              <p className="font-mono text-[10px] tracking-wider text-[var(--ink-faint)] uppercase mt-0.5">
                Active Session: @{user?.username} • Clearance: {primaryRole.toUpperCase()}
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar & Role Demo Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs">
              <span className="text-[var(--ink-faint)]">Pending:</span>
              <span className="font-bold text-[#38bdf8]">{stats.totalPending}</span>
              {stats.criticalCount > 0 && (
                <span className="ml-1 rounded bg-rose-900/50 px-1 text-[10px] font-bold text-rose-300 border border-rose-700/50">
                  {stats.criticalCount} Critical
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <RoleBadge role={primaryRole} size="sm" />
            </div>

            {/* Role Demo Switcher pill */}
            <div className="flex items-center gap-1 border border-[var(--line)] rounded-lg p-0.5 bg-[var(--surface-sunken)]">
              {(["moderator", "admin", "creator", "pro_creator"] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => switchRoleDemo(r)}
                  className={`px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider rounded transition ${
                    primaryRole === r
                      ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                  title={`Switch local session role to ${r}`}
                >
                  {r.replace("_creator", "")}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowShortcuts((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition"
              title="Toggle Keyboard Shortcuts"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span>Keys</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 mx-auto max-w-[1600px] w-full p-6 flex flex-col gap-6">
        {/* Navigation Tabs & Search Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("models");
                setSelectedIndex(0);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition ${
                activeTab === "models"
                  ? "border border-[#0c4a6e] bg-[#082f49] text-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                  : "border border-transparent text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Flagged Models</span>
              <span className="rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                {stats.modelsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("posts");
                setSelectedIndex(0);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition ${
                activeTab === "posts"
                  ? "border border-[#0c4a6e] bg-[#082f49] text-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                  : "border border-transparent text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Flagged Posts</span>
              <span className="rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                {stats.postsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("audit");
                setSelectedIndex(0);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition ${
                activeTab === "audit"
                  ? "border border-[#881337] bg-[#4c0519] text-[#fb7185] shadow-[0_0_12px_rgba(251,113,133,0.2)]"
                  : "border border-transparent text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Security Audit Log</span>
              <span className="rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                {stats.auditCount}
              </span>
            </button>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex items-center gap-2.5">
            {activeTab !== "audit" && (
              <div className="flex items-center gap-1 border border-[var(--line)] rounded-lg p-0.5 bg-[var(--surface-sunken)]">
                {["pending", "resolved", "all"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st);
                      setSelectedIndex(0);
                    }}
                    className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider rounded transition ${
                      statusFilter === st
                        ? "bg-[var(--surface-raised)] text-[var(--ink)] font-bold border border-[var(--line-strong)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}

            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
              <input
                type="text"
                placeholder="Search darkroom queue…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] py-1.5 pl-8 pr-2.5 font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)] transition"
              title="Refresh Queue"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tab 1 & 2: Split Queue View (Models & Posts) */}
        {activeTab !== "audit" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
            {/* Left Queue Stream (5 Columns) */}
            <div className="lg:col-span-5 flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
              <div className="border-b border-[var(--line)] px-4 py-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] bg-[var(--surface-sunken)]">
                <span>Items in Stream ({filteredItems.length})</span>
                <span>Keyboard: J (Down) / K (Up)</span>
              </div>

              <div className="divide-y divide-[var(--line)] overflow-y-auto max-h-[70vh] workspace-scroll">
                {filteredItems.map((item, idx) => {
                  const isSelected = selectedIndex === idx;
                  const isCritical = item.severity === "critical" || item.severity === "high";

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedIndex(idx)}
                      className={`p-4 cursor-pointer transition text-left flex flex-col gap-2 ${
                        isSelected
                          ? "bg-[var(--surface-raised)] border-l-2 border-[#38bdf8]"
                          : "hover:bg-[var(--surface-soft)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold text-[var(--ink-faint)] truncate max-w-[200px]">
                          {item.target_id}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`rounded px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider ${
                              isCritical
                                ? "bg-rose-950/60 text-rose-300 border border-rose-800/60"
                                : "bg-amber-950/60 text-amber-300 border border-amber-800/60"
                            }`}
                          >
                            {item.severity}
                          </span>
                          <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--ink-soft)] border border-[var(--line)]">
                            {item.flag_count} flags
                          </span>
                        </div>
                      </div>

                      <h3
                        className={`text-xs font-bold line-clamp-1 ${
                          isSelected ? "text-[#38bdf8]" : "text-[var(--ink)]"
                        }`}
                      >
                        {item.title}
                      </h3>

                      <p className="text-[11px] text-[var(--ink-soft)] line-clamp-2">
                        {item.reason}
                      </p>

                      <div className="flex items-center justify-between pt-1 font-mono text-[10px] text-[var(--ink-faint)]">
                        <div className="flex items-center gap-1.5">
                          <UserAvatar
                            username={item.author_username}
                            role={item.author_role}
                            size="xs"
                          />
                          <span>by @{item.author_username}</span>
                          {item.author_role && (
                            <RoleBadge role={item.author_role} size="xs" />
                          )}
                        </div>
                        <span>
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredItems.length === 0 && (
                  <div className="p-12 text-center text-xs text-[var(--ink-faint)] space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-[#38bdf8] mx-auto opacity-70" />
                    <p className="font-bold text-[var(--ink)]">Queue is Clear</p>
                    <p className="font-mono text-[11px]">
                      No flagged {activeTab} matching the current filters.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Detailed Inspection Stage (7 Columns) */}
            <div className="lg:col-span-7 flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
              {selectedItem ? (
                <div className="flex flex-col h-full">
                  {/* Inspection Header */}
                  <div className="border-b border-[var(--line)] p-5 bg-[var(--surface-sunken)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold tracking-widest text-[#38bdf8] uppercase">
                        TARGET INSPECTION // {selectedItem.target_type.toUpperCase()}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                        ID: {selectedItem.target_id}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-[var(--ink)] tracking-tight">
                      {selectedItem.title}
                    </h2>
                    <div className="flex items-center gap-3 font-mono text-xs text-[var(--ink-faint)]">
                      <div className="flex items-center gap-1.5">
                        <UserAvatar
                          username={selectedItem.author_username}
                          role={selectedItem.author_role}
                          size="xs"
                        />
                        <span>Creator:</span>
                        <span className="text-[var(--ink)]">@{selectedItem.author_username}</span>
                        {selectedItem.author_role && (
                          <RoleBadge role={selectedItem.author_role} size="xs" />
                        )}
                      </div>
                      <span>•</span>
                      <span>Reporter: @{selectedItem.reporter_username}</span>
                    </div>
                  </div>

                  {/* Body & Report Details */}
                  <div className="p-6 space-y-5 flex-1 overflow-y-auto workspace-scroll">
                    {/* Report Reason Card */}
                    <div className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-4 space-y-1.5">
                      <div className="flex items-center gap-2 text-[var(--danger)] font-mono text-xs font-bold uppercase">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Violation Flagged: {selectedItem.reason}</span>
                      </div>
                      {selectedItem.details && (
                        <p className="text-xs text-[var(--ink)] leading-relaxed">
                          {selectedItem.details}
                        </p>
                      )}
                    </div>

                    {/* Metadata & Safetensors Tags */}
                    {selectedItem.tags && selectedItem.tags.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-semibold block">
                          Resource Tags
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedItem.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink)] border border-[var(--line)]"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Telemetry Readout */}
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-4 space-y-2 font-mono text-xs">
                      <span className="text-[10px] text-[var(--ink-faint)] uppercase tracking-wider font-bold block border-b border-[var(--line)] pb-1">
                        System Telemetry
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-[var(--ink-faint)]">Status: </span>
                          <span className="uppercase font-bold text-[var(--ink)]">
                            {selectedItem.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-faint)]">Severity: </span>
                          <span className="uppercase font-bold text-rose-400">
                            {selectedItem.severity}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-faint)]">Reported: </span>
                          <span>{new Date(selectedItem.created_at).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-[var(--ink-faint)]">Community Flags: </span>
                          <span className="font-bold text-[var(--accent)]">
                            {selectedItem.flag_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* High-Impact Brutalist Action Bar */}
                  <div className="border-t border-[var(--line)] p-4 bg-[var(--surface-sunken)] flex items-center justify-between gap-3 mt-auto">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction("approve")}
                        className="flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-950/40 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-900/60 transition shadow-sm"
                        title="Clear flag and mark approved (Key: A)"
                      >
                        <Check className="h-4 w-4" />
                        <span>[A] Approve & Clear</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAction("hide")}
                        className="flex items-center gap-2 rounded-lg border border-amber-600/50 bg-amber-950/40 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-amber-400 hover:bg-amber-900/60 transition shadow-sm"
                        title="Hide content from feeds (Key: H)"
                      >
                        <EyeOff className="h-4 w-4" />
                        <span>[H] Hide from Feeds</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAction("takedown")}
                      className="flex items-center gap-2 rounded-lg border border-[var(--danger)] bg-[var(--danger-surface)] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition shadow-sm"
                      title="Immediate takedown and soft-delete (Key: T)"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>[T] Takedown</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full grid place-items-center p-12 text-center text-xs text-[var(--ink-faint)]">
                  <p>Select an item from the stream to inspect details.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Tab 3: Security & Governance Audit Log */
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
            <div className="border-b border-[var(--line)] px-6 py-3.5 flex items-center justify-between bg-[var(--surface-sunken)] font-mono text-xs">
              <span className="font-bold text-[var(--ink)]">
                SECURITY AUDIT LOGS ({auditLogs.length})
              </span>
              <span className="text-[var(--ink-faint)] text-[10px]">
                Immutable action trails for RBAC compliance
              </span>
            </div>

            <div className="overflow-x-auto workspace-scroll">
              <table className="w-full text-left font-mono text-xs">
                <thead className="border-b border-[var(--line)] text-[10px] uppercase text-[var(--ink-faint)] bg-[var(--surface)]">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Actor</th>
                    <th className="px-6 py-3">Action Primitive</th>
                    <th className="px-6 py-3">Resource</th>
                    <th className="px-6 py-3">Details / Audit Note</th>
                    <th className="px-6 py-3">Client IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-[var(--surface-soft)] transition-colors"
                    >
                      <td className="px-6 py-3.5 whitespace-nowrap text-[11px] text-[var(--ink-faint)]">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            username={log.actor_username}
                            role={log.actor_role}
                            size="xs"
                          />
                          <span className="font-bold text-[var(--ink)]">
                            @{log.actor_username}
                          </span>
                          <RoleBadge role={log.actor_role} size="xs" />
                        </div>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <span className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 font-bold text-[#38bdf8] border border-[#0c4a6e]/40">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-[var(--ink)]">
                        <span className="text-[var(--ink-faint)]">{log.resource_type}:</span>{" "}
                        <span className="font-bold">{log.resource_id}</span>
                      </td>
                      <td className="px-6 py-3.5 text-[var(--ink-soft)] max-w-md truncate">
                        {log.details}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-[11px] text-[var(--ink-faint)]">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                    </tr>
                  ))}

                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-xs text-[var(--ink-faint)]">
                        No security audit logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-[var(--accent)] uppercase">
                <Keyboard className="h-4 w-4" />
                <span>Moderation Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--ink-soft)]">Next item in queue:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-[var(--ink)]">J</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--ink-soft)]">Previous item in queue:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-[var(--ink)]">K</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--ink-soft)]">Approve & Clear Flag:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-emerald-400">A</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--ink-soft)]">Hide / Restrict:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-amber-400">H</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--ink-soft)]">Immediate Takedown:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-[var(--danger)]">T</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[var(--ink-soft)]">Toggle Shortcuts Cheat Sheet:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-[var(--ink)]">?</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
