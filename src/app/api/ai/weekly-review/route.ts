import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import { generateWeeklyReview } from "@/server/ai/proactive/weekly-synthesizer";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/ai/weekly-review
 * Generates an on-demand strategic weekly review synthesizing execution velocity,
 * habit adherence, and financial movements over the past 7 days.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const endDate = searchParams.get("endDate") ?? undefined;

    const review = await generateWeeklyReview(user.id, endDate);

    return NextResponse.json(
      { data: review },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("GET /api/ai/weekly-review error:", error);
    return NextResponse.json(
      { error: "Failed to generate weekly review", code: "INTERNAL_ERROR" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
