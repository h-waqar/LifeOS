import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/server/preferences/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Preferences API route cannot be executed in the browser."
  );
}

/**
 * Enforce dynamic execution for authenticated user data endpoints.
 * Guarantees responses are not statically evaluated or cached across requests.
 */
export const dynamic = "force-dynamic";

/**
 * Cache-Control headers strictly isolating authenticated user data
 * and preventing any intermediary proxy, CDN, or browser caching.
 */
const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * Maximum permitted payload size for preferences mutations (32KB).
 * Defends against memory exhaustion DoS and unbounded buffer allocations.
 */
const MAX_PREFERENCES_BODY_SIZE = 32 * 1024;

/**
 * GET /api/preferences
 * Returns the preferences of the currently authenticated user.
 * Disregards any client-supplied userId in query parameters.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const preferences = await getUserPreferences(user.id);

    return NextResponse.json({ preferences }, { headers: SECURITY_CACHE_HEADERS });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("❌ Unexpected error in GET /api/preferences:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * PATCH /api/preferences
 * Updates preferences for the currently authenticated user.
 * Enforces server-side session identity: ignores and forbids any client-supplied userId.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    // 1. Content-Type verification
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Unsupported Media Type: Content-Type must be application/json" },
        { status: 415, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // 2. Request body size limit (Content-Length check)
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PREFERENCES_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload Too Large: Maximum request body size is 32KB" },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // 3. Safe body extraction and payload size guard
    let rawText: string;
    try {
      rawText = await req.text();
    } catch {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    if (new TextEncoder().encode(rawText).length > MAX_PREFERENCES_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload Too Large: Maximum request body size is 32KB" },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // 4. Client header sanitization & bounds enforcement
    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip");
    const rawUserAgent = req.headers.get("user-agent");

    const ipAddress = rawIp
      ? rawIp.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 128)
      : null;
    const userAgent = rawUserAgent
      ? rawUserAgent.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 512)
      : null;

    const preferences = await updateUserPreferences(user.id, body as any, {
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ preferences }, { headers: SECURITY_CACHE_HEADERS });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("❌ Unexpected error in PATCH /api/preferences:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

export const PUT = PATCH;
