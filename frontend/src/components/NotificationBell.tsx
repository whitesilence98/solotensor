"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import NotificationPopover from "./NotificationPopover";

interface NotificationBellProps {
  className?: string;
}

export default function NotificationBell({ className = "" }: NotificationBellProps) {
  const { isAuthenticated, unreadNotificationCount } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isOpen]);

  if (!isAuthenticated) {
    return null;
  }

  const badgeDisplay =
    unreadNotificationCount > 9 ? "9+" : String(unreadNotificationCount);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications ${unreadNotificationCount > 0 ? `(${unreadNotificationCount} unread)` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150 ${
          isOpen
            ? "border-[var(--accent)] bg-[var(--surface-soft)] text-[var(--accent)]"
            : unreadNotificationCount > 0
            ? "border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--surface-soft)]"
            : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
        }`}
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />

        {unreadNotificationCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[9px] font-black text-[var(--accent-ink)] shadow-[0_0_8px_var(--accent-ambient)] animate-pulse">
            {badgeDisplay}
          </span>
        )}
      </button>

      <NotificationPopover isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}
