"use client";

import * as React from "react";
import { CheckSquare, Clock, AlertTriangle, Plus, Flame } from "lucide-react";
import type { TimeBlockDTO, CalendarEventDeadline } from "@/types";

interface CalendarMonthViewProps {
  currentMonth: Date; // Any date within the displayed month
  timeBlocks: TimeBlockDTO[];
  deadlines: CalendarEventDeadline[];
  onSelectDay: (date: Date) => void;
  onSelectBlock: (block: TimeBlockDTO) => void;
  onCreateSlot: (dateStr: string, startTimeStr: string, endTimeStr: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarMonthView({
  currentMonth,
  timeBlocks,
  deadlines,
  onSelectDay,
  onSelectBlock,
  onCreateSlot,
}: CalendarMonthViewProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed

  // Compute month cells:
  // First day of month
  const firstDay = new Date(year, month, 1);
  // Weekday of 1st day (0 is Sun, 1 is Mon... let's convert to 0 = Mon, 6 = Sun)
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;

  // Total days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Total cells in grid (multiple of 7)
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const todayStr = new Date().toISOString().slice(0, 10);

  const cells = React.useMemo(() => {
    return Array.from({ length: totalCells }, (_, i) => {
      const dayOffset = i - firstDayOfWeek + 1;
      const cellDate = new Date(year, month, dayOffset);
      const yyyy = cellDate.getFullYear();
      const mm = String(cellDate.getMonth() + 1).padStart(2, "0");
      const dd = String(cellDate.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const isCurrentMonth = cellDate.getMonth() === month;

      return {
        date: cellDate,
        dateStr,
        dayNumber: cellDate.getDate(),
        isCurrentMonth,
      };
    });
  }, [year, month, firstDayOfWeek, daysInMonth, totalCells]);

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm" data-testid="calendar-month-view">
      {/* Weekday Header */}
      <div className="grid grid-cols-7 gap-1 text-center pb-2 border-b">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-xs font-semibold text-muted-foreground uppercase py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell) => {
          const isToday = cell.dateStr === todayStr;

          // Time blocks for this day
          const dayBlocks = timeBlocks.filter((b) => {
            const s = new Date(b.startTime);
            const byyyy = s.getFullYear();
            const bmm = String(s.getMonth() + 1).padStart(2, "0");
            const bdd = String(s.getDate()).padStart(2, "0");
            return `${byyyy}-${bmm}-${bdd}` === cell.dateStr;
          });

          // Deadlines for this day
          const dayDeadlines = deadlines.filter((d) => d.date.startsWith(cell.dateStr));

          const hasConflict = dayBlocks.some((b) => b.hasConflict);

          return (
            <div
              key={cell.dateStr}
              onClick={() => onSelectDay(cell.date)}
              className={`min-h-[90px] sm:min-h-[110px] rounded-lg border p-1.5 flex flex-col justify-between transition-all cursor-pointer hover:border-primary/50 ${
                isToday
                  ? "border-primary bg-primary/5"
                  : cell.isCurrentMonth
                  ? "border-border/70 bg-card hover:bg-muted/30"
                  : "border-transparent bg-muted/10 opacity-40 hover:opacity-70"
              }`}
              data-testid={`month-day-cell-${cell.dateStr}`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold ${
                    isToday
                      ? "rounded-full bg-primary text-primary-foreground h-5 w-5 flex items-center justify-center"
                      : "text-foreground"
                  }`}
                >
                  {cell.dayNumber}
                </span>

                <div className="flex items-center gap-1">
                  {hasConflict && (
                    <span title="Overlap conflict">
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSlot(cell.dateStr, "09:00", "10:00");
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity p-0.5 rounded text-muted-foreground"
                    title="Quick add block"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Items List (up to 3 pills) */}
              <div className="flex-1 space-y-1 mt-1 overflow-hidden">
                {/* Deadlines */}
                {dayDeadlines.slice(0, 1).map((dl) => (
                  <div
                    key={dl.id}
                    className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium bg-destructive/10 text-destructive truncate"
                    title={dl.title}
                  >
                    <CheckSquare className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{dl.title}</span>
                  </div>
                ))}

                {/* Time Blocks */}
                {dayBlocks.slice(0, 2).map((b) => (
                  <div
                    key={b.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBlock(b);
                    }}
                    className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium truncate cursor-pointer hover:opacity-80 ${
                      b.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 line-through"
                        : b.commitmentLevel === "hard"
                        ? "bg-red-500/15 text-red-600 dark:text-red-400 font-semibold"
                        : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                    }`}
                    title={`${b.title} (${b.durationMinutes}m)`}
                  >
                    <span className="truncate">{b.title}</span>
                  </div>
                ))}

                {dayBlocks.length > 2 && (
                  <span className="text-[9px] text-muted-foreground block font-medium">
                    +{dayBlocks.length - 2} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
