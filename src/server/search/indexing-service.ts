import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  knowledgeEmbeddings,
  notes,
  learningItems,
  contentItems,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import {
  generateBatchEmbeddings,
  generateEmbedding,
} from "@/server/ai/embedding/provider";
import type {
  IndexEntityInput,
  IndexingSummaryDTO,
  EmbeddingStatusDTO,
  KnowledgeEntityType,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Indexing service cannot be executed in the browser."
  );
}

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

/**
 * Splits text into overlapping chunks for vector embedding.
 */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = (text || "").trim();
  if (clean.length <= chunkSize) {
    return [clean];
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < clean.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex < clean.length) {
      // Find a natural line break or space before endIndex
      const lastBreak = clean.lastIndexOf("\n", endIndex);
      const lastSpace = clean.lastIndexOf(" ", endIndex);
      const breakPoint = Math.max(lastBreak, lastSpace);
      if (breakPoint > startIndex + chunkSize * 0.5) {
        endIndex = breakPoint;
      }
    }

    const chunk = clean.slice(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (endIndex >= clean.length) {
      break;
    }

    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  return chunks.length > 0 ? chunks : [clean];
}

/**
 * Indexes a single knowledge entity (Note, Learning Item, Content Item)
 * into PostgreSQL vector storage.
 */
export async function indexEntity(
  userId: string,
  input: IndexEntityInput
): Promise<{ indexed: boolean; chunkCount: number }> {
  if (!userId) {
    throw new AuthorizationError("Authentication required to index knowledge");
  }

  const combinedContent = `${input.title}\n\n${input.content}`.trim();
  const chunks = chunkText(combinedContent);

  const { embeddings } = await generateBatchEmbeddings(chunks, { userId });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];

    await db
      .insert(knowledgeEmbeddings)
      .values({
        userId,
        entityType: input.entityType,
        entityId: input.entityId,
        chunkIndex: i,
        title: input.title,
        content: chunk,
        embedding,
        metadata: input.metadata || {},
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          knowledgeEmbeddings.userId,
          knowledgeEmbeddings.entityType,
          knowledgeEmbeddings.entityId,
          knowledgeEmbeddings.chunkIndex,
        ],
        set: {
          title: input.title,
          content: chunk,
          embedding,
          metadata: input.metadata || {},
          updatedAt: new Date(),
        },
      });
  }

  // Remove any stale chunks from previous indexing where chunkIndex >= chunks.length
  await db
    .delete(knowledgeEmbeddings)
    .where(
      and(
        eq(knowledgeEmbeddings.userId, userId),
        eq(knowledgeEmbeddings.entityType, input.entityType),
        eq(knowledgeEmbeddings.entityId, input.entityId),
        sql`${knowledgeEmbeddings.chunkIndex} >= ${chunks.length}`
      )
    );

  return { indexed: true, chunkCount: chunks.length };
}

/**
 * Deletes embeddings associated with a given entity.
 */
export async function deleteEntityEmbeddings(
  userId: string,
  entityType: KnowledgeEntityType,
  entityId: string
): Promise<void> {
  if (!userId) {
    throw new AuthorizationError("Authentication required to delete embeddings");
  }

  await db
    .delete(knowledgeEmbeddings)
    .where(
      and(
        eq(knowledgeEmbeddings.userId, userId),
        eq(knowledgeEmbeddings.entityType, entityType),
        eq(knowledgeEmbeddings.entityId, entityId)
      )
    );
}

/**
 * Indexes all notes, learning items, and content items for the authenticated user.
 */
