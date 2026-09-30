import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  saveAnalyticsSnapshot,
  getHistoricalSnapshots,
  getAnalyticsDashboard,
} from "@/server/analytics/service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const createSnapshotSchema = z.object({
  periodType: z.enum(["7d", "30d", "90d", "day", "week", "month", "quarter", "year", "custom"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid startDate format (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid endDate format (YYYY-MM-DD)"),
  autoCompute: z.boolean().optional(),
  metrics: z.record(z.unknown()).optional(),
});

/**
 * GET /api/analytics/snapshots
 * Query stored analytics snapshots for the authenticated user.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const periodType = searchParams.get("periodType") || undefined;

    const snapshots = await getHistoricalSnapshots(user.id, periodType);

    return NextResponse.json(
      { data: snapshots },
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
    console.error("GET /api/analytics/snapshots error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/analytics/snapshots
 * Capture or save a new analytics snapshot for the authenticated user.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const body = await req.json();
    const parsed = createSnapshotSchema.parse(body);

    let metrics = parsed.metrics;
    if (parsed.autoCompute || !metrics) {
      const computed = await getAnalyticsDashboard(user.id, {
        period: parsed.periodType as any,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
      });
      metrics = computed as unknown as Record<string, unknown>;
    }

    const snapshot = await saveAnalyticsSnapshot(user.id, {
      periodType: parsed.periodType,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      metrics,
    });

    return NextResponse.json(
      { data: snapshot },
      { status: 201, headers: SECURITY_CACHE_HEADERS }
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
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid snapshot payload", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("POST /api/analytics/snapshots error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
