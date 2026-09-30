import { sanitizeForPrompt } from "../context/sanitizer";
import { estimateTokens } from "../context/engine";
import type { CitationLink, RAGDomain, RetrievedEntity } from "./types";

/**
 * Builds standard deep-link citation object for a LifeOS entity.
 */
export function generateCitation(
  domain: RAGDomain,
  id: string,
  title: string
): CitationLink {
  const domainPathMap: Record<RAGDomain, string> = {
    note: "notes",
    task: "tasks",
    project: "projects",
    goal: "goals",
    person: "people",
    learning: "learning",
    content: "content",
  };

  const path = domainPathMap[domain] || "dashboard";
  const url = `/${path}?id=${encodeURIComponent(id)}`;
  const labelPrefix = domain.charAt(0).toUpperCase() + domain.slice(1);
  const markdownLink = `[${labelPrefix}: ${title}](${url})`;

  return {
    id,
    domain,
    title,
    url,
    markdownLink,
  };
}

/**
 * Computes composite ranking score factoring in base search score, recency, and relational depth.
 */
export function computeCompositeScore(
  baseScore: number,
  updatedAtIso: string,
  hasRelations: boolean
): number {
  const now = Date.now();
  const updatedTime = new Date(updatedAtIso).getTime();
  const ageDays = Math.max(0, (now - updatedTime) / (1000 * 60 * 60 * 24));

  let recencyMultiplier = 1.0;
  if (ageDays <= 7) {
    recencyMultiplier = 1.25;
  } else if (ageDays <= 30) {
    recencyMultiplier = 1.1;
  } else if (ageDays <= 90) {
    recencyMultiplier = 1.0;
  } else {
    recencyMultiplier = 0.9;
  }

  const relationBoost = hasRelations ? 1.15 : 1.0;

  return Number((baseScore * recencyMultiplier * relationBoost).toFixed(4));
}

/**
 * Formats retrieved entities into budget-controlled XML block with citation links.
 */
export function formatRAGContextXml(
  entities: RetrievedEntity[],
  maxTokens: number = 2500
): {
  formattedXml: string;
  includedEntities: RetrievedEntity[];
  tokenEstimate: number;
} {
  if (!entities || entities.length === 0) {
    return {
      formattedXml: "",
      includedEntities: [],
      tokenEstimate: 0,
    };
  }

  // Sort by composite score descending
  const sorted = [...entities].sort((a, b) => b.score - a.score);

  const included: RetrievedEntity[] = [];
  const entityXmlSnippets: string[] = [];
  let tokenSum = 20; // base overhead for <retrieved_entities> tags

  for (const entity of sorted) {
    const lines: string[] = [];
    const safeTitle = sanitizeForPrompt(entity.title);
    const citation = entity.citation.markdownLink;

    lines.push(
      `  <entity domain="${entity.domain}" id="${entity.id}" title="${safeTitle}" citation="${citation}" untrusted="true">`
    );

    if (entity.snippet) {
      lines.push(`    <snippet>${sanitizeForPrompt(entity.snippet)}</snippet>`);
    } else if (entity.content) {
      const trimmed = entity.content.slice(0, 500);
      lines.push(`    <content>${sanitizeForPrompt(trimmed)}</content>`);
    }

    if (entity.relations && entity.relations.length > 0) {
      lines.push("    <relations>");
      for (const rel of entity.relations) {
        const safeRelTitle = sanitizeForPrompt(rel.title);
        const detailsAttr = rel.details
          ? ` details="${sanitizeForPrompt(rel.details)}"`
          : "";
        lines.push(
          `      <relation type="${rel.relationType}" domain="${rel.domain}" id="${rel.entityId}" title="${safeRelTitle}"${detailsAttr} />`
        );
      }
      lines.push("    </relations>");
    }

    lines.push("  </entity>");

    const snippet = lines.join("\n");
    const snippetTokens = estimateTokens(snippet);

    if (tokenSum + snippetTokens > maxTokens && included.length > 0) {
      // Exceeded budget; prune this and subsequent lower-ranked entities
      break;
    }

    included.push(entity);
    entityXmlSnippets.push(snippet);
    tokenSum += snippetTokens;
  }

  const xml = [
    `<retrieved_entities count="${included.length}">`,
    ...entityXmlSnippets,
    "</retrieved_entities>",
  ].join("\n");

  return {
    formattedXml: xml,
    includedEntities: included,
    tokenEstimate: estimateTokens(xml),
  };
}
