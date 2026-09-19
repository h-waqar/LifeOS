"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { calculateProductivityScore } from "@/lib/productivity-score";
import type { DailyPlanContextDTO, TaskDTO, HabitDTO, RolloverActionItem } from "@/types";
import {
  Moon,
  CheckCircle2,
  Circle,
  Flame,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  Check,
  Loader2,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface EveningReviewViewProps {
  date: string;
  context: DailyPlanContextDTO;
  onRefresh: () => void;
}

export function EveningReviewView({
  date,
  context,
  onRefresh,
}: EveningReviewViewProps) {
  const [step, setStep] = React.useState<number>(1);
  const [submitting, setSubmitting] = React.useState(false);

  // Local state for tasks completion tracking
  const [tasksState, setTasksState] = React.useState<TaskDTO[]>(
    context.priorityTasks
  );
  // Local state for habits check-in
  const [habitsState, setHabitsState] = React.useState<HabitDTO[]>(
    context.todayHabits
  );

  // Reflections state
  const existingReview = context.review;
  const [positiveReflections, setPositiveReflections] = React.useState(
    existingReview?.positiveReflections || ""
  );
  const [challengesReflections, setChallengesReflections] = React.useState(
    existingReview?.challengesReflections || ""
  );
  const [notes, setNotes] = React.useState(existingReview?.notes || "");
  const [selfRating, setSelfRating] = React.useState<number | null>(
    existingReview ? 8 : null
  );

  // Incomplete tasks and rollover selection state
  const incompleteTasks = tasksState.filter((t) => t.status !== "completed");
  const completedTasks = tasksState.filter((t) => t.status === "completed");

  const [rolloverActions, setRolloverActions] = React.useState<
    Record<string, { action: "carry_over" | "reschedule" | "backlog"; targetDate?: string }>
  >(() => {
    const initial: Record<string, { action: "carry_over" | "reschedule" | "backlog"; targetDate?: string }> = {};
    incompleteTasks.forEach((t) => {
      initial[t.id] = { action: "carry_over" };
    });
    return initial;
  });

  // Calculate live productivity score
  const liveScore = React.useMemo(() => {
    const completedHabitsCount = habitsState.filter((h) => h.isCompletedToday).length;
    const completedBlocksCount = context.todayTimeBlocks.filter(
      (b) => b.status === "completed"
    ).length;

    return calculateProductivityScore({
      plannedTasksCount: tasksState.length,
      completedTasksCount: completedTasks.length,
      plannedHabitsCount: habitsState.length,
      completedHabitsCount,
      plannedTimeBlocksCount: context.todayTimeBlocks.length,
      completedTimeBlocksCount: completedBlocksCount,
      selfRating,
    });
  }, [tasksState, completedTasks, habitsState, context.todayTimeBlocks, selfRating]);

  // Toggle task completion
  const handleToggleTask = async (task: TaskDTO) => {
    const isCompleted = task.status === "completed";
    const nextStatus = isCompleted ? "todo" : "completed";

    // Optimistic update
    setTasksState((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update task");
      }
      toast.success(nextStatus === "completed" ? "Task completed!" : "Task reopened");
    } catch (err: any) {
      // Revert optimistic update
      setTasksState((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
      toast.error(err.message || "Failed to update task");
    }
  };

  // Toggle habit check-in
  const handleToggleHabit = async (habit: HabitDTO) => {
    const nextCompleted = !habit.isCompletedToday;

    // Optimistic update
    setHabitsState((prev) =>
      prev.map((h) =>
        h.id === habit.id ? { ...h, isCompletedToday: nextCompleted } : h
      )
    );

    try {
      const res = await fetch(`/api/habits/${habit.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!res.ok) {
        throw new Error("Failed to toggle habit");
      }
      toast.success(nextCompleted ? `Checked in: ${habit.title}` : `Unchecked: ${habit.title}`);
    } catch (err: any) {
      setHabitsState((prev) =>
        prev.map((h) => (h.id === habit.id ? habit : h))
      );
      toast.error(err.message || "Failed to update habit");
    }
  };

  // Rollover batch actions
  const handleSetAllRolloverAction = (action: "carry_over" | "backlog") => {
    setRolloverActions((prev) => {
      const next = { ...prev };
      incompleteTasks.forEach((t) => {
        next[t.id] = { action };
      });
      return next;
    });
  };

  // Submit Evening Review & Rollover
  const handleSubmitReview = async () => {
    try {
      setSubmitting(true);

      // 1. Submit Evening Review
      const reviewPayload = {
        date,
        positiveReflections: positiveReflections.trim() || null,
        challengesReflections: challengesReflections.trim() || null,
        notes: notes.trim() || null,
        selfRating,
        completedTaskIds: completedTasks.map((t) => t.id),
        incompleteTaskIds: incompleteTasks.map((t) => t.id),
        completedHabitIds: habitsState.filter((h) => h.isCompletedToday).map((h) => h.id),
      };

      const reviewRes = await fetch("/api/daily-plan/evening-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewPayload),
      });

      if (!reviewRes.ok) {
        const err = await reviewRes.json();
        throw new Error(err.error || "Failed to submit evening review");
      }

      // 2. Submit Rollover if there are incomplete tasks
      if (incompleteTasks.length > 0) {
        const actionsPayload: RolloverActionItem[] = incompleteTasks.map((t) => {
          const actionConfig = rolloverActions[t.id] || { action: "carry_over" };
          return {
            taskId: t.id,
            action: actionConfig.action,
            targetDate: actionConfig.targetDate,
          };
        });

        const rolloverRes = await fetch("/api/daily-plan/rollover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            actions: actionsPayload,
          }),
        });

        if (!rolloverRes.ok) {
          const err = await rolloverRes.json();
          throw new Error(err.error || "Failed to execute rollover");
        }
      }

      toast.success("Evening review complete! Daily productivity score recorded.");
      onRefresh();
      setStep(5); // Celebratory completion screen
    } catch (err: any) {
      toast.error(err.message || "Failed to complete evening review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="evening-review-view">
      {/* Stepper Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Evening Review</h2>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Score: {liveScore.score}/100</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Step {step} of 4 — Review completed work, reflect on your day, and roll over incomplete commitments.
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
              data-testid={`evening-step-btn-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* STEP 1: Task Execution Review */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Step 1: Review Tasks (PLAN-02)</span>
                </CardTitle>
                <CardDescription>
                  Click any task to toggle its completion status.
                </CardDescription>
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                {completedTasks.length}/{tasksState.length} Completed
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasksState.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                No priority tasks were planned for today.
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {tasksState.map((task) => {
                  const isDone = task.status === "completed";
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                      data-testid={`evening-task-item-${task.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => handleToggleTask(task)}
                          className={`shrink-0 transition-transform active:scale-95 focus:outline-none ${
                            isDone
                              ? "text-emerald-500 hover:text-emerald-600"
                              : "text-muted-foreground hover:text-primary"
                          }`}
                          aria-label={isDone ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
                          data-testid={`evening-task-toggle-${task.id}`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-5 w-5 fill-emerald-500/20" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        <span
                          className={`text-sm truncate font-medium ${
                            isDone ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={task.priority} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setStep(2)}
                className="gap-1.5"
                data-testid="evening-next-step-1"
              >
                <span>Continue to Habits</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Habits Check-In */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <span>Step 2: Habits Review (PLAN-02)</span>
            </CardTitle>
            <CardDescription>
              Single-click check in for habits completed today to lock in your streaks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {habitsState.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                No active habits configured.
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {habitsState.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                    data-testid={`evening-habit-item-${h.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => handleToggleHabit(h)}
                        className={`shrink-0 transition-transform active:scale-95 focus:outline-none ${
                          h.isCompletedToday
                            ? "text-emerald-500 hover:text-emerald-600"
                            : "text-muted-foreground hover:text-primary"
                        }`}
                        aria-label={h.isCompletedToday ? `Uncheck ${h.title}` : `Check in ${h.title}`}
                        data-testid={`evening-habit-toggle-${h.id}`}
                      >
                        {h.isCompletedToday ? (
                          <CheckCircle2 className="h-5 w-5 fill-emerald-500/20" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>
                      <span
                        className={`text-sm font-medium truncate ${
                          h.isCompletedToday ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {h.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400 font-bold">
                        <Flame className="h-3.5 w-3.5" />
                        <span>{h.currentStreak || 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                data-testid="evening-next-step-2"
              >
                <span>Continue to Reflections</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Reflections & Productivity Score */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Step 3: Reflections & Productivity Score (PLAN-02)</span>
            </CardTitle>
            <CardDescription>
              Record your daily reflections and calibrate your subjective rating.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Live Score Display Card */}
            <div className="rounded-lg border bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Computed Daily Score
                </p>
                <div className="text-3xl font-extrabold text-primary flex items-baseline gap-1 mt-1">
                  <span>{liveScore.score}</span>
                  <span className="text-sm font-medium text-muted-foreground">/ 100</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{liveScore.summary}</p>
              </div>

              {/* Breakdown metrics */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground block text-[10px]">Tasks</span>
                  <span className="font-bold text-foreground">{liveScore.taskCompletionRate}%</span>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground block text-[10px]">Habits</span>
                  <span className="font-bold text-foreground">{liveScore.habitCompletionRate}%</span>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground block text-[10px]">Blocks</span>
                  <span className="font-bold text-foreground">{liveScore.timeBlockCompletionRate}%</span>
                </div>
              </div>
            </div>

            {/* Subjective Self-Rating */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Subjective Rating (1 - 10)
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSelfRating(num)}
                    className={`h-8 w-8 rounded-md text-xs font-bold transition-all ${
                      selfRating === num
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "border hover:bg-muted text-muted-foreground"
                    }`}
                    data-testid={`self-rating-btn-${num}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Reflection Textareas */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  What went well today? (Wins)
                </label>
                <Textarea
                  placeholder="Key accomplishments, deep work periods, good decisions..."
                  value={positiveReflections}
                  onChange={(e) => setPositiveReflections(e.target.value)}
                  className="min-h-[70px]"
                  data-testid="positive-reflections-textarea"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  What challenges or blockers arose?
                </label>
                <Textarea
                  placeholder="Distractions, interruptions, low energy moments..."
                  value={challengesReflections}
                  onChange={(e) => setChallengesReflections(e.target.value)}
                  className="min-h-[70px]"
                  data-testid="challenges-reflections-textarea"
                />
              </div>
            </div>

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
                data-testid="evening-next-step-3"
              >
                <span>Continue to Rollover</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Zero-Duplication Rollover & Submission */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-blue-500" />
                  <span>Step 4: Zero-Duplication Rollover (PLAN-03)</span>
                </CardTitle>
                <CardDescription>
                  Handle unfinished commitments cleanly without creating duplicate task rows.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleSetAllRolloverAction("carry_over")}
                >
                  Carry Over All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleSetAllRolloverAction("backlog")}
                >
                  Backlog All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {incompleteTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-medium">All planned tasks completed!</p>
                <p className="text-xs mt-0.5">Nothing left to roll over today.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="divide-y rounded-md border">
                  {incompleteTasks.map((task) => {
                    const actionState = rolloverActions[task.id] || { action: "carry_over" };
                    return (
                      <div
                        key={task.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 gap-2"
                        data-testid={`rollover-item-${task.id}`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Priority: {task.priority}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant={actionState.action === "carry_over" ? "default" : "outline"}
                            size="sm"
                            className="text-xs h-7"
                            onClick={() =>
                              setRolloverActions((prev) => ({
                                ...prev,
                                [task.id]: { action: "carry_over" },
                              }))
                            }
                            data-testid={`rollover-carry-over-${task.id}`}
                          >
                            Carry to Tomorrow
                          </Button>
                          <Button
                            variant={actionState.action === "backlog" ? "default" : "outline"}
                            size="sm"
                            className="text-xs h-7"
                            onClick={() =>
                              setRolloverActions((prev) => ({
                                ...prev,
                                [task.id]: { action: "backlog" },
                              }))
                            }
                            data-testid={`rollover-backlog-${task.id}`}
                          >
                            Backlog
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Zero Duplication Guarantee Banner */}
            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <span>
                <strong>Zero-Duplication Guaranteed:</strong> Rollover directly updates the
                canonical task schedule. No duplicate tasks or duplicate time blocks are created.
              </span>
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

              <Button
                variant="default"
                size="sm"
                onClick={handleSubmitReview}
                disabled={submitting}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                data-testid="complete-evening-review-btn"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>Complete Evening Review</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: Celebratory Summary Screen */}
      {step === 5 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Evening Review Completed!</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Your daily reflections and productivity score ({liveScore.score}/100) are recorded.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
              >
                Review Responses
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => onRefresh()}
              >
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
