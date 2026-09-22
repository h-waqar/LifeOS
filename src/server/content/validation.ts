import { z } from "zod";
import {
  CONTENT_TYPES,
  CONTENT_STATUSES,
  CONTENT_PLATFORMS,
  VARIANT_STATUSES,
  PUBLICATION_STATUSES,
} from "@/types";

export const contentTypeSchema = z.enum(CONTENT_TYPES);
export const contentStatusSchema = z.enum(CONTENT_STATUSES);
export const contentPlatformSchema = z.enum(CONTENT_PLATFORMS);
export const variantStatusSchema = z.enum(VARIANT_STATUSES);
export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);

export const variantCustomSettingsSchema = z.object({
  slug: z.string().optional(),
  canonicalUrl: z.string().url().optional().or(z.literal("")),
  metaDescription: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  threadNumbering: z.boolean().optional(),
}).default({});

export const createContentItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(255, "Title must be at most 255 characters"),
  contentType: contentTypeSchema.default("post"),
  status: contentStatusSchema.default("idea"),
  topic: z.string().trim().max(255).optional().nullable(),
  targetAudience: z.string().trim().max(255).optional().nullable(),
  primaryPlatform: contentPlatformSchema.optional().nullable(),
  targetChannels: z.array(contentPlatformSchema).optional().default([]),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  summary: z.string().trim().optional().nullable(),
  mediaUrls: z
    .array(z.string().url("Invalid media URL"))
    .optional()
    .default([]),
  scheduledAt: z.string().datetime().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
  projectId: z.string().uuid("Invalid project ID").optional().nullable(),
  goalId: z.string().uuid("Invalid goal ID").optional().nullable(),
  noteId: z.string().uuid("Invalid note ID").optional().nullable(),
});

export const updateContentItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title must not be empty")
    .max(255, "Title must be at most 255 characters")
    .optional(),
  contentType: contentTypeSchema.optional(),
  status: contentStatusSchema.optional(),
  topic: z.string().trim().max(255).optional().nullable(),
  targetAudience: z.string().trim().max(255).optional().nullable(),
  primaryPlatform: contentPlatformSchema.optional().nullable(),
  targetChannels: z.array(contentPlatformSchema).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  summary: z.string().trim().optional().nullable(),
  mediaUrls: z.array(z.string().url("Invalid media URL")).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
  projectId: z.string().uuid("Invalid project ID").optional().nullable(),
  goalId: z.string().uuid("Invalid goal ID").optional().nullable(),
  noteId: z.string().uuid("Invalid note ID").optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const contentStatusTransitionSchema = z.object({
  targetStatus: contentStatusSchema,
  scheduledAt: z.string().datetime().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
});

export const upsertContentVariantSchema = z.object({
  platform: contentPlatformSchema,
  title: z.string().trim().max(255).optional().nullable(),
  body: z.string().default(""),
  threadItems: z.array(z.string()).optional().default([]),
  status: variantStatusSchema.default("draft"),
  customSettings: variantCustomSettingsSchema.optional().default({}),
});

export const contentFilterSchema = z.object({
  status: z.string().optional(),
  contentType: z.string().optional(),
  platform: z.string().optional(),
  topic: z.string().optional(),
  tag: z.string().optional(),
  projectId: z.string().optional(),
  goalId: z.string().optional(),
  search: z.string().optional(),
  isArchived: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

// Plan 05-02 Schemas
export const scheduleContentSchema = z.object({
  variantId: z.string().uuid("Invalid variant ID").optional().nullable(),
  platform: contentPlatformSchema,
  scheduledFor: z.string().datetime({ message: "Invalid scheduled datetime" }),
});

export const markPublishedSchema = z.object({
  publishedAt: z.string().datetime().optional(),
  postUrl: z.union([z.string().url("Invalid post URL"), z.literal("")]).optional().nullable(),
  externalPostId: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const logMetricsSchema = z.object({
  views: z.number().int().min(0, "Views cannot be negative").default(0),
  likes: z.number().int().min(0, "Likes cannot be negative").default(0),
  comments: z.number().int().min(0, "Comments cannot be negative").default(0),
  shares: z.number().int().min(0, "Shares cannot be negative").default(0),
  saves: z.number().int().min(0, "Saves cannot be negative").default(0),
  clicks: z.number().int().min(0, "Clicks cannot be negative").default(0),
  notes: z.string().trim().optional().nullable(),
  recordedAt: z.string().datetime().optional(),
});

export const reschedulePublicationSchema = z.object({
  scheduledFor: z.string().datetime({ message: "Invalid scheduled datetime" }),
});

export const calendarQuerySchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
    platform: contentPlatformSchema.optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "Start date must be on or before end date",
    path: ["endDate"],
  });

export const analyticsQuerySchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD").optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD").optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: "Start date must be on or before end date",
      path: ["endDate"],
    }
  );

export type CreateContentItemSchemaInput = z.infer<typeof createContentItemSchema>;
export type UpdateContentItemSchemaInput = z.infer<typeof updateContentItemSchema>;
export type ContentStatusTransitionSchemaInput = z.infer<typeof contentStatusTransitionSchema>;
export type UpsertContentVariantSchemaInput = z.infer<typeof upsertContentVariantSchema>;
export type ContentFilterSchemaInput = z.infer<typeof contentFilterSchema>;
export type ScheduleContentSchemaInput = z.infer<typeof scheduleContentSchema>;
export type ReschedulePublicationSchemaInput = z.infer<typeof reschedulePublicationSchema>;
export type MarkPublishedSchemaInput = z.infer<typeof markPublishedSchema>;
export type LogMetricsSchemaInput = z.infer<typeof logMetricsSchema>;
export type CalendarQuerySchemaInput = z.infer<typeof calendarQuerySchema>;
export type AnalyticsQuerySchemaInput = z.infer<typeof analyticsQuerySchema>;

