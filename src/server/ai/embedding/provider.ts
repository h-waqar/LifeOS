import { embed, embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { getDecryptedAIKeys } from "../settings-service";

export const EMBEDDING_DIMENSION = 768;

/**
 * Generates a deterministic, L2-normalized 768-dimensional vector
 * from text. Used as high-reliability fallback when external AI providers
 * are offline, unconfigured, or rate-limited.
 */
export function generateDeterministicEmbedding(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIMENSION);
  const clean = (text || "").toLowerCase().trim();

  if (!clean) {
    // Return unit vector along first dimension if text is empty
    vec[0] = 1.0;
    return Array.from(vec);
  }

  // Tokenize words
  const words = clean.split(/[^a-z0-9_]+/).filter(Boolean);

  // Helper FNV-1a hash
  function fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Project words and character 3-grams into 768-dim space
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordHash = fnv1a(word);
    const idx1 = wordHash % EMBEDDING_DIMENSION;
    const idx2 = (wordHash * 31 + 17) % EMBEDDING_DIMENSION;
    const sign = (wordHash & 1) === 0 ? 1 : -1;

    // Weight early words slightly higher
    const posWeight = 1.0 / (1.0 + i * 0.05);
    vec[idx1] += sign * 1.5 * posWeight;
    vec[idx2] += -sign * 0.8 * posWeight;

    // Sub-word character trigrams for semantic/morphological similarity
    if (word.length >= 3) {
      for (let j = 0; j <= word.length - 3; j++) {
        const tri = word.slice(j, j + 3);
        const triHash = fnv1a(tri);
        const triIdx = triHash % EMBEDDING_DIMENSION;
        const triSign = (triHash & 1) === 0 ? 1 : -1;
        vec[triIdx] += triSign * 0.4 * posWeight;
      }
    }
  }

  // Global document signature hash
  const docHash = fnv1a(clean);
  const docIdx = docHash % EMBEDDING_DIMENSION;
  vec[docIdx] += 0.5;

  // L2 Normalize: |v| = 1.0
  let sumSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    sumSq += vec[i] * vec[i];
  }

  const norm = Math.sqrt(sumSq) || 1.0;
  const result: number[] = new Array(EMBEDDING_DIMENSION);
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    result[i] = Number((vec[i] / norm).toFixed(6));
  }

  return result;
}

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface EmbeddingResult {
  embedding: number[];
  provider: string;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  provider: string;
}

/**
 * Generates a 768-dimensional embedding for the provided text using the user's
 * configured AI credentials (Google Gemini text-embedding-004 or OpenAI text-embedding-3-small)
 * or deterministic fallback.
 */
export async function generateEmbedding(
  text: string,
  options?: { userId?: string; preferredProvider?: string }
): Promise<EmbeddingResult> {
  const clean = text.trim();
  if (!clean) {
    return {
      embedding: generateDeterministicEmbedding(""),
      provider: "deterministic-fallback",
    };
  }

  try {
    let geminiKey = process.env.GEMINI_API_KEY;
    let openaiKey = process.env.OPENAI_API_KEY;

    if (options?.userId) {
      try {
        const userKeys = await getDecryptedAIKeys(options.userId);
        if (userKeys.geminiKey) geminiKey = userKeys.geminiKey;
        if (userKeys.openaiKey) openaiKey = userKeys.openaiKey;
      } catch {
        // Continue with environment keys
      }
    }

    if (geminiKey && options?.preferredProvider !== "openai") {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey });
      const model = google.textEmbeddingModel("text-embedding-004");
      const { embedding } = await embed({ model, value: clean });
      if (embedding && embedding.length === EMBEDDING_DIMENSION) {
        return { embedding, provider: "google:text-embedding-004" };
      }
    }

    if (openaiKey) {
      const openai = createOpenAI({ apiKey: openaiKey });
      const model = openai.embedding("text-embedding-3-small", {
        dimensions: EMBEDDING_DIMENSION,
      });
      const { embedding } = await embed({ model, value: clean });
      if (embedding && embedding.length === EMBEDDING_DIMENSION) {
        return { embedding, provider: "openai:text-embedding-3-small" };
      }
    }
  } catch (error) {
    console.warn(
      "[Embedding Provider] External embedding provider failed, using deterministic fallback:",
      error instanceof Error ? error.message : error
    );
  }

  return {
    embedding: generateDeterministicEmbedding(clean),
    provider: "deterministic-fallback",
  };
}

/**
 * Generates embeddings in batch for multiple text chunks.
 */
export async function generateBatchEmbeddings(
  texts: string[],
  options?: { userId?: string; preferredProvider?: string }
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], provider: "none" };
  }

  try {
    let geminiKey = process.env.GEMINI_API_KEY;
    let openaiKey = process.env.OPENAI_API_KEY;

    if (options?.userId) {
      try {
        const userKeys = await getDecryptedAIKeys(options.userId);
        if (userKeys.geminiKey) geminiKey = userKeys.geminiKey;
        if (userKeys.openaiKey) openaiKey = userKeys.openaiKey;
      } catch {
        // Continue with environment keys
      }
    }

    if (geminiKey && options?.preferredProvider !== "openai") {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey });
      const model = google.textEmbeddingModel("text-embedding-004");
      const { embeddings } = await embedMany({ model, values: texts });
      if (
        embeddings &&
        embeddings.length === texts.length &&
        embeddings[0].length === EMBEDDING_DIMENSION
      ) {
        return { embeddings, provider: "google:text-embedding-004" };
      }
    }

    if (openaiKey) {
      const openai = createOpenAI({ apiKey: openaiKey });
      const model = openai.embedding("text-embedding-3-small", {
        dimensions: EMBEDDING_DIMENSION,
      });
      const { embeddings } = await embedMany({ model, values: texts });
      if (
        embeddings &&
        embeddings.length === texts.length &&
        embeddings[0].length === EMBEDDING_DIMENSION
      ) {
        return { embeddings, provider: "openai:text-embedding-3-small" };
      }
    }
  } catch (error) {
    console.warn(
      "[Embedding Provider] Batch external provider failed, using deterministic fallback:",
      error instanceof Error ? error.message : error
    );
  }

  const fallbackEmbeddings = texts.map((t) => generateDeterministicEmbedding(t));
  return {
    embeddings: fallbackEmbeddings,
    provider: "deterministic-fallback",
  };
}
