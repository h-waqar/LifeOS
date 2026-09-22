import { eq, and, sql, desc, asc, ilike, or, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  learningItems,
  notes,
  goals,
  projects,
  type LearningItem,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  createLearningItemSchema,
  updateLearningItemSchema,
  listLearningItemsQuerySchema,
  type CreateLearningItemInputSchema,
  type UpdateLearningItemInputSchema,
  type ListLearningItemsQueryParams,
} from "./validation";
import type {
  LearningItemDTO,
  LearningItemDetailDTO,
  LearningStatsDTO,
  LearningType,
  LearningStatus,
  NoteDTO,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Learning service cannot be initialized in the browser."
  );
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Learning item not found") {
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

function mapLearningItemToDTO(
  item: LearningItem,
  options?: {
    linkedNotesCount?: number;
    goalTitle?: string | null;
    projectName?: string | null;
  }
): LearningItemDTO {
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    type: item.type as LearningType,
    status: item.status as LearningStatus,
    author: item.author ?? null,
    url: item.url ?? null,
    rating: item.rating ?? null,
    progress: item.progress,
    currentUnits: item.currentUnits ?? 0,
    totalUnits: item.totalUnits ?? null,
    unitType: item.unitType ?? null,
    summary: item.summary ?? null,
    keyTakeaways: Array.isArray(item.keyTakeaways)
      ? (item.keyTakeaways as string[])
      : [],
    tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
    goalId: item.goalId ?? null,
    projectId: item.projectId ?? null,
    goalTitle: options?.goalTitle ?? null,
    projectName: options?.projectName ?? null,
    isArchived: item.isArchived,
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    linkedNotesCount: options?.linkedNotesCount ?? 0,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapNoteToDTO(note: any): NoteDTO {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    slug: note.slug,
    content: note.content,
    noteType: note.noteType,
    area: note.area,
    tags: Array.isArray(note.tags) ? note.tags : [],
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    projectId: note.projectId ?? null,
    goalId: note.goalId ?? null,
    taskId: note.taskId ?? null,
    personId: note.personId ?? null,
    learningId: note.learningId ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Validate that linked entities (goal, project) exist and are owned by the authenticated user.
 */
async function validateEntityOwnership(
  userId: string,
  entities: {
    goalId?: string | null;
    projectId?: string | null;
  }
) {
  if (entities.goalId) {
    const [g] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.id, entities.goalId)))
      .limit(1);
    if (!g) {
      throw new InvariantViolationError("Linked goal not found or access denied.");
    }
  }

  if (entities.projectId) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, entities.projectId)))
      .limit(1);
    if (!p) {
      throw new InvariantViolationError("Linked project not found or access denied.");
    }
  }
}

/**
 * Create a new Learning Item.
 */
export async function createLearningItem(
  userId: string,
  input: unknown
): Promise<LearningItemDTO> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required.");
  }

  const validated: CreateLearningItemInputSchema = createLearningItemSchema.parse(input);
  await validateEntityOwnership(userId, validated);

  // Calculate progress from units if totalUnits > 0 and progress not explicitly supplied
  let progress = validated.progress ?? 0;
  if (
    validated.totalUnits !== undefined &&
    validated.totalUnits !== null &&
    validated.totalUnits > 0 &&
    input &&
    typeof input === "object" &&
    !("progress" in input)
  ) {
    const current = validated.currentUnits ?? 0;
    progress = Math.min(100, Math.max(0, Math.round((current / validated.totalUnits) * 100)));
  }

  // Determine status and completedAt invariants
  let status: LearningStatus = (validated.status as LearningStatus) || "not_started";
  let completedAt: Date | null = null;

  if (progress === 100) {
    if (!input || typeof input !== "object" || !("status" in input)) {
      status = "completed";
    }
  }

  if (status === "completed") {
    progress = 100;
    completedAt = new Date();
  } else if (progress > 0 && status === "not_started" && (!input || !("status" in (input as any)))) {
    status = "in_progress";
  }

  const [created] = await db
    .insert(learningItems)
    .values({
      userId,
      title: validated.title,
      type: validated.type,
      status,
      author: validated.author ?? null,
      url: validated.url ?? null,
      rating: validated.rating ?? null,
      progress,
      currentUnits: validated.currentUnits ?? 0,
      totalUnits: validated.totalUnits ?? null,
      unitType: validated.unitType ?? null,
      summary: validated.summary ?? null,
      keyTakeaways: validated.keyTakeaways ?? [],
      tags: validated.tags ?? [],
      goalId: validated.goalId ?? null,
      projectId: validated.projectId ?? null,
      isArchived: false,
      completedAt,
    })
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "learning_item.create",
    status: "success",
    details: {
      learningItemId: created.id,
      title: created.title,
      type: created.type,
      status: created.status,
    },
  });

  return mapLearningItemToDTO(created, { linkedNotesCount: 0 });
}

