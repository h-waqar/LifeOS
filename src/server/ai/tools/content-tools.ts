import { z } from "zod";
import { type LifeOSTool } from "./types";
import {
  createContentItem,
  listContentItems,
} from "@/server/content/service";

export const contentListTool: LifeOSTool = {
  id: "content_list",
  name: "content_list",
  description: "List content creation pipeline items filtered by status, content type, or topic.",
  category: "content",
  riskTier: "tier1_readonly",
  schema: z.object({
    status: z
      .enum(["idea", "research", "drafting", "review", "scheduled", "published", "archived"])
      .optional()
      .describe("Filter by pipeline stage"),
    contentType: z
      .enum(["article", "post", "thread", "newsletter", "script", "video", "podcast", "other"])
      .optional()
      .describe("Filter by format"),
    platform: z
      .enum(["twitter", "linkedin", "blog", "instagram", "youtube", "newsletter", "other"])
      .optional()
      .describe("Filter by primary target platform"),
    topic: z.string().optional().describe("Filter by topic keyword"),
  }),
  execute: async (ctx, args) => {
    const res = await listContentItems(ctx.userId, {
      status: args.status,
      contentType: args.contentType,
      platform: args.platform,
      topic: args.topic,
    });
    return res.items;
  },
};

export const contentCreateIdeaTool: LifeOSTool = {
  id: "content_create_idea",
  name: "content_create_idea",
  description: "Capture a new content idea or draft outline into the content creation pipeline.",
  category: "content",
  riskTier: "tier2_low",
  schema: z.object({
    title: z.string().trim().min(1, "Title is required").max(255),
    contentType: z
      .enum(["article", "post", "thread", "newsletter", "script", "video", "podcast", "other"])
      .optional()
      .default("post"),
    topic: z.string().trim().max(255).optional(),
    summary: z.string().trim().optional(),
    primaryPlatform: z
      .enum(["twitter", "linkedin", "blog", "instagram", "youtube", "newsletter", "other"])
      .optional(),
    tags: z.array(z.string().trim().min(1)).optional().default([]),
  }),
  previewAction: (args) => ({
    summary: `Capture content idea: "${args.title}" [${args.contentType ?? "post"}]`,
    affectedEntities: [{ domain: "content", name: args.title }],
    diff: {
      title: { after: args.title },
      status: { after: "idea" },
    },
  }),
  execute: async (ctx, args) => {
    return await createContentItem(ctx.userId, {
      title: args.title,
      contentType: args.contentType ?? "post",
      status: "idea",
      topic: args.topic,
      summary: args.summary,
      primaryPlatform: args.primaryPlatform,
      tags: args.tags ?? [],
    });
  },
};
