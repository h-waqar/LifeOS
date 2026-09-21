import { eq, and, sql, desc, ilike, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  notes,
  noteLinks,
  projects,
  goals,
  tasks,
  type Note,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  createNoteSchema,
  updateNoteSchema,
  listNotesQuerySchema,
  type CreateNoteSchemaInput,
  type UpdateNoteSchemaInput,
  type ListNotesQueryParams,
} from "./validation";
import {
  parseWikilinks,
  slugifyTitle,
  extractSnippet,
  type ExtractedWikilink,
} from "./wikilinks";
import type {
  NoteDTO,
  NoteLinkDTO,
  BacklinkItemDTO,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Notes service cannot be initialized in the browser."
  );
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Note not found") {
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

function mapNoteToDTO(note: Note, counts?: { outgoing?: number; backlinks?: number }): NoteDTO {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    slug: note.slug,
    content: note.content,
    noteType: note.noteType as NoteDTO["noteType"],
    area: note.area as NoteDTO["area"],
    tags: Array.isArray(note.tags) ? (note.tags as string[]) : [],
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    projectId: note.projectId,
    goalId: note.goalId,
    taskId: note.taskId,
    outgoingLinksCount: counts?.outgoing ?? 0,
    backlinksCount: counts?.backlinks ?? 0,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Generate a unique slug for the user. If collision exists, append -2, -3, etc.
 */
async function generateUniqueSlug(
  userId: string,
  title: string,
  excludeNoteId?: string
): Promise<string> {
  const baseSlug = slugifyTitle(title) || "untitled-note";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.slug, slug)))
      .limit(1);

    if (existing.length === 0 || (excludeNoteId && existing[0].id === excludeNoteId)) {
      return slug;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Validate that linked entities (project, goal, task) exist and are owned by the user.
 */
async function validateEntityOwnership(
  userId: string,
  entities: {
    projectId?: string | null;
    goalId?: string | null;
    taskId?: string | null;
  }
) {
  if (entities.projectId) {
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, entities.projectId)))
      .limit(1);
    if (!proj) {
      throw new InvariantViolationError("Linked project not found or access denied.");
    }
  }

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

  if (entities.taskId) {
    const [t] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, entities.taskId)))
      .limit(1);
    if (!t) {
      throw new InvariantViolationError("Linked task not found or access denied.");
    }
  }
}

/**
 * Sync extracted wikilinks for a note within a database transaction.
 */
async function syncWikilinks(
  tx: any,
  userId: string,
  sourceNoteId: string,
  extractedLinks: ExtractedWikilink[]
) {
  // 1. Delete previous links from this note
  await tx
    .delete(noteLinks)
    .where(and(eq(noteLinks.userId, userId), eq(noteLinks.sourceNoteId, sourceNoteId)));

  if (extractedLinks.length === 0) {
    return;
  }

  // 2. Fetch potential matching notes for this user to resolve target IDs
  const userNotes = await tx
    .select({ id: notes.id, title: notes.title, slug: notes.slug })
    .from(notes)
    .where(eq(notes.userId, userId));

  const noteMapByTitle = new Map<string, string>();
  const noteMapBySlug = new Map<string, string>();

  for (const n of userNotes) {
    noteMapByTitle.set(n.title.toLowerCase().trim(), n.id);
    noteMapBySlug.set(n.slug.toLowerCase().trim(), n.id);
  }

  // 3. Insert new note links
  for (const link of extractedLinks) {
    const normTarget = link.targetTitle.toLowerCase().trim();
    const targetSlug = slugifyTitle(link.targetTitle);

    const resolvedTargetId =
      noteMapByTitle.get(normTarget) || noteMapBySlug.get(targetSlug) || null;

    await tx.insert(noteLinks).values({
      userId,
      sourceNoteId,
      targetNoteId: resolvedTargetId,
      targetTitle: link.targetTitle,
      displayText: link.displayText,
    });
  }
}

/**
 * Backfill any dangling noteLinks targeting this note title.
 */
async function backfillTargetLinks(
  tx: any,
  userId: string,
  noteId: string,
  noteTitle: string
) {
  const normTitle = noteTitle.trim();
  await tx
    .update(noteLinks)
    .set({ targetNoteId: noteId })
    .where(
      and(
        eq(noteLinks.userId, userId),
        sql`LOWER(TRIM(${noteLinks.targetTitle})) = LOWER(TRIM(${normTitle}))`
      )
    );
}

/**
 * Create a new Markdown Note.
 */
