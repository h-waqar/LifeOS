import { z } from "zod";

export const parsedCaptureSchema = z.object({
  intent: z.enum(["task", "calendar", "note"]).default("task"),
  title: z
    .string()
    .trim()
    .min(1, "Title must not be empty"),
  description: z.string().trim().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  energyLevel: z.enum(["low", "medium", "high"]).optional(),
  scheduledDate: z
    .string()
    .optional()
    .describe("ISO 8601 datetime or date string for scheduled start"),
  dueDate: z
    .string()
    .optional()
    .describe("ISO 8601 datetime or date string for deadline"),
  durationMinutes: z.number().int().positive().optional(),
  projectName: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1).default(0.9),
});

export type ParsedCapture = z.infer<typeof parsedCaptureSchema>;

export const parseCaptureRequestSchema = z.object({
  input: z.string().trim().min(1, "Input text is required"),
  referenceDate: z.string().optional(),
  timezone: z.string().optional().default("UTC"),
});

export type ParseCaptureRequest = z.infer<typeof parseCaptureRequestSchema>;
