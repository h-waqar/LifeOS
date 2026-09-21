# Requirements: LifeOS

**Defined:** 2026-09-10
**Core Value:** A single source of truth connecting goals, projects, tasks, time, knowledge, money, learning, relationships, and content—powered by an AI layer that understands context and helps plan and execute without fragmented tools, duplicate entry, or siloed data.

## v1 Requirements

Requirements for initial release across the 9 planned phases. Each maps directly to roadmap phases.

### Authentication & Authorization
- [x] **AUTH-01**: User can authenticate securely via Better Auth (password/session cookies) and maintain persistent session across page reloads.
- [x] **AUTH-02**: All server actions and API endpoints enforce server-side resource ownership validation against the authenticated user's user_id, maintaining strict separation between authentication and authorization.
- [x] **AUTH-03**: User can log out from any page and invalidate active session tokens via Better Auth.
- [x] **AUTH-04**: User can manage account settings and update master credentials.

### Application Shell, Design System & Settings
- [x] **SHELL-01**: User can navigate between all primary modules via a responsive, keyboard-accessible sidebar navigation shell.
- [x] **SHELL-02**: User can trigger a global command palette (Cmd+K) from any screen to perform actions or navigate.
- [x] **SHELL-03**: User can configure application preferences (dark/light theme, date/time formats, working hours).
- [x] **SHELL-04**: User can access an audit log detailing sensitive mutations, security events, and AI-performed actions.

### Dashboard
- [x] **DASH-01**: User can view the "Today" dashboard displaying current date, priority tasks, scheduled time blocks, habits, and upcoming deadlines.
- [x] **DASH-02**: Dashboard automatically ranks and highlights highest-value tasks based on priority scoring (Importance + Urgency + Deadline).
- [x] **DASH-03**: User can execute quick actions directly from the dashboard (create task, log habit, start timer).
- [x] **DASH-04**: Dashboard presents goal and project health summaries requiring immediate attention.

### Task Management
- [x] **TASK-01**: User can create a task with title, description, status (Inbox, Todo, In Progress, Blocked, Done, Archived), and priority (P0, P1, P2, P3).
- [x] **TASK-02**: User can assign due dates, scheduled dates, estimated duration (minutes), and energy levels (High, Medium, Low) to tasks.
- [x] **TASK-03**: User can link a task to a Project, Goal, Habit, Note, or Person without data duplication.
- [x] **TASK-04**: User can create subtasks and define task-to-task dependencies (blocking/prerequisite tasks).
- [x] **TASK-05**: User can configure recurrence rules for repeating tasks (daily, weekly, monthly, custom).
- [x] **TASK-06**: User can filter, sort, and group tasks by status, project, priority, due date, and energy level.
- [x] **TASK-07**: User can mark tasks as completed, recording actual duration and completion timestamp.
- [x] **TASK-08**: Universal Quick Capture allows instant creation of tasks with zero friction from any view.

### Projects
- [ ] **PROJ-01**: User can create projects with title, description, area, status (Planning, Active, Paused, Completed), target deadline, and linked goal.
- [ ] **PROJ-02**: Project view displays linked tasks, milestones, progress percentage, notes, and documents in one unified view.
- [ ] **PROJ-03**: Project progress updates automatically based on task and milestone completion.
- [ ] **PROJ-04**: User can archive completed or paused projects while preserving task and history links.

### Goals & OKRs
- [ ] **GOAL-01**: User can define hierarchical goals across horizons: Long-term (1-5 years), Medium-term (Quarterly/Annual), and Short-term (Monthly).
- [ ] **GOAL-02**: User can define key metrics for goals (Numeric target, Currency target, Boolean milestone, or Percentage).
- [ ] **GOAL-03**: Goal progress automatically recalculates based on linked project progress, metric updates, and task completions.
- [ ] **GOAL-04**: User can link goals to life Areas (Health, Career, Finance, Personal Development, Relationships).

