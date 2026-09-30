import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { getAnalyticsDashboard } from "@/server/analytics/service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "month", "custom"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid startDate format (YYYY-MM-DD)").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid endDate format (YYYY-MM-DD)").optional(),
});

/**
 * GET /api/analytics/dashboard
 * Returns unified cross-domain personal analytics and trend calculations (INTEL-01, INTEL-04).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));

    const dashboard = await getAnalyticsDashboard(user.id, {
      period: parsed.period,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    });

    return NextResponse.json(
      { data: dashboard },
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
        { error: "Invalid analytics query parameters", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/analytics/dashboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
