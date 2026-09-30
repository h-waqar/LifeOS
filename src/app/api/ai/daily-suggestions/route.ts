import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import { generateDailySuggestions } from "@/server/ai/proactive/daily-planner";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/ai/daily-suggestions
 * Proactive daily planning suggestions and schedule recommendations.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? undefined;

    const suggestions = await generateDailySuggestions(user.id, date);

    return NextResponse.json(
      { data: suggestions },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("GET /api/ai/daily-suggestions error:", error);
    return NextResponse.json(
      { error: "Failed to generate daily planning suggestions", code: "INTERNAL_ERROR" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
