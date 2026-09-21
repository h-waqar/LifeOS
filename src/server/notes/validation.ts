import { z } from "zod";

export const noteTypeEnum = z.enum([
  "quick",
  "meeting",
  "research",
  "idea",
  "journal",
  "documentation",
  "reference",
  "learning",
]);

export const lifeAreaEnum = z.enum([
  "health",
  "career",
  "finance",
  "personal_development",
  "relationships",
  "general",
]);

export const createNoteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Note title cannot be empty")
    .max(255, "Note title cannot exceed 255 characters"),
  content: z.string().optional().default(""),
  noteType: noteTypeEnum.optional().default("quick"),
  area: lifeAreaEnum.optional().default("general"),
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
  isPinned: z.boolean().optional().default(false),
  projectId: z.string().trim().min(1).nullable().optional(),
  goalId: z.string().trim().min(1).nullable().optional(),
  taskId: z.string().trim().min(1).nullable().optional(),
  personId: z.string().trim().min(1).nullable().optional(),
  learningId: z.string().trim().min(1).nullable().optional(),
});

export const updateNoteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Note title cannot be empty")
    .max(255, "Note title cannot exceed 255 characters")
    .optional(),
  content: z.string().optional(),
  noteType: noteTypeEnum.optional(),
  area: lifeAreaEnum.optional(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(50, "Tag cannot exceed 50 characters")
    )
    .optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  goalId: z.string().trim().min(1).nullable().optional(),
  taskId: z.string().trim().min(1).nullable().optional(),
  personId: z.string().trim().min(1).nullable().optional(),
  learningId: z.string().trim().min(1).nullable().optional(),
});

export const listNotesQuerySchema = z.object({
  area: lifeAreaEnum.optional(),
  noteType: noteTypeEnum.optional(),
  tag: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  isPinned: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  isArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  projectId: z.string().trim().min(1).optional(),
  goalId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type CreateNoteSchemaInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteSchemaInput = z.infer<typeof updateNoteSchema>;
export type ListNotesQueryParams = z.infer<typeof listNotesQuerySchema>;
