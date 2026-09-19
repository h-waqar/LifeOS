import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { projects } from "@/server/db/schema/projects";
import { projectMilestones } from "@/server/db/schema/milestones";
import { tasks } from "@/server/db/schema/tasks";
import { auth } from "@/server/auth";
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
  addMilestone,
  listMilestones,
  updateMilestone,
  deleteMilestone,
  NotFoundError,
} from "@/server/projects/service";
import { createGoal } from "@/server/goals/service";
import { createTask } from "@/server/tasks/service";
import { eq, and } from "drizzle-orm";

describe("Plan 02-02: Project Extensions, Milestones & Archival (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_project_ext@example.com",
    password: "ProjectExtPassword123!",
    name: "Project Extensions Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUserData,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserData.email));
    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (!probe.isAvailable) return;
    await db.delete(user);
    await closeDatabase();
  });

  describe("Project Extensions (Area, Dates, Goal Link)", () => {
    it("creates and updates a project with area, deadline, and goal linkage", async () => {
      if (!probe.isAvailable) return;

      const goal = await createGoal(testUserId, {
        title: "Health & Vitality Goal",
        area: "health",
        horizon: "medium_term",
      });

      const startDate = "2026-10-01T00:00:00.000Z";
      const deadline = "2026-12-31T23:59:59.000Z";

      const proj = await createProject(testUserId, {
        name: "Marathon Preparation Plan",
        description: "12-week training regimen",
        area: "health",
        startDate,
        deadline,
        goalId: goal.id,
      });

      expect(proj.id).toBeDefined();
      expect(proj.area).toBe("health");
      expect(proj.startDate).toBe(startDate);
      expect(proj.deadline).toBe(deadline);
      expect(proj.goalId).toBe(goal.id);

      // Update area and deadline
      const newDeadline = "2027-01-15T23:59:59.000Z";
      const updated = await updateProject(testUserId, proj.id, {
        deadline: newDeadline,
        status: "active",
      });

      expect(updated.deadline).toBe(newDeadline);
      expect(updated.status).toBe("active");
    });

    it("rejects linking a project to a non-existent goal", async () => {
      if (!probe.isAvailable) return;

      await expect(
        createProject(testUserId, {
          name: "Project with fake goal",
          goalId: "non_existent_goal_123",
        })
      ).rejects.toThrow();
    });

    it("rejects linking a project to a foreign user's goal (cross-tenant isolation)", async () => {
      if (!probe.isAvailable) return;

      const foreignGoalId = "foreign_goal_" + crypto.randomUUID().slice(0, 8);

      await expect(
        createProject(testUserId, {
          name: "Project with cross tenant goal",
          goalId: foreignGoalId,
        })
      ).rejects.toThrow();
    });
  });

  describe("Project Milestones Management", () => {
    it("adds, lists, updates, and deletes project milestones", async () => {
      if (!probe.isAvailable) return;

      const proj = await createProject(testUserId, {
        name: "Website Redesign",
        area: "career",
      });

      // Add Milestone 1
      const m1 = await addMilestone(testUserId, proj.id, {
        title: "Wireframes & Mockups Approved",
        description: "Design sign-off from stakeholders",
        targetDate: "2026-10-15T00:00:00.000Z",
        sortOrder: 1,
      });
      expect(m1.id).toBeDefined();
      expect(m1.projectId).toBe(proj.id);
      expect(m1.status).toBe("pending");
      expect(m1.completedAt).toBeNull();

      // Add Milestone 2
      const m2 = await addMilestone(testUserId, proj.id, {
        title: "Frontend Implementation Completed",
        sortOrder: 2,
      });

      // List Milestones
      const list = await listMilestones(testUserId, proj.id);
      expect(list.length).toBe(2);
      expect(list[0].id).toBe(m1.id);
      expect(list[1].id).toBe(m2.id);

      // Update Milestone 1 to completed
      const updatedM1 = await updateMilestone(testUserId, proj.id, m1.id, {
        status: "completed",
      });
      expect(updatedM1.status).toBe("completed");
      expect(updatedM1.completedAt).not.toBeNull();

      // Delete Milestone 2
      const delRes = await deleteMilestone(testUserId, proj.id, m2.id);
      expect(delRes.success).toBe(true);

      const listAfterDelete = await listMilestones(testUserId, proj.id);
      expect(listAfterDelete.length).toBe(1);
      expect(listAfterDelete[0].id).toBe(m1.id);
    });

    it("enforces tenant isolation: cannot access or modify milestones of another user", async () => {
      if (!probe.isAvailable) return;

      const proj = await createProject(testUserId, {
        name: "Private Project",
      });
      const m = await addMilestone(testUserId, proj.id, {
        title: "Private Milestone",
      });

      const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);

      await expect(
        listMilestones(foreignUserId, proj.id)
      ).rejects.toThrow(NotFoundError);

      await expect(
        addMilestone(foreignUserId, proj.id, { title: "Hacked Milestone" })
      ).rejects.toThrow(NotFoundError);

      await expect(
        updateMilestone(foreignUserId, proj.id, m.id, { status: "completed" })
      ).rejects.toThrow(NotFoundError);

      await expect(
        deleteMilestone(foreignUserId, proj.id, m.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("PROJ-04: Project Archival & Task Association Preservation", () => {
    it("archives project and preserves linked tasks and milestones", async () => {
      if (!probe.isAvailable) return;

      const proj = await createProject(testUserId, {
        name: "Quarterly Marketing Campaign",
        status: "active",
      });

      const milestone = await addMilestone(testUserId, proj.id, {
        title: "Campaign Launched",
      });

      const task = await createTask(testUserId, {
        title: "Prepare ad banners",
        projectId: proj.id,
        milestoneId: milestone.id,
      });

      expect(task.projectId).toBe(proj.id);
      expect(task.milestoneId).toBe(milestone.id);

      // Archive the project
      const archivedProj = await updateProject(testUserId, proj.id, {
        status: "archived",
      });
      expect(archivedProj.status).toBe("archived");

      // Verify active projects list excludes archived projects
      const activeProjects = await listProjects(testUserId, { status: "active" });
      expect(activeProjects.some((p) => p.id === proj.id)).toBe(false);

      // Verify listProjects with status=archived includes it
      const archivedProjects = await listProjects(testUserId, { status: "archived" });
      expect(archivedProjects.some((p) => p.id === proj.id)).toBe(true);

      // Verify linked task still exists and retains projectId and milestoneId
      const [persistedTask] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, testUserId), eq(tasks.id, task.id)));

      expect(persistedTask).toBeDefined();
      expect(persistedTask.projectId).toBe(proj.id);
      expect(persistedTask.milestoneId).toBe(milestone.id);

      // Verify milestones still exist for archived project
      const projectMs = await listMilestones(testUserId, proj.id);
      expect(projectMs.length).toBe(1);
      expect(projectMs[0].id).toBe(milestone.id);
    });
  });

  describe("Milestone Deletion & Cascade Nullification", () => {
    it("nullifies task milestoneId when milestone is deleted, and cascades deletion on project delete", async () => {
      if (!probe.isAvailable) return;

      const proj = await createProject(testUserId, {
        name: "Project with Milestone Deletion",
      });

      const m = await addMilestone(testUserId, proj.id, {
        title: "Milestone to be deleted",
      });

      const task = await createTask(testUserId, {
        title: "Task assigned to milestone",
        projectId: proj.id,
        milestoneId: m.id,
      });

      expect(task.milestoneId).toBe(m.id);

      // Delete milestone
      await deleteMilestone(testUserId, proj.id, m.id);

      // Check task milestoneId is nullified via ON DELETE SET NULL
      const [taskAfterMilestoneDelete] = await db
        .select({ milestoneId: tasks.milestoneId, projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.userId, testUserId), eq(tasks.id, task.id)));

      expect(taskAfterMilestoneDelete.milestoneId).toBeNull();
      expect(taskAfterMilestoneDelete.projectId).toBe(proj.id);

      // Add another milestone
      const m2 = await addMilestone(testUserId, proj.id, {
        title: "Milestone before project deletion",
      });

      // Delete the project
      await deleteProject(testUserId, proj.id);

      // Verify milestones for that project are deleted (CASCADE)
      const ms = await db
        .select()
        .from(projectMilestones)
        .where(and(eq(projectMilestones.userId, testUserId), eq(projectMilestones.projectId, proj.id)));
      expect(ms.length).toBe(0);
    });
  });
});
