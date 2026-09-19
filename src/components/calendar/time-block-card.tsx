"use client";

import * as React from "react";
import { CheckCircle2, Circle, Clock, AlertTriangle, CheckSquare, Flame } from "lucide-react";
import { CommitmentBadge, ConflictBadge } from "@/components/ui/badge";
import type { TimeBlockDTO } from "@/types";

interface TimeBlockCardProps {
  block: TimeBlockDTO;
  onSelect: (block: TimeBlockDTO) => void;
  onCompleteToggle: (block: TimeBlockDTO) => void;
  compact?: boolean;
}

export function TimeBlockCard({
  block,
  onSelect,
  onCompleteToggle,
  compact = false,
}: TimeBlockCardProps) {
  const isCompleted = block.status === "completed";

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const startTimeStr = formatTime(block.startTime);
  const endTimeStr = formatTime(block.endTime);

  const borderClass = block.hasHardConflict
    ? "border-destructive/80 bg-destructive/5 hover:border-destructive"
    : block.hasConflict
    ? "border-amber-500/80 bg-amber-500/5 hover:border-amber-500"
    : isCompleted
    ? "border-emerald-500/40 bg-emerald-500/5"
    : "border-border hover:border-primary/50 bg-card";

  return (
    <div
      onClick={() => onSelect(block)}
      className={`group relative flex flex-col justify-between rounded-lg border p-2.5 sm:p-3 transition-all cursor-pointer shadow-sm hover:shadow-md ${borderClass}`}
      data-testid={`timeblock-card-${block.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {/* Complete Toggle Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCompleteToggle(block);
            }}
            className={`shrink-0 mt-0.5 transition-transform active:scale-95 focus:outline-none ${
              isCompleted
                ? "text-emerald-500 hover:text-emerald-600"
                : "text-muted-foreground hover:text-primary"
            }`}
            title={isCompleted ? "Mark scheduled" : "Mark completed"}
            aria-label={isCompleted ? `Mark ${block.title} scheduled` : `Mark ${block.title} completed`}
            data-testid={`timeblock-complete-toggle-${block.id}`}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 fill-emerald-500/20" />
            ) : (
              <Circle className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </button>

          <div className="min-w-0">
            <h4
              className={`text-xs sm:text-sm font-semibold truncate leading-tight ${
                isCompleted ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {block.title}
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                {startTimeStr} – {endTimeStr} ({block.durationMinutes}m)
              </span>
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1 shrink-0">
          <CommitmentBadge level={block.commitmentLevel} />
          <ConflictBadge
            hasHardConflict={block.hasHardConflict}
            hasConflict={block.hasConflict}
          />
        </div>
      </div>

      {/* Linked Entity Badges & Info */}
      {!compact && (block.taskTitle || block.habitTitle || block.projectTitle) && (
        <div className="mt-2 pt-2 border-t flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {block.taskTitle && (
            <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[150px]">
              <CheckSquare className="h-2.5 w-2.5 text-primary shrink-0" />
              <span className="truncate">{block.taskTitle}</span>
            </span>
          )}
          {block.habitTitle && (
            <span className="inline-flex items-center gap-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[150px]">
              <Flame className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{block.habitTitle}</span>
            </span>
          )}
          {isCompleted && block.actualMinutes !== null && block.actualMinutes !== undefined && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium ml-auto">
              Actual: {block.actualMinutes}m
            </span>
          )}
        </div>
      )}
    </div>
  );
}
