import { describe, it, expect } from "vitest";
import {
  slugifyTitle,
  parseWikilinks,
  extractSnippet,
} from "@/server/notes/wikilinks";

describe("Phase 3 Plan 03-01: Wikilink Engine Unit Suite", () => {
  describe("slugifyTitle", () => {
    it("converts simple title to lowercase hyphenated slug", () => {
      expect(slugifyTitle("System Architecture")).toBe("system-architecture");
    });

    it("strips special characters and punctuation", () => {
      expect(slugifyTitle("Hello, World! #2026?")).toBe("hello-world-2026");
    });

    it("collapses multiple spaces and underscores into a single hyphen", () => {
      expect(slugifyTitle("Deep   Learning___Algorithms")).toBe(
        "deep-learning-algorithms"
      );
    });

    it("trims leading and trailing hyphens and whitespace", () => {
      expect(slugifyTitle("  --My Project Notes--  ")).toBe("my-project-notes");
    });

    it("returns empty string for empty or non-alphanumeric input", () => {
      expect(slugifyTitle("")).toBe("");
      expect(slugifyTitle("!@#$%^&*()")).toBe("");
    });
  });

  describe("parseWikilinks", () => {
    it("extracts standard [[Note Title]] wikilinks", () => {
      const content = "This note references [[System Architecture]] and [[Docker Basics]].";
      const links = parseWikilinks(content);

      expect(links).toHaveLength(2);
      expect(links).toEqual([
        { targetTitle: "System Architecture", displayText: null },
        { targetTitle: "Docker Basics", displayText: null },
      ]);
    });

    it("extracts aliased [[Target Title|Display Text]] wikilinks", () => {
      const content = "Check out [[Product Roadmap|the master roadmap]] for details.";
      const links = parseWikilinks(content);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        targetTitle: "Product Roadmap",
        displayText: "the master roadmap",
      });
    });

    it("deduplicates multiple mentions of the same target title case-insensitively", () => {
      const content = "See [[Architecture]] and later [[architecture]] again.";
      const links = parseWikilinks(content);

      expect(links).toHaveLength(1);
      expect(links[0].targetTitle).toBe("Architecture");
    });

    it("ignores wikilinks inside fenced code blocks", () => {
      const content = `
Here is a normal link: [[Valid Note]]

\`\`\`markdown
This is inside code: [[Ignored Note 1]]
And another [[Ignored Note 2|Alias]]
\`\`\`

And another normal link: [[Second Valid Note]]
      `;

      const links = parseWikilinks(content);
      expect(links).toHaveLength(2);
      expect(links.map((l) => l.targetTitle)).toEqual([
        "Valid Note",
        "Second Valid Note",
      ]);
    });

    it("ignores wikilinks inside inline code spans", () => {
      const content = "Use the command `[[Not A Link]]` in your shell, but check [[Real Note]].";
      const links = parseWikilinks(content);

      expect(links).toHaveLength(1);
      expect(links[0].targetTitle).toBe("Real Note");
    });

    it("returns empty array for empty, undefined, or link-less content", () => {
      expect(parseWikilinks("")).toEqual([]);
      expect(parseWikilinks("Just plain markdown text without brackets.")).toEqual([]);
      expect(parseWikilinks("[Single bracket link](http://example.com)")).toEqual([]);
    });
  });

  describe("extractSnippet", () => {
    it("extracts contextual text surrounding the matched wikilink", () => {
      const content =
        "The quick brown fox jumps over the lazy dog. In this context, we refer to [[System Architecture]] as the foundation of LifeOS. More text follows here.";
      const snippet = extractSnippet(content, "System Architecture", 80);

      expect(snippet).toContain("[[System Architecture]]");
      expect(snippet.length).toBeLessThanOrEqual(90);
    });

    it("returns beginning of text if no exact wikilink match is found", () => {
      const content = "Short note content without link.";
      const snippet = extractSnippet(content, "Missing Note", 50);

      expect(snippet).toBe("Short note content without link.");
    });
  });
});
