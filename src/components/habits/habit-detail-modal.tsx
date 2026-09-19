"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge, FrequencyBadge, TimeOfDayBadge } from "@/components/ui/badge";
import type { HabitDTO, HabitEntryDTO } from "@/types";
import {
  Flame,
  Trophy,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Circle,
  Loader2,
  Edit2,
  Target,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface HabitDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  habitId: string | null;
  goalTitle?: string;
  onEdit: (habit: HabitDTO) => void;
  onHabitUpdated?: () => void;
}

export function HabitDetailModal({
  isOpen,
  onClose,
  habitId,
  goalTitle,
  onEdit,
  onHabitUpdated,
}: HabitDetailModalProps) {
  const [habit, setHabit] = React.useState<HabitDTO | null>(null);
  const [entries, setEntries] = React.useState<HabitEntryDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [togglingDate, setTogglingDate] = React.useState<string | null>(null);

  const fetchDetail = React.useCallback(async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/habits/${id}`);
      if (!res.ok) throw new Error("Failed to load habit details");
      const data = await res.json();
      setHabit(data.habit);
      setEntries(data.entries || []);
    } catch (err: any) {
      toast.error(err.message || "Could not load habit details");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen && habitId) {
      fetchDetail(habitId);
    } else {
      setHabit(null);
      setEntries([]);
    }
  }, [isOpen, habitId, fetchDetail]);

  // Toggle a specific date entry (single-click check-in for past/today)
  const handleToggleDate = async (dateStr: string) => {
    if (!habitId || togglingDate) return;
    try {
      setTogglingDate(dateStr);
      const res = await fetch(`/api/habits/${habitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to toggle date");
      }

      const result = await res.json();
      toast.success(
        result.action === "created" || result.completed
          ? `Checked in for ${dateStr}`
          : `Removed check-in for ${dateStr}`
      );

      // Refresh detail
      await fetchDetail(habitId);
      if (onHabitUpdated) {
        onHabitUpdated();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update entry");
    } finally {
      setTogglingDate(null);
    }
  };

  // 30-day matrix
  const past30Days = React.useMemo(() => {
    const days: { dateStr: string; dayNum: number; monthName: string; isCompleted: boolean; isToday: boolean }[] = [];
    const today = new Date();
    const entrySet = new Set(
      entries
        .filter((e) => e.value >= (habit?.targetValue || 1))
        .map((e) => e.date)
    );

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dayStr = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${dayStr}`;

      days.push({
        dateStr,
        dayNum: d.getDate(),
        monthName: d.toLocaleString("default", { month: "short" }),
        isCompleted: entrySet.has(dateStr),
        isToday: i === 0,
      });
    }
    return days;
  }, [entries, habit?.targetValue]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={habit ? habit.title : "Habit Details"}
      description="History, streak metrics, and consistency tracking"
    >
      {loading || !habit ? (
        <div className="flex items-center justify-center py-16" data-testid="habit-detail-loading">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6 pt-2" data-testid="habit-detail-view">
          {/* Header Badges & Identity */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <StatusBadge status={habit.status} />
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
                >
                  <Target className="h-3 w-3" />
                  <span>{goalTitle || "Linked Goal"}</span>
                </Badge>
              )}
            </div>

            {habit.identityStatement && (
              <div
                className="rounded-md border-l-2 border-primary bg-primary/5 p-3 text-xs italic text-foreground font-medium"
                data-testid="habit-detail-identity"
              >
                &ldquo;{habit.identityStatement}&rdquo;
              </div>
            )}

            {habit.description && (
              <p className="text-xs text-muted-foreground">{habit.description}</p>
            )}
          </div>

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="flex items-center justify-center gap-1 text-orange-500 mb-1">
                <Flame className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  Current
                </span>
              </div>
              <div className="text-xl font-bold text-foreground" data-testid="detail-current-streak">
                {habit.currentStreak || 0}
                <span className="text-xs font-normal text-muted-foreground ml-1">days</span>
              </div>
            </div>

            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
                <Trophy className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  Longest
                </span>
              </div>
              <div className="text-xl font-bold text-foreground" data-testid="detail-longest-streak">
                {habit.longestStreak || 0}
                <span className="text-xs font-normal text-muted-foreground ml-1">days</span>
              </div>
            </div>

            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="flex items-center justify-center gap-1 text-blue-500 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  30d Rate
                </span>
              </div>
              <div className="text-xl font-bold text-foreground" data-testid="detail-30d-rate">
                {habit.completionRate30d !== undefined ? `${habit.completionRate30d}%` : "0%"}
              </div>
            </div>

            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-500 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  All-Time
                </span>
              </div>
              <div className="text-xl font-bold text-foreground" data-testid="detail-alltime-rate">
                {habit.completionRateAllTime !== undefined ? `${habit.completionRateAllTime}%` : "0%"}
              </div>
            </div>
          </div>

          {/* 30-Day Check-in History Matrix */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Past 30 Days Activity (Click to Toggle)
              </h4>
              <span className="text-[11px] text-muted-foreground">
                {entries.length} recorded completions
              </span>
            </div>

            <div
              className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 p-3 rounded-lg border bg-muted/15"
              data-testid="habit-history-grid"
            >
              {past30Days.map((day) => {
                const isTogglingThis = togglingDate === day.dateStr;
                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => handleToggleDate(day.dateStr)}
                    disabled={isTogglingThis}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-md border text-xs transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-1 focus:ring-primary ${
                      day.isCompleted
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold"
                        : day.isToday
                        ? "border-primary/50 bg-background font-medium"
                        : "border-muted bg-background/50 text-muted-foreground hover:bg-muted"
                    }`}
                    title={`${day.dateStr}${day.isCompleted ? ": Completed (click to remove)" : ": Incomplete (click to check in)"}`}
                    data-testid={`history-day-${day.dateStr}`}
                  >
                    <span className="text-[9px] uppercase text-muted-foreground">
                      {day.monthName}
                    </span>
                    <span className="text-xs leading-none my-0.5">{day.dayNum}</span>
                    {isTogglingThis ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    ) : day.isCompleted ? (
                      <CheckCircle2 className="h-3 w-3 fill-emerald-500/20" />
                    ) : (
                      <Circle className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(habit);
              }}
              className="gap-1.5 text-xs"
              data-testid="detail-edit-btn"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>Edit Habit</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} data-testid="detail-close-btn">
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
