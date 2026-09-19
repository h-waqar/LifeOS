import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  toggleHabitEntry,
  NotFoundError,
  InvariantViolationError,
} from "@/server/habits/service";
import { toggleHabitEntrySchema } from "@/server/habits/validation";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Habit toggle API route cannot be executed in the browser."
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
 * POST /api/habits/[id]/toggle
 * Single-click check-in toggle: creates completion entry if missing, deletes if present.
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const { searchParams } = new URL(req.url);
    const queryDate = searchParams.get("date");
    const referenceDate = searchParams.get("referenceDate") ?? undefined;

    let bodyDate: string | undefined;

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_HABITS_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload Too Large: Body exceeds maximum allowed size" },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const contentType = req.headers.get("content-type");
    if (contentType && contentType.toLowerCase().includes("application/json")) {
      const rawText = await req.text();
      if (rawText.trim().length > 0) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return NextResponse.json(
            { error: "Malformed JSON payload in request body" },
            { status: 400, headers: SECURITY_CACHE_HEADERS }
          );
        }

        const parseResult = toggleHabitEntrySchema.safeParse(parsed);
        if (!parseResult.success) {
          return NextResponse.json(
            { error: "Validation error", issues: parseResult.error.flatten() },
            { status: 400, headers: SECURITY_CACHE_HEADERS }
          );
        }
        bodyDate = parseResult.data.date;
      }
    }

    const targetDate = bodyDate ?? queryDate ?? undefined;

    const actorInfo = {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    };

    const result = await toggleHabitEntry(
      user.id,
      id,
      targetDate,
      actorInfo,
      referenceDate
    );

    return NextResponse.json(result, {
      status: 200,
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

    console.error("❌ Unexpected error in POST /api/habits/[id]/toggle:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
