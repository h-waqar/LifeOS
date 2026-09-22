import { z } from "zod";

export const learningTypeEnum = z.enum([
  "book",
  "course",
  "article",
  "podcast",
  "skill",
  "documentation",
  "other",
]);

export const learningStatusEnum = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "archived",
]);

const urlSchema = z
  .string()
  .trim()
  .url("Invalid URL format")
  .max(2000, "URL cannot exceed 2000 characters")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const ratingSchema = z
  .number()
  .int("Rating must be an integer")
  .min(1, "Rating must be between 1 and 5")
  .max(5, "Rating must be between 1 and 5")
  .nullable()
  .optional();

const progressSchema = z
  .number()
  .int("Progress must be an integer")
  .min(0, "Progress must be between 0 and 100")
  .max(100, "Progress must be between 0 and 100");

export const createLearningItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Learning item title cannot be empty")
    .max(255, "Learning item title cannot exceed 255 characters"),
  type: learningTypeEnum.optional().default("book"),
  status: learningStatusEnum.optional().default("not_started"),
  author: z
    .string()
    .trim()
    .max(255, "Author cannot exceed 255 characters")
    .nullable()
    .optional(),
  url: urlSchema,
  rating: ratingSchema,
  progress: progressSchema.optional().default(0),
  currentUnits: z
    .number()
    .int("Current units must be an integer")
    .min(0, "Current units cannot be negative")
    .nullable()
    .optional()
    .default(0),
  totalUnits: z
    .number()
    .int("Total units must be an integer")
    .min(0, "Total units cannot be negative")
    .nullable()
    .optional(),
  unitType: z
    .string()
    .trim()
    .max(50, "Unit type cannot exceed 50 characters")
    .nullable()
    .optional(),
  summary: z
    .string()
    .max(10000, "Summary cannot exceed 10000 characters")
    .nullable()
    .optional(),
  keyTakeaways: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Key takeaway cannot be empty")
        .max(500, "Key takeaway cannot exceed 500 characters")
    )
    .optional()
    .default([]),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(50, "Tag cannot exceed 50 characters")
    )
    .optional()
    .default([]),
  goalId: z.string().trim().min(1, "Goal ID cannot be empty").nullable().optional(),
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID cannot be empty")
    .nullable()
    .optional(),
});

export const updateLearningItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Learning item title cannot be empty")
    .max(255, "Learning item title cannot exceed 255 characters")
    .optional(),
  type: learningTypeEnum.optional(),
  status: learningStatusEnum.optional(),
  author: z
    .string()
    .trim()
    .max(255, "Author cannot exceed 255 characters")
    .nullable()
    .optional(),
  url: urlSchema,
  rating: ratingSchema,
  progress: progressSchema.optional(),
  currentUnits: z
    .number()
    .int("Current units must be an integer")
    .min(0, "Current units cannot be negative")
    .nullable()
    .optional(),
  totalUnits: z
    .number()
    .int("Total units must be an integer")
    .min(0, "Total units cannot be negative")
    .nullable()
    .optional(),
  unitType: z
    .string()
    .trim()
    .max(50, "Unit type cannot exceed 50 characters")
    .nullable()
    .optional(),
  summary: z
    .string()
    .max(10000, "Summary cannot exceed 10000 characters")
    .nullable()
    .optional(),
  keyTakeaways: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Key takeaway cannot be empty")
        .max(500, "Key takeaway cannot exceed 500 characters")
    )
    .optional(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(50, "Tag cannot exceed 50 characters")
    )
    .optional(),
  goalId: z.string().trim().min(1, "Goal ID cannot be empty").nullable().optional(),
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID cannot be empty")
    .nullable()
    .optional(),
  isArchived: z.boolean().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});

export const listLearningItemsQuerySchema = z.object({
  type: learningTypeEnum.optional(),
  status: learningStatusEnum.optional(),
  goalId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  isArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
  sortBy: z
    .enum(["title", "progress", "rating", "updatedAt", "createdAt"])
    .optional()
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type CreateLearningItemInputSchema = z.infer<
  typeof createLearningItemSchema
>;
export type UpdateLearningItemInputSchema = z.infer<
  typeof updateLearningItemSchema
>;
export type ListLearningItemsQueryParams = z.infer<
  typeof listLearningItemsQuerySchema
>;
