/**
 * CLI Error Handling, Exit Code Mapping & Secret Scrubbing
 *
 * Enforces deterministic POSIX exit codes, structured error representations,
 * and automatic redaction of sensitive credentials (tokens, passwords, secrets).
 */

import { ZodError } from "zod";
import { EXIT_CODES, type ExitCode } from "./types";
export { EXIT_CODES, type ExitCode };

export class CliError extends Error {
  readonly exitCode: ExitCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options?: { exitCode?: ExitCode; code?: string; details?: unknown }
  ) {
    super(message);
    this.name = "CliError";
    this.exitCode = options?.exitCode ?? EXIT_CODES.ERROR_GENERAL;
    this.code = options?.code ?? "ERROR_GENERAL";
    this.details = options?.details;
  }
}

export class UsageError extends CliError {
  constructor(message: string, details?: unknown) {
    super(message, {
      exitCode: EXIT_CODES.ERROR_VALIDATION,
      code: "USAGE_ERROR",
      details,
    });
    this.name = "UsageError";
  }
}

export class ValidationError extends CliError {
  constructor(message: string, details?: unknown) {
    super(message, {
      exitCode: EXIT_CODES.ERROR_VALIDATION,
      code: "VALIDATION_ERROR",
      details,
    });
    this.name = "ValidationError";
  }
}

export class AuthError extends CliError {
  constructor(message = "Authentication required. Missing, invalid, or expired session.") {
    super(message, {
      exitCode: EXIT_CODES.ERROR_AUTH,
      code: "AUTH_ERROR",
    });
    this.name = "AuthError";
  }
}

