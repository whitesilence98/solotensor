"use client";

import React from "react";
import { useAuth } from "@/lib/auth-context";

export interface ModGateProps {
  children: React.ReactNode | ((isMod: boolean) => React.ReactNode);
  fallback?: React.ReactNode;
}

/**
 * Specialized Staff & Community Moderator Gate wrapper.
 * Gated strictly to `isMod` (`moderator`, `admin`, or `moderation:review_queue` capability).
 */
export function ModGate({ children, fallback = null }: ModGateProps) {
  const { isMod } = useAuth();

  if (typeof children === "function") {
    return <>{children(isMod)}</>;
  }

  return isMod ? <>{children}</> : <>{fallback}</>;
}

export default ModGate;
