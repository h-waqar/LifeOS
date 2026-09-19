import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  quickCaptureTask,
  NotFoundError,
  InvariantViolationError,
} from "@/server/tasks/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Quick capture API route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const MAX_BODY_SIZE = 32 * 1024;

const quickCaptureBodySchema = z
  .object({
    raw: z
      .string({ required_error: "Raw capture string is required" })
      .trim()
      .min(1, "Input cannot be empty"),
    overrideProjectId: z.string().trim().min(1).nullish(),
  })
  .strict();

/**
 * POST /api/tasks/quick-capture
 * Universally parses inline tokens and creates a task for the authenticated user.
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

    // 2. Request body size limit
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Payload Too Large: Maximum request body size is 32KB" },
        { status: 413, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_SIZE) {
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

    const validated = quickCaptureBodySchema.parse(parsedJson);

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const task = await quickCaptureTask(
      user.id,
      {
        raw: validated.raw,
        overrideProjectId: validated.overrideProjectId ?? undefined,
      },
      {
        ipAddress: clientIp,
        userAgent,
      }
    );

    return NextResponse.json(
      { task },
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
    console.error("❌ Unexpected error in POST /api/tasks/quick-capture:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
