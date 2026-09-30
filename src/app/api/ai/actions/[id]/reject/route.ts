import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { rejectAction } from "@/server/ai/hitl/gate-service";
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

const rejectSchema = z.object({
  reason: z.string().max(1000).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/ai/actions/[id]/reject
 * Rejects a pending action with an optional reason.
 */
export async function POST(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    let reason: string | undefined;
    try {
      const body = await req.json();
      const parsed = rejectSchema.safeParse(body);
      if (parsed.success) {
        reason = parsed.data.reason;
      }
    } catch {
      // Body is optional
    }

    const result = await rejectAction(user.id, id, reason);

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

    console.error("POST /api/ai/actions/[id]/reject error:", error);
    return NextResponse.json(
      { error: (error as Error)?.message || "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
