import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { getCalendarFeed } from "@/server/calendar/service";
import { calendarFeedQuerySchema } from "@/server/calendar/validation";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Calendar API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/calendar
 * Aggregates calendar feed items: time blocks with conflicts, task deadlines, scheduled tasks, project deadlines, and habit cues.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const queryObject = Object.fromEntries(searchParams.entries());
    const queryParse = calendarFeedQuerySchema.safeParse(queryObject);

    if (!queryParse.success) {
      return NextResponse.json(
        { error: "Validation error", issues: queryParse.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const feed = await getCalendarFeed(user.id, queryParse.data);

    return NextResponse.json(
      { feed },
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
    console.error("❌ Unexpected error in GET /api/calendar:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
