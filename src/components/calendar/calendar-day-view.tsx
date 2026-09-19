"use client";

import * as React from "react";
import { Plus, AlertTriangle, CheckSquare, Flame, Calendar as CalendarIcon, Clock } from "lucide-react";
import { TimeBlockCard } from "./time-block-card";
import { Badge } from "@/components/ui/badge";
import type { TimeBlockDTO, CalendarEventDeadline } from "@/types";

interface CalendarDayViewProps {
  date: Date;
  timeBlocks: TimeBlockDTO[];
  deadlines: CalendarEventDeadline[];
  onSelectBlock: (block: TimeBlockDTO) => void;
  onCompleteBlock: (block: TimeBlockDTO) => void;
  onCreateSlot: (dateStr: string, startTimeStr: string, endTimeStr: string) => void;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 to 23:00

export function CalendarDayView({
  date,
  timeBlocks,
  deadlines,
  onSelectBlock,
  onCompleteBlock,
  onCreateSlot,
}: CalendarDayViewProps) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  // Filter time blocks belonging to this day
  const dayBlocks = timeBlocks.filter((b) => {
    const s = new Date(b.startTime);
    const byyyy = s.getFullYear();
    const bmm = String(s.getMonth() + 1).padStart(2, "0");
    const bdd = String(s.getDate()).padStart(2, "0");
    return `${byyyy}-${bmm}-${bdd}` === dateStr;
  });

  // Filter deadlines for this day
  const dayDeadlines = deadlines.filter((d) => d.date.startsWith(dateStr));

  const totalConflicts = dayBlocks.filter((b) => b.hasConflict).length;

  return (
    <div className="space-y-4" data-testid="calendar-day-view">
      {/* Top Deadlines and Habit Cues Banner */}
      {dayDeadlines.length > 0 && (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2" data-testid="day-deadlines-banner">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Today&apos;s Deadlines &amp; Scheduled Items ({dayDeadlines.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {dayDeadlines.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-card shadow-sm"
              >
                {item.type === "task_due" && (
                  <CheckSquare className="h-3.5 w-3.5 text-destructive" />
                )}
                {item.type === "task_scheduled" && (
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                )}
                {item.type === "project_deadline" && (
                  <CalendarIcon className="h-3.5 w-3.5 text-purple-500" />
                )}
                {item.type === "habit_cue" && (
                  <Flame className="h-3.5 w-3.5 text-orange-500" />
                )}
                <span>{item.title}</span>
                {item.time && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    @{item.time}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflict Warning Header */}
      {totalConflicts > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {totalConflicts} overlapping time block{totalConflicts > 1 ? "s" : ""} scheduled today.
          </span>
        </div>
      )}

      {/* Hourly Timeline Grid */}
      <div className="divide-y rounded-xl border bg-card shadow-sm overflow-hidden">
        {HOURS.map((hour) => {
          const hourStr = `${String(hour).padStart(2, "0")}:00`;
          const nextHourStr = `${String(hour + 1).padStart(2, "0")}:00`;

          // Blocks starting in this hour
          const slotBlocks = dayBlocks.filter((b) => {
            const s = new Date(b.startTime);
            return s.getHours() === hour;
          });

          return (
            <div
              key={hour}
              className="flex min-h-[72px] transition-colors hover:bg-muted/20 group"
              data-testid={`day-hour-slot-${hour}`}
            >
              {/* Hour Label */}
              <div className="w-16 sm:w-20 shrink-0 p-2.5 text-right border-r text-xs font-mono text-muted-foreground select-none">
                {hourStr}
              </div>

              {/* Slot Area */}
              <div className="flex-1 p-2 flex flex-col justify-center relative">
                {slotBlocks.length > 0 ? (
                  <div className="space-y-2">
                    {slotBlocks.map((block) => (
                      <TimeBlockCard
                        key={block.id}
                        block={block}
                        onSelect={onSelectBlock}
                        onCompleteToggle={onCompleteBlock}
                      />
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onCreateSlot(dateStr, hourStr, nextHourStr)}
                    className="h-full w-full rounded-md border border-dashed border-transparent group-hover:border-border/60 flex items-center justify-center text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:bg-muted/30"
                    data-testid={`create-slot-btn-${hour}`}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    <span>Block {hourStr}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
