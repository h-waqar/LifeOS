import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { createAuditLog } from "@/server/audit";
import { eq, desc } from "drizzle-orm";

describe("Plan 01-05: Adversarial Audit Log Boundary & FK Resistance", () => {
  let probe: ProbeResult;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await closeDatabase();
    }
  });

  it("safely handles empty string userId without violating foreign key constraints", async () => {
    if (!probe.isAvailable) return;

    const actionName = "security.empty_user_test_" + crypto.randomUUID().slice(0, 8);

    await createAuditLog({
      userId: "",
      category: "security",
      action: actionName,
      status: "failure",
      details: { attack: "empty_string_user_id" },
    });

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, actionName));

    expect(entries.length).toBe(1);
    expect(entries[0].userId).toBeNull();
    expect(entries[0].actor).toBe("system");
    expect(entries[0].status).toBe("failure");
  });

  it("safely handles whitespace-only userId without violating foreign key constraints", async () => {
    if (!probe.isAvailable) return;

    const actionName = "security.whitespace_user_test_" + crypto.randomUUID().slice(0, 8);

    await createAuditLog({
      userId: "    \t  \n  ",
      category: "security",
      action: actionName,
      status: "failure",
      details: { attack: "whitespace_user_id" },
    });

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, actionName));

    expect(entries.length).toBe(1);
    expect(entries[0].userId).toBeNull();
    expect(entries[0].actor).toBe("system");
  });

  it("safely handles null and undefined userId", async () => {
    if (!probe.isAvailable) return;

    const actionNull = "security.null_user_" + crypto.randomUUID().slice(0, 8);
    await createAuditLog({
      userId: null,
      category: "security",
      action: actionNull,
      status: "success",
    });

    const entriesNull = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, actionNull));
    expect(entriesNull.length).toBe(1);
    expect(entriesNull[0].userId).toBeNull();

    const actionUndefined = "security.undef_user_" + crypto.randomUUID().slice(0, 8);
    await createAuditLog({
      userId: undefined,
      category: "security",
      action: actionUndefined,
      status: "success",
    });

    const entriesUndef = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, actionUndefined));
    expect(entriesUndef.length).toBe(1);
    expect(entriesUndef[0].userId).toBeNull();
  });
});
