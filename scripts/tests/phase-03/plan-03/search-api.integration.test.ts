// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { notes } from "@/server/db/schema/notes";
import { tasks } from "@/server/db/schema/tasks";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as searchGet } from "@/app/api/search/route";

describe("Phase 3 Plan 03-03: Search API Route Handler (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_search_api_user@example.com",
    password: "Plan03SearchApiPassword123!",
    name: "Search API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;

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

    // Seed test note and task
    await db.insert(notes).values({
      id: "note-api-test-1",
      userId: testUserId,
      title: "Distributed Systems Consensus",
      slug: "distributed-systems-consensus",
      content: "Raft and Paxos leader election algorithms.",
      noteType: "documentation",
      area: "career",
      isArchived: false,
    });

    await db.insert(tasks).values({
      id: "task-api-test-1",
      userId: testUserId,
      title: "Consensus Engine Benchmark",
      description: "Measure throughput under network partitions.",
      status: "todo",
      priority: "high",
    });
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. GET /api/search rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/search?q=consensus");
    const res = await searchGet(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("2. GET /api/search validates query and returns 400 for empty q parameter", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/search?q=");
    const res = await searchGet(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation error");
  });

  it("3. GET /api/search returns 400 when q exceeds maximum character limit", async () => {
    if (!probe.isAvailable) return;

    const excessiveQuery = "x".repeat(250);
    const req = createAuthRequest(`http://localhost:3000/api/search?q=${excessiveQuery}`);
    const res = await searchGet(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation error");
  });

  it("4. GET /api/search returns 200 with unified search results and security headers", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/search?q=consensus");
    const res = await searchGet(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.query).toBe("consensus");
    expect(json.data.total).toBeGreaterThanOrEqual(2);
    expect(json.data.results.length).toBeGreaterThanOrEqual(2);

    const types = json.data.results.map((r: any) => r.type);
    expect(types).toContain("note");
    expect(types).toContain("task");
  });

  it("5. GET /api/search supports entity type filtering (type=note)", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/search?q=consensus&type=note");
    const res = await searchGet(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.results.length).toBe(1);
    expect(json.data.results[0].type).toBe("note");
    expect(json.data.byType.note).toBe(1);
    expect(json.data.byType.task).toBe(0);
  });

  it("6. GET /api/search respects limit parameter", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/search?q=consensus&limit=1");
    const res = await searchGet(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.results.length).toBe(1);
  });
});
