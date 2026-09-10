# Roadmap: LifeOS

## Overview

LifeOS is an integrated personal operating system built from scratch to unify tasks, projects, goals, daily planning, calendar, habits, notes, relationships, finances, content creation, and AI assistance into a single source of truth. The roadmap progresses through 9 coherent capability phases: establishing a rock-solid TypeScript & PostgreSQL foundation with Drizzle ORM and Better Auth (Phase 1), deploying the core productivity execution engine (Phase 2), connecting knowledge, learning, and relationships (Phase 3), adding personal finance (Phase 4), managing content ideation and scheduling (Phase 5), integrating the AI layer with human-in-the-loop safety (Phase 6), powering system automations and events (Phase 7), connecting external integrations like Google Calendar and GitHub (Phase 8), and delivering predictive personal intelligence (Phase 9).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3...): Planned milestone work
- Decimal phases (2.1, 2.2...): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation** - TypeScript architecture, Next.js shell, PostgreSQL database with Drizzle ORM (foundational schema only: users, sessions / Better Auth tables, preferences, audit_log), Better Auth authentication, resource ownership authorization via user_id, design system, settings, and audit logging.
- [ ] **Phase 2: Core Productivity** - Unified dashboard, tasks, projects, goals, calendar, time blocking, daily planning, and habits.
- [ ] **Phase 3: Knowledge, Learning & Relationships** - Rich Markdown notes, bidirectional linking, tags, global search, learning tracker, and Relationships / People CRM (Person, Interaction).
- [ ] **Phase 4: Personal Finance** - Accounts, transactions, categories, budgets, financial goals, and net worth reports.
- [ ] **Phase 5: Content & Social Media** - Content ideas, multi-platform drafts, content calendar, and analytics data model.
- [ ] **Phase 6: AI Layer & Assistant** - Multi-provider AI abstraction, personal graph RAG, structured tool calling with confirmation gates, and conversational assistant.
- [ ] **Phase 7: Automations & Event Engine** - In-app event bus, trigger-condition-action workflow engine, background jobs, and notifications.
- [ ] **Phase 8: External Integrations** - Google Calendar 2-way sync, GitHub activity feed, and automated cloud backup.
- [ ] **Phase 9: Intelligence & Predictive Analytics** - Cross-domain personal analytics, predictive trend detection, goal risk scoring, and semantic vector search.

## Phase Details

### Phase 1: Foundation
**Goal**: Establish the project architecture, PostgreSQL relational foundation using Drizzle ORM (foundational/auth tables only: users, sessions / Better Auth tables, user preferences, audit_log), Better Auth authentication, server-side resource ownership authorization via authenticated user_id, application navigation shell, design system, settings, and audit logging.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, SHELL-01, SHELL-02, SHELL-03, SHELL-04, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. User can register/log in securely via Better Auth, and session persists across page reloads.
  2. All server actions and API endpoints enforce server-side resource ownership validation against the authenticated user's user_id, maintaining strict separation between authentication and authorization.
  3. Responsive application shell renders with sidebar navigation, theme switching, and global command palette shell.
  4. Sensitive mutations produce immutable audit log entries in PostgreSQL.
  5. Database migrations run cleanly with Drizzle ORM (foundational tables only; domain tables deferred per vertical-slice rule) and automated test suite passes.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 01-01: Project setup (Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Vitest)
- [ ] 01-02: PostgreSQL database setup with Drizzle ORM (foundational schema only: users, sessions / Better Auth tables, preferences, audit_log)
- [ ] 01-03: Better Auth authentication, session management, and server authorization ownership guards
- [ ] 01-04: Application shell, navigation layout, theme settings, and audit logging

### Phase 2: Core Productivity
**Goal**: Deliver the primary execution engine: Goals → Projects → Tasks → Calendar / Time Blocking → Habits → Dashboard.
**Depends on**: Phase 1
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, PROJ-01, PROJ-02, PROJ-03, PROJ-04, GOAL-01, GOAL-02, GOAL-03, GOAL-04, PLAN-01, PLAN-02, PLAN-03, PLAN-04, CAL-01, CAL-02, CAL-03, CAL-04, HABT-01, HABT-02, HABT-03, HABT-04
**Success Criteria** (what must be TRUE):
  1. User can create a goal, break it into projects and tasks, and see progress calculate automatically without duplicate entry.
  2. User can schedule tasks as calendar time blocks and track actual time spent.
  3. User can complete the morning daily plan (top 3-5 focus) and evening review with rollover.
  4. User can log habits with single-click check-ins and view accurate streak metrics.
  5. Unified Dashboard answers "What matters right now?" with prioritized tasks and day overview.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 02-01: Task management with priority scoring, energy levels, subtasks, and quick capture
