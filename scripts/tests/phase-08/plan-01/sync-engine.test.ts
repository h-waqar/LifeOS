// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import {
  user,
  integrationConnections,
  calendarEventMappings,
  syncLogs,
  timeBlocks,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import { GoogleCalendarSyncEngine } from "@/server/integrations/google-calendar/sync-engine";
import { GoogleCalendarClient, GoogleSyncTokenExpiredError } from "@/server/integrations/google-calendar/client";
import { GoogleOAuthService } from "@/server/integrations/google-calendar/oauth-service";
import { CalendarMappingService } from "@/server/integrations/google-calendar/mapping-service";
import type {
  GoogleCalendarEvent,
  GoogleCalendarEventsListResponse,
} from "@/server/integrations/google-calendar/types";

const probe: ProbeResult = await probeDatabase();

describe("Plan 08-01: Google Calendar Sync Engine (Unit & Integration Tests)", () => {
  let testUserId: string;

  beforeAll(async () => {
    if (!probe.isAvailable) return;

    const existingUsers = await db.select({ id: user.id }).from(user).limit(1);
    if (existingUsers.length > 0) {
      testUserId = existingUsers[0].id;
    } else {
      const res = await auth.api.signUpEmail({
        body: {
          email: "p08_sync_test@example.com",
          password: "Plan08Password123!",
          name: "Plan 08 Tester",
        },
        asResponse: true,
      });
      const [u] = await db.select({ id: user.id }).from(user).limit(1);
      testUserId = u.id;
    }
  });

  afterAll(async () => {
    if (probe?.isAvailable && testUserId) {
      // Clean up integration test artifacts
      await db.delete(syncLogs).where(eq(syncLogs.userId, testUserId));
      await db.delete(calendarEventMappings).where(eq(calendarEventMappings.userId, testUserId));
      await db.delete(integrationConnections).where(eq(integrationConnections.userId, testUserId));
      await db.delete(timeBlocks).where(and(eq(timeBlocks.userId, testUserId), eq(timeBlocks.title, "Sync Test Block")));
      await closeDatabase();
    }
  });

  beforeEach(async () => {
    if (!probe?.isAvailable) return;
    // Clear integration tables for test user
    await db.delete(syncLogs).where(eq(syncLogs.userId, testUserId));
    await db.delete(calendarEventMappings).where(eq(calendarEventMappings.userId, testUserId));
    await db.delete(integrationConnections).where(eq(integrationConnections.userId, testUserId));
    await db.delete(timeBlocks).where(and(eq(timeBlocks.userId, testUserId), eq(timeBlocks.title, "Sync Test Block")));
  });

  describe("1. Connection Validation Guard", () => {
    it("throws an error if Google Calendar integration is not connected", async () => {
      if (!probe.isAvailable) return;

      const engine = new GoogleCalendarSyncEngine();
      await expect(engine.sync(testUserId)).rejects.toThrow(
        /Cannot sync: Google Calendar integration is not connected/i
      );
    });
  });

  describe.skipIf(!probe.isAvailable)("2. Two-Way Sync Lifecycle (Live DB)", () => {
    let mockClient: GoogleCalendarClient;
    let mockOAuth: GoogleOAuthService;
    let syncEngine: GoogleCalendarSyncEngine;
    let connectionId: string;

    beforeEach(async () => {
      // Seed a connected integration
      connectionId = crypto.randomUUID();
      await db.insert(integrationConnections).values({
        id: connectionId,
        userId: testUserId,
        provider: "google_calendar",
        status: "connected",
        encryptedAccessToken: "v1:mock_encrypted_access_token",
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        externalAccountId: "tester@gmail.com",
        metadata: {
          calendarId: "primary",
        },
      });

      mockOAuth = {
        getValidAccessToken: vi.fn().mockResolvedValue("mock_valid_token"),
      } as unknown as GoogleOAuthService;

      mockClient = new GoogleCalendarClient();
      syncEngine = new GoogleCalendarSyncEngine(mockOAuth, mockClient, new CalendarMappingService());
    });

    it("performs initial inbound sync: creates time_blocks and calendar_event_mappings", async () => {
      const mockEvent: GoogleCalendarEvent = {
        id: "google_event_001",
        summary: "Sync Test Block",
        description: "Google Calendar inbound sync description",
        start: { dateTime: "2026-09-30T10:00:00.000Z" },
        end: { dateTime: "2026-09-30T11:00:00.000Z" },
        status: "confirmed",
        etag: '"etag_initial_1"',
      };

      vi.spyOn(mockClient, "listEvents").mockResolvedValue({
        items: [mockEvent],
        nextSyncToken: "sync_token_001",
      });
      vi.spyOn(mockClient, "createEvent").mockResolvedValue({ id: "mock_created", start: {}, end: {} });

      const result = await syncEngine.sync(testUserId, { fullSync: true });

      expect(result.status).toBe("success");
      expect(result.itemsCreated).toBe(1);
      expect(result.itemsProcessed).toBeGreaterThanOrEqual(1);

      // Verify time block was created in DB
      const [block] = await db
        .select()
        .from(timeBlocks)
        .where(and(eq(timeBlocks.userId, testUserId), eq(timeBlocks.title, "Sync Test Block")));

      expect(block).toBeDefined();
      expect(block.status).toBe("scheduled");
      expect(block.commitmentLevel).toBe("soft");
      expect(block.durationMinutes).toBe(60);

      // Verify mapping was recorded in calendar_event_mappings
      const [mapping] = await db
        .select()
        .from(calendarEventMappings)
        .where(
          and(
            eq(calendarEventMappings.userId, testUserId),
            eq(calendarEventMappings.externalEventId, "google_event_001")
          )
        );

      expect(mapping).toBeDefined();
      expect(mapping.timeBlockId).toBe(block.id);
      expect(mapping.externalEtag).toBe('"etag_initial_1"');

      // Verify sync token stored in connection metadata
      const [conn] = await db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.id, connectionId));

      const meta = conn.metadata as Record<string, unknown>;
      expect(meta.syncToken).toBe("sync_token_001");
      expect(meta.lastSyncStatus).toBe("success");
    });

    it("handles inbound event cancellation by updating local time_block status to cancelled", async () => {
      // First seed an existing block and mapping
      const [seededBlock] = await db
        .insert(timeBlocks)
        .values({
          userId: testUserId,
          title: "Sync Test Block",
          startTime: new Date("2026-09-30T12:00:00.000Z"),
          endTime: new Date("2026-09-30T13:00:00.000Z"),
          durationMinutes: 60,
          status: "scheduled",
          commitmentLevel: "soft",
        })
        .returning();

      await db.insert(calendarEventMappings).values({
        userId: testUserId,
        connectionId,
        timeBlockId: seededBlock.id,
        externalEventId: "google_event_cancel_me",
        externalCalendarId: "primary",
        syncDirection: "bidirectional",
        lastSyncedAt: new Date(Date.now() - 10000),
      });

      // Google returns cancelled event
      const cancelledEvent: GoogleCalendarEvent = {
        id: "google_event_cancel_me",
        status: "cancelled",
        start: {},
        end: {},
      };

      vi.spyOn(mockClient, "listEvents").mockResolvedValue({
        items: [cancelledEvent],
        nextSyncToken: "sync_token_cancelled",
      });

      const result = await syncEngine.sync(testUserId, { direction: "inbound" });

      expect(result.itemsDeleted).toBe(1);

      // Verify local block is cancelled
      const [updatedBlock] = await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.id, seededBlock.id));

      expect(updatedBlock.status).toBe("cancelled");
    });

    it("resolves conflicts using Last-Write-Wins: newer Google event updates local block", async () => {
      const initialDate = new Date("2026-09-30T08:00:00.000Z");
      const [seededBlock] = await db
        .insert(timeBlocks)
        .values({
          userId: testUserId,
          title: "Sync Test Block",
          startTime: initialDate,
          endTime: new Date("2026-09-30T09:00:00.000Z"),
          durationMinutes: 60,
          status: "scheduled",
          commitmentLevel: "soft",
          updatedAt: initialDate,
        })
        .returning();

      await db.insert(calendarEventMappings).values({
        userId: testUserId,
        connectionId,
        timeBlockId: seededBlock.id,
        externalEventId: "google_lww_event",
        externalCalendarId: "primary",
        syncDirection: "bidirectional",
        lastSyncedAt: initialDate,
      });

      // Google event updated 10 minutes later with new time
      const googleUpdated = new Date("2026-09-30T08:10:00.000Z");
      const updatedGoogleEvent: GoogleCalendarEvent = {
        id: "google_lww_event",
        summary: "Sync Test Block",
        description: "Updated by Google Calendar",
        start: { dateTime: "2026-09-30T08:30:00.000Z" },
        end: { dateTime: "2026-09-30T09:30:00.000Z" },
        status: "confirmed",
        etag: '"new_google_etag"',
        updated: googleUpdated.toISOString(),
      };

      vi.spyOn(mockClient, "listEvents").mockResolvedValue({
        items: [updatedGoogleEvent],
        nextSyncToken: "sync_token_lww",
      });

      const result = await syncEngine.sync(testUserId, { direction: "inbound" });

      expect(result.itemsUpdated).toBe(1);

      const [updatedBlock] = await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.id, seededBlock.id));

      expect(updatedBlock.description).toBe("Updated by Google Calendar");
      expect(updatedBlock.startTime.toISOString()).toBe("2026-09-30T08:30:00.000Z");
    });

    it("performs outbound sync: pushes unmapped local time_blocks to Google Calendar", async () => {
      // Create local unmapped time block
      const [localBlock] = await db
        .insert(timeBlocks)
        .values({
          userId: testUserId,
          title: "Sync Test Block",
          description: "Created in LifeOS",
          startTime: new Date("2026-09-30T15:00:00.000Z"),
          endTime: new Date("2026-09-30T16:00:00.000Z"),
          durationMinutes: 60,
          status: "scheduled",
          commitmentLevel: "soft",
        })
        .returning();

      const createSpy = vi.spyOn(mockClient, "createEvent").mockResolvedValue({
        id: "google_outbound_created_001",
        summary: "Sync Test Block",
        start: { dateTime: "2026-09-30T15:00:00.000Z" },
        end: { dateTime: "2026-09-30T16:00:00.000Z" },
        etag: '"etag_outbound_1"',
      });

      const result = await syncEngine.sync(testUserId, { direction: "outbound" });

      expect(result.itemsCreated).toBe(1);
      expect(createSpy).toHaveBeenCalledWith(
        "mock_valid_token",
        expect.objectContaining({
          summary: "Sync Test Block",
          description: "Created in LifeOS",
        }),
        "primary"
      );

      // Verify mapping created
      const [mapping] = await db
        .select()
        .from(calendarEventMappings)
        .where(
          and(
            eq(calendarEventMappings.userId, testUserId),
            eq(calendarEventMappings.timeBlockId, localBlock.id)
          )
        );

      expect(mapping).toBeDefined();
      expect(mapping.externalEventId).toBe("google_outbound_created_001");
    });

    it("recovers from HTTP 410 Gone by clearing syncToken and executing full sync", async () => {
      // Set expired sync token in metadata
      const [updatedConn] = await db
        .update(integrationConnections)
        .set({
          metadata: {
            calendarId: "primary",
            syncToken: "expired_sync_token_410",
          },
        })
        .where(eq(integrationConnections.id, connectionId))
        .returning();

      let callCount = 0;
      vi.spyOn(mockClient, "listEvents").mockImplementation(async (_token, opts) => {
        callCount++;
        if (opts?.syncToken === "expired_sync_token_410") {
          throw new GoogleSyncTokenExpiredError();
        }
        return {
          items: [
            {
              id: "recovered_evt",
              summary: "Sync Test Block",
              start: { dateTime: "2026-09-30T17:00:00.000Z" },
              end: { dateTime: "2026-09-30T18:00:00.000Z" },
              status: "confirmed",
            },
          ],
          nextSyncToken: "fresh_new_sync_token",
        };
      });

      const result = await syncEngine.sync(testUserId, { direction: "inbound" });

      expect(callCount).toBe(2); // First failed with 410, second succeeded without syncToken
      expect(result.status).toBe("success");
      expect(result.itemsCreated).toBe(1);

      // Verify connection updated with fresh syncToken
      const [conn] = await db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.id, connectionId));

      const meta = conn.metadata as Record<string, unknown>;
      expect(meta.syncToken).toBe("fresh_new_sync_token");
    });

    it("records sync execution audit log and sync_logs entry", async () => {
      vi.spyOn(mockClient, "listEvents").mockResolvedValue({
        items: [],
        nextSyncToken: "sync_token_logs",
      });

      await syncEngine.sync(testUserId, { direction: "inbound" });

      const logs = await db
        .select()
        .from(syncLogs)
        .where(and(eq(syncLogs.userId, testUserId), eq(syncLogs.connectionId, connectionId)));

      expect(logs).toHaveLength(1);
      expect(logs[0].provider).toBe("google_calendar");
      expect(logs[0].status).toBe("success");
    });
  });
});
