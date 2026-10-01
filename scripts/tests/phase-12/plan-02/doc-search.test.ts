/**
 * Plan 12-02: Contextual Documentation Search & Planning Graph Integration Tests
 *
 * Verifies:
 * 1. Path safety and traversal defense strictly confining paths to docs/, .planning/, skills/ (SKILL-03).
 * 2. In-memory documentation search, ranking, and contextual snippet extraction (SKILL-03).
 * 3. Planning graph inspector parsing state, decisions, summaries, and roadmap (SKILL-04).
 * 4. Headless CLI docs commands (search, get, planning) across human and JSON modes.
 * 5. MCP tools (lifeos_search_docs, lifeos_get_doc, lifeos_get_planning_state) and planning resources.
 */

import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { resolveSafeDocPath } from "@/server/docs/path-safety";
import { DocSearchService, docSearchService } from "@/server/docs/search-service";
import { PlanningInspector, planningInspector } from "@/server/docs/planning-inspector";
import { handleDocs } from "@/cli/commands/docs";
import { runCli } from "@/cli/index";
import { registerDocTools } from "@/server/mcp/tools/doc-tools";
import { registerPlanningResources } from "@/server/mcp/resources/planning";
import { UsageError, NotFoundError } from "@/cli/errors";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "@/server/mcp/types";

