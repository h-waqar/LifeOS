import { NextResponse } from "next/server";
import { getSystemHealth } from "@/server/health/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Healthcheck route cannot be executed in the browser."
  );
}

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/health
 * Public, unauthenticated operational healthcheck.
 * Verifies live database connectivity and response latency without exposing credentials.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await getSystemHealth();

    if (result.ok) {
      return NextResponse.json(
        {
          status: "healthy",
          database: "connected",
          latencyMs: result.latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 200, headers: SECURITY_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: "Database connectivity check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "error",
        error: "Healthcheck execution failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
