import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

export interface BoundaryViolation {
  file: string;
  imported: string;
  rule: string;
}

export function extractImports(fileContent: string): string[] {
  const imports: string[] = [];
  // Matches static import/export declarations: import ... from '...', import '...', export ... from '...'
  const staticRegex = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
  // Matches dynamic import('...')
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // Matches require('...')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = staticRegex.exec(fileContent)) !== null) {
    imports.push(match[1]);
  }
  while ((match = dynamicRegex.exec(fileContent)) !== null) {
    imports.push(match[1]);
  }
  while ((match = requireRegex.exec(fileContent)) !== null) {
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
    (relativeFile.endsWith("page.tsx") || relativeFile.endsWith("layout.tsx"));
  const isServer = relativeFile.startsWith("server" + path.sep);
  const isFeatureAction =
    relativeFile.startsWith("features" + path.sep) &&
    relativeFile.endsWith("actions.ts");

  for (const imp of imports) {
    const resolved = resolveImportPath(imp, filePath, srcRoot);
    if (!resolved) continue;

    const relativeTarget = path.relative(srcRoot, resolved);

    // Rule 1: src/components/** must never import src/server/**
    if (isComponent && relativeTarget.startsWith("server")) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "UI components in src/components/** must NOT import from src/server/**",
      });
    }

    // Rule 2: src/app/**/(page|layout).tsx must never import src/server/db/**
    if (isAppView && relativeTarget.startsWith("server" + path.sep + "db")) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "App views (page.tsx, layout.tsx) must NOT directly import from src/server/db/**",
      });
    }

    // Rule 3: Client components ("use client") must never import src/server/**
    if (isClientComponent && relativeTarget.startsWith("server")) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Client components ('use client') must NOT import from src/server/**",
      });
    }

    // Rule 4: src/server/** must never import from src/components/** or src/app/**
    if (
      isServer &&
      (relativeTarget.startsWith("components") || relativeTarget.startsWith("app"))
    ) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Server code in src/server/** must NOT import from src/components/** or src/app/**",
      });
    }

    // Rule 5: src/features/*/actions.ts must never import src/server/db/**
    if (isFeatureAction && relativeTarget.startsWith("server" + path.sep + "db")) {
      violations.push({
        file: relativeFile,
        imported: imp,
        rule: "Feature actions must use domain services, not direct src/server/db/** queries",
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

describe("Architecture Boundary Scanner", () => {
  const srcDir = path.resolve(__dirname);

  it("enforces strict architecture boundaries across all production source files in src/", () => {
    const sourceFiles = getSourceFilesRecursively(srcDir);
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
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toContain("Client components");
    });

    it("flags forbidden import when page.tsx directly imports from src/server/db", () => {
      const fakeFile = path.join(srcDir, "app", "dashboard", "page.tsx");
      const fakeContent = `import { db } from "@/server/db";`;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toContain("App views (page.tsx, layout.tsx)");
    });

    it("flags forbidden import when server module imports from components or app", () => {
      const fakeFile = path.join(srcDir, "server", "services", "test.ts");
      const fakeContent = `import { Button } from "@/components/ui/button";`;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toContain("Server code in src/server/**");
    });

    it("allows permitted imports (lib, utils, external modules)", () => {
      const fakeFile = path.join(srcDir, "components", "button.tsx");
      const fakeContent = `
        import * as React from "react";
        import { cn } from "@/lib/utils";
        export function Button() { return <div className={cn("btn")} />; }
      `;
      const violations = checkFileBoundaries(fakeFile, fakeContent, srcDir);
      expect(violations).toHaveLength(0);
    });
  });
});
