export type RAGDomain =
  | "note"
  | "task"
  | "project"
  | "goal"
  | "person"
  | "learning"
  | "content";

export interface CitationLink {
  id: string;
  domain: RAGDomain;
  title: string;
  url: string;
  markdownLink: string;
}

export interface RetrievedEntity {
  id: string;
  domain: RAGDomain;
  title: string;
  snippet?: string;
  content?: string;
  score: number;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  relations?: Array<{
    relationType: string;
    entityId: string;
    domain: string;
    title: string;
    details?: string;
  }>;
  citation: CitationLink;
}

export interface RAGRetrievalResult {
  query: string;
  entities: RetrievedEntity[];
  citations: CitationLink[];
  formattedXml: string;
  tokenEstimate: number;
}
