// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import {
  createContentItem,
  listContentItems,
  getContentItemById,
  updateContentItem,
  deleteContentItem,
  upsertContentVariant,
  deleteContentVariant,
  transitionContentStatus,
  NotFoundError,
  InvariantViolationError,
} from "@/server/content/service";

describe("Phase 5 Plan 05-01: Content Service CRUD & Workflow Lifecycle (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_content_service@example.com",
    password: "Plan05ContentServicePassword123!",
    name: "Content Service Tester",
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

  it("1. Creates content item and automatically creates initial variants for targetChannels", async () => {
    if (!probe.isAvailable) return;

    const created = await createContentItem(testUserId, {
      title: "10 Tips for Systems Architecture",
      contentType: "thread",
      topic: "Software Engineering",
      targetAudience: "Senior Developers",
      targetChannels: ["twitter", "linkedin"],
      tags: ["architecture", "systems"],
      summary: "Key lessons learned scaling microservices and modular monoliths.",
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("10 Tips for Systems Architecture");
    expect(created.status).toBe("idea");
    expect(created.targetChannels).toEqual(["twitter", "linkedin"]);
    expect(created.variants).toBeDefined();
    expect(created.variants?.length).toBe(2);

    const platforms = created.variants?.map((v) => v.platform).sort();
    expect(platforms).toEqual(["linkedin", "twitter"]);
  });

  it("2. Lists content items with filtering by status and pagination", async () => {
    if (!probe.isAvailable) return;

    const res = await listContentItems(testUserId, {
      status: "idea",
      limit: 10,
    });

    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items[0].title).toBe("10 Tips for Systems Architecture");
    expect(res.total).toBeGreaterThanOrEqual(1);
  });

  it("3. Retrieves content item by ID with full variants", async () => {
    if (!probe.isAvailable) return;

    const list = await listContentItems(testUserId);
    const firstId = list.items[0].id;

    const item = await getContentItemById(testUserId, firstId);
    expect(item.id).toBe(firstId);
    expect(item.title).toBe(list.items[0].title);
    expect(item.variants).toBeDefined();
    expect(item.variants?.length).toBe(2);
  });

  it("4. Updates content item metadata and tags", async () => {
    if (!probe.isAvailable) return;

    const list = await listContentItems(testUserId);
    const target = list.items[0];

    const updated = await updateContentItem(testUserId, target.id, {
      title: "12 Tips for High-Scale Systems Architecture",
      tags: ["architecture", "scale", "performance"],
      summary: "Updated summary with performance focus.",
    });

    expect(updated.title).toBe("12 Tips for High-Scale Systems Architecture");
    expect(updated.tags).toEqual(["architecture", "scale", "performance"]);
    expect(updated.summary).toBe("Updated summary with performance focus.");
  });

  it("5. Upserts platform variant with character count calculation", async () => {
    if (!probe.isAvailable) return;

    const list = await listContentItems(testUserId);
    const target = list.items[0];

    const updatedVariant = await upsertContentVariant(testUserId, target.id, {
      platform: "twitter",
      body: "Tip 1: Always design for modular boundaries before physical microservices. https://example.com/post",
      threadItems: [
        "Tip 1: Always design for modular boundaries before physical microservices.",
        "Tip 2: Database constraints are your last and most reliable line of defense.",
      ],
      customSettings: {
        threadNumbering: true,
      },
    });

    expect(updatedVariant.platform).toBe("twitter");
    expect(updatedVariant.threadItems.length).toBe(2);
    expect(updatedVariant.charCount).toBeGreaterThan(0);
    expect(updatedVariant.customSettings.threadNumbering).toBe(true);
  });

  it("6. Upserts a new platform variant (Blog article with slug)", async () => {
    if (!probe.isAvailable) return;

    const list = await listContentItems(testUserId);
    const target = list.items[0];

    const blogVariant = await upsertContentVariant(testUserId, target.id, {
      platform: "blog",
      title: "The Architecture Blueprint",
      body: "# The Architecture Blueprint\n\nModular monoliths provide excellent velocity.",
      customSettings: {
        slug: "the-architecture-blueprint",
        metaDescription: "A deep dive into modular architecture.",
      },
    });

    expect(blogVariant.platform).toBe("blog");
    expect(blogVariant.customSettings.slug).toBe("the-architecture-blueprint");

    const refreshed = await getContentItemById(testUserId, target.id);
    expect(refreshed.variants?.length).toBe(3);
  });

  it("7. Deletes a specific variant", async () => {
    if (!probe.isAvailable) return;

    const list = await listContentItems(testUserId);
    const target = list.items[0];
    const fullTarget = await getContentItemById(testUserId, target.id);
    const blogVar = fullTarget.variants?.find((v) => v.platform === "blog");
    expect(blogVar).toBeDefined();

    await deleteContentVariant(testUserId, target.id, blogVar!.id);

    const refreshed = await getContentItemById(testUserId, target.id);
    expect(refreshed.variants?.find((v) => v.platform === "blog")).toBeUndefined();
  });

  it("8. Workflow transition: idea -> draft -> in_review -> scheduled -> published", async () => {
    if (!probe.isAvailable) return;

    const list = await listContentItems(testUserId);
    const target = list.items[0];

    // Transition idea -> draft
    const draftItem = await transitionContentStatus(testUserId, target.id, "draft");
    expect(draftItem.status).toBe("draft");

    // Transition draft -> in_review
    const reviewItem = await transitionContentStatus(testUserId, target.id, "in_review");
    expect(reviewItem.status).toBe("in_review");

    // Transition in_review -> scheduled (fails if scheduledAt is missing)
    await expect(
      transitionContentStatus(testUserId, target.id, "scheduled")
    ).rejects.toThrow(InvariantViolationError);

    // Transition in_review -> scheduled (succeeds with scheduledAt)
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const scheduledItem = await transitionContentStatus(testUserId, target.id, "scheduled", {
      scheduledAt: futureDate,
    });
    expect(scheduledItem.status).toBe("scheduled");
    expect(scheduledItem.scheduledAt).toBeDefined();

    // Transition scheduled -> published (stamps publishedAt)
    const publishedItem = await transitionContentStatus(testUserId, target.id, "published");
    expect(publishedItem.status).toBe("published");
    expect(publishedItem.publishedAt).toBeDefined();
  });

  it("9. Rejects invalid workflow transitions (e.g. idea directly to published)", async () => {
    if (!probe.isAvailable) return;

    const freshItem = await createContentItem(testUserId, {
      title: "Fresh Idea For Invalid Transition",
    });

    await expect(
      transitionContentStatus(testUserId, freshItem.id, "published")
    ).rejects.toThrow(InvariantViolationError);
  });

  it("10. Soft archives content item by default (isArchived = true, status = 'archived')", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Item to Soft Archive",
    });

    await deleteContentItem(testUserId, item.id, false);

    // List active items should not include archived item
    const activeList = await listContentItems(testUserId, { isArchived: false });
    expect(activeList.items.some((i) => i.id === item.id)).toBe(false);

    // List archived items should include archived item
    const archivedList = await listContentItems(testUserId, { isArchived: true });
    expect(archivedList.items.some((i) => i.id === item.id)).toBe(true);

    const fetched = await getContentItemById(testUserId, item.id);
    expect(fetched.isArchived).toBe(true);
    expect(fetched.status).toBe("archived");
  });

  it("11. Hard deletes content item and cascades to variants when hard = true", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Item to Hard Delete",
      targetChannels: ["twitter"],
    });

    await deleteContentItem(testUserId, item.id, true);

    await expect(getContentItemById(testUserId, item.id)).rejects.toThrow(NotFoundError);
  });
});
