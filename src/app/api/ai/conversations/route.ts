import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import {
  createConversation,
  listConversations,
} from "@/server/ai/conversation-service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
  provider: z.enum(["google", "anthropic", "openai", "ollama"]).optional(),
  model: z.string().max(100).optional(),
  systemPromptOverride: z.string().max(5000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/ai/conversations
 * Lists conversations for the authenticated user.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : undefined;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!, 10)
      : undefined;

    const result = await listConversations(user.id, { limit, offset });

    return NextResponse.json(
      { data: result.items, total: result.total },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/ai/conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/ai/conversations
 * Creates a new conversation thread for the authenticated user.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty POST body
      body = {};
    }

    const validated = createConversationSchema.parse(body);
    const conversation = await createConversation(user.id, validated);

    return NextResponse.json(
      { data: conversation },
      { status: 201, headers: SECURITY_CACHE_HEADERS }
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
    console.error("POST /api/ai/conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
