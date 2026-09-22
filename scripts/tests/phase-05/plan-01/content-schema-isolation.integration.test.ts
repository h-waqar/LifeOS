// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  contentItems,
  contentVariants,
  projects,
  goals,
  notes,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";

describe("Phase 5 Plan 05-01: Content Schema Isolation & Database Invariants (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_content_isolation@example.com",
    password: "Plan05ContentPassword123!",
    name: "Content Isolation Tester",
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

  it("1. Enforces single_user_lock database invariant preventing secondary users", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(user).values({
        id: "rogue_content_user_" + crypto.randomUUID().slice(0, 8),
        email: "rogue_content@example.com",
        name: "Rogue Content User",
      })
    ).rejects.toThrow();
  });

  it("2. Rejects creating content item for non-existent user via foreign key (user_id)", async () => {
    if (!probe.isAvailable) return;

    const fakeUserId = "fake_user_" + crypto.randomUUID().slice(0, 8);

    await expect(
      db.insert(contentItems).values({
        userId: fakeUserId,
        title: "Ghost Content Idea",
      })
    ).rejects.toThrow();
  });

  it("3. Creates valid content items across supported content types for authenticated user", async () => {
    if (!probe.isAvailable) return;

    const types = [
      "post",
      "thread",
      "article",
      "short_video",
      "carousel",
      "newsletter",
      "other",
    ] as const;

    for (const t of types) {
      const [item] = await db
        .insert(contentItems)
        .values({
          userId: testUserId,
          title: `Test ${t} Title`,
          contentType: t,
          topic: "Engineering",
          targetAudience: "Developers",
          tags: ["dev", "tech"],
          targetChannels: ["twitter", "linkedin"],
        })
        .returning();

      expect(item).toBeDefined();
      expect(item.userId).toBe(testUserId);
      expect(item.contentType).toBe(t);
      expect(item.status).toBe("idea");
      expect(item.tags).toEqual(["dev", "tech"]);
      expect(item.targetChannels).toEqual(["twitter", "linkedin"]);
    }
  });

  it("4. Enforces check constraint: title cannot be empty or whitespace only", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(contentItems).values({
        userId: testUserId,
        title: "   ",
      })
    ).rejects.toThrow();
  });

  it("5. Enforces check constraint: contentType must be one of allowed enums", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(contentItems).values({
        userId: testUserId,
        title: "Invalid Type Item",
        contentType: "podcast" as any,
      })
    ).rejects.toThrow();
  });

  it("6. Enforces check constraint: status must be one of allowed workflow enums", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(contentItems).values({
        userId: testUserId,
        title: "Invalid Status Item",
        status: "discarded" as any,
      })
    ).rejects.toThrow();
  });

  it("7. Rejects creating content variant for non-existent content item via composite FK", async () => {
    if (!probe.isAvailable) return;

    const fakeItemId = crypto.randomUUID();

    await expect(
      db.insert(contentVariants).values({
        userId: testUserId,
        contentItemId: fakeItemId,
        platform: "twitter",
        body: "Tweet without item",
      })
    ).rejects.toThrow();
  });

  it("8. Rejects duplicate variant for the same user, item, and platform via unique constraint", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Unique Variant Test Item",
      })
      .returning();

    await db.insert(contentVariants).values({
      userId: testUserId,
      contentItemId: item.id,
      platform: "twitter",
      body: "First Twitter variant",
    });

    await expect(
      db.insert(contentVariants).values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "twitter",
        body: "Duplicate Twitter variant",
      })
    ).rejects.toThrow();
  });

  it("9. Enforces check constraint: variant platform must be one of allowed enums", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Platform Constraint Item",
      })
      .returning();

    await expect(
      db.insert(contentVariants).values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "tiktok" as any,
        body: "TikTok variant",
      })
    ).rejects.toThrow();
  });

  it("10. Enforces check constraint: variant charCount must be non-negative", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Negative CharCount Item",
      })
      .returning();

    await expect(
      db.insert(contentVariants).values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "twitter",
        body: "Negative count",
        charCount: -5,
      })
    ).rejects.toThrow();
  });

  it("11. Enforces CASCADE delete: deleting a content item deletes all associated variants", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Cascade Test Item",
      })
      .returning();

    const [v1] = await db
      .insert(contentVariants)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "twitter",
        body: "Tweet to delete",
      })
      .returning();

    const [v2] = await db
      .insert(contentVariants)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "linkedin",
        body: "LinkedIn post to delete",
      })
      .returning();

    // Verify variants exist
    const variantsBefore = await db
      .select()
      .from(contentVariants)
      .where(eq(contentVariants.contentItemId, item.id));
    expect(variantsBefore.length).toBe(2);

    // Delete content item
    await db.delete(contentItems).where(eq(contentItems.id, item.id));

    // Verify variants cascaded away
    const variantsAfter = await db
      .select()
      .from(contentVariants)
      .where(eq(contentVariants.contentItemId, item.id));
    expect(variantsAfter.length).toBe(0);
  });

  it("12. Rejects linking to a non-existent or cross-tenant project via composite FK", async () => {
    if (!probe.isAvailable) return;

    const fakeProjectId = crypto.randomUUID();

    await expect(
      db.insert(contentItems).values({
        userId: testUserId,
        title: "Cross Tenant Project Link",
        projectId: fakeProjectId,
      })
    ).rejects.toThrow();
  });

  it("13. Rejects linking to a non-existent or cross-tenant goal via composite FK", async () => {
    if (!probe.isAvailable) return;

    const fakeGoalId = crypto.randomUUID();

    await expect(
      db.insert(contentItems).values({
        userId: testUserId,
        title: "Cross Tenant Goal Link",
        goalId: fakeGoalId,
      })
    ).rejects.toThrow();
  });

  it("14. Rejects linking to a non-existent or cross-tenant note via composite FK", async () => {
    if (!probe.isAvailable) return;

    const fakeNoteId = crypto.randomUUID();

    await expect(
      db.insert(contentItems).values({
        userId: testUserId,
        title: "Cross Tenant Note Link",
        noteId: fakeNoteId,
      })
    ).rejects.toThrow();
  });
});
