// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { notes, noteLinks, projects, goals, tasks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";

describe("Phase 3 Plan 03-01: Note Schema Isolation & Invariants (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_note_isolation@example.com",
    password: "Plan03PasswordA123!",
    name: "Note Tester Isolation",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    // Register primary user via Better Auth
    const resA = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(resA.status).toBe(200);

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Rejects duplicate slug for the same user via unique constraint (user_id, slug)", async () => {
    if (!probe.isAvailable) return;

    await db.insert(notes).values({
      userId: testUserId,
      title: "Architecture Guide",
      slug: "architecture-guide",
      content: "First note",
    });

    await expect(
      db.insert(notes).values({
        userId: testUserId,
        title: "Architecture Guide Duplicate",
        slug: "architecture-guide", // Same slug for same user
        content: "Second note",
      })
    ).rejects.toThrow();
  });

  it("2. Enforces single_user_lock database invariant preventing unauthorized multi-tenancy", async () => {
    if (!probe.isAvailable) return;

    // Database schema enforces single_user_lock = true with a unique index, preventing secondary users
    await expect(
      db.insert(user).values({
        id: "rogue_user_" + crypto.randomUUID().slice(0, 8),
        email: "rogue_user@example.com",
        name: "Rogue User",
      })
    ).rejects.toThrow();
  });

  it("3. Rejects linking to a foreign/non-existent project via composite FK (user_id, project_id)", async () => {
    if (!probe.isAvailable) return;

    const foreignProjectId = "foreign_proj_" + crypto.randomUUID().slice(0, 8);

    // Attempt to link note to a project ID that does not belong to this user
    await expect(
      db.insert(notes).values({
        userId: testUserId,
        title: "Cross Tenant Project Note",
        slug: "cross-tenant-project-note",
        projectId: foreignProjectId,
      })
    ).rejects.toThrow();
  });

  it("4. Rejects linking to a foreign/non-existent goal via composite FK (user_id, goal_id)", async () => {
    if (!probe.isAvailable) return;

    const foreignGoalId = "foreign_goal_" + crypto.randomUUID().slice(0, 8);

    // Attempt to link note to a goal ID that does not belong to this user
    await expect(
      db.insert(notes).values({
        userId: testUserId,
        title: "Cross Tenant Goal Note",
        slug: "cross-tenant-goal-note",
        goalId: foreignGoalId,
      })
    ).rejects.toThrow();
  });

  it("5. Rejects linking to a foreign/non-existent task via composite FK (user_id, task_id)", async () => {
    if (!probe.isAvailable) return;

    const foreignTaskId = "foreign_task_" + crypto.randomUUID().slice(0, 8);

    // Attempt to link note to a task ID that does not belong to this user
    await expect(
      db.insert(notes).values({
        userId: testUserId,
        title: "Cross Tenant Task Note",
        slug: "cross-tenant-task-note",
        taskId: foreignTaskId,
      })
    ).rejects.toThrow();
  });

  it("6. Rejects note_links with foreign/non-existent source_note_id via composite FK (user_id, source_note_id)", async () => {
    if (!probe.isAvailable) return;

    const foreignNoteId = "foreign_note_" + crypto.randomUUID().slice(0, 8);

    // Attempt to create noteLink with sourceNoteId that does not exist for this user
    await expect(
      db.insert(noteLinks).values({
        userId: testUserId,
        sourceNoteId: foreignNoteId,
        targetTitle: "Any Target",
      })
    ).rejects.toThrow();
  });

  it("7. Cascade deletes note_links when source note is deleted", async () => {
    if (!probe.isAvailable) return;

    const [srcNote] = await db
      .insert(notes)
      .values({
        userId: testUserId,
        title: "Source Note Cascade Test",
        slug: "source-note-cascade-test",
        content: "Links to [[Target Note]]",
      })
      .returning();

    await db.insert(noteLinks).values({
      userId: testUserId,
      sourceNoteId: srcNote.id,
      targetTitle: "Target Note",
    });

    const linksBefore = await db
      .select()
      .from(noteLinks)
      .where(and(eq(noteLinks.userId, testUserId), eq(noteLinks.sourceNoteId, srcNote.id)));
    expect(linksBefore).toHaveLength(1);

    // Delete note directly via database
    await db.delete(notes).where(and(eq(notes.userId, testUserId), eq(notes.id, srcNote.id)));

    const linksAfter = await db
      .select()
      .from(noteLinks)
      .where(and(eq(noteLinks.userId, testUserId), eq(noteLinks.sourceNoteId, srcNote.id)));
    expect(linksAfter).toHaveLength(0);
  });
});
