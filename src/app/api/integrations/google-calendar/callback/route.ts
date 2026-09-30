import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { googleOAuthService } from "@/server/integrations/google-calendar/oauth-service";
import { googleCalendarSyncEngine } from "@/server/integrations/google-calendar/sync-engine";
import { callbackQuerySchema } from "@/server/integrations/google-calendar/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google-calendar/callback
 * Handles OAuth 2.0 authorization code exchange and initial sync.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);

    const queryObject = Object.fromEntries(searchParams.entries());
    const queryParse = callbackQuerySchema.safeParse(queryObject);

    if (!queryParse.success) {
      const errorMsg = queryParse.error.issues[0]?.message || "Invalid callback parameters";
      return NextResponse.redirect(
        new URL(`/calendar?integration=google_calendar&error=${encodeURIComponent(errorMsg)}`, req.url)
      );
    }

    const { code, state, error: oauthError, error_description } = queryParse.data;

    if (oauthError) {
      return NextResponse.redirect(
        new URL(
          `/calendar?integration=google_calendar&error=${encodeURIComponent(error_description || oauthError)}`,
          req.url
        )
      );
    }

    // Verify CSRF state token
    const stateValidation = googleOAuthService.validateState(state, user.id);
    if (!stateValidation.isValid) {
      return NextResponse.redirect(
        new URL(
          `/calendar?integration=google_calendar&error=${encodeURIComponent(stateValidation.error || "Invalid CSRF state")}`,
          req.url
        )
      );
    }

    // Also verify against cookie if present
    const cookieState = req.cookies.get("gcal_oauth_state")?.value;
    if (cookieState && cookieState !== state) {
      return NextResponse.redirect(
        new URL(
          `/calendar?integration=google_calendar&error=${encodeURIComponent("OAuth state cookie mismatch")}`,
          req.url
        )
      );
    }

    // Exchange code for tokens and save connection
    await googleOAuthService.handleOAuthCallback(user.id, code, {
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    // Trigger initial background sync asynchronously
    void googleCalendarSyncEngine.sync(user.id, { fullSync: true }).catch((err) => {
      console.error("❌ Initial Google Calendar sync failed:", err);
    });

    const targetUrl = new URL(
      `${stateValidation.redirectTarget || "/calendar"}?integration=google_calendar&status=connected`,
      req.url
    );

    const response = NextResponse.redirect(targetUrl);
    // Clear state cookie
    response.cookies.delete("gcal_oauth_state");

    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent("Authentication required")}`, req.url)
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.redirect(
        new URL(`/calendar?integration=google_calendar&error=${encodeURIComponent("Forbidden")}`, req.url)
      );
    }
    console.error("❌ Error in Google Calendar OAuth callback:", error);
    return NextResponse.redirect(
      new URL(
        `/calendar?integration=google_calendar&error=${encodeURIComponent((error as Error).message || "Internal server error")}`,
        req.url
      )
    );
  }
}
