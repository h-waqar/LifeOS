import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  completeTimeBlock,
  NotFoundError,
  InvariantViolationError,
} from "@/server/calendar/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Complete time block route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/time-blocks/[id]/complete
 * Marks a time block as completed and updates task actual duration (CAL-03).
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    let body: unknown = {};
    const text = await req.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Malformed JSON payload in request body" },
          { status: 400, headers: SECURITY_CACHE_HEADERS }
        );
      }
    }

    const actorInfo = {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    };

    const updated = await completeTimeBlock(user.id, id, body as any, actorInfo);

    return NextResponse.json(
      { timeBlock: updated },
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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof InvariantViolationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", issues: error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("❌ Unexpected error in POST /api/time-blocks/[id]/complete:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
