import { eq, and, sql, desc, ilike, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  contentItems,
  contentVariants,
  projects,
  goals,
  notes,
  type ContentItem,
  type ContentVariant,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  createContentItemSchema,
  updateContentItemSchema,
  contentStatusTransitionSchema,
  upsertContentVariantSchema,
  contentFilterSchema,
  type CreateContentItemSchemaInput,
  type UpdateContentItemSchemaInput,
  type UpsertContentVariantSchemaInput,
} from "./validation";
import {
  validateStatusTransition,
} from "./workflow";
import {
  calculateTweetLength,
  generateSlug,
} from "./platform-validator";
import type {
  ContentItemDTO,
  ContentVariantDTO,
  ContentStatus,
  ContentPlatform,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Content service cannot be initialized in the browser."
  );
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Content item not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvariantViolationError extends Error {
  readonly status = 400;
  readonly code = "INVARIANT_VIOLATION";

  constructor(message: string) {
    super(message);
    this.name = "InvariantViolationError";
  }
}

/**
 * Validates cross-entity ownership to ensure foreign entity belongs to the same user.
 */
async function validateEntityOwnership(
  userId: string,
  entityId: string | null | undefined,
  type: "project" | "goal" | "note"
): Promise<void> {
  if (!entityId) return;

  if (type === "project") {
    const [found] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, entityId), eq(projects.userId, userId)))
      .limit(1);
    if (!found) {
      throw new AuthorizationError(
        `Cross-tenant violation: Project ${entityId} not found or not owned by user.`
      );
    }
  } else if (type === "goal") {
    const [found] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.id, entityId), eq(goals.userId, userId)))
      .limit(1);
    if (!found) {
      throw new AuthorizationError(
        `Cross-tenant violation: Goal ${entityId} not found or not owned by user.`
      );
    }
  } else if (type === "note") {
    const [found] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, entityId), eq(notes.userId, userId)))
      .limit(1);
    if (!found) {
      throw new AuthorizationError(
        `Cross-tenant violation: Note ${entityId} not found or not owned by user.`
      );
    }
  }
}

function mapVariantToDTO(v: ContentVariant): ContentVariantDTO {
  return {
    id: v.id,
    userId: v.userId,
    contentItemId: v.contentItemId,
    platform: v.platform as ContentPlatform,
    title: v.title,
    body: v.body,
    threadItems: (v.threadItems as string[]) || [],
    charCount: v.charCount,
    status: v.status as any,
    customSettings: (v.customSettings as any) || {},
    createdAt: new Date(v.createdAt).toISOString(),
    updatedAt: new Date(v.updatedAt).toISOString(),
  };
}

function mapItemToDTO(
  item: ContentItem,
  variants?: ContentVariant[],
  meta?: { projectName?: string | null; goalTitle?: string | null; noteTitle?: string | null; variantsCount?: number }
): ContentItemDTO {
  return {
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
    variantsCount: meta?.variantsCount ?? (variants ? variants.length : undefined),
    variants: variants ? variants.map(mapVariantToDTO) : undefined,
    projectName: meta?.projectName ?? null,
    goalTitle: meta?.goalTitle ?? null,
    noteTitle: meta?.noteTitle ?? null,
  };
}

/**
 * List content items for authenticated user with flexible filtering and search.
 */
