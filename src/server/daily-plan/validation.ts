import { z } from "zod";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const saveMorningPlanSchema = z
  .object({
    date: z
      .string()
      .regex(isoDateRegex, "Date must be in ISO format YYYY-MM-DD"),
    priorityTaskIds: z
      .array(z.string().min(1))
      .max(10, "Maximum of 10 priority tasks can be selected for daily focus")
      .optional()
      .default([]),
    habitIntentionIds: z.array(z.string().min(1)).optional().default([]),
    morningNotes: z
      .string()
      .max(4000, "Morning notes cannot exceed 4000 characters")
      .nullable()
      .optional(),
    complete: z.boolean().optional().default(false),
  })
  .strict();

export type SaveMorningPlanInput = z.input<typeof saveMorningPlanSchema>;
export type SaveMorningPlanOutput = z.output<typeof saveMorningPlanSchema>;

export const completeEveningReviewSchema = z
  .object({
    date: z
      .string()
      .regex(isoDateRegex, "Date must be in ISO format YYYY-MM-DD"),
    positiveReflections: z
      .string()
      .max(4000, "Reflections cannot exceed 4000 characters")
      .nullable()
      .optional(),
    challengesReflections: z
      .string()
      .max(4000, "Challenges cannot exceed 4000 characters")
      .nullable()
      .optional(),
    notes: z
      .string()
      .max(4000, "Notes cannot exceed 4000 characters")
      .nullable()
      .optional(),
    selfRating: z
      .number()
      .int()
      .min(1, "Self-rating must be between 1 and 10")
      .max(10, "Self-rating must be between 1 and 10")
      .nullable()
      .optional(),
    completedTaskIds: z.array(z.string().min(1)).optional(),
    incompleteTaskIds: z.array(z.string().min(1)).optional(),
    completedHabitIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type CompleteEveningReviewInput = z.infer<typeof completeEveningReviewSchema>;

export const rolloverActionSchema = z
  .object({
    taskId: z.string().min(1, "Task ID is required"),
    action: z.enum(["carry_over", "reschedule", "backlog"]),
    targetDate: z
      .string()
      .regex(isoDateRegex, "Target date must be in ISO format YYYY-MM-DD")
      .optional(),
  })
  .strict();

export const executeRolloverSchema = z
  .object({
    date: z
      .string()
      .regex(isoDateRegex, "Date must be in ISO format YYYY-MM-DD"),
    actions: z
      .array(rolloverActionSchema)
      .min(1, "At least one rollover action must be specified"),
  })
  .strict();

export type ExecuteRolloverInput = z.infer<typeof executeRolloverSchema>;
export type RolloverActionItem = z.infer<typeof rolloverActionSchema>;

export const dailyPlanHistoryQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(isoDateRegex, "Start date must be in ISO format YYYY-MM-DD")
      .optional(),
    endDate: z
      .string()
      .regex(isoDateRegex, "End date must be in ISO format YYYY-MM-DD")
      .optional(),
    days: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
  })
  .strict();

export type DailyPlanHistoryQueryInput = z.infer<typeof dailyPlanHistoryQuerySchema>;
