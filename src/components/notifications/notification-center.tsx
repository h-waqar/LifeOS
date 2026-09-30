"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  RefreshCw,
  Inbox,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "./notification-item";
import type { NotificationDTO } from "@/types";
import { toast } from "sonner";

interface NotificationCenterProps {
  className?: string;
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notifications, setNotifications] = React.useState<NotificationDTO[]>([]);
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Fetch unread count periodically
  const fetchUnreadCount = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      }
    } catch {
      // Ignore background poll errors
    }
  }, []);

  // Fetch full notification list
  const fetchNotifications = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (unreadOnly) {
        query.set("unreadOnly", "true");
      }
      query.set("limit", "50");

      const res = await fetch(`/api/notifications?${query.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load notifications");
      }

      const data = await res.json();
      setNotifications(data.notifications ?? []);
      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, [unreadOnly]);

  // Initial load and periodic unread poll
  React.useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch notifications whenever popover opens or filter changes
  React.useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Close popover when clicking outside or pressing Escape
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id: string) => {
    // Optimistic local update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      if (!res.ok) {
        throw new Error("Failed to mark notification as read");
      }
    } catch {
      toast.error("Failed to update notification");
      fetchNotifications();
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    // Optimistic local update
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        isRead: true,
        readAt: new Date().toISOString(),
      }))
    );
    setUnreadCount(0);

    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to mark all as read");
      }
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all notifications as read");
      fetchNotifications();
    }
  };

  const handleDelete = async (id: string) => {
    const toDelete = notifications.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (toDelete && !toDelete.isRead) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete notification");
      }
    } catch {
      toast.error("Failed to delete notification");
      fetchNotifications();
    }
  };

  const handleNavigate = (url: string) => {
    setIsOpen(false);
    router.push(url);
  };

  return (
    <div className={cn("relative inline-block", className)} ref={containerRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        title={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        data-testid="notification-bell-button"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white shadow-xs animate-in zoom-in-75 duration-200"
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Popover Card */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Center"
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border bg-card text-card-foreground shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150"
          data-testid="notification-popover"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted"
                  title="Mark all notifications as read"
                  data-testid="mark-all-read-button"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                onClick={fetchNotifications}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Refresh notifications"
                aria-label="Refresh notifications"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
                />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-1 px-4 py-2 border-b bg-background/50 text-xs">
            <button
              onClick={() => setUnreadOnly(false)}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                !unreadOnly
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              All
            </button>
            <button
              onClick={() => setUnreadOnly(true)}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                unreadOnly
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Unread only
            </button>
          </div>

          {/* Content Body */}
          <div className="max-h-[380px] overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                <span>Loading notifications...</span>
              </div>
            ) : error ? (
              <div className="p-8 text-center text-xs text-destructive space-y-2">
                <AlertCircle className="h-6 w-6 mx-auto" />
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchNotifications}
                  className="text-xs h-7"
                >
                  Retry
                </Button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mx-auto text-muted-foreground">
                  <Inbox className="h-5 w-5" />
                </div>
                <h4 className="text-xs font-semibold">All caught up</h4>
                <p className="text-[11px] text-muted-foreground max-w-[200px] mx-auto">
                  {unreadOnly
                    ? "No unread notifications to display."
                    : "No notifications at the moment."}
                </p>
              </div>
            ) : (
              <div>
                {notifications.map((notif) => (
                  <NotificationItem
                    key={notif.id}
                    notification={notif}
                    onMarkAsRead={handleMarkAsRead}
                    onDelete={handleDelete}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
