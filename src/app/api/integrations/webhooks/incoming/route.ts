import { NextRequest, NextResponse } from "next/server";
import {
  webhookHandler,
  WebhookAuthenticationError,
} from "@/server/integrations/webhooks/handler";

export async function POST(req: NextRequest) {
  try {
    // 1. Strictly authenticate incoming webhook: resolves to active agent token or registered integration
    // Fails closed on any invalid, missing, unconfigured, or spoofed credentials
    const { userId } = await webhookHandler.authenticateIncomingWebhook(req);

    // 2. Validate payload is valid JSON
    let payload: Record<string, any>;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const provider = req.headers.get("x-webhook-provider") || "automation";
    const eventType = req.headers.get("x-webhook-event") || "incoming.event";

    // 3. Process incoming webhook for the verified user identity
    const result = await webhookHandler.handleIncomingWebhook({
      userId,
      provider,
      eventType,
      payload,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof WebhookAuthenticationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }

    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message || "Failed to process incoming webhook" },
      { status }
    );
  }
}
