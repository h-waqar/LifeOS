import { NextRequest, NextResponse } from "next/server";
import { webhookHandler } from "@/server/integrations/webhooks/handler";
import { requireAuthenticatedUser } from "@/server/auth/guard";

export async function POST(req: NextRequest) {
  try {
    let userId: string;
    try {
      const { user } = await requireAuthenticatedUser(req);
      userId = user.id;
    } catch {
      // Allow API secret / bearer token authentication
      const authHeader = req.headers.get("authorization");
      const secretHeader = req.headers.get("x-lifeos-webhook-secret");
      const token = authHeader?.replace(/^Bearer\s+/i, "") || secretHeader;
      if (!token) {
        return NextResponse.json(
          { error: "Authentication required: missing bearer token or webhook secret" },
          { status: 401 }
        );
      }
      userId = token; // Use token as identity context
    }

    const payload = await req.json();
    const provider = req.headers.get("x-webhook-provider") || "automation";
    const eventType = req.headers.get("x-webhook-event") || "incoming.event";

    const result = await webhookHandler.handleIncomingWebhook({
      userId,
      provider,
      eventType,
      payload,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message || "Failed to process incoming webhook" },
      { status }
    );
  }
}