export async function createNote(
  userId: string,
  input: unknown
): Promise<NoteDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const validated = createNoteSchema.parse(input);
  await validateEntityOwnership(userId, validated);

  const slug = await generateUniqueSlug(userId, validated.title);
  const extractedLinks = parseWikilinks(validated.content || "");

  const result = await db.transaction(async (tx) => {
    const [newNote] = await tx
      .insert(notes)
      .values({
        userId,
        title: validated.title,
        slug,
        content: validated.content || "",
        noteType: validated.noteType,
        area: validated.area,
        tags: validated.tags,
        isPinned: validated.isPinned,
        isArchived: false,
        projectId: validated.projectId ?? null,
        goalId: validated.goalId ?? null,
        taskId: validated.taskId ?? null,
      })
      .returning();

    await syncWikilinks(tx, userId, newNote.id, extractedLinks);
    await backfillTargetLinks(tx, userId, newNote.id, newNote.title);

    return newNote;
  });

  await createAuditLog({
    userId,
    category: "mutation",
    action: "note.create",
    status: "success",
    details: {
      noteId: result.id,
      title: result.title,
      slug: result.slug,
      noteType: result.noteType,
      area: result.area,
    },
  });

  return mapNoteToDTO(result, {
    outgoing: extractedLinks.length,
    backlinks: 0,
  });
}

/**
 * Update an existing note.
 */
