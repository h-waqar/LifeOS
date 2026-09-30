"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, History, Trash2, Clock, Play } from "lucide-react";
import type { AutomationDTO } from "@/types";
import { formatRelativeTime } from "@/lib/utils/time";

interface AutomationCardProps {
  automation: AutomationDTO;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onViewHistory: () => void;
  onManualTrigger?: () => void;
}

const TRIGGER_VARIANT: Record<string, "info" | "purple" | "warning" | "secondary"> = {
  event: "info",
  schedule: "purple",
  threshold: "warning",
};

const ACTION_LABELS: Record<string, string> = {
  create_notification: "Send Notification",
  create_task: "Create Task",
  update_task: "Update Task",
  update_project: "Update Project",
  log_audit: "Log Audit",
  trigger_ai_suggestions: "AI Suggestions",
};

export function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDelete,
  onViewHistory,
  onManualTrigger,
}: AutomationCardProps) {
  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${automation.name}"?`)) {
      onDelete(automation.id);
    }
  };

  return (
    <Card className="flex flex-col" data-testid={`automation-card-${automation.id}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <span className="truncate">{automation.name}</span>
              <Badge variant={TRIGGER_VARIANT[automation.triggerType] ?? "secondary"}>
                {automation.triggerType}
              </Badge>
            </CardTitle>
            {automation.description && (
              <CardDescription className="text-xs line-clamp-2">{automation.description}</CardDescription>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge variant={automation.isActive ? "success" : "secondary"}>
              {automation.isActive ? "Active" : "Inactive"}
            </Badge>
            <button
              type="button"
              role="switch"
              aria-checked={automation.isActive}
              aria-label={`${automation.isActive ? "Disable" : "Enable"} ${automation.name}`}
              onClick={() => onToggle(automation.id, !automation.isActive)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                automation.isActive ? "bg-primary" : "bg-input"
              }`}
              data-testid={`automation-toggle-${automation.id}`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  automation.isActive ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="text-xs bg-muted/50 p-2.5 rounded-md">
          <span className="font-medium text-muted-foreground">Action: </span>
          <span>{ACTION_LABELS[automation.actionType] ?? automation.actionType}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(automation.lastRunAt)}
          </div>
          <div className="flex items-center gap-1">
            <Play className="w-3 h-3" />
            {automation.executionCount} runs
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-3 border-t flex flex-wrap justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onViewHistory} aria-label="View history">
          <History className="w-3.5 h-3.5 mr-1" />
          History
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onEdit} aria-label="Edit automation">
          <Edit2 className="w-3.5 h-3.5 mr-1" />
          Edit
        </Button>
        {onManualTrigger && automation.isActive && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={onManualTrigger} aria-label="Trigger automation">
            <Play className="w-3.5 h-3.5 mr-1" />
            Run
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          aria-label="Delete automation"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}
