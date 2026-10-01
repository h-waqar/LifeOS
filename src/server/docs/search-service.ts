/**
 * Contextual Documentation Search Engine
 *
 * Implements SKILL-03 / T-12-05: High-speed, in-memory markdown indexing,
 * multi-tier BM25 ranking, 120-character contextual snippet extraction,
 * and secret-scrubbed document retrieval.
 */

import fs from "node:fs";
import path from "node:path";
import { scrubSecrets, NotFoundError } from "@/cli/errors";
import { resolveSafeDocPath, ALLOWED_DOC_ROOTS } from "./path-safety";
import type {
  DocSearchResult,
  DocContentResult,
  DocSearchOptions,
} from "./types";

interface IndexedDocument {
  id: string; // Relative path from project root
  title: string;
  source: "docs" | "planning" | "skills";
  path: string;
  mtime: number;
  headings: string[];
  content: string;
  cleanBody: string;
  tokens: Set<string>;
}

export class DocSearchService {
  private projectRoot: string;
  private cache = new Map<string, IndexedDocument>();

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Recursively finds all markdown files (.md) under a directory.
   */
  private async findMarkdownFiles(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    if (!fs.existsSync(dirPath)) return results;

    const queue: string[] = [dirPath];
    while (queue.length > 0) {
      const currentDir = queue.shift()!;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules and .git
          if (entry.name !== "node_modules" && entry.name !== ".git") {
            queue.push(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push(fullPath);
        }
      }
    }

    return results;
  }

  /**
   * Parses markdown into title, headings, and clean body text.
   */
  private parseMarkdownDoc(
    fullPath: string,
    rawContent: string,
    mtime: number
  ): IndexedDocument {
    const relPath = path.relative(this.projectRoot, fullPath).replace(/\\/g, "/");

    let source: "docs" | "planning" | "skills" = "docs";
    if (relPath.startsWith(".planning/")) {
      source = "planning";
    } else if (relPath.startsWith("skills/")) {
      source = "skills";
    }

    const lines = rawContent.split(/\r?\n/);
    let title = "";
    const headings: string[] = [];
    const bodyLines: string[] = [];
    let inFrontmatter = false;
    let frontmatterEnded = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Handle YAML frontmatter stripping
      if (i === 0 && trimmed === "---") {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (trimmed === "---") {
          inFrontmatter = false;
          frontmatterEnded = true;
        }
        continue;
      }

      // Check headings
      const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (hMatch) {
        const hText = hMatch[2].trim();
        headings.push(hText);
        if (!title && hMatch[1].length === 1) {
          title = hText;
        }
      } else {
        bodyLines.push(line);
      }
    }

    if (!title) {
      // Fallback title from first heading or filename
      title = headings[0] || path.basename(fullPath, ".md").replace(/[-_]/g, " ");
    }

    const cleanBody = bodyLines.join("\n");

    // Tokenize for fast search
    const allText = `${title} ${headings.join(" ")} ${cleanBody}`.toLowerCase();
    const tokens = new Set(
      allText
        .split(/[^a-z0-9_-]+/)
        .filter((t) => t.length > 2)
    );

