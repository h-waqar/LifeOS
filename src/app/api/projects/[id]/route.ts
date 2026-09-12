import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  getProject,
  updateProject,
  deleteProject,
  NotFoundError,
} from "@/server/projects/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Project detail API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const MAX_PROJECTS_BODY_SIZE = 32 * 1024;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]
 * Retrieves a single project owned by the authenticated user.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const project = await getProject(user.id, id);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { project },
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
    console.error("❌ Unexpected error in GET /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 * Updates a project owned by the authenticated user.
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    // 1. Content-Type verification
    const contentType = req.headers.get("content-type");
    if (
      !contentType ||
      !contentType.toLowerCase().includes("application/json")
    ) {
      return NextResponse.json(
        {
          error: "Unsupported Media Type: Content-Type must be application/json",
        },
        { status: 415, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // 2. Request body size limit (Content-Length check)
    const contentLength = req.headers.get("content-length");
    if (
      contentLength &&
      parseInt(contentLength, 10) > MAX_PROJECTS_BODY_SIZE
    ) {
      return NextResponse.json(
        { error: "Payload Too Large: Maximum request body size is 32KB" },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // 3. Safe body extraction and payload size guard
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PROJECTS_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload Too Large: Maximum request body size is 32KB" },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const project = await updateProject(
      user.id,
      id,
      parsedJson as Parameters<typeof updateProject>[2],
      {
        ipAddress: clientIp,
        userAgent,
      }
    );

    return NextResponse.json(
      { project },
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
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", issues: error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("❌ Unexpected error in PATCH /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Deletes a project owned by the authenticated user.
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    await deleteProject(user.id, id, {
      ipAddress: clientIp,
      userAgent,
    });

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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("❌ Unexpected error in DELETE /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
