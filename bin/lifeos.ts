#!/usr/bin/env tsx
/**
 * LifeOS CLI TypeScript Executable Entry Point
 */

import { main } from "../src/cli/index";

main(process.argv.slice(2))
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    console.error("Fatal CLI execution error:", err);
    process.exit(1);
  });
