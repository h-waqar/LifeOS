"use client";

import * as React from "react";
import {
  Info,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Check,
  Trash2,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationDTO } from "@/types";

interface NotificationItemProps {
  notification: NotificationDTO;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate?: (url: string) => void;
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onNavigate,
}: NotificationItemProps) {
  const isSilenced =
    Boolean(notification.metadata?.silenced) ||
    Boolean(notification.metadata?.duringQuietHours);

  const formatRelativeTime = (isoString: string): string => {
    try {
      const created = new Date(isoString).getTime();
      const diffSeconds = Math.max(0, Math.floor((Date.now() - created) / 1000));

      if (diffSeconds < 60) return "Just now";
      const diffMinutes = Math.floor(diffSeconds / 60);
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return new Date(isoString).toLocaleDateString();
    } catch {
      return "";
    }
  };

  const renderIcon = () => {
    switch (notification.type) {
      case "warning":
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
          </div>
        );
      case "success":
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        );
      case "error":
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertCircle className="h-4 w-4" />
          </div>
        );
      case "reminder":
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-purple-500">
            <Clock className="h-4 w-4" />
          </div>
        );
      case "info":
      default:
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-500">
            <Info className="h-4 w-4" />
          </div>
        );
    }
  };

  const handleClick = () => {
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
    if (notification.linkUrl && onNavigate) {
      onNavigate(notification.linkUrl);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 p-3 transition-colors border-b last:border-b-0",
        notification.isRead
          ? "bg-card/40 opacity-75 hover:bg-muted/40 hover:opacity-100"
          : "bg-primary/5 hover:bg-primary/10",
        notification.linkUrl && "cursor-pointer"
      )}
      onClick={notification.linkUrl ? handleClick : undefined}
      data-testid={`notification-item-${notification.id}`}
      data-read={notification.isRead ? "true" : "false"}
    >
      {renderIcon()}

      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center justify-between gap-1.5 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {!notification.isRead && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-primary"
                title="Unread"
                aria-label="Unread notification"
              />
            )}
            <h4
              className={cn(
                "text-xs font-semibold truncate",
                !notification.isRead ? "text-foreground font-bold" : "text-muted-foreground"
              )}
            >
              {notification.title}
            </h4>
          </div>

          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed break-words">
          {notification.message}
        </p>

        <div className="flex items-center gap-2 mt-1.5">
          {isSilenced && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded"
              title="Delivered during quiet hours"
            >
              <Moon className="h-2.5 w-2.5" />
              Quiet Hours
            </span>
          )}

          {notification.linkUrl && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-medium">
              View <ExternalLink className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {!notification.isRead && (
          <button
            onClick={() => onMarkAsRead(notification.id)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            title="Mark as read"
            aria-label="Mark as read"
            data-testid={`mark-read-button-${notification.id}`}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(notification.id)}
          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete notification"
          aria-label="Delete notification"
          data-testid={`delete-button-${notification.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
