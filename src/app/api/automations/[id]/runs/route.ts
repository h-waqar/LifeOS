import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { getAutomationRuns } from "@/server/automations/service";
import {
  listRunsQuerySchema,
  NotFoundError,
} from "@/server/automations/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Automation runs API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/automations/[id]/runs
 * Fetches execution run history for a given automation owned by the user.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "Automation ID is required" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const queryObject = Object.fromEntries(searchParams.entries());
    const queryParse = listRunsQuerySchema.safeParse(queryObject);

    if (!queryParse.success) {
      return NextResponse.json(
        { error: "Validation error", issues: queryParse.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { status, limit, offset } = queryParse.data;

    const runs = await getAutomationRuns(user.id, id.trim(), {
      status,
      limit,
      offset,
    });

    return NextResponse.json(
      { data: runs, count: runs.length },
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
    console.error("[GET /api/automations/[id]/runs] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
