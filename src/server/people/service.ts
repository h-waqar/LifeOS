import { eq, and, sql, desc, asc, ilike, or, isNull, isNotNull, lt, gte } from "drizzle-orm";
import { db } from "@/server/db";
import {
  people,
  interactions,
  tasks,
  notes,
  projects,
  type Person,
  type Interaction,
  type Task,
  type Note,
  type Project,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  createPersonSchema,
  updatePersonSchema,
  listPeopleQuerySchema,
  logInteractionSchema,
  updateInteractionSchema,
  type CreatePersonSchemaInput,
  type UpdatePersonSchemaInput,
  type ListPeopleQueryParams,
  type LogInteractionSchemaInput,
  type UpdateInteractionSchemaInput,
} from "./validation";
import {
  calculateFollowUpStatus,
  categorizeFollowUpReminders,
} from "./follow-up";
import type {
  PersonDTO,
  InteractionDTO,
  PersonDetailDTO,
  FollowUpRemindersDTO,
  TaskDTO,
  NoteDTO,
  ProjectDTO,
} from "@/types";
import { toTaskDTO } from "@/server/tasks/service";
import { toProjectDTO } from "@/server/projects/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: People service cannot be initialized in the browser."
  );
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Resource not found") {
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

function mapPersonToDTO(
  row: Person,
  counts?: {
    interactionsCount?: number;
    linkedTasksCount?: number;
    linkedProjectsCount?: number;
    linkedNotesCount?: number;
  },
  referenceDate: Date = new Date()
): PersonDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    relationshipType: row.relationshipType as PersonDTO["relationshipType"],
    company: row.company,
    role: row.role,
    email: row.email,
    phone: row.phone,
    contactInfo:
      typeof row.contactInfo === "object" && row.contactInfo !== null
        ? (row.contactInfo as Record<string, any>)
        : {},
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    notes: row.notes,
    isArchived: row.isArchived,
    lastInteractionDate: row.lastInteractionDate
      ? row.lastInteractionDate.toISOString()
      : null,
    nextFollowUpDate: row.nextFollowUpDate
      ? row.nextFollowUpDate.toISOString()
      : null,
    followUpStatus: calculateFollowUpStatus(
      row.nextFollowUpDate,
      referenceDate
    ),
    interactionsCount: counts?.interactionsCount,
    linkedTasksCount: counts?.linkedTasksCount,
    linkedProjectsCount: counts?.linkedProjectsCount,
    linkedNotesCount: counts?.linkedNotesCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapInteractionToDTO(row: Interaction): InteractionDTO {
  return {
    id: row.id,
    userId: row.userId,
    personId: row.personId,
    date: row.date.toISOString(),
    channel: row.channel as InteractionDTO["channel"],
    summary: row.summary,
    nextFollowUpDate: row.nextFollowUpDate
      ? row.nextFollowUpDate.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapNoteToSummaryDTO(note: Note): NoteDTO {
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
    personId: note.personId,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Sync person's lastInteractionDate and nextFollowUpDate based on interaction history.
 */
async function syncPersonInteractionDates(
  tx: any,
  userId: string,
  personId: string,
  explicitNextFollowUpDate?: Date | null
) {
  // Find latest interaction date
  const [latestInteraction] = await tx
    .select({
      maxDate: sql<Date | null>`MAX(${interactions.date})`,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.userId, userId),
        eq(interactions.personId, personId)
      )
    );

  const rawMaxDate = latestInteraction?.maxDate;
  const maxDate = rawMaxDate
    ? rawMaxDate instanceof Date
      ? rawMaxDate
      : new Date(rawMaxDate)
    : null;

  const updates: any = {
    lastInteractionDate: maxDate,
    updatedAt: new Date(),
  };

  if (explicitNextFollowUpDate !== undefined) {
    updates.nextFollowUpDate = explicitNextFollowUpDate
      ? explicitNextFollowUpDate instanceof Date
        ? explicitNextFollowUpDate
        : new Date(explicitNextFollowUpDate)
      : null;
  }

  await tx
    .update(people)
    .set(updates)
    .where(and(eq(people.userId, userId), eq(people.id, personId)));
}

/**
 * Create a new Person record.
 */
export async function createPerson(
  userId: string,
  input: unknown
): Promise<PersonDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const validated = createPersonSchema.parse(input);

  const [created] = await db
    .insert(people)
    .values({
      userId,
      name: validated.name,
      relationshipType: validated.relationshipType,
      company: validated.company ?? null,
      role: validated.role ?? null,
      email: validated.email ?? null,
      phone: validated.phone ?? null,
      contactInfo: validated.contactInfo,
      tags: validated.tags,
      notes: validated.notes ?? null,
      isArchived: false,
      nextFollowUpDate: validated.nextFollowUpDate ?? null,
    })
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "person.create",
    status: "success",
    details: {
      personId: created.id,
      name: created.name,
      relationshipType: created.relationshipType,
    },
  });

  return mapPersonToDTO(created);
}

