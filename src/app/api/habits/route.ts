import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  createHabit,
  listHabits,
  NotFoundError,
  InvariantViolationError,
} from "@/server/habits/service";
import { habitsQuerySchema } from "@/server/habits/validation";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Habits API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const MAX_HABITS_BODY_SIZE = 32 * 1024;

/**
 * GET /api/habits
 * Lists all habits owned by the authenticated user with optional filtering and streak calculations.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const queryObject = Object.fromEntries(searchParams.entries());
    const queryParse = habitsQuerySchema.safeParse(queryObject);

    if (!queryParse.success) {
      return NextResponse.json(
        { error: "Validation error", issues: queryParse.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { status, timeOfDay, goalId, referenceDate } = queryParse.data;
    const habitsList = await listHabits(
      user.id,
      { status, timeOfDay, goalId },
      referenceDate
    );

    return NextResponse.json(
      { habits: habitsList },
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
    console.error("❌ Unexpected error in GET /api/habits:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/habits
 * Creates a new habit owned by the authenticated user.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

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

    const newHabit = await createHabit(user.id, body, actorInfo);

    return NextResponse.json(
      { habit: newHabit },
      { status: 201, headers: SECURITY_CACHE_HEADERS }
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

    console.error("❌ Unexpected error in POST /api/habits:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
