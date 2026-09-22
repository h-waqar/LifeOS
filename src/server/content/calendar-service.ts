import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  contentItems,
  contentVariants,
  contentPublications,
  type ContentPublication,
  type ContentItem,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  calendarQuerySchema,
  scheduleContentSchema,
  reschedulePublicationSchema,
  markPublishedSchema,
} from "./validation";
import { NotFoundError, InvariantViolationError } from "./service";
import type {
  ContentPublicationDTO,
  ContentItemDTO,
  ContentPlatform,
  PublicationStatus,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Calendar service cannot be initialized in the browser."
  );
}

function mapPublicationToDTO(
  pub: ContentPublication,
  item?: { title: string; contentType: string }
): ContentPublicationDTO {
  return {
    id: pub.id,
    userId: pub.userId,
    contentItemId: pub.contentItemId,
    variantId: pub.variantId,
    platform: pub.platform as ContentPlatform,
    status: pub.status as PublicationStatus,
    scheduledFor: new Date(pub.scheduledFor).toISOString(),
    publishedAt: pub.publishedAt ? new Date(pub.publishedAt).toISOString() : null,
    postUrl: pub.postUrl,
    externalPostId: pub.externalPostId,
    notes: pub.notes,
    createdAt: new Date(pub.createdAt).toISOString(),
    updatedAt: new Date(pub.updatedAt).toISOString(),
    contentTitle: item?.title,
    contentType: item?.contentType as any,
  };
}

/**
 * Retrieves scheduled and published publications within a date window for the user.
 */
export async function getCalendarItems(
  userId: string,
  params: unknown
): Promise<ContentPublicationDTO[]> {
  if (!userId) throw new AuthorizationError("User ID required");

  const query = calendarQuerySchema.parse(params);

  // Set start of startDate and end of endDate in UTC
  const startTimestamp = new Date(`${query.startDate}T00:00:00.000Z`);
  const endTimestamp = new Date(`${query.endDate}T23:59:59.999Z`);

  const conditions = [
    eq(contentPublications.userId, userId),
    gte(contentPublications.scheduledFor, startTimestamp),
    lte(contentPublications.scheduledFor, endTimestamp),
  ];

  if (query.platform) {
    conditions.push(eq(contentPublications.platform, query.platform));
  }

  const rows = await db
    .select({
      pub: contentPublications,
      itemTitle: contentItems.title,
      itemType: contentItems.contentType,
    })
    .from(contentPublications)
    .innerJoin(
      contentItems,
      and(
        eq(contentPublications.contentItemId, contentItems.id),
        eq(contentPublications.userId, contentItems.userId)
      )
    )
    .where(and(...conditions))
    .orderBy(asc(contentPublications.scheduledFor));

  return rows.map((r) =>
    mapPublicationToDTO(r.pub, {
      title: r.itemTitle,
      contentType: r.itemType,
    })
  );
}

/**
 * Schedules a publication slot for a content item or variant on a specific platform.
 */
export async function schedulePublication(
  userId: string,
  contentItemId: string,
  input: unknown
): Promise<ContentPublicationDTO> {
  if (!userId) throw new AuthorizationError("User ID required");

  const data = scheduleContentSchema.parse(input);

  // Verify content item exists and belongs to user
  const [item] = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.userId, userId), eq(contentItems.id, contentItemId)))
    .limit(1);

  if (!item) {
    throw new NotFoundError(`Content item ${contentItemId} not found.`);
  }

  // If variantId is specified, verify it exists and belongs to this user and item
  if (data.variantId) {
    const [variant] = await db
      .select()
      .from(contentVariants)
      .where(
        and(
          eq(contentVariants.userId, userId),
          eq(contentVariants.id, data.variantId),
          eq(contentVariants.contentItemId, contentItemId)
        )
      )
      .limit(1);

    if (!variant) {
      throw new InvariantViolationError(
        `Variant ${data.variantId} does not belong to content item ${contentItemId}.`
      );
    }
  }

  const scheduledDate = new Date(data.scheduledFor);

  const [createdPub] = await db
    .insert(contentPublications)
    .values({
      userId,
      contentItemId,
      variantId: data.variantId || null,
      platform: data.platform,
      status: "scheduled",
      scheduledFor: scheduledDate,
    })
    .returning();

  // Update content item status to scheduled if not already published
  if (item.status !== "published") {
    await db
      .update(contentItems)
      .set({
        status: "scheduled",
        scheduledAt: scheduledDate,
        updatedAt: new Date(),
      })
      .where(and(eq(contentItems.userId, userId), eq(contentItems.id, contentItemId)));
  }

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.schedule",
    status: "success",
    details: {
      contentItemId,
      publicationId: createdPub.id,
      platform: data.platform,
      scheduledFor: data.scheduledFor,
    },
  });

  return mapPublicationToDTO(createdPub, {
    title: item.title,
    contentType: item.contentType,
  });
}

