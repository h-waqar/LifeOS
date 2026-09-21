import { describe, it, expect } from "vitest";
import {
  createNoteSchema,
  updateNoteSchema,
  listNotesQuerySchema,
} from "@/server/notes/validation";

describe("Phase 3 Plan 03-01: Note Validation Schemas Unit Suite", () => {
  describe("createNoteSchema", () => {
    it("validates valid input and applies defaults", () => {
      const parsed = createNoteSchema.parse({
        title: "Test Note",
      });

      expect(parsed.title).toBe("Test Note");
      expect(parsed.content).toBe("");
      expect(parsed.noteType).toBe("quick");
      expect(parsed.area).toBe("general");
      expect(parsed.tags).toEqual([]);
      expect(parsed.isPinned).toBe(false);
    });

    it("rejects empty title or whitespace-only title", () => {
      expect(() => createNoteSchema.parse({ title: "" })).toThrow();
      expect(() => createNoteSchema.parse({ title: "   " })).toThrow();
    });

    it("rejects title exceeding 255 characters", () => {
      expect(() =>
        createNoteSchema.parse({ title: "a".repeat(256) })
      ).toThrow();
    });

    it("accepts valid note types and life areas", () => {
      const parsed = createNoteSchema.parse({
        title: "Meeting with Architect",
        content: "Detailed discussion...",
        noteType: "meeting",
        area: "career",
        tags: ["architecture", "backend"],
        isPinned: true,
      });

      expect(parsed.noteType).toBe("meeting");
      expect(parsed.area).toBe("career");
      expect(parsed.tags).toEqual(["architecture", "backend"]);
      expect(parsed.isPinned).toBe(true);
    });

    it("rejects invalid note types and areas", () => {
      expect(() =>
        createNoteSchema.parse({
          title: "Bad Note",
          noteType: "invalid_type",
        })
      ).toThrow();

      expect(() =>
        createNoteSchema.parse({
          title: "Bad Area",
          area: "outer_space",
        })
      ).toThrow();
    });

    it("rejects empty tag strings inside tags array", () => {
      expect(() =>
        createNoteSchema.parse({
          title: "Tags Note",
          tags: ["valid", "   "],
        })
      ).toThrow();
    });
  });

  describe("updateNoteSchema", () => {
    it("allows partial updates", () => {
      const parsed = updateNoteSchema.parse({
        title: "Updated Title",
      });

      expect(parsed.title).toBe("Updated Title");
      expect(parsed.content).toBeUndefined();
    });

    it("rejects empty title on update", () => {
      expect(() => updateNoteSchema.parse({ title: "" })).toThrow();
    });

    it("accepts isArchived and isPinned flags", () => {
      const parsed = updateNoteSchema.parse({
        isArchived: true,
        isPinned: false,
      });

      expect(parsed.isArchived).toBe(true);
      expect(parsed.isPinned).toBe(false);
    });
  });

  describe("listNotesQuerySchema", () => {
    it("parses query parameters with default limit and offset", () => {
      const parsed = listNotesQuerySchema.parse({});
      expect(parsed.limit).toBe(50);
      expect(parsed.offset).toBe(0);
    });

    it("transforms boolean query strings correctly", () => {
      const parsed = listNotesQuerySchema.parse({
        isPinned: "true",
        isArchived: "false",
      });
      expect(parsed.isPinned).toBe(true);
      expect(parsed.isArchived).toBe(false);
    });

    it("bounds limit between 1 and 100", () => {
      expect(() => listNotesQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => listNotesQuerySchema.parse({ limit: 101 })).toThrow();
    });
  });
});
