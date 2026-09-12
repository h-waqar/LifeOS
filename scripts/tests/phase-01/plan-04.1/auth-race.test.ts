import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { user, FOUNDATIONAL_TABLE_NAMES } from "@/server/db/schema";

describe("Plan 01-04.1: Single-User Schema Constraints & Integrity", () => {
  it("defines singleUserLock column on user table with non-nullable default true", () => {
    const cols = getTableColumns(user);
    expect(cols).toHaveProperty("singleUserLock");
    expect(cols.singleUserLock.notNull).toBe(true);
    expect(cols.singleUserLock.dataType).toBe("boolean");
    expect(cols.singleUserLock.default).toBe(true);
  });

  it("retains all foundational tables required by Phase 1 vertical-slice rule", () => {
    expect(FOUNDATIONAL_TABLE_NAMES).toHaveLength(7);
    expect(Array.from(FOUNDATIONAL_TABLE_NAMES)).toEqual([
      "user",
      "session",
      "account",
      "verification",
      "passkey",
      "user_preferences",
      "audit_log",
    ]);
  });
});
