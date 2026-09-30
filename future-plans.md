# Life OS — Future Goals & Deferred Architecture

> **Status:** Future work / Deferred
> **Purpose:** Capture long-term capabilities that are intentionally excluded from the current implementation roadmap.
> **Rule:** Do not interrupt or restructure active phases to implement these goals unless the current roadmap explicitly requires it.

---

## 1. Guiding Principle

Life OS should remain the **source of truth for the user's life data and domain logic**, while external AI agents should operate as an **intelligence and execution layer on top of Life OS**.

The AI layer must remain replaceable.

Life OS must **not** become tightly coupled to a specific AI provider, model, CLI harness, or subscription.

Target architecture:

```text
                         LIFE OS
                            │
                  ┌─────────┴─────────┐
                  │                   │
             Core Platform       Agent Interface
                  │                   │
            Domain Logic        MCP / CLI / API
                  │                   │
                  └─────────┬─────────┘
                            │
                     Agent Harness
                            │
             ┌──────────────┼──────────────┐
             │              │              │
          AGY CLI       Claude Code       Codex
             │              │              │
             └──────────────┼──────────────┘
                            │
                    Project Workspace
                            │
              ┌─────────────┼─────────────┐
              │             │             │
           Skills         Docs        .planning/
```

The exact implementation is intentionally deferred.

---

# 2. Primary Future Goal — Intelligence Layer

Build a provider-agnostic intelligence layer that allows capable CLI agent harnesses to interact with Life OS safely and productively.

### Objectives

* Allow external AI agents to understand Life OS context.
* Allow agents to inspect goals, projects, tasks, finances, and other permitted domains.
* Allow agents to create and modify Life OS entities through validated interfaces.
* Allow agents to use Life OS skills and documentation.
* Allow agents to inspect the project repository and `.planning/` structure.
* Allow agents to plan work and turn plans into actionable tasks.
* Allow agents to execute approved technical work through a project-scoped terminal environment.
* Keep the underlying Life OS domain model independent of any AI provider.

### Non-goals

The intelligence layer must not:

* replace Life OS as the source of truth;
* bypass Life OS domain validation;
* directly mutate the database without going through approved application interfaces;
* depend permanently on one AI provider;
* embed provider-specific business logic throughout the application;
* grant unrestricted access to the host machine;
* silently perform high-impact actions without appropriate authorization.

---

# 3. Provider-Agnostic Agent Architecture

Life OS should support multiple AI agent harnesses through a common interface.

Potential providers include:

* AGY CLI
* Claude Code
* Codex CLI
* Other MCP-capable coding/agent harnesses
* Future providers that support equivalent tool interfaces

Target:

```text
                 Life OS Agent Interface
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          AGY CLI      Claude Code    Codex CLI
             │             │             │
             └─────────────┼─────────────┘
                           │
                    Life OS Services
                           │
                         DB/API
```

### Architectural requirement

No core Life OS domain feature should require a specific agent provider.

---

# 4. Life OS MCP Server

Investigate and potentially implement a dedicated MCP server exposing controlled Life OS capabilities to compatible agents.

Potential tool categories:

### Context

```text
get_life_context()
get_project_context()
get_goal_context()
get_task_context()
get_financial_context()
```

### Goals

```text
list_goals()
get_goal()
create_goal()
update_goal()
```

### Projects

```text
list_projects()
get_project()
create_project()
update_project()
```

### Tasks

```text
list_tasks()
get_task()
create_task()
update_task()
complete_task()
```

### Planning

```text
get_current_plan()
create_plan()
update_plan()
record_decision()
```

### Documentation

```text
search_docs()
get_document()
search_skills()
get_skill()
```

### Important constraint

MCP tools must invoke the same validated application/domain services used by the normal Life OS application.

MCP must **not become a second implementation of Life OS business logic**.

---

# 5. Life OS CLI

Evaluate and potentially implement a first-class Life OS CLI.

Example interface:

```bash
lifeos context
lifeos context --project <id>

lifeos goals list
lifeos goals create

lifeos projects list
lifeos projects create

lifeos tasks list
lifeos tasks create
lifeos tasks complete

lifeos plan
lifeos status

lifeos finance summary
```

The CLI should be useful to both humans and AI agents.

### Design principle

Prefer deterministic commands and structured output.

Potential machine-readable output:

```bash
lifeos tasks list --json
lifeos context --json
lifeos project status --json
```

This makes the CLI useful even when an agent does not support MCP.

---

# 6. Shared Domain Service Layer

