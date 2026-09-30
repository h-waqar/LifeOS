// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks, goals, timeBlocks, notes, people, habits, financeAccounts, financeTransactions, contentItems } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { getToolById, toAiSdkTools } from "@/server/ai/tools/registry";
import { createAccount } from "@/server/finance/account-service";
import { createGoal, getGoal } from "@/server/goals/service";
import { createHabit } from "@/server/habits/service";
import { createPerson } from "@/server/people/service";
import { getAccountById } from "@/server/finance/account-service";

describe("Phase 6 Plan 06-04: Tool Execution (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p06_plan04_tools@example.com",
    password: "Plan06ToolsPassword123!",
    name: "AI Tool Execution Tester",
  };

  const foreignUserId = crypto.randomUUID();

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Reset database to ensure clean test state
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

  it("executes tasks_create and tasks_search with strict tenant ownership", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    const taskSearchTool = getToolById("tasks_search")!;

    const createdTask = await taskCreateTool.execute(
      { userId: testUserId },
      {
        title: "Implement AI Tool Registry",
        description: "Ensure canonical domain service routing and zero raw SQL",
        priority: "high",
        status: "todo",
      }
    );

    expect(createdTask).toBeDefined();
    expect(createdTask.id).toBeDefined();
    expect(createdTask.title).toBe("Implement AI Tool Registry");
    expect(createdTask.userId).toBe(testUserId);

    // Verify task exists in DB
    const [dbTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, createdTask.id));
    expect(dbTask).toBeDefined();
    expect(dbTask.title).toBe("Implement AI Tool Registry");

    // Search task as testUser
    const searchResults = await taskSearchTool.execute(
      { userId: testUserId },
      { query: "Tool Registry" }
    );
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchResults.some((t: any) => t.id === createdTask.id)).toBe(true);

    // Multi-tenant check: Foreign user cannot see this task
    const foreignSearchResults = await taskSearchTool.execute(
      { userId: foreignUserId },
      { query: "Tool Registry" }
    );
    expect(foreignSearchResults.length).toBe(0);
  });

  it("enforces multi-tenant isolation on tasks_complete and triggers goal progress recalculation", async () => {
    if (!probe?.isAvailable) return;

    // 1. Create a goal
    const testGoal = await createGoal(testUserId, {
      title: "Complete 10 Engineering Tasks",
      horizon: "medium_term",
      area: "career",
    });

    // 2. Create a task linked to this goal
    const taskCreateTool = getToolById("tasks_create")!;
    const taskCompleteTool = getToolById("tasks_complete")!;

    const linkedTask = await taskCreateTool.execute(
      { userId: testUserId },
      {
        title: "Write tool execution integration tests",
        goalId: testGoal.id,
        status: "todo",
      }
    );

    // 3. Foreign user cannot complete this task
    await expect(
      taskCompleteTool.execute(
        { userId: foreignUserId },
        { taskId: linkedTask.id }
      )
    ).rejects.toThrow();

    // 4. Test user completes the task
    const completedTask = await taskCompleteTool.execute(
      { userId: testUserId },
      { taskId: linkedTask.id }
    );
    expect(completedTask.status).toBe("completed");

    // 5. Goal progress should be automatically recalculated
    const updatedGoal = await getGoal(testUserId, testGoal.id);
    expect(updatedGoal!.progress).toBeGreaterThanOrEqual(100);
  });

  it("executes finance_create_transaction with account balance mutation and get_summary", async () => {
    if (!probe?.isAvailable) return;

    // 1. Create a bank account with 100,000 PKR balance
    const bankAccount = await createAccount(testUserId, {
      name: "Meezan Bank Account",
      accountType: "checking",
      currency: "PKR",
      initialBalance: 100000,
    });

    const financeTransTool = getToolById("finance_create_transaction")!;
    const financeSummaryTool = getToolById("finance_get_summary")!;

    // 2. Execute expense transaction of 25,000 PKR
    const trans = await financeTransTool.execute(
      { userId: testUserId },
      {
        accountId: bankAccount.id,
        transactionType: "expense",
        amount: 25000,
        currency: "PKR",
        description: "Cloud server subscription",
      }
    );

    expect(trans).toBeDefined();
    expect(trans.id).toBeDefined();
    expect(Number(trans.amount)).toBe(25000);

    // 3. Verify account balance was atomically updated (100,000 - 25,000 = 75,000)
    const updatedAccount = await getAccountById(testUserId, bankAccount.id);
    expect(Number(updatedAccount!.balance)).toBe(75000);

    // 4. Verify finance summary reflects the expense
    const currentMonth = new Date().toISOString().slice(0, 7);
    const summary = await financeSummaryTool.execute(
      { userId: testUserId },
      { month: currentMonth }
    );
    expect(summary).toBeDefined();
    expect(summary.totalExpenses).toBeGreaterThanOrEqual(25000);

    // 5. Multi-tenant check: Foreign user cannot transact on this account
    await expect(
      financeTransTool.execute(
        { userId: foreignUserId },
        {
          accountId: bankAccount.id,
          transactionType: "income",
          amount: 5000,
        }
      )
    ).rejects.toThrow();
  });

  it("executes calendar_schedule and calendar_list with conflict avoidance support", async () => {
    if (!probe?.isAvailable) return;

    const calendarScheduleTool = getToolById("calendar_schedule")!;
    const calendarListTool = getToolById("calendar_list")!;

    const startTime = "2026-10-15T09:00:00.000Z";
    const endTime = "2026-10-15T10:30:00.000Z";

    const block = await calendarScheduleTool.execute(
      { userId: testUserId },
      {
        title: "Deep Work: Architecture Planning",
        startTime,
        endTime,
        commitmentLevel: "hard",
        description: "Focus block for Phase 6 review",
      }
    );

    expect(block).toBeDefined();
    expect(block.id).toBeDefined();
    expect(block.title).toBe("Deep Work: Architecture Planning");

    const blocks = await calendarListTool.execute(
      { userId: testUserId },
      {
        startDate: "2026-10-15",
        endDate: "2026-10-15",
      }
    );

    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks.some((b: any) => b.id === block.id)).toBe(true);
  });

  it("executes notes_create and notes_search correctly", async () => {
    if (!probe?.isAvailable) return;

    const notesCreateTool = getToolById("notes_create")!;
    const notesSearchTool = getToolById("notes_search")!;

    const note = await notesCreateTool.execute(
      { userId: testUserId },
      {
        title: "AI Layer Architectural Design Notes",
        content: "Multi-provider abstraction, HITL confirmation, and hybrid RAG.",
        noteType: "research",
        area: "career",
        tags: ["ai", "architecture"],
      }
    );

    expect(note).toBeDefined();
    expect(note.id).toBeDefined();
    expect(note.title).toBe("AI Layer Architectural Design Notes");

    const results = await notesSearchTool.execute(
      { userId: testUserId },
      { query: "Architectural Design" }
    );

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((n: any) => n.id === note.id)).toBe(true);
  });

  it("executes habits_log, people_log_interaction, and content_create_idea tools", async () => {
    if (!probe?.isAvailable) return;

    // 1. Habit check-in
    const habit = await createHabit(testUserId, {
      title: "Daily Deep Work Meditation",
      frequency: "daily",
      targetValue: 1,
      timeOfDay: "morning",
    });

    const habitsLogTool = getToolById("habits_log")!;
    const logRes = await habitsLogTool.execute(
      { userId: testUserId },
      {
        habitId: habit.id,
        value: 1,
      }
    );
    expect(logRes).toBeDefined();
    expect(logRes.entry.habitId).toBe(habit.id);

    // 2. People interaction
    const contact = await createPerson(testUserId, {
      name: "Marcus Aurelius",
      relationshipType: "mentor",
      company: "Roman Empire",
    });

    const peopleLogTool = getToolById("people_log_interaction")!;
    const interaction = await peopleLogTool.execute(
      { userId: testUserId },
      {
        personId: contact.id,
        channel: "meeting",
        summary: "Discussed stoic principles in agentic systems.",
      }
    );
    expect(interaction).toBeDefined();
    expect(interaction.personId).toBe(contact.id);
    expect(interaction.summary).toContain("stoic principles");

    // 3. Content create idea
    const contentCreateTool = getToolById("content_create_idea")!;
    const contentListTool = getToolById("content_list")!;

    const idea = await contentCreateTool.execute(
      { userId: testUserId },
      {
        title: "The Architecture of LifeOS",
        contentType: "article",
        topic: "Software Architecture",
        primaryPlatform: "blog",
        tags: ["engineering", "ai"],
      }
    );
    expect(idea).toBeDefined();
    expect(idea.title).toBe("The Architecture of LifeOS");

    const ideas = await contentListTool.execute(
      { userId: testUserId },
      { status: "idea" }
    );
    expect(ideas.length).toBeGreaterThanOrEqual(1);
    expect(ideas.some((i: any) => i.id === idea.id)).toBe(true);
  });

  it("toAiSdkTools binds user context and executes tools successfully via AI SDK interface", async () => {
    if (!probe?.isAvailable) return;

    const aiTools = toAiSdkTools({ userId: testUserId, skipHITL: true }, ["tasks_create", "tasks_search"]);
    expect(aiTools.tasks_create).toBeDefined();
    expect(aiTools.tasks_search).toBeDefined();

    // Call execute on the AI SDK tool
    const taskResult = await (aiTools.tasks_create.execute as any)({
      title: "Created via AI SDK Tool Wrapper",
      priority: "medium",
    });

    expect(taskResult).toBeDefined();
    expect(taskResult.title).toBe("Created via AI SDK Tool Wrapper");
    expect(taskResult.userId).toBe(testUserId);
  });
});
