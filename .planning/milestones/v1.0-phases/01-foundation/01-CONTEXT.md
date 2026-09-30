# Phase 1: Foundation - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the foundational architectural skeleton and security infrastructure for LifeOS as a single-user personal operating system:
- Next.js 15 App Router project structure with React 19, TypeScript (strict mode, noImplicitAny), Tailwind CSS, and shadcn/ui.
- PostgreSQL 16+ database integration using Drizzle ORM and Drizzle Kit migrations, strictly adhering to the vertical-slice database rule: foundational schema only (`users`, `sessions` / Better Auth tables, `user_preferences`, `audit_log`). Domain tables (tasks, projects, goals, notes, finances, etc.) are strictly prohibited upfront.
- Better Auth authentication system with secure HTTP-only cookies, session persistence, passkey (WebAuthn) support, and CLI recovery.
- Server-side resource ownership authorization layer that enforces resource ownership using the authenticated user's `user_id` on all server actions and API routes, maintaining strict separation from authentication.
- AES-256-GCM encryption at rest for sensitive credentials and tokens using an environment-provided master key.
- Responsive application navigation shell with a collapsible icon-rail sidebar, theme switching, global command palette (`cmdk`), and shortcut cheatsheet.
- In-app audit log viewer and preferences settings page.

</domain>

<decisions>
## Implementation Decisions

### First-Run Setup & Authentication Lockdown
- **D-01:** Single-user auto-lock — The first account created via `/signup` claims ownership of LifeOS and permanently closes public registration (subsequent signup attempts receive 403 Forbidden). — **Reversibility:** costly — changing signup locking logic requires modifying auth middleware and registration guard state.
- **D-02:** Auth credentials — Email & Password plus Passkey/WebAuthn (biometric TouchID/FaceID/security keys with password fallback) supported via Better Auth plugins. — **Reversibility:** costly — adds passkey database tables and credentials schema.
- **D-03:** Session persistence — 30-day sliding session policy renewed automatically on activity, stored via secure HTTP-only cookies. — **Reversibility:** reversible — session TTL is configured in Better Auth options.
- **D-04:** Account recovery — CLI recovery command (`pnpm auth:reset`) plus one-time emergency recovery codes generated during onboarding, eliminating any hard dependency on third-party SMTP/email providers for self-hosted single-tenant operation. — **Reversibility:** reversible — local CLI script operating against database.

### Design System Aesthetic & UI Density
- **D-05:** Visual tone & density — High-density dark cockpit inspired by Linear and Raycast (compact padding, subtle 1px zinc borders, high data density, neutral dark palette with crisp status accents). — **Reversibility:** costly — changing base padding/typography styles affects all components across the system.
- **D-06:** Default theme & mode switching — Dark mode by default, with instant toggle to Light or System preference, stored in user preferences in DB and synced via cookie to eliminate SSR flicker. — **Reversibility:** reversible — theme provider handles theme tokens and cookie sync.
- **D-07:** Typography pairing — Geist Sans for UI text and Geist Mono for monospace data, code, IDs, and tabular numbers. — **Reversibility:** reversible — configured in Tailwind font family tokens and Next.js font loader.
- **D-08:** Toast & alert feedback — Sonner stacked toast notifications with micro-animations, action buttons, and keyboard dismiss. — **Reversibility:** reversible — standardized toast component.

### Navigation Shell & Command Palette (Cmd+K)
- **D-09:** Sidebar layout & behavior — Collapsible sidebar supporting dual state: expanded menu (grouped domain sections, labels, status badges) and compact icon-only rail, with `Cmd+B` / `Ctrl+B` toggle shortcut. — **Reversibility:** reversible — layout component state and local storage preference.
- **D-10:** Command Palette architecture — `cmdk` headless primitive (shadcn Command engine) with fuzzy searching, grouped sections, arrow navigation, and nested sub-pages. — **Reversibility:** reversible — isolated in command palette dialog component.
- **D-11:** Phase 1 Command Palette scope — System actions & route navigation with an extensible action registry (page navigation, theme toggle, sidebar toggle, logout, plus modular action registration hook ready for Phase 2+ domain actions). — **Reversibility:** reversible — action registry hook architecture.
- **D-12:** Keyboard shortcut system — Standard modifier shortcuts (`Cmd+K` for command palette, `Cmd+B` for sidebar toggle) plus a `?` / `Cmd+/` Keyboard Shortcuts cheatsheet modal. — **Reversibility:** reversible — global keyboard listener hook.

