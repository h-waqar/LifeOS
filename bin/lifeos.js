#!/usr/bin/env node

/**
 * LifeOS Standalone CLI Runner
 *
 * Cross-platform executable wrapper.
 * Sets NODE_NO_WARNINGS=1, resolves tsx, forwards signals and streams,
 * and preserves POSIX exit codes.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const entryTs = resolve(__dirname, "lifeos.ts");

// Locate local or global tsx executable
let tsxPath = resolve(projectRoot, "node_modules/.bin/tsx");
if (!fs.existsSync(tsxPath)) {
  tsxPath = "tsx";
}

const env = {
  ...process.env,
  NODE_NO_WARNINGS: "1",
};

const result = spawnSync(tsxPath, [entryTs, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

if (result.error) {
  process.stderr.write(`Failed to execute LifeOS CLI runner: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 0);
