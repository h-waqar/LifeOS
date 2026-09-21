// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  findRepoRoot,
  REPO_ROOT,
  ARTIFACT_CONFIG,
  EVIDENCE_BASE_DIR,
  assertNotRepoRoot,
  safeWriteArtifact,
  safeCopyArtifact,
  ensureDirs,
} from "./execute-human-loop-verification";

describe("Phase 1 Plan 01-09 QA Artifact Path & Cleanliness Protection", () => {
  beforeAll(() => {
    ensureDirs();
  });

  describe("1. Deterministic Root Resolution & Centralized Configuration", () => {
    it("resolves the repository root dynamically without hardcoded absolute paths or cwd assumptions", () => {
      expect(REPO_ROOT).toBeDefined();
      expect(fs.existsSync(path.join(REPO_ROOT, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(REPO_ROOT, ".human-loop"))).toBe(true);
    });

    it("ensures all artifact directories reside in designated locations and NOT repository root", () => {
      const pathsToCheck = [
        ARTIFACT_CONFIG.screenshotsDir,
        ARTIFACT_CONFIG.recordingsDir,
        ARTIFACT_CONFIG.logsDir,
        ARTIFACT_CONFIG.artifactReportsDir,
        ARTIFACT_CONFIG.docsQaDir,
        EVIDENCE_BASE_DIR,
      ];

      for (const p of pathsToCheck) {
        expect(path.dirname(p)).not.toBe(REPO_ROOT);
        expect(p).not.toBe(REPO_ROOT);
        expect(path.isAbsolute(p)).toBe(true);
      }

      // Exact structural assertions
      expect(ARTIFACT_CONFIG.screenshotsDir).toBe(
        path.join(REPO_ROOT, ".human-loop/artifacts/plan-01-09/screenshots")
      );
      expect(ARTIFACT_CONFIG.recordingsDir).toBe(
        path.join(REPO_ROOT, ".human-loop/artifacts/plan-01-09/recordings")
      );
      expect(ARTIFACT_CONFIG.logsDir).toBe(
        path.join(REPO_ROOT, ".human-loop/artifacts/plan-01-09/logs")
      );
      expect(ARTIFACT_CONFIG.docsQaDir).toBe(
        path.join(REPO_ROOT, "docs/qa/phase-01/plan-09")
      );
      expect(ARTIFACT_CONFIG.reportPath).toBe(
        path.join(REPO_ROOT, "docs/qa/phase-01/plan-09/human-loop-verification-report.md")
      );
      expect(ARTIFACT_CONFIG.summaryJsonPath).toBe(
        path.join(REPO_ROOT, "docs/qa/phase-01/plan-09/verification-results.json")
      );
    });

    it("ensures findRepoRoot correctly discovers root when called from subdirectories", () => {
      const plan09Dir = path.resolve(REPO_ROOT, "scripts/tests/phase-01/plan-09");
      const srcDir = path.resolve(REPO_ROOT, "src/components");
      expect(findRepoRoot(plan09Dir)).toBe(REPO_ROOT);
      expect(findRepoRoot(srcDir)).toBe(REPO_ROOT);
    });
  });

  describe("2. Root Pollution Guard (assertNotRepoRoot)", () => {
    it("strictly blocks writing reports directly to repository root", () => {
      expect(() => {
        assertNotRepoRoot(path.join(REPO_ROOT, "human_loop_verification_report.md"));
      }).toThrow(/VIOLATION: Verification runner is prohibited/);

      expect(() => {
        assertNotRepoRoot(path.join(REPO_ROOT, "human_acceptance_audit.md"));
      }).toThrow(/VIOLATION: Verification runner is prohibited/);

      expect(() => {
        assertNotRepoRoot(path.join(REPO_ROOT, "lifeos_qa_human_verification_report.md"));
      }).toThrow(/VIOLATION: Verification runner is prohibited/);
    });

    it("strictly blocks writing screenshots, recordings, and logs directly to repository root", () => {
      expect(() => {
        assertNotRepoRoot(path.join(REPO_ROOT, "H01-screenshot.png"));
      }).toThrow(/VIOLATION: Verification runner is prohibited/);

      expect(() => {
        assertNotRepoRoot(path.join(REPO_ROOT, "H01-recording.webm"));
      }).toThrow(/VIOLATION: Verification runner is prohibited/);

      expect(() => {
        assertNotRepoRoot(path.join(REPO_ROOT, "verification.log"));
      }).toThrow(/VIOLATION: Verification runner is prohibited/);

      expect(() => {
        assertNotRepoRoot(path.join(REPO_ROOT, "verification-results.json"));
      }).toThrow(/VIOLATION: Verification runner is prohibited/);
    });

    it("allows writing inside designated artifact and documentation directories", () => {
      expect(() => {
        assertNotRepoRoot(path.join(ARTIFACT_CONFIG.screenshotsDir, "H01-screenshot.png"));
      }).not.toThrow();

      expect(() => {
        assertNotRepoRoot(path.join(ARTIFACT_CONFIG.recordingsDir, "H01-recording.webm"));
      }).not.toThrow();

      expect(() => {
        assertNotRepoRoot(path.join(ARTIFACT_CONFIG.logsDir, "test.log"));
      }).not.toThrow();

      expect(() => {
        assertNotRepoRoot(path.join(ARTIFACT_CONFIG.docsQaDir, "human-loop-verification-report.md"));
      }).not.toThrow();
    });
  });

  describe("3. Safe Artifact Writing & Evidence Preservation", () => {
    const testTempDir = path.join(ARTIFACT_CONFIG.logsDir, "test-evidence-preservation");

    beforeAll(() => {
      if (!fs.existsSync(testTempDir)) {
        fs.mkdirSync(testTempDir, { recursive: true });
      }
    });

    afterAll(() => {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    });

    it("refuses to write if destination is repository root", () => {
      expect(() => {
        safeWriteArtifact(path.join(REPO_ROOT, "leak-test.md"), "test");
      }).toThrow(/VIOLATION/);
    });

    it("safely writes new artifacts in allowed subdirectories", () => {
      const targetFile = path.join(testTempDir, "sample-artifact.txt");
      safeWriteArtifact(targetFile, "Initial content v1");
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Initial content v1");
    });

    it("preserves existing evidence into superseded/ rather than silently overwriting when content changes", () => {
      const targetFile = path.join(testTempDir, "evidence-to-preserve.txt");
      safeWriteArtifact(targetFile, "Original Evidence v1");

      // Overwrite with different content
      safeWriteArtifact(targetFile, "Updated Evidence v2");

      expect(fs.readFileSync(targetFile, "utf-8")).toBe("Updated Evidence v2");

      const supersededDir = path.join(testTempDir, "superseded");
      expect(fs.existsSync(supersededDir)).toBe(true);

      const backups = fs.readdirSync(supersededDir).filter((f) => f.startsWith("evidence-to-preserve-"));
      expect(backups.length).toBeGreaterThanOrEqual(1);

      const backupContent = fs.readFileSync(path.join(supersededDir, backups[0]), "utf-8");
      expect(backupContent).toBe("Original Evidence v1");
    });
  });

  describe("4. Current Repository Root Cleanliness Check", () => {
    it("confirms zero generated QA reports or artifacts are present in repository root", () => {
      const rootFiles = fs.readdirSync(REPO_ROOT, { withFileTypes: true });

      const prohibitedExactNames = [
        "human_loop_verification_report.md",
        "human_acceptance_audit.md",
        "lifeos_qa_human_verification_report.md",
        "verification-results.json",
      ];

      const foundProhibitedExact = rootFiles
        .filter((f) => prohibitedExactNames.includes(f.name))
        .map((f) => f.name);

      expect(foundProhibitedExact).toEqual([]);

      // Check extensions
      const prohibitedExtensions = [".png", ".webm", ".mp4", ".log"];
      const pollutedFiles = rootFiles
        .filter((f) => f.isFile())
        .filter((f) => prohibitedExtensions.some((ext) => f.name.endsWith(ext)))
        .map((f) => f.name);

      expect(pollutedFiles).toEqual([]);

      // Check temporary verification directories in root
      const prohibitedRootDirs = ["verification-evidence", ".frames", "screenshots", "recordings"];
      const pollutedDirs = rootFiles
        .filter((f) => f.isDirectory())
        .filter((f) => prohibitedRootDirs.includes(f.name))
        .map((f) => f.name);

      expect(pollutedDirs).toEqual([]);
    });
  });

  describe("5. Authoritative Verification Report Integrity", () => {
    it("confirms the authoritative report exists in docs/qa/phase-01/plan-09/", () => {
      expect(fs.existsSync(ARTIFACT_CONFIG.reportPath)).toBe(true);
    });

    it("confirms the report contains NO file:///home/... links", () => {
      const content = fs.readFileSync(ARTIFACT_CONFIG.reportPath, "utf-8");
      expect(content).not.toContain("file:///home/");
      expect(content).not.toMatch(/file:\/\/\//);
    });

    it("confirms the report contains NO plaintext passwords or database URIs", () => {
      const content = fs.readFileSync(ARTIFACT_CONFIG.reportPath, "utf-8");
      expect(content).not.toContain("StrongMasterPassword123!");
      expect(content).not.toContain("WrongPassword999!");
      expect(content).not.toContain("postgresql://");
    });

    it("confirms the report uses actual project metadata", () => {
      const content = fs.readFileSync(ARTIFACT_CONFIG.reportPath, "utf-8");
      expect(content).toContain("15.5.25");
      expect(content).toContain("pnpm");
      expect(content).toContain("pnpm-lock.yaml");
      expect(content).toContain("1c22ed6796383ed9ad35d5597e444ba231457c1e");
    });

    it("confirms the report maintains CONDITIONAL GO recommendation and PENDING human approval", () => {
      const content = fs.readFileSync(ARTIFACT_CONFIG.reportPath, "utf-8");
      expect(content).toContain("RELEASE RECOMMENDATION: CONDITIONAL GO");
      expect(content).toContain("PENDING HUMAN AUDIT");
      expect(content).not.toContain("FINAL RELEASE RECOMMENDATION: ACCEPTED");
    });

    it("confirms historical reports are preserved in docs/qa/phase-01/plan-09/historical/ with superseded banners", () => {
      const histAudit = path.join(ARTIFACT_CONFIG.docsQaDir, "historical/human-acceptance-audit.md");
      const histSuperseded = path.join(
        ARTIFACT_CONFIG.docsQaDir,
        "historical/lifeos-qa-human-verification-report.superseded.md"
      );

      expect(fs.existsSync(histAudit)).toBe(true);
      expect(fs.existsSync(histSuperseded)).toBe(true);

      const auditContent = fs.readFileSync(histAudit, "utf-8");
      const supersededContent = fs.readFileSync(histSuperseded, "utf-8");

      expect(auditContent).toContain("HISTORICAL QA AUDIT REPORT");
      expect(auditContent).not.toContain("file:///home/");
      expect(auditContent).not.toContain("StrongMasterPassword123!");

      expect(supersededContent).toContain("SUPERSEDED VERIFICATION DRAFT");
      expect(supersededContent).not.toContain("file:///home/");
      expect(supersededContent).not.toContain("StrongMasterPassword123!");
    });
  });
});
