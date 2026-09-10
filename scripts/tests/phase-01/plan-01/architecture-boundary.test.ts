import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * ARCHITECTURE BOUNDARY SCANNER DESIGN & KNOWN LIMITATIONS:
 *
 * Design:
 * - Scans TypeScript source files in `src/` to enforce the architectural dependency hierarchy:
 *   UI (components, app views) -> Feature Actions -> Domain Services -> Database
 * - Enforces server-only secret isolation (preventing client components and UI from importing server secrets).
 * - Enforces database layer independence (preventing lower layers from depending on higher layers).
 * - Enforces clean `src/` repository structure (ensuring no test files are placed inside `src/`).
 *
 * Known Limitations:
 * 1. Regex-Based Parsing: The scanner uses regular expressions to extract static/dynamic imports and require statements.
 *    It does not build a full TypeScript Abstract Syntax Tree (AST). Commented-out imports may be parsed if not stripped.
 * 2. Single-Hop Direct Import Resolution: The scanner inspects direct file import specifiers. It does not perform full
 *    transitive graph reachability analysis (e.g., if module A imports allowed module B, which transitively imports forbidden module C).
 * 3. Deferral Rationale: For Phase 1, the codebase is compact and modular monolith boundaries are clean. This lightweight
 *    scanner provides fast, zero-overhead CI verification. A migration to an AST-based analyzer (e.g. ts-morph or ESLint boundary rules)
 *    is safely deferred to later phases as domain complexity expands.
 */

export interface BoundaryViolation {
  file: string;
  imported: string;
  rule: string;
}

