import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { googleOAuthService } from "@/server/integrations/google-calendar/oauth-service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/integrations/google-calendar/auth
 * Generates OAuth 2.0 authorization URL and sets CSRF state cookie.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    if (!googleOAuthService.isConfigured()) {
      return NextResponse.json(
        {
          error:
            "Google Calendar integration is not configured. Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.",
        },
        { status: 503, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const redirectTarget = searchParams.get("redirect") || "/calendar";

    const { url, state } = googleOAuthService.generateAuthUrl(
      user.id,
      redirectTarget
    );

    const response = NextResponse.json(
      { url, state },
      { headers: SECURITY_CACHE_HEADERS }
    );

    // Set HTTP-only secure cookie for CSRF state validation (15 min TTL)
    response.cookies.set("gcal_oauth_state", state, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 900,
    });

    return response;
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
    console.error("❌ Unexpected error in GET /api/integrations/google-calendar/auth:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal Server Error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
