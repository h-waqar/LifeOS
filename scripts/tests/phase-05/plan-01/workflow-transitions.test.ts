import { describe, it, expect } from "vitest";
import {
  canTransition,
  validateStatusTransition,
  ALLOWED_TRANSITIONS,
} from "@/server/content/workflow";
import type { ContentStatus } from "@/types";

describe("Workflow State Machine & Lifecycle Transitions (Plan 05-01)", () => {
  describe("State Transition Matrix (canTransition)", () => {
    it("allows same-status transitions (idempotency)", () => {
      const statuses: ContentStatus[] = [
        "idea",
        "draft",
        "in_review",
        "scheduled",
        "published",
        "archived",
      ];
      for (const s of statuses) {
        expect(canTransition(s, s)).toBe(true);
      }
    });

    it("verifies permitted transitions from idea", () => {
      expect(canTransition("idea", "draft")).toBe(true);
      expect(canTransition("idea", "archived")).toBe(true);

      expect(canTransition("idea", "scheduled")).toBe(false);
      expect(canTransition("idea", "published")).toBe(false);
      expect(canTransition("idea", "in_review")).toBe(false);
    });

    it("verifies permitted transitions from draft", () => {
      expect(canTransition("draft", "in_review")).toBe(true);
      expect(canTransition("draft", "idea")).toBe(true);
      expect(canTransition("draft", "scheduled")).toBe(true);
      expect(canTransition("draft", "archived")).toBe(true);

      expect(canTransition("draft", "published")).toBe(false);
    });

    it("verifies permitted transitions from in_review", () => {
      expect(canTransition("in_review", "draft")).toBe(true);
      expect(canTransition("in_review", "scheduled")).toBe(true);
      expect(canTransition("in_review", "published")).toBe(true);
      expect(canTransition("in_review", "archived")).toBe(true);

      expect(canTransition("in_review", "idea")).toBe(false);
    });

    it("verifies permitted transitions from scheduled", () => {
      expect(canTransition("scheduled", "published")).toBe(true);
      expect(canTransition("scheduled", "in_review")).toBe(true);
      expect(canTransition("scheduled", "draft")).toBe(true);
      expect(canTransition("scheduled", "archived")).toBe(true);

      expect(canTransition("scheduled", "idea")).toBe(false);
    });

    it("verifies permitted transitions from published", () => {
      expect(canTransition("published", "archived")).toBe(true);
      expect(canTransition("published", "in_review")).toBe(true); // For revisions

      expect(canTransition("published", "idea")).toBe(false);
      expect(canTransition("published", "draft")).toBe(false);
      expect(canTransition("published", "scheduled")).toBe(false);
    });

    it("verifies unarchiving / restoring from archived status", () => {
      expect(canTransition("archived", "idea")).toBe(true);
      expect(canTransition("archived", "draft")).toBe(true);
      expect(canTransition("archived", "in_review")).toBe(true);
      expect(canTransition("archived", "scheduled")).toBe(true);
      expect(canTransition("archived", "published")).toBe(true);
    });
  });

  describe("Workflow Invariant Guards (validateStatusTransition)", () => {
    it("rejects illegal matrix transitions with descriptive error", () => {
      const res = validateStatusTransition(
        { status: "idea" },
        "published"
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Invalid content status transition from 'idea' to 'published'");
    });

    it("rejects scheduling when scheduledAt timestamp is missing", () => {
      const res = validateStatusTransition(
        { status: "draft" },
        "scheduled",
        { variantsCount: 1, scheduledAt: null }
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("without a target scheduled date/time");
    });

    it("rejects scheduling when authored platform variants count is 0", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = validateStatusTransition(
        { status: "draft" },
        "scheduled",
        { variantsCount: 0, scheduledAt: futureDate }
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("without at least one authored platform variant");
    });

    it("successfully permits scheduling when target date and variants are present", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = validateStatusTransition(
        { status: "draft" },
        "scheduled",
        { variantsCount: 2, scheduledAt: futureDate }
      );
      expect(res.valid).toBe(true);
      expect(res.updateFields?.status).toBe("scheduled");
      expect(res.updateFields?.scheduledAt).toEqual(new Date(futureDate));
      expect(res.updateFields?.isArchived).toBe(false);
    });

    it("automatically stamps publishedAt timestamp when transitioning to published", () => {
      const res = validateStatusTransition(
        { status: "scheduled", scheduledAt: new Date().toISOString() },
        "published"
      );
      expect(res.valid).toBe(true);
      expect(res.updateFields?.status).toBe("published");
      expect(res.updateFields?.publishedAt).toBeInstanceOf(Date);
      expect(res.updateFields?.isArchived).toBe(false);
    });

    it("sets isArchived flag to true when moving to archived status", () => {
      const res = validateStatusTransition(
        { status: "draft" },
        "archived"
      );
      expect(res.valid).toBe(true);
      expect(res.updateFields?.status).toBe("archived");
      expect(res.updateFields?.isArchived).toBe(true);
    });
  });
});