### Daily Planning & Evening Review
- [x] **PLAN-01**: User can complete a guided Morning Daily Plan: pick 3-5 priority tasks, review habit intentions, and allocate time blocks.
- [x] **PLAN-02**: User can complete a guided Evening Review: mark completed items, enter daily reflections, and calculate daily productivity score.
- [x] **PLAN-03**: Uncompleted daily tasks can be carried over, rescheduled, or returned to the backlog with one click.
- [x] **PLAN-04**: System tracks daily plan completion history for weekly and monthly trend analysis.

### Calendar & Time Blocking
- [x] **CAL-01**: User can view a day, week, and month calendar displaying scheduled time blocks and deadlines.
- [x] **CAL-02**: User can create time blocks directly linked to canonical tasks (drag-and-drop or click-to-block).
- [x] **CAL-03**: Completed time blocks reflect actual time spent and update linked task analytics.
- [x] **CAL-04**: System prevents overlapping hard commitments and highlights scheduling conflicts.

### Habits & Streaks
- [x] **HABT-01**: User can create habits with frequency rules (Daily, Weekdays, X times per week, Specific days) and time-of-day cues.
- [x] **HABT-02**: User can log habit completions with a single click from the Dashboard or Habit Tracker.
- [x] **HABT-03**: System calculates current streak, longest streak, and completion rate percentages accurately.
- [x] **HABT-04**: User can link habits to long-term goals or identity statements.

### Notes, Knowledge Graph & Search
- [x] **NOTE-01**: User can create and edit rich Markdown notes with headings, checklists, code blocks, and math.
- [x] **NOTE-02**: User can link notes using bidirectional wikilinks ([[Note Title]]) and view backlinks in note inspector.
- [x] **NOTE-03**: User can tag notes and organize knowledge by tags, note types, and life areas.
- [ ] **NOTE-04**: User can link notes directly to Projects, Goals, Tasks, Learning Items, and People. *(Partial in Plan 03-01: Projects, Goals, and Tasks implemented; Learning Items and People deferred to Plans 03-02 and 03-04 per vertical-slice rule)*
- [ ] **NOTE-05**: User can perform instant full-text search across all notes, tasks, projects, goals, and people using PostgreSQL full-text indexing.
- [ ] **NOTE-06**: User can track Learning Items (books, courses, articles) with status, ratings, key takeaways, and linked notes.

### Relationships / People CRM
- [ ] **CRM-01**: User can create, view, edit, and archive Person records with name, relationship type (Client, Friend, Family, Colleague, Prospect, Mentor, Professional), company, role, contact information, and tags.
- [ ] **CRM-02**: User can log Interactions with a Person (date, channel/type, summary notes, next follow-up date).
- [ ] **CRM-03**: System automatically tracks and displays `lastInteraction` date and surfaces upcoming or overdue `nextFollowUp` reminders.
- [ ] **CRM-04**: User can link a Person to Tasks, Projects, and Notes without data duplication.
- [ ] **CRM-05**: User can filter, search, and group people by relationship type, company, tags, and follow-up status.

### Personal Finance
- [ ] **FIN-01**: User can manage financial accounts (Checking, Savings, Investments, Credit Cards) and balances.
- [ ] **FIN-02**: User can record income, expense, and transfer transactions with date, payee, amount, and category.
- [ ] **FIN-03**: User can define monthly category budgets and view spending vs budget in real time.
- [ ] **FIN-04**: User can link financial transactions or savings targets to Financial Goals.
- [ ] **FIN-05**: System computes net worth, monthly cash flow, and savings rate with 100% verified test calculations.

### Content & Social Media Management
- [ ] **CONT-01**: User can capture content ideas with tags, target audience, and prospective distribution channels.
- [ ] **CONT-02**: User can author content drafts with platform-specific variants (Twitter/X thread, LinkedIn post, Blog article).
- [ ] **CONT-03**: User can schedule content on a visual Content Calendar.
- [ ] **CONT-04**: Content can transition through workflow statuses: Idea → Draft → In Review → Scheduled → Published → Archived.
- [ ] **CONT-05**: User can manually log or ingest performance metrics (impressions, likes, shares) for published content pieces.