export class NotFoundError extends CliError {
  constructor(message = "Requested resource not found.") {
    super(message, {
      exitCode: EXIT_CODES.ERROR_NOT_FOUND,
      code: "NOT_FOUND",
    });
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends CliError {
  constructor(message = "Access denied. Resource does not belong to the authenticated user.") {
    super(message, {
      exitCode: EXIT_CODES.ERROR_NOT_FOUND, // Per spec: exits 4 for ownership/resource isolation or not found
      code: "FORBIDDEN",
    });
    this.name = "ForbiddenError";
  }
}

/**
 * Secret scrubbing regex patterns to ensure credentials never leak into stdout/stderr/logs.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /((?:bearer\s+|token[:=]\s*["']?|token\s+)[a-zA-Z0-9_\-\.]{12,})/gi,
  /(better-auth\.session_token=)([^;,\s]+)/gi,
  /(password[:=]\s*["']?)([^"'\s,;]+)(["']?)/gi,
  /(secret[:=]\s*["']?)([^"'\s,;]+)(["']?)/gi,
  /([a-zA-Z0-9_\-]{24,}:[a-zA-Z0-9_\-]{24,})/g, // Basic auth or composite secrets
];

/**
 * Scrubs all tokens, passwords, session cookies, and secrets from a string.
 */
export function scrubSecrets(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  let scrubbed = input;
  // Redact session cookies
  scrubbed = scrubbed.replace(/(better-auth\.session_token=)([^;,\s]+)/gi, "$1***REDACTED***");
  // Redact database and URL credentials (e.g. postgres://user:password@host)
  scrubbed = scrubbed.replace(/((?:postgres|postgresql|mysql|mongodb|redis|http|https):\/\/[^:\s]+:)([^@\s]+)(@)/gi, "$1***REDACTED***$3");
  // Redact API keys and encryption keys
  scrubbed = scrubbed.replace(/((?:api[_-]?key|encryption[_-]?key|secret[_-]?key)\s*[:=]\s*["']?)([^"'\s,;]+)(["']?)/gi, "$1***REDACTED***$3");
  // Redact passwords (e.g. password: "...", password = "...", password MyPassword!)
  scrubbed = scrubbed.replace(
    /((?:--)?password(?:\s*[:=]\s*|\s+(?!must\b|is\b|was\b|can\b|cannot\b|should\b|will\b|to\b|and\b|or\b|not\b|reset\b|change\b|policy\b|rules\b|hash\b|length\b|field\b|argument\b|flag\b|required\b|provided\b))["']?)([^\s"',;]+)(["']?)/gi,
    "$1***REDACTED***$3"
  );
  // Redact secrets
  scrubbed = scrubbed.replace(
    /((?:--)?secret(?:\s*[:=]\s*|\s+(?!must\b|is\b|was\b|can\b|cannot\b|should\b|will\b|to\b|and\b|or\b|not\b|reset\b|change\b|policy\b|rules\b|hash\b|length\b|field\b|argument\b|flag\b|required\b|provided\b))["']?)([^\s"',;]+)(["']?)/gi,
    "$1***REDACTED***$3"
  );
  // Redact 64-character hex encryption keys (e.g. LIFEOS_ENCRYPTION_KEY)
  scrubbed = scrubbed.replace(/\b[a-f0-9]{64}\b/gi, "***REDACTED***");
  // Redact bearer tokens
  scrubbed = scrubbed.replace(/(bearer\s+)([a-zA-Z0-9_\-\.]{10,})/gi, "$1***REDACTED***");
  // Redact token values in JSON or key-values
  scrubbed = scrubbed.replace(/("token"\s*:\s*")([^"]+)(")/gi, '$1***REDACTED***$3');
  scrubbed = scrubbed.replace(/(token\s*=\s*)([^\s&;]+)/gi, "$1***REDACTED***");

  return scrubbed;
}

/**
 * Maps any thrown error (canonical domain error, ZodError, or generic) into a structured CLI error.
 */
export function resolveCliError(error: unknown): {
  exitCode: ExitCode;
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof CliError) {
    return {
      exitCode: error.exitCode,
      code: error.code,
      message: scrubSecrets(error.message),
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    const formattedIssues = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));
    return {
      exitCode: EXIT_CODES.ERROR_VALIDATION,
      code: "VALIDATION_ERROR",
      message: scrubSecrets(`Validation failed: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`),
      details: formattedIssues,
    };
  }

  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    const name = String(err.name || "");
    const code = String(err.code || "");
    const status = Number(err.status || 0);
    const message = scrubSecrets(String(err.message || "An unexpected error occurred."));

    if (name === "AuthenticationError" || code === "UNAUTHORIZED" || status === 401) {
      return {
        exitCode: EXIT_CODES.ERROR_AUTH,
        code: "AUTH_ERROR",
        message: message || "Authentication required. Active session is missing, invalid, or expired.",
      };
    }

    if (name === "AuthorizationError" || code === "FORBIDDEN" || status === 403) {
      return {
        exitCode: EXIT_CODES.ERROR_NOT_FOUND,
        code: "FORBIDDEN",
        message: message || "Access denied. Resource does not belong to the authenticated user.",
      };
    }

    if (name === "NotFoundError" || code === "NOT_FOUND" || status === 404) {
      return {
        exitCode: EXIT_CODES.ERROR_NOT_FOUND,
        code: "NOT_FOUND",
        message: message || "Resource not found.",
      };
    }

    if (code === "USAGE_ERROR" || name === "UsageError") {
      return {
        exitCode: EXIT_CODES.ERROR_VALIDATION,
        code: "USAGE_ERROR",
        message,
        details: err.details,
      };
    }

    return {
      exitCode: EXIT_CODES.ERROR_GENERAL,
      code: code || "ERROR_GENERAL",
      message,
      details: err.details,
    };
  }

  return {
    exitCode: EXIT_CODES.ERROR_GENERAL,
    code: "ERROR_GENERAL",
    message: scrubSecrets(String(error)),
  };
}

/**
 * Recursively sorts keys for deterministic JSON serialization.
 */
export function serializeDeterministic(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(serializeDeterministic);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = serializeDeterministic(record[key]);
  }
  return sorted;
}

export function formatDeterministicJson(data: unknown): string {
  return scrubSecrets(JSON.stringify(serializeDeterministic(data), null, 2));
}

/**
 * Formats a resolved CLI error for stdout (--json) or stderr (default).
 */
export function formatCliError(
  error: unknown,
  isJson: boolean
): {
  exitCode: ExitCode;
  output: string;
  isJson: boolean;
} {
  const resolved = resolveCliError(error);

  if (isJson) {
    const errorObj = {
      success: false,
      error: {
        code: resolved.code,
        message: resolved.message,
        ...(resolved.details !== undefined ? { details: resolved.details } : {}),
      },
    };
    return {
      exitCode: resolved.exitCode,
      output: formatDeterministicJson(errorObj),
      isJson: true,
    };
  }

  let formatted = `Error [${resolved.code}]: ${resolved.message}`;
  if (resolved.details && Array.isArray(resolved.details)) {
    for (const item of resolved.details) {
      if (item && typeof item === "object" && "field" in item && "message" in item) {
        formatted += `\n  - ${item.field}: ${item.message}`;
      }
    }
  }

  return {
    exitCode: resolved.exitCode,
    output: formatted,
    isJson: false,
  };
}
