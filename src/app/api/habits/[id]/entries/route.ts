import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  logHabitEntry,
  deleteHabitEntry,
  NotFoundError,
  InvariantViolationError,
} from "@/server/habits/service";
import { deleteHabitEntrySchema } from "@/server/habits/validation";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Habit entries API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const MAX_HABITS_BODY_SIZE = 32 * 1024;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/habits/[id]/entries
 * Idempotently logs or updates a habit completion entry for a date.
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const contentType = req.headers.get("content-type");
    if (
      !contentType ||
      !contentType.toLowerCase().includes("application/json")
    ) {
      return NextResponse.json(
        {
          error: "Unsupported Media Type: Content-Type must be application/json",
        },
        { status: 415, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_HABITS_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload Too Large: Body exceeds maximum allowed size" },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON payload in request body" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const referenceDate = searchParams.get("referenceDate") ?? undefined;

    const actorInfo = {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    };

    const result = await logHabitEntry(
      user.id,
      id,
      body,
      actorInfo,
      referenceDate
    );

    return NextResponse.json(result, {
      status: 201,
      headers: SECURITY_CACHE_HEADERS,
    });
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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof InvariantViolationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", issues: error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("❌ Unexpected error in POST /api/habits/[id]/entries:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/habits/[id]/entries
 * Deletes a check-in entry for a given date. Date can be provided in query string (?date=YYYY-MM-DD) or body.
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const { searchParams } = new URL(req.url);
    let targetDate = searchParams.get("date");

    if (!targetDate) {
      // Check if body was provided
      try {
        const body = await req.json();
        targetDate = body?.date;
      } catch {
        // Body was empty or non-JSON; handled by validation below
      }
    }

    const parseResult = deleteHabitEntrySchema.safeParse({ date: targetDate });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parseResult.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const referenceDate = searchParams.get("referenceDate") ?? undefined;

    const actorInfo = {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    };

    const result = await deleteHabitEntry(
      user.id,
      id,
      parseResult.data.date,
      actorInfo,
      referenceDate
    );

    return NextResponse.json(result, { headers: SECURITY_CACHE_HEADERS });
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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof InvariantViolationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("❌ Unexpected error in DELETE /api/habits/[id]/entries:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
