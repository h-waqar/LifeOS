import { z } from "zod";

/**
 * Zod validation schemas for Habit Management and Check-Ins
 */

export const createHabitSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Habit title cannot be empty or whitespace")
      .max(255, "Habit title cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(4000, "Habit description cannot exceed 4000 characters")
      .nullish(),
    frequency: z
      .enum(["daily", "weekdays", "weekly", "specific_days", "custom"])
      .optional()
      .default("daily"),
    frequencyTarget: z
      .number()
      .int("frequencyTarget must be an integer")
      .min(1, "frequencyTarget must be at least 1")
      .optional()
      .default(1),
    frequencyDays: z
      .array(z.number().int().min(0).max(7))
      .optional()
      .default([]),
    intervalDays: z
      .number()
      .int("intervalDays must be an integer")
      .min(1, "intervalDays must be at least 1")
      .optional()
      .default(1),
    targetValue: z
      .number()
      .positive("targetValue must be positive")
      .optional()
      .default(1),
    unit: z.string().trim().max(50).nullish(),
    timeOfDay: z
      .enum(["morning", "afternoon", "evening", "anytime"])
      .optional()
      .default("anytime"),
    reminderTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "reminderTime must be in HH:MM format")
      .nullish(),
    goalId: z.string().trim().min(1).nullish(),
    identityStatement: z
      .string()
      .trim()
      .max(500, "identityStatement cannot exceed 500 characters")
      .nullish(),
    status: z
      .enum(["active", "paused", "archived"])
      .optional()
      .default("active"),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type CreateHabitInput = z.input<typeof createHabitSchema>;
export type CreateHabitOutput = z.output<typeof createHabitSchema>;

export const updateHabitSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Habit title cannot be empty or whitespace")
      .max(255, "Habit title cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(4000, "Habit description cannot exceed 4000 characters")
      .nullish(),
    frequency: z
      .enum(["daily", "weekdays", "weekly", "specific_days", "custom"])
      .optional(),
    frequencyTarget: z
      .number()
      .int("frequencyTarget must be an integer")
      .min(1, "frequencyTarget must be at least 1")
      .optional(),
    frequencyDays: z
      .array(z.number().int().min(0).max(7))
      .optional(),
    intervalDays: z
      .number()
      .int("intervalDays must be an integer")
      .min(1, "intervalDays must be at least 1")
      .optional(),
    targetValue: z
      .number()
      .positive("targetValue must be positive")
      .optional(),
    unit: z.string().trim().max(50).nullish(),
    timeOfDay: z
      .enum(["morning", "afternoon", "evening", "anytime"])
      .optional(),
    reminderTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "reminderTime must be in HH:MM format")
      .nullish(),
    goalId: z.string().trim().min(1).nullish(),
    identityStatement: z
      .string()
      .trim()
      .max(500, "identityStatement cannot exceed 500 characters")
      .nullish(),
    status: z
      .enum(["active", "paused", "archived"])
      .optional(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type UpdateHabitInput = z.input<typeof updateHabitSchema>;
export type UpdateHabitOutput = z.output<typeof updateHabitSchema>;

export const logHabitEntrySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
    value: z
      .number()
      .min(0, "value must be non-negative")
      .optional(),
    targetValue: z
      .number()
      .positive("targetValue must be positive")
      .optional(),
    notes: z
      .string()
      .trim()
      .max(1000, "notes cannot exceed 1000 characters")
      .nullish(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
    habitId: z
      .never({ message: "habitId is supplied via URL parameter" })
      .optional(),
  })
  .strict();

export type LogHabitEntryInput = z.input<typeof logHabitEntrySchema>;
export type LogHabitEntryOutput = z.output<typeof logHabitEntrySchema>;

export const toggleHabitEntrySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format")
      .optional(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
    habitId: z
      .never({ message: "habitId is supplied via URL parameter" })
      .optional(),
  })
  .strict();

export type ToggleHabitEntryInput = z.input<typeof toggleHabitEntrySchema>;
export type ToggleHabitEntryOutput = z.output<typeof toggleHabitEntrySchema>;

export const deleteHabitEntrySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
  })
  .strict();

export type DeleteHabitEntryInput = z.input<typeof deleteHabitEntrySchema>;

export const habitsQuerySchema = z
  .object({
    status: z.enum(["active", "paused", "archived"]).optional(),
    timeOfDay: z
      .enum(["morning", "afternoon", "evening", "anytime"])
      .optional(),
    goalId: z.string().trim().min(1).optional(),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must be in YYYY-MM-DD format")
      .optional(),
  })
  .strict();

export type HabitsQuery = z.infer<typeof habitsQuerySchema>;

export const habitHistoryQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be in YYYY-MM-DD format"),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must be in YYYY-MM-DD format")
      .optional(),
  })
  .strict();

export type HabitHistoryQuery = z.infer<typeof habitHistoryQuerySchema>;
