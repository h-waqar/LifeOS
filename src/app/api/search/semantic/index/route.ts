import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  indexAllKnowledge,
  indexSingleEntity,
} from "@/server/search/indexing-service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const indexRequestSchema = z.object({
  entityType: z.enum(["note", "learning_item", "content_item"]).optional(),
  entityId: z.string().optional(),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/search/semantic/index
 * Generates and stores vector embeddings for knowledge entities (INTEL-03).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = indexRequestSchema.parse(body);

    // If specific entity requested, index single item via indexing service
    if (parsed.entityType && parsed.entityId) {
      const res = await indexSingleEntity(user.id, parsed.entityType, parsed.entityId);
      if (!res) {
        return NextResponse.json(
          { error: `${parsed.entityType} not found` },
          { status: 404, headers: SECURITY_CACHE_HEADERS }
        );
      }

      return NextResponse.json(
        {
          data: {
            indexedCount: 1,
            chunksCount: res.chunkCount,
            failedCount: 0,
            errors: [],
            durationMs: 0,
          },
        },
        { status: 200, headers: SECURITY_CACHE_HEADERS }
      );
    }

    // Otherwise, index all knowledge for the user
    const summary = await indexAllKnowledge(user.id, { force: parsed.force });

    return NextResponse.json(
      { data: summary },
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
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid index request payload", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("POST /api/search/semantic/index error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
