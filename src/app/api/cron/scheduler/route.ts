import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { schedulerEngine } from "@/server/scheduler";

/**
 * Validates the provided Bearer token against CRON_SECRET using timing-safe comparison.
 */
function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || typeof cronSecret !== "string" || cronSecret.trim().length === 0) {
    return false;
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(cronSecret);

  if (tokenBuf.length !== secretBuf.length) {
    // Constant time dummy check to avoid timing leaks
    crypto.timingSafeEqual(tokenBuf, tokenBuf);
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * POST /api/cron/scheduler
 * Trigger periodic sweepers and scheduled automations across all users (or a specific user).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing CRON_SECRET." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");

    if (targetUserId) {
      const summary = await schedulerEngine.runAllForUser(targetUserId);
      return NextResponse.json(
        {
          success: true,
          mode: "single_tenant",
          summary,
        },
        { status: 200 }
      );
    }

    const overallSummary = await schedulerEngine.runAllUsers();
    return NextResponse.json(
      {
        success: true,
        mode: "all_tenants",
        summary: overallSummary,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[CronRoute] Scheduler run failed:", err);
    return NextResponse.json(
      {
        error: "Internal Server Error during scheduled sweep.",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/scheduler
 * Also supports GET for cron services that trigger webhooks via GET.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
