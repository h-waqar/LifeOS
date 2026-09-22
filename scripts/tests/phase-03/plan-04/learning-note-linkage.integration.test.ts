// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { notes, learningItems } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import { NextRequest } from "next/server";

import { GET as notesGet, POST as notesPost } from "@/app/api/notes/route";
import { GET as noteDetailGet } from "@/app/api/notes/[id]/route";
import {
  GET as learningItemGet,
  DELETE as learningItemDelete,
} from "@/app/api/learning/[id]/route";
import { GET as learningNotesGet } from "@/app/api/learning/[id]/notes/route";
import { createLearningItem } from "@/server/learning/service";
import { createNote } from "@/server/notes/service";

describe("Phase 3 Plan 03-04: Note Entity Linkage for Learning Items (NOTE-04 & NOTE-06) (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_learning_note_linkage@example.com",
    password: "Plan03LearningNotePassword123!",
    name: "Learning Note Linkage Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let testLearningItemId: string;
  let testNoteId1: string;
  let testNoteId2: string;

  function createAuthRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookieHeader);
    return new NextRequest(url, { ...init, headers } as any);
  }

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie")!;
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;

    // Create a learning item
    const item = await createLearningItem(testUserId, {
      title: "Category Theory for Programmers",
      type: "book",
      author: "Bartosz Milewski",
      totalUnits: 30,
      unitType: "chapters",
    });
    testLearningItemId = item.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Successfully creates notes linked to the learning item via POST /api/notes", async () => {
    if (!probe.isAvailable) return;

    // Create note 1
    const req1 = createAuthRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Category Theory: Monads and Functors",
        content: "A monad is just a monoid in the category of endofunctors.",
        noteType: "learning",
        area: "career",
        tags: ["math", "category-theory"],
        learningId: testLearningItemId,
      }),
    });
    const res1 = await notesPost(req1);
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.data.learningId).toBe(testLearningItemId);
    testNoteId1 = body1.data.id;

    // Create note 2
    const req2 = createAuthRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Category Theory: Kleisli Categories",
        content: "Composing functions with monadic effects.",
        noteType: "learning",
        area: "career",
        tags: ["math"],
        learningId: testLearningItemId,
      }),
    });
    const res2 = await notesPost(req2);
    expect(res2.status).toBe(201);
    const body2 = await res2.json();
    expect(body2.data.learningId).toBe(testLearningItemId);
    testNoteId2 = body2.data.id;
  });

  it("2. Filters notes by learningId via GET /api/notes?learningId=...", async () => {
    if (!probe.isAvailable) return;

    // Also create an unlinked note
    await createNote(testUserId, {
      title: "Unlinked General Note",
      content: "Nothing to do with learning.",
      noteType: "quick",
    });

    const req = createAuthRequest(
      `http://localhost:3000/api/notes?learningId=${testLearningItemId}`
    );
    const res = await notesGet(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.length).toBe(2);
    const noteIds = body.data.map((n: any) => n.id);
    expect(noteIds).toContain(testNoteId1);
    expect(noteIds).toContain(testNoteId2);
  });

  it("3. GET /api/learning/[id]/notes returns all active notes linked to the learning item", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/learning/${testLearningItemId}/notes`
    );
    const res = await learningNotesGet(req, {
      params: Promise.resolve({ id: testLearningItemId }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.length).toBe(2);
    expect(body.data.some((n: any) => n.id === testNoteId1)).toBe(true);
    expect(body.data.some((n: any) => n.id === testNoteId2)).toBe(true);
  });

  it("4. GET /api/learning/[id] includes linkedNotesCount = 2 and linkedNotes array in detail DTO", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/learning/${testLearningItemId}`
    );
    const res = await learningItemGet(req, {
      params: Promise.resolve({ id: testLearningItemId }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.linkedNotesCount).toBe(2);
    expect(body.data.linkedNotes.length).toBe(2);
  });

  it("5. Rejects linking a note to a non-existent or foreign learning item (fail-closed)", async () => {
    if (!probe.isAvailable) return;

    const fakeLearningId = crypto.randomUUID();
    const req = createAuthRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Malicious Cross-Tenant Note Link",
        content: "Trying to link to ghost item.",
        learningId: fakeLearningId,
      }),
    });
    const res = await notesPost(req);
    expect(res.status).toBe(400); // Invariant violation: Linked learning item not found or access denied
  });

  it("6. Hard deleting a learning item nullifies notes.learning_id (ON DELETE SET NULL) without deleting the notes", async () => {
    if (!probe.isAvailable) return;

    // Verify notes currently have learningId set
    const beforeNotes = await db
      .select({ id: notes.id, learningId: notes.learningId })
      .from(notes)
      .where(and(eq(notes.userId, testUserId), eq(notes.learningId, testLearningItemId)));
    expect(beforeNotes.length).toBe(2);

    // Hard delete the learning item via DELETE /api/learning/[id]?hard=true
    const delReq = createAuthRequest(
      `http://localhost:3000/api/learning/${testLearningItemId}?hard=true`,
      { method: "DELETE" }
    );
    const delRes = await learningItemDelete(delReq, {
      params: Promise.resolve({ id: testLearningItemId }),
    });
    expect(delRes.status).toBe(200);

    // Verify both notes still exist in the database!
    const [note1] = await db
      .select({ id: notes.id, learningId: notes.learningId, title: notes.title })
      .from(notes)
      .where(and(eq(notes.userId, testUserId), eq(notes.id, testNoteId1)));
    expect(note1).toBeDefined();
    expect(note1.learningId).toBeNull(); // Nullified!

    const [note2] = await db
      .select({ id: notes.id, learningId: notes.learningId, title: notes.title })
      .from(notes)
      .where(and(eq(notes.userId, testUserId), eq(notes.id, testNoteId2)));
    expect(note2).toBeDefined();
    expect(note2.learningId).toBeNull(); // Nullified!
  });
});