### Audit Logging & Encryption Key Setup
- **D-13:** Encryption key management (SEC-01) — 32-byte master encryption key provided via `LIFEOS_ENCRYPTION_KEY` environment variable, validated at server startup via Zod fail-fast check (AES-256-GCM encryption at rest). — **Reversibility:** one-way — changing encryption key structure requires migrating all encrypted ciphertexts in the database.
- **D-14:** Audit log event scope (SEC-02) — Immutable `audit_log` table capturing: Authentication events (logins, logouts, failed attempts), Security configuration changes (credential updates, session revocation), and Entity mutations (with actor `user_id`, timestamp, action, IP, user-agent, and details JSON). — **Reversibility:** costly — database schema and audit middleware call sites.
- **D-15:** Audit log viewer UI (SHELL-04) — Interactive data table at `/settings/audit-log` featuring event category filters (Auth, Security, Mutation), date range picker, JSON payload inspector drawer, and JSON export button. — **Reversibility:** reversible — UI page and server query.
- **D-16:** Audit log retention policy — Indefinite append-only retention by default for single-user personal use, with an explicit manual export-and-purge action in Settings. — **Reversibility:** reversible — retention queries and purge handlers.

### Agent Discretion
- Project file organization within `src/` (`features/`, `lib/`, `server/`, `components/`, `app/`).
- Specific shadcn/ui primitive installations required for Phase 1 components.
- Vitest testing configuration and test runner script setup.
- Dockerfile and docker-compose.yml configuration for local PostgreSQL service.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specifications & Architecture
- `prd.md` — Master Product Requirements Document (LifeOS comprehensive blueprint, Section 4 UI principles, Section 43 data integrity, Section 45 security)
- `.planning/PROJECT.md` — Project definition, core value, tech stack constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements (AUTH-01..04, SHELL-01..04, SEC-01..04)
- `.planning/ROADMAP.md` — Phase 1 scope and vertical slice boundaries
- `.planning/research/STACK.md` — Technology stack selections (Next.js 15, PostgreSQL 16+, Drizzle ORM, Better Auth, Tailwind CSS, shadcn/ui)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Greenfield repository — no prior codebase assets exist.

### Established Patterns
- Next.js 15 App Router with React 19 and TypeScript strict mode (`noImplicitAny`).
- PostgreSQL 16+ with Drizzle ORM type-safe schema definitions and Drizzle Kit migrations.
- Strict separation of authentication (Better Auth session verification) and authorization (application-level resource ownership validation using `user_id`).
- Strict vertical-slice rule: only foundational tables (`users`, `sessions` / Better Auth tables, `user_preferences`, `audit_log`) permitted in Phase 1. All domain tables deferred to respective phases.

### Integration Points
- Route groups: `(auth)` for login/setup and `(dashboard)` for authenticated app shell.
- Shared crypto utility: `src/lib/crypto.ts` for AES-256-GCM encryption/decryption at rest.
- Audit utility: `src/lib/audit.ts` for structured append-only audit logging.
- Session and authorization guards: `src/server/auth.ts` and `src/server/guards.ts`.

</code_context>

<specifics>
## Specific Ideas

- Linear / Raycast style high-density dark cockpit visual language with compact padding and subtle 1px zinc borders.
- Keyboard-first ergonomics: `Cmd+K` palette, `Cmd+B` sidebar toggle, `?` shortcut cheatsheet dialog.
- Zero external SMTP dependency for single-user setup: CLI recovery utility and emergency codes.

</specifics>

<deferred>
## Deferred Ideas

- Domain schemas and UI modules (Tasks, Projects, Goals, Habits, Calendar, Notes, CRM, Finances, Content, AI) deferred to Phases 2-9 per vertical-slice rule.
- External SMTP email reset deferred/optional until external notification provider is configured in future phases.
- Multi-user sharing and SaaS team workspaces (strictly out of scope for LifeOS).

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-09-10*
