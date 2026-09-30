import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { confirmAndExecuteAction } from "@/server/ai/hitl/action-executor";
import {
  ActionNotFoundError,
  ActionForbiddenError,
  ActionConflictError,
  ActionExpiredError,
} from "@/server/ai/hitl/types";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/ai/actions/[id]/confirm
 * Confirms and executes an intercepted pending action under a pessimistic database lock.
 */
export async function POST(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const result = await confirmAndExecuteAction(user.id, id, {
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      { data: result },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ActionForbiddenError || error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: "ACTION_FORBIDDEN" },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ActionNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ActionConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ActionExpiredError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 410, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("POST /api/ai/actions/[id]/confirm error:", error);
    return NextResponse.json(
      { error: (error as Error)?.message || "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
