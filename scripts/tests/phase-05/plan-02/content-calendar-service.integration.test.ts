// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  contentItems,
  contentVariants,
  contentPublications,
  auditLog,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import {
  schedulePublication,
  getCalendarItems,
  reschedulePublication,
  markAsPublished,
  getUnscheduledItems,
} from "@/server/content/calendar-service";
import { createContentItem } from "@/server/content/service";
import { NotFoundError, InvariantViolationError } from "@/server/content/service";

describe("Phase 5 Plan 05-02: Content Calendar Service (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_cal_service@example.com",
    password: "Plan05CalServicePassword123!",
    name: "Calendar Service Tester",
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

  it("1. schedulePublication: creates publication and updates parent item to scheduled", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "How We Optimized Postgres",
      contentType: "article",
      primaryPlatform: "blog",
    });

    const scheduledDate = "2026-10-15T15:00:00.000Z";
    const pub = await schedulePublication(testUserId, item.id, {
      platform: "blog",
      scheduledFor: scheduledDate,
    });

    expect(pub.id).toBeDefined();
    expect(pub.contentItemId).toBe(item.id);
    expect(pub.platform).toBe("blog");
    expect(pub.status).toBe("scheduled");
    expect(new Date(pub.scheduledFor).toISOString()).toBe(scheduledDate);

    // Verify parent item was updated to scheduled
    const [updatedItem] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.userId, testUserId), eq(contentItems.id, item.id)));

    expect(updatedItem.status).toBe("scheduled");
    expect(updatedItem.scheduledAt).toBeDefined();
  });

  it("2. schedulePublication: rejects non-existent content item", async () => {
    if (!probe.isAvailable) return;

    const fakeItemId = crypto.randomUUID();
    await expect(
      schedulePublication(testUserId, fakeItemId, {
        platform: "twitter",
        scheduledFor: "2026-10-16T10:00:00.000Z",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("3. schedulePublication: rejects variant belonging to another content item", async () => {
    if (!probe.isAvailable) return;

    const item1 = await createContentItem(testUserId, {
      title: "Content Item 1",
      contentType: "post",
      primaryPlatform: "twitter",
    });

    const item2 = await createContentItem(testUserId, {
      title: "Content Item 2",
      contentType: "post",
      primaryPlatform: "linkedin",
    });

    const [variant1] = await db
      .insert(contentVariants)
      .values({
        userId: testUserId,
        contentItemId: item1.id,
        platform: "twitter",
        body: "Tweet draft for item 1",
      })
      .returning();

    // Try to schedule item2 with variant1 from item1
    await expect(
      schedulePublication(testUserId, item2.id, {
        platform: "twitter",
        variantId: variant1.id,
        scheduledFor: "2026-10-17T12:00:00.000Z",
      })
    ).rejects.toThrow(InvariantViolationError);
  });

  it("4. getCalendarItems: retrieves publications in date range with platform filtering", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Calendar Window Item",
      contentType: "thread",
      primaryPlatform: "twitter",
    });

    // Schedule 1 on Oct 10, 1 on Oct 15, 1 on Nov 5
    await schedulePublication(testUserId, item.id, {
      platform: "twitter",
      scheduledFor: "2026-10-10T09:00:00.000Z",
    });
    await schedulePublication(testUserId, item.id, {
      platform: "linkedin",
      scheduledFor: "2026-10-15T14:00:00.000Z",
    });
    await schedulePublication(testUserId, item.id, {
      platform: "twitter",
      scheduledFor: "2026-11-05T12:00:00.000Z",
    });

    // Query for October 2026
    const octItems = await getCalendarItems(testUserId, {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });

    expect(octItems.length).toBeGreaterThanOrEqual(2);
    expect(octItems.some((p) => p.scheduledFor.startsWith("2026-10-10"))).toBe(true);
    expect(octItems.some((p) => p.scheduledFor.startsWith("2026-10-15"))).toBe(true);
    expect(octItems.some((p) => p.scheduledFor.startsWith("2026-11-05"))).toBe(false);

    // Query with platform = linkedin
    const linkedinOnly = await getCalendarItems(testUserId, {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      platform: "linkedin",
    });

    expect(linkedinOnly.every((p) => p.platform === "linkedin")).toBe(true);
  });

  it("5. reschedulePublication: updates publication datetime and parent item", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Reschedule Candidate",
      contentType: "post",
      primaryPlatform: "linkedin",
    });

    const pub = await schedulePublication(testUserId, item.id, {
      platform: "linkedin",
      scheduledFor: "2026-10-20T10:00:00.000Z",
    });

    const newDate = "2026-10-25T16:30:00.000Z";
    const rescheduled = await reschedulePublication(testUserId, pub.id, {
      scheduledFor: newDate,
    });

    expect(rescheduled.id).toBe(pub.id);
    expect(new Date(rescheduled.scheduledFor).toISOString()).toBe(newDate);

    // Verify parent item scheduledAt was updated
    const [updatedItem] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, item.id));
    expect(new Date(updatedItem.scheduledAt!).toISOString()).toBe(newDate);
  });

  it("6. markAsPublished: records live URL, external post ID, and updates status to published", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Live Publishing Post",
      contentType: "post",
      primaryPlatform: "twitter",
    });

    const pub = await schedulePublication(testUserId, item.id, {
      platform: "twitter",
      scheduledFor: "2026-10-22T08:00:00.000Z",
    });

    const publishedAt = "2026-10-22T08:05:00.000Z";
    const livePub = await markAsPublished(testUserId, pub.id, {
      publishedAt,
      postUrl: "https://twitter.com/hamza/status/123456789",
      externalPostId: "123456789",
      notes: "Cross-posted thread to community",
    });

    expect(livePub.status).toBe("published");
    expect(livePub.postUrl).toBe("https://twitter.com/hamza/status/123456789");
    expect(livePub.externalPostId).toBe("123456789");
    expect(new Date(livePub.publishedAt!).toISOString()).toBe(publishedAt);

    // Verify parent item updated to published
    const [updatedItem] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, item.id));
    expect(updatedItem.status).toBe("published");
    expect(new Date(updatedItem.publishedAt!).toISOString()).toBe(publishedAt);

    // Verify audit log entry
    const [log] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, testUserId),
          eq(auditLog.action, "content.published")
        )
      )
      .orderBy(auditLog.createdAt);
    expect(log).toBeDefined();
  });

  it("7. getUnscheduledItems: returns drafts and ideas not yet scheduled", async () => {
    if (!probe.isAvailable) return;

    const draftItem = await createContentItem(testUserId, {
      title: "Unscheduled Draft Item",
      contentType: "article",
      primaryPlatform: "blog",
    });

    const unscheduled = await getUnscheduledItems(testUserId);
    expect(unscheduled.some((i) => i.id === draftItem.id)).toBe(true);
  });
});