export function extractImports(fileContent: string): string[] {
  const imports: string[] = [];
  // Strip single-line comments and block comments to avoid false positives on commented-out code
  const sanitizedContent = fileContent
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");

  // Matches static import/export declarations: import ... from '...', import '...', export ... from '...'
  const staticRegex = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
  // Matches dynamic import('...')
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // Matches require('...')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = staticRegex.exec(sanitizedContent)) !== null) {
    imports.push(match[1]);
  }
  while ((match = dynamicRegex.exec(sanitizedContent)) !== null) {
    imports.push(match[1]);
  }
  while ((match = requireRegex.exec(sanitizedContent)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

export function resolveImportPath(
  specifier: string,
  importingFile: string,
  srcRoot: string
): string | null {
  if (specifier.startsWith("@/")) {
    return path.normalize(path.join(srcRoot, specifier.slice(2)));
  }

  if (specifier.startsWith(".")) {
    return path.normalize(path.resolve(path.dirname(importingFile), specifier));
  }

  // External package or node builtin
  return null;
}

export function checkFileBoundaries(
  filePath: string,
  content: string,
  srcRoot: string
): BoundaryViolation[] {
  const relativeFile = path.relative(srcRoot, filePath);
  const violations: BoundaryViolation[] = [];
  const imports = extractImports(content);

  const isClientComponent = /^\s*['"]use client['"]/m.test(content);
  const isComponent = relativeFile.startsWith("components" + path.sep);
  const isAppView =
    relativeFile.startsWith("app" + path.sep) &&
    (relativeFile.endsWith(".tsx") || relativeFile.endsWith(".ts"));
  const isServer =
    relativeFile === "server" || relativeFile.startsWith("server" + path.sep);
  const isDatabase =
    relativeFile === "server" + path.sep + "db" ||
    relativeFile.startsWith("server" + path.sep + "db" + path.sep);
  const isService =
    relativeFile === "server" + path.sep + "services" ||
    relativeFile.startsWith("server" + path.sep + "services" + path.sep);
  const isFeatureAction =
    relativeFile.startsWith("features" + path.sep) &&
    (relativeFile.endsWith("actions.ts") ||
      relativeFile.endsWith("actions.tsx") ||
      relativeFile.includes(path.sep + "actions" + path.sep));
  const isFeatureComponent =
    relativeFile.startsWith("features" + path.sep) &&
    !isFeatureAction &&
    (relativeFile.includes(path.sep + "components" + path.sep) ||
      relativeFile.endsWith(".tsx"));

  for (const imp of imports) {
    const resolved = resolveImportPath(imp, filePath, srcRoot);
    if (!resolved) continue;

    const relativeTarget = path.relative(srcRoot, resolved);
    const targetsServer =
      relativeTarget === "server" ||
      relativeTarget.startsWith("server" + path.sep);
    const targetsDb =
      relativeTarget === "server" + path.sep + "db" ||
      relativeTarget.startsWith("server" + path.sep + "db" + path.sep);
    const targetsServices =
      relativeTarget === "server" + path.sep + "services" ||
      relativeTarget.startsWith("server" + path.sep + "services" + path.sep);
    const targetsSecretModule =
      relativeTarget === "lib" + path.sep + "env" ||
      relativeTarget.startsWith("lib" + path.sep + "env.") ||
      relativeTarget === "lib" + path.sep + "crypto" ||
      relativeTarget.startsWith("lib" + path.sep + "crypto.");
    const targetsUI =
      relativeTarget === "components" ||
      relativeTarget.startsWith("components" + path.sep) ||
      relativeTarget === "app" ||
      relativeTarget.startsWith("app" + path.sep);
    const targetsFeatures =
      relativeTarget === "features" ||
      relativeTarget.startsWith("features" + path.sep);

    // Rule 1: UI components (src/components/**) must never import src/server/**
    if (isComponent && targetsServer) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "UI components in src/components/** must NOT import from src/server/**",
      });
    }

    // Rule 2: Client components ("use client") must never import src/server/**
    if (isClientComponent && !isComponent && targetsServer) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Client components ('use client') must NOT import from src/server/**",
      });
    }

    // Rule 3: Client components ("use client") and UI components must never import secret-bearing server modules
    if ((isClientComponent || isComponent) && targetsSecretModule) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Client components and UI components must NOT import secret-bearing modules (src/lib/env, src/lib/crypto)",
      });
    }

    // Rule 4: App views and UI feature components must never directly import src/server/db/** (must use services/actions)
    if ((isAppView || isFeatureComponent) && targetsDb) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "UI views and components must NOT directly import from src/server/db/** (access via domain services or actions)",
      });
    }

    // Rule 5: Feature actions must never directly import src/server/db/** (must use domain services)
    if (isFeatureAction && targetsDb) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Feature actions must use domain services, not direct src/server/db/** queries",
      });
    }

    // Rule 6: Database layer (src/server/db/**) must never import higher layers (services, features, UI, app)
    if (isDatabase && (targetsServices || targetsFeatures || targetsUI)) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Database layer (src/server/db/**) must NOT import from higher layers (services, features, components, app)",
      });
    }

    // Rule 7: Domain services (src/server/services/**) must never import from features
    if (isService && targetsFeatures) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Domain services in src/server/services/** must NOT import from feature modules (src/features/**)",
      });
    }

    // Rule 8: Server code (src/server/**) must never import from UI components or app views
    if (isServer && targetsUI) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Server code in src/server/** must NOT import from src/components/** or src/app/**",
      });
    }
  }

  return violations;
}

function getSourceFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFilesRecursively(fullPath));
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

export function findTestFilesInDir(dir: string, baseDir: string = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findTestFilesInDir(fullPath, baseDir));
    } else if (
      entry.name.endsWith(".test.ts") ||
      entry.name.endsWith(".test.tsx") ||
      entry.name.endsWith(".spec.ts") ||
      entry.name.endsWith(".spec.tsx")
    ) {
      found.push(path.relative(baseDir, fullPath));
    }
  }
  return found;
}

describe("Architecture Boundary Scanner", () => {
  const repoRoot = path.resolve(__dirname, "../../../../");
  const srcDir = fs.existsSync(path.resolve(repoRoot, "src"))
    ? path.resolve(repoRoot, "src")
    : path.resolve(process.cwd(), "src");

  it("enforces strict architecture boundaries across all production source files in src/", () => {
    expect(fs.existsSync(srcDir), `src directory not found at: ${srcDir}`).toBe(true);
    const sourceFiles = getSourceFilesRecursively(srcDir);
    expect(sourceFiles.length, "src directory must contain production source files to scan").toBeGreaterThan(0);
    const allViolations: BoundaryViolation[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const violations = checkFileBoundaries(file, content, srcDir);
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      const formatted = allViolations
        .map((v) => `\n❌ [${v.file}] imports '${v.imported}' -> ${v.rule}`)
        .join("");
      expect.fail(`Architecture boundary violations detected:${formatted}`);
    }

    expect(allViolations).toHaveLength(0);
  });

  it("enforces that no test files are co-located inside src/", () => {
    expect(fs.existsSync(srcDir), `src directory not found at: ${srcDir}`).toBe(true);
    const testFiles = findTestFilesInDir(srcDir);
    expect(
      testFiles,
      `Found test files co-located in src/: ${testFiles.join(", ")}. All tests must reside in scripts/tests/{phase}/{plan}/.`
    ).toEqual([]);
  });

  describe("Boundary Rule Fixture Validation", () => {
    it("flags forbidden import when a component imports from src/server", () => {
      const fakeFile = path.join(srcDir, "components", "button.tsx");
      const fakeContent = `import { auth } from "@/server/auth/auth";`;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toContain("UI components in src/components/**");
    });

    it("flags forbidden import when a client component imports from src/server", () => {
      const fakeFile = path.join(srcDir, "features", "auth", "login-form.tsx");
      const fakeContent = `"use client";\nimport { db } from "@/server/db";`;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.some((v) => v.rule.includes("Client components"))).toBe(true);
    });

    it("flags forbidden import when a client component imports secret-bearing modules (env, crypto)", () => {
      const fakeClientEnv = path.join(srcDir, "features", "auth", "login-form.tsx");
      const fakeContentEnv = `"use client";\nimport { env } from "@/lib/env";`;
      const violationsEnv = checkFileBoundaries(fakeClientEnv, fakeContentEnv, srcDir);
      expect(violationsEnv).toHaveLength(1);
      expect(violationsEnv[0].rule).toContain("secret-bearing modules");

      const fakeClientCrypto = path.join(srcDir, "features", "auth", "login-form.tsx");
      const fakeContentCrypto = `"use client";\nimport { decryptSecret } from "@/lib/crypto";`;
      const violationsCrypto = checkFileBoundaries(fakeClientCrypto, fakeContentCrypto, srcDir);
      expect(violationsCrypto).toHaveLength(1);
      expect(violationsCrypto[0].rule).toContain("secret-bearing modules");
    });

    it("flags forbidden import when a UI component imports secret-bearing modules (env, crypto)", () => {
      const fakeCompEnv = path.join(srcDir, "components", "sidebar.tsx");
      const fakeContentEnv = `import { env } from "@/lib/env";`;
      const violationsEnv = checkFileBoundaries(fakeCompEnv, fakeContentEnv, srcDir);
      expect(violationsEnv).toHaveLength(1);
      expect(violationsEnv[0].rule).toContain("secret-bearing modules");

      const fakeCompCrypto = path.join(srcDir, "components", "sidebar.tsx");
      const fakeContentCrypto = `import { encryptSecret } from "@/lib/crypto";`;
      const violationsCrypto = checkFileBoundaries(fakeCompCrypto, fakeContentCrypto, srcDir);
      expect(violationsCrypto).toHaveLength(1);
      expect(violationsCrypto[0].rule).toContain("secret-bearing modules");
    });

    it("flags forbidden import when page.tsx directly imports from src/server/db", () => {
      const fakeFile = path.join(srcDir, "app", "dashboard", "page.tsx");
      const fakeContent = `import { db } from "@/server/db";`;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toContain("UI views and components must NOT directly import from src/server/db/**");
    });

    it("flags forbidden import when a feature UI component directly imports from src/server/db", () => {
      const fakeFile = path.join(srcDir, "features", "tasks", "components", "task-card.tsx");
      const fakeContent = `import { db } from "@/server/db";`;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toContain("UI views and components must NOT directly import from src/server/db/**");
    });

    it("flags forbidden import when feature actions directly import from src/server/db", () => {
      const fakeFile1 = path.join(srcDir, "features", "tasks", "actions.ts");
      const fakeContent1 = `import { db } from "@/server/db";`;
      const violations1 = checkFileBoundaries(fakeFile1, fakeContent1, srcDir);
      expect(violations1).toHaveLength(1);
      expect(violations1[0].rule).toContain("Feature actions must use domain services");

      const fakeFile2 = path.join(srcDir, "features", "tasks", "actions", "create-task.ts");
      const fakeContent2 = `import { db } from "@/server/db";`;
      const violations2 = checkFileBoundaries(fakeFile2, fakeContent2, srcDir);
      expect(violations2).toHaveLength(1);
      expect(violations2[0].rule).toContain("Feature actions must use domain services");
    });

    it("flags forbidden import when database layer imports higher layers (services, features, UI)", () => {
      const fakeDbService = path.join(srcDir, "server", "db", "schema.ts");
      const fakeContentService = `import { taskService } from "@/server/services/tasks";`;
      const violationsService = checkFileBoundaries(fakeDbService, fakeContentService, srcDir);
      expect(violationsService).toHaveLength(1);
      expect(violationsService[0].rule).toContain("Database layer (src/server/db/**) must NOT import from higher layers");

      const fakeDbFeature = path.join(srcDir, "server", "db", "schema.ts");
      const fakeContentFeature = `import { createTaskAction } from "@/features/tasks/actions";`;
      const violationsFeature = checkFileBoundaries(fakeDbFeature, fakeContentFeature, srcDir);
      expect(violationsFeature).toHaveLength(1);
      expect(violationsFeature[0].rule).toContain("Database layer (src/server/db/**) must NOT import from higher layers");
    });

    it("flags forbidden import when domain services import from UI or feature actions", () => {
      const fakeServiceUI = path.join(srcDir, "server", "services", "tasks.ts");
      const fakeContentUI = `import { Button } from "@/components/ui/button";`;
      const violationsUI = checkFileBoundaries(fakeServiceUI, fakeContentUI, srcDir);
      expect(violationsUI).toHaveLength(1);
      expect(violationsUI[0].rule).toContain("Server code in src/server/** must NOT import from src/components/** or src/app/**");

      const fakeServiceFeature = path.join(srcDir, "server", "services", "tasks.ts");
      const fakeContentFeature = `import { taskFormSchema } from "@/features/tasks/actions";`;
      const violationsFeature = checkFileBoundaries(fakeServiceFeature, fakeContentFeature, srcDir);
      expect(violationsFeature).toHaveLength(1);
      expect(violationsFeature[0].rule).toContain("Domain services in src/server/services/** must NOT import from feature modules");
    });

    it("flags forbidden import when server module imports from components or app", () => {
      const fakeFile = path.join(srcDir, "server", "auth", "session.ts");
      const fakeContent = `import { Button } from "@/components/ui/button";`;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toContain("Server code in src/server/**");
    });

    it("allows permitted architectural imports across layers", () => {
      // 1. UI component importing utility
      const compFile = path.join(srcDir, "components", "button.tsx");
      const compContent = `
        import * as React from "react";
        import { cn } from "@/lib/utils";
        export function Button() { return <div className={cn("btn")} />; }
      `;
      expect(checkFileBoundaries(compFile, compContent, srcDir)).toHaveLength(0);

      // 2. Feature action importing domain service
      const actionFile = path.join(srcDir, "features", "tasks", "actions.ts");
      const actionContent = `
        import { taskService } from "@/server/services/tasks";
        export async function createTask(data: unknown) { return taskService.create(data); }
      `;
      expect(checkFileBoundaries(actionFile, actionContent, srcDir)).toHaveLength(0);

      // 3. Domain service importing database layer
      const serviceFile = path.join(srcDir, "server", "services", "tasks.ts");
      const serviceContent = `
        import { db } from "@/server/db";
        import { tasks } from "@/server/db/schema";
        export const taskService = { list: () => db.select().from(tasks) };
      `;
      expect(checkFileBoundaries(serviceFile, serviceContent, srcDir)).toHaveLength(0);

      // 4. Server component in App views importing domain service
      const pageFile = path.join(srcDir, "app", "dashboard", "page.tsx");
      const pageContent = `
        import { taskService } from "@/server/services/tasks";
        export default async function Page() { const t = await taskService.list(); return <div>{t.length}</div>; }
      `;
      expect(checkFileBoundaries(pageFile, pageContent, srcDir)).toHaveLength(0);
    });

    it("flags test files when present in a scanned directory (clean-src rule fixture validation)", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-test-clean-src-"));
      try {
        fs.mkdirSync(path.join(tempDir, "components"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "components", "button.tsx"), "// component code");
        fs.writeFileSync(path.join(tempDir, "components", "button.test.ts"), "// test code");
        fs.writeFileSync(path.join(tempDir, "components", "card.spec.tsx"), "// spec code");

        const detected = findTestFilesInDir(tempDir);
        expect(detected).toHaveLength(2);
        expect(detected).toContain(path.join("components", "button.test.ts"));
        expect(detected).toContain(path.join("components", "card.spec.tsx"));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
