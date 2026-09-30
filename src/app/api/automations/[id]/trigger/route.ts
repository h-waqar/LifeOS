import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { getAutomationById } from "@/server/automations/service";
import { executeAutomationById } from "@/server/automations/engine";
import { NotFoundError } from "@/server/automations/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Automation trigger route cannot be executed in the browser."
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
 * POST /api/automations/[id]/trigger
 * Manually triggers an automation owned by the authenticated user.
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "Automation ID is required" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // Verify existence and ownership
    const automation = await getAutomationById(user.id, id.trim());

    if (!automation.isActive) {
      return NextResponse.json(
        { error: "Cannot trigger an inactive automation. Enable it first." },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const result = await executeAutomationById(
      user.id,
      id.trim(),
      "manual.trigger",
      { manual: true, triggeredBy: "user", triggeredAt: new Date().toISOString() },
      { depth: 0, actor: `user:${user.id}` }
    );

    if (!result) {
      return NextResponse.json(
        { error: "Automation could not be executed" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { data: result },
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
    console.error("[POST /api/automations/[id]/trigger] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
