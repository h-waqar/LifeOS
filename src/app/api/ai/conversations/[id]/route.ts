import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  getConversation,
  updateConversation,
  deleteConversation,
  NotFoundError,
} from "@/server/ai/conversation-service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const updateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  provider: z.enum(["google", "anthropic", "openai", "ollama"]).optional(),
  model: z.string().max(100).optional(),
  systemPromptOverride: z.string().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/ai/conversations/[id]
 * Retrieves conversation details.
 */
export async function GET(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    const conv = await getConversation(user.id, id);

    return NextResponse.json(
      { data: conv },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/ai/conversations/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * PATCH /api/ai/conversations/[id]
 * Updates conversation title, model, or metadata.
 */
export async function PATCH(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const validated = updateConversationSchema.parse(body);
    const updated = await updateConversation(user.id, id, validated);

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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
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
        { error: "Validation failed", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("PATCH /api/ai/conversations/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/ai/conversations/[id]
 * Deletes conversation and cascades to messages and actions.
 */
export async function DELETE(
  req: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { id } = await context.params;

    await deleteConversation(user.id, id);

    return NextResponse.json(
      { data: { success: true } },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("DELETE /api/ai/conversations/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
