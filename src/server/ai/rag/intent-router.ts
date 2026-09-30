import type { RAGDomain } from "./types";

export interface IntentRouteResult {
  needsRetrieval: boolean;
  targetDomain: RAGDomain | "all";
  extractedQuery: string;
}

const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|howdy)(\s+(there|friend|assistant|bot|lifeos))?(\s*!*|\?*)$/i,
  /^good\s+(morning|afternoon|evening|day)(\s+(there|friend|assistant))?(\s*!*|\?*)$/i,
  /^(thanks|thank\s+you)(\s+(very\s+much|so\s+much))?(\s*!*|\.*)$/i,
  /^(appreciate\s+it|thx|cool|awesome|great|ok|okay|got\s+it)(\s*!*|\.*)$/i,
  /^(who\s+are\s+you|what\s+can\s+you\s+do|help|what\s+are\s+your\s+capabilities)(\s*\?*)$/i,
  /^(tell\s+me\s+a\s+joke|write\s+a\s+poem|sing\s+a\s+song)(\s*\.*)$/i,
];

const LEADING_FILLER_PHRASES = [
  /^(can\s+you\s+)?(please\s+)?(find|show\s+me|search\s+for|tell\s+me\s+about|look\s+up|what\s+is\s+my|what\s+are\s+my|do\s+i\s+have\s+(any|a)?)\s+/i,
  /^(where\s+is|what\s+did\s+i\s+write\s+about|check\s+my)\s+/i,
  /^(information\s+on|details\s+about|notes\s+on|summary\s+of)\s+/i,
];

const DOMAIN_TRIGGERS: Array<{ domain: RAGDomain; patterns: RegExp[] }> = [
  {
    domain: "note",
    patterns: [/\b(note|notes|scratchpad|memo|journal|meeting\s+notes)\b/i],
  },
  {
    domain: "task",
    patterns: [/\b(task|tasks|todo|todos|to-do|action\s+item|overdue)\b/i],
  },
  {
    domain: "project",
    patterns: [/\b(project|projects)\b/i],
  },
  {
    domain: "goal",
    patterns: [/\b(goal|goals|objective|okr|target)\b/i],
  },
  {
    domain: "person",
    patterns: [/\b(person|people|contact|contacts|relationship|who\s+is)\b/i],
  },
  {
    domain: "learning",
    patterns: [/\b(learning|course|book|tutorial|curriculum)\b/i],
  },
  {
    domain: "content",
    patterns: [/\b(content|post|draft|article|tweet|publication)\b/i],
  },
];

/**
 * Analyzes incoming user prompt to determine if retrieval is needed,
 * identifies target domain, and extracts clean search keywords.
 */
export function routeQueryIntent(prompt: string): IntentRouteResult {
  const trimmed = prompt.trim();

  if (!trimmed) {
    return {
      needsRetrieval: false,
      targetDomain: "all",
      extractedQuery: "",
    };
  }

  // 1. Check for purely conversational / trivial prompts
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        needsRetrieval: false,
        targetDomain: "all",
        extractedQuery: "",
      };
    }
  }

  // 2. Detect target domain
  let detectedDomain: RAGDomain | "all" = "all";
  for (const { domain, patterns } of DOMAIN_TRIGGERS) {
    for (const pat of patterns) {
      if (pat.test(trimmed)) {
        detectedDomain = domain;
        break;
      }
    }
    if (detectedDomain !== "all") break;
  }

  // 3. Clean query string by stripping leading fillers
  let cleaned = trimmed;
  for (const filler of LEADING_FILLER_PHRASES) {
    cleaned = cleaned.replace(filler, "");
  }

  // Also remove punctuation from edges
  cleaned = cleaned.replace(/^[?.,!\s]+|[?.,!\s]+$/g, "").trim();

  // If after cleaning the query is empty or too short, return original trimmed
  const finalQuery = cleaned.length >= 2 ? cleaned : trimmed;

  return {
    needsRetrieval: true,
    targetDomain: detectedDomain,
    extractedQuery: finalQuery,
  };
}
