import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  removeTaskDependency,
  NotFoundError,
  InvariantViolationError,
} from "@/server/tasks/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Task dependency item API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

interface RouteContext {
  params: Promise<{ id: string; dependsOnId: string }>;
}

/**
 * DELETE /api/tasks/[id]/dependencies/[dependsOnId]
 * Removes a prerequisite dependency between task [id] and [dependsOnId].
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id, dependsOnId } = await context.params;

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const result = await removeTaskDependency(user.id, id, dependsOnId, {
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json(result, { headers: SECURITY_CACHE_HEADERS });
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
    console.error(
      "❌ Unexpected error in DELETE /api/tasks/[id]/dependencies/[dependsOnId]:",
      error
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