/**
 * Get a Learning Item by ID with linked notes and relation titles.
 */
export async function getLearningItemById(
  userId: string,
  id: string
): Promise<LearningItemDetailDTO> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required.");
  }

  const [item] = await db
    .select()
    .from(learningItems)
    .where(and(eq(learningItems.userId, userId), eq(learningItems.id, id)))
    .limit(1);

  if (!item) {
    throw new NotFoundError(`Learning item with id "${id}" not found.`);
  }

  // Fetch linked notes
  const linkedNotesRows = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.learningId, id),
        eq(notes.isArchived, false)
      )
    )
    .orderBy(desc(notes.updatedAt));

  // Fetch linked goal title if present
  let goalTitle: string | null = null;
  if (item.goalId) {
    const [g] = await db
      .select({ title: goals.title })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.id, item.goalId)))
      .limit(1);
    goalTitle = g?.title ?? null;
  }

  // Fetch linked project name if present
  let projectName: string | null = null;
  if (item.projectId) {
    const [p] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, item.projectId)))
      .limit(1);
    projectName = p?.name ?? null;
  }

  const baseDTO = mapLearningItemToDTO(item, {
    linkedNotesCount: linkedNotesRows.length,
    goalTitle,
    projectName,
  });

  return {
    ...baseDTO,
    linkedNotes: linkedNotesRows.map((n) => mapNoteToDTO(n)),
  };
}

/**
 * List Learning Items with filtering, search, and pagination.
 */
export async function listLearningItems(
  userId: string,
  params?: unknown
): Promise<{ items: LearningItemDTO[]; total: number }> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required.");
  }

  const query: ListLearningItemsQueryParams = listLearningItemsQuerySchema.parse(
    params ?? {}
  );

  const conditions = [eq(learningItems.userId, userId)];

  if (query.type) {
    conditions.push(eq(learningItems.type, query.type));
  }
  if (query.status) {
    conditions.push(eq(learningItems.status, query.status));
  }
  if (query.goalId) {
    conditions.push(eq(learningItems.goalId, query.goalId));
  }
  if (query.projectId) {
    conditions.push(eq(learningItems.projectId, query.projectId));
  }
  if (query.isArchived !== undefined) {
    conditions.push(eq(learningItems.isArchived, query.isArchived));
  } else {
    conditions.push(eq(learningItems.isArchived, false));
  }
  if (query.tag) {
    conditions.push(
      sql`${learningItems.tags} @> ${JSON.stringify([query.tag])}::jsonb`
    );
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(learningItems.title, pattern),
        ilike(coalesceText(learningItems.author), pattern),
        ilike(coalesceText(learningItems.summary), pattern)
      )!
    );
  }

  const whereClause = and(...conditions);

  const [totalRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(learningItems)
    .where(whereClause);

  const total = totalRes?.count ?? 0;

  // Sorting
  const sortDirection = query.sortOrder === "asc" ? asc : desc;
  let sortColumn;
  switch (query.sortBy) {
    case "title":
      sortColumn = learningItems.title;
      break;
    case "progress":
      sortColumn = learningItems.progress;
      break;
    case "rating":
      sortColumn = learningItems.rating;
      break;
    case "createdAt":
      sortColumn = learningItems.createdAt;
      break;
    case "updatedAt":
    default:
      sortColumn = learningItems.updatedAt;
      break;
  }

  const rows = await db
    .select()
    .from(learningItems)
    .where(whereClause)
    .orderBy(sortDirection(sortColumn))
    .limit(query.limit)
    .offset(query.offset);

  // Fetch note counts for these items
  const itemIds = rows.map((r) => r.id);
  const noteCountsMap = new Map<string, number>();

  if (itemIds.length > 0) {
    const counts = await db
      .select({
        learningId: notes.learningId,
        count: sql<number>`count(*)::int`,
      })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          inArray(notes.learningId, itemIds),
          eq(notes.isArchived, false)
        )
      )
      .groupBy(notes.learningId);

    for (const c of counts) {
      if (c.learningId) {
        noteCountsMap.set(c.learningId, c.count);
      }
    }
  }

  return {
    items: rows.map((r) =>
      mapLearningItemToDTO(r, {
        linkedNotesCount: noteCountsMap.get(r.id) ?? 0,
      })
    ),
    total,
  };
}

