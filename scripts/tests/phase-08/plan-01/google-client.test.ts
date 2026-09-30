// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  GoogleCalendarClient,
  GoogleSyncTokenExpiredError,
  GoogleAuthError,
} from "@/server/integrations/google-calendar/client";
import type { GoogleCalendarEventsListResponse, GoogleCalendarEvent } from "@/server/integrations/google-calendar/types";

describe("Plan 08-01: GoogleCalendarClient (Unit Tests)", () => {
  describe("1. listEvents Request Formatting & Parameters", () => {
    it("formats standard time-bounded event queries with singleEvents=true and orderBy=startTime", async () => {
      let requestedUrl = "";
      let authHeader = "";

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        requestedUrl = url;
        authHeader = (init?.headers as Record<string, string>)?.Authorization || "";

        const mockResponse: GoogleCalendarEventsListResponse = {
          items: [
            {
              id: "evt_1",
              summary: "Team Standup",
              start: { dateTime: "2026-09-30T09:00:00Z" },
              end: { dateTime: "2026-09-30T09:30:00Z" },
            },
          ],
          nextSyncToken: "token_sync_abc123",
        };

        return {
          ok: true,
          status: 200,
          json: async () => mockResponse,
        } as unknown as Response;
      });

      const client = new GoogleCalendarClient(mockFetch);
      const timeMin = new Date("2026-09-01T00:00:00Z");
      const timeMax = new Date("2026-10-01T00:00:00Z");

      const result = await client.listEvents("mock_access_token_123", {
        calendarId: "primary",
        timeMin,
        timeMax,
      });

      expect(authHeader).toBe("Bearer mock_access_token_123");
      expect(requestedUrl).toContain("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      expect(requestedUrl).toContain(`timeMin=${encodeURIComponent(timeMin.toISOString())}`);
      expect(requestedUrl).toContain(`timeMax=${encodeURIComponent(timeMax.toISOString())}`);
      expect(requestedUrl).toContain("singleEvents=true");
      expect(requestedUrl).toContain("orderBy=startTime");
      expect(result.items).toHaveLength(1);
      expect(result.nextSyncToken).toBe("token_sync_abc123");
    });

    it("formats incremental sync query using syncToken without timeMin/timeMax", async () => {
      let requestedUrl = "";

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            nextSyncToken: "token_sync_def456",
          }),
        } as unknown as Response;
      });

      const client = new GoogleCalendarClient(mockFetch);
      await client.listEvents("mock_access_token", {
        syncToken: "token_prev_123",
      });

      expect(requestedUrl).toContain("syncToken=token_prev_123");
      expect(requestedUrl).not.toContain("timeMin");
      expect(requestedUrl).not.toContain("timeMax");
    });
  });

  describe("2. Error Handling & HTTP Status Code Mapping", () => {
    it("throws GoogleSyncTokenExpiredError on HTTP 410 Gone", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 410,
        text: async () => "Sync token is no longer valid",
      } as unknown as Response);

      const client = new GoogleCalendarClient(mockFetch);

      await expect(
        client.listEvents("mock_access_token", { syncToken: "invalid_sync_token" })
      ).rejects.toThrow(GoogleSyncTokenExpiredError);
    });

    it("throws GoogleAuthError on HTTP 401 Unauthorized", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      } as unknown as Response);

      const client = new GoogleCalendarClient(mockFetch);

      await expect(
        client.listEvents("expired_access_token")
      ).rejects.toThrow(GoogleAuthError);
    });
  });

  describe("3. Mutation Operations (Create, Update, Delete)", () => {
    it("creates an event via POST to calendar endpoint", async () => {
      let requestBody = "";
      let requestMethod = "";

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        requestMethod = init?.method || "";
        requestBody = init?.body as string;

        const createdEvent: GoogleCalendarEvent = {
          id: "google_evt_created",
          summary: "New Focus Block",
          start: { dateTime: "2026-09-30T14:00:00Z" },
          end: { dateTime: "2026-09-30T15:00:00Z" },
          etag: '"etag_created_123"',
        };

        return {
          ok: true,
          status: 200,
          json: async () => createdEvent,
        } as unknown as Response;
      });

      const client = new GoogleCalendarClient(mockFetch);
      const event = await client.createEvent("mock_token", {
        summary: "New Focus Block",
        start: { dateTime: "2026-09-30T14:00:00Z" },
        end: { dateTime: "2026-09-30T15:00:00Z" },
      });

      expect(requestMethod).toBe("POST");
      expect(JSON.parse(requestBody).summary).toBe("New Focus Block");
      expect(event.id).toBe("google_evt_created");
      expect(event.etag).toBe('"etag_created_123"');
    });

    it("updates an event via PATCH to calendar endpoint", async () => {
      let requestMethod = "";
      let requestedUrl = "";

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestMethod = init?.method || "";

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "evt_123",
            summary: "Updated Title",
            etag: '"etag_updated_456"',
          }),
        } as unknown as Response;
      });

      const client = new GoogleCalendarClient(mockFetch);
      const updated = await client.updateEvent("mock_token", "evt_123", {
        summary: "Updated Title",
      });

      expect(requestMethod).toBe("PATCH");
      expect(requestedUrl).toContain("/events/evt_123");
      expect(updated.summary).toBe("Updated Title");
    });

    it("deletes an event via DELETE to calendar endpoint", async () => {
      let requestMethod = "";
      let requestedUrl = "";

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestMethod = init?.method || "";

        return {
          ok: true,
          status: 204,
        } as unknown as Response;
      });

      const client = new GoogleCalendarClient(mockFetch);
      await client.deleteEvent("mock_token", "evt_to_delete");

      expect(requestMethod).toBe("DELETE");
      expect(requestedUrl).toContain("/events/evt_to_delete");
    });

    it("ignores 404 when deleting an event that does not exist in Google Calendar", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      } as unknown as Response);

      const client = new GoogleCalendarClient(mockFetch);
      await expect(client.deleteEvent("mock_token", "evt_missing")).resolves.not.toThrow();
    });
  });
});
