import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { getActionById } from "@/server/ai/hitl/gate-service";
import {
  ActionNotFoundError,
  ActionForbiddenError,
  ActionExpiredError,
} from "@/server/ai/hitl/types";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/ai/actions/[id]
 * Retrieves action preview and status.
 */
export async function GET(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const action = await getActionById(user.id, id);

    return NextResponse.json(
      { data: action },
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
    if (error instanceof ActionExpiredError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 410, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("GET /api/ai/actions/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