export async function indexAllKnowledge(
  userId: string,
  options?: { force?: boolean }
): Promise<IndexingSummaryDTO> {
  if (!userId) {
    throw new AuthorizationError("Authentication required to index knowledge");
  }

  const start = Date.now();
  let indexedCount = 0;
  let chunksCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  // 1. Index Notes
  try {
    const userNotes = await db
      .select({
        id: notes.id,
        title: notes.title,
        content: notes.content,
        area: notes.area,
        noteType: notes.noteType,
        tags: notes.tags,
      })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.isArchived, false)));

    for (const n of userNotes) {
      try {
        const result = await indexEntity(userId, {
          entityType: "note",
          entityId: n.id,
          title: n.title,
          content: n.content,
          metadata: {
            area: n.area,
            noteType: n.noteType,
            tags: n.tags,
          },
        });
        indexedCount++;
        chunksCount += result.chunkCount;
      } catch (err) {
        failedCount++;
        errors.push(`Note '${n.title}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`Failed querying notes: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Index Learning Items
  try {
    const userLearning = await db
      .select({
        id: learningItems.id,
        title: learningItems.title,
        summary: learningItems.summary,
        author: learningItems.author,
        keyTakeaways: learningItems.keyTakeaways,
        type: learningItems.type,
      })
      .from(learningItems)
      .where(eq(learningItems.userId, userId));

    for (const l of userLearning) {
      try {
        const text = `${l.summary || ""}\n${(l.keyTakeaways || []).join("\n")}`.trim();
        const result = await indexEntity(userId, {
          entityType: "learning_item",
          entityId: l.id,
          title: l.title,
          content: text || l.title,
          metadata: {
            type: l.type,
            author: l.author,
          },
        });
        indexedCount++;
        chunksCount += result.chunkCount;
      } catch (err) {
        failedCount++;
        errors.push(`Learning '${l.title}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`Failed querying learning items: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Index Content Items
  try {
    const userContent = await db
      .select({
        id: contentItems.id,
        title: contentItems.title,
        topic: contentItems.topic,
        summary: contentItems.summary,
        contentType: contentItems.contentType,
      })
      .from(contentItems)
      .where(eq(contentItems.userId, userId));

    for (const c of userContent) {
      try {
        const text = `${c.topic || ""}\n${c.summary || ""}`.trim();
        const result = await indexEntity(userId, {
          entityType: "content_item",
          entityId: c.id,
          title: c.title,
          content: text || c.title,
          metadata: {
            contentType: c.contentType,
          },
        });
        indexedCount++;
        chunksCount += result.chunkCount;
      } catch (err) {
        failedCount++;
        errors.push(`Content '${c.title}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`Failed querying content items: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    indexedCount,
    chunksCount,
    failedCount,
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Returns diagnostic embedding statistics for the authenticated user.
 */
export async function getEmbeddingStatus(userId: string): Promise<EmbeddingStatusDTO> {
  if (!userId) {
    throw new AuthorizationError("Authentication required to check embedding status");
  }

  let totalEmbeddings = 0;
  let noteEmbeddings = 0;
  let learningEmbeddings = 0;
  let contentEmbeddings = 0;
  let unembeddedNotes = 0;
  let vectorExtensionAvailable = false;

  try {
    // Check if vector extension is installed in PostgreSQL
    const extCheck = await db.execute<{ extname: string }>(
      sql`SELECT extname FROM pg_extension WHERE extname = 'vector' LIMIT 1;`
    );
    vectorExtensionAvailable = extCheck.rows.length > 0;
  } catch {
    vectorExtensionAvailable = false;
  }

  try {
    const counts = await db
      .select({
        entityType: knowledgeEmbeddings.entityType,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeEmbeddings)
      .where(eq(knowledgeEmbeddings.userId, userId))
      .groupBy(knowledgeEmbeddings.entityType);

    for (const c of counts) {
      const cnt = Number(c.count) || 0;
      totalEmbeddings += cnt;
      if (c.entityType === "note") noteEmbeddings = cnt;
      if (c.entityType === "learning_item") learningEmbeddings = cnt;
      if (c.entityType === "content_item") contentEmbeddings = cnt;
    }

    const [noteTotal] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.isArchived, false)));

    const activeNotesCount = Number(noteTotal?.count) || 0;
    unembeddedNotes = Math.max(0, activeNotesCount - noteEmbeddings);
  } catch {
    // Offline or table not yet created
  }

  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const providerConfigured = hasGemini || hasOpenAI;
  const activeProvider = hasGemini
    ? "google:text-embedding-004"
    : hasOpenAI
    ? "openai:text-embedding-3-small"
    : "deterministic-fallback";

  return {
    totalEmbeddings,
    noteEmbeddings,
    learningEmbeddings,
    contentEmbeddings,
    unembeddedNotes,
    vectorExtensionAvailable,
    providerConfigured,
    activeProvider,
  };
}

/**
 * Indexes a single entity by its ID and type.
 */
export async function indexSingleEntity(
  userId: string,
  entityType: KnowledgeEntityType,
  entityId: string
): Promise<{ chunkCount: number } | null> {
  if (!userId) {
    throw new AuthorizationError("Authentication required to index entity");
  }

  if (entityType === "note") {
    const [n] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, entityId)))
      .limit(1);

    if (!n) return null;

    const res = await indexEntity(userId, {
      entityType: "note",
      entityId: n.id,
      title: n.title,
      content: n.content,
      metadata: { area: n.area, noteType: n.noteType, tags: n.tags },
    });
    return { chunkCount: res.chunkCount };
  }

  if (entityType === "learning_item") {
    const [item] = await db
      .select()
      .from(learningItems)
      .where(and(eq(learningItems.userId, userId), eq(learningItems.id, entityId)))
      .limit(1);

    if (!item) return null;

    const res = await indexEntity(userId, {
      entityType: "learning_item",
      entityId: item.id,
      title: item.title,
      content: [item.summary, item.keyTakeaways?.join("\n")].filter(Boolean).join("\n\n"),
      metadata: { type: item.type, author: item.author },
    });
    return { chunkCount: res.chunkCount };
  }

  if (entityType === "content_item") {
    const [c] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.userId, userId), eq(contentItems.id, entityId)))
      .limit(1);

    if (!c) return null;

    const res = await indexEntity(userId, {
      entityType: "content_item",
      entityId: c.id,
      title: c.title,
      content: [c.summary, c.topic, c.targetAudience].filter(Boolean).join("\n\n"),
      metadata: { contentType: c.contentType, status: c.status },
    });
    return { chunkCount: res.chunkCount };
  }

  return null;
}

