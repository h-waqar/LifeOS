import { eq, and, sql, gte, lte, gt, notInArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  integrationConnections,
  calendarEventMappings,
  syncLogs,
  timeBlocks,
  type TimeBlock,
  type IntegrationConnection,
} from "@/server/db/schema";
import { GoogleOAuthService, googleOAuthService } from "./oauth-service";
import {
  GoogleCalendarClient,
  googleCalendarClient,
  GoogleSyncTokenExpiredError,
} from "./client";
import {
  CalendarMappingService,
  calendarMappingService,
} from "./mapping-service";
import { createAuditLog } from "@/server/audit";
import { eventBus, createDomainEvent } from "@/server/events";
import type {
  SyncOptions,
  SyncResult,
  GoogleCalendarEvent,
  SyncType,
  SyncStatus,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Google Calendar Sync Engine cannot be initialized in the browser."
  );
}

export class GoogleCalendarSyncEngine {
  private oauthService: GoogleOAuthService;
  private client: GoogleCalendarClient;
  private mappingService: CalendarMappingService;

  constructor(
    customOAuthService?: GoogleOAuthService,
    customClient?: GoogleCalendarClient,
    customMappingService?: CalendarMappingService
  ) {
    this.oauthService = customOAuthService ?? googleOAuthService;
    this.client = customClient ?? googleCalendarClient;
    this.mappingService = customMappingService ?? calendarMappingService;
  }

