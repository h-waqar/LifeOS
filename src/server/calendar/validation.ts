import { z } from "zod";

const isoDateString = z.string().refine(
  (val) => {
    const d = new Date(val);
    return !isNaN(d.getTime());
  },
  { message: "Must be a valid ISO 8601 date string" }
);

export const createTimeBlockSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title cannot exceed 255 characters"),
    description: z
      .string()
      .max(4000, "Description cannot exceed 4000 characters")
      .nullable()
      .optional(),
    startTime: isoDateString,
    endTime: isoDateString,
    durationMinutes: z
      .number()
      .int("Duration must be an integer")
      .min(1, "Duration must be at least 1 minute")
      .max(1440, "Duration cannot exceed 1440 minutes (24 hours)")
      .optional(),
    commitmentLevel: z.enum(["soft", "hard"]).default("soft"),
    color: z.string().max(50).nullable().optional(),
    taskId: z.string().min(1).nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
    goalId: z.string().min(1).nullable().optional(),
    habitId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      const start = new Date(data.startTime).getTime();
      const end = new Date(data.endTime).getTime();
      return end > start;
    },
    {
      message: "End time must be strictly after start time",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => {
      const start = new Date(data.startTime).getTime();
      const end = new Date(data.endTime).getTime();
      const diffMinutes = Math.round((end - start) / (1000 * 60));
      return diffMinutes <= 1440;
    },
    {
      message: "Time block duration cannot exceed 24 hours (1440 minutes)",
      path: ["endTime"],
    }
  );

export type CreateTimeBlockInput = z.input<typeof createTimeBlockSchema>;
export type CreateTimeBlockOutput = z.output<typeof createTimeBlockSchema>;

export const updateTimeBlockSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .max(4000, "Description cannot exceed 4000 characters")
      .nullable()
      .optional(),
    startTime: isoDateString.optional(),
    endTime: isoDateString.optional(),
    durationMinutes: z
      .number()
      .int("Duration must be an integer")
      .min(1, "Duration must be at least 1 minute")
      .max(1440, "Duration cannot exceed 1440 minutes")
      .optional(),
    status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
    commitmentLevel: z.enum(["soft", "hard"]).optional(),
    actualMinutes: z
      .number()
      .int()
      .min(0, "Actual minutes cannot be negative")
      .max(1440, "Actual minutes cannot exceed 1440")
      .nullable()
      .optional(),
    color: z.string().max(50).nullable().optional(),
    taskId: z.string().min(1).nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
    goalId: z.string().min(1).nullable().optional(),
    habitId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        const start = new Date(data.startTime).getTime();
        const end = new Date(data.endTime).getTime();
        return end > start;
      }
      return true;
    },
    {
      message: "End time must be strictly after start time",
      path: ["endTime"],
    }
  );

export type UpdateTimeBlockInput = z.input<typeof updateTimeBlockSchema>;
export type UpdateTimeBlockOutput = z.output<typeof updateTimeBlockSchema>;

export const completeTimeBlockSchema = z
  .object({
    actualMinutes: z
      .number()
      .int("Actual minutes must be an integer")
      .min(0, "Actual minutes cannot be negative")
      .max(1440, "Actual minutes cannot exceed 1440")
      .optional(),
    completeLinkedTask: z.boolean().default(false).optional(),
    logHabitEntry: z.boolean().default(true).optional(),
  })
  .strict();

export type CompleteTimeBlockInput = z.infer<typeof completeTimeBlockSchema>;

export const timeBlocksQuerySchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
    taskId: z.string().optional(),
    habitId: z.string().optional(),
  })
  .strict();

export type TimeBlocksQueryInput = z.infer<typeof timeBlocksQuerySchema>;

export const calendarFeedQuerySchema = z
  .object({
    startDate: z.string({ required_error: "startDate is required" }),
    endDate: z.string({ required_error: "endDate is required" }),
    view: z.enum(["day", "week", "month"]).default("week").optional(),
  })
  .strict();

export type CalendarFeedQueryInput = z.infer<typeof calendarFeedQuerySchema>;
