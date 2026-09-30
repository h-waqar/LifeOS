import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import { retrievePersonalContext } from "@/server/ai/rag/retrieval-service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const retrieveQuerySchema = z.object({
  query: z.string().min(1).max(500),
  maxTokens: z.number().int().min(100).max(10000).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

/**
 * POST /api/ai/retrieve
 * Runs standalone RAG retrieval across the user's personal graph.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const { query, maxTokens, limit } = retrieveQuerySchema.parse(body);

    const result = await retrievePersonalContext(user.id, query, {
      maxTokens,
      limit,
    });

    return NextResponse.json(
      { data: result },
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
    console.error("POST /api/ai/retrieve error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
