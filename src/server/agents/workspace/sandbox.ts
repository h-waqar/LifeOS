/**
 * Project Workspace Isolation Sandbox
 *
 * Requirements:
 * - WORK-01: Agent development execution is restricted to project root directory.
 * - Path containment enforcement rejecting traversal, null bytes, encoded traversals,
 *   absolute external paths, and symlink escapes.
 * - Fail-closed nearest-ancestor canonicalization for nonexistent paths.
 */

import fs from "fs";
import path from "path";
import {
  type SandboxPathResolution,
  WorkspaceSecurityError,
} from "./types";

let cachedProjectRoot: string | null = null;

/**
 * Returns the canonical real path of the repository project root.
 * If customRoot is supplied (e.g. in hermetic test suites), it is canonicalized and validated.
 */
export function getCanonicalProjectRoot(customRoot?: string): string {
  if (customRoot) {
    try {
      return fs.realpathSync(path.resolve(customRoot));
    } catch (err: any) {
      throw new WorkspaceSecurityError(
        `Failed to resolve canonical custom root: ${err.message}`,
        "INVALID_PROJECT_ROOT"
      );
    }
  }

  if (cachedProjectRoot) {
    return cachedProjectRoot;
  }

  try {
    cachedProjectRoot = fs.realpathSync(process.cwd());
    return cachedProjectRoot;
  } catch (err: any) {
    throw new WorkspaceSecurityError(
      `Failed to resolve canonical project root from current working directory: ${err.message}`,
      "INVALID_PROJECT_ROOT"
    );
  }
}

/**
 * Resets the cached project root (primarily for testing purposes).
 */
export function resetProjectRootCache(): void {
  cachedProjectRoot = null;
}

/**
 * Validates path-relative containment semantics.
 * Never uses string prefix matching (which would falsely treat /project-evil as inside /project).
 */
export function isPathContained(sandboxRoot: string, targetPath: string): boolean {
  const rel = path.relative(sandboxRoot, targetPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Detects URL-encoded, double-encoded, or malformed traversal attacks.
 */
function containsEncodedTraversal(rawInput: string): boolean {
  if (!rawInput.includes("%")) {
    return false;
  }

  // Fast check for common percent-encoded tokens
  const lower = rawInput.toLowerCase();
  if (
    lower.includes("%2e") ||
    lower.includes("%2f") ||
    lower.includes("%5c") ||
    lower.includes("%00") ||
    lower.includes("%25")
  ) {
    return true;
  }

  // Multi-pass iterative decoding check
  let current = rawInput;
  for (let pass = 0; pass < 3; pass++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded !== current) {
        if (
          decoded.includes("\0") ||
          decoded.includes("..") ||
          decoded.includes("/") ||
          decoded.includes("\\")
        ) {
          return true;
        }
        current = decoded;
      } else {
        break;
      }
    } catch {
      // Malformed encoding in input -> fail closed
      return true;
    }
  }

  return false;
}

/**
 * Resolves a requested path against the sandbox root, validating containment,
 * symlinks, and nonexistent descendant paths.
 */
export function resolveSandboxPath(
  requestedPath: string,
  sandboxRootOverride?: string
): SandboxPathResolution {
  try {
    if (typeof requestedPath !== "string") {
      return {
        valid: false,
        error: "Requested path must be a string",
      };
    }

    // 1. Reject null bytes immediately
    if (requestedPath.includes("\0")) {
      return {
        valid: false,
        error: "Path contains forbidden null byte",
      };
    }

    // 2. Reject URL-encoded / double-encoded traversal
    if (containsEncodedTraversal(requestedPath)) {
      return {
        valid: false,
        error: "Path contains forbidden encoded traversal sequences",
      };
    }

    // 3. Reject raw backslash traversal
    if (requestedPath.includes("..\\") || requestedPath.includes("\\..")) {
      return {
        valid: false,
        error: "Path contains forbidden backslash traversal sequences",
      };
    }

    const sandboxRoot = getCanonicalProjectRoot(sandboxRootOverride);

    // 4. Resolve full path
    const trimmed = requestedPath.trim();
    const effectivePath = trimmed === "" ? "." : trimmed;

    const fullPath = path.isAbsolute(effectivePath)
      ? path.resolve(effectivePath)
      : path.resolve(sandboxRoot, effectivePath);

    // Check textual containment before touching filesystem
    if (!isPathContained(sandboxRoot, fullPath)) {
      return {
        valid: false,
        error: `Requested path '${requestedPath}' escapes sandbox root '${sandboxRoot}'`,
      };
    }

    // 5. Existing target resolution
    if (fs.existsSync(fullPath)) {
      let canonicalTarget: string;
      try {
        canonicalTarget = fs.realpathSync(fullPath);
      } catch (err: any) {
        return {
          valid: false,
          error: `Failed to canonicalize path '${fullPath}': ${err.message}`,
        };
      }

      if (!isPathContained(sandboxRoot, canonicalTarget)) {
        return {
          valid: false,
          error: `Symlink escape detected: '${requestedPath}' resolves to external path '${canonicalTarget}'`,
        };
      }

      return {
        valid: true,
        canonicalPath: canonicalTarget,
        relativePath: path.relative(sandboxRoot, canonicalTarget),
      };
    }

    // 6. Nonexistent target resolution: walk up to nearest existing ancestor
    let current = fullPath;
    const missingSegments: string[] = [];

    while (current !== path.dirname(current)) {
      const parent = path.dirname(current);
      missingSegments.unshift(path.basename(current));

      if (fs.existsSync(parent)) {
        let canonicalParent: string;
        try {
          canonicalParent = fs.realpathSync(parent);
        } catch (err: any) {
          return {
            valid: false,
            error: `Failed to canonicalize ancestor '${parent}': ${err.message}`,
          };
        }

        if (!isPathContained(sandboxRoot, canonicalParent)) {
          return {
            valid: false,
            error: `Ancestor symlink escape: ancestor of '${requestedPath}' resolves outside sandbox to '${canonicalParent}'`,
          };
        }

        const reconstructed = path.resolve(canonicalParent, ...missingSegments);
        if (!isPathContained(sandboxRoot, reconstructed)) {
          return {
            valid: false,
            error: `Nonexistent descendant '${requestedPath}' escapes sandbox root`,
          };
        }

        return {
          valid: true,
          canonicalPath: reconstructed,
          relativePath: path.relative(sandboxRoot, reconstructed),
        };
      }

      current = parent;
    }

    return {
      valid: false,
      error: `No existing ancestor found for path '${requestedPath}'`,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message ?? "Unknown sandbox path resolution error",
    };
  }
}

/**
 * Asserts that a requested path is safe and contained within the sandbox root.
 * Returns the canonical path or throws WorkspaceSecurityError.
 */
export function assertSandboxPath(
  requestedPath: string,
  sandboxRootOverride?: string
): string {
  const result = resolveSandboxPath(requestedPath, sandboxRootOverride);
  if (!result.valid || !result.canonicalPath) {
    throw new WorkspaceSecurityError(
      result.error || `Sandbox access denied for path: '${requestedPath}'`,
      "SANDBOX_CONTAINMENT_VIOLATION"
    );
  }
  return result.canonicalPath;
}
