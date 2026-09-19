import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { getDailyPlanHistory } from "@/server/daily-plan/service";
import { dailyPlanHistoryQuerySchema } from "@/server/daily-plan/validation";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/daily-plan/history
 * Retrieves daily plan completion history and trend metrics across weekly/monthly horizons. (PLAN-04)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const queryObject = Object.fromEntries(searchParams.entries());

    const parseResult = dailyPlanHistoryQuerySchema.safeParse(queryObject);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parseResult.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const history = await getDailyPlanHistory(user.id, parseResult.data);

    return NextResponse.json(
      { history },
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
    console.error("❌ Unexpected error in GET /api/daily-plan/history:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
