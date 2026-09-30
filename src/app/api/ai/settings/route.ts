import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import {
  getAISettings,
  updateAISettings,
} from "@/server/ai/settings-service";
import { verifyProviderConnection } from "@/server/ai/providers/registry";
import type { AIProviderName } from "@/server/ai/types";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/ai/settings
 * Returns the authenticated user's AI provider settings with masked keys.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const settings = await getAISettings(user.id);

    return NextResponse.json(
      { data: settings },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/ai/settings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/ai/settings
 * Updates AI provider settings and encrypted credentials, or tests connection.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // Check if client is requesting a connection test
    if (body.action === "test_connection") {
      const { provider, model, apiKey, baseURL } = body as {
        provider: AIProviderName;
        model: string;
        apiKey?: string;
        baseURL?: string;
      };

      if (!provider || !model) {
        return NextResponse.json(
          { error: "provider and model are required for connection test" },
          { status: 400, headers: SECURITY_CACHE_HEADERS }
        );
      }

      const result = await verifyProviderConnection(
        provider,
        model,
        apiKey,
        baseURL
      );

      return NextResponse.json(
        { data: result },
        { status: result.success ? 200 : 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const updated = await updateAISettings(user.id, body);

    return NextResponse.json(
      { data: updated },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("POST /api/ai/settings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
