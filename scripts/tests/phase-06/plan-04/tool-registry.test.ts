import { describe, it, expect } from "vitest";
import {
  ALL_TOOLS,
  getToolById,
  getToolsByCategory,
  toAiSdkTools,
  getToolsSummary,
} from "@/server/ai/tools/registry";
import { requiresConfirmation, type ToolContext } from "@/server/ai/tools/types";

describe("Phase 6 Plan 06-04: Tool Registry (Unit)", () => {
  const dummyCtx: ToolContext = {
    userId: "test-user-uuid",
    conversationId: "conv-uuid",
  };

  it("registers all 17 initial domain tools with unique IDs and categories", () => {
    expect(ALL_TOOLS.length).toBe(17);

    const ids = new Set<string>();
    for (const tool of ALL_TOOLS) {
      expect(tool.id).toBeTruthy();
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.category).toBeTruthy();
      expect(tool.riskTier).toBeTruthy();
      expect(typeof tool.execute).toBe("function");

      expect(ids.has(tool.id)).toBe(false);
      ids.add(tool.id);
    }
  });

  it("correctly identifies and retrieves tools by ID and category", () => {
    const taskTool = getToolById("tasks_create");
    expect(taskTool).toBeDefined();
    expect(taskTool?.id).toBe("tasks_create");
    expect(taskTool?.category).toBe("tasks");

    const nonExistent = getToolById("non_existent_tool");
    expect(nonExistent).toBeUndefined();

    const taskTools = getToolsByCategory("tasks");
    expect(taskTools.length).toBe(3);
    expect(taskTools.map((t) => t.id)).toEqual([
      "tasks_search",
      "tasks_create",
      "tasks_complete",
    ]);

    const financeTools = getToolsByCategory("finance");
    expect(financeTools.length).toBe(2);
    expect(financeTools.map((t) => t.id)).toEqual([
      "finance_get_summary",
      "finance_create_transaction",
    ]);
  });

  it("enforces strict risk tier classification and confirmation gating requirements", () => {
    const readOnlyTools = [
      "tasks_search",
      "calendar_list",
      "goals_list",
      "projects_list",
      "habits_list",
      "notes_search",
      "people_search",
      "finance_get_summary",
      "content_list",
    ];

    for (const id of readOnlyTools) {
      const tool = getToolById(id);
      expect(tool).toBeDefined();
      expect(tool!.riskTier).toBe("tier1_readonly");
      expect(requiresConfirmation(tool!.riskTier)).toBe(false);
    }

    const draftTools = ["notes_create", "content_create_idea"];
    for (const id of draftTools) {
      const tool = getToolById(id);
      expect(tool).toBeDefined();
      expect(tool!.riskTier).toBe("tier2_low");
      expect(requiresConfirmation(tool!.riskTier)).toBe(false);
    }

    const consequentialTools = [
      "tasks_create",
      "tasks_complete",
      "calendar_schedule",
      "habits_log",
      "people_log_interaction",
    ];
    for (const id of consequentialTools) {
      const tool = getToolById(id);
      expect(tool).toBeDefined();
      expect(tool!.riskTier).toBe("tier3_consequential");
      expect(requiresConfirmation(tool!.riskTier)).toBe(true);
    }

    const destructiveTools = ["finance_create_transaction"];
    for (const id of destructiveTools) {
      const tool = getToolById(id);
      expect(tool).toBeDefined();
      expect(tool!.riskTier).toBe("tier4_destructive");
      expect(requiresConfirmation(tool!.riskTier)).toBe(true);
    }
  });

  it("validates parameters against Zod schema and rejects invalid inputs", () => {
    const taskCreate = getToolById("tasks_create")!;
    // Valid input passes
    expect(() =>
      taskCreate.schema.parse({
        title: "Buy groceries",
        priority: "high",
        status: "todo",
      })
    ).not.toThrow();

    // Invalid: empty title
    expect(() =>
      taskCreate.schema.parse({
        title: "   ",
      })
    ).toThrow();

    const taskComplete = getToolById("tasks_complete")!;
    // Valid UUID
    expect(() =>
      taskComplete.schema.parse({ taskId: "c56a4180-65aa-42ec-a945-5fd21dec0538" })
    ).not.toThrow();
    // Invalid non-UUID
    expect(() =>
      taskComplete.schema.parse({ taskId: "not-a-uuid" })
    ).toThrow();

    const financeTrans = getToolById("finance_create_transaction")!;
    // Valid
    expect(() =>
      financeTrans.schema.parse({
        accountId: "c56a4180-65aa-42ec-a945-5fd21dec0538",
        transactionType: "expense",
        amount: 450.5,
      })
    ).not.toThrow();
    // Invalid negative amount
    expect(() =>
      financeTrans.schema.parse({
        accountId: "c56a4180-65aa-42ec-a945-5fd21dec0538",
        transactionType: "expense",
        amount: -50,
      })
    ).toThrow();

    const financeSummary = getToolById("finance_get_summary")!;
    // Valid month
    expect(() => financeSummary.schema.parse({ month: "2026-09" })).not.toThrow();
    // Invalid month format
    expect(() => financeSummary.schema.parse({ month: "2026/09" })).toThrow();
    expect(() => financeSummary.schema.parse({ month: "2026-13" })).toThrow();
  });

  it("generates action previews for consequential and destructive tools", () => {
    const taskCreate = getToolById("tasks_create")!;
    expect(taskCreate.previewAction).toBeDefined();
    const preview1 = taskCreate.previewAction!({
      title: "Write Q4 Strategy",
      priority: "high",
      status: "todo",
    });
    expect(preview1.summary).toContain("Write Q4 Strategy");
    expect(preview1.affectedEntities?.[0].domain).toBe("tasks");
    expect(preview1.diff?.priority.after).toBe("high");

    const financeCreate = getToolById("finance_create_transaction")!;
    expect(financeCreate.previewAction).toBeDefined();
    const preview2 = financeCreate.previewAction!({
      accountId: "c56a4180-65aa-42ec-a945-5fd21dec0538",
      transactionType: "expense",
      amount: 12000,
      currency: "PKR",
    });
    expect(preview2.summary).toContain("12000");
    expect(preview2.warning).toBeDefined();
    expect(preview2.diff?.amount.after).toBe(12000);
  });

  it("converts tools to Vercel AI SDK format with executable tool wrappers", () => {
    const aiTools = toAiSdkTools(dummyCtx, ["tasks_search", "tasks_create"]);
    expect(aiTools.tasks_search).toBeDefined();
    expect(aiTools.tasks_create).toBeDefined();
    expect(typeof aiTools.tasks_search.execute).toBe("function");
    expect(typeof aiTools.tasks_create.execute).toBe("function");

    const summary = getToolsSummary();
    expect(summary).toContain("TASKS");
    expect(summary).toContain("FINANCE");
    expect(summary).toContain("`tasks_create`");
  });
});
