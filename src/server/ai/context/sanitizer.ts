/**
 * Sanitizes untrusted user strings and retrieved data to prevent prompt injection attacks
 * and structural XML tag breakout.
 */

const DANGEROUS_TAG_PATTERNS = [
  /<\/?\s*user_context[^>]*>/gi,
  /<\/?\s*context[^>]*>/gi,
  /<\/?\s*temporal_anchor[^>]*>/gi,
  /<\/?\s*user_state[^>]*>/gi,
  /<\/?\s*retrieved_entities[^>]*>/gi,
  /<\/?\s*system[^>]*>/gi,
  /<\/?\s*instructions[^>]*>/gi,
  /<\/?\s*rules[^>]*>/gi,
  /<\/?\s*user_data[^>]*>/gi,
];

const INJECTION_PHRASES = [
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions|directives|rules)/i,
  /disregard\s+(all\s+)?(previous|prior)\s+(instructions|directives|rules)/i,
  /system\s+override/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /bypass\s+all\s+(safety|security|authorization)\s+checks/i,
  /admin\s+privilege\s+escalation/i,
];

/**
 * Escapes structural XML tags that could break out of context blocks.
 */
export function sanitizeForPrompt(input: string): string {
  if (!input) return "";

  let sanitized = input;

  for (const pattern of DANGEROUS_TAG_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      return match
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    });
  }

  return sanitized;
}

export interface WrapUntrustedOptions {
  domain?: string;
  id?: string;
  title?: string;
}

/**
 * Wraps user or external data in untrusted XML delimiters with sanitized content.
 */
export function wrapUntrustedContent(
  content: string,
  options: WrapUntrustedOptions = {}
): string {
  const sanitized = sanitizeForPrompt(content);
  const domainAttr = options.domain ? ` domain="${options.domain}"` : "";
  const idAttr = options.id ? ` id="${options.id}"` : "";
  const titleAttr = options.title ? ` title="${sanitizeForPrompt(options.title)}"` : "";

  return `<user_context${domainAttr}${idAttr}${titleAttr} untrusted="true">\n${sanitized}\n</user_context>`;
}

/**
 * Detects whether a string contains known adversarial prompt injection patterns.
 */
export function detectPromptInjection(input: string): {
  hasInjectionAttempt: boolean;
  matchedPattern?: string;
} {
  if (!input) return { hasInjectionAttempt: false };

  for (const pattern of INJECTION_PHRASES) {
    if (pattern.test(input)) {
      return {
        hasInjectionAttempt: true,
        matchedPattern: pattern.source,
      };
    }
  }

  return { hasInjectionAttempt: false };
}