export async function listContentItems(
  userId: string,
  params?: unknown
): Promise<{ items: ContentItemDTO[]; total: number }> {
  if (!userId) throw new AuthorizationError("User ID required");

  const filters = contentFilterSchema.parse(params ?? {});

  const conditions = [
    eq(contentItems.userId, userId),
    eq(contentItems.isArchived, filters.isArchived),
  ];

  if (filters.status) {
    conditions.push(eq(contentItems.status, filters.status as any));
  }

  if (filters.contentType) {
    conditions.push(eq(contentItems.contentType, filters.contentType as any));
  }

  if (filters.platform) {
    // Check if primaryPlatform matches OR targetChannels contains platform
    conditions.push(
      or(
        eq(contentItems.primaryPlatform, filters.platform),
        sql`${contentItems.targetChannels} @> ${JSON.stringify([filters.platform])}::jsonb`
      )!
    );
  }

  if (filters.topic) {
    conditions.push(ilike(contentItems.topic, `%${filters.topic}%`));
  }

  if (filters.tag) {
    conditions.push(
      sql`${contentItems.tags} @> ${JSON.stringify([filters.tag])}::jsonb`
    );
  }

  if (filters.projectId) {
    conditions.push(eq(contentItems.projectId, filters.projectId));
  }

  if (filters.goalId) {
    conditions.push(eq(contentItems.goalId, filters.goalId));
  }

  if (filters.search) {
    const searchPattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(contentItems.title, searchPattern),
        ilike(contentItems.topic, searchPattern),
        ilike(contentItems.summary, searchPattern)
      )!
    );
  }

  const whereClause = and(...conditions);

  // Count total matching items
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  // Retrieve paginated items joined with project/goal/note metadata
  const rows = await db
    .select({
      item: contentItems,
      projectName: projects.name,
      goalTitle: goals.title,
      noteTitle: notes.title,
      variantsCount: sql<number>`(
        SELECT count(*)::int FROM content_variants cv
        WHERE cv.user_id = ${contentItems.userId} AND cv.content_item_id = ${contentItems.id}
      )`,
    })
    .from(contentItems)
    .leftJoin(
      projects,
      and(
        eq(contentItems.projectId, projects.id),
        eq(contentItems.userId, projects.userId)
      )
    )
    .leftJoin(
      goals,
      and(
        eq(contentItems.goalId, goals.id),
        eq(contentItems.userId, goals.userId)
      )
    )
    .leftJoin(
      notes,
      and(
        eq(contentItems.noteId, notes.id),
        eq(contentItems.userId, notes.userId)
      )
    )
    .where(whereClause)
    .orderBy(desc(contentItems.updatedAt))
    .limit(filters.limit)
    .offset(filters.offset);

  const items: ContentItemDTO[] = rows.map((r) =>
    mapItemToDTO(r.item, undefined, {
      projectName: r.projectName,
      goalTitle: r.goalTitle,
      noteTitle: r.noteTitle,
      variantsCount: r.variantsCount,
    })
  );

  return { items, total };
}

/**
 * Retrieves a single content item with all its platform variants.
 */
