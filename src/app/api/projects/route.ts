import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  createProject,
  listProjects,
  createProjectSchema,
} from "@/server/projects/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Projects API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const MAX_PROJECTS_BODY_SIZE = 32 * 1024;

const projectsQuerySchema = z
  .object({
    status: z
      .enum(["planning", "active", "paused", "completed", "archived"])
      .optional(),
    area: z
      .enum([
        "health",
        "career",
        "finance",
        "personal_development",
        "relationships",
        "general",
      ])
      .optional(),
    goalId: z.string().trim().min(1).optional(),
  })
  .strict();

/**
 * GET /api/projects
 * Lists all projects owned by the authenticated user.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const queryObject = Object.fromEntries(searchParams.entries());
    const queryParse = projectsQuerySchema.safeParse(queryObject);

    if (!queryParse.success) {
      return NextResponse.json(
        { error: "Validation error", issues: queryParse.error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { status, area, goalId } = queryParse.data;

    const projectsList = await listProjects(user.id, { status, area, goalId });

    return NextResponse.json(
      { projects: projectsList },
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
    console.error("❌ Unexpected error in GET /api/projects:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/projects
 * Creates a project owned by the authenticated user.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

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

    const project = await createProject(
      user.id,
      parsedJson as Parameters<typeof createProject>[1],
      {
        ipAddress: clientIp,
        userAgent,
      }
    );

    return NextResponse.json(
      { project },
      { status: 201, headers: SECURITY_CACHE_HEADERS }
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
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", issues: error.flatten() },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("❌ Unexpected error in POST /api/projects:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
