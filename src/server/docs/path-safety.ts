/**
 * Documentation Path Safety & Sandbox Shield
 *
 * Implements SKILL-03 / T-12-04: Strict filesystem containment preventing
 * path traversal, null byte injections, URL-encoded traversals, and symlink escapes.
 */

import fs from "node:fs";
import path from "node:path";
import { NotFoundError, UsageError } from "@/cli/errors";

export const ALLOWED_DOC_ROOTS = ["docs", ".planning", "skills"] as const;

export interface SafeDocPathResult {
  absolutePath: string;
  relativePath: string;
}

/**
 * Resolves and strictly verifies that a requested document path is contained
 * within allowed repository documentation roots (docs/, .planning/, skills/).
 * Fails closed on any traversal attack or symlink escape.
 */
export function resolveSafeDocPath(
  requestedPath: string,
  projectRoot: string = process.cwd()
): SafeDocPathResult {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) {
    throw new UsageError("Document path cannot be empty.");
  }

  // 1. Detect null byte injections
  if (requestedPath.includes("\0") || requestedPath.includes("%00")) {
    throw new UsageError("Security violation: Path traversal outside documentation root rejected.");
  }

  // 2. Decode URL-encoded sequences to detect encoded traversals (e.g. %2e%2e%2f)
  let decoded = requestedPath;
  try {
    decoded = decodeURIComponent(requestedPath);
  } catch {
    throw new UsageError("Security violation: Path traversal outside documentation root rejected.");
  }

  if (decoded.includes("\0")) {
    throw new UsageError("Security violation: Path traversal outside documentation root rejected.");
  }

  // 3. Normalize slashes and check for backslashes or suspicious traversal tokens
  const cleanCandidate = decoded.replace(/\\/g, "/");

  // Reject absolute paths that attempt to target root directly (e.g. /etc/passwd)
  const canonicalProjectRoot = path.resolve(projectRoot);

  // Compute resolved target path
  let resolvedTarget: string;
  if (path.isAbsolute(cleanCandidate)) {
    resolvedTarget = path.normalize(cleanCandidate);
  } else {
    resolvedTarget = path.resolve(canonicalProjectRoot, cleanCandidate);
  }

  // 4. Compute allowed root canonical paths
  const allowedCanonicalRoots = ALLOWED_DOC_ROOTS.map((root) =>
    path.resolve(canonicalProjectRoot, root)
  );

  // Verify that the resolved target path starts with at least one allowed root prefix
  const isWithinAllowedRootsBeforeSymlink = allowedCanonicalRoots.some(
    (rootPath) => resolvedTarget === rootPath || resolvedTarget.startsWith(rootPath + path.sep)
  );

  if (!isWithinAllowedRootsBeforeSymlink) {
    throw new UsageError("Security violation: Path traversal outside documentation root rejected.");
  }

  // 5. Verify file exists on disk
  if (!fs.existsSync(resolvedTarget)) {
    const rel = path.relative(canonicalProjectRoot, resolvedTarget).replace(/\\/g, "/");
    throw new NotFoundError(`Document not found: ${rel}`);
  }

  // 6. Check realpath (resolve symlinks) to protect against symlink escapes
  let realTarget: string;
  try {
    realTarget = fs.realpathSync(resolvedTarget);
  } catch (err) {
    const rel = path.relative(canonicalProjectRoot, resolvedTarget).replace(/\\/g, "/");
    throw new NotFoundError(`Document not found: ${rel}`);
  }

  // Check allowed canonical roots after realpath resolution
  const isWithinAllowedRootsAfterSymlink = allowedCanonicalRoots.some((rootPath) => {
    let realRoot: string;
    try {
      realRoot = fs.existsSync(rootPath) ? fs.realpathSync(rootPath) : rootPath;
    } catch {
      realRoot = rootPath;
    }
    return realTarget === realRoot || realTarget.startsWith(realRoot + path.sep);
  });

  if (!isWithinAllowedRootsAfterSymlink) {
    throw new UsageError("Security violation: Path traversal outside documentation root rejected.");
  }

  // 7. Verify target is a regular file
  const stat = fs.statSync(realTarget);
  if (!stat.isFile()) {
    const rel = path.relative(canonicalProjectRoot, resolvedTarget).replace(/\\/g, "/");
    throw new NotFoundError(`Target is not a regular file: ${rel}`);
  }

  const relativePath = path.relative(canonicalProjectRoot, resolvedTarget).replace(/\\/g, "/");

  return {
    absolutePath: realTarget,
    relativePath,
  };
}
