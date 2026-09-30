# Plan 03-03 Summary: PostgreSQL Full-Text Search Across All Entities & Global Command Palette Integration

- **Phase:** 03 — Knowledge, Learning & Relationships
- **Plan Identification:** 03-03
- **Domain:** PostgreSQL-native Full-Text & Trigram Search, Cross-Domain Search Service, and Global Command Palette Integration
- **Status:** Complete
- **Date Completed:** 2026-09-22
- **Requirements Satisfied:** `NOTE-05` (Instant full-text search across notes, tasks, projects, goals, and people using PostgreSQL full-text indexing), `SHELL-02` (Enhanced Command Palette with cross-domain search)

---

## 1. Executive Summary

Plan 03-03 delivered native, production-grade PostgreSQL full-text and fuzzy trigram search across all 5 implemented vertical-slice entities in LifeOS:
1. **Notes** (titles, content, tags)
2. **Tasks** (titles, descriptions, tags)
3. **Projects** (names, descriptions)
4. **Goals** (titles, descriptions)
5. **People** (names, companies, roles, contact notes, email, tags)

The capability is exposed via a unified, multi-tenant protected REST endpoint (`GET /api/search`) and deeply integrated into the global **Command Palette** (`Cmd+K` / `Ctrl+K`) with debouncing, cross-domain grouping, loading/empty/error states, and deep linking (`?id=`) directly into target views.

---

## 2. Key Deliverables & Architecture

### 2.1 Database Migration & Indexing (`0014_postgresql_full_text_search.sql`)
- **PostgreSQL Extension**: Enabled `pg_trgm` extension for trigram fuzzy matching, substring matching, and typo tolerance.
- **GIN Trigram Indexes (`gin_trgm_ops`)**:
  - `notes_title_trgm_idx` on `notes(title)`
  - `tasks_title_trgm_idx` on `tasks(title)`
  - `projects_name_trgm_idx` on `projects(name)`
  - `goals_title_trgm_idx` on `goals(title)`
  - `people_name_trgm_idx` on `people(name)`
  - `people_company_trgm_idx` on `people(company)`
- **GIN Full-Text Functional Indexes (`to_tsvector('english', ...)`):**
  - `notes_fts_idx` on `notes`
  - `tasks_fts_idx` on `tasks`
  - `projects_fts_idx` on `projects`
  - `goals_fts_idx` on `goals`
  - `people_fts_idx` on `people`
- Migration registered in `meta/_journal.json` and cleanly applied via `npm run db:migrate`.

### 2.2 Search Service (`src/server/search/service.ts`)
- **PostgreSQL Primitives**: Combines `websearch_to_tsquery('english', q)` full-text search and `ts_rank_cd` ranking with `pg_trgm`'s `word_similarity`, trigram similarity, and `ILIKE` substring matching.
- **Composite Scoring Algorithm**:
  - Exact title match: +10.0
  - Prefix match (`title ILIKE q%`): +5.0
  - Substring match (`title ILIKE %q%`): +2.0
  - Trigram & word similarity: `GREATEST(similarity, word_similarity) * 3.0`
  - FTS relevance rank: `ts_rank_cd(...) * 4.0`
- **Strict Multi-Tenant Isolation & Soft-Delete Invariants**:
  - Scoped to `user_id = authenticated_user.id`.
  - Excludes archived notes (`is_archived = false`), cancelled tasks (`status != 'cancelled'`), archived projects (`status != 'archived'`), archived goals (`status != 'archived'`), and archived people (`is_archived = false`).
- **Normalized Response DTO**:
  - `SearchResultItem`: `id`, `type`, `title`, `subtitle`, `snippet`, `href`, `score`, `metadata`, `updatedAt`.
  - `SearchResponseDTO`: `query`, `results`, `total`, `byType`.

### 2.3 REST API (`src/app/api/search/route.ts`)
- `GET /api/search` with `requireAuthenticatedUser`.
- Validates query with Zod (`searchQuerySchema`): `q` (required, 1–200 chars), `type` (optional filter: `note`, `task`, `project`, `goal`, `person`, `all`), `limit` (default 20, max 100).
- Sets strict HTTP security cache headers (`no-store, no-cache`).

