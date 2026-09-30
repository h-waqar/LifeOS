"use client";

import * as React from "react";
import {
  Calendar as CalendarIcon,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  PowerOff,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { GoogleCalendarConnectionDTO, SyncResult } from "@/types";

interface GoogleCalendarSyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncComplete?: () => void;
}

export function GoogleCalendarSyncModal({
  open,
  onOpenChange,
  onSyncComplete,
}: GoogleCalendarSyncModalProps) {
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [status, setStatus] = React.useState<GoogleCalendarConnectionDTO | null>(null);

  const fetchStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/integrations/google-calendar/status");
      if (res.ok) {
        const data = (await res.json()) as GoogleCalendarConnectionDTO;
        setStatus(data);
      } else {
        toast.error("Failed to load Google Calendar integration status");
      }
    } catch {
      toast.error("Network error fetching integration status");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      void fetchStatus();
    }
  }, [open, fetchStatus]);

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/integrations/google-calendar/auth");
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to start Google OAuth flow");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error("Failed to initiate Google authentication");
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      const res = await fetch("/api/integrations/google-calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullSync: false }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Synchronization failed");
        return;
      }

      const syncResult = data as SyncResult;
      toast.success(
        `Synchronized successfully: ${syncResult.itemsCreated} created, ${syncResult.itemsUpdated} updated, ${syncResult.itemsDeleted} deleted.`
      );

      await fetchStatus();
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch {
      toast.error("Network error during synchronization");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Are you sure you want to disconnect Google Calendar?")) {
      return;
    }

    try {
      setDisconnecting(true);
      const res = await fetch("/api/integrations/google-calendar/disconnect", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to disconnect Google Calendar");
        return;
      }

      toast.success("Google Calendar disconnected");
      await fetchStatus();
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch {
      toast.error("Network error disconnecting integration");
    } finally {
      setDisconnecting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-calendar-modal-title"
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="google-calendar-modal-title"
                className="text-lg font-semibold text-foreground"
              >
                Google Calendar Integration
              </h2>
              <p className="text-xs text-muted-foreground">
                Two-way synchronization between LifeOS & Google Calendar
              </p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-6 space-y-4">
          {loading ? (
            <div className="flex h-36 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : status?.connected ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium text-foreground">
                      Status: Connected
                    </span>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    Active
                  </Badge>
                </div>
                {status.accountEmail && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Google Account: <span className="font-mono text-foreground">{status.accountEmail}</span>
                  </p>
                )}
                {status.lastSyncedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last synced: {new Date(status.lastSyncedAt).toLocaleString()}
                  </p>
                )}
                {status.syncStats && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border pt-2">
                    <div>
                      Mapped events: <span className="font-semibold text-foreground">{status.syncStats.totalMappings}</span>
                    </div>
                    <div>
                      Sync health:{" "}
                      <span
                        className={
                          status.syncStats.lastSyncStatus === "failed"
                            ? "text-red-500 font-semibold"
                            : "text-emerald-500 font-semibold"
                        }
                      >
                        {status.syncStats.lastSyncStatus ?? "OK"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                <p>
                  Automatic synchronization runs in the background every 5 minutes. You can also trigger a manual sync right now.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="flex-1 gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Sync Now"}
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 gap-2"
                >
                  <PowerOff className="h-4 w-4" />
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-amber-500">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Not Connected</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Connect your Google account to automatically synchronize scheduled time blocks with Google Calendar and pull external events into your LifeOS day.
                </p>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Two-way synchronization with conflict detection</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>AES-256-GCM encrypted tokens at rest</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Incremental sync using Google syncToken</span>
                </div>
              </div>

              <Button onClick={handleConnect} className="w-full gap-2 mt-4">
                <ExternalLink className="h-4 w-4" />
                Connect Google Calendar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
