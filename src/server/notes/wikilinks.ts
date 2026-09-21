/**
 * Wikilink Parsing and Extraction Engine
 * Supports standard [[Note Title]] and aliased [[Note Title|Custom Display Text]] syntax.
 * Automatically ignores wikilinks inside code blocks and inline code.
 */

export interface ExtractedWikilink {
  targetTitle: string;
  displayText: string | null;
}

/**
 * Generate URL/Lookup friendly slug from a note title.
 * e.g., "Architecture & Design Decs 2026!" -> "architecture-design-decs-2026"
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove non-alphanumeric except whitespace and hyphens
    .replace(/[\s_-]+/g, "-") // collapse whitespace/underscores into single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * Parses markdown content and extracts all wikilinks.
 * Syntax:
 * - [[Note Title]]
 * - [[Note Title|Custom Display]]
 *
 * Ignores wikilinks inside code blocks:
 * - ```code```
 * - `inline code`
 */
export function parseWikilinks(content: string): ExtractedWikilink[] {
  if (!content || typeof content !== "string") {
    return [];
  }

  // 1. Mask fenced code blocks (```...```) and inline code (`...`)
  const codeBlockMasked = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ");

  // 2. Regular expression for wikilinks: [[targetTitle]] or [[targetTitle|displayText]]
  const wikilinkRegex = /\[\[([^[\]|\r\n]+)(?:\|([^[\]\r\n]+))?\]\]/g;

  const linksMap = new Map<string, ExtractedWikilink>();

  let match: RegExpExecArray | null;
  while ((match = wikilinkRegex.exec(codeBlockMasked)) !== null) {
    const rawTarget = match[1]?.trim();
    const rawDisplay = match[2]?.trim() || null;

    if (!rawTarget) {
      continue;
    }

    const normalizedKey = rawTarget.toLowerCase();
    if (!linksMap.has(normalizedKey)) {
      linksMap.set(normalizedKey, {
        targetTitle: rawTarget,
        displayText: rawDisplay,
      });
    }
  }

  return Array.from(linksMap.values());
}

/**
 * Extracts a contextual snippet surrounding a wikilink in content.
 * Returns up to maxLen characters with ellipsis.
 */
export function extractSnippet(
  content: string,
  targetTitle: string,
  maxLen = 140
): string {
  if (!content) return "";

  const escapedTitle = targetTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\[\\[${escapedTitle}(?:\\|[^\\]]+)?\\]\\]`, "i");
  const match = pattern.exec(content);

  if (!match) {
    // Return first maxLen chars of content if no exact wikilink match
    return content.slice(0, maxLen).trim() + (content.length > maxLen ? "..." : "");
  }

  const matchIdx = match.index;
  const matchLength = match[0].length;
  const halfContext = Math.floor((maxLen - matchLength) / 2);

  const start = Math.max(0, matchIdx - halfContext);
  const end = Math.min(content.length, matchIdx + matchLength + halfContext);

  let snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}
