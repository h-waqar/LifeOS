"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge, FrequencyBadge, TimeOfDayBadge } from "@/components/ui/badge";
import type { HabitDTO } from "@/types";
import {
  Flame,
  Trophy,
  CheckCircle2,
  Circle,
  Loader2,
  MoreVertical,
  Edit2,
  Trash2,
  Archive,
  ArchiveRestore,
  Target,
  BarChart2,
} from "lucide-react";

interface HabitCardProps {
  habit: HabitDTO;
  goalTitle?: string;
  onToggle: (habit: HabitDTO) => Promise<void>;
  isToggling?: boolean;
  onViewDetails: (habit: HabitDTO) => void;
  onEdit: (habit: HabitDTO) => void;
  onArchiveToggle: (habit: HabitDTO) => void;
  onDelete: (habit: HabitDTO) => void;
}

export function HabitCard({
  habit,
  goalTitle,
  onToggle,
  isToggling = false,
  onViewDetails,
  onEdit,
  onArchiveToggle,
  onDelete,
}: HabitCardProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown menu on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const isCompleted = !!habit.isCompletedToday;
  const isArchived = habit.status === "archived";
  const isPaused = habit.status === "paused";

  // Compute last 7 calendar days (from 6 days ago up to today)
  const recentDays = React.useMemo(() => {
    const days: { dateStr: string; dayLabel: string; isToday: boolean; isCompleted: boolean }[] = [];
    const today = new Date();
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dayNum = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${dayNum}`;

      const isToday = i === 0;
      let completed = false;

      if (isToday) {
        completed = isCompleted;
      } else if (habit.entries && habit.entries.length > 0) {
        completed = habit.entries.some(
          (e) => e.date === dateStr && e.value >= (habit.targetValue || 1)
        );
      }

      days.push({
        dateStr,
        dayLabel: dayNames[d.getDay()],
        isToday,
        isCompleted: completed,
      });
    }
    return days;
  }, [habit.entries, habit.targetValue, isCompleted]);

  return (
    <Card
      className={`transition-all duration-200 hover:border-primary/40 shadow-xs ${
        isArchived ? "opacity-60 bg-muted/20" : ""
      }`}
      data-testid={`habit-card-${habit.id}`}
    >
      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Top row: Check-in button, Title, Badges, Dropdown */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Single-click check-in toggle */}
            <button
              onClick={() => !isArchived && !isToggling && onToggle(habit)}
              disabled={isArchived || isToggling}
              className={`mt-0.5 rounded-full p-1 transition-transform active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                isArchived
                  ? "cursor-not-allowed opacity-40 text-muted-foreground"
                  : isCompleted
                  ? "text-emerald-500 hover:text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground hover:text-primary"
              }`}
              title={
                isArchived
                  ? "Archived habit cannot be checked in"
                  : isCompleted
                  ? "Completed today! Click to toggle"
                  : "Click to check in for today"
              }
              aria-label={
                isCompleted
                  ? `Mark ${habit.title} incomplete for today`
                  : `Mark ${habit.title} complete for today`
              }
              data-testid={`habit-checkin-btn-${habit.id}`}
            >
              {isToggling ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-6 w-6 fill-emerald-500/20" />
              ) : (
                <Circle className="h-6 w-6 hover:stroke-primary" />
              )}
            </button>

            {/* Title & Cues */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  onClick={() => onViewDetails(habit)}
                  className={`text-base font-semibold truncate cursor-pointer hover:text-primary transition-colors ${
                    isCompleted ? "text-foreground font-medium" : ""
                  }`}
                  title={habit.title}
                  data-testid={`habit-title-${habit.id}`}
                >
                  {habit.title}
                </h3>
                {isPaused && <StatusBadge status="paused" />}
                {isArchived && <StatusBadge status="archived" />}
              </div>

              {/* Description if present */}
              {habit.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {habit.description}
                </p>
              )}
            </div>
          </div>

          {/* Action Menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Habit options"
              data-testid={`habit-menu-btn-${habit.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>

            {menuOpen && (
              <div
                className="absolute right-0 top-9 z-20 w-44 rounded-md border bg-card p-1 shadow-md animate-in fade-in zoom-in-95 duration-100"
                role="menu"
                data-testid={`habit-menu-${habit.id}`}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onViewDetails(habit);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground text-left transition-colors"
                  role="menuitem"
                  data-testid={`habit-action-detail-${habit.id}`}
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                  <span>View Details</span>
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(habit);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground text-left transition-colors"
                  role="menuitem"
                  data-testid={`habit-action-edit-${habit.id}`}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit Habit</span>
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onArchiveToggle(habit);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground text-left transition-colors"
                  role="menuitem"
                  data-testid={`habit-action-archive-${habit.id}`}
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5 text-blue-500" />
                      <span>Unarchive Habit</span>
                    </>
                  ) : (
                    <>
                      <Archive className="h-3.5 w-3.5 text-amber-500" />
                      <span>Archive Habit</span>
                    </>
                  )}
                </button>

                <div className="my-1 border-t" />

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(habit);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left transition-colors"
                  role="menuitem"
                  data-testid={`habit-action-delete-${habit.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Habit</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Identity Statement Callout (HABT-04) */}
        {habit.identityStatement && (
          <div
            className="rounded-md border-l-2 border-primary/70 bg-primary/5 px-3 py-1.5 text-xs italic text-foreground/90 font-medium"
            data-testid={`habit-identity-${habit.id}`}
          >
            &ldquo;{habit.identityStatement}&rdquo;
          </div>
        )}

        {/* Badges: Frequency, Time of Day, Linked Goal, Target */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <FrequencyBadge
            frequency={habit.frequency}
            frequencyTarget={habit.frequencyTarget}
            frequencyDays={habit.frequencyDays}
            intervalDays={habit.intervalDays}
          />
          <TimeOfDayBadge timeOfDay={habit.timeOfDay} />

          {habit.reminderTime && (
            <Badge variant="outline" className="text-[11px] gap-1 font-mono">
              🔔 {habit.reminderTime}
            </Badge>
          )}

          {habit.goalId && (
            <Badge
              variant="secondary"
              className="gap-1 bg-primary/10 text-primary border-primary/20"
              title={`Linked Goal: ${goalTitle || habit.goalId}`}
              data-testid={`habit-goal-badge-${habit.id}`}
            >
              <Target className="h-3 w-3" />
              <span className="truncate max-w-[140px]">{goalTitle || "Linked Goal"}</span>
            </Badge>
          )}

          {(habit.targetValue > 1 || habit.unit) && (
            <Badge variant="outline" className="text-[11px]">
              Target: {habit.targetValue} {habit.unit || "units"}
            </Badge>
          )}
        </div>

        {/* Footer: Streaks & 7-Day Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t text-xs">
          {/* Streak Counters */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400"
              title="Current consecutive streak"
              data-testid={`habit-current-streak-${habit.id}`}
            >
              <Flame className="h-4 w-4 fill-orange-500/20" />
              <span>{habit.currentStreak || 0}</span>
              <span className="text-[11px] font-normal text-muted-foreground">streak</span>
            </div>

            <div
              className="flex items-center gap-1 text-muted-foreground"
              title="Personal best streak"
              data-testid={`habit-best-streak-${habit.id}`}
            >
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium text-foreground">{habit.longestStreak || 0}</span>
              <span className="text-[11px]">best</span>
            </div>

            {habit.completionRate30d !== undefined && (
              <span
                className="text-[11px] text-muted-foreground hidden sm:inline"
                title="30-day scheduled occurrence completion rate"
              >
                {habit.completionRate30d}% (30d)
              </span>
            )}
          </div>

          {/* 7-Day Completion Strip */}
          <div
            className="flex items-center gap-1.5 self-end sm:self-auto"
            title="Past 7 days completion history"
            data-testid={`habit-strip-${habit.id}`}
          >
            {recentDays.map((day) => (
              <div key={day.dateStr} className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground uppercase font-mono">
                  {day.dayLabel}
                </span>
                <div
                  className={`h-4 w-4 rounded-full flex items-center justify-center transition-colors ${
                    day.isCompleted
                      ? "bg-emerald-500 text-white dark:bg-emerald-600"
                      : day.isToday
                      ? "border border-dashed border-primary/60 bg-muted/30"
                      : "bg-muted/60 border border-muted-foreground/20"
                  }`}
                  title={`${day.dateStr}${day.isCompleted ? ": Completed" : ": Not completed"}`}
                  data-testid={`strip-dot-${habit.id}-${day.dateStr}`}
                >
                  {day.isCompleted && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
