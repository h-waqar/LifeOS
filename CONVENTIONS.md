# Coding & Repository Conventions

## Test File Organization & Clean Repository Structure

- **Location Requirement**: All test files (unit, integration, boundary, and end-to-end) MUST be placed in `scripts/tests/{phase}/{plan}/...` (e.g. `scripts/tests/phase-01/plan-01/crypto.test.ts`).
- **Clean `src/` Rule**: Test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`) MUST NEVER be co-located inside `src/`. The `src/` directory is strictly reserved for production application code (`app/`, `components/`, `features/`, `lib/`, `server/`).
- **Imports in Tests**: Tests import application code using the `@/*` path alias mapping to `./src/*` (e.g. `import { encryptSecret } from "@/lib/crypto"`).
- **Execution & Discovery**: Vitest is configured to discover and execute all tests matching `scripts/tests/**/*.test.ts` and `scripts/tests/**/*.test.tsx`.