/**
 * Update a Person record.
 */
export async function updatePerson(
  userId: string,
  id: string,
  input: unknown
): Promise<PersonDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Contact with id "${id}" not found.`);
  }

  const validated = updatePersonSchema.parse(input);

  const [updated] = await db
    .update(people)
    .set({
      name: validated.name !== undefined ? validated.name : existing.name,
      relationshipType:
        validated.relationshipType !== undefined
          ? validated.relationshipType
          : existing.relationshipType,
      company:
        validated.company !== undefined ? validated.company : existing.company,
      role: validated.role !== undefined ? validated.role : existing.role,
      email: validated.email !== undefined ? validated.email : existing.email,
      phone: validated.phone !== undefined ? validated.phone : existing.phone,
      contactInfo:
        validated.contactInfo !== undefined
          ? validated.contactInfo
          : existing.contactInfo,
      tags: validated.tags !== undefined ? validated.tags : existing.tags,
      notes: validated.notes !== undefined ? validated.notes : existing.notes,
      isArchived:
        validated.isArchived !== undefined
          ? validated.isArchived
          : existing.isArchived,
      nextFollowUpDate:
        validated.nextFollowUpDate !== undefined
          ? validated.nextFollowUpDate
          : existing.nextFollowUpDate,
      updatedAt: new Date(),
    })
    .where(and(eq(people.userId, userId), eq(people.id, id)))
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "person.update",
    status: "success",
    details: {
      personId: updated.id,
      name: updated.name,
    },
  });

  return mapPersonToDTO(updated);
}

/**
 * Archive a Person record (soft-delete).
 */
export async function archivePerson(
  userId: string,
  id: string
): Promise<PersonDTO> {
  return updatePerson(userId, id, { isArchived: true });
}

/**
 * Restore an archived Person record.
 */
export async function restorePerson(
  userId: string,
  id: string
): Promise<PersonDTO> {
  return updatePerson(userId, id, { isArchived: false });
}

/**
 * Hard delete a Person record.
 * Cascades to interactions and nullifies references in tasks, notes.
 */
export async function deletePerson(
  userId: string,
  id: string
): Promise<{ success: boolean }> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Contact with id "${id}" not found.`);
  }

  await db.transaction(async (tx) => {
    // Nullify task references
    await tx
      .update(tasks)
      .set({ personId: null })
      .where(and(eq(tasks.userId, userId), eq(tasks.personId, id)));

    // Nullify note references
    await tx
      .update(notes)
      .set({ personId: null })
      .where(and(eq(notes.userId, userId), eq(notes.personId, id)));

    // Delete interactions
    await tx
      .delete(interactions)
      .where(
        and(eq(interactions.userId, userId), eq(interactions.personId, id))
      );

    // Delete person
    await tx
      .delete(people)
      .where(and(eq(people.userId, userId), eq(people.id, id)));
  });

  await createAuditLog({
    userId,
    category: "mutation",
    action: "person.delete",
    status: "success",
    details: { personId: id, name: existing.name },
  });

  return { success: true };
}

/**
 * Get a single Person by ID with interactions and linked entities.
 */
