import { search } from "@/server/search/service";
import { routeQueryIntent } from "./intent-router";
import { expandEntityGraph } from "./graph-expander";
import {
  generateCitation,
  computeCompositeScore,
  formatRAGContextXml,
} from "./ranking";
import type {
  RAGDomain,
  RetrievedEntity,
  RAGRetrievalResult,
} from "./types";

/**
 * Executes full RAG personal graph retrieval pipeline:
 * 1. Intent routing & keyword extraction
 * 2. PostgreSQL hybrid search (FTS + pg_trgm)
 * 3. 1-2 hop relational graph expansion
 * 4. Composite reranking (search score * recency * relations)
 * 5. Token budgeting and structured XML formatting
 */
export async function retrievePersonalContext(
  userId: string,
  userPrompt: string,
  options: { maxTokens?: number; limit?: number } = {}
): Promise<RAGRetrievalResult> {
  const maxTokens = options.maxTokens ?? 2500;
  const limit = Math.min(options.limit ?? 10, 25);

  const intent = routeQueryIntent(userPrompt);

  if (!intent.needsRetrieval || !intent.extractedQuery) {
    return {
      query: "",
      entities: [],
      citations: [],
      formattedXml: "",
      tokenEstimate: 0,
    };
  }

  // Execute PostgreSQL hybrid search across entities
  const searchResponse = await search(userId, {
    q: intent.extractedQuery,
    type: intent.targetDomain,
    limit,
  });

  if (!searchResponse.results || searchResponse.results.length === 0) {
    return {
      query: intent.extractedQuery,
      entities: [],
      citations: [],
      formattedXml: "",
      tokenEstimate: 0,
    };
  }

  // Map to initial RetrievedEntity array
  const rawEntities: RetrievedEntity[] = searchResponse.results.map((r) => {
    const domain = r.type as RAGDomain;
    const citation = generateCitation(domain, r.id, r.title);
    return {
      id: r.id,
      domain,
      title: r.title,
      snippet: r.snippet,
      score: r.score,
      updatedAt: r.updatedAt,
      metadata: r.metadata,
      citation,
    };
  });

  // Expand relational personal graph (1-2 hops)
  const expanded = await expandEntityGraph(userId, rawEntities);

  // Compute composite scores
  const scored: RetrievedEntity[] = expanded.map((e) => {
    const hasRelations = Boolean(e.relations && e.relations.length > 0);
    const compositeScore = computeCompositeScore(
      e.score,
      e.updatedAt,
      hasRelations
    );
    return {
      ...e,
      score: compositeScore,
    };
  });

  // Format XML with token budgeting
  const { formattedXml, includedEntities, tokenEstimate } =
    formatRAGContextXml(scored, maxTokens);

  return {
    query: intent.extractedQuery,
    entities: includedEntities,
    citations: includedEntities.map((e) => e.citation),
    formattedXml,
    tokenEstimate,
  };
}