Before exposing Life OS to agents, ensure domain operations have a clear service boundary.

Target:

```text
                    Life OS Domain Services
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
       Web App              CLI                MCP
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                            DB
```

The following must not happen:

```text
Web App → custom logic → DB
CLI     → different logic → DB
MCP     → different logic → DB
```

Instead:

```text
Web App ─┐
CLI ─────┼──→ Domain/Application Services ──→ DB
MCP ─────┘
```

This becomes a major architectural invariant for the future agent layer.

---

# 7. Skills System

Create a structured skills system that agents can discover and use.

Potential structure:

```text
skills/
├── life-os/
│   ├── goals/
│   ├── projects/
│   ├── tasks/
│   ├── finance/
│   └── planning/
│
├── development/
│   ├── architecture/
│   ├── testing/
│   ├── debugging/
│   └── deployment/
│
└── workflows/
    ├── planning/
    ├── implementation/
    ├── review/
    └── release/
```

Each skill should define:

* purpose;
* when to use it;
* required context;
* allowed operations;
* expected output;
* validation requirements;
* relevant documentation;
* failure conditions.

Skills should provide **procedural knowledge**, not replace application-level authorization.

---

# 8. Documentation Context Layer

Agents should be able to discover relevant Life OS documentation without loading the entire repository blindly.

Potential sources:

```text
docs/
.planning/
skills/
architecture/
ADRs
API documentation
domain specifications
testing documentation
```

Potential capabilities:

```text
search documentation
retrieve relevant document
retrieve architecture decision
retrieve domain specification
retrieve current phase state
```

The system should prefer **relevant context retrieval** over dumping the entire project into the agent context window.

---

# 9. Project-Scoped Agent Workspace

Agents that execute development work should operate inside a controlled project workspace.

Example:

```text
~/projects/life-os/
├── .planning/
├── apps/
├── packages/
├── docs/
├── skills/
├── scripts/
└── ...
```

The agent should have access to:

* repository files;
* Git;
* project package manager;
* test commands;
* build commands;
* lint/type-check commands;
* project-specific scripts;
* approved Life OS tools.

The agent should **not automatically receive unrestricted host-machine access**.

---

# 10. SSH / Remote Execution

Investigate project-scoped remote execution for agent workloads.

Potential model:

```text
Agent Harness
      │
      │ SSH
      ▼
Project Environment
      │
      ├── repository
      ├── dependencies
      ├── tests
      ├── build tools
      └── Life OS tooling
```

Possible environments:

* local development machine;
* dedicated development VM;
* container;
* remote development server;
* isolated CI/workspace environment.

### Security requirement

The execution environment must be isolated enough that an agent cannot accidentally compromise unrelated projects or host resources.

---

# 11. Agent Permissions

Define explicit capability boundaries.

Potential permission levels:

```text
READ
WRITE
EXECUTE
DESTRUCTIVE
SENSITIVE
```

Example:

| Capability             | Default           |
| ---------------------- | ----------------- |
| Read project docs      | Allowed           |
| Read tasks             | Allowed           |
| Read goals             | Allowed           |
| Create task            | Allowed           |
| Modify task            | Allowed           |
| Complete task          | Controlled        |
| Modify financial data  | Restricted        |
| Execute shell commands | Project-scoped    |
| Delete data            | Explicit approval |
| Production deployment  | Explicit approval |
| External side effects  | Explicit approval |

The exact permission model should be determined during implementation.

---

# 12. Human Approval Gates

The agent should distinguish between:

### Low-risk operations

Examples:

* reading documentation;
* searching tasks;
* generating plans;
* creating draft tasks;
* running tests;
* inspecting Git status.

### Higher-risk operations

Examples:

* deleting records;
* modifying financial records;
* changing security settings;
* deploying production code;
* performing irreversible migrations;
* external communication;
* actions with significant real-world consequences.

Higher-risk operations should require explicit authorization where appropriate.

---

# 13. Agent Audit Trail

Every agent-initiated mutation should be attributable.

Record:

```text
agent/provider
session
timestamp
operation
target entity
previous state
new state
authorization context
result
```

Example:

```text
Agent: codex
Session: abc123
Action: update_task
Task: 8f31...
Previous status: planned
New status: in_progress
Result: success
```

This allows Life OS to answer:

> "What did the agent change?"

and:

> "Why was this change made?"

---

# 14. Planning → Task Generation

One of the primary intelligence-layer workflows should be:

