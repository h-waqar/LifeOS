import { z } from "zod";
import { type LifeOSTool } from "./types";
import {
  listPeople,
  logInteraction,
} from "@/server/people/service";

export const peopleSearchTool: LifeOSTool = {
  id: "people_search",
  name: "people_search",
  description: "Search personal and professional CRM contacts by name, company, or relationship type.",
  category: "people",
  riskTier: "tier1_readonly",
  schema: z.object({
    query: z.string().optional().describe("Search keyword for contact name, email, or company"),
    relationshipType: z
      .enum([
        "client",
        "friend",
        "family",
        "colleague",
        "prospect",
        "mentor",
        "professional",
        "other",
      ])
      .optional()
      .describe("Filter by relationship category"),
    company: z.string().optional().describe("Filter by company name"),
  }),
  execute: async (ctx, args) => {
    return await listPeople(ctx.userId, {
      search: args.query,
      relationshipType: args.relationshipType,
      company: args.company,
    });
  },
};

export const peopleLogInteractionTool: LifeOSTool = {
  id: "people_log_interaction",
  name: "people_log_interaction",
  description: "Log an interaction (call, meeting, email, message) with a contact and optionally schedule follow-up.",
  category: "people",
  riskTier: "tier3_consequential",
  schema: z.object({
    personId: z.string().uuid("personId must be a valid UUID"),
    channel: z
      .enum(["meeting", "call", "email", "message", "in_person", "other"])
      .optional()
      .default("call"),
    summary: z
      .string()
      .trim()
      .min(1, "Summary is required")
      .max(4000, "Summary cannot exceed 4000 characters"),
    date: z.string().datetime().optional().describe("Interaction date (ISO datetime, defaults to now)"),
    nextFollowUpDate: z
      .string()
      .datetime()
      .optional()
      .describe("Next follow-up date (ISO datetime)"),
  }),
  previewAction: (args) => ({
    summary: `Log ${args.channel ?? "interaction"} with contact ${args.personId}: "${args.summary.slice(0, 60)}"`,
    affectedEntities: [{ domain: "people", id: args.personId, name: "Contact Interaction" }],
    diff: {
      channel: { after: args.channel ?? "call" },
      summary: { after: args.summary },
    },
  }),
  execute: async (ctx, args) => {
    return await logInteraction(ctx.userId, args.personId, {
      channel: args.channel,
      summary: args.summary,
      date: args.date ? new Date(args.date) : undefined,
      nextFollowUpDate: args.nextFollowUpDate ? new Date(args.nextFollowUpDate) : undefined,
    });
  },
};
