import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { deleteNotification } from "@/server/notifications/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Notification delete route cannot be executed in the browser."
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
 * DELETE /api/notifications/[id]
 * Deletes a notification strictly owned by the authenticated user.
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const deleted = await deleteNotification(user.id, id.trim());

    if (!deleted) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true },
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
    console.error("❌ Unexpected error in DELETE /api/notifications/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