function coalesceText(col: any) {
  return sql`coalesce(${col}, '')`;
}

/**
 * Update an existing Learning Item.
 */
export async function updateLearningItem(
  userId: string,
  id: string,
  input: unknown
): Promise<LearningItemDTO> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(learningItems)
    .where(and(eq(learningItems.userId, userId), eq(learningItems.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Learning item with id "${id}" not found.`);
  }

  const validated: UpdateLearningItemInputSchema = updateLearningItemSchema.parse(input);
  await validateEntityOwnership(userId, validated);

  // Determine current/total units
  const currentUnits =
    validated.currentUnits !== undefined
      ? validated.currentUnits
      : existing.currentUnits;
  const totalUnits =
    validated.totalUnits !== undefined
      ? validated.totalUnits
      : existing.totalUnits;

  // Calculate next progress
  let nextProgress = existing.progress;
  if (validated.progress !== undefined) {
    nextProgress = validated.progress;
  } else if (
    totalUnits !== null &&
    totalUnits !== undefined &&
    totalUnits > 0 &&
    (validated.currentUnits !== undefined || validated.totalUnits !== undefined)
  ) {
    const cur = currentUnits ?? 0;
    nextProgress = Math.min(100, Math.max(0, Math.round((cur / totalUnits) * 100)));
  }

  // Determine status and completedAt invariants
  let nextStatus: LearningStatus = (validated.status as LearningStatus) ?? (existing.status as LearningStatus);
  let nextCompletedAt: Date | null = existing.completedAt;

  if (validated.status !== undefined) {
    if (validated.status === "completed") {
      nextStatus = "completed";
      nextProgress = 100;
      nextCompletedAt = validated.completedAt
        ? new Date(validated.completedAt)
        : (existing.completedAt ?? new Date());
    } else {
      nextStatus = validated.status as LearningStatus;
      if (existing.status === "completed") {
        nextCompletedAt = null;
      }
    }
  } else if (nextProgress === 100 && existing.status !== "completed") {
    nextStatus = "completed";
    nextCompletedAt = new Date();
  } else if (nextProgress > 0 && nextProgress < 100 && existing.status === "not_started") {
    nextStatus = "in_progress";
  }

  if (validated.completedAt !== undefined) {
    nextCompletedAt = validated.completedAt ? new Date(validated.completedAt) : null;
  }

  const [updated] = await db
    .update(learningItems)
    .set({
      title: validated.title ?? existing.title,
      type: validated.type ?? existing.type,
      status: nextStatus,
      author: validated.author !== undefined ? validated.author : existing.author,
      url: validated.url !== undefined ? validated.url : existing.url,
      rating: validated.rating !== undefined ? validated.rating : existing.rating,
      progress: nextProgress,
      currentUnits: currentUnits ?? 0,
      totalUnits: totalUnits ?? null,
      unitType:
        validated.unitType !== undefined ? validated.unitType : existing.unitType,
      summary:
        validated.summary !== undefined ? validated.summary : existing.summary,
      keyTakeaways:
        validated.keyTakeaways !== undefined
          ? validated.keyTakeaways
          : existing.keyTakeaways,
      tags: validated.tags !== undefined ? validated.tags : existing.tags,
      goalId:
        validated.goalId !== undefined ? validated.goalId : existing.goalId,
      projectId:
        validated.projectId !== undefined
          ? validated.projectId
          : existing.projectId,
      isArchived:
        validated.isArchived !== undefined
          ? validated.isArchived
          : existing.isArchived,
      completedAt: nextCompletedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(learningItems.userId, userId), eq(learningItems.id, id)))
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "learning_item.update",
    status: "success",
    details: {
      learningItemId: updated.id,
      title: updated.title,
      status: updated.status,
      progress: updated.progress,
      isArchived: updated.isArchived,
    },
  });

  return mapLearningItemToDTO(updated);
}

/**
 * Archive a Learning Item (soft-delete).
 */
export async function archiveLearningItem(
  userId: string,
  id: string
): Promise<LearningItemDTO> {
  return updateLearningItem(userId, id, { isArchived: true });
}

/**
 * Restore an archived Learning Item.
 */
export async function restoreLearningItem(
  userId: string,
  id: string
): Promise<LearningItemDTO> {
  return updateLearningItem(userId, id, { isArchived: false });
}

/**
 * Delete a Learning Item (defaults to soft-archive, or permanent hard-delete).
 */
export async function deleteLearningItem(
  userId: string,
  id: string,
  options?: { hard?: boolean }
): Promise<{ success: boolean; message: string }> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(learningItems)
    .where(and(eq(learningItems.userId, userId), eq(learningItems.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Learning item with id "${id}" not found.`);
  }

  if (options?.hard) {
    await db.transaction(async (tx) => {
      // Nullify references in notes
      await tx
        .update(notes)
        .set({ learningId: null })
        .where(
          and(eq(notes.userId, userId), eq(notes.learningId, id))
        );

      // Delete the learning item record
      await tx
        .delete(learningItems)
        .where(and(eq(learningItems.userId, userId), eq(learningItems.id, id)));
    });

    await createAuditLog({
      userId,
      category: "mutation",
      action: "learning_item.delete",
      status: "success",
      details: {
        learningItemId: id,
        title: existing.title,
        hard: true,
      },
    });

    return { success: true, message: "Learning item permanently deleted" };
  }

  // Soft archive
  await archiveLearningItem(userId, id);
  return { success: true, message: "Learning item archived" };
}

