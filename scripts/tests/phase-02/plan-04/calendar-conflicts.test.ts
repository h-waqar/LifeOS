import { describe, it, expect } from "vitest";
import {
  doIntervalsOverlap,
  findHardCommitmentConflict,
  detectConflicts,
  annotateBlocksWithConflicts,
  type IntervalLike,
} from "@/server/calendar/conflicts";
import type { TimeBlockDTO } from "@/types";

describe("Plan 02-04: Algorithmic Calendar Conflict Engine (Unit)", () => {
  describe("Interval Overlap Mathematics", () => {
    it("detects genuine interval overlap", () => {
      // A: 10:00 - 11:30, B: 11:00 - 12:00
      const startA = "2026-10-01T10:00:00.000Z";
      const endA = "2026-10-01T11:30:00.000Z";
      const startB = "2026-10-01T11:00:00.000Z";
      const endB = "2026-10-01T12:00:00.000Z";

      expect(doIntervalsOverlap(startA, endA, startB, endB)).toBe(true);
      expect(doIntervalsOverlap(startB, endB, startA, endA)).toBe(true);
    });

    it("detects subset containment (B entirely inside A)", () => {
      const startA = "2026-10-01T09:00:00.000Z";
      const endA = "2026-10-01T12:00:00.000Z";
      const startB = "2026-10-01T10:00:00.000Z";
      const endB = "2026-10-01T11:00:00.000Z";

      expect(doIntervalsOverlap(startA, endA, startB, endB)).toBe(true);
      expect(doIntervalsOverlap(startB, endB, startA, endA)).toBe(true);
    });

    it("does NOT consider adjacent boundary touch as overlap", () => {
      // A: 09:00 - 10:00, B: 10:00 - 11:00 (endA === startB)
      const startA = "2026-10-01T09:00:00.000Z";
      const endA = "2026-10-01T10:00:00.000Z";
      const startB = "2026-10-01T10:00:00.000Z";
      const endB = "2026-10-01T11:00:00.000Z";

      expect(doIntervalsOverlap(startA, endA, startB, endB)).toBe(false);
      expect(doIntervalsOverlap(startB, endB, startA, endA)).toBe(false);
    });

    it("returns false for completely disjoint non-overlapping intervals", () => {
      const startA = "2026-10-01T08:00:00.000Z";
      const endA = "2026-10-01T09:00:00.000Z";
      const startB = "2026-10-01T14:00:00.000Z";
      const endB = "2026-10-01T15:00:00.000Z";

      expect(doIntervalsOverlap(startA, endA, startB, endB)).toBe(false);
      expect(doIntervalsOverlap(startB, endB, startA, endA)).toBe(false);
    });

    it("handles Date instances as well as ISO strings", () => {
      const dateA1 = new Date("2026-10-01T09:00:00.000Z");
      const dateA2 = new Date("2026-10-01T11:00:00.000Z");
      const dateB1 = new Date("2026-10-01T10:30:00.000Z");
      const dateB2 = new Date("2026-10-01T12:00:00.000Z");

      expect(doIntervalsOverlap(dateA1, dateA2, dateB1, dateB2)).toBe(true);
    });

    it("returns false for invalid date representations", () => {
      expect(doIntervalsOverlap("invalid", "date", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z")).toBe(false);
    });
  });

  describe("Hard Commitment Overlap Prevention", () => {
    it("detects conflict between candidate and existing hard commitment", () => {
      const existingBlocks = [
        {
          id: "b-1",
          startTime: new Date("2026-10-01T10:00:00.000Z"),
          endTime: new Date("2026-10-01T11:00:00.000Z"),
          commitmentLevel: "hard" as const,
          status: "scheduled" as const,
        },
      ];

      const candidate = {
        startTime: new Date("2026-10-01T10:30:00.000Z"),
        endTime: new Date("2026-10-01T11:30:00.000Z"),
      };

      const conflict = findHardCommitmentConflict(candidate, existingBlocks);
      expect(conflict).not.toBeNull();
      expect(conflict?.id).toBe("b-1");
    });

    it("ignores soft commitments when checking hard commitment collisions", () => {
      const existingBlocks = [
        {
          id: "b-soft",
          startTime: new Date("2026-10-01T10:00:00.000Z"),
          endTime: new Date("2026-10-01T11:00:00.000Z"),
          commitmentLevel: "soft" as const,
          status: "scheduled" as const,
        },
      ];

      const candidate = {
        startTime: new Date("2026-10-01T10:30:00.000Z"),
        endTime: new Date("2026-10-01T11:30:00.000Z"),
      };

      const conflict = findHardCommitmentConflict(candidate, existingBlocks);
      expect(conflict).toBeNull();
    });

    it("ignores cancelled hard commitments", () => {
      const existingBlocks = [
        {
          id: "b-cancelled",
          startTime: new Date("2026-10-01T10:00:00.000Z"),
          endTime: new Date("2026-10-01T11:00:00.000Z"),
          commitmentLevel: "hard" as const,
          status: "cancelled" as const,
        },
      ];

      const candidate = {
        startTime: new Date("2026-10-01T10:30:00.000Z"),
        endTime: new Date("2026-10-01T11:30:00.000Z"),
      };

      const conflict = findHardCommitmentConflict(candidate, existingBlocks);
      expect(conflict).toBeNull();
    });

    it("ignores self when updating an existing hard commitment block", () => {
      const existingBlocks = [
        {
          id: "b-self",
          startTime: new Date("2026-10-01T10:00:00.000Z"),
          endTime: new Date("2026-10-01T11:00:00.000Z"),
          commitmentLevel: "hard" as const,
          status: "scheduled" as const,
        },
      ];

      const candidate = {
        id: "b-self",
        startTime: new Date("2026-10-01T10:00:00.000Z"),
        endTime: new Date("2026-10-01T11:30:00.000Z"),
      };

      const conflict = findHardCommitmentConflict(candidate, existingBlocks);
      expect(conflict).toBeNull();
    });
  });

  describe("detectConflicts & annotateBlocksWithConflicts", () => {
    it("flags soft-soft overlap as conflict without hard conflict", () => {
      const blocks: Array<IntervalLike & { id: string }> = [
        {
          id: "s-1",
          startTime: "2026-10-01T09:00:00.000Z",
          endTime: "2026-10-01T10:30:00.000Z",
          commitmentLevel: "soft",
          status: "scheduled",
        },
        {
          id: "s-2",
          startTime: "2026-10-01T10:00:00.000Z",
          endTime: "2026-10-01T11:00:00.000Z",
          commitmentLevel: "soft",
          status: "scheduled",
        },
      ];

      const conflictMap = detectConflicts(blocks);

      expect(conflictMap.get("s-1")?.hasConflict).toBe(true);
      expect(conflictMap.get("s-1")?.hasHardConflict).toBe(false);
      expect(conflictMap.get("s-1")?.conflictingBlockIds).toEqual(["s-2"]);

      expect(conflictMap.get("s-2")?.hasConflict).toBe(true);
      expect(conflictMap.get("s-2")?.hasHardConflict).toBe(false);
      expect(conflictMap.get("s-2")?.conflictingBlockIds).toEqual(["s-1"]);
    });

    it("flags hard-soft overlap with hasHardConflict = true for both blocks", () => {
      const blocks: Array<IntervalLike & { id: string }> = [
        {
          id: "h-1",
          startTime: "2026-10-01T13:00:00.000Z",
          endTime: "2026-10-01T14:00:00.000Z",
          commitmentLevel: "hard",
          status: "scheduled",
        },
        {
          id: "s-1",
          startTime: "2026-10-01T13:30:00.000Z",
          endTime: "2026-10-01T14:30:00.000Z",
          commitmentLevel: "soft",
          status: "scheduled",
        },
      ];

      const conflictMap = detectConflicts(blocks);

      expect(conflictMap.get("h-1")?.hasConflict).toBe(true);
      expect(conflictMap.get("h-1")?.hasHardConflict).toBe(true);

      expect(conflictMap.get("s-1")?.hasConflict).toBe(true);
      expect(conflictMap.get("s-1")?.hasHardConflict).toBe(true);
    });

    it("annotates blocks array correctly with conflict metadata", () => {
      const blocks = [
        {
          id: "block-1",
          startTime: "2026-10-01T15:00:00.000Z",
          endTime: "2026-10-01T16:00:00.000Z",
          commitmentLevel: "soft" as const,
          status: "scheduled" as const,
        },
        {
          id: "block-2",
          startTime: "2026-10-01T17:00:00.000Z",
          endTime: "2026-10-01T18:00:00.000Z",
          commitmentLevel: "soft" as const,
          status: "scheduled" as const,
        },
      ];

      const annotated = annotateBlocksWithConflicts(blocks);
      expect(annotated[0].hasConflict).toBe(false);
      expect(annotated[0].conflictingBlockIds).toEqual([]);
      expect(annotated[1].hasConflict).toBe(false);
      expect(annotated[1].conflictingBlockIds).toEqual([]);
    });
  });
});
