import { auth } from "@/server/auth";
import type { User, Session } from "@/server/db/schema";
import { SQL, and, eq } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// Server-only runtime protection: authorization guards must never be called from browser clients
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Server authorization guard cannot be initialized in the browser."
  );
}

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHORIZED";

  constructor(
    message = "Authentication required. Active session is missing, invalid, or expired."
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";

  constructor(
    message = "Access denied. Resource does not belong to the authenticated user."
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface AuthenticatedContext {
  user: User;
  session: Session;
}

export type HeaderSource =
  | Request
  | Headers
  | { headers: Headers }
  | HeadersInit
  | undefined;

/**
 * Resolves incoming HTTP headers from explicit request/headers arguments
 * or dynamically from Next.js server context (`next/headers`).
 */
async function resolveHeaders(source?: HeaderSource): Promise<Headers> {
  if (source instanceof Request) {
    return source.headers;
  }
  if (source instanceof Headers) {
    return source;
  }
  if (source && typeof source === "object" && "headers" in source && source.headers instanceof Headers) {
    return source.headers;
  }
  if (source && typeof source === "object" && !(source instanceof Headers)) {
    return new Headers(source as HeadersInit);
  }

  // If running in Next.js Server Components / Actions / Route Handlers without explicit request arg
  try {
    const { headers } = await import("next/headers");
    const nextHeaders = await headers();
    return nextHeaders as unknown as Headers;
  } catch {
    // If outside Next.js request context (e.g. standalone test or background script)
    return new Headers();
  }
}

/**
 * Resolves and validates the current session server-side.
 * Returns null if unauthenticated or session is invalid, without throwing.
 */
export async function getOptionalAuthenticatedUser(
  source?: HeaderSource
): Promise<AuthenticatedContext | null> {
  try {
    const headers = await resolveHeaders(source);
    const result = await auth.api.getSession({ headers });

    if (!result || !result.user || !result.session) {
      return null;
    }

    return {
      user: result.user as User,
      session: result.session as Session,
    };
  } catch {
    return null;
  }
}

/**
 * Mandatory Server-Side Authentication Boundary.
 *
 * Resolves the current session through Better Auth and validates user identity.
 * FAILS CLOSED: Throws an `AuthenticationError` (401) if:
 * - Session is missing
 * - Session is malformed or forged
 * - Session has expired
 * - Session has been revoked / logged out
 *
 * Never trusts client-supplied user IDs from request body, query params, or URL path.
 */
export async function requireAuthenticatedUser(
  source?: HeaderSource
): Promise<AuthenticatedContext> {
  const context = await getOptionalAuthenticatedUser(source);

  if (!context) {
    throw new AuthenticationError();
  }

  return context;
}

/**
 * Mandatory Resource Ownership Boundary.
 *
 * Enforces that the requested resource belongs to the authenticated user.
 * FAILS CLOSED: Throws an `AuthorizationError` (403) if `resourceUserId !== authenticatedUserId`.
 */
export function requireResourceOwnership(
  resourceUserId: string | null | undefined,
  authenticatedUserId: string
): void {
  if (!resourceUserId || !authenticatedUserId || resourceUserId !== authenticatedUserId) {
    throw new AuthorizationError();
  }
}

/**
 * Query-Level Ownership Enforcement Helper.
 *
 * Generates an SQL condition enforcing `WHERE table.user_id = authenticated_user_id`.
 * Ensures authorization is enforced directly inside the database query rather than
 * fetching data first and checking ownership in application memory.
 */
export function withUserScope(
  userColumn: PgColumn,
  authenticatedUserId: string,
  extraCondition?: SQL
): SQL {
  if (!authenticatedUserId) {
    throw new AuthorizationError("Cannot construct query scope: authenticated user ID is required.");
  }

  const ownershipCondition = eq(userColumn, authenticatedUserId);

  if (extraCondition) {
    return and(ownershipCondition, extraCondition)!;
  }

  return ownershipCondition;
}
