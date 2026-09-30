import { sql, and, eq, desc } from "drizzle-orm";
import { db } from "@/server/db";
import { knowledgeEmbeddings } from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { generateEmbedding } from "@/server/ai/embedding/provider";
import { extractSnippet } from "./service";
import type {
  SemanticSearchParams,
  SemanticSearchResultItem,
  SemanticSearchResponseDTO,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Semantic search service cannot be executed in the browser."
  );
}

/**
 * Executes semantic similarity search over knowledge embeddings using PostgreSQL pgvector.
 * Enforces strict user isolation: only embeddings owned by the authenticated user are ever queried.
 */
export async function searchSemantic(
  userId: string,
  params: SemanticSearchParams
): Promise<SemanticSearchResponseDTO> {
  if (!userId) {
    throw new AuthorizationError("Authentication required for semantic search");
  }

  const query = (params.query || "").trim();
  const limit = Math.min(50, Math.max(1, params.limit ?? 10));
  const threshold = Math.min(1.0, Math.max(0.0, params.threshold ?? 0.65));
  const offset = Math.max(0, params.offset ?? 0);
  const start = Date.now();

  if (!query) {
    return {
      query: "",
      results: [],
      total: 0,
      limit,
      offset,
      threshold,
      provider: "none",
      durationMs: 0,
    };
  }

  // 1. Generate query embedding vector
  const { embedding: queryVector, provider } = await generateEmbedding(query, {
    userId,
  });

  const vectorString = `[${queryVector.join(",")}]`;

  // 2. Query pgvector with strict user isolation and optional metadata filtering
  try {
    const conditions = [
      sql`user_id = ${userId}`,
    ];

    if (params.entityType) {
      conditions.push(sql`entity_type = ${params.entityType}`);
    }

    if (params.area) {
      conditions.push(sql`metadata->>'area' = ${params.area}`);
    }

    // Similarity calculation: 1 - cosine_distance (<=>)
    const whereClause = sql.join(conditions, sql` AND `);

    // Query ranked results with threshold filter
    const rows = await db.execute<{
      id: string;
      user_id: string;
      entity_type: "note" | "learning_item" | "content_item";
      entity_id: string;
      chunk_index: number;
      title: string;
      content: string;
      metadata: Record<string, unknown>;
      updated_at: string;
      similarity: number;
    }>(sql`
      SELECT 
        id,
        user_id,
        entity_type,
        entity_id,
        chunk_index,
        title,
        content,
        metadata,
        updated_at,
        (1 - (embedding <=> ${vectorString}::vector))::float as similarity
      FROM knowledge_embeddings
      WHERE ${whereClause}
        AND (1 - (embedding <=> ${vectorString}::vector)) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
      OFFSET ${offset};
    `);

    // Count total matching items above threshold
    const countResult = await db.execute<{ count: number }>(sql`
      SELECT count(*)::int as count
      FROM knowledge_embeddings
      WHERE ${whereClause}
        AND (1 - (embedding <=> ${vectorString}::vector)) >= ${threshold};
    `);

    const total = Number(countResult.rows[0]?.count) || rows.rows.length;

    // Deduplicate by entityId (taking highest scoring chunk for each entity)
    const seenEntities = new Set<string>();
    const results: SemanticSearchResultItem[] = [];

    for (const r of rows.rows) {
      const entityKey = `${r.entity_type}:${r.entity_id}`;
      if (seenEntities.has(entityKey)) continue;
      seenEntities.add(entityKey);

      const simScore = Math.max(0, Math.min(1, Number(r.similarity)));
      const snippet = extractSnippet(r.content, query, 140) || r.content.slice(0, 140);

      results.push({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        title: r.title,
        snippet,
        similarityScore: Number(simScore.toFixed(4)),
        similarityPercentage: Math.round(simScore * 100),
        metadata: r.metadata || {},
        updatedAt: r.updated_at,
      });
    }

    return {
      query,
      results,
      total,
      limit,
      offset,
      threshold,
      provider,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    console.warn(
      "[Semantic Search Service] Vector search failed or pgvector extension unavailable:",
      error instanceof Error ? error.message : error
    );

    // Return empty results gracefully rather than crashing
    return {
      query,
      results: [],
      total: 0,
      limit,
      offset,
      threshold,
      provider,
      durationMs: Date.now() - start,
    };
  }
}
