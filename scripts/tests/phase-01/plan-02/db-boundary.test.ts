import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  checkFileBoundaries,
  findTestFilesInDir,
} from "../plan-01/architecture-boundary.test";

describe("Database Architecture & Server-Only Boundaries", () => {
  const repoRoot = path.resolve(__dirname, "../../../../");
  const srcDir = path.resolve(repoRoot, "src");
  const dbDir = path.resolve(srcDir, "server", "db");

  it("enforces that all source files in src/ comply with architecture boundaries after adding database layer", () => {
    function getSourceFiles(dir: string): string[] {
      if (!fs.existsSync(dir)) return [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...getSourceFiles(fullPath));
        } else if (
          (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
          !entry.name.endsWith(".test.ts") &&
          !entry.name.endsWith(".test.tsx")
        ) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const sourceFiles = getSourceFiles(srcDir);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const allViolations = [];
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const violations = checkFileBoundaries(file, content, srcDir);
      allViolations.push(...violations);
    }

    expect(
      allViolations,
      `Detected architecture boundary violations: ${JSON.stringify(allViolations, null, 2)}`
    ).toEqual([]);
  });

  it("verifies that database layer (src/server/db/**) exists and does not import from higher layers", () => {
    expect(fs.existsSync(dbDir), "src/server/db directory must exist").toBe(true);
    const dbFiles = fs
      .readdirSync(dbDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => path.join(dbDir, e.name));

    for (const file of dbFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const violations = checkFileBoundaries(file, content, srcDir);
      expect(
        violations,
        `Database file ${path.relative(srcDir, file)} violates architecture rules`
      ).toEqual([]);
    }
  });

  it("enforces the clean-src repository rule: zero test files exist inside src/", () => {
    const testFiles = findTestFilesInDir(srcDir);
    expect(
      testFiles,
      `Test files must reside in scripts/tests/{phase}/{plan}/. Found inside src/: ${testFiles.join(", ")}`
    ).toEqual([]);
  });

  it("includes server-only protection guard in src/server/db/index.ts", () => {
    const indexPath = path.join(dbDir, "index.ts");
    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, "utf-8");

    expect(content).toContain('typeof window !== "undefined"');
    expect(content).toContain("Security violation: Database connection pool");
  });
});
