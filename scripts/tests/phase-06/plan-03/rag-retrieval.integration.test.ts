// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks, projects, goals, notes, people, interactions } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { retrievePersonalContext } from "@/server/ai/rag/retrieval-service";
import { POST as retrievePost } from "@/app/api/ai/retrieve/route";

describe("Phase 6 Plan 06-03: Personal Graph RAG Retrieval (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p06_plan03_rag@example.com",
    password: "Plan06RagPassword123!",
    name: "RAG Retrieval Tester",
  };

  const foreignUserId = crypto.randomUUID();

  let testUserId: string;
  let cookieHeader: string;
  let createdTaskId: string;
  let createdGoalId: string;
  let createdProjectId: string;
  let createdNoteId: string;
  let createdPersonId: string;

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

    const match = res.headers.get("set-cookie")!.match(/better-auth\.session_token=([^;]+)/);
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;

    // 1. Create a Goal for testUser
    const [goalRow] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "Scale SaaS Revenue to 50k MRR",
        description: "Focus on B2B expansion and retention",
        targetDate: new Date("2026-12-31T00:00:00Z"),
      })
      .returning();
    createdGoalId = goalRow.id;

    // 2. Create a Project linked to Goal
    const [projRow] = await db
      .insert(projects)
      .values({
        userId: testUserId,
        goalId: createdGoalId,
        name: "Enterprise Invoicing Engine",
        description: "Automated billing for high-volume customers",
        status: "active",
      })
      .returning();
    createdProjectId = projRow.id;

    // 3. Create a Task linked to Project and Goal
    const [taskRow] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        projectId: createdProjectId,
        goalId: createdGoalId,
        title: "Integrate Stripe Tax and Webhooks",
        description: "Set up automatic calculation and reconciliation",
        priority: "high",
        status: "todo",
      })
      .returning();
    createdTaskId = taskRow.id;

    // 4. Create a Note for testUser
    const [noteRow] = await db
      .insert(notes)
      .values({
        userId: testUserId,
        title: "Stripe Webhook Architecture & Resilience",
        slug: "stripe-webhook-architecture-resilience",
        content: "Idempotency keys and event queue buffering strategy.",
        noteType: "documentation",
      })
      .returning();
    createdNoteId = noteRow.id;

    // 5. Create a Person contact with an Interaction
    const [personRow] = await db
      .insert(people)
      .values({
        userId: testUserId,
        name: "Alex Mercer",
        company: "Stripe Billing Solutions",
        relationshipType: "professional",
      })
      .returning();
    createdPersonId = personRow.id;

    await db.insert(interactions).values({
      userId: testUserId,
      personId: createdPersonId,
      channel: "call",
      summary: "Discussed custom webhook retries and volume limits.",
    });
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Unauthenticated requests to /api/ai/retrieve fail closed with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/ai/retrieve", {
      method: "POST",
      body: JSON.stringify({ query: "Stripe tax" }),
    });
    const res = await retrievePost(req);
    expect(res.status).toBe(401);
  });

  it("2. Retrieves personal entities with PostgreSQL hybrid search across domains", async () => {
    if (!probe.isAvailable) return;

    const result = await retrievePersonalContext(
      testUserId,
      "What did I write about Stripe Webhook Architecture?"
    );

    expect(result.entities.length).toBeGreaterThanOrEqual(1);
    const foundNote = result.entities.find((e) => e.domain === "note");
    expect(foundNote).toBeDefined();
    expect(foundNote?.title).toContain("Stripe Webhook");
    expect(result.formattedXml).toContain("Stripe Webhook Architecture");
    expect(result.formattedXml).toContain('untrusted="true"');
    expect(result.citations.some((c) => c.url.includes(createdNoteId))).toBe(true);
  });

  it("3. Relational Graph Expansion: Enriches tasks with parent project and linked goal", async () => {
    if (!probe.isAvailable) return;

    const result = await retrievePersonalContext(
      testUserId,
      "task for Stripe Tax integration"
    );

    expect(result.entities.length).toBeGreaterThanOrEqual(1);
    const taskEntity = result.entities.find((e) => e.domain === "task");
    expect(taskEntity).toBeDefined();

    // Verify expanded relations attached to task
    expect(taskEntity?.relations).toBeDefined();
    expect(taskEntity?.relations?.length).toBeGreaterThanOrEqual(1);

    const projectRel = taskEntity?.relations?.find((r) => r.domain === "project");
    expect(projectRel).toBeDefined();
    expect(projectRel?.title).toBe("Enterprise Invoicing Engine");

    const goalRel = taskEntity?.relations?.find((r) => r.domain === "goal");
    expect(goalRel).toBeDefined();
    expect(goalRel?.title).toBe("Scale SaaS Revenue to 50k MRR");

    // Formatted XML includes the expanded relation tags
    expect(result.formattedXml).toContain('relation type="parent_project" domain="project"');
    expect(result.formattedXml).toContain('Enterprise Invoicing Engine');
  });

  it("4. Relational Graph Expansion: Enriches people with recent logged interactions", async () => {
    if (!probe.isAvailable) return;

    const result = await retrievePersonalContext(
      testUserId,
      "Who is Alex Mercer at Stripe?"
    );

    expect(result.entities.length).toBeGreaterThanOrEqual(1);
    const personEntity = result.entities.find((e) => e.domain === "person");
    expect(personEntity).toBeDefined();
    expect(personEntity?.relations).toBeDefined();

    const interactionRel = personEntity?.relations?.find((r) => r.domain === "interaction");
    expect(interactionRel).toBeDefined();
    expect(interactionRel?.details).toContain("Discussed custom webhook retries");
  });

  it("5. Multi-Tenant Isolation: Foreign user cannot retrieve any entities or relations", async () => {
    if (!probe.isAvailable) return;

    // Foreign user searches with exact same query
    const foreignResult = await retrievePersonalContext(
      foreignUserId,
      "Stripe Webhook Architecture"
    );

    expect(foreignResult.entities).toHaveLength(0);
    expect(foreignResult.citations).toHaveLength(0);
    expect(foreignResult.formattedXml).toBe("");
  });

  it("6. Handles empty queries and non-matching searches gracefully", async () => {
    if (!probe.isAvailable) return;

    const emptyResult = await retrievePersonalContext(
      testUserId,
      "nonexistent_entity_completely_random_xyz999"
    );

    expect(emptyResult.entities).toHaveLength(0);
    expect(emptyResult.citations).toHaveLength(0);
    expect(emptyResult.formattedXml).toBe("");
  });

  it("7. API Route: POST /api/ai/retrieve works end-to-end for authenticated session", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/ai/retrieve", {
      method: "POST",
      body: JSON.stringify({
        query: "What is my goal for SaaS revenue?",
        maxTokens: 1500,
        limit: 5,
      }),
    });

    const res = await retrievePost(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.entities.length).toBeGreaterThanOrEqual(1);
    expect(body.data.entities.some((e: any) => e.domain === "goal")).toBe(true);
    expect(body.data.citations.length).toBeGreaterThanOrEqual(1);
  });
});