  /**
   * Main synchronization coordinator.
   * Performs inbound (Google -> LifeOS) and outbound (LifeOS -> Google) sync.
   */
  async sync(userId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const startedAt = new Date();
    const startTime = performance.now();

    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "google_calendar")
        )
      )
      .limit(1);

    if (!connection || connection.status !== "connected") {
      throw new Error("Cannot sync: Google Calendar integration is not connected.");
    }

    const direction = options.direction ?? "bidirectional";
    const meta = (connection.metadata as Record<string, unknown>) ?? {};
    const isInitialSync = !meta.syncToken || options.fullSync;
    const syncType: SyncType = isInitialSync ? "initial" : "incremental";

    const result: SyncResult = {
      connectionId: connection.id,
      userId,
      provider: "google_calendar",
      syncType,
      status: "success",
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsDeleted: 0,
      itemsFailed: 0,
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
      durationMs: 0,
    };

    let accessToken: string;
    try {
      accessToken = await this.oauthService.getValidAccessToken(userId);
    } catch (err: any) {
      result.status = "failed";
      result.errorMessage = `Authentication failed: ${err.message}`;
      await this.recordSyncLog(result, startedAt);
      throw err;
    }

    const calendarId = options.calendarId ?? (meta.calendarId as string) ?? "primary";

    try {
      // 1. Inbound synchronization (Google -> LifeOS)
      if (direction === "inbound" || direction === "bidirectional") {
        await this.syncInbound(
          userId,
          connection,
          accessToken,
          calendarId,
          options,
          result
        );
      }

      // 2. Outbound synchronization (LifeOS -> Google)
      if (direction === "outbound" || direction === "bidirectional") {
        await this.syncOutbound(
          userId,
          connection,
          accessToken,
          calendarId,
          options,
          result
        );
      }

      // Compute total mappings
      const mappingsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(calendarEventMappings)
        .where(eq(calendarEventMappings.userId, userId));
      const totalMappings = Number(mappingsCount[0]?.count ?? 0);

      // Update connection metadata
      const updatedMeta = {
        ...((connection.metadata as Record<string, unknown>) ?? {}),
        calendarId,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: result.status,
        lastErrorMessage: result.errorMessage ?? null,
        totalMappings,
        ...(result.nextSyncToken ? { syncToken: result.nextSyncToken } : {}),
      };

      await db
        .update(integrationConnections)
        .set({
          metadata: updatedMeta,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      result.completedAt = new Date().toISOString();
      result.durationMs = Math.round(performance.now() - startTime);

      await this.recordSyncLog(result, startedAt);

      await createAuditLog({
        userId,
        category: "system",
        action: "sync_integration",
        status: result.status === "failed" ? "failure" : "success",
        actor: "system",
        details: {
          provider: "google_calendar",
          connectionId: connection.id,
          syncType,
          itemsProcessed: result.itemsProcessed,
          itemsCreated: result.itemsCreated,
          itemsUpdated: result.itemsUpdated,
          itemsDeleted: result.itemsDeleted,
          durationMs: result.durationMs,
        },
      });

      return result;
    } catch (err: any) {
      result.status = "failed";
      result.errorMessage = err.message ?? "Unknown synchronization error";
      result.completedAt = new Date().toISOString();
      result.durationMs = Math.round(performance.now() - startTime);

      await this.recordSyncLog(result, startedAt);
      throw err;
    }
  }

  /**
   * Pulls changes from Google Calendar and propagates them into LifeOS time_blocks.
   */
  private async syncInbound(
    userId: string,
    connection: IntegrationConnection,
    accessToken: string,
    calendarId: string,
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    const meta = (connection.metadata as Record<string, unknown>) ?? {};
    let syncToken = options.fullSync ? undefined : (meta.syncToken as string | undefined);

    let pageToken: string | undefined;
    let fallbackToFull = false;

    // Time window for non-syncToken (initial/full) pulls: -30 days to +90 days
    const now = new Date();
    const timeMin = options.timeMin ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const timeMax = options.timeMax ?? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    do {
      let response;
      try {
        response = await this.client.listEvents(accessToken, {
          calendarId,
          syncToken: fallbackToFull ? undefined : syncToken,
          pageToken,
          timeMin: syncToken && !fallbackToFull ? undefined : timeMin,
          timeMax: syncToken && !fallbackToFull ? undefined : timeMax,
          singleEvents: true,
          maxResults: 250,
        });
      } catch (err) {
        if (err instanceof GoogleSyncTokenExpiredError) {
          // 410 Gone: syncToken invalid or expired. Fallback to bounded full sync!
          fallbackToFull = true;
          syncToken = undefined;
          pageToken = undefined;
          continue;
        }
        throw err;
      }

      const events = response.items || [];
      for (const event of events) {
        result.itemsProcessed++;
        try {
          await this.processInboundEvent(userId, connection.id, calendarId, event, result);
        } catch (eventErr: any) {
          result.itemsFailed++;
          result.status = "partial";
        }
      }

      pageToken = response.nextPageToken;
      if (response.nextSyncToken) {
        result.nextSyncToken = response.nextSyncToken;
      }
    } while (pageToken);
  }

  /**
   * Processes a single incoming Google Calendar event.
   * Handles cancellation, creation, and Last-Write-Wins conflict resolution.
   */
  private async processInboundEvent(
    userId: string,
    connectionId: string,
    calendarId: string,
    event: GoogleCalendarEvent,
    result: SyncResult
  ): Promise<void> {
    const existingMapping = await this.mappingService.getByExternalId(userId, event.id);

    // Event is cancelled in Google Calendar
    if (event.status === "cancelled") {
      if (existingMapping) {
        // Mark local time block cancelled
        await db
          .update(timeBlocks)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, existingMapping.timeBlockId)));

        await this.mappingService.updateMapping(userId, existingMapping.id, {
          lastSyncedAt: new Date(),
          externalEtag: event.etag,
        });
        result.itemsDeleted++;
      }
      return;
    }

    // Parse start and end timestamps
    const { startTime, endTime, durationMinutes } = this.parseEventTimes(event);

    if (existingMapping) {
      // Event already mapped: check for conflicts / updates
      const [localBlock] = await db
        .select()
        .from(timeBlocks)
        .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, existingMapping.timeBlockId)))
        .limit(1);

      if (!localBlock) {
        // Local block was deleted; clean up orphan mapping
        await this.mappingService.deleteMapping(userId, existingMapping.id);
        return;
      }

      const googleUpdatedAt = event.updated ? new Date(event.updated).getTime() : 0;
      const localUpdatedAt = localBlock.updatedAt.getTime();

      // Last-Write-Wins: If Google update is newer or equal, overwrite local block
      if (googleUpdatedAt >= localUpdatedAt || !event.updated) {
        await db
          .update(timeBlocks)
          .set({
            title: (event.summary || "Google Calendar Event").slice(0, 255),
            description: event.description ?? localBlock.description,
            startTime,
            endTime,
            durationMinutes,
            updatedAt: new Date(),
          })
          .where(eq(timeBlocks.id, localBlock.id));

        await this.mappingService.updateMapping(userId, existingMapping.id, {
          externalEtag: event.etag ?? existingMapping.externalEtag,
          lastSyncedAt: new Date(),
        });
        result.itemsUpdated++;
      }
    } else {
      // Event not mapped: create new local time block and mapping
      const title = (event.summary || "Google Calendar Event").slice(0, 255);
      const [newBlock] = await db
        .insert(timeBlocks)
        .values({
          userId,
          title,
          description: event.description ?? null,
          startTime,
          endTime,
          durationMinutes,
          status: "scheduled",
          commitmentLevel: "soft",
        })
        .returning();

      await this.mappingService.createMapping(userId, {
        connectionId,
        timeBlockId: newBlock.id,
        externalCalendarId: calendarId,
        externalEventId: event.id,
        externalEtag: event.etag ?? null,
        syncDirection: "bidirectional",
        lastSyncedAt: new Date(),
      });

      result.itemsCreated++;
    }
  }

  /**
   * Pushes LifeOS time_blocks to Google Calendar.
   * Creates new Google events for unmapped blocks and updates modified blocks.
   */
  private async syncOutbound(
    userId: string,
    connection: IntegrationConnection,
    accessToken: string,
    calendarId: string,
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    const now = new Date();
    const timeMin = options.timeMin ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const timeMax = options.timeMax ?? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // 1. Push unmapped scheduled time_blocks to Google Calendar
    const allMappings = await this.mappingService.listMappings(userId, connection.id);
    const mappedBlockIds = allMappings.map((m) => m.timeBlockId);

    const unmappedConditions = [
      eq(timeBlocks.userId, userId),
      eq(timeBlocks.status, "scheduled"),
      gte(timeBlocks.startTime, timeMin),
      lte(timeBlocks.endTime, timeMax),
    ];

    if (mappedBlockIds.length > 0) {
      unmappedConditions.push(notInArray(timeBlocks.id, mappedBlockIds));
    }

    const unmappedBlocks = await db
      .select()
      .from(timeBlocks)
      .where(and(...unmappedConditions));

    for (const block of unmappedBlocks) {
      result.itemsProcessed++;
      try {
        const createdGoogleEvent = await this.client.createEvent(
          accessToken,
          {
            summary: block.title,
            description: block.description ?? undefined,
            start: { dateTime: block.startTime.toISOString() },
            end: { dateTime: block.endTime.toISOString() },
          },
          calendarId
        );

        await this.mappingService.createMapping(userId, {
          connectionId: connection.id,
          timeBlockId: block.id,
          externalCalendarId: calendarId,
          externalEventId: createdGoogleEvent.id,
          externalEtag: createdGoogleEvent.etag,
          syncDirection: "bidirectional",
          lastSyncedAt: new Date(),
        });

        result.itemsCreated++;
      } catch (err) {
        result.itemsFailed++;
        result.status = "partial";
      }
    }

    // 2. Propagate local updates for mapped blocks that were modified since lastSyncedAt
    for (const mapping of allMappings) {
      const [block] = await db
        .select()
        .from(timeBlocks)
        .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, mapping.timeBlockId)))
        .limit(1);

      if (!block) {
        // Block deleted locally: delete from Google Calendar
        result.itemsProcessed++;
        try {
          await this.client.deleteEvent(accessToken, mapping.externalEventId, calendarId);
          await this.mappingService.deleteMapping(userId, mapping.id);
          result.itemsDeleted++;
        } catch {
          result.itemsFailed++;
          result.status = "partial";
        }
        continue;
      }

      // Check if block was modified locally after lastSyncedAt
      if (block.updatedAt.getTime() > mapping.lastSyncedAt.getTime()) {
        result.itemsProcessed++;
        try {
          if (block.status === "cancelled") {
            await this.client.deleteEvent(accessToken, mapping.externalEventId, calendarId);
            await this.mappingService.deleteMapping(userId, mapping.id);
            result.itemsDeleted++;
          } else {
            const updated = await this.client.updateEvent(
              accessToken,
              mapping.externalEventId,
              {
                summary: block.title,
                description: block.description ?? undefined,
                start: { dateTime: block.startTime.toISOString() },
                end: { dateTime: block.endTime.toISOString() },
              },
              calendarId
            );

            await this.mappingService.updateMapping(userId, mapping.id, {
              externalEtag: updated.etag,
              lastSyncedAt: new Date(),
            });
            result.itemsUpdated++;
          }
        } catch {
          result.itemsFailed++;
          result.status = "partial";
        }
      }
    }
  }

  /**
   * Helper to parse Google Calendar datetime/date formats into valid Date objects.
   */
  private parseEventTimes(event: GoogleCalendarEvent): {
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
  } {
    let start: Date;
    let end: Date;

    if (event.start?.dateTime) {
      start = new Date(event.start.dateTime);
    } else if (event.start?.date) {
      start = new Date(`${event.start.date}T09:00:00Z`);
    } else {
      start = new Date();
    }

    if (event.end?.dateTime) {
      end = new Date(event.end.dateTime);
    } else if (event.end?.date) {
      end = new Date(`${event.end.date}T10:00:00Z`);
    } else {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    // Ensure ordering invariant
    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 30 * 60 * 1000);
    }

    const durationMinutes = Math.max(
      1,
      Math.min(1440, Math.round((end.getTime() - start.getTime()) / (1000 * 60)))
    );

    return { startTime: start, endTime: end, durationMinutes };
  }

  /**
   * Writes sync execution record to sync_logs table.
   */
  private async recordSyncLog(result: SyncResult, startedAt: Date): Promise<void> {
    try {
      await db.insert(syncLogs).values({
        userId: result.userId,
        connectionId: result.connectionId,
        provider: result.provider,
        syncType: result.syncType,
        status: result.status,
        itemsProcessed: result.itemsProcessed,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsDeleted: result.itemsDeleted,
        itemsFailed: result.itemsFailed,
        errorMessage: result.errorMessage ?? null,
        startedAt,
        completedAt: new Date(),
      });
    } catch {
      // Do not let sync log insertion failure crash execution
    }
  }
}

export const googleCalendarSyncEngine = new GoogleCalendarSyncEngine();
