// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { people, interactions, tasks, notes, projects } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { peopleService } from "@/server/people/service";

describe("Phase 3 Plan 03-02: CRM Entity Linking & Lifecycle (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_crm_links@example.com",
    password: "Plan03PasswordLinks123!",
    name: "CRM Links Tester",
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

  it("1. Aggregates linked tasks, projects, and notes on Person detail", async () => {
    if (!probe.isAvailable) return;

    // Create person
    const person = await peopleService.createPerson(testUserId, {
      name: "Marcus Aurelius",
      relationshipType: "mentor",
      company: "Roman Empire",
      role: "Emperor & Philosopher",
      tags: ["stoicism", "philosophy"],
    });

    // Create a project
    const [project] = await db
      .insert(projects)
      .values({
        userId: testUserId,
        name: "Meditations Publication",
      })
      .returning();

    // Create task linked to person and project
    const [task] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Review manuscript Book IV",
        personId: person.id,
        projectId: project.id,
      })
      .returning();

    // Create note linked to person
    const [note] = await db
      .insert(notes)
      .values({
        userId: testUserId,
        title: "Discussions on Stoic Virtues",
        slug: "stoic-virtues-" + crypto.randomUUID().slice(0, 6),
        content: "Reflections on duty and character...",
        personId: person.id,
      })
      .returning();

    // Log interaction
    const interaction = await peopleService.logInteraction(testUserId, person.id, {
      summary: "Discussed inner citadel and resilience",
      channel: "in_person",
      date: "2026-09-20T10:00:00.000Z",
      nextFollowUpDate: "2026-09-27T10:00:00.000Z",
    });

    // Fetch person detail via service
    const detail = await peopleService.getPersonById(testUserId, person.id);
    expect(detail).toBeDefined();
    expect(detail?.id).toBe(person.id);

    // Verify linked tasks
    expect(detail?.linkedTasks).toHaveLength(1);
    expect(detail?.linkedTasks[0].id).toBe(task.id);
    expect(detail?.linkedTasks[0].title).toBe("Review manuscript Book IV");

    // Verify linked projects (aggregated via tasks)
    expect(detail?.linkedProjects).toHaveLength(1);
    expect(detail?.linkedProjects[0].id).toBe(project.id);
    expect(detail?.linkedProjects[0].name).toBe("Meditations Publication");

    // Verify linked notes
    expect(detail?.linkedNotes).toHaveLength(1);
    expect(detail?.linkedNotes[0].id).toBe(note.id);
    expect(detail?.linkedNotes[0].title).toBe("Discussions on Stoic Virtues");

    // Verify interactions
    expect(detail?.interactions).toHaveLength(1);
    expect(detail?.interactions[0].id).toBe(interaction.id);
    expect(detail?.interactions[0].channel).toBe("in_person");
    expect(detail?.lastInteractionDate).toBe("2026-09-20T10:00:00.000Z");
  });

  it("2. Automatically updates and recalculates lastInteractionDate upon interaction mutations", async () => {
    if (!probe.isAvailable) return;

    const person = await peopleService.createPerson(testUserId, {
      name: "Hypatia of Alexandria",
      relationshipType: "colleague",
    });

    expect(person.lastInteractionDate).toBeNull();

    // First interaction
    const inter1 = await peopleService.logInteraction(testUserId, person.id, {
      summary: "First meeting on geometry",
      channel: "meeting",
      date: "2026-09-10T10:00:00.000Z",
    });

    let updatedPerson = await peopleService.getPersonById(testUserId, person.id);
    expect(updatedPerson?.lastInteractionDate).toBe("2026-09-10T10:00:00.000Z");

    // Second interaction (more recent)
    const inter2 = await peopleService.logInteraction(testUserId, person.id, {
      summary: "Second meeting on astrolabes",
      channel: "call",
      date: "2026-09-18T15:00:00.000Z",
    });

    updatedPerson = await peopleService.getPersonById(testUserId, person.id);
    expect(updatedPerson?.lastInteractionDate).toBe("2026-09-18T15:00:00.000Z");

    // Delete the second interaction -> lastInteractionDate should revert to first interaction
    await peopleService.deleteInteraction(testUserId, inter2.id);

    updatedPerson = await peopleService.getPersonById(testUserId, person.id);
    expect(updatedPerson?.lastInteractionDate).toBe("2026-09-10T10:00:00.000Z");

    // Delete first interaction -> lastInteractionDate should revert to null
    await peopleService.deleteInteraction(testUserId, inter1.id);

    updatedPerson = await peopleService.getPersonById(testUserId, person.id);
    expect(updatedPerson?.lastInteractionDate).toBeNull();
  });

  it("3. Cascades deletion to interactions and nullifies personId on linked tasks and notes", async () => {
    if (!probe.isAvailable) return;

    const person = await peopleService.createPerson(testUserId, {
      name: "Aristotle",
      relationshipType: "mentor",
    });

    // Create interaction
    const inter = await peopleService.logInteraction(testUserId, person.id, {
      summary: "Ethics seminar",
      channel: "meeting",
    });

    // Create linked task
    const [linkedTask] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Study Nicomachean Ethics",
        personId: person.id,
      })
      .returning();

    // Create linked note
    const [linkedNote] = await db
      .insert(notes)
      .values({
        userId: testUserId,
        title: "Teleology Notes",
        slug: "teleology-notes-" + crypto.randomUUID().slice(0, 6),
        content: "Everything has a purpose...",
        personId: person.id,
      })
      .returning();

    // Delete the person directly via DB (to test DB foreign key actions ON DELETE)
    await db.delete(people).where(eq(people.id, person.id));

    // 1. Interaction must be CASCADE deleted
    const remainingInteractions = await db
      .select()
      .from(interactions)
      .where(eq(interactions.id, inter.id));
    expect(remainingInteractions).toHaveLength(0);

    // 2. Task must still exist, but personId set to NULL
    const [persistedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, linkedTask.id));
    expect(persistedTask).toBeDefined();
    expect(persistedTask.personId).toBeNull();

    // 3. Note must still exist, but personId set to NULL
    const [persistedNote] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, linkedNote.id));
    expect(persistedNote).toBeDefined();
    expect(persistedNote.personId).toBeNull();
  });
});
