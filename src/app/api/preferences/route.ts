import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/server/preferences/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Preferences API route cannot be executed in the browser."
  );
}

/**
 * GET /api/preferences
 * Returns the preferences of the currently authenticated user.
 * Disregards any client-supplied userId in query parameters.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const preferences = await getUserPreferences(user.id);

    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("❌ Unexpected error in GET /api/preferences:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/preferences
 * Updates preferences for the currently authenticated user.
 * Enforces server-side session identity: ignores and forbids any client-supplied userId.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const preferences = await updateUserPreferences(user.id, body as any, {
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("❌ Unexpected error in PATCH /api/preferences:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const PUT = PATCH;
