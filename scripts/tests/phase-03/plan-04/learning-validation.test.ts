import { describe, it, expect } from "vitest";
import {
  createLearningItemSchema,
  updateLearningItemSchema,
  listLearningItemsQuerySchema,
  learningTypeEnum,
  learningStatusEnum,
} from "@/server/learning/validation";
import {
  createNoteSchema,
  updateNoteSchema,
  listNotesQuerySchema,
} from "@/server/notes/validation";
import { LEARNING_TYPES, LEARNING_STATUSES } from "@/types";

describe("Phase 3 Plan 03-04: Learning Validation Schemas Unit Suite", () => {
  describe("createLearningItemSchema", () => {
    it("validates valid minimal input and applies defaults", () => {
      const parsed = createLearningItemSchema.parse({
        title: "Designing Data-Intensive Applications",
      });

      expect(parsed.title).toBe("Designing Data-Intensive Applications");
      expect(parsed.type).toBe("book");
      expect(parsed.status).toBe("not_started");
      expect(parsed.progress).toBe(0);
      expect(parsed.currentUnits).toBe(0);
      expect(parsed.totalUnits).toBeUndefined();
      expect(parsed.unitType).toBeUndefined();
      expect(parsed.keyTakeaways).toEqual([]);
      expect(parsed.tags).toEqual([]);
      expect(parsed.author).toBeUndefined();
      expect(parsed.url).toBeUndefined();
      expect(parsed.rating).toBeUndefined();
    });

    it("rejects empty or whitespace-only title", () => {
      expect(() => createLearningItemSchema.parse({ title: "" })).toThrow(
        "Learning item title cannot be empty"
      );
      expect(() => createLearningItemSchema.parse({ title: "   " })).toThrow(
        "Learning item title cannot be empty"
      );
    });

    it("rejects title exceeding 255 characters", () => {
      expect(() =>
        createLearningItemSchema.parse({ title: "a".repeat(256) })
      ).toThrow("Learning item title cannot exceed 255 characters");
    });

    it("trims title whitespace", () => {
      const parsed = createLearningItemSchema.parse({
        title: "   Structure and Interpretation of Computer Programs   ",
      });
      expect(parsed.title).toBe(
        "Structure and Interpretation of Computer Programs"
      );
    });

    it("accepts all valid learning types", () => {
      for (const type of LEARNING_TYPES) {
        const parsed = createLearningItemSchema.parse({
          title: `Item of type ${type}`,
          type,
        });
        expect(parsed.type).toBe(type);
      }
    });

    it("rejects invalid learning type", () => {
      expect(() =>
        createLearningItemSchema.parse({
          title: "Invalid Type Item",
          type: "videogame" as any,
        })
      ).toThrow();
    });

    it("accepts all valid learning statuses", () => {
      for (const status of LEARNING_STATUSES) {
        const parsed = createLearningItemSchema.parse({
          title: `Item with status ${status}`,
          status,
        });
        expect(parsed.status).toBe(status);
      }
    });

    it("rejects invalid learning status", () => {
      expect(() =>
        createLearningItemSchema.parse({
          title: "Invalid Status Item",
          status: "abandoned" as any,
        })
      ).toThrow();
    });

    it("validates ratings between 1 and 5 and allows null/undefined", () => {
      for (let r = 1; r <= 5; r++) {
        const parsed = createLearningItemSchema.parse({
          title: "Rated Item",
          rating: r,
        });
        expect(parsed.rating).toBe(r);
      }

      const withNull = createLearningItemSchema.parse({
        title: "Null Rating",
        rating: null,
      });
      expect(withNull.rating).toBeNull();

      expect(() =>
        createLearningItemSchema.parse({ title: "Zero Rating", rating: 0 })
      ).toThrow("Rating must be between 1 and 5");

      expect(() =>
        createLearningItemSchema.parse({ title: "High Rating", rating: 6 })
      ).toThrow("Rating must be between 1 and 5");

      expect(() =>
        createLearningItemSchema.parse({ title: "Float Rating", rating: 4.5 })
      ).toThrow("Rating must be an integer");
    });

    it("validates progress between 0 and 100", () => {
      const p0 = createLearningItemSchema.parse({
        title: "Prog 0",
        progress: 0,
      });
      expect(p0.progress).toBe(0);

      const p50 = createLearningItemSchema.parse({
        title: "Prog 50",
        progress: 50,
      });
      expect(p50.progress).toBe(50);

      const p100 = createLearningItemSchema.parse({
        title: "Prog 100",
        progress: 100,
      });
      expect(p100.progress).toBe(100);

      expect(() =>
        createLearningItemSchema.parse({ title: "Prog -1", progress: -1 })
      ).toThrow("Progress must be between 0 and 100");

      expect(() =>
        createLearningItemSchema.parse({ title: "Prog 101", progress: 101 })
      ).toThrow("Progress must be between 0 and 100");

      expect(() =>
        createLearningItemSchema.parse({ title: "Prog Float", progress: 75.5 })
      ).toThrow("Progress must be an integer");
    });

    it("handles URLs correctly (valid, empty transformed to null, null, invalid)", () => {
      const valid = createLearningItemSchema.parse({
        title: "URL Item",
        url: "https://example.com/course",
      });
      expect(valid.url).toBe("https://example.com/course");

      const empty = createLearningItemSchema.parse({
        title: "Empty URL",
        url: "",
      });
      expect(empty.url).toBeNull();

      const nullUrl = createLearningItemSchema.parse({
        title: "Null URL",
        url: null,
      });
      expect(nullUrl.url).toBeNull();

      expect(() =>
        createLearningItemSchema.parse({
          title: "Bad URL",
          url: "not-a-valid-url",
        })
      ).toThrow("Invalid URL format");
    });

    it("validates current and total units and unit type", () => {
      const units = createLearningItemSchema.parse({
        title: "Book with pages",
        currentUnits: 150,
        totalUnits: 450,
        unitType: "pages",
      });
      expect(units.currentUnits).toBe(150);
      expect(units.totalUnits).toBe(450);
      expect(units.unitType).toBe("pages");

      expect(() =>
        createLearningItemSchema.parse({
          title: "Negative units",
          currentUnits: -5,
        })
      ).toThrow("Current units cannot be negative");

      expect(() =>
        createLearningItemSchema.parse({
          title: "Negative total",
          totalUnits: -10,
        })
      ).toThrow("Total units cannot be negative");

      expect(() =>
        createLearningItemSchema.parse({
          title: "Long unit type",
          unitType: "u".repeat(51),
        })
      ).toThrow("Unit type cannot exceed 50 characters");
    });

    it("validates key takeaways and tags arrays", () => {
      const parsed = createLearningItemSchema.parse({
        title: "Takeaways test",
        keyTakeaways: [
          "Always prefer immutability",
          "  Use indexes for queries  ",
        ],
        tags: ["software", "  architecture  "],
      });
      expect(parsed.keyTakeaways).toEqual([
        "Always prefer immutability",
        "Use indexes for queries",
      ]);
      expect(parsed.tags).toEqual(["software", "architecture"]);

      expect(() =>
        createLearningItemSchema.parse({
          title: "Empty takeaway",
          keyTakeaways: ["Valid", ""],
        })
      ).toThrow("Key takeaway cannot be empty");

      expect(() =>
        createLearningItemSchema.parse({
          title: "Empty tag",
          tags: ["Valid", "  "],
        })
      ).toThrow("Tag cannot be empty");
    });

    it("accepts optional goalId and projectId", () => {
      const parsed = createLearningItemSchema.parse({
        title: "Linked item",
        goalId: "goal-123",
        projectId: "proj-456",
      });
      expect(parsed.goalId).toBe("goal-123");
      expect(parsed.projectId).toBe("proj-456");

      const nullIds = createLearningItemSchema.parse({
        title: "Unlinked item",
        goalId: null,
        projectId: null,
      });
      expect(nullIds.goalId).toBeNull();
      expect(nullIds.projectId).toBeNull();
    });
  });

  describe("updateLearningItemSchema", () => {
    it("allows partial updates", () => {
      const parsed = updateLearningItemSchema.parse({
        progress: 85,
        rating: 5,
        status: "in_progress",
      });
      expect(parsed.progress).toBe(85);
      expect(parsed.rating).toBe(5);
      expect(parsed.status).toBe("in_progress");
      expect(parsed.title).toBeUndefined();
    });

    it("validates completedAt and isArchived", () => {
      const dateStr = "2026-09-22T10:00:00.000Z";
      const parsed = updateLearningItemSchema.parse({
        isArchived: true,
        completedAt: dateStr,
      });
      expect(parsed.isArchived).toBe(true);
      expect(parsed.completedAt).toBeInstanceOf(Date);
    });

    it("rejects invalid partial field values", () => {
      expect(() =>
        updateLearningItemSchema.parse({
          progress: 150,
        })
      ).toThrow();

      expect(() =>
        updateLearningItemSchema.parse({
          rating: 0,
        })
      ).toThrow();
    });
  });

  describe("listLearningItemsQuerySchema", () => {
    it("provides defaults for pagination and sorting", () => {
      const parsed = listLearningItemsQuerySchema.parse({});
      expect(parsed.sortBy).toBe("updatedAt");
      expect(parsed.sortOrder).toBe("desc");
      expect(parsed.limit).toBe(50);
      expect(parsed.offset).toBe(0);
      expect(parsed.isArchived).toBeUndefined();
    });

    it("parses filter parameters", () => {
      const parsed = listLearningItemsQuerySchema.parse({
        type: "book",
        status: "completed",
        goalId: "g1",
        projectId: "p1",
        tag: "typescript",
        search: "clean code",
        isArchived: "true",
        limit: "25",
        offset: "10",
      });
      expect(parsed.type).toBe("book");
      expect(parsed.status).toBe("completed");
      expect(parsed.goalId).toBe("g1");
      expect(parsed.projectId).toBe("p1");
      expect(parsed.tag).toBe("typescript");
      expect(parsed.search).toBe("clean code");
      expect(parsed.isArchived).toBe(true);
      expect(parsed.limit).toBe(25);
      expect(parsed.offset).toBe(10);
    });
  });

  describe("Notes schema learningId linkage (NOTE-04 & NOTE-06)", () => {
    it("createNoteSchema accepts optional/nullable learningId", () => {
      const withLearning = createNoteSchema.parse({
        title: "Notes on Chapter 3",
        learningId: "learning-item-789",
      });
      expect(withLearning.learningId).toBe("learning-item-789");

      const withNullLearning = createNoteSchema.parse({
        title: "General Quick Note",
        learningId: null,
      });
      expect(withNullLearning.learningId).toBeNull();

      const withoutLearning = createNoteSchema.parse({
        title: "No Learning Prop",
      });
      expect(withoutLearning.learningId).toBeUndefined();
    });

    it("updateNoteSchema accepts learningId modification or nullification", () => {
      const updated = updateNoteSchema.parse({
        learningId: "learning-item-new",
      });
      expect(updated.learningId).toBe("learning-item-new");

      const unlinked = updateNoteSchema.parse({
        learningId: null,
      });
      expect(unlinked.learningId).toBeNull();
    });

    it("listNotesQuerySchema parses learningId filter parameter", () => {
      const query = listNotesQuerySchema.parse({
        learningId: "learning-item-filter",
      });
      expect(query.learningId).toBe("learning-item-filter");
    });
  });
});
