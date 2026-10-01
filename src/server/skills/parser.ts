/**
 * Safe YAML Frontmatter Parser & Validation Engine
 *
 * Implements SKILL-02: Safely parses YAML frontmatter without executing arbitrary
 * code, extracts markdown bodies, and validates against SkillFrontmatterSchema.
 */

import { CliError, EXIT_CODES } from "@/cli/errors";
import { SkillFrontmatterSchema, type SkillDetail, type SkillFrontmatter } from "./types";

export class SkillValidationError extends CliError {
  readonly filePath?: string;
  readonly issues?: unknown;

  constructor(message: string, options?: { filePath?: string; issues?: unknown }) {
    super(message, {
      exitCode: EXIT_CODES.ERROR_VALIDATION,
      code: "SKILL_VALIDATION_ERROR",
      details: options?.issues,
    });
    this.name = "SkillValidationError";
    this.filePath = options?.filePath;
    this.issues = options?.issues;
  }
}

/**
 * Strips quotes if a string begins and ends with matching double or single quotes.
 */
function unquote(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parses inline JSON-style array or comma-separated brackets: `["a", "b"]` or `[a, b]`
 */
function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];

  // Match quoted strings or non-comma items
  const items: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuotes) {
      if (ch === quoteChar) {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
      } else if (ch === ",") {
        items.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  if (current.trim()) {
    items.push(current.trim());
  }

  return items.map(unquote);
}

/**
 * Safe, zero-eval YAML parser specifically tailored for skill frontmatter:
 * handles scalar key-values, multiline bullet lists (- "item"), and inline arrays ([...]).
 */
export function parseYamlFrontmatter(yamlContent: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlContent.split(/\r?\n/);

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines or full-line comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Check if line is a list item: e.g. "  - item" or "- item"
    const listItemMatch = line.match(/^\s*-\s+(.*)$/);
    if (listItemMatch && currentKey) {
      if (!currentList) {
        currentList = [];
        result[currentKey] = currentList;
      }
      let itemVal = listItemMatch[1].trim();
      // Remove trailing comments if not in quotes
      if (!itemVal.startsWith('"') && !itemVal.startsWith("'")) {
        const hashIdx = itemVal.indexOf(" #");
        if (hashIdx !== -1) {
          itemVal = itemVal.slice(0, hashIdx).trim();
        }
      }
      currentList.push(unquote(itemVal));
      continue;
    }

    // Otherwise, expect a key-value pair: "key: value" or "key:"
    const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      // Flush previous list state
      currentKey = kvMatch[1].trim();
      currentList = null;

      let valuePart = kvMatch[2].trim();

      // Strip comment if present
      if (!valuePart.startsWith('"') && !valuePart.startsWith("'")) {
        const hashIdx = valuePart.indexOf(" #");
        if (hashIdx !== -1) {
          valuePart = valuePart.slice(0, hashIdx).trim();
        }
      }

      if (valuePart === "" || valuePart === "|" || valuePart === ">") {
        // Multi-line list or block scalar starting on next lines
        continue;
      }

      if (valuePart.startsWith("[") && valuePart.endsWith("]")) {
        result[currentKey] = parseInlineArray(valuePart);
      } else {
        result[currentKey] = unquote(valuePart);
      }
    }
  }

  return result;
}

/**
 * Extracts frontmatter block, parses metadata, and validates against SkillFrontmatterSchema.
 * Returns structured SkillDetail with clean markdown body.
 */
export function parseSkillMarkdown(rawContent: string, filePath?: string): SkillDetail {
  if (!rawContent || typeof rawContent !== "string") {
    throw new SkillValidationError(
      `Invalid skill document: content is empty or not a string${filePath ? ` (${filePath})` : ""}`,
      { filePath }
    );
  }

  // Frontmatter must begin at start of string bounded by ---
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new SkillValidationError(
      `Missing or malformed YAML frontmatter block bounded by '---' delimiters${filePath ? ` in ${filePath}` : ""}.`,
      { filePath }
    );
  }

  const yamlPart = match[1];
  const markdownBody = match[2].trim();

  let rawObj: Record<string, unknown>;
  try {
    rawObj = parseYamlFrontmatter(yamlPart);
  } catch (err) {
    throw new SkillValidationError(
      `Failed to parse YAML frontmatter${filePath ? ` in ${filePath}` : ""}: ${err instanceof Error ? err.message : String(err)}`,
      { filePath, issues: err }
    );
  }

  const parsed = SkillFrontmatterSchema.safeParse(rawObj);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new SkillValidationError(
      `Skill frontmatter validation failed${filePath ? ` in ${filePath}` : ""}: ${errorDetails}`,
      { filePath, issues: parsed.error.format() }
    );
  }

  return {
    ...parsed.data,
    body: markdownBody,
    rawContent,
    path: filePath ?? "",
  };
}
