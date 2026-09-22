import { z } from "zod";

export const searchEntityTypeSchema = z.enum([
  "note",
  "task",
  "project",
  "goal",
  "person",
  "learning",
  "content",
  "all",
]);

export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, "Search query must not be empty")
    .max(200, "Search query exceeds maximum length of 200 characters"),
  type: searchEntityTypeSchema.optional().default("all"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type SearchQueryParams = z.infer<typeof searchQuerySchema>;
export type SearchEntityTypeFilter = z.infer<typeof searchEntityTypeSchema>;
