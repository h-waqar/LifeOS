import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  vector,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Knowledge Embeddings Table (Phase 9 - INTEL-03)
 * Stores 768-dimensional vector embeddings for Notes, Learning Items, and Content
 * to enable conceptual semantic similarity search via PostgreSQL pgvector.
 *
 * Enforces:
 * - Foreign key cascade to authenticated user
 * - Unique chunk per user, entity type, entity ID, and chunk index
 * - Tenant isolation via composite keys
 * - HNSW index on cosine distance for high-performance vector search
 */
export const knowledgeEmbeddings = pgTable(
  "knowledge_embeddings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entityType: text("entity_type", {
      enum: ["note", "learning_item", "content_item"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    title: text("title").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("knowledge_embeddings_user_id_id_unique").on(table.userId, table.id),
    unique("knowledge_embeddings_entity_chunk_unique").on(
      table.userId,
      table.entityType,
      table.entityId,
      table.chunkIndex
    ),
    index("knowledge_embeddings_user_id_idx").on(table.userId),
    index("knowledge_embeddings_user_entity_idx").on(
      table.userId,
      table.entityType
    ),
    index("knowledge_embeddings_user_entity_id_idx").on(
      table.userId,
      table.entityId
    ),
    index("knowledge_embeddings_vector_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

export const knowledgeEmbedding = knowledgeEmbeddings;

export type KnowledgeEmbedding = typeof knowledgeEmbeddings.$inferSelect;
export type NewKnowledgeEmbedding = typeof knowledgeEmbeddings.$inferInsert;
