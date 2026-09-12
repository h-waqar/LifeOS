import { describe, it, expect } from "vitest";
import {
  createProject,
  getProject,
  updateProject,
  deleteProject,
  NotFoundError as ProjectNotFoundError,
} from "@/server/projects/service";
import {
  createTask,
  getTask,
  updateTask,
  deleteTask,
  NotFoundError as TaskNotFoundError,
  InvariantViolationError,
} from "@/server/tasks/service";
import { AuthorizationError } from "@/server/auth/guard";

describe("Plan 01-07: Domain Services Layer Verification (Unit/Service Boundary)", () => {
  describe("User Ownership Boundary Fail-Closed Guards", () => {
    it("throws AuthorizationError when accessing project service with empty userId", async () => {
      await expect(
        createProject("", { name: "Project" })
      ).rejects.toThrow(AuthorizationError);

      await expect(getProject("", "proj-1")).rejects.toThrow(
        AuthorizationError
      );

      await expect(
        updateProject("", "proj-1", { name: "Update" })
      ).rejects.toThrow(AuthorizationError);

      await expect(deleteProject("", "proj-1")).rejects.toThrow(
        AuthorizationError
      );
    });

    it("throws AuthorizationError when accessing task service with empty userId", async () => {
      await expect(
        createTask("", { title: "Task" })
      ).rejects.toThrow(AuthorizationError);

      await expect(getTask("", "task-1")).rejects.toThrow(AuthorizationError);

      await expect(
        updateTask("", "task-1", { title: "Update" })
      ).rejects.toThrow(AuthorizationError);

      await expect(deleteTask("", "task-1")).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe("Entity ID Validation Guards", () => {
    it("throws ProjectNotFoundError when project ID is invalid or empty", async () => {
      await expect(getProject("user-1", "")).rejects.toThrow(
        ProjectNotFoundError
      );
      await expect(updateProject("user-1", "", { name: "Test" })).rejects.toThrow(
        ProjectNotFoundError
      );
      await expect(deleteProject("user-1", "")).rejects.toThrow(
        ProjectNotFoundError
      );
    });

    it("throws TaskNotFoundError when task ID is invalid or empty", async () => {
      await expect(getTask("user-1", "")).rejects.toThrow(TaskNotFoundError);
      await expect(updateTask("user-1", "", { title: "Test" })).rejects.toThrow(
        TaskNotFoundError
      );
      await expect(deleteTask("user-1", "")).rejects.toThrow(TaskNotFoundError);
    });
  });

  describe("Error Classes & Status Codes", () => {
    it("defines NotFoundError with 404 status and NOT_FOUND code", () => {
      const err = new ProjectNotFoundError("Resource not found");
      expect(err.status).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
      expect(err.name).toBe("NotFoundError");
    });

    it("defines InvariantViolationError with 400 status and INVARIANT_VIOLATION code", () => {
      const err = new InvariantViolationError("Invalid state transition");
      expect(err.status).toBe(400);
      expect(err.code).toBe("INVARIANT_VIOLATION");
      expect(err.name).toBe("InvariantViolationError");
    });
  });
});
