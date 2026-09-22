// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { people, interactions, tasks, notes } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";

describe("Phase 3 Plan 03-02: CRM Schema Isolation & Foreign Key Invariants (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_crm_isolation@example.com",
    password: "Plan03PasswordCrm123!",
    name: "CRM Isolation Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

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

  it("1. Enforces single_user_lock database invariant preventing unauthorized multi-tenancy", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(user).values({
        id: "rogue_crm_user_" + crypto.randomUUID().slice(0, 8),
        email: "rogue_crm@example.com",
        name: "Rogue CRM User",
      })
    ).rejects.toThrow();
  });

  it("2. Rejects creating a Person for a non-existent user via foreign key (user_id)", async () => {
    if (!probe.isAvailable) return;

    const fakeUserId = "fake_user_" + crypto.randomUUID().slice(0, 8);

    await expect(
      db.insert(people).values({
        userId: fakeUserId,
        name: "Ghost Contact",
        relationshipType: "client",
      })
    ).rejects.toThrow();
  });

  it("3. Successfully creates a Person record for the authenticated user", async () => {
    if (!probe.isAvailable) return;

    const [created] = await db
      .insert(people)
      .values({
        userId: testUserId,
        name: "Katherine Johnson",
        relationshipType: "mentor",
        company: "NASA",
        role: "Research Mathematician",
        email: "katherine@nasa.gov",
        phone: "+1-555-0199",
        tags: ["stem", "aerospace"],
      })
      .returning();

    expect(created).toBeDefined();
    expect(created.name).toBe("Katherine Johnson");
    expect(created.relationshipType).toBe("mentor");
    expect(created.userId).toBe(testUserId);
  });

  it("4. Rejects creating an Interaction with a non-existent person via composite FK (user_id, person_id)", async () => {
    if (!probe.isAvailable) return;

    const fakePersonId = crypto.randomUUID();

    await expect(
      db.insert(interactions).values({
        userId: testUserId,
        personId: fakePersonId,
        summary: "Meeting with non-existent contact",
        channel: "meeting",
      })
    ).rejects.toThrow();
  });

  it("5. Rejects linking a Task to a non-existent person via composite FK (user_id, person_id)", async () => {
    if (!probe.isAvailable) return;

    const fakePersonId = crypto.randomUUID();

    await expect(
      db.insert(tasks).values({
        userId: testUserId,
        title: "Task with fake contact link",
        personId: fakePersonId,
      })
    ).rejects.toThrow();
  });

  it("6. Rejects linking a Note to a non-existent person via composite FK (user_id, person_id)", async () => {
    if (!probe.isAvailable) return;

    const fakePersonId = crypto.randomUUID();

    await expect(
      db.insert(notes).values({
        userId: testUserId,
        title: "Note with fake contact link",
        slug: "note-with-fake-contact-" + crypto.randomUUID().slice(0, 6),
        content: "Content...",
        personId: fakePersonId,
      })
    ).rejects.toThrow();
  });
});
