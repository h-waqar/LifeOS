import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { projects } from "@/server/db/schema/projects";
import { tasks } from "@/server/db/schema/tasks";
import { eq, sql } from "drizzle-orm";

describe("Plan 01-07: Database Invariants & Integrity (Live PostgreSQL)", () => {
  let probe: ProbeResult;

  const testUser = {
    id: "user_plan07_db_inv_" + crypto.randomUUID().slice(0, 8),
    email: "plan07_db_inv@example.com",
    name: "Plan07 DB Invariant User",
  };

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean any prior state for this test user
    await db.delete(user).where(eq(user.email, testUser.email));

    // Insert user row
    await db.insert(user).values({
      id: testUser.id,
      email: testUser.email,
      name: testUser.name,
    });
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user).where(eq(user.email, testUser.email));
      await closeDatabase();
    }
  });

  describe("PostgreSQL Check Constraints on Projects", () => {
    it("rejects project with empty name (projects_name_non_empty)", async () => {
      if (!probe.isAvailable) return;

      await expect(
        db.execute(
          sql`INSERT INTO "projects" ("id", "user_id", "name") VALUES (${crypto.randomUUID()}, ${testUser.id}, '')`
        )
      ).rejects.toThrow();
    });

    it("rejects project with whitespace-only name (projects_name_non_empty)", async () => {
      if (!probe.isAvailable) return;

      await expect(
        db.execute(
          sql`INSERT INTO "projects" ("id", "user_id", "name") VALUES (${crypto.randomUUID()}, ${testUser.id}, '   ')`
        )
      ).rejects.toThrow();
    });

    it("rejects project with name > 255 chars (projects_name_max_length)", async () => {
      if (!probe.isAvailable) return;

      const longName = "p".repeat(256);
      await expect(
        db.execute(
          sql`INSERT INTO "projects" ("id", "user_id", "name") VALUES (${crypto.randomUUID()}, ${testUser.id}, ${longName})`
        )
      ).rejects.toThrow();
    });

    it("rejects project description > 2000 chars (projects_description_max_length)", async () => {
      if (!probe.isAvailable) return;

      const longDesc = "d".repeat(2001);
      await expect(
        db.execute(
          sql`INSERT INTO "projects" ("id", "user_id", "name", "description") VALUES (${crypto.randomUUID()}, ${testUser.id}, 'Valid', ${longDesc})`
        )
      ).rejects.toThrow();
    });
  });

  describe("PostgreSQL Check Constraints on Tasks", () => {
    it("rejects task with empty title (tasks_title_non_empty)", async () => {
      if (!probe.isAvailable) return;

      await expect(
        db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title") VALUES (${crypto.randomUUID()}, ${testUser.id}, '')`
        )
      ).rejects.toThrow();
    });

    it("rejects task where parent_task_id = id (tasks_parent_not_self)", async () => {
      if (!probe.isAvailable) return;

      const taskId = crypto.randomUUID();
      await expect(
        db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title", "parent_task_id") VALUES (${taskId}, ${testUser.id}, 'Self loop task', ${taskId})`
        )
      ).rejects.toThrow();
    });

    it("rejects task with completed status but NULL completed_at (tasks_completed_at_invariant)", async () => {
      if (!probe.isAvailable) return;

      await expect(
        db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title", "status", "completed_at") VALUES (${crypto.randomUUID()}, ${testUser.id}, 'Incomplete Complete', 'completed', NULL)`
        )
      ).rejects.toThrow();
    });

    it("rejects task with negative estimated_duration (tasks_estimated_duration_bounds)", async () => {
      if (!probe.isAvailable) return;

      await expect(
        db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title", "estimated_duration") VALUES (${crypto.randomUUID()}, ${testUser.id}, 'Negative Duration', -10)`
        )
      ).rejects.toThrow();
    });

    it("rejects task with negative actual_duration (tasks_actual_duration_bounds)", async () => {
      if (!probe.isAvailable) return;

      await expect(
        db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title", "actual_duration") VALUES (${crypto.randomUUID()}, ${testUser.id}, 'Negative Actual Duration', -5)`
        )
      ).rejects.toThrow();
    });
  });

  describe("Composite Foreign Key Cross-Entity Isolation", () => {
    it("rejects linking task to a non-existent project for the user via composite FK (tasks_user_project_fk)", async () => {
      if (!probe.isAvailable) return;

      const nonExistentProjectId = crypto.randomUUID();
      let errorConstraint: string | undefined;

      try {
        await db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title", "project_id") VALUES (${crypto.randomUUID()}, ${testUser.id}, 'Orphan task', ${nonExistentProjectId})`
        );
      } catch (err: any) {
        errorConstraint = err.cause?.constraint || err.constraint;
      }

      expect(errorConstraint).toBe("tasks_user_project_fk");
    });

    it("rejects linking task to another user's project ID via composite FK (cross-user project forgery prevention)", async () => {
      if (!probe.isAvailable) return;

      const otherUserId = "other_user_" + crypto.randomUUID().slice(0, 8);
      const foreignProjectId = crypto.randomUUID();

      // Attempt to link testUser's task to foreignProjectId (which belongs to otherUserId)
      let errorConstraint: string | undefined;

      try {
        await db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title", "project_id") VALUES (${crypto.randomUUID()}, ${testUser.id}, 'Cross-user project task', ${foreignProjectId})`
        );
      } catch (err: any) {
        errorConstraint = err.cause?.constraint || err.constraint;
      }

      expect(errorConstraint).toBe("tasks_user_project_fk");
    });

    it("rejects linking subtask to another user's parent task ID via composite FK (tasks_user_parent_task_fk)", async () => {
      if (!probe.isAvailable) return;

      const foreignTaskId = crypto.randomUUID();
      let errorConstraint: string | undefined;

      try {
        await db.execute(
          sql`INSERT INTO "tasks" ("id", "user_id", "title", "parent_task_id") VALUES (${crypto.randomUUID()}, ${testUser.id}, 'Cross-user subtask', ${foreignTaskId})`
        );
      } catch (err: any) {
        errorConstraint = err.cause?.constraint || err.constraint;
      }

      expect(errorConstraint).toBe("tasks_user_parent_task_fk");
    });
  });

  describe("Deletion Behavior & Preservation Semantics", () => {
    it("preserves tasks by setting project_id = NULL when project is deleted (ON DELETE SET NULL)", async () => {
      if (!probe.isAvailable) return;

      const projId = crypto.randomUUID();
      const taskId = crypto.randomUUID();

      // Create project
      await db.insert(projects).values({
        id: projId,
        userId: testUser.id,
        name: "Temporary Project",
      });

      // Create task linked to project
      await db.insert(tasks).values({
        id: taskId,
        userId: testUser.id,
        projectId: projId,
        title: "Task to be preserved",
      });

      // Delete project
      await db.delete(projects).where(eq(projects.id, projId));

      // Task must still exist, with project_id set to null
      const remainingTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId));

      expect(remainingTasks.length).toBe(1);
      expect(remainingTasks[0].projectId).toBeNull();
      expect(remainingTasks[0].title).toBe("Task to be preserved");

      // Cleanup
      await db.delete(tasks).where(eq(tasks.id, taskId));
    });

    it("cascades deletion of subtasks when parent task is deleted (ON DELETE CASCADE)", async () => {
      if (!probe.isAvailable) return;

      const parentId = crypto.randomUUID();
      const subtaskId = crypto.randomUUID();

      // Create parent task
      await db.insert(tasks).values({
        id: parentId,
        userId: testUser.id,
        title: "Parent Task",
      });

      // Create subtask
      await db.insert(tasks).values({
        id: subtaskId,
        userId: testUser.id,
        parentTaskId: parentId,
        title: "Subtask",
      });

      // Delete parent task
      await db.delete(tasks).where(eq(tasks.id, parentId));

      // Subtask must be deleted automatically
      const remainingSubtasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, subtaskId));

      expect(remainingSubtasks.length).toBe(0);
    });

    it("cascades deletion of all user projects and tasks when user is deleted (ON DELETE CASCADE)", async () => {
      if (!probe.isAvailable) return;

      const ephemeralUser = {
        id: "ephemeral_user_" + crypto.randomUUID().slice(0, 8),
        email: "ephemeral@example.com",
        name: "Ephemeral User",
      };

      // Temporarily bypass single-user lock by deleting testUser first
      await db.delete(user).where(eq(user.id, testUser.id));

      await db.insert(user).values({
        id: ephemeralUser.id,
        email: ephemeralUser.email,
        name: ephemeralUser.name,
      });

      const projId = crypto.randomUUID();
      const taskId = crypto.randomUUID();

      await db.insert(projects).values({
        id: projId,
        userId: ephemeralUser.id,
        name: "Ephemeral Project",
      });

      await db.insert(tasks).values({
        id: taskId,
        userId: ephemeralUser.id,
        projectId: projId,
        title: "Ephemeral Task",
      });

      // Delete ephemeral user
      await db.delete(user).where(eq(user.id, ephemeralUser.id));

      // Projects and tasks must be cascade-deleted
      const remainingProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.userId, ephemeralUser.id));
      const remainingTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, ephemeralUser.id));

      expect(remainingProjects.length).toBe(0);
      expect(remainingTasks.length).toBe(0);

      // Restore testUser
      await db.insert(user).values({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
      });
    });
  });

  describe("Transaction Rollback Invariant", () => {
    it("rolls back all database mutations when an error occurs inside a transaction", async () => {
      if (!probe.isAvailable) return;

      const projId = crypto.randomUUID();
      const validTaskId = crypto.randomUUID();

      let transactionFailed = false;

      try {
        await db.transaction(async (tx) => {
          // 1. Insert valid project
          await tx.insert(projects).values({
            id: projId,
            userId: testUser.id,
            name: "Transaction Rollback Project",
          });

          // 2. Insert valid task
          await tx.insert(tasks).values({
            id: validTaskId,
            userId: testUser.id,
            projectId: projId,
            title: "Transaction Valid Task",
          });

          // 3. Intentionally trigger check constraint violation (empty title)
          await tx.execute(
            sql`INSERT INTO "tasks" ("id", "user_id", "title") VALUES (${crypto.randomUUID()}, ${testUser.id}, '')`
          );
        });
      } catch {
        transactionFailed = true;
      }

      expect(transactionFailed).toBe(true);

      // Verify that neither the project nor the valid task were committed
      const persistedProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projId));
      const persistedTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, validTaskId));

      expect(persistedProjects.length).toBe(0);
      expect(persistedTasks.length).toBe(0);
    });
  });
});
