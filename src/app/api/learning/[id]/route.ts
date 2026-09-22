import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  getLearningItemById,
  updateLearningItem,
  deleteLearningItem,
  restoreLearningItem,
  NotFoundError,
  InvariantViolationError,
} from "@/server/learning/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Learning [id] API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const MAX_BODY_SIZE = 64 * 1024; // 64KB max payload

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/learning/[id]
 * Retrieves learning item details including linked notes and goal/project info.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const learningItem = await getLearningItemById(user.id, id);

    return NextResponse.json(
      { learningItem, data: learningItem },
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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/learning/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * PATCH /api/learning/[id]
 * Updates learning item.
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleUpdate(req, context);
}

/**
 * PUT /api/learning/[id]
 * Updates learning item.
 */
export async function PUT(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleUpdate(req, context);
}

async function handleUpdate(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload too large. Maximum body size is 64KB." },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const updated = await updateLearningItem(user.id, id, body);

    return NextResponse.json(
      { learningItem: updated, data: updated },
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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof InvariantViolationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("PATCH/PUT /api/learning/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/learning/[id]
 * Deletes or archives a learning item.
 * Optional query parameter: ?hard=true (permanent) or ?restore=true (unarchive)
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);

    if (searchParams.get("hard") === "true") {
      const res = await deleteLearningItem(user.id, id, { hard: true });
      return NextResponse.json(
        res,
        { status: 200, headers: SECURITY_CACHE_HEADERS }
      );
    }

    if (searchParams.get("restore") === "true") {
      const restored = await restoreLearningItem(user.id, id);
      return NextResponse.json(
        { success: true, learningItem: restored, data: restored },
        { status: 200, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // Default: Soft archive
    const res = await deleteLearningItem(user.id, id, { hard: false });
    return NextResponse.json(
      res,
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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("DELETE /api/learning/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
