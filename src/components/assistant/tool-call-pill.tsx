"use client";

import * as React from "react";
import { Wrench, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallPillProps {
  toolName: string;
  status: "calling" | "completed" | "pending_confirmation" | "failed";
  args?: Record<string, unknown>;
  className?: string;
}

export function ToolCallPill({
  toolName,
  status,
  args,
  className,
}: ToolCallPillProps) {
  const formattedName = toolName.replace(/_/g, " ");

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
        status === "completed" && "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
        status === "pending_confirmation" && "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
        status === "calling" && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 animate-pulse",
        status === "failed" && "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
        className
      )}
    >
      {status === "calling" && <Wrench className="h-3.5 w-3.5 animate-spin" />}
      {status === "completed" && <CheckCircle2 className="h-3.5 w-3.5" />}
      {status === "pending_confirmation" && <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
      {status === "failed" && <AlertTriangle className="h-3.5 w-3.5" />}

      <span className="capitalize">{formattedName}</span>

      {status === "pending_confirmation" && (
        <span className="ml-1 text-[10px] uppercase font-bold tracking-wider px-1 py-0.2 bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded">
          Approval Required
        </span>
      )}
    </div>
  );
}
