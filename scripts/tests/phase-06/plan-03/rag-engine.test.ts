import { describe, it, expect } from "vitest";
import { routeQueryIntent } from "@/server/ai/rag/intent-router";
import {
  generateCitation,
  computeCompositeScore,
  formatRAGContextXml,
} from "@/server/ai/rag/ranking";
import type { RetrievedEntity } from "@/server/ai/rag/types";

describe("Phase 6 Plan 06-03: Personal Graph RAG Engine (Unit)", () => {
  describe("1. Intent Router & Keyword Extraction", () => {
    it("detects entity domains from user prompt keywords", () => {
      expect(routeQueryIntent("Show me my notes on Next.js 15").targetDomain).toBe("note");
      expect(routeQueryIntent("What are my overdue tasks?").targetDomain).toBe("task");
      expect(routeQueryIntent("Check the status of project Phoenix").targetDomain).toBe("project");
      expect(routeQueryIntent("What is my progress on the marathon goal?").targetDomain).toBe("goal");
      expect(routeQueryIntent("Who is Sarah Jenkins in my contacts?").targetDomain).toBe("person");
      expect(routeQueryIntent("What content ideas do I have for Twitter?").targetDomain).toBe("content");
    });

    it("filters out conversational prompts with no retrieval intent", () => {
      expect(routeQueryIntent("Hello there!").needsRetrieval).toBe(false);
      expect(routeQueryIntent("Good morning").needsRetrieval).toBe(false);
      expect(routeQueryIntent("Thank you so much!").needsRetrieval).toBe(false);
      expect(routeQueryIntent("Who are you?").needsRetrieval).toBe(false);
      expect(routeQueryIntent("Tell me a joke").needsRetrieval).toBe(false);
    });

    it("strips filler phrases and extracts clean search keywords", () => {
      const r1 = routeQueryIntent("Can you please search for marketing strategy notes?");
      expect(r1.extractedQuery.toLowerCase()).toContain("marketing strategy notes");
      expect(r1.extractedQuery.toLowerCase()).not.toContain("can you please search for");

      const r2 = routeQueryIntent("What is my tax preparation task?");
      expect(r2.extractedQuery.toLowerCase()).toContain("tax preparation task");
      expect(r2.extractedQuery.toLowerCase()).not.toContain("what is my");
    });
  });

  describe("2. Citation Links & Deep Linking", () => {
    it("produces valid citation metadata mapping entity IDs to deep links", () => {
      const noteCite = generateCitation("note", "n-123", "Q3 Financial Plan");
      expect(noteCite.url).toBe("/notes?id=n-123");
      expect(noteCite.markdownLink).toBe("[Note: Q3 Financial Plan](/notes?id=n-123)");

      const taskCite = generateCitation("task", "t-456", "Submit Quarterly Return");
      expect(taskCite.url).toBe("/tasks?id=t-456");
      expect(taskCite.markdownLink).toBe("[Task: Submit Quarterly Return](/tasks?id=t-456)");

      const goalCite = generateCitation("goal", "g-789", "Run Sub-3 Marathon");
      expect(goalCite.url).toBe("/goals?id=g-789");
      expect(goalCite.markdownLink).toBe("[Goal: Run Sub-3 Marathon](/goals?id=g-789)");
    });
  });

  describe("3. Relevance Scoring & Graph Boosts", () => {
    it("boosts recently updated records over stale records", () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
      const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(); // 120 days ago

      const scoreRecent = computeCompositeScore(1.0, recentDate, false);
      const scoreOld = computeCompositeScore(1.0, oldDate, false);

      expect(scoreRecent).toBeGreaterThan(scoreOld);
      expect(scoreRecent).toBe(1.25);
      expect(scoreOld).toBe(0.9);
    });

    it("applies relational boost when entity has graph relations", () => {
      const nowIso = new Date().toISOString();
      const withRelations = computeCompositeScore(1.0, nowIso, true);
      const withoutRelations = computeCompositeScore(1.0, nowIso, false);

      expect(withRelations).toBeGreaterThan(withoutRelations);
      // 1.0 * 1.25 * 1.15 = 1.4375
      expect(withRelations).toBe(1.4375);
    });
  });

  describe("4. Token Budget Pruner & XML Formatting", () => {
    it("discards lower-ranked context items when token budget is exceeded", () => {
      const entities: RetrievedEntity[] = [
        {
          id: "e1",
          domain: "note",
          title: "High Rank Note",
          content: "Important content ".repeat(20),
          score: 10.0,
          updatedAt: new Date().toISOString(),
          citation: generateCitation("note", "e1", "High Rank Note"),
        },
        {
          id: "e2",
          domain: "task",
          title: "Medium Rank Task",
          content: "Medium task content ".repeat(20),
          score: 5.0,
          updatedAt: new Date().toISOString(),
          citation: generateCitation("task", "e2", "Medium Rank Task"),
        },
        {
          id: "e3",
          domain: "goal",
          title: "Low Rank Goal",
          content: "Low goal content ".repeat(50),
          score: 1.0,
          updatedAt: new Date().toISOString(),
          citation: generateCitation("goal", "e3", "Low Rank Goal"),
        },
      ];

      // Format with tight token budget (~80 tokens)
      const { includedEntities, formattedXml } = formatRAGContextXml(entities, 80);

      expect(includedEntities.length).toBeLessThan(entities.length);
      expect(includedEntities[0].id).toBe("e1"); // Highest score kept
      expect(formattedXml).toContain("High Rank Note");
      expect(formattedXml).toContain('untrusted="true"');
    });

    it("includes relation tags inside entity XML", () => {
      const entity: RetrievedEntity = {
        id: "task-1",
        domain: "task",
        title: "Finish quarterly tax file",
        score: 8.5,
        updatedAt: new Date().toISOString(),
        citation: generateCitation("task", "task-1", "Finish quarterly tax file"),
        relations: [
          {
            relationType: "parent_project",
            entityId: "proj-1",
            domain: "project",
            title: "2026 Taxes",
            details: "Status: in_progress",
          },
        ],
      };

      const { formattedXml } = formatRAGContextXml([entity], 500);

      expect(formattedXml).toContain('<relation type="parent_project" domain="project" id="proj-1" title="2026 Taxes" details="Status: in_progress" />');
    });
  });
});
