# H12 — Operational Healthcheck & Diagnostics Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H12 |
| Status | PENDING |
| Priority | HIGH |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that the operational healthcheck endpoint (`GET /api/health`) provides reliable, unauthenticated system observability without compromising security. This encompasses validating live database connectivity verification, millisecond latency measurement, security cache-control headers (`no-cache, no-store, must-revalidate`), fail-closed HTTP 503 response upon database disconnection, and absolute prevention of database credentials, connection strings, hostnames, or internal architecture details from leaking in the HTTP response.

## Preconditions

1. LifeOS application running locally or in staging (`http://localhost:3000`).
2. PostgreSQL database container running and accessible.
3. Terminal with `curl` or browser with Developer Tools Network panel.
4. Ability to simulate database disruption (e.g. `docker compose pause db` or stopping Postgres).

## Manual Test Procedure

### Step 1: Live Healthy System Verification
1. Open a browser or terminal and issue a request to the healthcheck endpoint:
   ```bash
   curl -i http://localhost:3000/api/health
   ```
2. Inspect the HTTP status code:
   - Must be `HTTP/1.1 200 OK` (or `HTTP/2 200`).
3. Inspect the response headers:
   - `Cache-Control: no-cache, no-store, must-revalidate`
   - `Pragma: no-cache`
   - `Content-Type: application/json`
4. Inspect the JSON body:
   - `status`: `"healthy"`
   - `database`: `"connected"`
   - `latencyMs`: numeric value (e.g. `< 50ms`)
   - `timestamp`: valid ISO 8601 string (e.g. `2026-09-12T...Z`)
5. Verify that NO internal connection strings, user credentials, ports, or PostgreSQL server versions are displayed.

### Step 2: Unauthenticated Access Confirmation
1. Verify this endpoint requires NO cookies, NO Bearer tokens, and NO authentication session.
2. Request `/api/health` from an incognito window with all cookies cleared.
3. Confirm HTTP 200 is returned immediately.

### Step 3: Simulated Database Disconnection / Outage
1. In terminal, simulate database unavailability by pausing or stopping the PostgreSQL container:
   ```bash
   docker compose pause db  # or docker compose stop db
   ```
2. Immediately execute:
   ```bash
   curl -i http://localhost:3000/api/health
   ```
3. Verify the HTTP response:
   - Must be `HTTP/1.1 503 Service Unavailable`.
   - Inspect JSON body:
     - `status`: `"unhealthy"`
     - `database`: `"disconnected"` (or `"error"`)
     - `error`: generic error description (e.g. `"Database connectivity check failed"`)
   - Confirm security cache headers (`no-cache, no-store, must-revalidate`) are still present.
   - Confirm that NO PostgreSQL driver stack traces, passwords, or connection URIs are exposed in the JSON response.

### Step 4: System Recovery
1. Resume the PostgreSQL container:
   ```bash
   docker compose unpause db  # or docker compose start db
   ```
2. Query `/api/health` again.
3. Verify the endpoint immediately recovers to `HTTP/1.1 200 OK` with `status: "healthy"` and database `connected`.

## Expected Result

- `/api/health` provides fast, unauthenticated monitoring of core database health and response latency.
- Strict security cache headers prevent proxies and browsers from serving stale health reports.
- Disconnections fail closed with HTTP 503 without leaking environment secrets or connection strings.
- The endpoint recovers cleanly when PostgreSQL connectivity is restored.

## Failure Conditions

1. `/api/health` requires an authentication cookie to report system health.
2. Endpoint returns 200 OK when database is disconnected or down.
3. Healthcheck leaks PostgreSQL passwords, hostnames, or credentials in error messages or headers.
4. `Cache-Control` header allows caching of health responses.
5. Endpoint crashes the server or hangs indefinitely when database is paused.

## Evidence Required

- Terminal transcript or screenshot of `curl -i http://localhost:3000/api/health` showing HTTP 200, latency, and cache headers.
- Terminal transcript or screenshot showing HTTP 503 when PostgreSQL is paused, demonstrating secure error payload.
- Evidence of clean recovery to HTTP 200 upon unpausing the database.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
