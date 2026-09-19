"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { HabitDTO, GoalDTO, HabitFrequency, TimeOfDayCue, HabitStatus } from "@/types";

interface HabitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHabit?: HabitDTO | null;
  goals: GoalDTO[];
  onSubmit: (payload: Record<string, any>) => Promise<void>;
  isSubmitting?: boolean;
}

const WEEK_DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

export function HabitFormModal({
  isOpen,
  onClose,
  initialHabit,
  goals,
  onSubmit,
  isSubmitting = false,
}: HabitFormModalProps) {
  const isEdit = !!initialHabit;

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [identityStatement, setIdentityStatement] = React.useState("");
  const [frequency, setFrequency] = React.useState<HabitFrequency>("daily");
  const [frequencyTarget, setFrequencyTarget] = React.useState<number>(1);
  const [frequencyDays, setFrequencyDays] = React.useState<number[]>([]);
  const [intervalDays, setIntervalDays] = React.useState<number>(1);
  const [targetValue, setTargetValue] = React.useState<number>(1);
  const [unit, setUnit] = React.useState("");
  const [timeOfDay, setTimeOfDay] = React.useState<TimeOfDayCue>("anytime");
  const [reminderTime, setReminderTime] = React.useState("");
  const [goalId, setGoalId] = React.useState("");
  const [status, setStatus] = React.useState<HabitStatus>("active");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialHabit) {
      setTitle(initialHabit.title || "");
      setDescription(initialHabit.description || "");
      setIdentityStatement(initialHabit.identityStatement || "");
      setFrequency(initialHabit.frequency || "daily");
      setFrequencyTarget(initialHabit.frequencyTarget || 1);
      setFrequencyDays(initialHabit.frequencyDays || []);
      setIntervalDays(initialHabit.intervalDays || 1);
      setTargetValue(initialHabit.targetValue || 1);
      setUnit(initialHabit.unit || "");
      setTimeOfDay(initialHabit.timeOfDay || "anytime");
      setReminderTime(initialHabit.reminderTime || "");
      setGoalId(initialHabit.goalId || "");
      setStatus(initialHabit.status || "active");
    } else {
      setTitle("");
      setDescription("");
      setIdentityStatement("");
      setFrequency("daily");
      setFrequencyTarget(1);
      setFrequencyDays([]);
      setIntervalDays(1);
      setTargetValue(1);
      setUnit("");
      setTimeOfDay("anytime");
      setReminderTime("");
      setGoalId("");
      setStatus("active");
    }
    setError(null);
  }, [initialHabit, isOpen]);

  const toggleDay = (dayVal: number) => {
    setFrequencyDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Habit title is required");
      return;
    }

    if (frequency === "specific_days" && frequencyDays.length === 0) {
      setError("Please select at least one day for specific days frequency");
      return;
    }

    const payload: Record<string, any> = {
      title: title.trim(),
      frequency,
      timeOfDay,
      targetValue: Number(targetValue) > 0 ? Number(targetValue) : 1,
    };

    if (description.trim()) {
      payload.description = description.trim();
    } else if (isEdit) {
      payload.description = null;
    }

    if (identityStatement.trim()) {
      payload.identityStatement = identityStatement.trim();
    } else if (isEdit) {
      payload.identityStatement = null;
    }

    if (unit.trim()) {
      payload.unit = unit.trim();
    } else if (isEdit) {
      payload.unit = null;
    }

    if (reminderTime.trim()) {
      payload.reminderTime = reminderTime.trim();
    } else if (isEdit) {
      payload.reminderTime = null;
    }

    if (goalId.trim()) {
      payload.goalId = goalId.trim();
    } else if (isEdit) {
      payload.goalId = null;
    }

    if (isEdit) {
      payload.status = status;
    }

    // Schedule-specific params
    if (frequency === "weekly") {
      payload.frequencyTarget = Number(frequencyTarget) >= 1 ? Number(frequencyTarget) : 1;
    } else if (frequency === "specific_days") {
      payload.frequencyDays = frequencyDays;
    } else if (frequency === "custom") {
      payload.intervalDays = Number(intervalDays) >= 1 ? Number(intervalDays) : 1;
    }

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save habit");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Habit" : "Create New Habit"}
      description={
        isEdit
          ? "Update schedule, cues, or goal linkage for this habit"
          : "Define a consistent behavior with clear rules and cues"
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2" data-testid="habit-form">
        {error && (
          <div className="rounded-md bg-destructive/15 p-2.5 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        {/* Title */}
        <div className="space-y-1.5">
          <label
            htmlFor="habit-title"
            className="text-xs font-semibold uppercase text-muted-foreground"
          >
            Habit Title *
          </label>
          <Input
            id="habit-title"
            placeholder="e.g. Morning 30-Minute Run, Read 20 Pages"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            disabled={isSubmitting}
            data-testid="habit-title-input"
          />
        </div>

        {/* Identity Statement (HABT-04) */}
        <div className="space-y-1.5">
          <label
            htmlFor="habit-identity"
            className="text-xs font-semibold uppercase text-muted-foreground"
          >
            Identity Statement
          </label>
          <Input
            id="habit-identity"
            placeholder="e.g. I am a disciplined runner who shows up daily"
            value={identityStatement}
            onChange={(e) => setIdentityStatement(e.target.value)}
            disabled={isSubmitting}
            data-testid="habit-identity-input"
          />
          <p className="text-[11px] text-muted-foreground">
            Focus on identity-based habits rather than pure gamification.
          </p>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label
            htmlFor="habit-desc"
            className="text-xs font-semibold uppercase text-muted-foreground"
          >
            Description & Context
          </label>
          <Textarea
            id="habit-desc"
            placeholder="Optional instructions, setup routines, or notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            rows={2}
            data-testid="habit-desc-input"
          />
        </div>

        {/* Frequency & Time of Day */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="habit-frequency"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Frequency Rule *
            </label>
            <Select
              id="habit-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
              disabled={isSubmitting}
              data-testid="habit-frequency-select"
            >
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays (Mon - Fri)</option>
              <option value="weekly">Weekly (X times / week)</option>
              <option value="specific_days">Specific Days</option>
              <option value="custom">Custom Interval</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="habit-timeofday"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Time of Day Cue
            </label>
            <Select
              id="habit-timeofday"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value as TimeOfDayCue)}
              disabled={isSubmitting}
              data-testid="habit-timeofday-select"
            >
              <option value="anytime">⏰ Anytime</option>
              <option value="morning">🌅 Morning</option>
              <option value="afternoon">☀️ Afternoon</option>
              <option value="evening">🌙 Evening</option>
            </Select>
          </div>
        </div>

        {/* Frequency-specific fields */}
        {frequency === "weekly" && (
          <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
            <label
              htmlFor="habit-freq-target"
              className="text-xs font-semibold text-foreground"
            >
              Target Days Per Week
            </label>
            <div className="flex items-center gap-3">
              <Input
                id="habit-freq-target"
                type="number"
                min={1}
                max={7}
                value={frequencyTarget}
                onChange={(e) => setFrequencyTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={isSubmitting}
                className="w-24"
                data-testid="habit-frequency-target-input"
              />
              <span className="text-xs text-muted-foreground">
                times per Monday–Sunday week
              </span>
            </div>
          </div>
        )}

        {frequency === "specific_days" && (
          <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
            <label className="text-xs font-semibold text-foreground">
              Select Scheduled Days
            </label>
            <div className="flex flex-wrap gap-1.5" data-testid="habit-specific-days-group">
              {WEEK_DAYS.map((day) => {
                const isSelected = frequencyDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    disabled={isSubmitting}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:bg-accent border-input"
                    }`}
                    data-testid={`day-chip-${day.value}`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {frequency === "custom" && (
          <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
            <label
              htmlFor="habit-interval"
              className="text-xs font-semibold text-foreground"
            >
              Repeat Every N Days
            </label>
            <div className="flex items-center gap-3">
              <Input
                id="habit-interval"
                type="number"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={isSubmitting}
                className="w-24"
                data-testid="habit-interval-input"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </div>
        )}

        {/* Target Value and Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="habit-target"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Target Value
            </label>
            <Input
              id="habit-target"
              type="number"
              step="any"
              min={0.1}
              value={targetValue}
              onChange={(e) => setTargetValue(parseFloat(e.target.value) || 1)}
              disabled={isSubmitting}
              data-testid="habit-target-input"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="habit-unit"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Unit (Optional)
            </label>
            <Input
              id="habit-unit"
              placeholder="e.g. pages, minutes, km"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={isSubmitting}
              data-testid="habit-unit-input"
            />
          </div>
        </div>

        {/* Reminder Time & Linked Goal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="habit-reminder"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Daily Reminder (HH:MM)
            </label>
            <Input
              id="habit-reminder"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              disabled={isSubmitting}
              data-testid="habit-reminder-input"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="habit-goal"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Link to Goal (HABT-04)
            </label>
            <Select
              id="habit-goal"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              disabled={isSubmitting}
              data-testid="habit-goal-select"
            >
              <option value="">(No Linked Goal)</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Status (when editing) */}
        {isEdit && (
          <div className="space-y-1.5">
            <label
              htmlFor="habit-status"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Habit Status
            </label>
            <Select
              id="habit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as HabitStatus)}
              disabled={isSubmitting}
              data-testid="habit-status-select"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            data-testid="habit-form-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            data-testid="habit-form-submit"
          >
            {isEdit ? "Save Changes" : "Create Habit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
