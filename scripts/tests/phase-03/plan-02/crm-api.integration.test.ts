// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { GET as peopleGet, POST as peoplePost } from "@/app/api/people/route";
import {
  GET as personDetailGet,
  PUT as personDetailPut,
  DELETE as personDetailDelete,
} from "@/app/api/people/[id]/route";
import {
  GET as interactionsGet,
  POST as interactionsPost,
} from "@/app/api/people/[id]/interactions/route";
import {
  PUT as interactionPut,
  DELETE as interactionDelete,
} from "@/app/api/people/[id]/interactions/[interactionId]/route";
import { GET as remindersGet } from "@/app/api/people/reminders/route";

describe("Phase 3 Plan 03-02: People CRM API Route Handlers (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_crm_api_user@example.com",
    password: "Plan03CrmApiPassword123!",
    name: "CRM API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let createdPersonId: string;
  let createdInteractionId: string;

  function createAuthRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookieHeader);
    return new NextRequest(url, { ...init, headers } as any);
  }

  function createUnauthRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init as any);
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

  it("1. GET /api/people rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/people");
    const res = await peopleGet(req);
    expect(res.status).toBe(401);
  });

  it("2. POST /api/people rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/people", {
      method: "POST",
      body: JSON.stringify({ name: "Ghost" }),
    });
    const res = await peoplePost(req);
    expect(res.status).toBe(401);
  });

  it("3. POST /api/people validates input and returns 400 for empty name", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/people", {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });
    const res = await peoplePost(req);
    expect(res.status).toBe(400);
  });

  it("4. POST /api/people creates person record and returns 201", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/people", {
      method: "POST",
      body: JSON.stringify({
        name: "Rosalind Franklin",
        relationshipType: "mentor",
        company: "King's College London",
        role: "Biophysicist",
        email: "rosalind@kings.ac.uk",
        phone: "+44-20-7848-1000",
        tags: ["crystallography", "dna", "science"],
        notes: "Pioneered X-ray diffraction images of DNA.",
        nextFollowUpDate: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      }),
    });
    const res = await peoplePost(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe("Rosalind Franklin");
    expect(json.data.relationshipType).toBe("mentor");
    expect(json.data.company).toBe("King's College London");
    expect(json.data.tags).toEqual(["crystallography", "dna", "science"]);
    expect(json.data.followUpStatus).toBe("upcoming");
    createdPersonId = json.data.id;
  });

  it("5. GET /api/people returns list of contacts with search and filter support", async () => {
    if (!probe.isAvailable) return;

    // Filter by relationshipType
    const req1 = createAuthRequest(
      "http://localhost:3000/api/people?relationshipType=mentor"
    );
    const res1 = await peopleGet(req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.data.length).toBeGreaterThanOrEqual(1);
    expect(json1.data[0].id).toBe(createdPersonId);

    // Filter by search text
    const req2 = createAuthRequest(
      "http://localhost:3000/api/people?search=Franklin"
    );
    const res2 = await peopleGet(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.data.length).toBeGreaterThanOrEqual(1);
    expect(json2.data[0].name).toBe("Rosalind Franklin");

    // Filter by non-matching search text returns empty list
    const req3 = createAuthRequest(
      "http://localhost:3000/api/people?search=NonExistentPersonName123"
    );
    const res3 = await peopleGet(req3);
    expect(res3.status).toBe(200);
    const json3 = await res3.json();
    expect(json3.data).toHaveLength(0);
  });

  it("6. GET /api/people/[id] returns detailed person profile", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/people/${createdPersonId}`);
    const res = await personDetailGet(req, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.id).toBe(createdPersonId);
    expect(json.data.name).toBe("Rosalind Franklin");
    expect(json.data.linkedTasks).toBeDefined();
    expect(json.data.linkedProjects).toBeDefined();
    expect(json.data.linkedNotes).toBeDefined();
    expect(json.data.interactions).toBeDefined();
  });

  it("7. PUT /api/people/[id] updates contact information", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/people/${createdPersonId}`, {
      method: "PUT",
      body: JSON.stringify({
        role: "Senior Research Fellow & Director",
        notes: "Updated biography notes.",
      }),
    });
    const res = await personDetailPut(req, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.role).toBe("Senior Research Fellow & Director");
    expect(json.data.notes).toBe("Updated biography notes.");
  });

  it("8. POST /api/people/[id]/interactions logs an interaction and updates contact lastInteractionDate", async () => {
    if (!probe.isAvailable) return;

    const interactionDate = "2026-09-22T09:00:00.000Z";
    const nextFollowUp = "2026-09-29T10:00:00.000Z";

    const req = createAuthRequest(
      `http://localhost:3000/api/people/${createdPersonId}/interactions`,
      {
        method: "POST",
        body: JSON.stringify({
          date: interactionDate,
          channel: "meeting",
          summary: "Discussion on Photo 51 diffraction analysis.",
          nextFollowUpDate: nextFollowUp,
        }),
      }
    );
    const res = await interactionsPost(req, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.id).toBeDefined();
    expect(json.data.channel).toBe("meeting");
    expect(json.data.summary).toBe("Discussion on Photo 51 diffraction analysis.");
    createdInteractionId = json.data.id;

    // Verify Person lastInteractionDate was updated
    const personReq = createAuthRequest(`http://localhost:3000/api/people/${createdPersonId}`);
    const personRes = await personDetailGet(personReq, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    const personJson = await personRes.json();
    expect(personJson.data.lastInteractionDate).toBe(interactionDate);
  });

  it("9. GET /api/people/[id]/interactions returns timeline of interactions", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/people/${createdPersonId}/interactions`
    );
    const res = await interactionsGet(req, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].id).toBe(createdInteractionId);
  });

  it("10. PUT /api/people/[id]/interactions/[interactionId] updates interaction", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/people/${createdPersonId}/interactions/${createdInteractionId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          summary: "Updated: Photo 51 diffraction analysis and helical parameters.",
          channel: "call",
        }),
      }
    );
    const res = await interactionPut(req, {
      params: Promise.resolve({
        id: createdPersonId,
        interactionId: createdInteractionId,
      }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.summary).toBe(
      "Updated: Photo 51 diffraction analysis and helical parameters."
    );
    expect(json.data.channel).toBe("call");
  });

  it("11. GET /api/people/reminders returns categorized follow-up reminders", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/people/reminders");
    const res = await remindersGet(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.overdue).toBeDefined();
    expect(json.data.today).toBeDefined();
    expect(json.data.upcoming).toBeDefined();
    expect(typeof json.data.totalReminders).toBe("number");
  });

  it("12. DELETE /api/people/[id]/interactions/[interactionId] removes interaction", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/people/${createdPersonId}/interactions/${createdInteractionId}`,
      {
        method: "DELETE",
      }
    );
    const res = await interactionDelete(req, {
      params: Promise.resolve({
        id: createdPersonId,
        interactionId: createdInteractionId,
      }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("13. DELETE /api/people/[id] archives contact by default (soft delete)", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/people/${createdPersonId}`, {
      method: "DELETE",
    });
    const res = await personDetailDelete(req, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    expect(res.status).toBe(200);

    // Verify contact is marked archived
    const detailReq = createAuthRequest(`http://localhost:3000/api/people/${createdPersonId}`);
    const detailRes = await personDetailGet(detailReq, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    const json = await detailRes.json();
    expect(json.data.isArchived).toBe(true);
  });

  it("14. DELETE /api/people/[id]?hard=true permanently deletes contact", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/people/${createdPersonId}?hard=true`,
      {
        method: "DELETE",
      }
    );
    const res = await personDetailDelete(req, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    expect(res.status).toBe(200);

    // Verify contact no longer exists (404)
    const detailReq = createAuthRequest(`http://localhost:3000/api/people/${createdPersonId}`);
    const detailRes = await personDetailGet(detailReq, {
      params: Promise.resolve({ id: createdPersonId }),
    });
    expect(detailRes.status).toBe(404);

    // Verify contact no longer appears in archived list
    const archivedReq = createAuthRequest("http://localhost:3000/api/people?isArchived=true");
    const archivedRes = await peopleGet(archivedReq);
    const archivedJson = await archivedRes.json();
    expect(archivedJson.data.some((p: any) => p.id === createdPersonId)).toBe(false);
  });
});