- [ ] 02-02: Project and Goal tracking with hierarchical horizons and automated progress rollups
- [ ] 02-03: Calendar time blocking linked to canonical tasks with conflict detection
- [ ] 02-04: Daily planning morning routine and evening review with task carry-over
- [ ] 02-05: Habit tracker with streak calculations and unified home dashboard

### Phase 3: Knowledge, Learning & Relationships
**Goal**: Build a connected knowledge and relationship network with rich Markdown notes, bidirectional linking, tags, global search, learning system, and Relationships / People CRM (Person and Interaction entities).
**Depends on**: Phase 2
**Requirements**: NOTE-01, NOTE-02, NOTE-03, NOTE-04, NOTE-05, NOTE-06, CRM-01, CRM-02, CRM-03, CRM-04, CRM-05
**Success Criteria** (what must be TRUE):
  1. User can author markdown notes with bidirectional wikilinks ([[Note Title]]) and view backlinks in note inspector.
  2. User can link notes to tasks, projects, goals, learning items, and people.
  3. User can manage contacts (People) with relationship types, contact details, tags, and log interaction history with follow-up tracking.
  4. User can execute full-text search across notes, tasks, projects, goals, and people with instant results.
  5. User can log and track learning items (books, courses) with status, ratings, and progress notes.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: Markdown note editor with wikilinks, tags, and backlink graph inspection
- [ ] 03-02: Relationships / People CRM module (Person and Interaction schemas, contact management, follow-up tracking)
- [ ] 03-03: PostgreSQL full-text search across all entities (notes, tasks, projects, goals, people) and global command palette integration
- [ ] 03-04: Learning system for tracking books, courses, articles, and skill notes

### Phase 4: Personal Finance
**Goal**: Provide a private financial ledger connecting accounts, transactions, category budgets, and financial goals.
**Depends on**: Phase 2
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05
**Success Criteria** (what must be TRUE):
  1. User can record income, expense, and transfer transactions across accounts.
  2. Category budgets display real-time spending vs monthly targets.
  3. Financial transactions and savings targets link to Financial Goals.
  4. System computes net worth, cash flow, and savings rates with 100% verified test math.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: Financial accounts, categories, and transaction ledger with transfer handling
- [ ] 04-02: Monthly budgets, net worth computation, and financial goal progress reports

### Phase 5: Content & Social Media
**Goal**: Enable content creation, multi-platform drafts, and editorial scheduling prior to external publishing integrations.
**Depends on**: Phase 2
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05
**Success Criteria** (what must be TRUE):
  1. User can capture content ideas and organize them by topics and target distribution channels.
  2. User can draft platform variants (Twitter thread, LinkedIn post, Blog) for a single idea.
  3. Content calendar provides visual scheduling across publication dates.
  4. Content transitions through workflow statuses (Idea → Draft → In Review → Scheduled → Published).
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 05-01: Content idea capture, multi-platform draft editor, and workflow status transitions
- [ ] 05-02: Visual content calendar and manual performance metrics tracking

### Phase 6: AI Layer & Assistant
**Goal**: Integrate a contextual AI assistant with multi-provider support, personal graph RAG, structured tool calling, and human-in-the-loop confirmation.
**Depends on**: Phase 3
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05
**Success Criteria** (what must be TRUE):
  1. AI assistant seamlessly switches between Gemini, Claude, OpenAI, and local Ollama models.
  2. Natural language quick capture extracts tasks, dates, and priorities into structured entities.
  3. Side-effect mutations require explicit user confirmation before committing to the database.
  4. Context retrieval grounds assistant responses in the user personal data graph.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 06-01: Multi-provider AI abstraction layer and personal context retrieval engine (RAG)
- [ ] 06-02: Structured tool calling engine with mandatory Human-in-the-Loop confirmation gate
- [ ] 06-03: AI chat interface, command palette integration, and natural language capture

### Phase 7: Automations & Event Engine
**Goal**: Deliver an in-app event bus, trigger-condition-action automation rules, background jobs, and notifications.
**Depends on**: Phase 2
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04
**Success Criteria** (what must be TRUE):
  1. Domain events trigger user-defined automation rules reliably without race conditions.
  2. Background scheduler handles recurring task generation, reminders, and evening review prompts.
  3. In-app notifications inform the user of overdue items and automation executions.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 07-01: In-app Event Bus and domain event publisher/subscriber architecture