### 2.4 Command Palette Integration (`src/components/command-palette.tsx`)
- **Debounced Execution**: Input changes debounced by 200ms before querying `/api/search`.
- **Cross-Domain Grouping**: Renders results organized by type with distinct Lucide icons and type badges (`note`, `task`, `project`, `goal`, `person`).
- **Deep Linking**: Selecting an item navigates to `item.href` (`/notes?id=`, `/tasks?id=`, `/projects?id=`, `/goals?id=`, `/people?id=`) and auto-selects or opens the item's modal/editor.
- **Loading & Empty States**: Interactive spinner during search; clear "No results found for '...'" messaging.
- **Preserved Existing Commands**: Navigation, quick actions (Morning Routine, Evening Review, Create Habit, Toggle Theme, Sign Out) remain fully accessible and filtered seamlessly.

---

## 3. Test Execution & Verification Summary

| Suite | Scope | Target | Result |
|---|---|---|---|
| **Search Validation Unit Tests** | Zod schemas, limits, snippet extraction | `scripts/tests/phase-03/plan-03/search-validation.test.ts` | **13/13 passed** |
| **Command Palette Component Tests** | Debounce, grouped rendering, deep link navigation, empty/error states | `scripts/tests/phase-03/plan-03/command-palette-search.test.tsx` | **6/6 passed** |
| **Search Engine Integration Tests** | Live PostgreSQL FTS, word_similarity, multi-tenant isolation, archive exclusion, ranking | `scripts/tests/phase-03/plan-03/search-engine.integration.test.ts` | **9/9 passed** |
| **Search API Integration Tests** | Auth guard, input validation, 200 response envelope, type filtering | `scripts/tests/phase-03/plan-03/search-api.integration.test.ts` | **6/6 passed** |
| **Plan 03-03 Targeted Tests** | All Plan 03-03 unit & integration tests | `scripts/tests/phase-03/plan-03/` | **34/34 passed** |
| **Full Unit Regression Suite** | Entire repository unit test suite | `npm test` | **606/606 passed** (51 test files) |
| **Full Integration Regression Suite**| Entire repository integration test suite (live DB) | `npm run test:integration` | **438/438 passed** (42 test files) |
| **Total Test Suite** | All unit and integration tests combined | Entire repository | **1,044/1,044 passed** |
| **TypeScript Compilation** | Whole codebase type safety (`noImplicitAny`) | `npx tsc --noEmit` | **0 errors** |
| **Production Build** | Next.js 15 App Router bundle & static generation | `npm run build` | **Clean build** |

---

## 4. Requirements Traceability Matrix

| Requirement | Description | Implementation Artifacts | Verification Evidence |
|---|---|---|---|
| **NOTE-05** | Instant full-text search across all notes, tasks, projects, goals, and people using PostgreSQL full-text indexing | `src/server/db/migrations/0014_postgresql_full_text_search.sql`<br>`src/server/search/service.ts`<br>`src/server/search/validation.ts`<br>`src/app/api/search/route.ts` | `search-engine.integration.test.ts` (9 tests)<br>`search-api.integration.test.ts` (6 tests)<br>`search-validation.test.ts` (13 tests) |
| **SHELL-02** | Global Command Palette with cross-domain search and entity navigation | `src/components/command-palette.tsx`<br>`src/app/notes/page.tsx`<br>`src/app/people/page.tsx`<br>`src/app/tasks/page.tsx`<br>`src/app/projects/page.tsx`<br>`src/app/goals/page.tsx` | `command-palette-search.test.tsx` (6 tests)<br>Browser & build validation |

---

## 5. Non-Blocking Informational Observations

1. **pg_trgm word_similarity operator**: Sentence/phrase titles match typo-tolerant queries via `pg_trgm`'s `word_similarity` and `<%` operator, ensuring long titles match short single-word searches with high relevance.
2. **Next.js Suspense with CSR bailout**: Next.js App Router enforces that components reading `useSearchParams()` must be wrapped in a `<Suspense>` boundary; `PeoplePage` was wrapped accordingly to ensure smooth static page generation during production build.
