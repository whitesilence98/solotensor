"use client";

import React, { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";

export interface CanProps {
  /**
   * Action or capability descriptor to test.
   * Examples: 'model:delete', 'model:edit', 'generation:delete', 'tool:delete', 'model:download_weights', 'moderation:review_queue'
   */
  do: string;
  /**
   * Optional resource descriptor name, e.g. 'model', 'generation', 'tool', 'comment'
   */
  on?: string;
  /**
   * ID of the resource owner. If provided, ownership matching is evaluated against current user.id.
   */
  ownerId?: string | null;
  /**
   * Username of the resource owner. Evaluated against current user.username.
   */
  ownerUsername?: string | null;
  /**
   * Content rendered when the current user is unauthorized.
   */
  fallback?: React.ReactNode;
  /**
   * Child element or render-prop function receiving evaluated `allowed` boolean.
   */
  children: React.ReactNode | ((allowed: boolean) => React.ReactNode);
}

/**
 * Declarative Feature Gating component for SoloTensor UI elements.
 * Adheres strictly to Obsidian brutalist styling and granular RBAC semantics.
 */
export function Can({
  do: action,
  on: resourceType,
  ownerId,
  ownerUsername,
  fallback = null,
  children,
}: CanProps) {
  const { user, isAuthenticated, hasPermission, permissions, primaryRole } = useAuth();

  const isAllowed = useMemo(() => {
    // Unauthenticated visitors have no privileged permissions
    if (!isAuthenticated || !user) {
      return false;
    }

    // Admin root clearance universally permits all actions
    if (permissions.includes("admin:full_access") || primaryRole === "admin") {
      return true;
    }

    // Determine resource ownership
    const isOwner = Boolean(
      (ownerId && String(user.id) === String(ownerId)) ||
        (ownerUsername &&
          user.username &&
          user.username.toLowerCase() === ownerUsername.toLowerCase())
    );

    // Resolve base resource & verb if passed as "resource:verb"
    const [actionResource, verb] = action.includes(":")
      ? action.split(":", 2)
      : [resourceType || "", action];

    const targetResource = resourceType || actionResource;

    // Verb-specific ownership evaluation: edit, delete, manage, update
    if (["delete", "edit", "update", "manage"].includes(verb)) {
      if (isOwner) {
        // Test owner-specific capability, e.g. 'model:delete_own' or 'generation:delete_own'
        const ownPerm = `${targetResource}:${verb}_own`;
        if (hasPermission(ownPerm) || hasPermission(action)) {
          return true;
        }
      }

      // Non-owner (or fallback): test administrative/moderator capability, e.g. 'model:delete_any'
      const anyPerm = `${targetResource}:${verb}_any`;
      if (hasPermission(anyPerm)) {
        return true;
      }

      return false;
    }

    // Direct permission test
    return hasPermission(action);
  }, [
    isAuthenticated,
    user,
    permissions,
    primaryRole,
    ownerId,
    ownerUsername,
    action,
    resourceType,
    hasPermission,
  ]);

  if (typeof children === "function") {
    return <>{children(isAllowed)}</>;
  }

  return isAllowed ? <>{children}</> : <>{fallback}</>;
}

export default Can;
