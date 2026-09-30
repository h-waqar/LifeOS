"use client";

import * as React from "react";
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ActionPreview } from "@/types";

interface ActionConfirmationCardProps {
  actionId: string;
  toolName: string;
  preview: ActionPreview;
  expiresAt?: string;
  onConfirmed?: (res: any) => void;
  onRejected?: () => void;
  className?: string;
}

export function ActionConfirmationCard({
  actionId,
  toolName,
  preview,
  expiresAt,
  onConfirmed,
  onRejected,
  className,
}: ActionConfirmationCardProps) {
  const [status, setStatus] = React.useState<
    "pending" | "executed" | "rejected" | "expired"
  >("pending");
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isRejecting, setIsRejecting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // 5-minute countdown calculation
  const [secondsRemaining, setSecondsRemaining] = React.useState<number>(() => {
    if (expiresAt) {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      return diff;
    }
    return 300; // 5 minutes default
  });

  React.useEffect(() => {
    if (status !== "pending") return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${String(remainder).padStart(2, "0")}`;
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/ai/actions/${actionId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to confirm action");
      }

      setStatus("executed");
      toast.success("Action executed successfully");
      onConfirmed?.(data.data?.executionResult);
    } catch (err: any) {
      setErrorMessage(err.message || "Execution failed");
      toast.error(err.message || "Failed to confirm action");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/ai/actions/${actionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User cancelled from card" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reject action");
      }

      setStatus("rejected");
      toast.info("Action cancelled");
      onRejected?.();
    } catch (err: any) {
      setErrorMessage(err.message || "Rejection failed");
      toast.error(err.message || "Failed to reject action");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 shadow-sm transition-all",
        status === "executed" && "border-emerald-300 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20",
        status === "rejected" && "border-slate-300 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 opacity-70",
        status === "expired" && "border-rose-300 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20 opacity-80",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h4 className="text-sm font-semibold text-foreground">
            Confirmation Required
          </h4>
        </div>

        {status === "pending" && (
          <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border border-border">
            <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>{formatTimer(secondsRemaining)}</span>
          </div>
        )}

        {status === "executed" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" /> Executed
          </span>
        )}

        {status === "rejected" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
            <XCircle className="h-3.5 w-3.5" /> Cancelled
          </span>
        )}

        {status === "expired" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-500">
            <AlertTriangle className="h-3.5 w-3.5" /> Expired
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-foreground/90 font-medium">
        {preview.summary}
      </p>

      {preview.warning && (
        <div className="mt-2 rounded-md bg-amber-100/70 dark:bg-amber-900/30 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          ⚠️ {preview.warning}
        </div>
      )}

      {preview.diff && Object.keys(preview.diff).length > 0 && (
        <div className="mt-3 rounded-lg bg-background/80 p-2.5 border text-xs font-mono space-y-1">
          {Object.entries(preview.diff).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-semibold text-foreground">
                {String(value.after ?? value.before ?? "")}
              </span>
            </div>
          ))}
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 text-xs text-destructive font-medium">
          {errorMessage}
        </p>
      )}

      {status === "pending" && (
        <div className="mt-3.5 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReject}
            disabled={isConfirming || isRejecting}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            {isRejecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Reject"
            )}
          </Button>

          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={isConfirming || isRejecting}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            {isConfirming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Approve & Execute"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
