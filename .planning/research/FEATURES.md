# Feature Classification: LifeOS

**Domain:** Personal Operating System
**Primary User:** Hamza
**Confidence:** HIGH

## Feature Taxonomy

### Table Stakes (Must Have for MVP)
- **Universal Capture & Global Command Palette:** `Cmd+K` quick capture modal to create tasks, notes, ideas, or log habits from anywhere.
- **Unified Dashboard ("What matters right now?"):** Today view, high-priority tasks (Importance + Urgency + Deadline scoring), scheduled events, habit status, and quick actions.
- **Task & Project Management:** Hierarchical tasks with priority (P0-P3), due/scheduled dates, duration estimates, energy levels, dependencies, and project linking.
- **Goal Alignment:** 1-5 year long-term goals, quarterly milestones, metrics (numeric, boolean, currency), and linked projects.
- **Daily Planning & Evening Review:** Morning 3-5 priority selection, time-block scheduling, evening completion tally, reflections, and rollover of uncompleted tasks.
- **Habits & Streaks:** Habit definitions (daily, weekly, weekdays), check-in logs, streak calculations, and cue/goal associations.
- **Markdown Notes & Knowledge Graph:** Markdown editing, bi-directional linking (`[[note]]`), tags, and entity relationships.
- **Personal Finance Basics:** Accounts, income/expense/transfer transactions, categories, budgets, and net worth overview.
- **Content & Social Media Ideation:** Content ideas, multi-platform drafts, content calendar, and platform variants (Twitter, LinkedIn, Blog).
- **Basic AI Assistant:** Chat interface, context-aware Q&A, natural language task parsing, and daily planning recommendations.
- **Settings & Data Management:** Secure authentication, audit logging, JSON/Markdown data export, and backup/restore.

### Differentiators (Competitive Advantage)
- **Interconnected Personal Graph:** No duplicate entry; Goal → Project → Task → Calendar → Completion → Analytics flow.
- **Strict Human-in-the-Loop AI Safety:** AI assists but never mutates sensitive records or publishes externally without explicit user confirmation.
- **Cross-Domain Life Analytics:** Correlating habits and time-tracking with goal achievement and project velocity.
- **Zero-Friction Ergonomics:** Single-keystroke capture and progressive complexity disclosure.

### Anti-Features (Deliberately Excluded)
- **Multi-tenant SaaS & Team Workspaces:** LifeOS is personal software for one person; team collaboration, permissions, and billing are excluded.
- **Uncontrolled Autonomous Agents:** AI cannot perform destructive actions or send external network requests without user confirmation.
- **Direct Automated Social Publishing in Initial Release:** Initial focus is ideation, drafts, and schedule planning; live API publishing is deferred to Phase 8.
- **Microservices Architecture:** No distributed services or Kubernetes; kept as a self-contained modular monolith.