export async function getPersonById(
  userId: string,
  id: string
): Promise<PersonDetailDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.id, id)))
    .limit(1);

  if (!person) {
    throw new NotFoundError(`Contact with id "${id}" not found.`);
  }

  // Fetch interactions ordered by date descending
  const personInteractions = await db
    .select()
    .from(interactions)
    .where(
      and(eq(interactions.userId, userId), eq(interactions.personId, id))
    )
    .orderBy(desc(interactions.date));

  // Fetch linked tasks
  const linkedTasksRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.personId, id)))
    .orderBy(desc(tasks.updatedAt));

  // Fetch linked notes
  const linkedNotesRows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.personId, id)))
    .orderBy(desc(notes.updatedAt));

  // Extract linked project IDs from tasks and notes
  const projectIds = new Set<string>();
  for (const t of linkedTasksRows) {
    if (t.projectId) projectIds.add(t.projectId);
  }
  for (const n of linkedNotesRows) {
    if (n.projectId) projectIds.add(n.projectId);
  }

  const linkedProjectsRows: Project[] = [];
  for (const projId of projectIds) {
    const [p] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, projId)))
      .limit(1);
    if (p) linkedProjectsRows.push(p);
  }

  const baseDTO = mapPersonToDTO(person, {
    interactionsCount: personInteractions.length,
    linkedTasksCount: linkedTasksRows.length,
    linkedProjectsCount: linkedProjectsRows.length,
    linkedNotesCount: linkedNotesRows.length,
  });

  return {
    ...baseDTO,
    interactions: personInteractions.map(mapInteractionToDTO),
    linkedTasks: linkedTasksRows.map((t) => toTaskDTO(t)),
    linkedProjects: linkedProjectsRows.map((p) => toProjectDTO(p)),
    linkedNotes: linkedNotesRows.map(mapNoteToSummaryDTO),
  };
}

/**
 * List People with rich filtering, search, and sorting.
 */
export async function listPeople(
  userId: string,
  queryInput: unknown = {}
): Promise<PersonDTO[]> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const query = listPeopleQuerySchema.parse(queryInput);

  const conditions = [eq(people.userId, userId)];

  if (query.isArchived !== undefined) {
    conditions.push(eq(people.isArchived, query.isArchived));
  } else {
    conditions.push(eq(people.isArchived, false));
  }

  if (query.relationshipType) {
    conditions.push(eq(people.relationshipType, query.relationshipType));
  }

  if (query.company) {
    conditions.push(ilike(people.company, `%${query.company}%`));
  }

  if (query.tag) {
    conditions.push(
      sql`${people.tags} @> ${JSON.stringify([query.tag])}::jsonb`
    );
  }

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(people.name, pattern),
        ilike(people.company, pattern),
        ilike(people.role, pattern),
        ilike(people.email, pattern),
        ilike(people.phone, pattern),
        ilike(people.notes, pattern)
      )!
    );
  }

  // Determine sort column
  let orderByClause = asc(people.name);
  if (query.sortBy === "lastInteractionDate") {
    orderByClause =
      query.sortOrder === "asc"
        ? asc(people.lastInteractionDate)
        : desc(people.lastInteractionDate);
  } else if (query.sortBy === "nextFollowUpDate") {
    orderByClause =
      query.sortOrder === "asc"
        ? asc(people.nextFollowUpDate)
        : desc(people.nextFollowUpDate);
  } else if (query.sortBy === "updatedAt") {
    orderByClause =
      query.sortOrder === "asc"
        ? asc(people.updatedAt)
        : desc(people.updatedAt);
  } else if (query.sortBy === "createdAt") {
    orderByClause =
      query.sortOrder === "asc"
        ? asc(people.createdAt)
        : desc(people.createdAt);
  } else {
    orderByClause =
      query.sortOrder === "desc" ? desc(people.name) : asc(people.name);
  }

  const rows = await db
    .select()
    .from(people)
    .where(and(...conditions))
    .orderBy(orderByClause)
    .limit(query.limit)
    .offset(query.offset);

  const now = new Date();
  let results = rows.map((r) => mapPersonToDTO(r, undefined, now));

  // In-memory filter for followUpStatus if specified (ensures exact timezone/boundary calculation)
  if (query.followUpStatus) {
    results = results.filter((p) => p.followUpStatus === query.followUpStatus);
  }

  return results;
}

/**
 * Log a new Interaction with a Person.
 */
