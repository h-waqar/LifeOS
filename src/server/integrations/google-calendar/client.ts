import type {
  GoogleCalendarEvent,
  GoogleCalendarEventsListResponse,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Google Calendar Client cannot be initialized in the browser."
  );
}

const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleSyncTokenExpiredError extends Error {
  readonly status = 410;
  constructor(message = "Google sync token is invalid or expired (HTTP 410)") {
    super(message);
    this.name = "GoogleSyncTokenExpiredError";
  }
}

export class GoogleAuthError extends Error {
  readonly status = 401;
  constructor(message = "Google API authentication failed (HTTP 401)") {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export interface ListEventsOptions {
  calendarId?: string;
  syncToken?: string;
  pageToken?: string;
  timeMin?: Date;
  timeMax?: Date;
  singleEvents?: boolean;
  maxResults?: number;
}

export class GoogleCalendarClient {
  private customFetch?: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.customFetch = customFetch;
  }

  private async fetchWithAuth(
    url: string,
    accessToken: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const fetchFn = this.customFetch ?? fetch;
    const response = await fetchFn(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new GoogleAuthError();
    }

    if (response.status === 410) {
      throw new GoogleSyncTokenExpiredError();
    }

    return response;
  }

  /**
   * Lists events from Google Calendar.
   * Supports incremental synchronization via syncToken, pagination via pageToken,
   * or time-bounded queries.
   */
  async listEvents(
    accessToken: string,
    options: ListEventsOptions = {}
  ): Promise<GoogleCalendarEventsListResponse> {
    const calendarId = options.calendarId ?? "primary";
    const url = new URL(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
    );

    if (options.syncToken) {
      url.searchParams.set("syncToken", options.syncToken);
    } else {
      if (options.timeMin) {
        url.searchParams.set("timeMin", options.timeMin.toISOString());
      }
      if (options.timeMax) {
        url.searchParams.set("timeMax", options.timeMax.toISOString());
      }
      url.searchParams.set("singleEvents", String(options.singleEvents ?? true));
      url.searchParams.set("orderBy", "startTime");
    }

    if (options.pageToken) {
      url.searchParams.set("pageToken", options.pageToken);
    }

    url.searchParams.set("maxResults", String(options.maxResults ?? 250));

    const response = await this.fetchWithAuth(url.toString(), accessToken);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar listEvents failed (${response.status}): ${errText}`);
    }

    return (await response.json()) as GoogleCalendarEventsListResponse;
  }

  /**
   * Fetches a single event by ID. Returns null if event is not found (404).
   */
  async getEvent(
    accessToken: string,
    eventId: string,
    calendarId = "primary"
  ): Promise<GoogleCalendarEvent | null> {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const response = await this.fetchWithAuth(url, accessToken);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar getEvent failed (${response.status}): ${errText}`);
    }

    return (await response.json()) as GoogleCalendarEvent;
  }

  /**
   * Creates a new event in Google Calendar.
   */
  async createEvent(
    accessToken: string,
    event: Partial<GoogleCalendarEvent>,
    calendarId = "primary"
  ): Promise<GoogleCalendarEvent> {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
    const response = await this.fetchWithAuth(url, accessToken, {
      method: "POST",
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar createEvent failed (${response.status}): ${errText}`);
    }

    return (await response.json()) as GoogleCalendarEvent;
  }

  /**
   * Updates an existing event in Google Calendar.
   */
  async updateEvent(
    accessToken: string,
    eventId: string,
    event: Partial<GoogleCalendarEvent>,
    calendarId = "primary"
  ): Promise<GoogleCalendarEvent> {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const response = await this.fetchWithAuth(url, accessToken, {
      method: "PATCH",
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar updateEvent failed (${response.status}): ${errText}`);
    }

    return (await response.json()) as GoogleCalendarEvent;
  }

  /**
   * Deletes an event from Google Calendar. Ignores 404 if event already deleted.
   */
  async deleteEvent(
    accessToken: string,
    eventId: string,
    calendarId = "primary"
  ): Promise<void> {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const response = await this.fetchWithAuth(url, accessToken, {
      method: "DELETE",
    });

    if (response.status === 404) {
      return; // Already deleted
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar deleteEvent failed (${response.status}): ${errText}`);
    }
  }
}

export const googleCalendarClient = new GoogleCalendarClient();
