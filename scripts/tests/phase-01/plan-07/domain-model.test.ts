import { describe, it, expect } from "vitest";
import {
  createProjectSchema,
  updateProjectSchema,
  toProjectDTO,
  type ProjectDTO,
} from "@/server/projects/service";
import {
  createTaskSchema,
  updateTaskSchema,
  toTaskDTO,
  type TaskDTO,
} from "@/server/tasks/service";
import type { Project, Task } from "@/server/db/schema";

describe("Plan 01-07: Core Domain Model & Schema Invariants (Unit)", () => {
  describe("Project Domain Model & Schemas", () => {
    it("validates a well-formed create project payload", () => {
      const input = {
        name: "Dubai Real Estate Platform",
        description: "MVP property marketplace for overseas investors",
        status: "planning" as const,
        priority: "high" as const,
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Dubai Real Estate Platform");
        expect(result.data.status).toBe("planning");
        expect(result.data.priority).toBe("high");
      }
    });

    it("rejects blank or whitespace-only project name", () => {
      const invalidNames = ["", "   ", "\t\n"];
      for (const name of invalidNames) {
        const result = createProjectSchema.safeParse({ name });
        expect(result.success).toBe(false);
      }
    });

    it("rejects project name exceeding 255 characters", () => {
      const longName = "a".repeat(256);
      const result = createProjectSchema.safeParse({ name: longName });
      expect(result.success).toBe(false);
    });

    it("rejects project description exceeding 2000 characters", () => {
      const longDesc = "a".repeat(2001);
      const result = createProjectSchema.safeParse({
        name: "Valid Name",
        description: longDesc,
      });
      expect(result.success).toBe(false);
    });

    it("rejects forged userId in create project payload", () => {
      const result = createProjectSchema.safeParse({
        name: "Unauthorized Project",
        userId: "adversary_user_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects client-supplied id in create project payload", () => {
      const result = createProjectSchema.safeParse({
        name: "Unauthorized Project",
        id: "adversary_project_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields in create project payload (strict schema)", () => {
      const result = createProjectSchema.safeParse({
        name: "Clean Project",
        attackerProperty: "malicious_payload",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid project status enum value", () => {
      const result = createProjectSchema.safeParse({
        name: "Clean Project",
        status: "invalid_status",
      });
      expect(result.success).toBe(false);
    });

    it("serializes Project database row to clean ProjectDTO", () => {
      const now = new Date();
      const mockProject: Project = {
        id: "proj-123",
        userId: "user-456",
        name: "Test Project",
        description: "Test Desc",
        area: "general",
        status: "active",
        priority: "critical",
        startDate: null,
        deadline: null,
        goalId: null,
        createdAt: now,
        updatedAt: now,
      };

      const dto: ProjectDTO = toProjectDTO(mockProject);
      expect(dto).toEqual({
        id: "proj-123",
        userId: "user-456",
        name: "Test Project",
        description: "Test Desc",
        area: "general",
        status: "active",
        priority: "critical",
        startDate: null,
        deadline: null,
        goalId: null,
        progress: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      expect(typeof dto.createdAt).toBe("string");
    });
  });

  describe("Task Domain Model & Schemas", () => {
    it("validates a well-formed create task payload", () => {
      const input = {
        title: "Build authentication flow",
        description: "Setup Better Auth with passkeys",
        status: "todo" as const,
        priority: "high" as const,
        projectId: "proj-123",
        estimatedDuration: 120,
        actualDuration: 90,
        dueDate: "2026-10-01T10:00:00.000Z",
      };

      const result = createTaskSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Build authentication flow");
        expect(result.data.estimatedDuration).toBe(120);
        expect(result.data.actualDuration).toBe(90);
      }
    });

    it("rejects blank or whitespace-only task title", () => {
      const invalidTitles = ["", "   ", "\t\r\n"];
      for (const title of invalidTitles) {
        const result = createTaskSchema.safeParse({ title });
        expect(result.success).toBe(false);
      }
    });

    it("rejects task title exceeding 255 characters", () => {
      const longTitle = "t".repeat(256);
      const result = createTaskSchema.safeParse({ title: longTitle });
      expect(result.success).toBe(false);
    });

    it("rejects task description exceeding 4000 characters", () => {
      const longDesc = "d".repeat(4001);
      const result = createTaskSchema.safeParse({
        title: "Valid Task",
        description: longDesc,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative estimated duration", () => {
      const result = createTaskSchema.safeParse({
        title: "Task with negative duration",
        estimatedDuration: -15,
      });
      expect(result.success).toBe(false);
    });

    it("rejects estimated duration exceeding 1 week (10080 minutes)", () => {
      const result = createTaskSchema.safeParse({
        title: "Task with impossible duration",
        estimatedDuration: 10081,
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed dueDate format", () => {
      const result = createTaskSchema.safeParse({
        title: "Task with bad date",
        dueDate: "not-a-date",
      });
      expect(result.success).toBe(false);
    });

    it("rejects forged userId in create task payload", () => {
      const result = createTaskSchema.safeParse({
        title: "Hacked Task",
        userId: "attacker_user_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects client-supplied id in create task payload", () => {
      const result = createTaskSchema.safeParse({
        title: "Hacked Task",
        id: "attacker_task_id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields in create task payload (strict schema)", () => {
      const result = createTaskSchema.safeParse({
        title: "Valid Task",
        hiddenField: "secret_data",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid task status enum value", () => {
      const result = createTaskSchema.safeParse({
        title: "Task",
        status: "not_a_valid_status",
      });
      expect(result.success).toBe(false);
    });

    it("serializes Task database row to clean TaskDTO", () => {
      const now = new Date();
      const mockTask: Task = {
        id: "task-1",
        userId: "user-1",
        projectId: "proj-1",
        parentTaskId: null,
        milestoneId: null,
        title: "Implement core model",
        description: "Core entities and DTOs",
        status: "completed",
        priority: "critical",
        scheduledDate: null,
        energyLevel: null,
        recurrenceRule: null,
        goalId: null,
        habitId: null,
        noteId: null,
        personId: null,
        tags: [],
        dueDate: now,
        estimatedDuration: 60,
        actualDuration: 45,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const dto: TaskDTO = toTaskDTO(mockTask);
      expect(dto).toEqual({
        id: "task-1",
        userId: "user-1",
        projectId: "proj-1",
        parentTaskId: null,
        milestoneId: null,
        title: "Implement core model",
        description: "Core entities and DTOs",
        status: "completed",
        priority: "critical",
        scheduledDate: null,
        energyLevel: null,
        recurrenceRule: null,
        goalId: null,
        habitId: null,
        noteId: null,
        personId: null,
        tags: [],
        dueDate: now.toISOString(),
        estimatedDuration: 60,
        actualDuration: 45,
        completedAt: now.toISOString(),
        priorityScore: 0,
        hasUncompletedDependencies: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });
  });
});
