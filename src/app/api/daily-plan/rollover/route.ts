import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  executeRollover,
  NotFoundError,
  InvariantViolationError,
} from "@/server/daily-plan/service";
import { executeRolloverSchema } from "@/server/daily-plan/validation";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * POST /api/daily-plan/rollover
 * Executes zero-duplication rollover of uncompleted tasks. (PLAN-03)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const body = await req.json();

    const parseResult = executeRolloverSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parseResult.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const ipAddress =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    const result = await executeRollover(user.id, parseResult.data, {
      ipAddress,
      userAgent,
      actor: user.id,
    });

    return NextResponse.json(
      result,
      { status: 200, headers: SECURITY_CACHE_HEADERS }
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
    if (error instanceof InvariantViolationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("❌ Unexpected error in POST /api/daily-plan/rollover:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
