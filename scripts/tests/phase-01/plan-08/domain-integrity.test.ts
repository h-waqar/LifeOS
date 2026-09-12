import { describe, it, expect } from "vitest";
import {
  createTaskSchema,
  updateTaskSchema,
  toTaskDTO,
  NotFoundError,
  InvariantViolationError,
} from "@/server/tasks/service";
import {
  createProjectSchema,
  updateProjectSchema,
  toProjectDTO,
} from "@/server/projects/service";

describe("Plan 01-08: Domain Integrity & Schema Contracts", () => {
  describe("Task Input Validation & Mass-Assignment Defenses", () => {
    it("rejects client-supplied userId in createTaskSchema", () => {
      const result = createTaskSchema.safeParse({
        title: "Test Task",
        userId: "hacker_user_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects client-supplied id in createTaskSchema", () => {
      const result = createTaskSchema.safeParse({
        title: "Test Task",
        id: "forged_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty or whitespace-only title in createTaskSchema", () => {
      const res1 = createTaskSchema.safeParse({ title: "" });
      const res2 = createTaskSchema.safeParse({ title: "   " });
      expect(res1.success).toBe(false);
      expect(res2.success).toBe(false);
    });

    it("rejects title exceeding 255 characters", () => {
      const longTitle = "a".repeat(256);
      const res = createTaskSchema.safeParse({ title: longTitle });
      expect(res.success).toBe(false);
    });

    it("rejects description exceeding 4000 characters", () => {
      const longDesc = "a".repeat(4001);
      const res = createTaskSchema.safeParse({
        title: "Valid Title",
        description: longDesc,
      });
      expect(res.success).toBe(false);
    });

    it("rejects negative durations or durations exceeding 1 week (10080 mins)", () => {
      expect(
        createTaskSchema.safeParse({
          title: "Valid",
          estimatedDuration: -1,
        }).success
      ).toBe(false);

      expect(
        createTaskSchema.safeParse({
          title: "Valid",
          estimatedDuration: 10081,
        }).success
      ).toBe(false);

      expect(
        createTaskSchema.safeParse({
          title: "Valid",
          actualDuration: -5,
        }).success
      ).toBe(false);

      expect(
        createTaskSchema.safeParse({
          title: "Valid",
          actualDuration: 10081,
        }).success
      ).toBe(false);
    });

    it("accepts valid task inputs", () => {
      const valid = createTaskSchema.safeParse({
        title: "Legitimate Task",
        description: "A well formed description",
        status: "in_progress",
        priority: "high",
        estimatedDuration: 60,
        actualDuration: 45,
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("Project Input Validation & Mass-Assignment Defenses", () => {
    it("rejects client-supplied userId in createProjectSchema", () => {
      const result = createProjectSchema.safeParse({
        name: "Test Project",
        userId: "hacker_user_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects client-supplied id in createProjectSchema", () => {
      const result = createProjectSchema.safeParse({
        name: "Test Project",
        id: "forged_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty or whitespace-only name in createProjectSchema", () => {
      expect(createProjectSchema.safeParse({ name: "" }).success).toBe(false);
      expect(createProjectSchema.safeParse({ name: "   " }).success).toBe(false);
    });

    it("rejects name exceeding 255 characters", () => {
      expect(
        createProjectSchema.safeParse({ name: "p".repeat(256) }).success
      ).toBe(false);
    });

    it("rejects description exceeding 2000 characters", () => {
      expect(
        createProjectSchema.safeParse({
          name: "Valid Project",
          description: "d".repeat(2001),
        }).success
      ).toBe(false);
    });

    it("accepts valid project inputs", () => {
      const valid = createProjectSchema.safeParse({
        name: "LifeOS Roadmap Phase 1",
        description: "Foundational sprint",
        status: "active",
        priority: "critical",
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("DTO Serialization & Field Isolation", () => {
    it("serializes task entities cleanly into TaskDTO without internal leakages", () => {
      const now = new Date();
      const mockTaskRow = {
        id: "task_123",
        userId: "user_456",
        projectId: "proj_789",
        parentTaskId: null,
        title: "Clean Task",
        description: "No leaks",
        status: "todo",
        priority: "medium",
        dueDate: now,
        estimatedDuration: 30,
        actualDuration: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const dto = toTaskDTO(mockTaskRow as any);
      expect(dto.id).toBe("task_123");
      expect(dto.userId).toBe("user_456");
      expect(dto.title).toBe("Clean Task");
      expect(dto.dueDate).toBe(now.toISOString());
      expect(dto.createdAt).toBe(now.toISOString());
    });

    it("serializes project entities cleanly into ProjectDTO", () => {
      const now = new Date();
      const mockProjRow = {
        id: "proj_123",
        userId: "user_456",
        name: "Clean Project",
        description: null,
        status: "planning",
        priority: "low",
        createdAt: now,
        updatedAt: now,
      };

      const dto = toProjectDTO(mockProjRow as any);
      expect(dto.id).toBe("proj_123");
      expect(dto.name).toBe("Clean Project");
      expect(dto.createdAt).toBe(now.toISOString());
    });
  });

  describe("Domain Error Classes", () => {
    it("instantiates NotFoundError with 404 status and NOT_FOUND code", () => {
      const err = new NotFoundError("Task missing");
      expect(err.status).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
      expect(err.message).toBe("Task missing");
    });

    it("instantiates InvariantViolationError with 400 status and INVARIANT_VIOLATION code", () => {
      const err = new InvariantViolationError("Cycle detected");
      expect(err.status).toBe(400);
      expect(err.code).toBe("INVARIANT_VIOLATION");
      expect(err.message).toBe("Cycle detected");
    });
  });
});
