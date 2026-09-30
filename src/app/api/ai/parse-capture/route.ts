import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import { parseQuickCapture } from "@/server/ai/nlp/quick-capture-parser";
import { parseCaptureRequestSchema } from "@/server/ai/nlp/types";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * POST /api/ai/parse-capture
 * Natural language entity extraction from raw text into structured LifeOS tasks/events.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const body = await req.json();
    const validated = parseCaptureRequestSchema.parse(body);

    const refDate = validated.referenceDate
      ? new Date(validated.referenceDate)
      : new Date();

    const result = await parseQuickCapture(user.id, validated.input, {
      referenceDate: refDate,
      timezone: validated.timezone,
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
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("POST /api/ai/parse-capture error:", error);
    return NextResponse.json(
      { error: "Failed to parse quick capture input", code: "INTERNAL_ERROR" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
