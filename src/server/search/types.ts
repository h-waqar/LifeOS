import type { LifeArea } from "@/types";

export type KnowledgeEntityType = "note" | "learning_item" | "content_item";

export interface SemanticSearchParams {
  query: string;
  limit?: number; // default 10, max 50
  threshold?: number; // default 0.65, min 0.0, max 1.0
  entityType?: KnowledgeEntityType;
  area?: LifeArea;
  offset?: number;
}

export interface SemanticSearchResultItem {
  id: string;
  entityType: KnowledgeEntityType;
  entityId: string;
  title: string;
  snippet: string;
  similarityScore: number; // 0.0000 to 1.0000
  similarityPercentage: number; // 0 to 100
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface SemanticSearchResponseDTO {
  query: string;
  results: SemanticSearchResultItem[];
  total: number;
  limit: number;
  offset: number;
  threshold: number;
  provider: string;
  durationMs: number;
}

export interface IndexEntityInput {
  entityType: KnowledgeEntityType;
  entityId: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IndexingSummaryDTO {
  indexedCount: number;
  chunksCount: number;
  failedCount: number;
  errors: string[];
  durationMs: number;
}

export interface EmbeddingStatusDTO {
  totalEmbeddings: number;
  noteEmbeddings: number;
  learningEmbeddings: number;
  contentEmbeddings: number;
  unembeddedNotes: number;
  vectorExtensionAvailable: boolean;
  providerConfigured: boolean;
  activeProvider: string;
}
