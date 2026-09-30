"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import type { GoalRiskLevel } from "@/types";

interface GoalRiskBadgeProps {
  riskLevel: GoalRiskLevel;
  riskScore?: number;
  showScore?: boolean;
  className?: string;
  onClick?: () => void;
}

export function getRiskLevelConfig(level: GoalRiskLevel) {
  switch (level) {
    case "completed":
      return {
        label: "Completed",
        colorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        icon: CheckCircle2,
      };
    case "on_track":
      return {
        label: "On Track",
        colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        icon: TrendingUp,
      };
    case "low_risk":
      return {
        label: "Low Risk",
        colorClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        icon: Clock,
      };
    case "medium_risk":
      return {
        label: "Medium Risk",
        colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        icon: AlertTriangle,
      };
    case "high_risk":
      return {
        label: "High Risk",
        colorClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
        icon: AlertTriangle,
      };
    case "critical":
      return {
        label: "Critical",
        colorClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        icon: AlertOctagon,
      };
    default:
      return {
        label: "Unknown",
        colorClass: "bg-muted text-muted-foreground",
        icon: ShieldAlert,
      };
  }
}

export function GoalRiskBadge({
  riskLevel,
  riskScore,
  showScore = false,
  className = "",
  onClick,
}: GoalRiskBadgeProps) {
  const config = getRiskLevelConfig(riskLevel);
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors hover:opacity-85 ${config.colorClass} ${className}`}
      data-testid={`goal-risk-badge-${riskLevel}`}
      title={riskScore !== undefined ? `Risk Score: ${riskScore}/100` : undefined}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{config.label}</span>
      {showScore && riskScore !== undefined && riskLevel !== "completed" && (
        <span className="opacity-75 font-mono text-[10px]">({riskScore})</span>
      )}
    </Badge>
  );
}
