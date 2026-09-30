// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    execute: (...args: any[]) => mockExecute(...args),
    insert: (...args: any[]) => mockInsert(...args),
    delete: (...args: any[]) => mockDelete(...args),
    select: (...args: any[]) => mockSelect(...args),
  },
}));

import {
  generateDeterministicEmbedding,
  computeCosineSimilarity,
  EMBEDDING_DIMENSION,
} from "@/server/ai/embedding/provider";
import { searchSemantic } from "@/server/search/semantic-service";
import {
  chunkText,
  indexEntity,
  indexAllKnowledge,
  getEmbeddingStatus,
} from "@/server/search/indexing-service";
import { AuthorizationError } from "@/server/auth/guard";

describe("Plan 09-02: PostgreSQL pgvector Semantic Knowledge Search (INTEL-03)", () => {
  const userId = "user_semantic_tester";
  const otherUserId = "user_semantic_intruder";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Embedding Dimension & Deterministic Fallback Math", () => {
    it("generates 768-dimensional normalized embeddings", () => {
      const vec = generateDeterministicEmbedding("TypeScript Architecture and Next.js Design");
      expect(vec.length).toBe(EMBEDDING_DIMENSION);

      // Verify L2 norm is ~1.0
      let sumSq = 0;
      for (const val of vec) {
        sumSq += val * val;
      }
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 2);
    });

    it("produces identical vectors for identical inputs (cosine similarity = 1.0)", () => {
      const text = "System Architecture and Data Pipeline Design";
      const vec1 = generateDeterministicEmbedding(text);
      const vec2 = generateDeterministicEmbedding(text);

      const similarity = computeCosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(1.0, 4);
    });

    it("produces high similarity for related texts and lower similarity for unrelated texts", () => {
      const base = generateDeterministicEmbedding("PostgreSQL vector database search with pgvector");
      const related = generateDeterministicEmbedding("PostgreSQL database search and vector indexing");
      const unrelated = generateDeterministicEmbedding("Cooking pasta with tomato sauce and basil");

      const simRelated = computeCosineSimilarity(base, related);
      const simUnrelated = computeCosineSimilarity(base, unrelated);

      expect(simRelated).toBeGreaterThan(0.65);
      expect(simUnrelated).toBeLessThan(0.45);
      expect(simRelated).toBeGreaterThan(simUnrelated);
    });
  });

  describe("2. Text Chunking for Vector Embeddings", () => {
    it("returns single chunk for short content <= 1200 chars", () => {
      const shortText = "Quick meeting note about upcoming Q4 goals and task backlog.";
      const chunks = chunkText(shortText);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(shortText);
    });

    it("splits long content into overlapping chunks cleanly", () => {
      const longText = ("Detailed personal operating system documentation. ".repeat(40)).trim();
      expect(longText.length).toBeGreaterThan(1500);

      const chunks = chunkText(longText, 1000, 200);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(1000);
    });
  });

  describe("3. Semantic Search Execution & User Isolation", () => {
    it("throws AuthorizationError when userId is missing", async () => {
      await expect(searchSemantic("", { query: "machine learning" })).rejects.toThrow(
        AuthorizationError
      );
    });

    it("returns empty result structure for empty or whitespace query", async () => {
      const result = await searchSemantic(userId, { query: "   " });
      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.query).toBe("");
    });

    it("enforces strict user isolation in SQL query (zero cross-user leakage)", async () => {
      const mockRows = [
        {
          id: "emb_1",
          user_id: userId,
          entity_type: "note" as const,
          entity_id: "note_101",
          chunk_index: 0,
          title: "Neural Networks Notes",
          content: "Deep learning fundamentals and neural networks architecture.",
          metadata: { area: "learning" },
          updated_at: new Date().toISOString(),
          similarity: 0.88,
        },
      ];

      mockExecute.mockResolvedValueOnce({ rows: mockRows }); // Search query
      mockExecute.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // Count query

      const result = await searchSemantic(userId, {
        query: "neural networks deep learning",
        limit: 5,
        threshold: 0.7,
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toBe("Neural Networks Notes");
      expect(result.results[0].similarityPercentage).toBe(88);
      expect(result.results[0].similarityScore).toBe(0.88);

      // Verify that mockExecute SQL query contained the user_id constraint
      const executedSqlChunks = mockExecute.mock.calls[0][0];
      const sqlString = JSON.stringify(executedSqlChunks);
      expect(sqlString).toContain(userId);
      expect(sqlString).not.toContain(otherUserId);
    });

    it("filters results by entityType and metadata area", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });
      mockExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });

      await searchSemantic(userId, {
        query: "financial budgets",
        entityType: "note",
        area: "finance",
      });

      const executedSql = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(executedSql).toContain("note");
      expect(executedSql).toContain("finance");
    });

    it("respects similarity threshold and sorts by ranking", async () => {
      const mockRows = [
        {
          id: "emb_high",
          user_id: userId,
          entity_type: "note" as const,
          entity_id: "note_high",
          chunk_index: 0,
          title: "Exact Vector Math",
          content: "PostgreSQL pgvector cosine distance metrics.",
          metadata: {},
          updated_at: new Date().toISOString(),
          similarity: 0.94,
        },
        {
          id: "emb_mid",
          user_id: userId,
          entity_type: "note" as const,
          entity_id: "note_mid",
          chunk_index: 0,
          title: "Relational Indexing",
          content: "B-Tree and GIN indexes in PostgreSQL.",
          metadata: {},
          updated_at: new Date().toISOString(),
          similarity: 0.72,
        },
      ];

      mockExecute.mockResolvedValueOnce({ rows: mockRows });
      mockExecute.mockResolvedValueOnce({ rows: [{ count: 2 }] });

      const result = await searchSemantic(userId, {
        query: "vector math",
        threshold: 0.7,
      });

      expect(result.results.length).toBe(2);
      expect(result.results[0].similarityScore).toBe(0.94);
      expect(result.results[1].similarityScore).toBe(0.72);
      expect(result.results[0].similarityScore).toBeGreaterThan(result.results[1].similarityScore);
    });

    it("handles PostgreSQL or pgvector unavailable gracefully without crashing", async () => {
      mockExecute.mockRejectedValueOnce(
        new Error('relation "knowledge_embeddings" does not exist')
      );

      const result = await searchSemantic(userId, { query: "resilient search" });
      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.query).toBe("resilient search");
    });
  });

  describe("4. Knowledge Indexing & Embedding Storage", () => {
    it("indexes a single entity and chunks into database", async () => {
      const onConflictMock = vi.fn().mockResolvedValue({});
      const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
      mockInsert.mockReturnValue({ values: valuesMock });

      const whereMock = vi.fn().mockResolvedValue({});
      mockDelete.mockReturnValue({ where: whereMock });

      const res = await indexEntity(userId, {
        entityType: "note",
        entityId: "note_999",
        title: "Clean Architecture",
        content: "Layered architecture, entity boundaries, and dependency inversion.",
        metadata: { area: "career" },
      });

      expect(res.indexed).toBe(true);
      expect(res.chunkCount).toBe(1);
      expect(mockInsert).toHaveBeenCalled();
      expect(onConflictMock).toHaveBeenCalled();
    });

    it("indexes all user knowledge entities (notes, learning, content)", async () => {
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: any) => {
          return {
            where: vi.fn().mockImplementation(() => {
              return {
                limit: vi.fn().mockResolvedValue([]),
                then: (resolve: any) => {
                  // If notes
                  if (table.userId && table.isArchived) {
                    return Promise.resolve([
                      {
                        id: "n1",
                        title: "Note 1",
                        content: "Content 1",
                        area: "career",
                        noteType: "idea",
                        tags: ["code"],
                      },
                    ]).then(resolve);
                  }
                  // If learning
                  if (table.unitType !== undefined || table.keyTakeaways !== undefined) {
                    return Promise.resolve([
                      {
                        id: "l1",
                        title: "Book 1",
                        summary: "Summary 1",
                        author: "Author 1",
                        keyTakeaways: ["Key 1"],
                        type: "book",
                      },
                    ]).then(resolve);
                  }
                  // If content
                  if (table.topic !== undefined || table.contentType !== undefined) {
                    return Promise.resolve([
                      {
                        id: "c1",
                        title: "Post 1",
                        topic: "AI",
                        summary: "Summary",
                        contentType: "post",
                      },
                    ]).then(resolve);
                  }
                  return Promise.resolve([]).then(resolve);
                },
              };
            }),
          };
        }),
      }));

      // Mock insert & delete for each item's chunks
      const onConflictMock = vi.fn().mockResolvedValue({});
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock }),
      });
      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });

      const summary = await indexAllKnowledge(userId);

      expect(summary.indexedCount).toBe(3);
      expect(summary.failedCount).toBe(0);
      expect(summary.chunksCount).toBe(3);
      expect(summary.errors).toEqual([]);
    });

    it("retrieves embedding status and vector extension health", async () => {
      // 1. Extension check
      mockExecute.mockResolvedValueOnce({ rows: [{ extname: "vector" }] });

      // 2. Counts grouped by entityType
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            groupBy: vi.fn().mockResolvedValueOnce([
              { entityType: "note", count: 12 },
              { entityType: "learning_item", count: 3 },
            ]),
          }),
        }),
      });

      // 3. Total active notes count
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([{ count: 15 }]),
        }),
      });

      const status = await getEmbeddingStatus(userId);

      expect(status.vectorExtensionAvailable).toBe(true);
      expect(status.totalEmbeddings).toBe(15);
      expect(status.noteEmbeddings).toBe(12);
      expect(status.learningEmbeddings).toBe(3);
      expect(status.unembeddedNotes).toBe(3); // 15 total notes - 12 embedded
    });
  });
});
