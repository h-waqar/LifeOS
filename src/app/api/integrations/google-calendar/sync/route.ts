import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { googleCalendarSyncEngine } from "@/server/integrations/google-calendar/sync-engine";
import { syncOptionsSchema } from "@/server/integrations/google-calendar/types";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * POST /api/integrations/google-calendar/sync
 * Manually triggers two-way synchronization.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      // Empty body is valid; uses defaults
    }

    const parseResult = syncOptionsSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parseResult.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { fullSync, direction, calendarId, timeMin, timeMax } = parseResult.data;

    const result = await googleCalendarSyncEngine.sync(user.id, {
      fullSync,
      direction,
      calendarId,
      timeMin: timeMin ? new Date(timeMin) : undefined,
      timeMax: timeMax ? new Date(timeMax) : undefined,
    });

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
    console.error("❌ Unexpected error in POST /api/integrations/google-calendar/sync:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