/**
 * Reschedules an existing publication slot to a new date and time.
 */
export async function reschedulePublication(
  userId: string,
  publicationId: string,
  input: unknown
): Promise<ContentPublicationDTO> {
  if (!userId) throw new AuthorizationError("User ID required");

  const data = reschedulePublicationSchema.parse(input);
  const newDate = new Date(data.scheduledFor);

  const [existing] = await db
    .select({
      pub: contentPublications,
      itemTitle: contentItems.title,
      itemType: contentItems.contentType,
    })
    .from(contentPublications)
    .innerJoin(
      contentItems,
      and(
        eq(contentPublications.contentItemId, contentItems.id),
        eq(contentPublications.userId, contentItems.userId)
      )
    )
    .where(
      and(
        eq(contentPublications.userId, userId),
        eq(contentPublications.id, publicationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Publication ${publicationId} not found.`);
  }

  const [updated] = await db
    .update(contentPublications)
    .set({
      scheduledFor: newDate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contentPublications.userId, userId),
        eq(contentPublications.id, publicationId)
      )
    )
    .returning();

  // Also update parent content item's scheduledAt
  await db
    .update(contentItems)
    .set({
      scheduledAt: newDate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.id, existing.pub.contentItemId)
      )
    );

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.reschedule",
    status: "success",
    details: {
      publicationId,
      oldDate: existing.pub.scheduledFor,
      newDate: data.scheduledFor,
    },
  });

  return mapPublicationToDTO(updated, {
    title: existing.itemTitle,
    contentType: existing.itemType,
  });
}

/**
 * Marks a publication as live/published, capturing live URL, post ID, and publication timestamp.
 */
export async function markAsPublished(
  userId: string,
  publicationId: string,
  input: unknown
): Promise<ContentPublicationDTO> {
  if (!userId) throw new AuthorizationError("User ID required");

  const data = markPublishedSchema.parse(input);
  const publishedDate = data.publishedAt ? new Date(data.publishedAt) : new Date();

  const [existing] = await db
    .select({
      pub: contentPublications,
      itemTitle: contentItems.title,
      itemType: contentItems.contentType,
    })
    .from(contentPublications)
    .innerJoin(
      contentItems,
      and(
        eq(contentPublications.contentItemId, contentItems.id),
        eq(contentPublications.userId, contentItems.userId)
      )
    )
    .where(
      and(
        eq(contentPublications.userId, userId),
        eq(contentPublications.id, publicationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Publication ${publicationId} not found.`);
  }

  const [updated] = await db
    .update(contentPublications)
    .set({
      status: "published",
      publishedAt: publishedDate,
      postUrl: data.postUrl || null,
      externalPostId: data.externalPostId || null,
      notes: data.notes || existing.pub.notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contentPublications.userId, userId),
        eq(contentPublications.id, publicationId)
      )
    )
    .returning();

  // Update parent content item status to published and set publishedAt
  await db
    .update(contentItems)
    .set({
      status: "published",
      publishedAt: publishedDate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.id, existing.pub.contentItemId)
      )
    );

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.published",
    status: "success",
    details: {
      publicationId,
      contentItemId: existing.pub.contentItemId,
      postUrl: data.postUrl,
      publishedAt: publishedDate.toISOString(),
    },
  });

  return mapPublicationToDTO(updated, {
    title: existing.itemTitle,
    contentType: existing.itemType,
  });
}

/**
 * Retrieves drafts and items that are not yet scheduled for publication.
 */
export async function getUnscheduledItems(
  userId: string
): Promise<ContentItemDTO[]> {
  if (!userId) throw new AuthorizationError("User ID required");

  // Select items that are not archived and not published, and have no publication scheduled
  const items = await db
    .select()
    .from(contentItems)
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.isArchived, false),
        sql`${contentItems.status} IN ('idea', 'draft', 'in_review')`
      )
    )
    .orderBy(desc(contentItems.updatedAt));

  return items.map((item) => ({
    id: item.id,
    userId: item.userId,
    title: item.title,
    contentType: item.contentType as any,
    status: item.status as any,
    topic: item.topic,
    targetAudience: item.targetAudience,
    primaryPlatform: item.primaryPlatform as any,
    targetChannels: (item.targetChannels as any) || [],
    tags: (item.tags as string[]) || [],
    summary: item.summary,
    mediaUrls: (item.mediaUrls as string[]) || [],
    scheduledAt: item.scheduledAt ? new Date(item.scheduledAt).toISOString() : null,
    publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
    projectId: item.projectId,
    goalId: item.goalId,
    noteId: item.noteId,
    isArchived: item.isArchived,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
  }));
}
