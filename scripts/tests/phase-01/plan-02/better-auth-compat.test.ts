import { describe, it, expect } from "vitest";
import { getAuthTables } from "better-auth/db";
import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as authSchema from "@/server/db/schema/auth";

describe("Better Auth 1.7.4 Runtime Schema Compatibility", () => {
  const runtimeTables = getAuthTables({ plugins: [passkeyPlugin()] });

  const authTables = ["user", "session", "account", "verification", "passkey"] as const;

  it("defines all core and plugin tables required by Better Auth runtime", () => {
    for (const tableName of authTables) {
      expect(runtimeTables).toHaveProperty(tableName);
      const drizzleTable = (authSchema as Record<string, unknown>)[tableName];
      expect(drizzleTable, `Drizzle table '${tableName}' must be defined`).toBeDefined();
      expect(getTableName(drizzleTable as any)).toBe(tableName);
    }
  });

  for (const tableName of authTables) {
    describe(`Table: ${tableName}`, () => {
      const runtimeModel = runtimeTables[tableName];
      const drizzleTable = (authSchema as Record<string, unknown>)[tableName] as any;
      const columns = getTableColumns(drizzleTable);

      it(`has a primary key on 'id'`, () => {
        expect(columns).toHaveProperty("id");
        expect(columns.id.primary).toBe(true);
        expect(columns.id.notNull).toBe(true);
      });

      it(`matches all runtime fields, types, and nullability requirements`, () => {
        for (const [fieldName, fieldDef] of Object.entries(runtimeModel.fields)) {
          const col = columns[fieldName];
          expect(
            col,
            `Expected column '${fieldName}' to exist on table '${tableName}'`
          ).toBeDefined();

          // Validate nullability
          if (fieldDef.required !== undefined) {
            expect(
              col.notNull,
              `Nullability mismatch on ${tableName}.${fieldName}: expected notNull=${fieldDef.required}`
            ).toBe(fieldDef.required);
          }

          // Validate data types
          if (fieldDef.type === "string") {
            expect(col.dataType).toBe("string");
          } else if (fieldDef.type === "boolean") {
            expect(col.dataType).toBe("boolean");
          } else if (fieldDef.type === "date") {
            expect(col.dataType).toBe("date");
          } else if (fieldDef.type === "number") {
            expect(col.dataType).toBe("number");
          }

          // Validate uniqueness constraints
          if (fieldDef.unique === true) {
            expect(
              col.isUnique,
              `Column ${tableName}.${fieldName} must be marked unique`
            ).toBe(true);
          }

          // Validate default values
          if (fieldDef.defaultValue !== undefined) {
            expect(col.hasDefault).toBe(true);
          }
        }
      });

      if (tableName === "passkey") {
        it("strictly aligns passkey.aaguid and passkey.createdAt nullability", () => {
          expect(columns).toHaveProperty("aaguid");
          expect(columns.aaguid.notNull).toBe(false); // Nullable per Better Auth 1.7.4

          expect(columns).toHaveProperty("createdAt");
          expect(columns.createdAt.notNull).toBe(false); // Nullable per Better Auth 1.7.4

          // Assert updatedAt is not present on passkey (not in Better Auth passkey plugin)
          expect(columns.updatedAt).toBeUndefined();
        });
      }

      if (tableName === "session" || tableName === "account" || tableName === "passkey") {
        it("enforces foreign key reference to user.id", () => {
          expect(columns).toHaveProperty("userId");
          expect(columns.userId.notNull).toBe(true);
        });
      }
    });
  }
});