- [ ] 07-02: Trigger-condition-action rule engine, background job scheduler, and notifications

### Phase 8: External Integrations
**Goal**: Connect LifeOS to external third-party services (Google Calendar, GitHub, Cloud Storage) using secure adapters.
**Depends on**: Phase 2, Phase 7
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04
**Success Criteria** (what must be TRUE):
  1. Google Calendar sync reflects external calendar events and pushes LifeOS scheduled blocks.
  2. GitHub activity (commits, PRs) appears in the daily productivity timeline.
  3. Automated backup exports database and notes to external storage.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 08-01: Google Calendar two-way synchronization via OAuth adapter
- [ ] 08-02: GitHub activity timeline ingestion and automated cloud backup adapter

### Phase 9: Intelligence & Predictive Analytics
**Goal**: Deliver cross-domain personal analytics, predictive trend detection, goal risk assessment, and semantic search.
**Depends on**: Phase 6, Phase 7
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04
**Success Criteria** (what must be TRUE):
  1. Analytics dashboard displays deep cross-domain correlations (e.g. habits vs velocity).
  2. Predictive engine flags at-risk goals based on current velocity and remaining days.
  3. Semantic vector search allows conceptual query matching across the knowledge graph.
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 09-01: Cross-domain personal analytics dashboard and trend calculation engine
- [ ] 09-02: Goal risk forecasting and PostgreSQL pgvector semantic knowledge search

## Database Architecture & Vertical-Slice Rule

LifeOS strictly enforces a vertical-slice database evolution rule:
1. **No Upfront Monolithic Schema**: Domain schemas MUST be introduced alongside the phase that implements their corresponding functionality. Creating database tables before their business logic exists is prohibited.
2. **Phase 1 Database Scope**: Strictly limited to foundational/authentication tables:
   - `users`
   - `sessions` / Better Auth required tables (`accounts`, `verifications`, etc.)
   - `preferences` (if required by Phase 1 design)
   - `audit_log`
   Do NOT create Task, Project, Goal, Habit, Calendar, Note, Person, Interaction, Finance, Content, AI, or other domain tables during Phase 1 unless strictly required by an explicitly approved Phase 1 vertical slice.
3. **Domain Schema Introductions by Phase**:
   - **Phase 1: Foundation**: Foundational & Auth (`users`, `sessions`, Better Auth tables, `user_preferences`, `audit_log`)
   - **Phase 2: Core Productivity**: Tasks, Projects, Goals, Habits, Timeblocks (`tasks`, `subtasks`, `task_dependencies`, `projects`, `goals`, `goal_metrics`, `habits`, `habit_entries`, `time_blocks`, `daily_plans`, `evening_reviews`)
   - **Phase 3: Knowledge, Learning & Relationships**: Notes, Tags, Learning, Contacts (`notes`, `tags`, `entity_tags`, `note_links`, `learning_items`, `people`, `interactions`)
   - **Phase 4: Personal Finance**: Accounts, Transactions, Budgets (`accounts`, `transactions`, `categories`, `budgets`)
   - **Phase 5: Content & Social Media**: Content items, drafts, editorial calendar (`content_items`, `content_platforms`, `content_publications`, `content_metrics`)
   - **Phase 6: AI Layer & Assistant**: AI sessions and tool action logs (`ai_conversations`, `ai_messages`, `ai_actions`)
   - **Phase 7: Automations & Event Engine**: Triggers, rules, and events (`automations`, `automation_runs`, `notifications`)
   - **Phase 8: External Integrations**: Third-party connections and sync states (`integration_connections`, `sync_logs`)
   - **Phase 9: Intelligence & Predictive Analytics**: Analytics aggregates and vector embeddings (`analytics_snapshots`, `pgvector` embeddings)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/4 | Not started | - |
| 2. Core Productivity | 0/5 | Not started | - |
| 3. Knowledge, Learning & Relationships | 0/4 | Not started | - |
| 4. Personal Finance | 0/2 | Not started | - |
| 5. Content & Social Media | 0/2 | Not started | - |
| 6. AI Layer & Assistant | 0/3 | Not started | - |
| 7. Automations & Event Engine | 0/2 | Not started | - |
| 8. External Integrations | 0/2 | Not started | - |
| 9. Intelligence & Predictive Analytics | 0/2 | Not started | - |