export async function getContentItemById(
  userId: string,
  contentItemId: string
): Promise<ContentItemDTO> {
  if (!userId || !contentItemId) {
    throw new AuthorizationError("User ID and Content Item ID required");
  }

  const [row] = await db
    .select({
      item: contentItems,
      projectName: projects.name,
      goalTitle: goals.title,
      noteTitle: notes.title,
    })
    .from(contentItems)
    .leftJoin(
      projects,
      and(
        eq(contentItems.projectId, projects.id),
        eq(contentItems.userId, projects.userId)
      )
    )
    .leftJoin(
      goals,
      and(
        eq(contentItems.goalId, goals.id),
        eq(contentItems.userId, goals.userId)
      )
    )
    .leftJoin(
      notes,
      and(
        eq(contentItems.noteId, notes.id),
        eq(contentItems.userId, notes.userId)
      )
    )
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.id, contentItemId)
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Content item not found: ${contentItemId}`);
  }

  const variants = await db
    .select()
    .from(contentVariants)
    .where(
      and(
        eq(contentVariants.userId, userId),
        eq(contentVariants.contentItemId, contentItemId)
      )
    )
    .orderBy(contentVariants.createdAt);

  return mapItemToDTO(row.item, variants, {
    projectName: row.projectName,
    goalTitle: row.goalTitle,
    noteTitle: row.noteTitle,
  });
}

/**
 * Creates a new content item and optional default platform variants.
 */
export async function createContentItem(
  userId: string,
  input: unknown
): Promise<ContentItemDTO> {
  if (!userId) throw new AuthorizationError("User ID required");

  const validated = createContentItemSchema.parse(input);

  // Validate cross-entity ownership
  await validateEntityOwnership(userId, validated.projectId, "project");
  await validateEntityOwnership(userId, validated.goalId, "goal");
  await validateEntityOwnership(userId, validated.noteId, "note");

  const [created] = await db
    .insert(contentItems)
    .values({
      userId,
      title: validated.title,
      contentType: validated.contentType,
      status: validated.status,
      topic: validated.topic ?? null,
      targetAudience: validated.targetAudience ?? null,
      primaryPlatform: validated.primaryPlatform ?? null,
      targetChannels: validated.targetChannels,
      tags: validated.tags,
      summary: validated.summary ?? null,
      mediaUrls: validated.mediaUrls,
      scheduledAt: validated.scheduledAt ? new Date(validated.scheduledAt) : null,
      publishedAt: validated.publishedAt ? new Date(validated.publishedAt) : null,
      projectId: validated.projectId ?? null,
      goalId: validated.goalId ?? null,
      noteId: validated.noteId ?? null,
    })
    .returning();

  // If target channels specified, generate initial blank variant drafts
  if (validated.targetChannels && validated.targetChannels.length > 0) {
    for (const channel of validated.targetChannels) {
      await db
        .insert(contentVariants)
        .values({
          userId,
          contentItemId: created.id,
          platform: channel,
          title: created.title,
          body: "",
          threadItems: [],
          charCount: 0,
          status: "draft",
          customSettings:
            channel === "blog"
              ? { slug: generateSlug(created.title) }
              : {},
        })
        .onConflictDoNothing();
    }
  }

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.create",
    status: "success",
    details: { contentItemId: created.id, title: created.title },
  });

  return getContentItemById(userId, created.id);
}

/**
 * Updates an existing content item.
 */
export async function updateContentItem(
  userId: string,
  contentItemId: string,
  input: unknown
): Promise<ContentItemDTO> {
  if (!userId || !contentItemId) {
    throw new AuthorizationError("User ID and Content Item ID required");
  }

  const validated = updateContentItemSchema.parse(input);

  const existing = await getContentItemById(userId, contentItemId);

  // Validate cross-entity ownership if entity linkages changed
  if (validated.projectId !== undefined) {
    await validateEntityOwnership(userId, validated.projectId, "project");
  }
  if (validated.goalId !== undefined) {
    await validateEntityOwnership(userId, validated.goalId, "goal");
  }
  if (validated.noteId !== undefined) {
    await validateEntityOwnership(userId, validated.noteId, "note");
  }

  // If status change is requested as part of update, validate transition
  let statusUpdate: any = {};
  if (validated.status && validated.status !== existing.status) {
    const transitionCheck = validateStatusTransition(
      {
        status: existing.status,
        scheduledAt: existing.scheduledAt,
        publishedAt: existing.publishedAt,
      },
      validated.status,
      {
        scheduledAt: validated.scheduledAt ?? existing.scheduledAt,
        publishedAt: validated.publishedAt ?? existing.publishedAt,
        variantsCount: existing.variants?.length ?? 0,
      }
    );

    if (!transitionCheck.valid) {
      throw new InvariantViolationError(
        transitionCheck.error || "Invalid status transition"
      );
    }
    statusUpdate = transitionCheck.updateFields;
  }

  const updatePayload: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (validated.title !== undefined) updatePayload.title = validated.title;
  if (validated.contentType !== undefined) updatePayload.contentType = validated.contentType;
  if (validated.topic !== undefined) updatePayload.topic = validated.topic;
  if (validated.targetAudience !== undefined) updatePayload.targetAudience = validated.targetAudience;
  if (validated.primaryPlatform !== undefined) updatePayload.primaryPlatform = validated.primaryPlatform;
  if (validated.targetChannels !== undefined) updatePayload.targetChannels = validated.targetChannels;
  if (validated.tags !== undefined) updatePayload.tags = validated.tags;
  if (validated.summary !== undefined) updatePayload.summary = validated.summary;
  if (validated.mediaUrls !== undefined) updatePayload.mediaUrls = validated.mediaUrls;
  if (validated.scheduledAt !== undefined) {
    updatePayload.scheduledAt = validated.scheduledAt ? new Date(validated.scheduledAt) : null;
  }
  if (validated.publishedAt !== undefined) {
    updatePayload.publishedAt = validated.publishedAt ? new Date(validated.publishedAt) : null;
  }
  if (validated.projectId !== undefined) updatePayload.projectId = validated.projectId;
  if (validated.goalId !== undefined) updatePayload.goalId = validated.goalId;
  if (validated.noteId !== undefined) updatePayload.noteId = validated.noteId;
  if (validated.isArchived !== undefined) updatePayload.isArchived = validated.isArchived;

  // Apply state machine updates if status changed
  if (statusUpdate.status) {
    updatePayload.status = statusUpdate.status;
    if (statusUpdate.scheduledAt !== undefined) updatePayload.scheduledAt = statusUpdate.scheduledAt;
    if (statusUpdate.publishedAt !== undefined) updatePayload.publishedAt = statusUpdate.publishedAt;
    if (statusUpdate.isArchived !== undefined) updatePayload.isArchived = statusUpdate.isArchived;
  }

  await db
    .update(contentItems)
    .set(updatePayload)
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.id, contentItemId)
      )
    );

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.update",
    status: "success",
    details: { contentItemId, fields: Object.keys(updatePayload) },
  });

  return getContentItemById(userId, contentItemId);
}

/**
 * Transitions workflow status with strict state machine validation.
 */
export async function transitionContentStatus(
  userId: string,
  contentItemId: string,
  targetStatus: ContentStatus,
  metadata?: { scheduledAt?: string | null; publishedAt?: string | null }
): Promise<ContentItemDTO> {
  const item = await getContentItemById(userId, contentItemId);

  const transitionCheck = validateStatusTransition(
    {
      status: item.status,
      scheduledAt: item.scheduledAt,
      publishedAt: item.publishedAt,
    },
    targetStatus,
    {
      scheduledAt: metadata?.scheduledAt ?? item.scheduledAt,
      publishedAt: metadata?.publishedAt ?? item.publishedAt,
      variantsCount: item.variants?.length ?? 0,
    }
  );

  if (!transitionCheck.valid) {
    throw new InvariantViolationError(
      transitionCheck.error || `Cannot transition to status '${targetStatus}'.`
    );
  }

  const { updateFields } = transitionCheck;

  await db
    .update(contentItems)
    .set({
      status: updateFields!.status,
      scheduledAt: updateFields!.scheduledAt,
      publishedAt: updateFields!.publishedAt,
      isArchived: updateFields!.isArchived,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.id, contentItemId)
      )
    );

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.status_transition",
    status: "success",
    details: {
      contentItemId,
      previousStatus: item.status,
      newStatus: targetStatus,
    },
  });

  return getContentItemById(userId, contentItemId);
}

/**
 * Soft archives or hard deletes a content item.
 */
export async function deleteContentItem(
  userId: string,
  contentItemId: string,
  hardDelete = false
): Promise<{ success: boolean; hardDeleted: boolean }> {
  const existing = await getContentItemById(userId, contentItemId);

  if (hardDelete) {
    await db
      .delete(contentItems)
      .where(
        and(
          eq(contentItems.userId, userId),
          eq(contentItems.id, contentItemId)
        )
      );

    await createAuditLog({
      userId,
      category: "mutation",
      action: "content.delete",
      status: "success",
      details: { contentItemId, hardDelete: true },
    });

    return { success: true, hardDeleted: true };
  } else {
    await db
      .update(contentItems)
      .set({
        isArchived: true,
        status: "archived",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contentItems.userId, userId),
          eq(contentItems.id, contentItemId)
        )
      );

    await createAuditLog({
      userId,
      category: "mutation",
      action: "content.archive",
      status: "success",
      details: { contentItemId, hardDelete: false },
    });

    return { success: true, hardDeleted: false };
  }
}

/**
 * Upserts a platform variant (Twitter thread, LinkedIn post, Blog markdown, etc.).
 */
export async function upsertContentVariant(
  userId: string,
  contentItemId: string,
  input: unknown
): Promise<ContentVariantDTO> {
  const item = await getContentItemById(userId, contentItemId);

  const validated = upsertContentVariantSchema.parse(input);

  // Compute character count
  let charCount = 0;
  if (validated.platform === "twitter") {
    if (validated.threadItems && validated.threadItems.length > 0) {
      charCount = validated.threadItems.reduce(
        (acc, tweet) => acc + calculateTweetLength(tweet),
        0
      );
    } else {
      charCount = calculateTweetLength(validated.body);
    }
  } else {
    charCount = Array.from(validated.body || "").length;
  }

  // Blog slug handling
  const customSettings: any = { ...(validated.customSettings || {}) };
  if (validated.platform === "blog" && !customSettings.slug) {
    customSettings.slug = generateSlug(validated.title || item.title);
  }

  // Check if variant already exists for (userId, contentItemId, platform)
  const [existingVariant] = await db
    .select()
    .from(contentVariants)
    .where(
      and(
        eq(contentVariants.userId, userId),
        eq(contentVariants.contentItemId, contentItemId),
        eq(contentVariants.platform, validated.platform)
      )
    )
    .limit(1);

  let variantRow: ContentVariant;

  if (existingVariant) {
    const [updated] = await db
      .update(contentVariants)
      .set({
        title: validated.title ?? existingVariant.title,
        body: validated.body,
        threadItems: validated.threadItems,
        charCount,
        status: validated.status,
        customSettings,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contentVariants.userId, userId),
          eq(contentVariants.id, existingVariant.id)
        )
      )
      .returning();
    variantRow = updated;
  } else {
    const [inserted] = await db
      .insert(contentVariants)
      .values({
        userId,
        contentItemId,
        platform: validated.platform,
        title: validated.title ?? item.title,
        body: validated.body,
        threadItems: validated.threadItems,
        charCount,
        status: validated.status,
        customSettings,
      })
      .returning();
    variantRow = inserted;
  }

  // Touch parent content item updatedAt
  await db
    .update(contentItems)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(contentItems.userId, userId),
        eq(contentItems.id, contentItemId)
      )
    );

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.variant_upsert",
    status: "success",
    details: {
      contentItemId,
      variantId: variantRow.id,
      platform: validated.platform,
    },
  });

  return mapVariantToDTO(variantRow);
}

/**
 * Deletes a platform variant.
 */
export async function deleteContentVariant(
  userId: string,
  contentItemId: string,
  variantId: string
): Promise<{ success: boolean }> {
  // Verify content item ownership
  await getContentItemById(userId, contentItemId);

  const [deleted] = await db
    .delete(contentVariants)
    .where(
      and(
        eq(contentVariants.userId, userId),
        eq(contentVariants.contentItemId, contentItemId),
        eq(contentVariants.id, variantId)
      )
    )
    .returning();

  if (!deleted) {
    throw new NotFoundError(
      `Variant not found with ID ${variantId} on content item ${contentItemId}.`
    );
  }

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.variant_delete",
    status: "success",
    details: { contentItemId, variantId, platform: deleted.platform },
  });

  return { success: true };
}
