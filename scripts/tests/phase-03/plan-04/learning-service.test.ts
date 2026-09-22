import { describe, it, expect } from "vitest";
import {
  createLearningItem,
  getLearningItemById,
  listLearningItems,
  updateLearningItem,
  archiveLearningItem,
  restoreLearningItem,
  deleteLearningItem,
  getLearningItemNotes,
  getLearningStats,
  NotFoundError,
  InvariantViolationError,
} from "@/server/learning/service";
import { AuthorizationError } from "@/server/auth/guard";

describe("Phase 3 Plan 03-04: Learning Service Layer Verification (Unit)", () => {
  describe("User Ownership Boundary Fail-Closed Guards", () => {
    it("throws AuthorizationError when accessing learning service with empty userId", async () => {
      await expect(
        createLearningItem("", { title: "Test Book" })
      ).rejects.toThrow(AuthorizationError);

      await expect(getLearningItemById("", "item-123")).rejects.toThrow(
        AuthorizationError
      );

      await expect(listLearningItems("", {})).rejects.toThrow(
        AuthorizationError
      );

      await expect(
        updateLearningItem("", "item-123", { title: "Update" })
      ).rejects.toThrow(AuthorizationError);

      await expect(archiveLearningItem("", "item-123")).rejects.toThrow(
        AuthorizationError
      );

      await expect(restoreLearningItem("", "item-123")).rejects.toThrow(
        AuthorizationError
      );

      await expect(deleteLearningItem("", "item-123")).rejects.toThrow(
        AuthorizationError
      );

      await expect(getLearningItemNotes("", "item-123")).rejects.toThrow(
        AuthorizationError
      );

      await expect(getLearningStats("")).rejects.toThrow(AuthorizationError);
    });

    it("throws AuthorizationError when userId is whitespace only or not a string", async () => {
      await expect(
        createLearningItem("   ", { title: "Test Book" })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        getLearningItemById(null as any, "item-123")
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("Entity ID Validation Guards", () => {
    it("throws NotFoundError when learning item ID is invalid or empty", async () => {
      await expect(getLearningItemById("user-1", "")).rejects.toThrow(
        NotFoundError
      );

      await expect(
        updateLearningItem("user-1", "", { title: "New Title" })
      ).rejects.toThrow(NotFoundError);

      await expect(archiveLearningItem("user-1", "")).rejects.toThrow(
        NotFoundError
      );

      await expect(restoreLearningItem("user-1", "")).rejects.toThrow(
        NotFoundError
      );

      await expect(deleteLearningItem("user-1", "")).rejects.toThrow(
        NotFoundError
      );

      await expect(getLearningItemNotes("user-1", "")).rejects.toThrow(
        NotFoundError
      );
    });

    it("NotFoundError returns 404 status and NOT_FOUND code", () => {
      const error = new NotFoundError("Custom item missing");
      expect(error.status).toBe(404);
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe("Custom item missing");
    });

    it("InvariantViolationError returns 400 status and INVARIANT_VIOLATION code", () => {
      const error = new InvariantViolationError("Invalid invariant");
      expect(error.status).toBe(400);
      expect(error.code).toBe("INVARIANT_VIOLATION");
      expect(error.message).toBe("Invalid invariant");
    });
  });

  describe("Input Validation Guards", () => {
    it("throws ZodError on invalid create input before database access", async () => {
      await expect(
        createLearningItem("user-1", { title: "", type: "invalid-type" })
      ).rejects.toThrow();

      await expect(
        createLearningItem("user-1", {
          title: "Book",
          rating: 10,
        })
      ).rejects.toThrow();

      await expect(
        createLearningItem("user-1", {
          title: "Course",
          progress: -50,
        })
      ).rejects.toThrow();
    });

    it("throws ZodError on invalid update input", async () => {
      await expect(
        updateLearningItem("user-1", "item-1", {
          rating: 0,
        })
      ).rejects.toThrow();

      await expect(
        updateLearningItem("user-1", "item-1", {
          progress: 999,
        })
      ).rejects.toThrow();
    });
  });
});
