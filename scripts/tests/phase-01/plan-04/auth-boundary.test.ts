import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Plan 01-04: Authentication & Authorization Boundary Invariants", () => {
  const rootDir = path.resolve(__dirname, "../../../../");

  describe("Server-Only Runtime Protection Invariants", () => {
    const serverFiles = [
      "src/server/auth/index.ts",
      "src/server/auth/guard.ts",
      "src/server/audit/index.ts",
      "src/server/preferences/service.ts",
      "src/app/api/auth/[...all]/route.ts",
      "src/app/api/preferences/route.ts",
    ];

    for (const relPath of serverFiles) {
      it(`enforces server-only runtime guard in ${relPath}`, () => {
        const fullPath = path.join(rootDir, relPath);
        expect(fs.existsSync(fullPath), `File ${relPath} must exist`).toBe(true);

        const content = fs.readFileSync(fullPath, "utf-8");
        expect(content).toContain('typeof window !== "undefined"');
        expect(content).toContain("Security violation");
      });
    }
  });

  describe("Client-Side Secrets & Isolation Invariants", () => {
    it("ensures src/lib/auth-client.ts never imports server-only secrets or DB drivers", () => {
      const clientPath = path.join(rootDir, "src/lib/auth-client.ts");
      expect(fs.existsSync(clientPath), "src/lib/auth-client.ts must exist").toBe(true);

      const content = fs.readFileSync(clientPath, "utf-8");

      // Forbidden database and server module imports
      expect(content).not.toContain("@/server/db");
      expect(content).not.toContain("@/server/auth");
      expect(content).not.toContain("@/server/audit");
      expect(content).not.toContain("from 'pg'");
      expect(content).not.toContain('from "pg"');
      expect(content).not.toContain("drizzle-orm/node-postgres");

      // Forbidden secret environment keys
      expect(content).not.toContain("DATABASE_URL");
      expect(content).not.toContain("BETTER_AUTH_SECRET");
      expect(content).not.toContain("LIFEOS_ENCRYPTION_KEY");

      // Must strictly use client packages
      expect(content).toContain("better-auth/react");
      expect(content).toContain("@better-auth/passkey/client");
    });
  });

  describe("Database Abstraction & Single-Pool Discipline", () => {
    it("ensures auth implementation delegates to singleton db without constructing custom pools", () => {
      const authPath = path.join(rootDir, "src/server/auth/index.ts");
      const content = fs.readFileSync(authPath, "utf-8");

      // Uses singleton db from server/db
      expect(content).toContain('from "@/server/db"');
      expect(content).toContain("drizzleAdapter(db");

      // Never constructs new Pool() directly
      expect(content).not.toContain("new Pool(");
      expect(content).not.toContain("createPgPool(");
    });
  });
});
