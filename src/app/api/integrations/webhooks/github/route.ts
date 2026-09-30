import { NextResponse } from "next/server";
import { webhookHandler, WebhookVerificationError } from "@/server/integrations/webhooks/handler";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const eventType = req.headers.get("x-github-event") || "ping";
    const deliveryId = req.headers.get("x-github-delivery") || undefined;
    const signatureHeader = req.headers.get("x-hub-signature-256");

    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {};
    }

    const result = await webhookHandler.handleGitHubWebhook({
      rawBody,
      payload,
      eventType,
      deliveryId,
      signatureHeader,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err.message || "Failed to process GitHub webhook" },
      { status: 500 }
    );
  }
}
