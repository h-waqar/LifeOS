/**
 * LifeOS Documentation Retrieval & Planning Graph Types
 *
 * Implements SKILL-03 & SKILL-04 interfaces for documentation search,
 * snippet extraction, path safety, and planning graph inspection.
 */

export interface DocSearchResult {
  id: string; // Relative path from project root
  title: string;
  source: "docs" | "planning" | "skills";
  snippet: string;
  score: number;
  path: string;
  headings: string[];
}

export interface DocContentResult {
  path: string;
  title: string;
  source: "docs" | "planning" | "skills";
  content: string;
  section?: string;
  headings: string[];
}

export interface DocSearchOptions {
  q: string;
  source?: "docs" | "planning" | "skills" | "all";
  limit?: number; // default 5, max 20
}

export interface PlanningStateDTO {
  milestone: string;
  current_phase: string;
  current_phase_name: string;
  status: string;
  stopped_at?: string;
  progress?: string | number;
  recent_trend?: string;
  next_steps?: string[];
  raw?: Record<string, unknown>;
}

export interface MilestoneDecisionDTO {
  decision: string;
  rationale: string;
  outcome?: string;
  dateOrPhase?: string;
}

export interface PhaseSummaryDTO {
  phase: string;
  name: string;
  path: string;
  summary: string;
  frontmatter?: Record<string, unknown>;
}

export interface PendingRoadmapDTO {
  phases: Array<{
    phase: string;
    name: string;
    status: string;
    goal?: string;
  }>;
  pendingRequirementsCount?: number;
}
