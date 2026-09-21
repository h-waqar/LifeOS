// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  createNote,
  updateNote,
  getNoteById,
  getBacklinks,
  deleteNote,
  listNotes,
} from "@/server/notes/service";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";

describe("Phase 3 Plan 03-01: Note Links & Backlinks Graph (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_notelinks_user@example.com",
    password: "Plan03NoteLinksPass123!",
    name: "Note Links Tester",
  };

  let testUserId: string;
  let noteAlphaId: string;
  let noteBetaId: string;
  let noteDeltaId: string;

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

  it("1. Automatically parses wikilinks and creates note_links records on note creation", async () => {
    if (!probe.isAvailable) return;

    // Create Note Alpha linking to Beta and Gamma (neither exists yet)
    const noteAlpha = await createNote(testUserId, {
      title: "Note Alpha",
      content: "This is Alpha referencing [[Note Beta]] and [[Note Gamma|Gamma Alias]].",
      noteType: "research",
      area: "career",
    });

    noteAlphaId = noteAlpha.id;
    expect(noteAlpha.id).toBeDefined();
    expect(noteAlpha.outgoingLinksCount).toBe(2);

    const fetchedAlpha = await getNoteById(testUserId, noteAlpha.id);
    expect(fetchedAlpha.outgoingLinks).toHaveLength(2);

    const betaLink = fetchedAlpha.outgoingLinks.find((l) => l.targetTitle === "Note Beta");
    expect(betaLink).toBeDefined();
    expect(betaLink?.targetNoteId).toBeNull(); // Beta not created yet

    const gammaLink = fetchedAlpha.outgoingLinks.find((l) => l.targetTitle === "Note Gamma");
    expect(gammaLink).toBeDefined();
    expect(gammaLink?.displayText).toBe("Gamma Alias");
    expect(gammaLink?.targetNoteId).toBeNull();
  });

  it("2. Automatically backfills dangling note_links when target note is created afterwards", async () => {
    if (!probe.isAvailable) return;

    // Create Note Beta now
    const noteBeta = await createNote(testUserId, {
      title: "Note Beta",
      content: "# Note Beta\n\nI am Beta, created after Alpha linked to me.",
      noteType: "idea",
      area: "career",
    });

    noteBetaId = noteBeta.id;

    // Backlinks for Note Beta should now immediately contain Note Alpha!
    const backlinksBeta = await getBacklinks(testUserId, noteBeta.id);
    expect(backlinksBeta).toHaveLength(1);
    expect(backlinksBeta[0].title).toBe("Note Alpha");
    expect(backlinksBeta[0].snippet).toContain("[[Note Beta]]");

    // Fetch Note Beta with full details
    const fetchedBeta = await getNoteById(testUserId, noteBeta.id);
    expect(fetchedBeta.backlinks).toHaveLength(1);
    expect(fetchedBeta.backlinks[0].title).toBe("Note Alpha");
  });

  it("3. Resolves targetNoteId immediately if target note already exists", async () => {
    if (!probe.isAvailable) return;

    // Create Note Delta linking to existing Note Beta
    const noteDelta = await createNote(testUserId, {
      title: "Note Delta",
      content: "Delta also refers to [[Note Beta]].",
      noteType: "quick",
    });

    noteDeltaId = noteDelta.id;

    const fetchedDelta = await getNoteById(testUserId, noteDelta.id);
    const betaLink = fetchedDelta.outgoingLinks.find((l) => l.targetTitle === "Note Beta");
    expect(betaLink).toBeDefined();
    expect(betaLink?.targetNoteId).toBeDefined(); // Resolved immediately to Beta!

    // Note Beta now has 2 backlinks: Alpha and Delta
    const backlinksBeta = await getBacklinks(testUserId, betaLink!.targetNoteId!);
    expect(backlinksBeta).toHaveLength(2);
    const titles = backlinksBeta.map((b) => b.title);
    expect(titles).toContain("Note Alpha");
    expect(titles).toContain("Note Delta");
  });

  it("4. Synchronizes note_links on note update (adds new links, removes deleted links)", async () => {
    if (!probe.isAvailable) return;

    // Update Alpha to only link to [[Note Beta]] (removing [[Note Gamma]])
    await updateNote(testUserId, noteAlphaId, {
      content: "Alpha updated: now only references [[Note Beta]].",
    });

    const fetchedAlpha = await getNoteById(testUserId, noteAlphaId);
    expect(fetchedAlpha.outgoingLinks).toHaveLength(1);
    expect(fetchedAlpha.outgoingLinks[0].targetTitle).toBe("Note Beta");
  });

  it("5. Hard delete cascades and cleans up note_links", async () => {
    if (!probe.isAvailable) return;

    // Delete Delta permanently
    await deleteNote(testUserId, noteDeltaId, true);

    // Beta should now only have 1 backlink (from Alpha, since Delta was deleted)
    const backlinksBeta = await getBacklinks(testUserId, noteBetaId);
    expect(backlinksBeta).toHaveLength(1);
    expect(backlinksBeta[0].title).toBe("Note Alpha");
  });

  it("6. Reconciles backlinks on title change: old title links become dangling", async () => {
    if (!probe.isAvailable) return;

    // Note Alpha links to "Note Beta".
    // Rename Beta to "Note Bravo".
    await updateNote(testUserId, noteBetaId, {
      title: "Note Bravo",
    });

    // Note Bravo should no longer have Note Alpha as backlink (Alpha links to "Note Beta", not "Note Bravo")
    const backlinksBravo = await getBacklinks(testUserId, noteBetaId);
    expect(backlinksBravo).toHaveLength(0);

    // Create Note Epsilon referencing [[Note Bravo]]
    const noteEpsilon = await createNote(testUserId, {
      title: "Note Epsilon",
      content: "Epsilon explicitly references [[Note Bravo]].",
    });

    const backlinksBravoAfter = await getBacklinks(testUserId, noteBetaId);
    expect(backlinksBravoAfter).toHaveLength(1);
    expect(backlinksBravoAfter[0].title).toBe("Note Epsilon");

    // Clean up Epsilon
    await deleteNote(testUserId, noteEpsilon.id, true);
  });

  it("7. Soft-archived notes are excluded from active backlinks", async () => {
    if (!probe.isAvailable) return;

    // Create Note Zeta linking to Note Bravo
    const noteZeta = await createNote(testUserId, {
      title: "Note Zeta",
      content: "Zeta references [[Note Bravo]].",
    });

    let backlinks = await getBacklinks(testUserId, noteBetaId);
    expect(backlinks.map((b) => b.title)).toContain("Note Zeta");

    // Soft-archive Zeta
    await deleteNote(testUserId, noteZeta.id, false);

    // Backlinks for Note Bravo should no longer include archived Note Zeta
    backlinks = await getBacklinks(testUserId, noteBetaId);
    expect(backlinks.map((b) => b.title)).not.toContain("Note Zeta");

    await deleteNote(testUserId, noteZeta.id, true);
  });

  it("8. Foreign key ON DELETE SET NULL allows project deletion without corrupting note", async () => {
    if (!probe.isAvailable) return;

    const { projects } = await import("@/server/db/schema");

    const [proj] = await db
      .insert(projects)
      .values({
        userId: testUserId,
        name: "Test FK Safety Project",
      })
      .returning();

    const noteWithProj = await createNote(testUserId, {
      title: "Note With Project",
      projectId: proj.id,
    });

    expect(noteWithProj.projectId).toBe(proj.id);

    // Delete project directly in DB
    await db.delete(projects).where(eq(projects.id, proj.id));

    // Note should still exist, with projectId set to null
    const noteAfter = await getNoteById(testUserId, noteWithProj.id);
    expect(noteAfter.projectId).toBeNull();

    await deleteNote(testUserId, noteWithProj.id, true);
  });
});
