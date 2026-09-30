import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { searchSemantic } from "@/server/search/semantic-service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

const semanticQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query cannot be empty").max(1000).optional(),
  query: z.string().trim().min(1, "Search query cannot be empty").max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  threshold: z.coerce.number().min(0).max(1).optional().default(0.65),
  type: z.enum(["note", "learning_item", "content_item"]).optional(),
  entityType: z.enum(["note", "learning_item", "content_item"]).optional(),
  area: z
    .enum([
      "health",
      "career",
      "finance",
      "personal_development",
      "relationships",
      "general",
    ])
    .optional(),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * GET /api/search/semantic
 * Executes conceptual semantic vector search using PostgreSQL pgvector (INTEL-03).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const parsed = semanticQuerySchema.parse(Object.fromEntries(searchParams.entries()));

    const queryString = parsed.q || parsed.query;
    if (!queryString) {
      return NextResponse.json(
        { error: "Search query 'q' parameter is required" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const result = await searchSemantic(user.id, {
      query: queryString,
      limit: parsed.limit,
      threshold: parsed.threshold,
      entityType: parsed.type || parsed.entityType,
      area: parsed.area,
      offset: parsed.offset,
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
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid semantic search query parameters", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/search/semantic error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/search/semantic
 * Executes conceptual semantic vector search with JSON payload.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const body = await req.json();
    const parsed = semanticQuerySchema.parse(body);

    const queryString = parsed.q || parsed.query;
    if (!queryString) {
      return NextResponse.json(
        { error: "Search query 'query' is required" },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const result = await searchSemantic(user.id, {
      query: queryString,
      limit: parsed.limit,
      threshold: parsed.threshold,
      entityType: parsed.type || parsed.entityType,
      area: parsed.area,
      offset: parsed.offset,
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
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid semantic search request payload", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("POST /api/search/semantic error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
