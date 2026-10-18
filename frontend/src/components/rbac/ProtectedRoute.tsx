"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  KeyRound,
  Lock,
  LogIn,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { normalizeRoleName, type UserRole } from "@/lib/api";
import RoleBadge from "@/components/RoleBadge";

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: UserRole | UserRole[];
  requirePermission?: string | string[];
  requireAuth?: boolean;
  fallback?: React.ReactNode;
  redirectTo?: string;
  showAccessDenied?: boolean;
  title?: string;
  description?: string;
}

/**
 * Obsidian & Acid-Lime Route Guard wrapper for Next.js client views.
 * Bounded strictly to semantic CSS tokens with zero arbitrary hex values.
 */
export function ProtectedRoute({
  children,
  requireRole,
  requirePermission,
  requireAuth = true,
  fallback,
  redirectTo,
  showAccessDenied = true,
  title,
  description,
}: ProtectedRouteProps) {
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isLoading,
    primaryRole,
    roles,
    permissions,
    hasRole,
    hasPermission,
    switchRoleDemo,
    openAuthModal,
  } = useAuth();

  // Evaluate required roles
  const hasRequiredRole = useMemo(() => {
    if (!requireRole) return true;
    const targetRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
    // Admin role universally satisfies role checks
    if (roles.includes("admin") || primaryRole === "admin") return true;

    return targetRoles.some((r) => {
      const norm = normalizeRoleName(r);
      if (hasRole(norm)) return true;
      // Role hierarchy evaluation: moderator satisfies pro_creator checks
      if (norm === "pro_creator" && (hasRole("moderator") || hasRole("verified_creator"))) {
        return true;
      }
      return false;
    });
  }, [requireRole, roles, primaryRole, hasRole]);

  // Evaluate required permissions
  const hasRequiredPermission = useMemo(() => {
    if (!requirePermission) return true;
    const targetPerms = Array.isArray(requirePermission)
      ? requirePermission
      : [requirePermission];
    return targetPerms.every((perm) => hasPermission(perm));
  }, [requirePermission, hasPermission]);

  // Evaluate final authorized condition
  const isAuthorized = useMemo(() => {
    if (requireAuth && !isAuthenticated) return false;
    return hasRequiredRole && hasRequiredPermission;
  }, [requireAuth, isAuthenticated, hasRequiredRole, hasRequiredPermission]);

  // Automatic redirect if requested
  React.useEffect(() => {
    if (!isLoading && !isAuthorized && redirectTo) {
      router.push(redirectTo);
    }
  }, [isLoading, isAuthorized, redirectTo, router]);

  // 1. Loading State (Zero-CLS Shimmer Frame)
  if (isLoading) {
    return (
      <div className="workspace-bezel m-4 p-6 min-h-[420px] flex flex-col justify-center items-center">
        <div className="workspace-core w-full max-w-md p-8 flex flex-col items-center text-center space-y-4">
          <div className="h-10 w-10 rounded-xl bg-[var(--surface-soft)] border border-[var(--line-strong)] shimmer" />
          <div className="h-5 w-48 rounded-md bg-[var(--surface-soft)] shimmer" />
          <div className="h-3.5 w-64 rounded-md bg-[var(--surface-sunken)] shimmer" />
          <div className="w-full h-px bg-[var(--line)] my-2" />
          <div className="h-8 w-32 rounded-lg bg-[var(--surface-soft)] shimmer" />
        </div>
      </div>
    );
  }

  // 2. Authorized -> Render Children Directly
  if (isAuthorized) {
    return <>{children}</>;
  }

  // 3. Fallback override supplied by caller
  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showAccessDenied) {
    return null;
  }

  // 4. Unauthenticated Visitor State (401 Gate)
  if (requireAuth && !isAuthenticated) {
    return (
      <div className="workspace-bezel m-4 p-6 min-h-[460px] flex items-center justify-center">
        <div className="workspace-core w-full max-w-md p-7 text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-[0_0_24px_rgba(0,0,0,0.8)]">
            <Lock className="h-6 w-6 text-[var(--accent)]" />
          </div>

          <div className="space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--accent)] font-semibold">
              SEC-GATE // 401 UNAUTHENTICATED
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[var(--ink)]">
              {title || "Authentication Required"}
            </h2>
            <p className="font-sans text-xs text-[var(--ink-soft)] leading-relaxed">
              {description ||
                "This studio enclave is protected by SoloTensor security protocols. Sign in with your creator credentials to initialize node access."}
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => openAuthModal("route_guard")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all active:scale-[0.99] shadow-[0_0_20px_var(--accent-ambient)]"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In to Continue</span>
            </button>
          </div>

          <div className="border-t border-[var(--line)] pt-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Return to Studio Feed</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 5. Authenticated but Insufficient Tier / Missing Permissions (403 Gate)
  const roleReqDisplay = requireRole
    ? Array.isArray(requireRole)
      ? requireRole.join(" or ")
      : requireRole
    : null;

  const permReqDisplay = requirePermission
    ? Array.isArray(requirePermission)
      ? requirePermission.join(", ")
      : requirePermission
    : null;

  return (
    <div className="workspace-bezel m-4 p-6 min-h-[500px] flex items-center justify-center">
      <div className="workspace-core w-full max-w-lg p-7 text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-surface)] shadow-[0_0_24px_rgba(239,139,128,0.15)]">
          <ShieldAlert className="h-6 w-6 text-[var(--danger)]" />
        </div>

        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--danger)] font-bold">
            SEC-GATE // 403 ACCESS RESTRICTED
          </span>
          <h2 className="text-xl font-bold tracking-tight text-[var(--ink)]">
            {title || "Elevated Privileges Required"}
          </h2>
          <p className="font-sans text-xs text-[var(--ink-soft)] leading-relaxed">
            {description ||
              "Your current creator identity does not possess sufficient clearance to access this pipeline or governance darkroom."}
          </p>
        </div>

        {/* Diagnostic Metadata Panel */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 text-left font-mono text-xs space-y-2">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-1.5">
            <span className="text-[var(--ink-faint)]">Active Identity</span>
            <span className="font-semibold text-[var(--ink)]">
              @{user?.username || "authenticated_user"}
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-[var(--line)] pb-1.5">
            <span className="text-[var(--ink-faint)]">Assigned Role</span>
            <RoleBadge role={primaryRole} size="xs" />
          </div>

          {roleReqDisplay && (
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-1.5">
              <span className="text-[var(--ink-faint)]">Required Role</span>
              <span className="text-[var(--accent)] font-bold">{roleReqDisplay}</span>
            </div>
          )}

          {permReqDisplay && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--ink-faint)]">Capability Spec</span>
              <span className="text-[var(--warning)] font-mono text-[10px] truncate max-w-[200px]" title={permReqDisplay}>
                {permReqDisplay}
              </span>
            </div>
          )}
        </div>

        {/* Local RBAC Dev Switcher for seamless pairing & iteration */}
        <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-3.5 text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold">
              SOLOTENSOR STUDIO // RBAC EMULATION
            </span>
            <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">
              LOCAL DEMO MODE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => switchRoleDemo("pro_creator")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2 font-mono text-xs font-bold text-[var(--accent)] hover:bg-[var(--surface-soft)] transition active:scale-[0.98]"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Switch to Pro VIP</span>
            </button>
            <button
              type="button"
              onClick={() => switchRoleDemo("moderator")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2 font-mono text-xs font-bold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition active:scale-[0.98]"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Switch to Moderator</span>
            </button>
          </div>
        </div>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Studio Feed</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ProtectedRoute;
