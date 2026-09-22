import { z } from "zod";

export const relationshipTypeEnum = z.enum([
  "client",
  "friend",
  "family",
  "colleague",
  "prospect",
  "mentor",
  "professional",
  "other",
]);

export const interactionChannelEnum = z.enum([
  "meeting",
  "call",
  "email",
  "message",
  "in_person",
  "other",
]);

export const followUpStatusEnum = z.enum([
  "overdue",
  "today",
  "upcoming",
  "none",
]);

const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(255, "Email cannot exceed 255 characters")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const createPersonSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Contact name cannot be empty")
    .max(255, "Contact name cannot exceed 255 characters"),
  relationshipType: relationshipTypeEnum.optional().default("colleague"),
  company: z
    .string()
    .trim()
    .max(255, "Company cannot exceed 255 characters")
    .nullable()
    .optional(),
  role: z
    .string()
    .trim()
    .max(255, "Role cannot exceed 255 characters")
    .nullable()
    .optional(),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .max(50, "Phone number cannot exceed 50 characters")
    .nullable()
    .optional(),
  contactInfo: z.record(z.any()).optional().default({}),
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
  notes: z
    .string()
    .max(4000, "Notes cannot exceed 4000 characters")
    .nullable()
    .optional(),
  nextFollowUpDate: z.coerce.date().nullable().optional(),
});

export const updatePersonSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Contact name cannot be empty")
    .max(255, "Contact name cannot exceed 255 characters")
    .optional(),
  relationshipType: relationshipTypeEnum.optional(),
  company: z
    .string()
    .trim()
    .max(255, "Company cannot exceed 255 characters")
    .nullable()
    .optional(),
  role: z
    .string()
    .trim()
    .max(255, "Role cannot exceed 255 characters")
    .nullable()
    .optional(),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .max(50, "Phone number cannot exceed 50 characters")
    .nullable()
    .optional(),
  contactInfo: z.record(z.any()).optional(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(50, "Tag cannot exceed 50 characters")
    )
    .optional(),
  notes: z
    .string()
    .max(4000, "Notes cannot exceed 4000 characters")
    .nullable()
    .optional(),
  isArchived: z.boolean().optional(),
  nextFollowUpDate: z.coerce.date().nullable().optional(),
});

export const listPeopleQuerySchema = z.object({
  relationshipType: relationshipTypeEnum.optional(),
  company: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  followUpStatus: followUpStatusEnum.optional(),
  search: z.string().trim().min(1).optional(),
  isArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  sortBy: z
    .enum([
      "name",
      "lastInteractionDate",
      "nextFollowUpDate",
      "updatedAt",
      "createdAt",
    ])
    .optional()
    .default("name"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const logInteractionSchema = z.object({
  date: z.coerce.date().optional(),
  channel: interactionChannelEnum.optional().default("call"),
  summary: z
    .string()
    .trim()
    .min(1, "Interaction summary cannot be empty")
    .max(4000, "Interaction summary cannot exceed 4000 characters"),
  nextFollowUpDate: z.coerce.date().nullable().optional(),
});

export const updateInteractionSchema = z.object({
  date: z.coerce.date().optional(),
  channel: interactionChannelEnum.optional(),
  summary: z
    .string()
    .trim()
    .min(1, "Interaction summary cannot be empty")
    .max(4000, "Interaction summary cannot exceed 4000 characters")
    .optional(),
  nextFollowUpDate: z.coerce.date().nullable().optional(),
});

export const listInteractionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type CreatePersonSchemaInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonSchemaInput = z.infer<typeof updatePersonSchema>;
export type ListPeopleQueryParams = z.infer<typeof listPeopleQuerySchema>;
export type LogInteractionSchemaInput = z.infer<typeof logInteractionSchema>;
export type UpdateInteractionSchemaInput = z.infer<
  typeof updateInteractionSchema
>;
export type ListInteractionsQueryParams = z.infer<
  typeof listInteractionsQuerySchema
>;
