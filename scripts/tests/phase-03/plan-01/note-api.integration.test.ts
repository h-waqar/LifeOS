// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as notesGet, POST as notesPost } from "@/app/api/notes/route";
import {
  GET as noteDetailGet,
  PUT as noteDetailPut,
  DELETE as noteDetailDelete,
} from "@/app/api/notes/[id]/route";
import { GET as noteBacklinksGet } from "@/app/api/notes/[id]/backlinks/route";

describe("Phase 3 Plan 03-01: Notes API Route Handlers (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_note_api_user@example.com",
    password: "Plan03NoteApiPassword123!",
    name: "Note API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let createdNoteId: string;

  function createAuthRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookieHeader);
    return new NextRequest(url, { ...init, headers });
  }

  function createUnauthRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init);
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
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. GET /api/notes rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/notes");
    const res = await notesGet(req);
    expect(res.status).toBe(401);
  });

  it("2. POST /api/notes rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Unauth Note" }),
    });
    const res = await notesPost(req);
    expect(res.status).toBe(401);
  });

  it("3. POST /api/notes validates input and returns 400 for empty title", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "   " }),
    });
    const res = await notesPost(req);
    expect(res.status).toBe(400);
  });

  it("4. POST /api/notes creates note with valid payload and returns 201", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "API Created Architecture Note",
        content: "# Architecture\n\nLink to [[Target System Design]] here.",
        noteType: "documentation",
        area: "career",
        tags: ["architecture", "backend"],
      }),
    });
    const res = await notesPost(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.id).toBeDefined();
    expect(json.data.title).toBe("API Created Architecture Note");
    expect(json.data.slug).toBe("api-created-architecture-note");
    expect(json.data.tags).toEqual(["architecture", "backend"]);
    createdNoteId = json.data.id;
  });

  it("5. GET /api/notes returns list of notes for authenticated user", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/notes");
    const res = await notesGet(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.total).toBeGreaterThanOrEqual(1);
  });

  it("6. GET /api/notes/[id] returns note with links and backlinks", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/notes/${createdNoteId}`);
    const res = await noteDetailGet(req, { params: Promise.resolve({ id: createdNoteId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.id).toBe(createdNoteId);
    expect(json.data.outgoingLinks).toHaveLength(1);
    expect(json.data.outgoingLinks[0].targetTitle).toBe("Target System Design");
  });

  it("7. PUT /api/notes/[id] updates note and returns 200", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/notes/${createdNoteId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: "API Created Architecture Note (Updated)",
        content: "# Updated Content\n\nNow referencing [[Target System Design|System Design]].",
        isPinned: true,
      }),
    });
    const res = await noteDetailPut(req, { params: Promise.resolve({ id: createdNoteId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.title).toBe("API Created Architecture Note (Updated)");
    expect(json.data.isPinned).toBe(true);
  });

  it("8. GET /api/notes/[id]/backlinks returns backlinks array", async () => {
    if (!probe.isAvailable) return;

    // Create target note
    const targetReq = createAuthRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Target System Design",
        content: "Target note content",
      }),
    });
    const targetRes = await notesPost(targetReq);
    const targetJson = await targetRes.json();
    const targetNoteId = targetJson.data.id;

    // Query backlinks for target
    const req = createAuthRequest(
      `http://localhost:3000/api/notes/${targetNoteId}/backlinks`
    );
    const res = await noteBacklinksGet(req, {
      params: Promise.resolve({ id: targetNoteId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].title).toBe("API Created Architecture Note (Updated)");
  });

  it("9. DELETE /api/notes/[id] deletes note", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/notes/${createdNoteId}?hard=true`, {
      method: "DELETE",
    });
    const res = await noteDetailDelete(req, { params: Promise.resolve({ id: createdNoteId }) });
    expect(res.status).toBe(200);

    // Verify it is gone
    const checkReq = createAuthRequest(`http://localhost:3000/api/notes/${createdNoteId}`);
    const checkRes = await noteDetailGet(checkReq, {
      params: Promise.resolve({ id: createdNoteId }),
    });
    expect(checkRes.status).toBe(404);
  });

  it("10. GET /api/notes/[id]/backlinks returns 404 for nonexistent note ID", async () => {
    if (!probe.isAvailable) return;

    const nonexistentId = "nonexistent-note-id-12345";
    const req = createAuthRequest(
      `http://localhost:3000/api/notes/${nonexistentId}/backlinks`
    );
    const res = await noteBacklinksGet(req, {
      params: Promise.resolve({ id: nonexistentId }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("NOT_FOUND");
  });
});
