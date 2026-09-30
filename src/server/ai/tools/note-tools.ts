import { z } from "zod";
import { type LifeOSTool } from "./types";
import {
  createNote,
  listNotes,
} from "@/server/notes/service";

export const notesSearchTool: LifeOSTool = {
  id: "notes_search",
  name: "notes_search",
  description: "Search notes by title or content keyword, note type, or area.",
  category: "notes",
  riskTier: "tier1_readonly",
  schema: z.object({
    query: z.string().optional().describe("Search keyword for note title or content"),
    noteType: z
      .enum([
        "quick",
        "meeting",
        "research",
        "idea",
        "journal",
        "documentation",
        "reference",
        "learning",
      ])
      .optional()
      .describe("Filter by note type"),
    area: z.string().optional().describe("Filter by life area"),
    limit: z.number().int().min(1).max(50).optional().default(20),
  }),
  execute: async (ctx, args) => {
    const res = await listNotes(ctx.userId, {
      search: args.query,
      noteType: args.noteType,
      area: args.area,
      limit: args.limit,
    });
    return res.notes;
  },
};

export const notesCreateTool: LifeOSTool = {
  id: "notes_create",
  name: "notes_create",
  description: "Create a new note or draft idea with title, markdown content, and optional tags.",
  category: "notes",
  riskTier: "tier2_low",
  schema: z.object({
    title: z.string().trim().min(1, "Title is required").max(255),
    content: z.string().optional().default(""),
    noteType: z
      .enum([
        "quick",
        "meeting",
        "research",
        "idea",
        "journal",
        "documentation",
        "reference",
        "learning",
      ])
      .optional()
      .default("quick"),
    area: z.string().optional().default("general"),
    tags: z.array(z.string().trim().min(1)).optional().default([]),
    projectId: z.string().uuid().optional(),
    goalId: z.string().uuid().optional(),
  }),
  previewAction: (args) => ({
    summary: `Create note "${args.title}" [${args.noteType ?? "quick"}]`,
    affectedEntities: [{ domain: "notes", name: args.title }],
    diff: {
      title: { after: args.title },
      noteType: { after: args.noteType ?? "quick" },
    },
  }),
  execute: async (ctx, args) => {
    return await createNote(ctx.userId, {
      title: args.title,
      content: args.content,
      noteType: args.noteType,
      area: args.area,
      tags: args.tags,
      projectId: args.projectId,
      goalId: args.goalId,
    });
  },
};