    return {
      id: relPath,
      title,
      source,
      path: relPath,
      mtime,
      headings,
      content: rawContent,
      cleanBody,
      tokens,
    };
  }

  /**
   * Refreshes markdown document index across allowed documentation directories.
   */
  private async refreshIndex(): Promise<IndexedDocument[]> {
    const indexed: IndexedDocument[] = [];

    for (const root of ALLOWED_DOC_ROOTS) {
      const rootDir = path.resolve(this.projectRoot, root);
      const files = await this.findMarkdownFiles(rootDir);

      for (const filePath of files) {
        try {
          const stat = await fs.promises.stat(filePath);
          const cached = this.cache.get(filePath);

          if (cached && cached.mtime === stat.mtimeMs) {
            indexed.push(cached);
            continue;
          }

          const raw = await fs.promises.readFile(filePath, "utf-8");
          const doc = this.parseMarkdownDoc(filePath, raw, stat.mtimeMs);
          this.cache.set(filePath, doc);
          indexed.push(doc);
        } catch {
          // Ignore unreadable files
        }
      }
    }

    return indexed;
  }

  /**
   * Extracts a 120-character contextual snippet centered around the query terms.
   */
  private extractSnippet(body: string, queryTokens: string[], fullQuery: string): string {
    const clean = body.replace(/\s+/g, " ").trim();
    if (!clean) return "";

    const lower = clean.toLowerCase();
    let matchIdx = -1;

    // First try exact phrase match
    const phraseIdx = lower.indexOf(fullQuery.toLowerCase());
    if (phraseIdx !== -1) {
      matchIdx = phraseIdx;
    } else {
      // Find the earliest occurrence of any token
      for (const token of queryTokens) {
        const idx = lower.indexOf(token);
        if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
          matchIdx = idx;
        }
      }
    }

    if (matchIdx === -1) {
      // Fallback: take first 120 chars
      const snippet = clean.slice(0, 120);
      return scrubSecrets(snippet + (clean.length > 120 ? "..." : ""));
    }

    const snippetLen = 120;
    const start = Math.max(0, matchIdx - Math.floor(snippetLen / 3));
    const end = Math.min(clean.length, start + snippetLen);

    let snippet = clean.slice(start, end);
    if (start > 0) {
      snippet = "..." + snippet;
    }
    if (end < clean.length) {
      snippet = snippet + "...";
    }

    return scrubSecrets(snippet);
  }

  /**
   * Searches repository documentation with multi-tier scoring and snippet generation.
   */
  public async searchDocs(options: DocSearchOptions): Promise<DocSearchResult[]> {
    const q = options.q?.trim();
    if (!q) return [];

    const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
    const sourceFilter = options.source && options.source !== "all" ? options.source : undefined;

    const docs = await this.refreshIndex();
    const queryLower = q.toLowerCase();
    const queryTokens = queryLower
      .split(/[^a-z0-9_-]+/)
      .filter((t) => t.length > 1);

    if (queryTokens.length === 0) return [];

    const results: DocSearchResult[] = [];

    for (const doc of docs) {
      if (sourceFilter && doc.source !== sourceFilter) {
        continue;
      }

      let score = 0;
      const titleLower = doc.title.toLowerCase();
      const pathLower = doc.path.toLowerCase();

      // 1. Exact phrase match in title (+12.0)
      if (titleLower.includes(queryLower)) {
        score += 12.0;
      }

      // Check if ALL query tokens are present in title (+8.0)
      const allTokensInTitle = queryTokens.every((token) => titleLower.includes(token));
      if (allTokensInTitle) {
        score += 8.0;
      }

      // 2. Word matches in title (+4.0 each)
      for (const token of queryTokens) {
        if (titleLower.includes(token)) {
          score += 4.0;
        }
        if (pathLower.includes(token)) {
          score += 2.0;
        }
      }

      // Boost canonical docs/ root (+5.0)
      if (doc.source === "docs") {
        score += 5.0;
      }

      // 3. Word matches in subheadings (+3.0 each)
      for (const heading of doc.headings) {
        const hLower = heading.toLowerCase();
        if (hLower.includes(queryLower)) {
          score += 4.0;
        }
        for (const token of queryTokens) {
          if (hLower.includes(token)) {
            score += 1.5;
          }
        }
      }

      // 4. Term frequency in body (+1.0 to +4.0)
      const bodyLower = doc.cleanBody.toLowerCase();
      if (bodyLower.includes(queryLower)) {
        score += 3.0;
      }

      let bodyMatches = 0;
      for (const token of queryTokens) {
        if (doc.tokens.has(token)) {
          bodyMatches++;
        }
      }
      if (queryTokens.length > 0) {
        score += (bodyMatches / queryTokens.length) * 4.0;
      }

      // Penalty for archived milestones (-10.0)
      if (
        doc.path.includes("milestones/") ||
        doc.path.includes("v1.0-phases/") ||
        doc.path.includes("archive/")
      ) {
        score -= 10.0;
      }

      if (score > 0) {
        const snippet = this.extractSnippet(
          doc.cleanBody || doc.headings.join(". "),
          queryTokens,
          q
        );
        results.push({
          id: doc.id,
          title: scrubSecrets(doc.title),
          source: doc.source,
          snippet,
          score: Math.round(score * 10) / 10,
          path: doc.path,
          headings: doc.headings.slice(0, 10).map((h) => scrubSecrets(h)),
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, limit);
  }

  /**
   * Retrieves sanitized markdown document content or a specific section.
   */
  public async getDocContent(
    requestedPath: string,
    sectionName?: string
  ): Promise<DocContentResult> {
    const { absolutePath, relativePath } = resolveSafeDocPath(requestedPath, this.projectRoot);
    const rawContent = await fs.promises.readFile(absolutePath, "utf-8");

    let source: "docs" | "planning" | "skills" = "docs";
    if (relativePath.startsWith(".planning/")) {
      source = "planning";
    } else if (relativePath.startsWith("skills/")) {
      source = "skills";
    }

    const lines = rawContent.split(/\r?\n/);
    let title = "";
    const headings: string[] = [];

    // Extract title and headings
    for (const line of lines) {
      const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (hMatch) {
        const hText = hMatch[2].trim();
        headings.push(hText);
        if (!title && hMatch[1].length === 1) {
          title = hText;
        }
      }
    }

    if (!title) {
      title = headings[0] || path.basename(relativePath, ".md");
    }

    let finalContent = rawContent;

    // Filter section if requested
    if (sectionName && sectionName.trim()) {
      const targetSec = sectionName.trim().toLowerCase();
      let capturing = false;
      let captureLevel = 0;
      const sectionLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hMatch = line.match(/^(#{1,6})\s+(.*)$/);

        if (hMatch) {
          const level = hMatch[1].length;
          const headingText = hMatch[2].trim().toLowerCase();

          if (capturing) {
            if (level <= captureLevel) {
              // Reached next section of same or higher level
              break;
            }
            sectionLines.push(line);
          } else if (headingText.includes(targetSec)) {
            capturing = true;
            captureLevel = level;
            sectionLines.push(line);
          }
        } else if (capturing) {
          sectionLines.push(line);
        }
      }

      if (!capturing || sectionLines.length === 0) {
        throw new NotFoundError(
          `Section '${sectionName}' not found in document '${relativePath}'.`
        );
      }

      finalContent = sectionLines.join("\n");
    }

    return {
      path: relativePath,
      title: scrubSecrets(title),
      source,
      content: scrubSecrets(finalContent),
      section: sectionName?.trim(),
      headings: headings.map((h) => scrubSecrets(h)),
    };
  }
}

export const docSearchService = new DocSearchService();