export async function logInteraction(
  userId: string,
  personId: string,
  input: unknown
): Promise<InteractionDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.id, personId)))
    .limit(1);

  if (!person) {
    throw new NotFoundError(`Contact with id "${personId}" not found.`);
  }

  const validated = logInteractionSchema.parse(input);
  const interactionDate = validated.date ?? new Date();

  const created = await db.transaction(async (tx) => {
    const [res] = await tx
      .insert(interactions)
      .values({
        userId,
        personId,
        date: interactionDate,
        channel: validated.channel,
        summary: validated.summary,
        nextFollowUpDate: validated.nextFollowUpDate ?? null,
      })
      .returning();

    // Determine the nextFollowUpDate to set on the person
    const newNextFollowUpDate =
      validated.nextFollowUpDate !== undefined
        ? validated.nextFollowUpDate
        : person.nextFollowUpDate;

    await syncPersonInteractionDates(
      tx,
      userId,
      personId,
      newNextFollowUpDate
    );

    return res;
  });

  await createAuditLog({
    userId,
    category: "mutation",
    action: "interaction.create",
    status: "success",
    details: {
      interactionId: created.id,
      personId,
      channel: created.channel,
    },
  });

  return mapInteractionToDTO(created);
}

/**
 * Update an existing Interaction.
 */
export async function updateInteraction(
  userId: string,
  id: string,
  input: unknown
): Promise<InteractionDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(interactions)
    .where(and(eq(interactions.userId, userId), eq(interactions.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Interaction with id "${id}" not found.`);
  }

  const validated = updateInteractionSchema.parse(input);

  const updated = await db.transaction(async (tx) => {
    const [res] = await tx
      .update(interactions)
      .set({
        date: validated.date !== undefined ? validated.date : existing.date,
        channel:
          validated.channel !== undefined
            ? validated.channel
            : existing.channel,
        summary:
          validated.summary !== undefined
            ? validated.summary
            : existing.summary,
        nextFollowUpDate:
          validated.nextFollowUpDate !== undefined
            ? validated.nextFollowUpDate
            : existing.nextFollowUpDate,
        updatedAt: new Date(),
      })
      .where(and(eq(interactions.userId, userId), eq(interactions.id, id)))
      .returning();

    await syncPersonInteractionDates(
      tx,
      userId,
      existing.personId,
      validated.nextFollowUpDate !== undefined
        ? validated.nextFollowUpDate
        : undefined
    );

    return res;
  });

  await createAuditLog({
    userId,
    category: "mutation",
    action: "interaction.update",
    status: "success",
    details: {
      interactionId: updated.id,
      personId: updated.personId,
    },
  });

  return mapInteractionToDTO(updated);
}

/**
 * Delete an Interaction.
 */
export async function deleteInteraction(
  userId: string,
  id: string
): Promise<{ success: boolean }> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [existing] = await db
    .select()
    .from(interactions)
    .where(and(eq(interactions.userId, userId), eq(interactions.id, id)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Interaction with id "${id}" not found.`);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(interactions)
      .where(and(eq(interactions.userId, userId), eq(interactions.id, id)));

    await syncPersonInteractionDates(tx, userId, existing.personId);
  });

  await createAuditLog({
    userId,
    category: "mutation",
    action: "interaction.delete",
    status: "success",
    details: { interactionId: id, personId: existing.personId },
  });

  return { success: true };
}

/**
 * List Interactions for a specific Person.
 */
export async function listInteractions(
  userId: string,
  personId: string
): Promise<InteractionDTO[]> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.id, personId)))
    .limit(1);

  if (!person) {
    throw new NotFoundError(`Contact with id "${personId}" not found.`);
  }

  const rows = await db
    .select()
    .from(interactions)
    .where(
      and(eq(interactions.userId, userId), eq(interactions.personId, personId))
    )
    .orderBy(desc(interactions.date));

  return rows.map(mapInteractionToDTO);
}

/**
 * Retrieve follow-up reminders grouped into overdue, today, and upcoming.
 */
export async function getFollowUpReminders(
  userId: string
): Promise<FollowUpRemindersDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const now = new Date();

  const rows = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.userId, userId),
        eq(people.isArchived, false),
        isNotNull(people.nextFollowUpDate)
      )
    );

  const peopleDTOs = rows.map((r) => mapPersonToDTO(r, undefined, now));
  return categorizeFollowUpReminders(peopleDTOs, now);
}

export const peopleService = {
  createPerson,
  getPersonById,
  updatePerson,
  deletePerson,
  listPeople,
  logInteraction,
  updateInteraction,
  deleteInteraction,
  listInteractions,
  getFollowUpReminders,
};
