"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { DailyPlanContextDTO, TaskDTO, HabitDTO, TimeBlockDTO } from "@/types";
import {
  Sun,
  CheckSquare,
  Circle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Flame,
  Sparkles,
  Calendar as CalendarIcon,
  AlertTriangle,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface MorningPlanViewProps {
  date: string;
  context: DailyPlanContextDTO;
  onRefresh: () => void;
  onNavigateToEvening?: () => void;
}

export function MorningPlanView({
  date,
  context,
  onRefresh,
  onNavigateToEvening,
}: MorningPlanViewProps) {
  const [step, setStep] = React.useState<number>(1);
  const [submitting, setSubmitting] = React.useState(false);

  // Form State
  const initialPlan = context.plan;
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>(
    initialPlan?.priorityTaskIds ||
      context.priorityTasks.slice(0, 5).map((t) => t.id)
  );
  const [selectedHabitIds, setSelectedHabitIds] = React.useState<string[]>(
    initialPlan?.habitIntentionIds ||
      context.todayHabits.map((h) => h.id)
  );
  const [morningNotes, setMorningNotes] = React.useState<string>(
    initialPlan?.morningNotes || ""
  );

  const isCompleted = initialPlan?.status === "completed";

  // Toggle priority task selection
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      if (prev.includes(taskId)) {
        return prev.filter((id) => id !== taskId);
      }
      if (prev.length >= 5) {
        toast.info("Recommended focus is 3-5 priority tasks. You can select up to 10.");
      }
      if (prev.length >= 10) {
        toast.error("Maximum 10 priority tasks allowed.");
        return prev;
      }
      return [...prev, taskId];
    });
  };

  // Toggle habit intention selection
  const toggleHabitSelection = (habitId: string) => {
    setSelectedHabitIds((prev) =>
      prev.includes(habitId) ? prev.filter((id) => id !== habitId) : [...prev, habitId]
    );
  };

  const handleSavePlan = async (complete: boolean) => {
    try {
      setSubmitting(true);
      const res = await fetch("/api/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          priorityTaskIds: selectedTaskIds,
          habitIntentionIds: selectedHabitIds,
          morningNotes: morningNotes.trim() || null,
          complete,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save daily plan");
      }

      toast.success(
        complete ? "Morning Routine Locked In! Have a productive day." : "Daily plan saved!"
      );
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save daily plan");
    } finally {
      setSubmitting(false);
    }
  };

  const allAvailableTasks = [
    ...context.priorityTasks,
    ...context.suggestedTasks.filter(
      (st) => !context.priorityTasks.some((pt) => pt.id === st.id)
    ),
  ];

  return (
    <div className="space-y-6" data-testid="morning-plan-view">
      {/* Stepper Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Morning Routine</h2>
            {isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Check className="h-3 w-3" /> Completed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Step {step} of 4 — Set your intentions, select top focus tasks, and align habits.
          </p>
        </div>

        {/* Step Indicator Pills */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`h-7 w-7 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
                step === s
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
              data-testid={`morning-step-btn-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* STEP 1: Review Overdue & Backlog Work */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>Step 1: Review Overdue & Unfinished Work</span>
            </CardTitle>
            <CardDescription>
              Clear bottlenecks before planning today. Select any overdue tasks you want to tackle today.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {context.overdueTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-80" />
                <p className="text-sm font-medium">No overdue tasks</p>
                <p className="text-xs mt-0.5">You are completely caught up on scheduled deadlines.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Overdue Items ({context.overdueTasks.length})
                </p>
                <div className="divide-y rounded-md border">
                  {context.overdueTasks.map((task) => {
                    const isSelected = selectedTaskIds.includes(task.id);
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => toggleTaskSelection(task.id)}
                            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                            data-testid={`toggle-overdue-task-${task.id}`}
                          >
                            {isSelected ? (
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{task.title}</p>
                            {task.dueDate && (
                              <p className="text-xs text-rose-500">
                                Due: {new Date(task.dueDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PriorityBadge priority={task.priority} />
                          <Button
                            variant={isSelected ? "secondary" : "outline"}
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => toggleTaskSelection(task.id)}
                          >
                            {isSelected ? "Selected" : "Add to Today"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setStep(2)}
                className="gap-1.5"
                data-testid="morning-next-step-1"
              >
                <span>Continue to Priorities</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Choose 3-5 Priority Tasks */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-primary" />
                  <span>Step 2: Pick 3–5 Priority Tasks (PLAN-01)</span>
                </CardTitle>
                <CardDescription>
                  Protect your focus by locking in your non-negotiable outcomes for today.
                </CardDescription>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  selectedTaskIds.length >= 3 && selectedTaskIds.length <= 5
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid="priority-count-badge"
              >
                {selectedTaskIds.length} Selected (Target: 3–5)
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="divide-y rounded-md border">
                {allAvailableTasks.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No active tasks in inbox or backlog.
                  </div>
                ) : (
                  allAvailableTasks.map((task) => {
                    const isSelected = selectedTaskIds.includes(task.id);
                    return (
                      <div
                        key={task.id}
                        onClick={() => toggleTaskSelection(task.id)}
                        className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-muted/40"
                        }`}
                        data-testid={`task-row-${task.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                            aria-label={isSelected ? "Unselect task" : "Select task"}
                          >
                            {isSelected ? (
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <span
                              className={`text-sm font-medium truncate block ${
                                isSelected ? "font-semibold text-primary" : ""
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.estimatedDuration && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3" /> {task.estimatedDuration}m
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PriorityBadge priority={task.priority} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setStep(3)}
                className="gap-1.5"
                data-testid="morning-next-step-2"
              >
                <span>Continue to Habits</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Review Habit Intentions */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <span>Step 3: Review Habit Intentions (PLAN-01)</span>
            </CardTitle>
            <CardDescription>
              Confirm the habits you plan to execute today to maintain your streaks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {context.todayHabits.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <Flame className="h-8 w-8 mx-auto mb-2 text-orange-500 opacity-60" />
                <p className="text-sm font-medium">No active habits configured</p>
                <p className="text-xs mt-0.5">Add habits to track daily routines.</p>
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {context.todayHabits.map((h) => {
                  const isIntention = selectedHabitIds.includes(h.id);
                  return (
                    <div
                      key={h.id}
                      onClick={() => toggleHabitSelection(h.id)}
                      className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                        isIntention
                          ? "bg-orange-500/5 hover:bg-orange-500/10"
                          : "hover:bg-muted/40"
                      }`}
                      data-testid={`habit-intention-row-${h.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                          aria-label={isIntention ? "Remove intention" : "Set intention"}
                        >
                          {isIntention ? (
                            <CheckCircle2 className="h-5 w-5 text-orange-500" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        <span className="text-sm font-medium truncate">{h.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground capitalize">
                          {h.timeOfDay}
                        </span>
                        <div className="flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400 font-bold">
                          <Flame className="h-3.5 w-3.5" />
                          <span>{h.currentStreak || 0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(2)}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setStep(4)}
                className="gap-1.5"
                data-testid="morning-next-step-3"
              >
                <span>Continue to Time Blocking</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Time Blocks, Morning Notes & Lock-In */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-indigo-500" />
              <span>Step 4: Time Blocking & Morning Commitment (PLAN-01)</span>
            </CardTitle>
            <CardDescription>
              Allocate time blocks for your priority tasks and record your primary focus for the day.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Scheduled Time Blocks Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Today&apos;s Scheduled Time Blocks ({context.todayTimeBlocks.length})
                </label>
                <Link href="/calendar">
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
                    <span>Open Calendar</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>

              {context.todayTimeBlocks.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No time blocks scheduled for today yet. Use the Calendar to protect deep work.
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {context.todayTimeBlocks.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-2.5 text-xs">
                      <span className="font-medium truncate">{b.title}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">
                        {new Date(b.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                        {new Date(b.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Morning Focus Notes */}
            <div className="space-y-1.5">
              <label
                htmlFor="morning-notes-input"
                className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Morning Intentions / Focus Notes</span>
              </label>
              <Textarea
                id="morning-notes-input"
                placeholder="What is the single most important outcome for today? Any special conditions or energy notes?"
                value={morningNotes}
                onChange={(e) => setMorningNotes(e.target.value)}
                className="min-h-[90px]"
                data-testid="morning-notes-textarea"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(3)}
                className="gap-1.5"
                disabled={submitting}
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSavePlan(false)}
                  disabled={submitting}
                  data-testid="save-draft-plan-btn"
                >
                  Save Draft
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleSavePlan(true)}
                  disabled={submitting}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="complete-morning-plan-btn"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Lock In Morning Plan</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