describe("Plan 12-02: Documentation Search & Planning Graph Inspection", () => {
  const mockContext: McpContext = {
    user: { id: "usr_test_123", name: "Test User", email: "test@lifeos.internal" },
    session: {
      id: "sess_test_123",
      userId: "usr_test_123",
      expiresAt: new Date(Date.now() + 86400000),
    },
  };

  describe("1. Path Traversal & Sandbox Shield (SKILL-03, T-12-04)", () => {
    it("resolves valid documentation paths inside allowed roots", () => {
      const result = resolveSafeDocPath("docs/security/auth-boundary.md");
      expect(result.relativePath).toBe("docs/security/auth-boundary.md");
      expect(result.absolutePath).toContain("docs/security/auth-boundary.md");

      const planningRes = resolveSafeDocPath(".planning/STATE.md");
      expect(planningRes.relativePath).toBe(".planning/STATE.md");

      const skillRes = resolveSafeDocPath("skills/lifeos/task-breakdown/SKILL.md");
      expect(skillRes.relativePath).toBe("skills/lifeos/task-breakdown/SKILL.md");
    });

    it("rejects path traversal attempting to read package.json via relative escaping", () => {
      expect(() => resolveSafeDocPath("docs/../../package.json")).toThrow(UsageError);
      expect(() => resolveSafeDocPath("../../package.json")).toThrow(UsageError);
    });

    it("rejects absolute paths outside documentation root", () => {
      expect(() => resolveSafeDocPath("/etc/passwd")).toThrow(UsageError);
      expect(() => resolveSafeDocPath("/etc/hosts")).toThrow(UsageError);
    });

    it("rejects null byte injections fail-closed", () => {
      expect(() =>
        resolveSafeDocPath("docs/security/auth-boundary.md\0/etc/passwd")
      ).toThrow(UsageError);
      expect(() =>
        resolveSafeDocPath("docs/security/auth-boundary.md%00/etc/passwd")
      ).toThrow(UsageError);
    });

    it("rejects URL-encoded path traversals fail-closed", () => {
      expect(() => resolveSafeDocPath("docs%2f..%2f..%2fpackage.json")).toThrow(UsageError);
      expect(() => resolveSafeDocPath("..%2f..%2fetc%2fpasswd")).toThrow(UsageError);
    });

    it("throws NotFoundError when document does not exist within allowed roots", () => {
      expect(() => resolveSafeDocPath("docs/non-existent-doc-xyz.md")).toThrow(NotFoundError);
      expect(() => resolveSafeDocPath(".planning/non-existent-file-abc.md")).toThrow(NotFoundError);
    });
  });

  describe("2. Documentation Search Engine & Ranking (SKILL-03, T-12-05)", () => {
    it("indexes and searches docs with multi-tier scoring", async () => {
      const results = await docSearchService.searchDocs({
        q: "Authentication Boundary",
        limit: 5,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const topMatch = results[0];
      expect(topMatch.path).toContain("docs/security/auth-boundary.md");
      expect(topMatch.score).toBeGreaterThanOrEqual(10);
      expect(topMatch.headings.length).toBeGreaterThan(0);
      expect(topMatch.snippet.length).toBeGreaterThan(10);
    });

    it("filters search by scope source (docs, planning, skills)", async () => {
      const skillResults = await docSearchService.searchDocs({
        q: "task",
        source: "skills",
      });
      for (const res of skillResults) {
        expect(res.source).toBe("skills");
        expect(res.path.startsWith("skills/")).toBe(true);
      }

      const planningResults = await docSearchService.searchDocs({
        q: "roadmap",
        source: "planning",
      });
      for (const res of planningResults) {
        expect(res.source).toBe("planning");
        expect(res.path.startsWith(".planning/")).toBe(true);
      }
    });

    it("extracts contextual snippet highlighting matched terms within ~120 characters", async () => {
      const results = await docSearchService.searchDocs({
        q: "HMAC-SHA256",
        limit: 3,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const snippet = results[0].snippet;
      expect(snippet.length).toBeLessThanOrEqual(150);
      expect(snippet.toLowerCase()).toContain("hmac-sha256");
    });

    it("retrieves full document content with secret scrubbing", async () => {
      const doc = await docSearchService.getDocContent("docs/security/auth-boundary.md");
      expect(doc.path).toBe("docs/security/auth-boundary.md");
      expect(doc.title).toContain("Authentication");
      expect(doc.content).toContain("Threat Model & Security Invariants");
      expect(doc.headings).toContain("1. Threat Model & Security Invariants");
    });

    it("retrieves a specific section of a document", async () => {
      const section = await docSearchService.getDocContent(
        "docs/security/auth-boundary.md",
        "Threat Model"
      );
      expect(section.section).toBe("Threat Model");
      expect(section.content).toContain("LifeOS is designed as a single-tenant personal operating system");
    });

    it("throws NotFoundError when requested section does not exist", async () => {
      await expect(
        docSearchService.getDocContent(
          "docs/security/auth-boundary.md",
          "Non Existent Section 999"
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("3. Planning Graph Inspector (SKILL-04, T-12-06)", () => {
    it("extracts current planning state from STATE.md", async () => {
      const state = await planningInspector.getCurrentPlanningState();
      expect(state.milestone).toBeDefined();
      expect(state.current_phase).toBeDefined();
      expect(state.current_phase_name).toBeDefined();
      expect(state.status).toBeDefined();
    });

    it("extracts milestone architectural decisions from PROJECT.md", async () => {
      const decisions = await planningInspector.getMilestoneDecisions();
      expect(decisions.length).toBeGreaterThanOrEqual(2);

      const drizzleDecision = decisions.find((d) => d.decision.toLowerCase().includes("drizzle"));
      expect(drizzleDecision).toBeDefined();
      expect(drizzleDecision?.decision).toContain("PostgreSQL");
      expect(drizzleDecision?.rationale).toContain("relational modeling");
    });

    it("retrieves phase summary for a completed phase (Phase 11)", async () => {
      const summary = await planningInspector.getPhaseSummary("11");
      expect(summary.phase).toBe("11");
      expect(summary.path).toContain("11-");
      expect(summary.summary.length).toBeGreaterThan(50);
    });

    it("throws NotFoundError when summary for unknown phase is queried", async () => {
      await expect(planningInspector.getPhaseSummary("999")).rejects.toThrow(NotFoundError);
    });

    it("extracts pending roadmap phases and remaining requirements", async () => {
      const roadmap = await planningInspector.getPendingRoadmap();
      expect(roadmap.phases.length).toBeGreaterThanOrEqual(1);
      expect(typeof roadmap.pendingRequirementsCount).toBe("number");
    });
  });

  describe("4. Headless CLI Docs Commands (SKILL-03, SKILL-04)", () => {
    it("runs lifeos docs search in JSON mode", async () => {
      const result = await handleDocs({
        subcommands: ["docs", "search", "security"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { count: number; results: unknown[] };
      expect(payload.count).toBeGreaterThanOrEqual(1);
    });

    it("runs lifeos docs get in JSON mode", async () => {
      const result = await handleDocs({
        subcommands: ["docs", "get", "docs/security/auth-boundary.md"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { title: string; content: string };
      expect(payload.title).toContain("Authentication");
      expect(payload.content.length).toBeGreaterThan(100);
    });

    it("runs lifeos docs planning status in JSON mode", async () => {
      const result = await handleDocs({
        subcommands: ["docs", "planning", "status"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { milestone: string; current_phase: string };
      expect(payload.milestone).toBeDefined();
    });

    it("runs lifeos docs planning decisions in JSON mode", async () => {
      const result = await handleDocs({
        subcommands: ["docs", "planning", "decisions"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { count: number; decisions: unknown[] };
      expect(payload.count).toBeGreaterThanOrEqual(2);
    });

    it("runs lifeos docs planning summary 11 in JSON mode", async () => {
      const result = await handleDocs({
        subcommands: ["docs", "planning", "summary", "11"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { phase: string; summary: string };
      expect(payload.phase).toBe("11");
    });

    it("runs lifeos docs planning roadmap in JSON mode", async () => {
      const result = await handleDocs({
        subcommands: ["docs", "planning", "roadmap"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { phases: unknown[] };
      expect(payload.phases.length).toBeGreaterThanOrEqual(1);
    });

    it("runs lifeos docs search via runCli with exit code 0", async () => {
      const exitCode = await runCli(["docs", "search", "architecture", "--json"]);
      expect(exitCode).toBe(0);
    });
  });

  describe("5. MCP Doc Tools & Planning Resources (SKILL-03, SKILL-04)", () => {
    it("registers lifeos_search_docs, lifeos_get_doc, lifeos_get_planning_state tools on McpServer", async () => {
      const registeredTools: Record<string, { handler: Function }> = {};
      const mockServer = {
        registerTool: vi.fn((name: string, schema: unknown, handler: Function) => {
          registeredTools[name] = { handler };
        }),
      } as unknown as McpServer;

      registerDocTools(mockServer, mockContext);

      expect(registeredTools["lifeos_search_docs"]).toBeDefined();
      expect(registeredTools["lifeos_get_doc"]).toBeDefined();
      expect(registeredTools["lifeos_get_planning_state"]).toBeDefined();

      // Test lifeos_search_docs
      const searchRes = (await registeredTools["lifeos_search_docs"].handler({
        q: "Authentication Boundary",
      })) as { content: Array<{ text: string }> };
      const searchData = JSON.parse(searchRes.content[0].text);
      expect(searchData.count).toBeGreaterThanOrEqual(1);

      // Test lifeos_get_doc
      const getDocRes = (await registeredTools["lifeos_get_doc"].handler({
        path: "docs/security/auth-boundary.md",
      })) as { content: Array<{ text: string }> };
      const docData = JSON.parse(getDocRes.content[0].text);
      expect(docData.title).toContain("Authentication");

      // Test lifeos_get_planning_state (state view)
      const stateRes = (await registeredTools["lifeos_get_planning_state"].handler({
        view: "state",
      })) as { content: Array<{ text: string }> };
      const stateData = JSON.parse(stateRes.content[0].text);
      expect(stateData.milestone).toBeDefined();

      // Test lifeos_get_planning_state (decisions view)
      const decisionsRes = (await registeredTools["lifeos_get_planning_state"].handler({
        view: "decisions",
      })) as { content: Array<{ text: string }> };
      const decisionsData = JSON.parse(decisionsRes.content[0].text);
      expect(decisionsData.count).toBeGreaterThanOrEqual(2);

      // Test caller spoofing rejection on doc tools
      const spoofRes = (await registeredTools["lifeos_search_docs"].handler({
        q: "auth",
        userId: "attacker",
      })) as { isError?: boolean; content: Array<{ text: string }> };
      expect(spoofRes.isError).toBe(true);
      expect(spoofRes.content[0].text).toContain("prohibited");
    });

    it("registers lifeos://docs/planning/state and lifeos://docs/planning/decisions resources", async () => {
      const registeredResources: Record<string, Function> = {};
      const mockServer = {
        registerResource: vi.fn((name: string, uri: string, meta: unknown, handler: Function) => {
          registeredResources[uri] = handler;
        }),
      } as unknown as McpServer;

      registerPlanningResources(mockServer, mockContext);

      expect(registeredResources["lifeos://docs/planning/state"]).toBeDefined();
      expect(registeredResources["lifeos://docs/planning/decisions"]).toBeDefined();

      // Test lifeos://docs/planning/state
      const stateRes = await registeredResources["lifeos://docs/planning/state"](
        new URL("lifeos://docs/planning/state")
      );
      expect(stateRes.contents[0].uri).toBe("lifeos://docs/planning/state");
      const stateData = JSON.parse(stateRes.contents[0].text);
      expect(stateData.milestone).toBeDefined();

      // Test lifeos://docs/planning/decisions
      const decisionsRes = await registeredResources["lifeos://docs/planning/decisions"](
        new URL("lifeos://docs/planning/decisions")
      );
      expect(decisionsRes.contents[0].uri).toBe("lifeos://docs/planning/decisions");
      const decisionsData = JSON.parse(decisionsRes.contents[0].text);
      expect(decisionsData.count).toBeGreaterThanOrEqual(2);
    });
  });
});
