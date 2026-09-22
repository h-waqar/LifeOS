import { describe, it, expect } from "vitest";
import {
  createPersonSchema,
  updatePersonSchema,
  listPeopleQuerySchema,
  logInteractionSchema,
  updateInteractionSchema,
  listInteractionsQuerySchema,
} from "@/server/people/validation";
import { RELATIONSHIP_TYPES, INTERACTION_CHANNELS } from "@/types";

describe("Phase 3 Plan 03-02: CRM Validation Schemas Unit Suite", () => {
  describe("createPersonSchema", () => {
    it("validates valid input and applies defaults", () => {
      const parsed = createPersonSchema.parse({
        name: "Ada Lovelace",
      });

      expect(parsed.name).toBe("Ada Lovelace");
      expect(parsed.relationshipType).toBe("colleague");
      expect(parsed.tags).toEqual([]);
      expect(parsed.email).toBeUndefined();
      expect(parsed.company).toBeUndefined();
    });

    it("rejects empty or whitespace-only name", () => {
      expect(() => createPersonSchema.parse({ name: "" })).toThrow();
      expect(() => createPersonSchema.parse({ name: "   " })).toThrow();
    });

    it("rejects name exceeding 255 characters", () => {
      expect(() =>
        createPersonSchema.parse({ name: "a".repeat(256) })
      ).toThrow();
    });

    it("accepts all valid relationship types", () => {
      for (const relType of RELATIONSHIP_TYPES) {
        const parsed = createPersonSchema.parse({
          name: `Person ${relType}`,
          relationshipType: relType,
        });
        expect(parsed.relationshipType).toBe(relType);
      }
    });

    it("rejects invalid relationship type", () => {
      expect(() =>
        createPersonSchema.parse({
          name: "Invalid Rel",
          relationshipType: "nemesis" as any,
        })
      ).toThrow();
    });

    it("validates valid email format and rejects invalid email", () => {
      const valid = createPersonSchema.parse({
        name: "Alan Turing",
        email: "alan@bletchley.org",
      });
      expect(valid.email).toBe("alan@bletchley.org");

      expect(() =>
        createPersonSchema.parse({
          name: "Bad Email",
          email: "not-an-email",
        })
      ).toThrow();
    });

    it("trims and cleans tags array", () => {
      const parsed = createPersonSchema.parse({
        name: "Grace Hopper",
        tags: ["compiler", "navy", "  cobol  "],
      });
      expect(parsed.tags).toEqual(["compiler", "navy", "cobol"]);
    });

    it("rejects empty tag strings inside tags array", () => {
      expect(() =>
        createPersonSchema.parse({
          name: "Bad Tags",
          tags: ["valid", "   "],
        })
      ).toThrow();
    });
  });

  describe("updatePersonSchema", () => {
    it("allows partial updates", () => {
      const parsed = updatePersonSchema.parse({
        company: "Bletchley Park",
        role: "Lead Cryptanalyst",
      });

      expect(parsed.company).toBe("Bletchley Park");
      expect(parsed.role).toBe("Lead Cryptanalyst");
      expect(parsed.name).toBeUndefined();
    });

    it("rejects empty name if provided", () => {
      expect(() => updatePersonSchema.parse({ name: "" })).toThrow();
      expect(() => updatePersonSchema.parse({ name: "   " })).toThrow();
    });

    it("accepts nullable fields (clearing email, company, nextFollowUpDate)", () => {
      const parsed = updatePersonSchema.parse({
        email: null,
        phone: null,
        company: null,
        role: null,
        notes: null,
        nextFollowUpDate: null,
      });

      expect(parsed.email).toBeNull();
      expect(parsed.nextFollowUpDate).toBeNull();
    });

    it("accepts isArchived flag", () => {
      const parsed = updatePersonSchema.parse({
        isArchived: true,
      });
      expect(parsed.isArchived).toBe(true);
    });
  });

  describe("listPeopleQuerySchema", () => {
    it("parses query parameters with defaults", () => {
      const parsed = listPeopleQuerySchema.parse({});
      expect(parsed.isArchived).toBe(false);
      expect(parsed.relationshipType).toBeUndefined();
      expect(parsed.followUpStatus).toBeUndefined();
    });

    it("parses boolean string for isArchived", () => {
      const parsedTrue = listPeopleQuerySchema.parse({ isArchived: "true" });
      expect(parsedTrue.isArchived).toBe(true);

      const parsedFalse = listPeopleQuerySchema.parse({ isArchived: "false" });
      expect(parsedFalse.isArchived).toBe(false);
    });

    it("validates followUpStatus filter options", () => {
      const statuses = ["overdue", "today", "upcoming", "none"] as const;
      for (const st of statuses) {
        const parsed = listPeopleQuerySchema.parse({ followUpStatus: st });
        expect(parsed.followUpStatus).toBe(st);
      }

      expect(() =>
        listPeopleQuerySchema.parse({ followUpStatus: "invalid_status" as any })
      ).toThrow();
    });
  });

  describe("logInteractionSchema", () => {
    it("validates valid interaction input and applies channel default", () => {
      const parsed = logInteractionSchema.parse({
        summary: "Quarterly catchup call",
      });

      expect(parsed.summary).toBe("Quarterly catchup call");
      expect(parsed.channel).toBe("call");
      expect(parsed.date).toBeUndefined();
    });

    it("rejects empty summary", () => {
      expect(() => logInteractionSchema.parse({ summary: "" })).toThrow();
      expect(() => logInteractionSchema.parse({ summary: "   " })).toThrow();
    });

    it("accepts all valid channels", () => {
      for (const ch of INTERACTION_CHANNELS) {
        const parsed = logInteractionSchema.parse({
          summary: `Test ${ch}`,
          channel: ch,
        });
        expect(parsed.channel).toBe(ch);
      }
    });

    it("rejects invalid channel", () => {
      expect(() =>
        logInteractionSchema.parse({
          summary: "Telegram interaction",
          channel: "telepathy" as any,
        })
      ).toThrow();
    });

    it("parses valid ISO date strings for date and nextFollowUpDate", () => {
      const dateStr = "2026-09-22T10:00:00.000Z";
      const nextStr = "2026-09-29T10:00:00.000Z";
      const parsed = logInteractionSchema.parse({
        summary: "Discussion",
        date: dateStr,
        nextFollowUpDate: nextStr,
      });

      expect(parsed.date).toEqual(new Date(dateStr));
      expect(parsed.nextFollowUpDate).toEqual(new Date(nextStr));
    });
  });

  describe("updateInteractionSchema", () => {
    it("allows partial updates to an interaction", () => {
      const parsed = updateInteractionSchema.parse({
        channel: "email",
        summary: "Updated email summary",
      });

      expect(parsed.channel).toBe("email");
      expect(parsed.summary).toBe("Updated email summary");
      expect(parsed.date).toBeUndefined();
    });

    it("allows clearing nextFollowUpDate with null", () => {
      const parsed = updateInteractionSchema.parse({
        nextFollowUpDate: null,
      });
      expect(parsed.nextFollowUpDate).toBeNull();
    });
  });

  describe("listInteractionsQuerySchema", () => {
    it("parses query params with defaults", () => {
      const parsed = listInteractionsQuerySchema.parse({});
      expect(parsed.limit).toBe(50);
      expect(parsed.offset).toBe(0);
    });

    it("coerces string limits and offsets", () => {
      const parsed = listInteractionsQuerySchema.parse({
        limit: "25",
        offset: "10",
      });
      expect(parsed.limit).toBe(25);
      expect(parsed.offset).toBe(10);
    });

    it("clamps invalid limit values", () => {
      expect(() =>
        listInteractionsQuerySchema.parse({ limit: "0" })
      ).toThrow();
      expect(() =>
        listInteractionsQuerySchema.parse({ limit: "500" })
      ).toThrow();
    });
  });
});
