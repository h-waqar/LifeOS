import { describe, it, expect } from "vitest";
import { searchQuerySchema, searchEntityTypeSchema } from "@/server/search/validation";
import { extractSnippet } from "@/server/search/service";

describe("Phase 3 Plan 03-03: Search Validation & Helpers (Unit)", () => {
  describe("searchEntityTypeSchema", () => {
    it("accepts valid entity types and 'all'", () => {
      expect(searchEntityTypeSchema.parse("note")).toBe("note");
      expect(searchEntityTypeSchema.parse("task")).toBe("task");
      expect(searchEntityTypeSchema.parse("project")).toBe("project");
      expect(searchEntityTypeSchema.parse("goal")).toBe("goal");
      expect(searchEntityTypeSchema.parse("person")).toBe("person");
      expect(searchEntityTypeSchema.parse("all")).toBe("all");
    });

    it("rejects invalid entity types", () => {
      expect(() => searchEntityTypeSchema.parse("habit")).toThrow();
      expect(() => searchEntityTypeSchema.parse("user")).toThrow();
      expect(() => searchEntityTypeSchema.parse("")).toThrow();
    });
  });

  describe("searchQuerySchema", () => {
    it("validates a standard query string with default type and limit", () => {
      const parsed = searchQuerySchema.parse({ q: "architecture review" });
      expect(parsed.q).toBe("architecture review");
      expect(parsed.type).toBe("all");
      expect(parsed.limit).toBe(20);
    });

    it("trims whitespace from query", () => {
      const parsed = searchQuerySchema.parse({ q: "  meeting notes   " });
      expect(parsed.q).toBe("meeting notes");
    });

    it("rejects empty query or whitespace-only query", () => {
      expect(() => searchQuerySchema.parse({ q: "" })).toThrow();
      expect(() => searchQuerySchema.parse({ q: "    " })).toThrow();
      expect(() => searchQuerySchema.parse({})).toThrow();
    });

    it("rejects query exceeding 200 characters", () => {
      const longQuery = "a".repeat(201);
      expect(() => searchQuerySchema.parse({ q: longQuery })).toThrow(/too long|maximum length/);
    });

    it("accepts specific entity type filters and custom limits", () => {
      const parsed = searchQuerySchema.parse({
        q: "budget",
        type: "project",
        limit: "50",
      });
      expect(parsed.q).toBe("budget");
      expect(parsed.type).toBe("project");
      expect(parsed.limit).toBe(50);
    });

    it("bounds limit between 1 and 100", () => {
      expect(() =>
        searchQuerySchema.parse({ q: "test", limit: 0 })
      ).toThrow();
      expect(() =>
        searchQuerySchema.parse({ q: "test", limit: 101 })
      ).toThrow();
    });
  });

  describe("extractSnippet helper", () => {
    it("returns undefined for null, undefined, or empty text", () => {
      expect(extractSnippet(null, "term")).toBeUndefined();
      expect(extractSnippet(undefined, "term")).toBeUndefined();
      expect(extractSnippet("", "term")).toBeUndefined();
      expect(extractSnippet("   ", "term")).toBeUndefined();
    });

    it("extracts a snippet around matching term", () => {
      const text =
        "This is a long introductory sentence before the critical discussion on quarterly budget allocations for engineering.";
      const snippet = extractSnippet(text, "budget");
      expect(snippet).toBeDefined();
      expect(snippet).toContain("budget");
      expect(snippet).toContain("quarterly");
    });

    it("handles term near the start of the text", () => {
      const text = "Budgeting is the most important financial exercise for our team this fiscal quarter.";
      const snippet = extractSnippet(text, "budget");
      expect(snippet).toBeDefined();
      expect(snippet).toContain("Budgeting");
    });

    it("handles multi-word query terms matching earliest term", () => {
      const text = "First we plan the sprint, then we execute the tasks, and finally we review progress.";
      const snippet = extractSnippet(text, "tasks sprint");
      expect(snippet).toBeDefined();
      expect(snippet).toContain("sprint");
    });

    it("falls back to truncated text if query term is not found", () => {
      const text = "A completely unrelated document discussing gardening techniques and tomato varieties.";
      const snippet = extractSnippet(text, "database");
      expect(snippet).toBeDefined();
      expect(snippet).toContain("gardening");
    });
  });
});
