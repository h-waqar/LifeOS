"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CommitmentBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, AlertTriangle, Trash2, CheckCircle2, Lock, Sparkles, Loader2 } from "lucide-react";
import type { TimeBlockDTO, TaskDTO, HabitDTO, ProjectDTO, GoalDTO, CommitmentLevel } from "@/types";

interface TimeBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (block: TimeBlockDTO) => void;
  onDeleted?: (blockId: string) => void;
  initialBlock?: Partial<TimeBlockDTO> | null;
  tasks?: TaskDTO[];
  habits?: HabitDTO[];
  projects?: ProjectDTO[];
  goals?: GoalDTO[];
}

export function TimeBlockModal({
  isOpen,
  onClose,
  onSaved,
  onDeleted,
  initialBlock,
  tasks = [],
  habits = [],
  projects = [],
  goals = [],
}: TimeBlockModalProps) {
  const isEditing = Boolean(initialBlock?.id);

  // Form state
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("10:00");
  const [durationMinutes, setDurationMinutes] = React.useState(60);
  const [commitmentLevel, setCommitmentLevel] = React.useState<CommitmentLevel>("soft");
  const [color, setColor] = React.useState("");
  const [taskId, setTaskId] = React.useState("");
  const [habitId, setHabitId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [goalId, setGoalId] = React.useState("");
  const [actualMinutes, setActualMinutes] = React.useState<number | "">("");

  const [loading, setLoading] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [conflictError, setConflictError] = React.useState<string | null>(null);

  // Initialize form from initialBlock
  React.useEffect(() => {
    if (isOpen) {
      setConflictError(null);
      if (initialBlock) {
        setTitle(initialBlock.title || "");
        setDescription(initialBlock.description || "");
        setCommitmentLevel(initialBlock.commitmentLevel || "soft");
        setColor(initialBlock.color || "");
        setTaskId(initialBlock.taskId || "");
        setHabitId(initialBlock.habitId || "");
        setProjectId(initialBlock.projectId || "");
        setGoalId(initialBlock.goalId || "");
        setActualMinutes(
          initialBlock.actualMinutes !== undefined && initialBlock.actualMinutes !== null
            ? initialBlock.actualMinutes
            : ""
        );

        if (initialBlock.startTime) {
          const s = new Date(initialBlock.startTime);
          const yyyy = s.getFullYear();
          const mm = String(s.getMonth() + 1).padStart(2, "0");
          const dd = String(s.getDate()).padStart(2, "0");
          setDate(`${yyyy}-${mm}-${dd}`);

          const hh = String(s.getHours()).padStart(2, "0");
          const min = String(s.getMinutes()).padStart(2, "0");
          setStartTime(`${hh}:${min}`);
        } else {
          const now = new Date();
          setDate(now.toISOString().slice(0, 10));
          setStartTime("09:00");
        }

        if (initialBlock.endTime) {
          const e = new Date(initialBlock.endTime);
          const hh = String(e.getHours()).padStart(2, "0");
          const min = String(e.getMinutes()).padStart(2, "0");
          setEndTime(`${hh}:${min}`);
        } else {
          setEndTime("10:00");
        }

        setDurationMinutes(initialBlock.durationMinutes || 60);
      } else {
        const now = new Date();
        setTitle("");
        setDescription("");
        setDate(now.toISOString().slice(0, 10));
        setStartTime("09:00");
        setEndTime("10:00");
        setDurationMinutes(60);
        setCommitmentLevel("soft");
        setColor("");
        setTaskId("");
        setHabitId("");
        setProjectId("");
        setGoalId("");
        setActualMinutes("");
      }
    }
  }, [isOpen, initialBlock]);

  // Recalculate duration when start or end time changes
  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    setConflictError(null);
    if (newStart && endTime) {
      const [sh, sm] = newStart.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      if (diff > 0) {
        setDurationMinutes(diff);
      }
    }
  };

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd);
    setConflictError(null);
    if (startTime && newEnd) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = newEnd.split(":").map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      if (diff > 0) {
        setDurationMinutes(diff);
      }
    }
  };

  // Pre-fill title if task is selected and title is empty
  const handleTaskSelect = (selectedTaskId: string) => {
    setTaskId(selectedTaskId);
    if (selectedTaskId && !title) {
      const selectedTask = tasks.find((t) => t.id === selectedTaskId);
      if (selectedTask) {
        setTitle(selectedTask.title);
        if (selectedTask.estimatedDuration) {
          const [sh, sm] = startTime.split(":").map(Number);
          const totalMin = sh * 60 + sm + selectedTask.estimatedDuration;
          const newEh = Math.floor(totalMin / 60) % 24;
          const newEm = totalMin % 60;
          setEndTime(`${String(newEh).padStart(2, "0")}:${String(newEm).padStart(2, "0")}`);
          setDurationMinutes(selectedTask.estimatedDuration);
        }
      }
    }
  };

  // Pre-fill title if habit is selected and title is empty
  const handleHabitSelect = (selectedHabitId: string) => {
    setHabitId(selectedHabitId);
    if (selectedHabitId && !title) {
      const selectedHabit = habits.find((h) => h.id === selectedHabitId);
      if (selectedHabit) {
        setTitle(`Habit: ${selectedHabit.title}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      toast.error("End time must be after start time.");
      return;
    }

    setLoading(true);
    setConflictError(null);

    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        startTime: startISO,
        endTime: endISO,
        durationMinutes,
        commitmentLevel,
        color: color.trim() || null,
        taskId: taskId || null,
        habitId: habitId || null,
        projectId: projectId || null,
        goalId: goalId || null,
      };

      if (actualMinutes !== "") {
        payload.actualMinutes = Number(actualMinutes);
      }

      let res: Response;
      if (isEditing && initialBlock?.id) {
        res = await fetch(`/api/time-blocks/${initialBlock.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/time-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setConflictError(
            data.error || "A conflicting hard commitment exists during this timeframe."
          );
          toast.error("Hard commitment conflict: cannot save overlapping block.");
          return;
        }
        throw new Error(data.error || "Failed to save time block");
      }

      toast.success(isEditing ? "Time block updated" : "Time block scheduled");
      onSaved(data.timeBlock);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialBlock?.id) return;
    if (!confirm("Are you sure you want to delete this time block?")) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/time-blocks/${initialBlock.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete time block");
      }

      toast.success("Time block deleted");
      if (onDeleted) {
        onDeleted(initialBlock.id);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete time block");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Time Block" : "Schedule Time Block"}
      description={
        isEditing
          ? "Update calendar time block details or resolve conflicts"
          : "Block out dedicated focus time for tasks, habits, or routines"
      }
    >
      <div data-testid="timeblock-modal">
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="timeblock-form">
          {conflictError && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              data-testid="conflict-error-banner"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Scheduling Conflict (409)</p>
                <p className="text-xs">{conflictError}</p>
              </div>
            </div>
          )}

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Title *
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Deep Work: Feature Implementation"
            required
            maxLength={255}
            data-testid="timeblock-title-input"
          />
        </div>

        {/* Date, Start Time, End Time */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Date *
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              data-testid="timeblock-date-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Start Time *
            </label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              required
              data-testid="timeblock-start-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              End Time *
            </label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => handleEndTimeChange(e.target.value)}
              required
              data-testid="timeblock-end-input"
            />
          </div>
        </div>

        {/* Duration & Commitment Level */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Duration (minutes)
            </label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              data-testid="timeblock-duration-input"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Commitment Level (CAL-04)
            </label>
            <Select
              value={commitmentLevel}
              onChange={(e) => {
                setCommitmentLevel(e.target.value as CommitmentLevel);
                setConflictError(null);
              }}
              data-testid="timeblock-commitment-select"
            >
              <option value="soft">Soft (Flexible block)</option>
              <option value="hard">Hard (Fixed / Overlap Prevention)</option>
            </Select>
          </div>
        </div>

        {/* Task & Habit Linkage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Linked Task (CAL-02)
            </label>
            <Select
              value={taskId}
              onChange={(e) => handleTaskSelect(e.target.value)}
              data-testid="timeblock-task-select"
            >
              <option value="">No linked task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Linked Habit (Habit Check-In)
            </label>
            <Select
              value={habitId}
              onChange={(e) => handleHabitSelect(e.target.value)}
              data-testid="timeblock-habit-select"
            >
              <option value="">No linked habit</option>
              {habits.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Project & Goal Linkage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Linked Project
            </label>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">No linked project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Linked Goal
            </label>
            <Select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">No linked goal</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Actual Minutes (CAL-03) */}
        {isEditing && (
          <div className="space-y-1.5 p-3 rounded-lg border bg-muted/30">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Actual Minutes Spent (CAL-03 Task Analytics)</span>
            </label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={actualMinutes}
              onChange={(e) =>
                setActualMinutes(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="Leave empty or set actual minutes"
              data-testid="timeblock-actual-minutes-input"
            />
            <p className="text-xs text-muted-foreground">
              Adjusting actual minutes on a completed block updates linked task analytics.
            </p>
          </div>
        )}

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details, links, or notes..."
            rows={2}
            maxLength={4000}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t">
          {isEditing ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteLoading || loading}
              className="gap-1.5"
              data-testid="timeblock-delete-btn"
            >
              {deleteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span>Delete</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="gap-1.5"
              data-testid="timeblock-submit-btn"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isEditing ? "Save Changes" : "Schedule Block"}</span>
            </Button>
          </div>
        </div>
      </form>
      </div>
    </Modal>
  );
}
