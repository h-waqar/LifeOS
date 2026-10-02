# Architecture Research: Milestone v3.0

**Domain:** Proactive Personal OS Orchestration & External Social Ecosystem
**Researched:** 2026-10-02
**Confidence:** HIGH

## System Architecture Overview

```
                                  LIFEOS AI LAYER (v3.0)
                                            │
                          ┌─────────────────┴─────────────────┐
                          │    Orchestration Engine (Master)  │
                          │   - Intent Parsing & Routing      │
                          │   - Inter-Agent Coordination Bus  │
                          │   - Zero-Trust Permission Check   │
                          └─────────────────┬─────────────────┘
                                            │
                ┌───────────────────────────┼───────────────────────────┐
                │                           │                           │
         Planner Agent                Analyst Agent               Creator Agent
      ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
      │ - Decomposes goals   │    │ - Evaluates habits   │    │ - Mines knowledge    │
      │ - "Plan My Week"     │    │ - Financial trends   │    │ - Generates drafts   │
      │ - Schedule optimizer │    │ - Productivity dips  │    │ - Platform variants  │
      │ - Dynamic rebalancer │    │ - Social engagement  │    │ - Queues for review  │
      └──────────┬───────────┘    └──────────┬───────────┘    └──────────┬───────────┘
                 │                           │                           │
                 └───────────────────────────┼───────────────────────────┘
                                             │
                              CANONICAL TOOL & DOMAIN SERVICES
                                             │
      ┌──────────────────┬───────────────────┼───────────────────┬───────────────────┐
      │                  │                   │                   │                   │
Calendar & Tasks      Finance             Knowledge           Automations         Social Connectors
(Time Blocks / DAG)  (Read-Only Shield)   (Notes / RAG)       (Event Bus/Cron)    (Twitter/LinkedIn/Blog)
      │                  │                   │                   │                   │
      └──────────────────┴───────────────────┼───────────────────┴───────────────────┘
                                             │
                                   ZERO-TRUST SAFETY GATE
                                             │
                              HITL Approval Challenges (5-min TTL)
                              Pessimistic DB Locks (`SELECT ... FOR UPDATE`)
                              Transactional `agent_audit_log`
                                             │
                                    POSTGRESQL 16 (Drizzle)
```

## Key Architectural Integration Points

### 1. External Social Connectors Layer (`src/server/integrations/social/`)

- **Interface Contract (`SocialPlatformAdapter`)**:
  ```typescript
  export interface SocialPlatformAdapter {
    readonly platform: 'twitter' | 'linkedin' | 'blog';
    getAuthorizationUrl(userId: string, redirectUri: string, state: string): Promise<string>;
    exchangeCode(userId: string, code: string, redirectUri: string, verifier?: string): Promise<OAuthTokens>;
    refreshToken(userId: string, refreshToken: string): Promise<OAuthTokens>;
    publishPost(userId: string, payload: SocialPostPayload): Promise<PublishResult>;
    fetchMetrics(userId: string, externalPostId: string): Promise<PlatformMetrics>;
  }
  ```
- **Isolated Implementation Classes**:
  - `TwitterAdapter`: Encapsulates Twitter API v2 endpoints (`/2/tweets`, `/2/tweets/:id`).
  - `LinkedInAdapter`: Encapsulates LinkedIn Community API endpoints (`/rest/posts`).
  - `BlogAdapter`: Dispatches signed JSON payloads (`POST` to user-configured webhook URL) with `X-LifeOS-Signature-256`.
- **Token Security**: Tokens are stored encrypted in `integration_connections` using `encryptSecret` (AES-256-GCM) with random IV and authenticated tag.

### 2. Autonomous Social Publishing Pipeline (`src/server/content/publishing/`)

- **Workflow State Machine**: `idea` -> `draft` -> `in_review` -> `scheduled` -> `published` (or `failed`).
- **Gated Execution**:
  1. Content reaches `scheduled` with valid `scheduledAt` and authored platform variants.
  2. Before public broadcast, an `agentChallenge` of type `social_publish` is materialized with exact rendered previews.
  3. User approves challenge via Web UI modal or Headless CLI.
  4. At `scheduledAt <= NOW()`, the `SchedulerEngine` publisher job acquires a row lock, marks the publication `publishing`, invokes `SocialPlatformAdapter.publishPost`, persists the post URL and external ID, and transitions status to `published`.
  5. If an unrecoverable API error occurs, status transitions to `failed` and triggers an urgent in-app notification.

### 3. Multi-Agent Orchestration Engine (`src/server/ai/orchestration/`)

- **Agent Personas**:
  - **Planner Persona**: System prompt tuned for constraint optimization, goal breakdown, and calendar management. Access: Tasks, Projects, Goals, Calendar (read/write).
  - **Analyst Persona**: System prompt tuned for statistical correlation, anomaly detection, and habit/finance insights. Access: Habits, Finance (read-only), Analytics, Social Metrics.
  - **Creator Persona**: System prompt tuned for audience engagement, tone variation, and thread structuring. Access: Notes, Content, Social Connectors (drafting only).
- **Inter-Agent Protocol**: Master Orchestrator calls sub-agents using structured Zod schemas (`InterAgentRequest`, `InterAgentResponse`). Results are synthesized into a coherent user proposal.

### 4. Constraint-Satisfaction "Plan My Week" Engine (`src/server/calendar/planner/`)

- **Input Model**:
  - Unscheduled high-priority tasks (sorted by topological DAG order and priority score).
  - Fixed external commitments (Google Calendar events, hard deadlines).
  - User energy profile (e.g. high energy 9am-12pm, medium energy 2pm-5pm, low energy evening).
  - Target weekly habit frequencies.
- **Solver Algorithm**:
  - Greedy interval packing with priority weighting and energy level matching.
  - Generates proposed `time_blocks` matrix for Monday through Sunday.
  - Returns a preview diff showing scheduled deep work blocks, habit routines, and buffer periods.
  - User approves -> atomic bulk insertion into `time_blocks` with two-way Google Calendar synchronization.

### 5. Event-Driven Proactive Rebalancing (`src/server/calendar/rebalancer/`)

- **Trigger Handlers**:
  - Listens to typed event bus: `calendar.event_overrun`, `task.overdue`, `energy.dip_recorded`.
- **Dampening & Evaluation**:
  - Ignores schedule slips under 30 minutes.
  - Evaluates remaining day capacity.
  - Computes rebalance options: (A) Bump lowest-priority task to tomorrow's daily plan; (B) Compress subsequent block; (C) Preserve evening personal buffer.
  - Emits proactive notification: "Your morning meeting overran by 45 mins. Would you like to shift 'Task B' to tomorrow?"

---
*Architecture research for: LifeOS v3.0 Proactive Personal OS Orchestration & External Ecosystem*
*Researched: 2026-10-02*
