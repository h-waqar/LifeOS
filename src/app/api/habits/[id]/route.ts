import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  getHabit,
  updateHabit,
  deleteHabit,
  NotFoundError,
  InvariantViolationError,
} from "@/server/habits/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Habit detail API route cannot be executed in the browser."
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
 * GET /api/habits/[id]
 * Retrieves a single habit with entry history and streak stats.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const { searchParams } = new URL(req.url);
    const referenceDate = searchParams.get("referenceDate") ?? undefined;

    const habit = await getHabit(user.id, id, referenceDate);
    if (!habit) {
      return NextResponse.json(
        { error: "Habit not found" },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { habit, entries: habit.entries ?? [] },
      { headers: SECURITY_CACHE_HEADERS }
    );
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
    console.error("❌ Unexpected error in GET /api/habits/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * PATCH /api/habits/[id]
 * Updates a single habit owned by the authenticated user.
 */
export async function PATCH(
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

    const actorInfo = {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    };

    const updated = await updateHabit(user.id, id, body, actorInfo);

    return NextResponse.json(
      { habit: updated },
      { headers: SECURITY_CACHE_HEADERS }
    );
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

    console.error("❌ Unexpected error in PATCH /api/habits/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/habits/[id]
 * Deletes a single habit owned by the authenticated user.
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const actorInfo = {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    };

    const result = await deleteHabit(user.id, id, actorInfo);

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

    console.error("❌ Unexpected error in DELETE /api/habits/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
