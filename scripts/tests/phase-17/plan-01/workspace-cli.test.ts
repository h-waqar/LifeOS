/**
 * Phase 17 Plan 17-01: Workspace CLI Command Test Suite
 *
 * Verifies the Headless CLI workspace commands:
 * - lifeos workspace run <command>
 * - lifeos workspace verify
 * - lifeos workspace materialize --project-id <id> --plan-file <file>
 *
 * Checks:
 * - Authentication requirement (fails with exit code 3 when unauthenticated)
 * - Argument parsing and validation (fails with exit code 2 on invalid arguments)
 * - Anti-caller-spoofing rejection
 * - Subcommand routing to canonical sandboxed services
 * - Stream separation and --json machine-readable output
 * - Tabular formatting in default mode
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCli } from "@/cli";
import { EXIT_CODES } from "@/cli/types";
import { AuthError } from "@/cli/errors";
import * as workspaceModule from "@/server/agents/workspace";
import * as authModule from "@/cli/auth";
import fs from "fs";
import path from "path";

vi.mock("@/cli/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof authModule>();
  return {
    ...actual,
    resolveAuthenticatedUser: vi.fn(),
  };
});

vi.mock("@/server/agents/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof workspaceModule>();
  return {
    ...actual,
    runSandboxedWorkspaceCommand: vi.fn(),
    runSandboxedPreCommitVerification: vi.fn(),
    runSandboxedPlanMaterialization: vi.fn(),
  };
});

describe("Phase 17 Plan 17-01: Workspace CLI Commands", () => {
  const mockUser = {
    id: "user-123",
    email: "hamza@example.com",
    name: "Hamza Waqar",
  };
  const mockContext = {
    user: mockUser,
    token: "mock-session-token",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication and Spoofing Guards", () => {
    it("fails closed with exit code 3 when unauthenticated", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockRejectedValueOnce(
        new AuthError("Unauthenticated. Please log in.")
      );

      const exitCode = await runCli(["workspace", "run", "typecheck"]);
      expect(exitCode).toBe(EXIT_CODES.ERROR_AUTH);
    });

    it("rejects caller spoofing flags (--userId, --user_id, --user-id) fail-closed with exit code 2", async () => {
      const exitCode = await runCli(["workspace", "run", "typecheck", "--userId=hacker"]);
      expect(exitCode).toBe(EXIT_CODES.ERROR_VALIDATION);
    });
  });

  describe("Subcommand: 'lifeos workspace run'", () => {
    it("rejects missing command name with usage error", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);

      const exitCode = await runCli(["workspace", "run", "--token=test-tok"]);
      expect(exitCode).toBe(EXIT_CODES.ERROR_VALIDATION);
    });

    it("rejects prohibited / unknown commands fail-closed", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);

      const exitCode = await runCli(["workspace", "run", "rm", "--token=test-tok"]);
      expect(exitCode).toBe(EXIT_CODES.ERROR_VALIDATION);
    });

    it("delegates valid command to runSandboxedWorkspaceCommand and formats JSON output", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);
      vi.mocked(workspaceModule.runSandboxedWorkspaceCommand).mockResolvedValueOnce({
        command: "typecheck",
        exitCode: 0,
        stdout: "TypeScript clean\n",
        stderr: "",
        durationMs: 120,
        passed: true,
        summary: "Command 'typecheck' passed in 120ms",
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
      } as any);

      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

      const exitCode = await runCli(["workspace", "run", "typecheck", "--token=test-tok", "--json"]);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(workspaceModule.runSandboxedWorkspaceCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-123" }),
        }),
        expect.objectContaining({
          command: "typecheck",
        }),
        "user-123"
      );

      const lastOutput = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      const parsed = JSON.parse(lastOutput);
      expect(parsed.passed).toBe(true);
      expect(parsed.command).toBe("typecheck");
      stdoutSpy.mockRestore();
    });

    it("formats tabular output in default mode", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);
      vi.mocked(workspaceModule.runSandboxedWorkspaceCommand).mockResolvedValueOnce({
        command: "test",
        exitCode: 0,
        stdout: "All tests passed\n",
        stderr: "",
        durationMs: 250,
        passed: true,
        summary: "Command 'test' passed in 250ms",
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
      } as any);

      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

      const exitCode = await runCli(["workspace", "run", "test", "--token=test-tok"]);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      const combinedOutput = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(combinedOutput).toContain("Command 'test' passed");
      stdoutSpy.mockRestore();
    });
  });

  describe("Subcommand: 'lifeos workspace verify'", () => {
    it("delegates to runSandboxedPreCommitVerification and returns verification results", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);
      vi.mocked(workspaceModule.runSandboxedPreCommitVerification).mockResolvedValueOnce({
        started: true,
        passed: true,
        canCommit: true,
        totalDurationMs: 500,
        checksRun: ["typecheck", "test", "build", "lint"],
        checksPassed: ["typecheck", "test", "build", "lint"],
        checksFailed: [],
        checksSkipped: [],
        results: [
          { command: "typecheck", status: "passed", exitCode: 0, durationMs: 100, stdout: "", stderr: "", summary: "ok", timedOut: false },
          { command: "test", status: "passed", exitCode: 0, durationMs: 200, stdout: "", stderr: "", summary: "ok", timedOut: false },
          { command: "build", status: "passed", exitCode: 0, durationMs: 150, stdout: "", stderr: "", summary: "ok", timedOut: false },
          { command: "lint", status: "passed", exitCode: 0, durationMs: 50, stdout: "", stderr: "", summary: "ok", timedOut: false },
        ],
        gitStatus: { clean: true, hasStagedChanges: false, hasUnstagedChanges: false, untrackedCount: 0, conflictDetected: false, summary: "clean" },
        failureReason: null,
        auditLogged: true,
      } as any);

      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

      const exitCode = await runCli(["workspace", "verify", "--token=test-tok", "--json"]);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(workspaceModule.runSandboxedPreCommitVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-123" }),
        }),
        expect.anything(),
        "user-123"
      );

      const combinedOutput = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      const parsed = JSON.parse(combinedOutput);
      expect(parsed.canCommit).toBe(true);
      expect(parsed.passed).toBe(true);
      stdoutSpy.mockRestore();
    });

    it("returns NON_ZERO exit code when verification checks fail", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);
      vi.mocked(workspaceModule.runSandboxedPreCommitVerification).mockResolvedValueOnce({
        started: true,
        passed: false,
        canCommit: false,
        totalDurationMs: 100,
        checksRun: ["typecheck"],
        checksPassed: [],
        checksFailed: ["typecheck"],
        checksSkipped: ["test", "build", "lint"],
        results: [
          { command: "typecheck", status: "failed", exitCode: 1, durationMs: 100, stdout: "error TS2322", stderr: "", summary: "failed", timedOut: false },
        ],
        gitStatus: null,
        failureReason: "Check 'typecheck' failed with exit code 1",
        auditLogged: true,
      } as any);

      const exitCode = await runCli(["workspace", "verify", "--token=test-tok", "--json"]);
      expect(exitCode).toBe(EXIT_CODES.ERROR_GENERAL);
    });
  });

  describe("Subcommand: 'lifeos workspace materialize'", () => {
    it("rejects missing --project-id flag", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);

      const exitCode = await runCli(["workspace", "materialize", "--token=test-tok"]);
      expect(exitCode).toBe(EXIT_CODES.ERROR_VALIDATION);
    });

    it("rejects non-existent plan file", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);

      const exitCode = await runCli([
        "workspace",
        "materialize",
        "--project-id=11111111-1111-4111-a111-111111111111",
        "--plan-file=non-existent-file.json",
        "--token=test-tok",
      ]);
      expect(exitCode).toBe(EXIT_CODES.ERROR_VALIDATION);
    });

    it("reads valid plan file and delegates to runSandboxedPlanMaterialization", async () => {
      vi.mocked(authModule.resolveAuthenticatedUser).mockResolvedValueOnce(mockContext as any);
      vi.mocked(workspaceModule.runSandboxedPlanMaterialization).mockResolvedValueOnce({
        success: true,
        planId: "test-plan",
        version: "1.0.0",
        projectId: "11111111-1111-4111-a111-111111111111",
        taskCount: 2,
        dependencyCount: 1,
        tasks: [
          { taskId: "task-1", stepId: "step-1", title: "Step 1", priority: "high", estimatedDuration: 30, status: "todo", tags: [] },
          { taskId: "task-2", stepId: "step-2", title: "Step 2", priority: "medium", estimatedDuration: 60, status: "todo", tags: [] },
        ],
        dependencies: [{ taskId: "task-2", dependsOnTaskId: "task-1", fromStepId: "step-2", toStepId: "step-1" }],
        idempotent: false,
        auditLogged: true,
      } as any);

      const tempPlanPath = path.join(process.cwd(), "scratch-test-plan.json");
      fs.writeFileSync(
        tempPlanPath,
        JSON.stringify({
          planId: "test-plan",
          title: "Test Plan",
          steps: [
            { stepId: "step-1", title: "Step 1" },
            { stepId: "step-2", title: "Step 2", dependsOnStepIds: ["step-1"] },
          ],
        })
      );

      try {
        const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

        const exitCode = await runCli([
          "workspace",
          "materialize",
          "--project-id=11111111-1111-4111-a111-111111111111",
          `--plan-file=scratch-test-plan.json`,
          "--token=test-tok",
          "--json",
        ]);

        expect(exitCode).toBe(EXIT_CODES.SUCCESS);
        expect(workspaceModule.runSandboxedPlanMaterialization).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({ id: "user-123" }),
          }),
          expect.objectContaining({
            projectId: "11111111-1111-4111-a111-111111111111",
            plan: expect.objectContaining({ planId: "test-plan" }),
          }),
          "user-123"
        );

        stdoutSpy.mockRestore();
      } finally {
        if (fs.existsSync(tempPlanPath)) {
          fs.unlinkSync(tempPlanPath);
        }
      }
    });
  });
});