### AI Layer & Assistant
- [ ] **AI-01**: Multi-provider AI abstraction layer supports Gemini, Claude, OpenAI, and local Ollama models with seamless switching.
- [ ] **AI-02**: Context Retrieval Engine (RAG) gathers relevant tasks, goals, notes, and calendar events to ground AI responses.
- [ ] **AI-03**: AI Assistant can parse natural language input into structured entities (tasks, calendar blocks, reminders).
- [ ] **AI-04**: Structured tool calling with Human-in-the-Loop Confirmation Gate for any state-mutating action (no unconfirmed writes/deletions).
- [ ] **AI-05**: AI assistant provides daily planning suggestions and weekly synthesis reviews based on personal data graph.

### Automations & Event Bus
- [ ] **AUTO-01**: In-app Event Bus publishes domain events (task.created, task.completed, goal.progress_updated, habit.logged).
- [ ] **AUTO-02**: User can configure Trigger-Condition-Action automation rules (e.g. When all project tasks complete → Mark project complete).
- [ ] **AUTO-03**: Background job runner processes recurring tasks, daily reminders, and review prompts.
- [ ] **AUTO-04**: System dispatches in-app notifications for overdue tasks, scheduled reviews, and automation results.

### External Integrations
- [ ] **INTEG-01**: Two-way synchronization between LifeOS Calendar and Google Calendar via OAuth.
- [ ] **INTEG-02**: Ingestion of GitHub activity (commits, PRs, issues) into the personal daily work timeline.
- [ ] **INTEG-03**: External storage adapter for automated database backups (local filesystem, S3-compatible cloud storage).
- [ ] **INTEG-04**: Webhook endpoint for capturing inbound data from external automation tools.

### Intelligence & Predictive Analytics
- [ ] **INTEL-01**: Personal analytics dashboard displaying time allocation, habit consistency, project completion velocity, and goal progress.
- [ ] **INTEL-02**: Predictive trend detection highlights goal failure risks and deadline bottlenecks before they occur.
- [ ] **INTEL-03**: Semantic vector search across notes and knowledge using PostgreSQL vector embeddings (pgvector).
- [ ] **INTEL-04**: Schedule optimization recommendations suggesting optimal focus blocks based on historical productivity and energy levels.

### Security, Audit & Data Portability
- [x] **SEC-01**: Sensitive credentials (API keys, OAuth tokens) are encrypted at rest using AES-256-GCM.
- [x] **SEC-02**: Complete audit log records every mutating action, authentication attempt, and AI tool execution.
- [ ] **SEC-03**: User can export the entire database in standardized JSON and Markdown formats at any time. *(Deferred to data portability milestone)*
- [ ] **SEC-04**: Database backup and restore verification scripts guarantee zero data loss. *(Deferred to Phase 8 backup adapter)*

## v2 Requirements