export async function updateNote(
  userId: string,
  id: string,
  input: unknown
): Promise<NoteDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Note with id "${id}" not found.`);
  }

  const validated = updateNoteSchema.parse(input);
  await validateEntityOwnership(userId, validated);

  let slug = existing.slug;
  if (validated.title && validated.title !== existing.title) {
    slug = await generateUniqueSlug(userId, validated.title, id);
  }

  const contentToParse =
    validated.content !== undefined ? validated.content : existing.content;
  const extractedLinks = parseWikilinks(contentToParse);

  const updated = await db.transaction(async (tx) => {
    const [res] = await tx
      .update(notes)
      .set({
        title: validated.title ?? existing.title,
        slug,
        content: validated.content !== undefined ? validated.content : existing.content,
        noteType: validated.noteType ?? existing.noteType,
        area: validated.area ?? existing.area,
        tags: validated.tags ?? existing.tags,
        isPinned: validated.isPinned !== undefined ? validated.isPinned : existing.isPinned,
        isArchived:
          validated.isArchived !== undefined ? validated.isArchived : existing.isArchived,
        projectId:
          validated.projectId !== undefined ? validated.projectId : existing.projectId,
        goalId: validated.goalId !== undefined ? validated.goalId : existing.goalId,
        taskId: validated.taskId !== undefined ? validated.taskId : existing.taskId,
        updatedAt: new Date(),
      })
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .returning();

    // Re-sync outgoing links
    await syncWikilinks(tx, userId, id, extractedLinks);

    // If title changed, reconcile target references across incoming links
    if (validated.title && validated.title !== existing.title) {
      const oldTitle = existing.title.trim().toLowerCase();

      // Check if any other note still has the old title
      const otherWithOldTitle = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            sql`LOWER(TRIM(${notes.title})) = ${oldTitle}`,
            sql`${notes.id} != ${id}`
          )
        )
        .limit(1);

      // Links pointing to this note by old title become dangling if no other note has old title
      await tx
        .update(noteLinks)
        .set({ targetNoteId: otherWithOldTitle.length > 0 ? otherWithOldTitle[0].id : null })
        .where(
          and(
            eq(noteLinks.userId, userId),
            eq(noteLinks.targetNoteId, id),
            sql`LOWER(TRIM(${noteLinks.targetTitle})) = ${oldTitle}`
          )
        );

      // Resolve any dangling links targeting the new title to this note
      await backfillTargetLinks(tx, userId, id, validated.title);
    }

    return res;
  });

  await createAuditLog({
    userId,
    category: "mutation",
    action: "note.update",
    status: "success",
    details: {
      noteId: id,
      title: updated.title,
      slug: updated.slug,
      isArchived: updated.isArchived,
    },
  });

  return mapNoteToDTO(updated, { outgoing: extractedLinks.length });
}

/**
 * Get note by ID with full outgoing links and backlinks list.
 */
export async function getNoteById(
  userId: string,
  id: string
): Promise<
  NoteDTO & {
    outgoingLinks: NoteLinkDTO[];
    backlinks: BacklinkItemDTO[];
  }
> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, id)))
    .limit(1);

  if (!note) {
    throw new NotFoundError(`Note with id "${id}" not found.`);
  }

  const outgoing = await db
    .select()
    .from(noteLinks)
    .where(and(eq(noteLinks.userId, userId), eq(noteLinks.sourceNoteId, id)));

  const backlinks = await getBacklinks(userId, id);

  return {
    ...mapNoteToDTO(note, {
      outgoing: outgoing.length,
      backlinks: backlinks.length,
    }),
    outgoingLinks: outgoing.map((l) => ({
      id: l.id,
      userId: l.userId,
      sourceNoteId: l.sourceNoteId,
      targetNoteId: l.targetNoteId,
      targetTitle: l.targetTitle,
      displayText: l.displayText,
      createdAt: l.createdAt.toISOString(),
    })),
    backlinks,
  };
}

/**
 * Get note by slug with outgoing links and backlinks.
 */
export async function getNoteBySlug(
  userId: string,
  slug: string
): Promise<
  NoteDTO & {
    outgoingLinks: NoteLinkDTO[];
    backlinks: BacklinkItemDTO[];
  }
> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.slug, slug)))
    .limit(1);

  if (!note) {
    throw new NotFoundError(`Note with slug "${slug}" not found.`);
  }

  return getNoteById(userId, note.id);
}

/**
 * Query incoming backlinks for a given note.
 */
export async function getBacklinks(
  userId: string,
  noteId: string
): Promise<BacklinkItemDTO[]> {
  const [targetNote] = await db
    .select({ title: notes.title })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, noteId)))
    .limit(1);

  if (!targetNote) {
    throw new NotFoundError(`Note with id "${noteId}" not found.`);
  }

  // Join note_links with notes (source notes referring to targetNoteId or targetTitle)
  const rows = await db
    .select({
      linkId: noteLinks.id,
      sourceNoteId: notes.id,
      sourceTitle: notes.title,
      sourceSlug: notes.slug,
      sourceContent: notes.content,
      displayText: noteLinks.displayText,
      updatedAt: notes.updatedAt,
    })
    .from(noteLinks)
    .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
    .where(
      and(
        eq(noteLinks.userId, userId),
        eq(notes.isArchived, false),
        or(
          eq(noteLinks.targetNoteId, noteId),
          sql`LOWER(TRIM(${noteLinks.targetTitle})) = LOWER(TRIM(${targetNote.title}))`
        )
      )
    );

  const seen = new Set<string>();
  const results: BacklinkItemDTO[] = [];

  for (const r of rows) {
    if (r.sourceNoteId === noteId || seen.has(r.sourceNoteId)) {
      continue;
    }
    seen.add(r.sourceNoteId);
    results.push({
      noteId: r.sourceNoteId,
      title: r.sourceTitle,
      slug: r.sourceSlug,
      displayText: r.displayText,
      snippet: extractSnippet(r.sourceContent, targetNote.title),
      updatedAt: r.updatedAt.toISOString(),
    });
  }

  return results;
}

/**
 * List notes with multi-criteria filtering, search, and pagination.
 */
export async function listNotes(
  userId: string,
  params?: unknown
): Promise<{ notes: NoteDTO[]; total: number }> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const query = listNotesQuerySchema.parse(params ?? {});
  const conditions = [eq(notes.userId, userId)];

  if (query.area) {
    conditions.push(eq(notes.area, query.area));
  }
  if (query.noteType) {
    conditions.push(eq(notes.noteType, query.noteType));
  }
  if (query.isPinned !== undefined) {
    conditions.push(eq(notes.isPinned, query.isPinned));
  }
  if (query.isArchived !== undefined) {
    conditions.push(eq(notes.isArchived, query.isArchived));
  } else {
    conditions.push(eq(notes.isArchived, false));
  }
  if (query.projectId) {
    conditions.push(eq(notes.projectId, query.projectId));
  }
  if (query.goalId) {
    conditions.push(eq(notes.goalId, query.goalId));
  }
  if (query.taskId) {
    conditions.push(eq(notes.taskId, query.taskId));
  }
  if (query.tag) {
    // JSONB array contains query.tag
    conditions.push(sql`${notes.tags} @> ${JSON.stringify([query.tag])}::jsonb`);
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(ilike(notes.title, pattern), ilike(notes.content, pattern))!);
  }

  const whereClause = and(...conditions);

  const [totalRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notes)
    .where(whereClause);

  const total = totalRes?.count ?? 0;

  const rows = await db
    .select()
    .from(notes)
    .where(whereClause)
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
    .limit(query.limit)
    .offset(query.offset);

  return {
    notes: rows.map((r) => mapNoteToDTO(r)),
    total,
  };
}

/**
 * Delete a note (soft archive or permanent cascade).
 */
export async function deleteNote(
  userId: string,
  id: string,
  hardDelete = false
): Promise<void> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Note with id "${id}" not found.`);
  }

  if (hardDelete) {
    await db.transaction(async (tx) => {
      // Nullify any note_links pointing to this note
      await tx
        .update(noteLinks)
        .set({ targetNoteId: null })
        .where(and(eq(noteLinks.userId, userId), eq(noteLinks.targetNoteId, id)));

      // Delete note (cascades to outgoing note_links via foreign key)
      await tx
        .delete(notes)
        .where(and(eq(notes.userId, userId), eq(notes.id, id)));
    });

    await createAuditLog({
      userId,
      category: "mutation",
      action: "note.deleted",
      status: "success",
      details: { entity: "note", entityId: id, title: existing.title, slug: existing.slug },
    });
  } else {
    await db
      .update(notes)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(notes.userId, userId), eq(notes.id, id)));

    await createAuditLog({
      userId,
      category: "mutation",
      action: "note.archived",
      status: "success",
      details: { entity: "note", entityId: id, title: existing.title, slug: existing.slug },
    });
  }
}