```text
Life OS Context
       ↓
Agent understands current state
       ↓
Agent analyzes objective
       ↓
Agent creates implementation plan
       ↓
Plan reviewed/approved
       ↓
Tasks generated
       ↓
Tasks executed
       ↓
Verification
       ↓
Life OS updated
```

The agent should not simply dump an LLM-generated task list into the database.

Generated tasks must still satisfy Life OS's normal validation and domain constraints.

---

# 15. Agent Development Workflow

Target development workflow:

```text
User
 │
 ▼
Agent Harness
 │
 ├── inspect repository
 ├── inspect .planning
 ├── inspect skills
 ├── retrieve Life OS context
 │
 ▼
Plan
 │
 ▼
Human approval where required
 │
 ▼
Implementation
 │
 ├── edit code
 ├── run tests
 ├── run type checks
 ├── run lint
 └── inspect Git diff
 │
 ▼
Verification
 │
 ▼
Commit / handoff
```

The existing GSD planning methodology should remain the authoritative development process.

The intelligence layer should **operate within that methodology**, not replace it.

---

# 16. GSD Integration

Future agent support should understand:

```text
.planning/
├── PROJECT.md
├── REQUIREMENTS.md
├── ROADMAP.md
├── STATE.md
├── phases/
│   ├── 01-...
│   ├── 02-...
│   ├── 03-...
│   └── ...
└── ...
```

Agents should be able to:

* inspect the current phase;
* understand completed work;
* identify pending work;
* read phase plans;
* execute phase tasks;
* update appropriate planning artifacts;
* perform verification;
* report deviations;
* preserve project state.

Agents must not silently rewrite project requirements or architectural decisions.

---

# 17. Agent Provider Abstraction

Avoid provider-specific assumptions throughout Life OS.

Potential abstraction:

```text
AgentProvider
├── provider_id
├── capabilities
├── tool_support
├── context_support
├── execution_support
└── session metadata
```

The exact abstraction should only be introduced if multiple providers actually require it.

Do not build an elaborate abstraction layer prematurely.

---

# 18. Context Management

The intelligence layer should eventually provide agents with relevant context from:

* current goals;
* active projects;
* tasks;
* schedules;
* financial constraints;
* domain state;
* project documentation;
* planning artifacts;
* previous decisions;
* skills;
* architecture decisions.

However:

> **Context should be retrieved intentionally, not indiscriminately.**

Avoid sending sensitive or irrelevant Life OS data to an agent unless required for the requested operation.

---

# 19. Security & Privacy

The intelligence layer must be designed under a zero-trust mindset.

Requirements should include:

* least-privilege access;
* project-scoped execution;
* explicit tool permissions;
* authentication;
* authorization;
* sensitive-data boundaries;
* audit logging;
* safe handling of secrets;
* no uncontrolled database access;
* no unrestricted host access;
* validation of all agent mutations;
* protection against prompt/context injection where applicable.

Agent instructions must never override application-level authorization.

---

# 20. Financial Domain Protection

Financial functionality requires particularly strict boundaries.

The agent must not be able to bypass financial-domain invariants through:

* MCP;
* CLI;
* direct API calls;
* scripts;
* database access;
* generated code.

The same finance constraints implemented for the normal application must apply to agent operations.

Target:

```text
                Agent
                  │
            MCP / CLI / API
                  │
           Finance Services
                  │
          Validation / Rules
                  │
                 DB
```

No shortcut.

---

# 21. Multi-Agent Future

Once the base agent architecture is stable, investigate specialized agents.

Potential roles:

```text
Planner
Researcher
Developer
Reviewer
Finance Assistant
Project Manager
Documentation Agent
```

These should be considered **future extensions**, not requirements for the first intelligence-layer implementation.

Avoid multi-agent complexity until a single capable agent can reliably operate through the common interface.

---

# 22. External Knowledge & Research

Future agents may be allowed to retrieve external information for tasks such as:

* researching technologies;
* comparing implementation approaches;
* finding documentation;
* evaluating libraries;
* researching APIs;
* preparing project plans.

External research must remain distinguishable from authoritative Life OS data.

The agent should clearly distinguish:

```text
Life OS fact
Project documentation
External source
Agent inference
User-provided information
```

---

# 23. Model / Subscription Strategy

Life OS should not assume that intelligence requires a dedicated API subscription.

Where technically and legally appropriate, existing agent subscriptions may be used through their supported CLI/harness interfaces.

Potential strategy:

```text
                    Life OS
                       │
                  Common Tools
                       │
       ┌───────────────┼───────────────┐
       │               │               │
    AGY CLI        Claude Code      Codex CLI
       │               │               │
   Existing        Existing        Existing
  subscription    subscription    subscription
```

