// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { learningItems, notes, goals, projects } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and, sql } from "drizzle-orm";

describe("Phase 3 Plan 03-04: Learning Schema Isolation & Database Invariants (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_learning_isolation@example.com",
    password: "Plan03LearningPassword123!",
    name: "Learning Isolation Tester",
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
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Rejects inserting learning item for non-existent user via foreign key (user_id)", async () => {
    if (!probe.isAvailable) return;

    const fakeUserId = "fake_user_" + crypto.randomUUID().slice(0, 8);

    await expect(
      db.insert(learningItems).values({
        userId: fakeUserId,
        title: "Ghost Learning Item",
        type: "book",
        status: "not_started",
      })
    ).rejects.toThrow();
  });

  it("2. Successfully creates a valid Learning Item for authenticated user with default fields", async () => {
    if (!probe.isAvailable) return;

    const [created] = await db
      .insert(learningItems)
      .values({
        userId: testUserId,
        title: "Designing Data-Intensive Applications",
        type: "book",
        status: "in_progress",
        author: "Martin Kleppmann",
        currentUnits: 120,
        totalUnits: 550,
        unitType: "pages",
        progress: 22,
        rating: 5,
        tags: ["systems", "distributed-databases"],
        keyTakeaways: ["Reliability, scalability, maintainability"],
      })
      .returning();

    expect(created).toBeDefined();
    expect(created.title).toBe("Designing Data-Intensive Applications");
    expect(created.type).toBe("book");
    expect(created.userId).toBe(testUserId);
    expect(created.progress).toBe(22);
    expect(created.rating).toBe(5);
    expect(created.tags).toEqual(["systems", "distributed-databases"]);
    expect(created.keyTakeaways).toEqual([
      "Reliability, scalability, maintainability",
    ]);
  });

  it("3. Enforces rating check constraint (1 <= rating <= 5) at database level", async () => {
    if (!probe.isAvailable) return;

    // rating = 0 violates CHECK
    await expect(
      db.insert(learningItems).values({
        userId: testUserId,
        title: "Invalid Zero Rating",
        type: "course",
        rating: 0,
      })
    ).rejects.toThrow();

    // rating = 6 violates CHECK
    await expect(
      db.insert(learningItems).values({
        userId: testUserId,
        title: "Invalid Six Rating",
        type: "course",
        rating: 6,
      })
    ).rejects.toThrow();
  });

  it("4. Enforces progress check constraint (0 <= progress <= 100) at database level", async () => {
    if (!probe.isAvailable) return;

    // progress = -1 violates CHECK
    await expect(
      db.insert(learningItems).values({
        userId: testUserId,
        title: "Negative Progress Item",
        type: "podcast",
        progress: -5,
      })
    ).rejects.toThrow();

    // progress = 105 violates CHECK
    await expect(
      db.insert(learningItems).values({
        userId: testUserId,
        title: "Overflown Progress Item",
        type: "podcast",
        progress: 105,
      })
    ).rejects.toThrow();
  });

  it("5. Enforces non-empty title check constraint at database level", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(learningItems).values({
        userId: testUserId,
        title: "   ",
        type: "article",
      })
    ).rejects.toThrow();
  });

  it("6. Enforces composite foreign keys (user_id, goal_id) and (user_id, project_id)", async () => {
    if (!probe.isAvailable) return;

    const fakeGoalId = crypto.randomUUID();
    const fakeProjectId = crypto.randomUUID();

    // Linking to non-existent goal should fail composite FK
    await expect(
      db.insert(learningItems).values({
        userId: testUserId,
        title: "Ghost Goal Link",
        type: "book",
        goalId: fakeGoalId,
      })
    ).rejects.toThrow();

    // Linking to non-existent project should fail composite FK
    await expect(
      db.insert(learningItems).values({
        userId: testUserId,
        title: "Ghost Project Link",
        type: "course",
        projectId: fakeProjectId,
      })
    ).rejects.toThrow();
  });

  it("7. Supports trigram index and full-text search tsvector query on learning_items", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(learningItems)
      .values({
        userId: testUserId,
        title: "Kubernetes Up and Running Complete Guide",
        type: "book",
        author: "Brendan Burns",
        summary:
          "Dive into container orchestration, pods, deployments, and services.",
      })
      .returning();

    expect(item).toBeDefined();

    // Trigram word similarity search query
    const trigramMatch = await db
      .select({ id: learningItems.id, title: learningItems.title })
      .from(learningItems)
      .where(
        and(
          eq(learningItems.userId, testUserId),
          sql`'Kubernets' <% ${learningItems.title}`
        )
      );
    expect(trigramMatch.length).toBeGreaterThanOrEqual(1);
    expect(trigramMatch.some((m) => m.id === item.id)).toBe(true);

    // Full text search query
    const ftsMatch = await db
      .select({ id: learningItems.id, title: learningItems.title })
      .from(learningItems)
      .where(
        and(
          eq(learningItems.userId, testUserId),
          sql`to_tsvector('english', coalesce(${learningItems.title}, '') || ' ' || coalesce(${learningItems.summary}, '')) @@ plainto_tsquery('english', 'orchestration')`
        )
      );
    expect(ftsMatch.length).toBeGreaterThanOrEqual(1);
    expect(ftsMatch.some((m) => m.id === item.id)).toBe(true);
  });
});
