"use client";

import * as React from "react";
import { Plus, CheckSquare, Calendar as CalendarIcon, Clock, Flame } from "lucide-react";
import { TimeBlockCard } from "./time-block-card";
import type { TimeBlockDTO, CalendarEventDeadline } from "@/types";

interface CalendarWeekViewProps {
  startDate: Date; // Monday of the week
  timeBlocks: TimeBlockDTO[];
  deadlines: CalendarEventDeadline[];
  onSelectBlock: (block: TimeBlockDTO) => void;
  onCompleteBlock: (block: TimeBlockDTO) => void;
  onCreateSlot: (dateStr: string, startTimeStr: string, endTimeStr: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarWeekView({
  startDate,
  timeBlocks,
  deadlines,
  onSelectBlock,
  onCompleteBlock,
  onCreateSlot,
}: CalendarWeekViewProps) {
  // Generate the 7 days of the week starting from startDate
  const days = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      return {
        date: d,
        dateStr,
        dayName: WEEKDAYS[i],
        dayNumber: d.getDate(),
      };
    });
  }, [startDate]);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3" data-testid="calendar-week-view">
      {/* 7 Columns Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {days.map((day) => {
          const isToday = day.dateStr === todayStr;

          // Time blocks for this day
          const dayBlocks = timeBlocks.filter((b) => {
            const s = new Date(b.startTime);
            const byyyy = s.getFullYear();
            const bmm = String(s.getMonth() + 1).padStart(2, "0");
            const bdd = String(s.getDate()).padStart(2, "0");
            return `${byyyy}-${bmm}-${bdd}` === day.dateStr;
          });

          // Deadlines for this day
          const dayDeadlines = deadlines.filter((d) => d.date.startsWith(day.dateStr));

          return (
            <div
              key={day.dateStr}
              className={`flex flex-col rounded-xl border p-2.5 min-h-[320px] transition-colors ${
                isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card"
              }`}
              data-testid={`week-day-column-${day.dateStr}`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between pb-2 border-b mb-2">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                    {day.dayName}
                  </span>
                  <span
                    className={`text-base font-bold ${
                      isToday ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {day.dayNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onCreateSlot(day.dateStr, "09:00", "10:00")}
                  className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                  title="Schedule block for this day"
                  data-testid={`week-add-block-${day.dateStr}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Deadlines Pills */}
              {dayDeadlines.length > 0 && (
                <div className="space-y-1 mb-2">
                  {dayDeadlines.map((dl) => (
                    <div
                      key={dl.id}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-muted/60 truncate"
                      title={dl.title}
                    >
                      {dl.type === "task_due" && (
                        <CheckSquare className="h-2.5 w-2.5 text-destructive shrink-0" />
                      )}
                      {dl.type === "project_deadline" && (
                        <CalendarIcon className="h-2.5 w-2.5 text-purple-500 shrink-0" />
                      )}
                      {dl.type === "habit_cue" && (
                        <Flame className="h-2.5 w-2.5 text-orange-500 shrink-0" />
                      )}
                      <span className="truncate">{dl.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Time Blocks List */}
              <div className="flex-1 space-y-2">
                {dayBlocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-28 text-center text-muted-foreground/60 text-xs">
                    <span>No blocks</span>
                  </div>
                ) : (
                  dayBlocks.map((block) => (
                    <TimeBlockCard
                      key={block.id}
                      block={block}
                      onSelect={onSelectBlock}
                      onCompleteToggle={onCompleteBlock}
                      compact
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