The system should remain provider-neutral.

Subscription availability must never become an architectural dependency of Life OS itself.

---

# 24. Observability

The future agent layer should expose enough information to diagnose:

* tool calls;
* failed operations;
* authorization failures;
* context retrieval;
* agent sessions;
* execution duration;
* task mutations;
* generated plans;
* verification results.

This is essential once agents are trusted with meaningful system operations.

---

# 25. Testing Strategy

Agent integration must be tested at multiple levels.

### Unit

Test:

* tool validation;
* permission checks;
* domain service invocation;
* input validation;
* serialization.

### Integration

Test:

```text
Agent → MCP → Application Service → DB
Agent → CLI → Application Service → DB
```

### Security

Test:

* unauthorized operations;
* privilege escalation;
* direct database bypass;
* destructive operations;
* sensitive-data access;
* malformed tool arguments.

### End-to-end

Test representative workflows:

```text
Goal → Plan → Tasks → Execution → Verification
```

and:

```text
Financial context → Agent query → Validated operation
```

---

# 26. Rollout Strategy

The intelligence layer should be introduced incrementally.

### Stage 1 — Read-only

Agent can:

* inspect context;
* search documentation;
* inspect goals/projects/tasks;
* inspect planning state.

### Stage 2 — Safe writes

Agent can:

* create tasks;
* update non-sensitive metadata;
* create drafts/plans.

### Stage 3 — Development execution

Agent can:

* modify project files;
* run tests;
* run builds;
* use Git;
* perform controlled development workflows.

### Stage 4 — Controlled domain operations

Agent can perform selected Life OS mutations through validated services.

### Stage 5 — Advanced automation

Only after sufficient observability and safety:

* automated planning;
* scheduled workflows;
* proactive task management;
* cross-domain reasoning;
* specialized agents.

---

# 27. Explicitly Deferred

The following are intentionally **not part of the current implementation**:

* custom MCP server;
* Life OS CLI;
* agent provider abstraction;
* AGY integration;
* Claude Code integration;
* Codex integration;
* remote SSH agent environments;
* autonomous agents;
* multi-agent orchestration;
* AI-driven financial decisions;
* unrestricted shell access;
* automatic production deployment;
* autonomous destructive operations.

These should only be revisited after the current Life OS roadmap is completed or when a future phase explicitly schedules them.

---

# 28. Decision Gate Before Implementation

Before starting the intelligence layer, perform a dedicated architecture review.

Questions to answer:

1. What Life OS capabilities should agents access?
2. Which operations require human approval?
3. Which data is sensitive?
4. What belongs in MCP?
5. What belongs in the CLI?
6. What belongs in normal application services?
7. How will authentication work?
8. How will agent sessions be identified?
9. How will mutations be audited?
10. How will project execution be isolated?
11. Which agent harnesses will be supported initially?
12. What is the minimum useful implementation?
13. Which capabilities can safely remain manual?

No implementation should begin until these boundaries are documented.

---

# 29. Success Criteria

The intelligence layer is successful when:

* multiple agent harnesses can use Life OS through the same interfaces;
* Life OS remains the authoritative source of truth;
* agents cannot bypass domain rules;
* agents can discover relevant skills and documentation;
* agents can retrieve appropriate Life OS context;
* agents can generate plans and tasks;
* agents can execute development work in a controlled workspace;
* all meaningful mutations are auditable;
* sensitive operations have appropriate authorization;
* replacing one AI provider does not require redesigning Life OS;
* the existing GSD methodology remains intact.

---

# 30. Guiding Rule for Future Development

> **Build Life OS so that intelligence can plug into it — not so that Life OS becomes dependent on intelligence.**

The platform owns:

```text
Truth
Rules
State
Permissions
Persistence
Validation
Auditability
```

The agent owns:

```text
Reasoning
Planning
Synthesis
Navigation
Execution
Automation
```

The interface between them owns:

```text
Context
Tools
Capabilities
Authorization
```

This separation should remain a core architectural principle for all future AI/agent work.

---

## Current Status

**Deferred.**

The current implementation roadmap takes priority.

No existing phase should be disrupted solely to implement this intelligence layer.

When the current roadmap is complete, create a dedicated GSD phase for:

> **Life OS Intelligence & Agent Layer — MCP + CLI + Skills + Project Execution + Auditability**

That phase should begin with architecture/design and a fresh zero-trust review before implementation.

