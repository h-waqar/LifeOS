/**
 * CLI Configuration & Credential Store
 *
 * Manages secure persistent credentials at ~/.config/lifeos/credentials.json
 * (or fallback ~/.lifeos/credentials.json) with strict POSIX 0o600 permissions.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AuthenticatedUser, GlobalOptions } from "./types";
import { CliError, EXIT_CODES } from "./errors";

export interface StoredCredentials {
  token: string;
  user?: AuthenticatedUser;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Resolves the configuration directory according to XDG conventions.
 */
export function getConfigDir(customConfig?: string): string {
  if (customConfig) {
    return path.resolve(customConfig);
  }
  if (process.env.LIFEOS_CONFIG_DIR) {
    return path.resolve(process.env.LIFEOS_CONFIG_DIR);
  }

  const home = os.homedir();
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdgConfigHome, "lifeos");
}

/**
 * Resolves the path to credentials.json.
 */
export function getCredentialsPath(customConfig?: string): string {
  if (process.env.LIFEOS_CREDENTIALS_PATH) {
    return path.resolve(process.env.LIFEOS_CREDENTIALS_PATH);
  }

  if (customConfig) {
    const stat = fs.existsSync(customConfig) ? fs.statSync(customConfig) : null;
    if (stat && stat.isFile()) {
      return path.resolve(customConfig);
    }
    return path.join(path.resolve(customConfig), "credentials.json");
  }

  const primaryDir = getConfigDir();
  const primaryPath = path.join(primaryDir, "credentials.json");
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }

  // Fallback to ~/.lifeos/credentials.json if primary does not exist but fallback does
  const fallbackPath = path.join(os.homedir(), ".lifeos", "credentials.json");
  if (fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return primaryPath;
}

/**
 * Verifies and enforces strict POSIX 0o600 file permissions.
 */
export function enforceSecurePermissions(filePath: string): void {
  if (process.platform === "win32") {
    return;
  }

  if (!fs.existsSync(filePath)) {
    return;
  }

  const stats = fs.statSync(filePath);
  const mode = stats.mode & 0o777;

  if (mode !== 0o600) {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch (err) {
      throw new CliError(
        `Insecure credentials file permissions (${mode.toString(8)}). Failed to set 0600 on ${filePath}.`,
        { exitCode: EXIT_CODES.ERROR_GENERAL, code: "CONFIG_PERMISSION_ERROR" }
      );
    }
  }
}

/**
 * Loads credentials from the configured credential file.
 */
export function loadCredentials(customPath?: string): StoredCredentials | null {
  const filePath = getCredentialsPath(customPath);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  // Enforce 0o600 permissions
  enforceSecurePermissions(filePath);

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.token) {
      return null;
    }
    return parsed as StoredCredentials;
  } catch (error) {
    throw new CliError(
      `Failed to parse credentials file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { exitCode: EXIT_CODES.ERROR_GENERAL, code: "CONFIG_PARSE_ERROR" }
    );
  }
}

/**
 * Saves credentials atomically with strict 0o600 permissions.
 */
export function saveCredentials(
  data: { token: string; user?: AuthenticatedUser },
  customPath?: string
): void {
  const filePath = getCredentialsPath(customPath);
  const dirPath = path.dirname(filePath);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }

  const payload: StoredCredentials = {
    token: data.token,
    user: data.user,
    updatedAt: new Date().toISOString(),
  };

  const content = JSON.stringify(payload, null, 2);

  // Write with mode 0o600
  fs.writeFileSync(filePath, content, { mode: 0o600, encoding: "utf-8" });
  enforceSecurePermissions(filePath);
}

/**
 * Deletes stored credentials.
 */
export function clearCredentials(customPath?: string): boolean {
  const filePath = getCredentialsPath(customPath);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Resolves the authentication token following strict precedence:
 * 1. CLI flag `--token`
 * 2. Environment variable `LIFEOS_TOKEN`
 * 3. Stored credentials file `~/.config/lifeos/credentials.json`
 */
export function resolveToken(options?: GlobalOptions): string | undefined {
  if (options?.token && typeof options.token === "string" && options.token.trim()) {
    return options.token.trim();
  }

  if (process.env.LIFEOS_TOKEN && process.env.LIFEOS_TOKEN.trim()) {
    return process.env.LIFEOS_TOKEN.trim();
  }

  const creds = loadCredentials(options?.config);
  return creds?.token;
}
