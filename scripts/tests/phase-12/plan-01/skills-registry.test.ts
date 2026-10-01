/**
 * Plan 12-01: Curated Procedural Skills Registry & Metadata Engine Tests
 *
 * Verifies:
 * 1. YAML frontmatter parser and strict Zod schema validation (SKILL-02).
 * 2. Curated procedural skills authoring and discovery (SKILL-01).
 * 3. Skills registry queries, filtering, caching, and intent matching.
 * 4. Headless CLI skills commands (list, get, match) across human and JSON modes.
 * 5. MCP tools (lifeos_list_skills, lifeos_get_skill) and resources (lifeos://skills/*).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import { parseSkillMarkdown, parseYamlFrontmatter, SkillValidationError } from "@/server/skills/parser";
import { SkillsRegistry, skillsRegistry } from "@/server/skills/registry";
import { handleSkills } from "@/cli/commands/skills";
import { runCli } from "@/cli/index";
import { registerSkillTools } from "@/server/mcp/tools/skill-tools";
import { registerSkillResources } from "@/server/mcp/resources/skills";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "@/server/mcp/types";

describe("Plan 12-01: Skills Registry & Metadata Engine", () => {
  const mockContext: McpContext = {
    user: { id: "usr_test_123", name: "Test User", email: "test@lifeos.internal" },
    session: {
      id: "sess_test_123",
      userId: "usr_test_123",
      expiresAt: new Date(Date.now() + 86400000),
    },
  };

  describe("1. YAML Frontmatter Parser & Schema Validation (SKILL-02)", () => {
    it("parses valid YAML frontmatter with scalars, bullet lists, and inline arrays", () => {
      const validDoc = `---
name: sample-skill
description: "A valid sample skill for unit test verification."
version: 1.0.0
trigger_when:
  - "Condition alpha"
  - "Condition beta"
allowed_operations:
  - "lifeos_create_task"
required_context:
  - "lifeos://context/overview"
verification_requirements:
  - "Must assert condition gamma"
tags: ["testing", "sample"]
---

# Instruction Title
Step 1: Do something.
`;
      const parsed = parseSkillMarkdown(validDoc, "sample.md");
      expect(parsed.name).toBe("sample-skill");
      expect(parsed.description).toBe("A valid sample skill for unit test verification.");
      expect(parsed.version).toBe("1.0.0");
      expect(parsed.trigger_when).toEqual(["Condition alpha", "Condition beta"]);
      expect(parsed.allowed_operations).toEqual(["lifeos_create_task"]);
      expect(parsed.required_context).toEqual(["lifeos://context/overview"]);
      expect(parsed.verification_requirements).toEqual(["Must assert condition gamma"]);
      expect(parsed.tags).toEqual(["testing", "sample"]);
      expect(parsed.body).toBe("# Instruction Title\nStep 1: Do something.");
    });

    it("throws SkillValidationError when frontmatter block is missing", () => {
      const doc = `# Just Markdown
No frontmatter block here.
`;
      expect(() => parseSkillMarkdown(doc, "missing.md")).toThrow(SkillValidationError);
    });

    it("throws SkillValidationError when skill name violates kebab-case format", () => {
      const doc = `---
name: Invalid_Skill_Name
description: "A valid description for testing validation failures."
version: 1.0.0
trigger_when:
  - "Some trigger"
allowed_operations:
  - "lifeos_create_task"
verification_requirements:
  - "Verification step"
---
Body text.
`;
      expect(() => parseSkillMarkdown(doc, "bad-name.md")).toThrow(SkillValidationError);
    });

    it("throws SkillValidationError when description is too short (< 10 chars)", () => {
      const doc = `---
name: short-desc
description: "Too short"
version: 1.0.0
trigger_when:
  - "Some trigger"
allowed_operations:
  - "lifeos_create_task"
verification_requirements:
  - "Verification step"
---
Body text.
`;
      expect(() => parseSkillMarkdown(doc, "short-desc.md")).toThrow(SkillValidationError);
    });

    it("throws SkillValidationError when version is not valid semver", () => {
      const doc = `---
name: bad-version
description: "A valid description for testing semver regex."
version: v1-beta
trigger_when:
  - "Some trigger"
allowed_operations:
  - "lifeos_create_task"
verification_requirements:
  - "Verification step"
---
Body text.
`;
      expect(() => parseSkillMarkdown(doc, "bad-version.md")).toThrow(SkillValidationError);
    });

    it("throws SkillValidationError when required list fields are empty", () => {
      const doc = `---
name: empty-lists
description: "A valid description for testing empty list validation."
version: 1.0.0
trigger_when: []
allowed_operations: []
verification_requirements: []
---
Body text.
`;
      expect(() => parseSkillMarkdown(doc, "empty-lists.md")).toThrow(SkillValidationError);
    });
  });

  describe("2. Curated Procedural Skills Authoring & Schema Compliance (SKILL-01)", () => {
    const requiredSkills = [
      "task-breakdown",
      "goal-alignment",
      "weekly-review",
      "bug-remediation",
    ];

    it.each(requiredSkills)("curated skill '%s' exists and parses cleanly", async (skillName) => {
      const skill = await skillsRegistry.getSkill(skillName);
      expect(skill.name).toBe(skillName);
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(skill.description.length).toBeGreaterThanOrEqual(10);
      expect(skill.trigger_when.length).toBeGreaterThanOrEqual(1);
      expect(skill.allowed_operations.length).toBeGreaterThanOrEqual(1);
      expect(skill.verification_requirements.length).toBeGreaterThanOrEqual(1);
      expect(skill.body.length).toBeGreaterThan(100);
    });

    it("financial shield: asserts ZERO financial mutation tools in all curated skills", async () => {
      const skills = await skillsRegistry.listSkills();
      const prohibited = ["transaction", "account", "transfer", "wallet", "balance", "money", "finance"];

      for (const summary of skills) {
        const detail = await skillsRegistry.getSkill(summary.name);
        for (const op of detail.allowed_operations) {
          for (const word of prohibited) {
            expect(op.toLowerCase()).not.toContain(word);
          }
        }
      }
    });
  });

  describe("3. Skills Registry Discovery, Filtering & Intent Matching", () => {
    it("listSkills returns deterministic alphabetical list", async () => {
      const skills = await skillsRegistry.listSkills();
      expect(skills.length).toBeGreaterThanOrEqual(4);

      const names = skills.map((s) => s.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it("filters skills by tag correctly", async () => {
      const planningSkills = await skillsRegistry.listSkills({ tag: "planning" });
      expect(planningSkills.length).toBeGreaterThanOrEqual(1);
      expect(planningSkills.some((s) => s.name === "task-breakdown")).toBe(true);

      const engineeringSkills = await skillsRegistry.listSkills({ tag: "engineering" });
      expect(engineeringSkills.some((s) => s.name === "bug-remediation")).toBe(true);
    });

    it("getSkill throws NotFoundError for unknown skill name", async () => {
      await expect(skillsRegistry.getSkill("non-existent-skill-xyz")).rejects.toThrow(/not found/i);
    });

    it("matchSkillsForIntent ranks task-breakdown first for decomposition intent", async () => {
      const matches = await skillsRegistry.matchSkillsForIntent("decompose a project into subtasks and estimates");
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].skill.name).toBe("task-breakdown");
      expect(matches[0].score).toBeGreaterThan(0);
      expect(matches[0].matchedTriggers.length).toBeGreaterThanOrEqual(1);
    });

    it("matchSkillsForIntent ranks bug-remediation first for defect intent", async () => {
      const matches = await skillsRegistry.matchSkillsForIntent("diagnose software defect and write reproduction test");
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].skill.name).toBe("bug-remediation");
      expect(matches[0].score).toBeGreaterThan(0);
    });

    it("matchSkillsForIntent returns empty array for empty query", async () => {
      const matches = await skillsRegistry.matchSkillsForIntent("");
      expect(matches).toEqual([]);
    });
  });

  describe("4. Headless CLI Integration (lifeos skills list|get|match)", () => {
    it("runs handleSkills list in JSON mode", async () => {
      const result = await handleSkills({
        subcommands: ["skills", "list"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { count: number; skills: unknown[] };
      expect(payload.count).toBeGreaterThanOrEqual(4);
      expect(payload.skills.length).toBe(payload.count);
    });

    it("runs handleSkills get <name> in JSON mode", async () => {
      const result = await handleSkills({
        subcommands: ["skills", "get", "task-breakdown"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const skill = result?.data as { name: string; body: string };
      expect(skill.name).toBe("task-breakdown");
      expect(skill.body).toContain("Rule of 3–7");
    });

    it("runs handleSkills match in JSON mode", async () => {
      const result = await handleSkills({
        subcommands: ["skills", "match", "weekly", "reflection"],
        flags: { json: true },
        options: { json: true },
      });

      expect(result).toBeDefined();
      const payload = result?.data as { count: number; matches: Array<{ skill: { name: string } }> };
      expect(payload.count).toBeGreaterThanOrEqual(1);
      expect(payload.matches[0].skill.name).toBe("weekly-review");
    });

    it("throws UsageError when get is called without skill name", async () => {
      await expect(
        handleSkills({
          subcommands: ["skills", "get"],
          flags: {},
          options: {},
        })
      ).rejects.toThrow(/skill name is required/i);
    });

    it("throws UsageError when match is called without query", async () => {
      await expect(
        handleSkills({
          subcommands: ["skills", "match"],
          flags: {},
          options: {},
        })
      ).rejects.toThrow(/intent query is required/i);
    });

    it("runs lifeos skills list via runCli with exit code 0", async () => {
      const exitCode = await runCli(["skills", "list", "--json"]);
      expect(exitCode).toBe(0);
    });
  });

  describe("5. MCP Skill Tools & Resources Registration", () => {
    it("registers lifeos_list_skills and lifeos_get_skill tools on McpServer", async () => {
      const registeredTools: Record<string, { handler: Function }> = {};
      const mockServer = {
        registerTool: vi.fn((name: string, schema: unknown, handler: Function) => {
          registeredTools[name] = { handler };
        }),
      } as unknown as McpServer;

      registerSkillTools(mockServer, mockContext);

      expect(registeredTools["lifeos_list_skills"]).toBeDefined();
      expect(registeredTools["lifeos_get_skill"]).toBeDefined();

      // Test lifeos_list_skills handler
      const listRes = (await registeredTools["lifeos_list_skills"].handler({})) as {
        content: Array<{ text: string }>;
      };
      const listData = JSON.parse(listRes.content[0].text);
      expect(listData.count).toBeGreaterThanOrEqual(4);

      // Test lifeos_get_skill handler
      const getRes = (await registeredTools["lifeos_get_skill"].handler({ name: "goal-alignment" })) as {
        content: Array<{ text: string }>;
      };
      const getData = JSON.parse(getRes.content[0].text);
      expect(getData.name).toBe("goal-alignment");

      // Test caller spoofing rejection
      const spoofRes = (await registeredTools["lifeos_list_skills"].handler({ userId: "attacker" })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      expect(spoofRes.isError).toBe(true);
      expect(spoofRes.content[0].text).toContain("prohibited");
    });

    it("registers lifeos://skills/list and lifeos://skills/{name} resources", async () => {
      const registeredResources: Record<string, Function> = {};
      const mockServer = {
        registerResource: vi.fn((name: string, uri: string, meta: unknown, handler: Function) => {
          registeredResources[uri] = handler;
        }),
        resource: vi.fn((name: string, template: unknown, handler: Function) => {
          registeredResources["lifeos://skills/{name}"] = handler;
        }),
      } as unknown as McpServer;

      registerSkillResources(mockServer, mockContext);

      expect(registeredResources["lifeos://skills/list"]).toBeDefined();
      expect(registeredResources["lifeos://skills/{name}"]).toBeDefined();

      // Test lifeos://skills/list handler
      const listRes = await registeredResources["lifeos://skills/list"](new URL("lifeos://skills/list"));
      expect(listRes.contents[0].uri).toBe("lifeos://skills/list");
      const listData = JSON.parse(listRes.contents[0].text);
      expect(listData.count).toBeGreaterThanOrEqual(4);

      // Test lifeos://skills/{name} handler
      const skillRes = await registeredResources["lifeos://skills/{name}"](
        new URL("lifeos://skills/task-breakdown"),
        { name: "task-breakdown" }
      );
      expect(skillRes.contents[0].uri).toBe("lifeos://skills/task-breakdown");
      const skillData = JSON.parse(skillRes.contents[0].text);
      expect(skillData.name).toBe("task-breakdown");
    });
  });
});
