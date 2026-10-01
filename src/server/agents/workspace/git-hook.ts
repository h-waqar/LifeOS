/**
 * Git Pre-Commit Hook Management Engine
 *
 * Implements:
 * 1. Idempotent installation of LifeOS pre-commit hook.
 * 2. Non-destructive hook composition (preserves pre-existing user hooks via backup & chaining).
 * 3. Inspection of hook installation status.
 * 4. Safe uninstallation and restoration of original user hooks.
 */

import fs from "fs";
import path from "path";
import { getCanonicalProjectRoot } from "./sandbox";
import { resolveGitDir } from "./lease-manager";
import type { GitHookStatusResult, GitHookManageResult } from "./types";
import { executeAgentOperation, type AgentOperationResult } from "../safety-boundary";
import type { AgentSafetyContext } from "../permissions/types";

export const LIFEOS_PRE_COMMIT_HOOK_MARKER = "### LIFEOS_PRE_COMMIT_HOOK_V1 ###";

/**
 * Returns the path to the repository's pre-commit hook.
 */
export async function getPreCommitHookPath(projectRoot: string): Promise<string> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const gitDir = await resolveGitDir(canonicalRoot);
  return path.join(gitDir, "hooks", "pre-commit");
}

/**
 * Generates the shell script content for the pre-commit hook.
 */
export function generatePreCommitHookScript(): string {
  return `#!/bin/sh
${LIFEOS_PRE_COMMIT_HOOK_MARKER}
# Managed by LifeOS Workspace Harness - Do not edit manually

# 1. Resolve repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="."
fi

# 2. Execute LifeOS pre-commit verification gate script if present
if [ -f "$REPO_ROOT/scripts/workspace-pre-commit.cjs" ]; then
  node "$REPO_ROOT/scripts/workspace-pre-commit.cjs"
  GATE_EXIT=$?
  if [ $GATE_EXIT -ne 0 ]; then
    exit $GATE_EXIT
  fi
fi

# 3. Chain to pre-existing user hook if backed up
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
BACKUP_HOOK="$GIT_DIR/hooks/pre-commit.pre-lifeos"
if [ -x "$BACKUP_HOOK" ]; then
  "$BACKUP_HOOK" "$@"
  exit $?
fi

exit 0
`;
}

/**
 * Inspects current pre-commit hook status.
 */
export async function getPreCommitHookStatus(
  projectRoot: string
): Promise<GitHookStatusResult> {
  const hookPath = await getPreCommitHookPath(projectRoot);
  const backupPath = `${hookPath}.pre-lifeos`;

  const installed = fs.existsSync(hookPath);
  let lifeosManaged = false;

  if (installed) {
    try {
      const content = fs.readFileSync(hookPath, "utf8");
      lifeosManaged = content.includes(LIFEOS_PRE_COMMIT_HOOK_MARKER);
    } catch {
      lifeosManaged = false;
    }
  }

  const backupExists = fs.existsSync(backupPath);

  return {
    installed,
    lifeosManaged,
    backupExists,
    hookPath,
    backupPath: backupExists ? backupPath : undefined,
  };
}

/**
 * Installs the LifeOS pre-commit hook idempotently.
 * If a non-LifeOS hook exists, backs it up to `pre-commit.pre-lifeos`.
 */
export async function installPreCommitHook(
  projectRoot: string
): Promise<GitHookManageResult> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const hookPath = await getPreCommitHookPath(canonicalRoot);
  const hooksDir = path.dirname(hookPath);

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const backupPath = `${hookPath}.pre-lifeos`;
  let backedUp = false;

  if (fs.existsSync(hookPath)) {
    const existingContent = fs.readFileSync(hookPath, "utf8");
    if (!existingContent.includes(LIFEOS_PRE_COMMIT_HOOK_MARKER)) {
      // Pre-existing user hook: back up to preserve user workflow
      fs.copyFileSync(hookPath, backupPath);
      // Ensure backup retains execute permissions
      try {
        fs.chmodSync(backupPath, 0o755);
      } catch {}
      backedUp = true;
    }
  }

  const scriptContent = generatePreCommitHookScript();
  fs.writeFileSync(hookPath, scriptContent, { encoding: "utf8", mode: 0o755 });
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch {}

  return {
    success: true,
    action: "install",
    installed: true,
    backedUp,
    restored: false,
    message: backedUp
      ? "LifeOS pre-commit hook installed successfully. Existing hook backed up to pre-commit.pre-lifeos and chained."
      : "LifeOS pre-commit hook installed successfully.",
  };
}

/**
 * Uninstalls the LifeOS pre-commit hook.
 * If a backup hook exists, restores it to `pre-commit`.
 */
export async function uninstallPreCommitHook(
  projectRoot: string
): Promise<GitHookManageResult> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const hookPath = await getPreCommitHookPath(canonicalRoot);
  const backupPath = `${hookPath}.pre-lifeos`;

  let restored = false;

  if (fs.existsSync(hookPath)) {
    const content = fs.readFileSync(hookPath, "utf8");
    if (content.includes(LIFEOS_PRE_COMMIT_HOOK_MARKER)) {
      fs.unlinkSync(hookPath);
    }
  }

  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, hookPath);
    try {
      fs.chmodSync(hookPath, 0o755);
    } catch {}
    restored = true;
  }

  const remaining = fs.existsSync(hookPath);

  return {
    success: true,
    action: "uninstall",
    installed: remaining,
    backedUp: false,
    restored,
    message: restored
      ? "LifeOS pre-commit hook uninstalled. Previous hook restored from backup."
      : "LifeOS pre-commit hook uninstalled successfully.",
  };
}

/**
 * Authorized Agent Operation Entry Point for Hook Installation.
 */
export async function runSandboxedHookInstall(
  context: AgentSafetyContext,
  targetUserId: string,
  projectRoot?: string,
  dbClient?: any
): Promise<AgentOperationResult<GitHookManageResult>> {
  const operationName = "workspace.hook.install";

  return await executeAgentOperation<{ projectRoot?: string }, GitHookManageResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: { projectRoot },
    targetUserId,
    dbClient,
    executor: async () => {
      return await installPreCommitHook(projectRoot || process.cwd());
    },
  });
}

/**
 * Authorized Agent Operation Entry Point for Hook Uninstallation.
 */
export async function runSandboxedHookUninstall(
  context: AgentSafetyContext,
  targetUserId: string,
  projectRoot?: string,
  dbClient?: any
): Promise<AgentOperationResult<GitHookManageResult>> {
  const operationName = "workspace.hook.uninstall";

  return await executeAgentOperation<{ projectRoot?: string }, GitHookManageResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: { projectRoot },
    targetUserId,
    dbClient,
    executor: async () => {
      return await uninstallPreCommitHook(projectRoot || process.cwd());
    },
  });
}

/**
 * Authorized Agent Operation Entry Point for Hook Status Query.
 */
export async function runSandboxedHookStatus(
  context: AgentSafetyContext,
  targetUserId: string,
  projectRoot?: string,
  dbClient?: any
): Promise<AgentOperationResult<GitHookStatusResult>> {
  const operationName = "workspace.hook.status";

  return await executeAgentOperation<{ projectRoot?: string }, GitHookStatusResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: { projectRoot },
    targetUserId,
    dbClient,
    executor: async () => {
      return await getPreCommitHookStatus(projectRoot || process.cwd());
    },
  });
}
