import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import {
  calendarEventMappings,
  type CalendarEventMapping,
  type NewCalendarEventMapping,
} from "@/server/db/schema";
import type { CalendarEventMappingDTO, SyncDirection } from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Calendar Mapping Service cannot be initialized in the browser."
  );
}

export function toCalendarEventMappingDTO(
  row: CalendarEventMapping
): CalendarEventMappingDTO {
  return {
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    timeBlockId: row.timeBlockId,
    externalCalendarId: row.externalCalendarId,
    externalEventId: row.externalEventId,
    externalEtag: row.externalEtag,
    syncDirection: row.syncDirection as SyncDirection,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class CalendarMappingService {
  /**
   * Retrieves a mapping by external Google Event ID for the given user.
   */
  async getByExternalId(
    userId: string,
    externalEventId: string
  ): Promise<CalendarEventMapping | null> {
    const [mapping] = await db
      .select()
      .from(calendarEventMappings)
      .where(
        and(
          eq(calendarEventMappings.userId, userId),
          eq(calendarEventMappings.externalEventId, externalEventId)
        )
      )
      .limit(1);

    return mapping ?? null;
  }

  /**
   * Retrieves a mapping by internal TimeBlock ID for the given user.
   */
  async getByTimeBlockId(
    userId: string,
    timeBlockId: string
  ): Promise<CalendarEventMapping | null> {
    const [mapping] = await db
      .select()
      .from(calendarEventMappings)
      .where(
        and(
          eq(calendarEventMappings.userId, userId),
          eq(calendarEventMappings.timeBlockId, timeBlockId)
        )
      )
      .limit(1);

    return mapping ?? null;
  }

  /**
   * Creates a new mapping between a TimeBlock and Google Event.
   */
  async createMapping(
    userId: string,
    data: {
      connectionId: string;
      timeBlockId: string;
      externalCalendarId?: string;
      externalEventId: string;
      externalEtag?: string | null;
      syncDirection?: SyncDirection;
      lastSyncedAt?: Date;
    }
  ): Promise<CalendarEventMapping> {
    const [inserted] = await db
      .insert(calendarEventMappings)
      .values({
        userId,
        connectionId: data.connectionId,
        timeBlockId: data.timeBlockId,
        externalCalendarId: data.externalCalendarId ?? "primary",
        externalEventId: data.externalEventId,
        externalEtag: data.externalEtag ?? null,
        syncDirection: data.syncDirection ?? "bidirectional",
        lastSyncedAt: data.lastSyncedAt ?? new Date(),
      })
      .returning();

    return inserted;
  }

  /**
   * Updates an existing mapping's sync metadata (etag, timestamp, direction).
   */
  async updateMapping(
    userId: string,
    id: string,
    updates: {
      externalEtag?: string | null;
      lastSyncedAt?: Date;
      syncDirection?: SyncDirection;
    }
  ): Promise<CalendarEventMapping> {
    const [updated] = await db
      .update(calendarEventMappings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarEventMappings.userId, userId),
          eq(calendarEventMappings.id, id)
        )
      )
      .returning();

    return updated;
  }

  /**
   * Deletes a mapping by mapping ID.
   */
  async deleteMapping(userId: string, id: string): Promise<void> {
    await db
      .delete(calendarEventMappings)
      .where(
        and(
          eq(calendarEventMappings.userId, userId),
          eq(calendarEventMappings.id, id)
        )
      );
  }

  /**
   * Deletes a mapping by TimeBlock ID.
   */
  async deleteMappingByTimeBlockId(
    userId: string,
    timeBlockId: string
  ): Promise<void> {
    await db
      .delete(calendarEventMappings)
      .where(
        and(
          eq(calendarEventMappings.userId, userId),
          eq(calendarEventMappings.timeBlockId, timeBlockId)
        )
      );
  }

  /**
   * Lists all mappings for a user, optionally filtered by connectionId.
   */
  async listMappings(
    userId: string,
    connectionId?: string
  ): Promise<CalendarEventMapping[]> {
    const conditions = [eq(calendarEventMappings.userId, userId)];
    if (connectionId) {
      conditions.push(eq(calendarEventMappings.connectionId, connectionId));
    }

    return db
      .select()
      .from(calendarEventMappings)
      .where(and(...conditions));
  }
}

export const calendarMappingService = new CalendarMappingService();