Deferred to future releases after v1 roadmap execution:
- **COLLAB-01**: Multi-user sharing of select projects or notes.
- **VOICE-01**: Native voice input and speech-to-text dictation for quick capture.
- **MOBILE-01**: Progressive Web App (PWA) offline sync with background syncing.
- **PUB-01**: Automated direct publishing to social media APIs (Twitter, LinkedIn) with OAuth scheduling.
- **BANK-01**: Plaid / Open Banking automated transaction sync.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant team SaaS | LifeOS is personal software for Hamza; team workspaces, role hierarchies, and billing are excluded |
| Unconstrained autonomous AI execution | Destructive or external actions without user confirmation violate Product Principle 2 |
| Distributed microservices architecture | A modular monolith in Docker on a single VPS provides maximum reliability and lowest operational complexity |
| Direct auto-publishing to social platforms in MVP | Content calendar and drafting are built in Phase 5; automated publishing requires external API approval and is deferred |
| Generic unstructured JSON blob storage | PRD Section 43 mandates strict relational modeling with foreign keys, migrations, and ACID constraints |
| Upfront monolithic database schema | Domain schemas must be introduced with the phase that implements their corresponding functionality (vertical-slice rule). Phase 1 is strictly restricted to foundational/auth infrastructure (users, sessions, preferences, audit_log). |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Satisfied |
| AUTH-02 | Phase 1 | Satisfied |
| AUTH-03 | Phase 1 | Satisfied |
| AUTH-04 | Phase 1 | Satisfied |
| SHELL-01 | Phase 1 | Satisfied |
| SHELL-02 | Phase 1 | Satisfied |
| SHELL-03 | Phase 1 | Satisfied |
| SHELL-04 | Phase 1 | Satisfied |
| SEC-01 | Phase 1 | Satisfied |
| SEC-02 | Phase 1 | Satisfied |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| DASH-01 | Phase 2 | Complete |
| DASH-02 | Phase 2 | Complete |
| DASH-03 | Phase 2 | Complete |
| DASH-04 | Phase 2 | Complete |
| TASK-01 | Phase 2 | Complete |
| TASK-02 | Phase 2 | Complete |
| TASK-03 | Phase 2 | Complete |
| TASK-04 | Phase 2 | Complete |
| TASK-05 | Phase 2 | Complete |
| TASK-06 | Phase 2 | Complete |
| TASK-07 | Phase 2 | Complete |
| TASK-08 | Phase 2 | Complete |
| PROJ-01 | Phase 2 | Pending |
| PROJ-02 | Phase 2 | Pending |
| PROJ-03 | Phase 2 | Pending |
| PROJ-04 | Phase 2 | Pending |
| GOAL-01 | Phase 2 | Pending |
| GOAL-02 | Phase 2 | Pending |
| GOAL-03 | Phase 2 | Pending |
| GOAL-04 | Phase 2 | Pending |
| PLAN-01 | Phase 2 | Pending |
| PLAN-02 | Phase 2 | Pending |
| PLAN-03 | Phase 2 | Pending |
| PLAN-04 | Phase 2 | Pending |
| CAL-01 | Phase 2 | Pending |
| CAL-02 | Phase 2 | Pending |
| CAL-03 | Phase 2 | Pending |
| CAL-04 | Phase 2 | Pending |
| HABT-01 | Phase 2 | Pending |
| HABT-02 | Phase 2 | Pending |
| HABT-03 | Phase 2 | Pending |
| HABT-04 | Phase 2 | Pending |
| NOTE-01 | Phase 3 | Complete |
| NOTE-02 | Phase 3 | Complete |
| NOTE-03 | Phase 3 | Complete |
| NOTE-04 | Phase 3 | Partial (Projects, Goals, Tasks implemented; People & Learning deferred to 03-02/03-04) |
| NOTE-05 | Phase 3 | Pending |
| NOTE-06 | Phase 3 | Pending |
| CRM-01 | Phase 3 | Pending |
| CRM-02 | Phase 3 | Pending |
| CRM-03 | Phase 3 | Pending |
| CRM-04 | Phase 3 | Pending |
| CRM-05 | Phase 3 | Pending |
| FIN-01 | Phase 4 | Pending |
| FIN-02 | Phase 4 | Pending |
| FIN-03 | Phase 4 | Pending |
| FIN-04 | Phase 4 | Pending |
| FIN-05 | Phase 4 | Pending |
| CONT-01 | Phase 5 | Pending |
| CONT-02 | Phase 5 | Pending |
| CONT-03 | Phase 5 | Pending |
| CONT-04 | Phase 5 | Pending |
| CONT-05 | Phase 5 | Pending |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Pending |
| AI-04 | Phase 6 | Pending |
| AI-05 | Phase 6 | Pending |
| AUTO-01 | Phase 7 | Pending |
| AUTO-02 | Phase 7 | Pending |
| AUTO-03 | Phase 7 | Pending |
| AUTO-04 | Phase 7 | Pending |
| INTEG-01 | Phase 8 | Pending |
| INTEG-02 | Phase 8 | Pending |
| INTEG-03 | Phase 8 | Pending |
| INTEG-04 | Phase 8 | Pending |
| INTEL-01 | Phase 9 | Pending |
| INTEL-02 | Phase 9 | Pending |
| INTEL-03 | Phase 9 | Pending |
| INTEL-04 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 75 total
- Mapped to phases: 75
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-10*
*Last updated: 2026-09-14 after Phase 1 closure audit and Phase 2 transition*
