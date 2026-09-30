import { z } from "zod";

export type IntegrationProvider = "google_calendar" | "github" | "backup";

export type IntegrationStatus = "connected" | "disconnected" | "error" | "expired";

export type SyncDirection = "inbound" | "outbound" | "bidirectional";

export type SyncType = "initial" | "incremental" | "outbound" | "inbound" | "manual";

export type SyncStatus = "success" | "partial" | "failed";

export interface GoogleCalendarConnectionDTO {
  connected: boolean;
  status: IntegrationStatus;
  accountEmail: string | null;
  scope: string | null;
  lastSyncedAt: string | null;
  syncStats?: {
    totalMappings: number;
    lastSyncStatus?: SyncStatus;
    lastErrorMessage?: string | null;
  };
}

export interface GoogleCalendarDateTime {
  dateTime?: string; // ISO 8601 string
  date?: string; // YYYY-MM-DD string for all-day events
  timeZone?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: GoogleCalendarDateTime;
  end: GoogleCalendarDateTime;
  status?: "confirmed" | "tentative" | "cancelled";
  etag?: string;
  updated?: string; // ISO 8601 string
  htmlLink?: string;
}

export interface GoogleCalendarEventsListResponse {
  kind?: string;
  etag?: string;
  summary?: string;
  updated?: string;
  timeZone?: string;
  accessRole?: string;
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleUserInfo {
  id?: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
}

export interface SyncOptions {
  fullSync?: boolean;
  direction?: SyncDirection;
  calendarId?: string; // default "primary"
  timeMin?: Date;
  timeMax?: Date;
  dryRun?: boolean;
}

export interface SyncResult {
  connectionId: string;
  userId: string;
  provider: "google_calendar";
  syncType: SyncType;
  status: SyncStatus;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  itemsFailed: number;
  errorMessage?: string;
  nextSyncToken?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface CalendarEventMappingDTO {
  id: string;
  userId: string;
  connectionId: string;
  timeBlockId: string;
  externalCalendarId: string;
  externalEventId: string;
  externalEtag: string | null;
  syncDirection: SyncDirection;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

// Zod validation schemas
export const syncOptionsSchema = z.object({
  fullSync: z.boolean().optional().default(false),
  direction: z.enum(["inbound", "outbound", "bidirectional"]).optional().default("bidirectional"),
  calendarId: z.string().optional().default("primary"),
  timeMin: z.string().datetime().optional(),
  timeMax: z.string().datetime().optional(),
});

export const callbackQuerySchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().min(1, "State is required"),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const disconnectOptionsSchema = z.object({
  deleteMappedBlocks: z.boolean().optional().default(false),
});
