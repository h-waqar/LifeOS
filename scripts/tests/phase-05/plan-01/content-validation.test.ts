import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  createContentItemSchema,
  updateContentItemSchema,
  upsertContentVariantSchema,
  contentStatusTransitionSchema,
  contentFilterSchema,
} from "@/server/content/validation";

describe("Content Validation Schemas (Plan 05-01)", () => {
  describe("createContentItemSchema", () => {
    it("accepts valid content item creation payload with defaults", () => {
      const parsed = createContentItemSchema.parse({
        title: "Building LifeOS",
      });

      expect(parsed.title).toBe("Building LifeOS");
      expect(parsed.contentType).toBe("post");
      expect(parsed.status).toBe("idea");
      expect(parsed.targetChannels).toEqual([]);
      expect(parsed.tags).toEqual([]);
      expect(parsed.mediaUrls).toEqual([]);
    });

    it("accepts full payload with all optional fields and UUID linkages", () => {
      const projectId = crypto.randomUUID();
      const goalId = crypto.randomUUID();
      const noteId = crypto.randomUUID();

      const parsed = createContentItemSchema.parse({
        title: "Modular Monoliths Guide",
        contentType: "article",
        status: "draft",
        topic: "Architecture",
        targetAudience: "Fullstack Engineers",
        primaryPlatform: "blog",
        targetChannels: ["blog", "twitter", "linkedin"],
        tags: ["architecture", "nextjs"],
        summary: "Why modular monoliths beat microservices for solo developers.",
        mediaUrls: ["https://example.com/hero.png"],
        scheduledAt: new Date().toISOString(),
        projectId,
        goalId,
        noteId,
      });

      expect(parsed.contentType).toBe("article");
      expect(parsed.primaryPlatform).toBe("blog");
      expect(parsed.targetChannels).toEqual(["blog", "twitter", "linkedin"]);
      expect(parsed.projectId).toBe(projectId);
      expect(parsed.goalId).toBe(goalId);
      expect(parsed.noteId).toBe(noteId);
    });

    it("rejects empty or whitespace-only titles", () => {
      expect(() => createContentItemSchema.parse({ title: "" })).toThrow(ZodError);
      expect(() => createContentItemSchema.parse({ title: "    " })).toThrow(ZodError);
    });

    it("rejects titles exceeding 255 characters", () => {
      expect(() =>
        createContentItemSchema.parse({ title: "x".repeat(256) })
      ).toThrow(ZodError);
    });

    it("rejects invalid content type enums", () => {
      expect(() =>
        createContentItemSchema.parse({
          title: "Valid Title",
          contentType: "invalid_type" as any,
        })
      ).toThrow(ZodError);
    });

    it("rejects invalid media URLs", () => {
      expect(() =>
        createContentItemSchema.parse({
          title: "Valid Title",
          mediaUrls: ["not-a-valid-url"],
        })
      ).toThrow(ZodError);
    });

    it("rejects malformed UUID linkages", () => {
      expect(() =>
        createContentItemSchema.parse({
          title: "Valid Title",
          projectId: "non-uuid-id",
        })
      ).toThrow(ZodError);
    });
  });

  describe("updateContentItemSchema", () => {
    it("accepts partial updates", () => {
      const parsed = updateContentItemSchema.parse({
        topic: "Updated Topic",
        tags: ["new-tag"],
      });
      expect(parsed.topic).toBe("Updated Topic");
      expect(parsed.tags).toEqual(["new-tag"]);
      expect(parsed.title).toBeUndefined();
    });

    it("rejects empty title if provided in update", () => {
      expect(() => updateContentItemSchema.parse({ title: "   " })).toThrow(
        ZodError
      );
    });
  });

  describe("upsertContentVariantSchema", () => {
    it("accepts valid twitter thread variant", () => {
      const parsed = upsertContentVariantSchema.parse({
        platform: "twitter",
        title: "Tweet Thread",
        body: "First tweet",
        threadItems: ["Tweet 1", "Tweet 2", "Tweet 3"],
        status: "ready",
        customSettings: {
          threadNumbering: true,
        },
      });

      expect(parsed.platform).toBe("twitter");
      expect(parsed.threadItems).toHaveLength(3);
      expect(parsed.customSettings?.threadNumbering).toBe(true);
    });

    it("accepts valid blog variant with slug and canonicalUrl", () => {
      const parsed = upsertContentVariantSchema.parse({
        platform: "blog",
        body: "# Full Markdown Content",
        status: "draft",
        customSettings: {
          slug: "my-blog-post",
          canonicalUrl: "https://myblog.com/post-1",
          metaDescription: "A great post about LifeOS",
        },
      });

      expect(parsed.platform).toBe("blog");
      expect(parsed.customSettings?.slug).toBe("my-blog-post");
      expect(parsed.customSettings?.canonicalUrl).toBe("https://myblog.com/post-1");
    });

    it("rejects invalid platform enums", () => {
      expect(() =>
        upsertContentVariantSchema.parse({
          platform: "myspace" as any,
          body: "Hello",
        })
      ).toThrow(ZodError);
    });
  });

  describe("contentStatusTransitionSchema", () => {
    it("accepts valid status transition", () => {
      const parsed = contentStatusTransitionSchema.parse({
        targetStatus: "in_review",
      });
      expect(parsed.targetStatus).toBe("in_review");
    });

    it("rejects invalid status", () => {
      expect(() =>
        contentStatusTransitionSchema.parse({
          targetStatus: "non_existent_status" as any,
        })
      ).toThrow(ZodError);
    });
  });

  describe("contentFilterSchema", () => {
    it("parses query parameters with proper coercion and defaults", () => {
      const parsed = contentFilterSchema.parse({
        status: "draft",
        limit: "25",
        offset: "50",
        isArchived: "true",
      });

      expect(parsed.status).toBe("draft");
      expect(parsed.limit).toBe(25);
      expect(parsed.offset).toBe(50);
      expect(parsed.isArchived).toBe(true);
    });

    it("applies sensible defaults when query params are omitted", () => {
      const parsed = contentFilterSchema.parse({});
      expect(parsed.limit).toBe(50);
      expect(parsed.offset).toBe(0);
      expect(parsed.isArchived).toBe(false);
    });
  });
});
