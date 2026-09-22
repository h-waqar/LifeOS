// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { contentItems } from "@/server/db/schema/content";
import { auth } from "@/server/auth";
import { search } from "@/server/search/service";
import { eq } from "drizzle-orm";

describe("Phase 5 Plan 05-01: Content Search Engine Integration", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_content_search@example.com",
    password: "Plan05ContentSearchPassword123!",
    name: "Content Search Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;

    // Seed content items
    await db.insert(contentItems).values([
      {
        id: "content-search-1",
        userId: testUserId,
        title: "Microservices Anti-patterns and Solutions",
        contentType: "article",
        status: "draft",
        topic: "Cloud Architecture",
        targetAudience: "Systems Architects",
        summary: "Detailed analysis of distributed monoliths and database decoupling techniques.",
        tags: ["microservices", "architecture"],
        isArchived: false,
      },
      {
        id: "content-search-2",
        userId: testUserId,
        title: "Deep Dive into TypeScript 5 Decorators",
        contentType: "thread",
        status: "idea",
        topic: "Web Development",
        targetAudience: "Frontend Engineers",
        summary: "Walkthrough of Stage 3 TC39 decorator semantics and metadata reflection.",
        tags: ["typescript", "javascript"],
        isArchived: false,
      },
      {
        id: "content-search-archived",
        userId: testUserId,
        title: "Archived Legacy Microservices Post",
        contentType: "post",
        status: "archived",
        topic: "Cloud Architecture",
        summary: "Old notes on deprecated microservice tooling.",
        tags: ["microservices", "legacy"],
        isArchived: true, // Should be excluded from search results
      },
    ]);
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Searches content items by exact title keyword", async () => {
    if (!probe.isAvailable) return;

    const result = await search(testUserId, { q: "Microservices" });
    expect(result.results.length).toBeGreaterThanOrEqual(1);

    const match = result.results.find((r) => r.id === "content-search-1");
    expect(match).toBeDefined();
    expect(match?.type).toBe("content");
    expect(match?.title).toBe("Microservices Anti-patterns and Solutions");
    expect(match?.href).toBe("/content?id=content-search-1");
  });

  it("2. Searches content items by summary content via full-text search", async () => {
    if (!probe.isAvailable) return;

    const result = await search(testUserId, { q: "decoupling techniques" });
    const match = result.results.find((r) => r.id === "content-search-1");
    expect(match).toBeDefined();
    expect(match?.type).toBe("content");
  });

  it("3. Searches content items by topic and trigram similarity", async () => {
    if (!probe.isAvailable) return;

    const result = await search(testUserId, { q: "Decorators" });
    const match = result.results.find((r) => r.id === "content-search-2");
    expect(match).toBeDefined();
    expect(match?.type).toBe("content");
    expect(match?.title).toBe("Deep Dive into TypeScript 5 Decorators");
  });

  it("4. Excludes archived content items from search results", async () => {
    if (!probe.isAvailable) return;

    const result = await search(testUserId, { q: "Legacy Microservices" });
    const archivedMatch = result.results.find((r) => r.id === "content-search-archived");
    expect(archivedMatch).toBeUndefined();
  });

  it("5. Filters search specifically to 'content' type", async () => {
    if (!probe.isAvailable) return;

    const result = await search(testUserId, {
      q: "Microservices",
      type: "content",
    });

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results.every((r) => r.type === "content")).toBe(true);
    expect(result.byType.content).toBeGreaterThanOrEqual(1);
  });
});
