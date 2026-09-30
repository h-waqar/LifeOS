# Phase 8: External Integrations — Research & Technical Spikes

**Phase:** Phase 8: External Integrations  
**Status:** Complete  
**Date:** 2026-09-30  
**Scope:** Google Calendar Two-Way Synchronization, GitHub Activity Ingestion, Automated Cloud Backup  

---

## 1. Overview & Objectives

Phase 8 connects LifeOS to external third-party services using secure, resilient adapter patterns. The core principles governing external integrations in LifeOS are:
1. **Optionality & Decoupling:** Integrations are strictly opt-in. LifeOS core domain functions (calendar, tasks, projects, notes) must work completely offline without external credentials or network connectivity (PRD Section 61).
2. **Zero Plaintext Credentials:** All OAuth tokens (access tokens, refresh tokens) and third-party secrets must be encrypted at rest using AES-256-GCM via the established `src/lib/crypto.ts` framework with `LIFEOS_ENCRYPTION_KEY` (SEC-01).
3. **Single-Tenant Security & Tenant Isolation:** All connections, mappings, and sync states are strictly scoped to the authenticated user's `userId`. Cross-user data leaks are prevented at the database and application layers.
4. **Reliable Two-Way Synchronization:** Google Calendar synchronization must support initial bootstrap sync, incremental delta synchronization via Google `syncToken`, bidirectional create/update/delete propagation, deterministic conflict resolution, and echo/loop prevention.
5. **Background Execution via Scheduler:** Synchronization runs on demand via user actions and automatically in the background using the PostgreSQL-backed scheduler engine developed in Phase 7.

---

## 2. Google Calendar API & OAuth 2.0 Specifications

### 2.1 OAuth 2.0 Flow
- **Authorization Endpoint:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Token Endpoint:** `https://oauth2.googleapis.com/token`
- **Userinfo Endpoint:** `https://www.googleapis.com/oauth2/v2/userinfo`
- **Required Scopes:**
  - `https://www.googleapis.com/auth/calendar.events` (read/write access to events)
  - `https://www.googleapis.com/auth/calendar.readonly` (view calendar metadata)
  - `https://www.googleapis.com/auth/userinfo.email` (identity verification)
- **Key Parameters:**
  - `access_type=offline` (mandatory to receive a `refresh_token`)
  - `prompt=consent` (ensures `refresh_token` is returned on reconnection)
  - `state` parameter: HMAC-signed or crypto-nonce CSRF token binding the session `userId` and redirect target.

### 2.2 Google Calendar REST Endpoints (v3)
- `GET /calendars/{calendarId}/events`:
  - Query parameters:
    - `syncToken`: For incremental synchronization. Google returns only events modified or deleted (`status=cancelled`) since the previous sync.
    - `timeMin` / `timeMax`: For bounded range queries (initial sync: window of -30 days to +90 days).
    - `singleEvents=true`: Expands recurring event series into distinct instances.
    - `maxResults=250`: Page size.
- `POST /calendars/{calendarId}/events`: Create new event.
- `PATCH /calendars/{calendarId}/events/{eventId}`: Update existing event.
- `DELETE /calendars/{calendarId}/events/{eventId}`: Delete event.

### 2.3 Incremental Sync & 410 Gone Handling
When calling `events.list` with a `syncToken`:
- Google returns `items` array with changed events and a `nextSyncToken`.
- If the syncToken expires (e.g. inactive for several weeks), Google API returns HTTP 410 Gone.
- **Handling Strategy:** Catch HTTP 410, clear the invalid `syncToken`, and fall back cleanly to a bounded full synchronization.

---

## 3. Two-Way Sync Design & Loop Prevention

### 3.1 Entity Mapping
| LifeOS `time_blocks` | Google Calendar `Event` | Notes |
|---|---|---|
| `id` (UUID) | - | Mapped via `calendar_event_mappings.time_block_id` |
| `title` | `summary` | Direct mapping with truncation fallback (255 chars) |
| `description` | `description` | HTML/Markdown preserved |
| `startTime` (ISO 8601) | `start.dateTime` / `start.date` | Converted to UTC Date |
| `endTime` (ISO 8601) | `end.dateTime` / `end.date` | Converted to UTC Date |
| `status` ('scheduled'/'cancelled') | `status` ('confirmed'/'cancelled') | Cancellation propagation |
| - | `id` (string) | Stored in `calendar_event_mappings.external_event_id` |
| - | `etag` (string) | Stored in `calendar_event_mappings.external_etag` |

### 3.2 Loop Prevention (Echo Breaker)
Without loop prevention, when LifeOS receives an event from Google and creates a local `time_block`, the local creation might trigger an outbound sync to Google, creating a duplicate or infinite ping-pong.
**Mitigation:**
1. Maintain `last_synced_at` and `external_etag` in `calendar_event_mappings`.
2. When synchronizing inbound from Google, update `last_synced_at` to `max(block.updatedAt, now())` and store the latest Google `etag`.
3. Outbound synchronization queries only `time_blocks` where `time_blocks.updated_at > calendar_event_mappings.last_synced_at`.
4. Domain event subscribers check if the mutation originated from the sync adapter (via `actor: "system_sync"`) and suppress immediate re-propagation.

### 3.3 Conflict Resolution Strategy
If an event was modified in **both** Google Calendar and LifeOS since the last sync:
- **Rule:** **Last-Write-Wins (LWW)** based on timestamps (`time_blocks.updatedAt` vs Google `event.updated`).
- If Google timestamp is newer, overwrite local block.
- If LifeOS timestamp is newer, update Google Calendar event.
- All conflicts and overwrite actions are recorded in `sync_logs` and `audit_log` with before/after state details.

---

## 4. Background Job & Scheduler Architecture

Phase 7 delivered the `SchedulerEngine` with periodic sweepers.
- A new periodic sweeper `googleCalendarSyncSweeper` is registered in `src/server/scheduler/engine.ts`.
- The sweeper runs every 5 minutes (or on cron tick), queries users with active `google_calendar` connections, acquires a PostgreSQL distributed lock (`scheduler_locks`), and runs incremental sync.
- Failures do not crash the scheduler daemon; failures increment connection error counters and log to `sync_logs`.

---

## 5. Security & Privacy Considerations

1. **Token Encryption:** Refresh tokens and access tokens are never stored in plaintext. They are encrypted using `encryptSecret(token)` and decrypted in-memory only when invoking Google APIs.
2. **Client Isolation:** API routes returning connection status (`/api/integrations/google-calendar/status`) strictly return sanitized DTOs (`{ connected: true, accountEmail: "user@gmail.com", lastSyncedAt: "..." }`) and NEVER return secrets, tokens, or encryption keys.
3. **State Nonce & CSRF:** OAuth initialization creates a cryptographically secure random state stored in a short-lived HTTP-only cookie. The callback endpoint verifies the state before exchanging the authorization code.