/**
 * Fetch all notes linked to a specific learning item.
 */
export async function getLearningItemNotes(
  userId: string,
  learningItemId: string
): Promise<NoteDTO[]> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required.");
  }

  // Verify learning item exists and is owned by user
  const [item] = await db
    .select({ id: learningItems.id })
    .from(learningItems)
    .where(
      and(
        eq(learningItems.userId, userId),
        eq(learningItems.id, learningItemId)
      )
    )
    .limit(1);

  if (!item) {
    throw new NotFoundError(
      `Learning item with id "${learningItemId}" not found.`
    );
  }

  const rows = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.learningId, learningItemId),
        eq(notes.isArchived, false)
      )
    )
    .orderBy(desc(notes.updatedAt));

  return rows.map((n) => mapNoteToDTO(n));
}

/**
 * Get aggregate learning statistics for dashboard.
 */
export async function getLearningStats(userId: string): Promise<LearningStatsDTO> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required.");
  }

  const rows = await db
    .select({
      type: learningItems.type,
      status: learningItems.status,
      progress: learningItems.progress,
      isArchived: learningItems.isArchived,
    })
    .from(learningItems)
    .where(and(eq(learningItems.userId, userId), eq(learningItems.isArchived, false)));

  let totalItems = rows.length;
  let activeCount = 0;
  let completedCount = 0;
  let totalActiveProgress = 0;

  const byType: Record<LearningType, number> = {
    book: 0,
    course: 0,
    article: 0,
    podcast: 0,
    skill: 0,
    documentation: 0,
    other: 0,
  };

  for (const r of rows) {
    const t = r.type as LearningType;
    if (byType[t] !== undefined) {
      byType[t]++;
    }

    if (r.status === "in_progress") {
      activeCount++;
      totalActiveProgress += r.progress;
    } else if (r.status === "completed") {
      completedCount++;
    }
  }

  const averageProgress =
    activeCount > 0 ? Math.round(totalActiveProgress / activeCount) : 0;

  return {
    totalItems,
    activeCount,
    completedCount,
    averageProgress,
    byType,
  };
}
