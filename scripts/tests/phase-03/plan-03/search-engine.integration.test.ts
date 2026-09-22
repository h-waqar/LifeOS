// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { notes } from "@/server/db/schema/notes";
import { tasks } from "@/server/db/schema/tasks";
import { projects } from "@/server/db/schema/projects";
import { goals } from "@/server/db/schema/goals";
import { people } from "@/server/db/schema/people";
import { auth } from "@/server/auth";
import { search } from "@/server/search/service";
import { eq } from "drizzle-orm";

describe("Phase 3 Plan 03-03: PostgreSQL Full-Text & Trigram Search Engine (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_search_engine_user@example.com",
    password: "Plan03SearchEnginePassword123!",
    name: "Search Engine Tester",
  };

  let testUserId: string;
  const otherUserId = "00000000-0000-0000-0000-999999999999";

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean up previous user
    await db.delete(user);

    // Create single authenticated user via Better Auth
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

    // Seed records across all 5 domains for testUser
    await db.insert(notes).values([
      {
        id: "note-a-1",
        userId: testUserId,
        title: "Quantum Computing Architecture Overview",
        slug: "quantum-computing-architecture-overview",
        content: "Exploring superconducting qubits and error correction algorithms.",
        noteType: "research",
        area: "career",
        tags: ["quantum", "hardware"],
        isArchived: false,
      },
      {
        id: "note-a-archived",
        userId: testUserId,
        title: "Archived Quantum Strategy",
        slug: "archived-quantum-strategy",
        content: "Old notes on deprecated quantum processors.",
        noteType: "research",
        area: "career",
        tags: ["quantum", "old"],
        isArchived: true, // Should be excluded from search
      },
    ]);

    await db.insert(tasks).values([
      {
        id: "task-a-1",
        userId: testUserId,
        title: "Implement Quantum Simulator in Rust",
        description: "Benchmark circuit execution against state vector simulator.",
        status: "in_progress",
        priority: "high",
        tags: ["rust", "quantum"],
      },
      {
        id: "task-a-cancelled",
        userId: testUserId,
        title: "Quantum Compiler Draft",
        description: "Drafting AST for quantum gate decomposition.",
        status: "cancelled", // Should be excluded from search
        priority: "low",
      },
    ]);

    await db.insert(projects).values([
      {
        id: "proj-a-1",
        userId: testUserId,
        name: "Quantum Operating System",
        description: "Next-generation runtime layer for quantum control hardware.",
        status: "active",
        priority: "critical",
        area: "career",
      },
      {
        id: "proj-a-archived",
        userId: testUserId,
        name: "Archived Quantum Prototype",
        description: "Retired experimental hardware interface.",
        status: "archived", // Should be excluded from search
        priority: "low",
        area: "general",
      },
    ]);

    await db.insert(goals).values([
      {
        id: "goal-a-1",
        userId: testUserId,
        title: "Publish Quantum Algorithms Paper",
        description: "Submit peer-reviewed paper on quantum optimization.",
        horizon: "medium_term",
        area: "career",
        status: "in_progress",
      },
      {
        id: "goal-a-archived",
        userId: testUserId,
        title: "Archived Quantum Grant",
        description: "Old grant proposal.",
        horizon: "long_term",
        area: "career",
        status: "archived", // Should be excluded from search
      },
    ]);

    await db.insert(people).values([
      {
        id: "person-a-1",
        userId: testUserId,
        name: "Dr. Alice Quantum",
        company: "Quantum Labs International",
        role: "Principal Scientist",
        email: "alice@quantumlabs.org",
        notes: "Key collaborator on quantum gate design.",
        relationshipType: "colleague",
        isArchived: false,
      },
      {
        id: "person-a-archived",
        userId: testUserId,
        name: "Bob Quantum",
        company: "Quantum Ventures",
        role: "Advisor",
        notes: "Former advisor.",
        relationshipType: "mentor",
        isArchived: true, // Should be excluded from search
      },
    ]);
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Finds exact matches across all 5 domain entities in a single unified search", async () => {
    if (!probe.isAvailable) return;

    const res = await search(testUserId, { q: "quantum" });

    expect(res.query).toBe("quantum");
    expect(res.results.length).toBeGreaterThanOrEqual(5);

    const types = res.results.map((r) => r.type);
    expect(types).toContain("note");
    expect(types).toContain("task");
    expect(types).toContain("project");
    expect(types).toContain("goal");
    expect(types).toContain("person");

    expect(res.byType.note).toBe(1);
    expect(res.byType.task).toBe(1);
    expect(res.byType.project).toBe(1);
    expect(res.byType.goal).toBe(1);
    expect(res.byType.person).toBe(1);
  });

  it("2. Enforces strict composite multi-tenant isolation (Other user sees zero records)", async () => {
    if (!probe.isAvailable) return;

    const resOther = await search(otherUserId, { q: "Quantum" });
    expect(resOther.results).toEqual([]);
    expect(resOther.total).toBe(0);
    expect(resOther.byType.note).toBe(0);
    expect(resOther.byType.task).toBe(0);
    expect(resOther.byType.project).toBe(0);
    expect(resOther.byType.goal).toBe(0);
    expect(resOther.byType.person).toBe(0);
  });

  it("3. Excludes archived notes, cancelled tasks, and archived projects/goals/people", async () => {
    if (!probe.isAvailable) return;

    const res = await search(testUserId, { q: "quantum" });
    const ids = res.results.map((r) => r.id);

    expect(ids).not.toContain("note-a-archived");
    expect(ids).not.toContain("task-a-cancelled");
    expect(ids).not.toContain("proj-a-archived");
    expect(ids).not.toContain("goal-a-archived");
    expect(ids).not.toContain("person-a-archived");
  });

  it("4. Supports multi-word full-text search with stemming (e.g. 'computing architectures')", async () => {
    if (!probe.isAvailable) return;

    const res = await search(testUserId, { q: "computing architecture" });
    expect(res.results.length).toBeGreaterThanOrEqual(1);

    const match = res.results.find((r) => r.id === "note-a-1");
    expect(match).toBeDefined();
    expect(match?.title).toBe("Quantum Computing Architecture Overview");
  });

  it("5. Supports trigram fuzzy matching with typo tolerance via pg_trgm", async () => {
    if (!probe.isAvailable) return;

    // "simulater" with typo should match "Implement Quantum Simulator in Rust"
    const res = await search(testUserId, { q: "simulater" });
    const match = res.results.find((r) => r.id === "task-a-1");
    expect(match).toBeDefined();
    expect(match?.title).toContain("Quantum Simulator");
  });

  it("6. Supports partial substring / ILIKE prefix queries", async () => {
    if (!probe.isAvailable) return;

    // Searching "sci" matches role "Principal Scientist"
    const res = await search(testUserId, { q: "sci" });
    const match = res.results.find((r) => r.id === "person-a-1");
    expect(match).toBeDefined();
    expect(match?.title).toBe("Dr. Alice Quantum");
  });

  it("7. Filters by specific entity type when 'type' parameter is provided", async () => {
    if (!probe.isAvailable) return;

    const res = await search(testUserId, { q: "quantum", type: "note" });
    expect(res.results.length).toBe(1);
    expect(res.results[0].type).toBe("note");
    expect(res.results[0].id).toBe("note-a-1");
    expect(res.byType.note).toBe(1);
    expect(res.byType.task).toBe(0);
    expect(res.byType.project).toBe(0);
  });

  it("8. Ranks exact title match higher than body / description matches", async () => {
    if (!probe.isAvailable) return;

    // Seed two items: one with exact title, one with keyword only in content
    await db.insert(notes).values([
      {
        id: "note-rank-exact",
        userId: testUserId,
        title: "Machine Learning",
        slug: "machine-learning-exact",
        content: "Overview of modern approaches.",
        noteType: "reference",
        area: "career",
        isArchived: false,
      },
      {
        id: "note-rank-body",
        userId: testUserId,
        title: "Artificial Intelligence Survey",
        slug: "ai-survey-body",
        content: "Detailed deep dive into machine learning architectures.",
        noteType: "research",
        area: "career",
        isArchived: false,
      },
    ]);

    const res = await search(testUserId, { q: "Machine Learning" });
    expect(res.results.length).toBeGreaterThanOrEqual(2);

    const exactIndex = res.results.findIndex((r) => r.id === "note-rank-exact");
    const bodyIndex = res.results.findIndex((r) => r.id === "note-rank-body");

    expect(exactIndex).toBeLessThan(bodyIndex);
    expect(res.results[exactIndex].score).toBeGreaterThan(res.results[bodyIndex].score);
  });

  it("9. Returns empty results predictably when no entities match", async () => {
    if (!probe.isAvailable) return;

    const res = await search(testUserId, { q: "nonexistent_term_xyz_12345" });
    expect(res.results).toEqual([]);
    expect(res.total).toBe(0);
  });
});
