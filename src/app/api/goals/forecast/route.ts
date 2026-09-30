import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { getAllGoalsRiskForecasts } from "@/server/goals/forecasting/service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const querySchema = z.object({
  horizon: z.enum(["all", "long_term", "medium_term", "short_term"]).optional(),
  area: z
    .enum([
      "all",
      "health",
      "career",
      "finance",
      "personal_development",
      "relationships",
      "general",
    ])
    .optional(),
  status: z
    .enum(["all", "not_started", "in_progress", "completed", "paused", "archived"])
    .optional(),
});

/**
 * GET /api/goals/forecast
 * Returns risk forecasts and portfolio risk distribution for all active user goals (INTEL-02).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));

    const summary = await getAllGoalsRiskForecasts(user.id, parsed);

    return NextResponse.json(
      { data: summary },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid forecast query parameters", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/goals/forecast error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
