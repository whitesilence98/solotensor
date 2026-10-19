"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Flame,
  HardDrive,
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
  type ModelPendingReviewItem,
  type ModelReviewActionType,
  type ModerationActionPayload,
  type ModerationQueueItem,
  type SecurityAuditLogEntry,
  type UserRole,
} from "@/lib/api";
import RoleBadge from "@/components/RoleBadge";
import UserAvatar from "@/components/UserAvatar";

type QueueTab = "pending_models" | "models" | "posts" | "audit";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function ModerationDashboardPage() {
  const {
    user,
    primaryRole,
    isMod,
    isAdmin,
    hasPermission,
    switchRoleDemo,
    refreshPendingReviewCount,
  } = useAuth();

  const canAccess =
    isMod ||
    isAdmin ||
    hasPermission("moderation:review_queue") ||
    hasPermission("admin:full_access");

  const [activeTab, setActiveTab] = useState<QueueTab>("pending_models");
  const [queueItems, setQueueItems] = useState<ModerationQueueItem[]>([]);
  const [pendingModels, setPendingModels] = useState<ModelPendingReviewItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedModelIndex, setSelectedModelIndex] = useState<number>(0);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Model review action state
  const [actionLoading, setActionLoading] = useState(false);
  const [installingFileId, setInstallingFileId] = useState<string | null>(null);
  const [installedFiles, setInstalledFiles] = useState<Record<string, boolean>>({});
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [requestChanges, setRequestChanges] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");

  // Load moderation queues & audit logs
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, logsRes, pendingRes] = await Promise.allSettled([
        api.getModerationQueue(),
        api.getSecurityAuditLogs(),
        api.getPendingModelsReviewQueue(),
      ]);
      if (itemsRes.status === "fulfilled") {
        setQueueItems(itemsRes.value || []);
      }
      if (logsRes.status === "fulfilled") {
        setAuditLogs(logsRes.value || []);
      }
      if (pendingRes.status === "fulfilled") {
        setPendingModels(pendingRes.value?.items || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filter flagged items (models & posts)
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

  // Selected flagged item
  const selectedItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    const safeIndex = Math.min(selectedIndex, filteredItems.length - 1);
    return filteredItems[safeIndex] || null;
  }, [filteredItems, selectedIndex]);

  // Filter pending review models
  const filteredPendingModels = useMemo(() => {
    if (!searchQuery.trim()) return pendingModels;
    const q = searchQuery.toLowerCase();
    return pendingModels.filter((m) =>
      m.title.toLowerCase().includes(q) ||
      (m.author_username && m.author_username.toLowerCase().includes(q)) ||
      m.model_id.toLowerCase().includes(q) ||
      m.base_model.toLowerCase().includes(q) ||
      (m.tags && m.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [pendingModels, searchQuery]);

  // Selected pending model
  const selectedPendingModel = useMemo(() => {
    if (filteredPendingModels.length === 0) return null;
    const safeIndex = Math.min(selectedModelIndex, filteredPendingModels.length - 1);
    return filteredPendingModels[safeIndex] || null;
  }, [filteredPendingModels, selectedModelIndex]);

  // Take moderation action on a flagged item
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

  // Review a pending model submission
  const handleReviewModel = useCallback(
    async (
      action: ModelReviewActionType,
      installToComfy: boolean = false,
      notes?: string
    ) => {
      if (!selectedPendingModel) return;
      setActionLoading(true);
      try {
        let versionId: string | undefined;
        let fileId: string | undefined;
        if (installToComfy && selectedPendingModel.versions && selectedPendingModel.versions.length > 0) {
          const v = selectedPendingModel.versions[0];
          versionId = v.version_id;
          if (v.files && v.files.length > 0) {
            fileId = v.files[0].file_id;
          }
        }
        const res = await api.reviewModelPublication(selectedPendingModel.model_id, {
          action,
          notes: notes || undefined,
          install_to_comfy: installToComfy,
          version_id: versionId,
          file_id: fileId,
        });
        const msg =
          res.action_taken === "approved"
            ? (installToComfy ? `Model approved and mounted into ComfyUI vault!` : `Model approved and published to gallery!`)
            : `Model submission ${res.action_taken}`;
        setActionToast(msg);
        setTimeout(() => setActionToast(null), 3500);
        setShowRejectModal(false);
        setRejectFeedback("");
        await loadData();
        void refreshPendingReviewCount();
      } catch (err) {
        setActionToast(err instanceof Error ? err.message : "Review action failed");
        setTimeout(() => setActionToast(null), 3500);
      } finally {
        setActionLoading(false);
      }
    },
    [selectedPendingModel, loadData, refreshPendingReviewCount]
  );

  // Directly install a specific file to ComfyUI vault
  const handleInstallFile = useCallback(
    async (modelId: string, versionId: string, fileId: string, filename: string) => {
      setInstallingFileId(fileId);
      try {
        const res = await api.installModelFile(modelId, versionId, fileId);
        setInstalledFiles((prev) => ({ ...prev, [fileId]: true }));
        setActionToast(`Mounted ${filename} into ComfyUI vault (${res.destination})`);
        setTimeout(() => setActionToast(null), 3500);
      } catch (err) {
        setActionToast(err instanceof Error ? err.message : "Failed to install to ComfyUI");
        setTimeout(() => setActionToast(null), 3500);
      } finally {
        setInstallingFileId(null);
      }
    },
    []
  );

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (activeTab === "pending_models") {
        if (key === "j") {
          e.preventDefault();
          setSelectedModelIndex((prev) =>
            Math.min(prev + 1, Math.max(0, filteredPendingModels.length - 1))
          );
        } else if (key === "k") {
          e.preventDefault();
          setSelectedModelIndex((prev) => Math.max(prev - 1, 0));
        } else if (key === "a" && selectedPendingModel) {
          e.preventDefault();
          void handleReviewModel("approve", false);
        } else if (key === "r" && selectedPendingModel) {
          e.preventDefault();
          setRequestChanges(false);
          setShowRejectModal(true);
        } else if (key === "?") {
          e.preventDefault();
          setShowShortcuts((prev) => !prev);
        }
      } else if (activeTab === "models" || activeTab === "posts") {
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTab,
    filteredPendingModels.length,
    selectedPendingModel,
    filteredItems.length,
    selectedItem,
    handleReviewModel,
    handleAction,
  ]);

  // Stats calculation
  const stats = useMemo(() => {
    const pending = queueItems.filter((i) => i.status === "pending");
    const critical = pending.filter((i) => i.severity === "critical" || i.severity === "high");
    const modelsPending = pending.filter((i) => i.target_type === "model").length;
    const postsPending = pending.filter((i) => i.target_type === "post").length;

    return {
      pendingModelsCount: pendingModels.length,
      totalPending: pending.length + pendingModels.length,
      criticalCount: critical.length,
      modelsCount: modelsPending,
      postsCount: postsPending,
      auditCount: auditLogs.length,
    };
  }, [queueItems, auditLogs, pendingModels]);

  // Authorization guard with local demo switcher
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
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tab 1: Pending Model Approvals */}
            <button
              type="button"
              onClick={() => {
                setActiveTab("pending_models");
                setSelectedModelIndex(0);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition ${
                activeTab === "pending_models"
                  ? "border border-amber-600/50 bg-amber-950/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  : "border border-transparent text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              <Box className="h-3.5 w-3.5" />
              <span>Model Approvals</span>
              <span className="rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                {stats.pendingModelsCount}
              </span>
            </button>

            {/* Tab 2: Flagged Models */}
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

            {/* Tab 3: Flagged Posts */}
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

            {/* Tab 4: Security Audit Log */}
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
            {activeTab !== "audit" && activeTab !== "pending_models" && (
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
                placeholder={activeTab === "pending_models" ? "Search model approvals…" : "Search darkroom queue…"}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                  setSelectedModelIndex(0);
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

        {/* Tab 1: Model Submissions Approval Queue */}
        {activeTab === "pending_models" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
            {/* Left Queue Stream (5 Columns) */}
            <div className="lg:col-span-5 flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
              <div className="border-b border-[var(--line)] px-4 py-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] bg-[var(--surface-sunken)]">
                <span>Pending Submissions ({filteredPendingModels.length})</span>
                <span>Keyboard: J (Down) / K (Up)</span>
              </div>

              <div className="divide-y divide-[var(--line)] overflow-y-auto max-h-[70vh] workspace-scroll">
                {filteredPendingModels.map((item, idx) => {
                  const isSelected = selectedModelIndex === idx;

                  return (
                    <div
                      key={item.model_id}
                      onClick={() => setSelectedModelIndex(idx)}
                      className={`p-4 cursor-pointer transition text-left flex flex-col gap-2 ${
                        isSelected
                          ? "bg-[var(--surface-raised)] border-l-2 border-amber-400"
                          : "hover:bg-[var(--surface-soft)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold text-[var(--ink-faint)] truncate max-w-[200px]">
                          {item.model_id}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="rounded px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider bg-amber-950/60 text-amber-300 border border-amber-800/60">
                            {item.moderation_status.replace("_", " ")}
                          </span>
                          <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--ink-soft)] border border-[var(--line)] uppercase">
                            {item.model_type}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        {item.cover_url ? (
                          <img
                            src={item.cover_url}
                            alt={item.title}
                            className="h-12 w-12 rounded object-cover border border-[var(--line)] shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded bg-[var(--surface-sunken)] border border-[var(--line)] flex items-center justify-center shrink-0 text-[var(--ink-faint)]">
                            <Box className="h-5 w-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`text-xs font-bold truncate ${
                              isSelected ? "text-amber-300" : "text-[var(--ink)]"
                            }`}
                          >
                            {item.title}
                          </h3>
                          <p className="text-[11px] text-[var(--ink-soft)] line-clamp-1 mt-0.5">
                            {item.description || "No description provided."}
                          </p>
                          <div className="flex items-center gap-2 mt-1 font-mono text-[9px] text-[var(--ink-faint)]">
                            <span className="rounded bg-black/40 px-1 py-0.5 border border-[var(--line)] text-[var(--ink)]">
                              {item.base_model}
                            </span>
                            <span>•</span>
                            <span>{item.version_count} v • {item.file_count} files</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 font-mono text-[10px] text-[var(--ink-faint)] border-t border-[var(--line)]/50">
                        <div className="flex items-center gap-1.5">
                          <UserAvatar
                            username={item.author_username || "author"}
                            role={item.author_role}
                            size="xs"
                          />
                          <span>by @{item.author_username || item.author_id}</span>
                          {item.author_role && <RoleBadge role={item.author_role} size="xs" />}
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

                {filteredPendingModels.length === 0 && (
                  <div className="p-12 text-center text-xs text-[var(--ink-faint)] space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-[#38bdf8] mx-auto opacity-70" />
                    <p className="font-bold text-[var(--ink)]">Approval Queue Clear</p>
                    <p className="font-mono text-[11px]">
                      No pending model submissions awaiting moderation review.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Detailed Inspection Stage (7 Columns) */}
            <div className="lg:col-span-7 flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
              {selectedPendingModel ? (
                <div className="flex flex-col h-full">
                  {/* Inspection Header */}
                  <div className="border-b border-[var(--line)] p-5 bg-[var(--surface-sunken)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold tracking-widest text-amber-400 uppercase">
                          SUBMISSION REVIEW // {selectedPendingModel.model_type.toUpperCase()}
                        </span>
                        <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider bg-amber-950/60 text-amber-300 border border-amber-800/60">
                          {selectedPendingModel.moderation_status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <Link
                          href={`/models/${selectedPendingModel.model_id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-[#38bdf8] hover:underline"
                        >
                          <span>Public Page Preview</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <span className="text-[var(--ink-faint)]">ID: {selectedPendingModel.model_id}</span>
                      </div>
                    </div>

                    <h2 className="text-lg font-bold text-[var(--ink)] tracking-tight">
                      {selectedPendingModel.title}
                    </h2>

                    <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[var(--ink-faint)]">
                      <div className="flex items-center gap-1.5">
                        <UserAvatar
                          username={selectedPendingModel.author_username || "author"}
                          role={selectedPendingModel.author_role}
                          size="xs"
                        />
                        <span>Creator:</span>
                        <span className="text-[var(--ink)]">
                          @{selectedPendingModel.author_username || selectedPendingModel.author_id}
                        </span>
                        {selectedPendingModel.author_role && (
                          <RoleBadge role={selectedPendingModel.author_role} size="xs" />
                        )}
                      </div>
                      <span>•</span>
                      <span>Base: <strong className="text-[var(--ink)]">{selectedPendingModel.base_model}</strong></span>
                      <span>•</span>
                      <span>Category: <strong className="text-[var(--ink)]">{selectedPendingModel.category}</strong></span>
                      <span>•</span>
                      <span>Submitted: {new Date(selectedPendingModel.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Body & Technical Details */}
                  <div className="p-6 space-y-5 flex-1 overflow-y-auto workspace-scroll">
                    {/* Description Card */}
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-4 space-y-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-bold block">
                        Model Description & Documentation
                      </span>
                      <p className="text-xs text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
                        {selectedPendingModel.description || "No description provided by creator."}
                      </p>
                    </div>

                    {/* Creator Declared Governance & Permissions Grid */}
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-4 space-y-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-bold block border-b border-[var(--line)] pb-1">
                        Licensing Terms & Creator Governance
                      </span>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-[10px]">
                        <div className={`p-2 rounded border ${selectedPendingModel.permissions?.commercial ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)]"}`}>
                          <span className="font-bold block">Commercial Use</span>
                          <span>{selectedPendingModel.permissions?.commercial ? "✓ Allowed" : "✗ Forbidden"}</span>
                        </div>
                        <div className={`p-2 rounded border ${selectedPendingModel.permissions?.sell_model ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)]"}`}>
                          <span className="font-bold block">Sell Model Weights</span>
                          <span>{selectedPendingModel.permissions?.sell_model ? "✓ Permitted" : "✗ Prohibited"}</span>
                        </div>
                        <div className={`p-2 rounded border ${selectedPendingModel.permissions?.allow_download !== false ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)]"}`}>
                          <span className="font-bold block">Direct Download</span>
                          <span>{selectedPendingModel.permissions?.allow_download !== false ? "✓ Permitted" : "✗ Locked"}</span>
                        </div>
                        <div className={`p-2 rounded border ${selectedPendingModel.permissions?.credit_required ? "border-sky-800/60 bg-sky-950/30 text-sky-300" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)]"}`}>
                          <span className="font-bold block">Attribution / Credit</span>
                          <span>{selectedPendingModel.permissions?.credit_required ? "Required" : "Optional"}</span>
                        </div>
                        <div className={`p-2 rounded border ${selectedPendingModel.permissions?.remix ? "border-sky-800/60 bg-sky-950/30 text-sky-300" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)]"}`}>
                          <span className="font-bold block">Remix / Adaptation</span>
                          <span>{selectedPendingModel.permissions?.remix ? "Allowed" : "Prohibited"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Declared Tags */}
                    {selectedPendingModel.tags && selectedPendingModel.tags.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-semibold block">
                          Declared Tags
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedPendingModel.tags.map((tag) => (
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

                    {/* Versions & Weight Files with ComfyUI Vault Installation */}
                    <div className="space-y-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-bold block">
                        Model Versions & Weight Files ({selectedPendingModel.versions.length} versions)
                      </span>

                      <div className="space-y-3">
                        {selectedPendingModel.versions.map((version) => (
                          <div
                            key={version.version_id}
                            className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[var(--ink)]">
                                  v{version.name}
                                </span>
                                <span className="rounded bg-black/40 px-1.5 py-0.2 font-mono text-[9px] text-[#38bdf8] border border-[var(--line)]">
                                  {selectedPendingModel.base_model}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                                {new Date(version.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            {/* Files */}
                            <div className="space-y-2">
                              {version.files.map((file) => {
                                const isInstalled = installedFiles[file.file_id];
                                const isInstalling = installingFileId === file.file_id;

                                return (
                                  <div
                                    key={file.file_id}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-mono text-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <HardDrive className="h-4 w-4 text-[var(--accent)] shrink-0" />
                                      <div className="min-w-0">
                                        <span className="font-bold text-[var(--ink)] block truncate">
                                          {file.filename}
                                        </span>
                                        <span className="text-[10px] text-[var(--ink-faint)]">
                                          {formatBytes(file.size)} • {file.precision}
                                          {file.sha256 ? ` • SHA: ${file.sha256.slice(0, 8)}…` : ""}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Moderator Test-Mount ComfyUI Vault Button */}
                                    <button
                                      type="button"
                                      disabled={isInstalling || actionLoading}
                                      onClick={() =>
                                        handleInstallFile(
                                          selectedPendingModel.model_id,
                                          version.version_id,
                                          file.file_id,
                                          file.filename
                                        )
                                      }
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                                        isInstalled
                                          ? "border border-emerald-600/50 bg-emerald-950/40 text-emerald-300"
                                          : "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25"
                                      }`}
                                      title="Mount weights into local ComfyUI model vault"
                                    >
                                      {isInstalling ? (
                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                      ) : isInstalled ? (
                                        <Check className="h-3.5 w-3.5" />
                                      ) : (
                                        <Zap className="h-3.5 w-3.5" />
                                      )}
                                      <span>
                                        {isInstalling
                                          ? "Mounting…"
                                          : isInstalled
                                          ? "Vault Mounted"
                                          : "Install to ComfyUI"}
                                      </span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* High-Impact Brutalist Action Bar */}
                  <div className="border-t border-[var(--line)] p-4 bg-[var(--surface-sunken)] flex flex-wrap items-center justify-between gap-3 mt-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleReviewModel("approve", false)}
                        className="flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-950/40 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-900/60 transition shadow-sm"
                        title="Approve model publication to gallery (Key: A)"
                      >
                        <Check className="h-4 w-4" />
                        <span>[A] Approve & Publish</span>
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleReviewModel("approve", true)}
                        className="flex items-center gap-2 rounded-lg border border-[#0c4a6e] bg-[#082f49] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#38bdf8] hover:bg-[#0c4a6e]/70 transition shadow-sm"
                        title="Approve model and install primary weights into ComfyUI vault"
                      >
                        <Zap className="h-4 w-4" />
                        <span>Approve & Mount to Vault</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => {
                          setRequestChanges(true);
                          setShowRejectModal(true);
                        }}
                        className="flex items-center gap-2 rounded-lg border border-amber-600/50 bg-amber-950/40 px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-amber-400 hover:bg-amber-900/60 transition shadow-sm"
                        title="Request revisions from model creator"
                      >
                        <AlertCircle className="h-4 w-4" />
                        <span>Request Changes</span>
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => {
                          setRequestChanges(false);
                          setShowRejectModal(true);
                        }}
                        className="flex items-center gap-2 rounded-lg border border-[var(--danger)] bg-[var(--danger-surface)] px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition shadow-sm"
                        title="Reject model submission (Key: R)"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>[R] Reject</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full grid place-items-center p-12 text-center text-xs text-[var(--ink-faint)]">
                  <p>Select a pending model from the stream to inspect details.</p>
                </div>
              )}
            </div>
          </div>
        ) : activeTab !== "audit" ? (
          /* Tab 2 & 3: Flagged Models & Posts */
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

                  {/* High-Impact Action Bar */}
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
          /* Tab 4: Security & Governance Audit Log */
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

      {/* Reject / Request Changes Feedback Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-[var(--ink)]">
                {requestChanges ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <span>Request Changes from Creator</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                    <span>Reject Model Submission</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="font-mono text-xs text-[var(--ink-soft)]">
              {requestChanges
                ? "Provide feedback to the author explaining what modifications are required before publication."
                : "Specify the reason for rejecting this model submission. This note will be visible to the author on their model page."}
            </p>

            <textarea
              rows={4}
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="e.g. Please verify base model checkpoint compatibility and supply valid safetensors weight file."
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--accent)] resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-3.5 py-2 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] font-mono text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  handleReviewModel(
                    requestChanges ? "request_changes" : "reject",
                    false,
                    rejectFeedback.trim() || undefined
                  )
                }
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider text-white transition ${
                  requestChanges
                    ? "bg-amber-600 hover:bg-amber-500"
                    : "bg-[var(--danger)] hover:bg-rose-600"
                }`}
              >
                {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{requestChanges ? "Send Request" : "Confirm Rejection"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                <span className="text-[var(--ink-soft)]">Approve & Publish / Clear Flag:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-emerald-400">A</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--ink-soft)]">Reject Model Submission:</span>
                <kbd className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 border border-[var(--line)] font-bold text-[var(--danger)]">R</kbd>
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
