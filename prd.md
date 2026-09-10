LifeOS
Product Requirements Document — v1.0

Status: Master Product Specification
Version: 1.0
Product: LifeOS
Primary User: Hamza
Primary Interface: Web Application
AI Interface: CLI / AI coding agents / future in-app AI
Development Approach: AI-assisted, specification-driven development

1. Product Vision

LifeOS is a personal operating system designed to help one person manage, understand, and improve their entire life from a single system.

It should unify:

Tasks
Projects
Goals
Habits
Daily planning
Calendar
Notes
Knowledge
Finances
Learning
Work
Personal development
Social media
Content creation
Relationships
Automation
AI-assisted planning and execution
Personal analytics

The system should not simply store information.

It should understand relationships between information.

For example:

A goal creates projects.
Projects create tasks.
Tasks consume time.
Time is scheduled on the calendar.
Completed tasks affect goals.
Habits affect long-term progress.
Financial activity affects financial goals.
Content ideas become social posts.
Social posts generate analytics.
Analytics influence future content.

LifeOS therefore acts as a personal information graph + execution system + AI assistant.

2. Core Product Philosophy
2.1 One Source of Truth

LifeOS should avoid having the same information duplicated across multiple modules.

For example:

A project should not have:

one task list
another task list inside calendar
another task list inside goals

Instead:

Goal
  ↓
Project
  ↓
Task
  ↓
Calendar / Time Block
  ↓
Completion
  ↓
Analytics

Every object should have a canonical representation.

3. Product Principles
Principle 1 — Capture Everything Quickly

Adding information should require minimal friction.

Examples:

"Buy monitor"

should be enough to create a task.

Likewise:

"Learn Docker for 30 minutes tomorrow"

should eventually be interpreted by AI into:

Task:
Learn Docker

Duration:
30 minutes

Date:
Tomorrow

Category:
Learning
Principle 2 — AI Should Assist, Not Control

AI may:

suggest
organize
summarize
prioritize
analyze
automate

But destructive or important actions should require explicit confirmation unless the user has configured automation.

Principle 3 — Everything Should Be Connected

Tasks, goals, projects, notes, habits, finances, calendar events and content should be linkable.

Principle 4 — Human-Readable Data

The user should always be able to understand what the system is doing.

Avoid black-box automation.

Principle 5 — Local-First Where Practical

Personal data is extremely sensitive.

The architecture should minimize unnecessary external data transmission.

Principle 6 — Extensible Architecture

LifeOS should be designed so additional modules can be added without rewriting the core.

4. High-Level Architecture
                    ┌─────────────────────┐
                    │      LifeOS UI      │
                    │                     │
                    │ Dashboard           │
                    │ Tasks               │
                    │ Projects            │
                    │ Goals               │
                    │ Calendar            │
                    │ Notes               │
                    │ Finance             │
                    │ Learning            │
                    │ Social              │
                    │ Analytics           │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Application      │
                    │       Layer         │
                    ├─────────────────────┤
                    │ Task Engine          │
                    │ Goal Engine          │
                    │ Planning Engine      │
                    │ Habit Engine         │
                    │ Content Engine       │
                    │ Finance Engine       │
                    │ Notification Engine  │
                    │ Automation Engine     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     AI Layer        │
                    ├─────────────────────┤
                    │ Context Retrieval    │
                    │ Planning             │
                    │ Summarization        │
                    │ Classification       │
                    │ Recommendations      │
                    │ Agents               │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Data Layer      │
                    ├─────────────────────┤
                    │ PostgreSQL          │
                    │ Object Storage      │
                    │ Search Index        │
                    │ Event Log           │
                    └─────────────────────┘
5. Primary Modules

LifeOS consists of the following major modules:

Dashboard
Tasks
Projects
Goals
Calendar
Daily Planning
Habits
Notes / Knowledge
Finance
Learning
Social Media
Content Management
Relationships
Analytics
Automations
AI Assistant
Settings
Activity / Audit Log
6. Dashboard

The dashboard is the primary home screen.

It should answer:

"What matters right now?"

Dashboard Sections
Today

Display:

Current date
Today's tasks
Scheduled events
Habits
Important deadlines
Current projects
Goals requiring attention
Priority

Display the highest-value tasks.

Priority should consider:

Importance
+
Urgency
+
Deadline
+
Goal relevance
+
Project relevance
+
Estimated effort
Progress

Display:

Daily completion
Weekly completion
Goal progress
Habit consistency
Project progress
Attention Required

Surface:

overdue tasks
stale projects
neglected goals
upcoming deadlines
financial issues
unfinished plans
Quick Capture

One universal input:

What do you want to add?

Examples:

Buy a new keyboard

Finish Dubai Estate MVP by Friday

Learn Docker networking

Post about Next.js tomorrow

Spent 2500 PKR on groceries

AI should eventually classify these automatically.

7. Task Management
Task Entity

Each task should support:

id
title
description
status
priority
dueDate
startDate
estimatedDuration
actualDuration
projectId
goalId
areaId
parentTaskId
tags
recurrence
dependencies
createdAt
updatedAt
completedAt
Status
Inbox
Todo
In Progress
Blocked
Completed
Cancelled
Priority
Low
Medium
High
Critical
Task Features
Create
Edit
Complete
Delete/archive
Reorder
Assign project
Assign goal
Add deadline
Add duration
Add dependencies
Recurring tasks
Subtasks
Tags
Notes
Attachments
Time tracking
8. Projects

Projects represent outcomes requiring multiple tasks.

Example:

Project:
Dubai Estate MVP

Goal:
Build sustainable web-development income

Tasks:
├── Authentication
├── Property listings
├── Payments
├── Dashboard
├── Deployment
└── Testing
Project Fields
id
name
description
status
priority
startDate
deadline
progress
area
goalId
owner
createdAt
updatedAt
Project Status
Planning
Active
Paused
Completed
Archived
Project Dashboard

Show:

progress
tasks
milestones
deadlines
time spent
linked goals
notes
related resources
activity
9. Goals

Goals define desired outcomes.

Goals should operate at multiple levels.

Vision
  ↓
Yearly Goal
  ↓
Quarterly Goal
  ↓
Project
  ↓
Task

Example:

Vision:
Become financially independent through software

Goal:
Increase monthly income

Projects:
├── Dubai Estate
├── Freelance Outreach
└── Product Development

Tasks:
├── Contact 10 prospects
├── Improve portfolio
└── Ship MVP
Goal Fields
id
name
description
type
targetValue
currentValue
unit
deadline
status
parentGoalId

Goal types:

Outcome
Metric
Milestone
Financial
Personal
Professional
Learning
10. Calendar

Calendar should combine:

external calendar events
LifeOS tasks
time blocks
habits
deadlines

The calendar must not duplicate task data.

A scheduled task should remain the same task entity.
11. Daily Planning

Daily planning is one of the most important LifeOS features.

Every day should have a planning workflow.

Morning Planning

The system should show:

Yesterday:
- completed
- unfinished
- important events

Today:
- calendar
- deadlines
- high-priority tasks
- habits

Suggested Plan:
09:00 — Deep Work
11:00 — Admin
14:00 — Development
17:00 — Learning

AI may propose the schedule.

User approves or modifies it.

12. Daily Review

At the end of the day:

What did you complete?

What remains unfinished?

What blocked you?

What should move to tomorrow?

How productive did today feel?

What did you learn?

AI should generate:

Daily Summary

with:

accomplishments
unfinished work
patterns
recommendations
13. Habits

Habit tracking should focus on meaningful behavior rather than gamification.

Examples:

Exercise
Read
Study
Sleep routine
Deep work
Content creation
Habit Fields
name
frequency
target
unit
streak
currentValue
reminder
active

Supported frequency:

Daily
Weekly
Specific weekdays
Custom interval
14. Notes / Knowledge

LifeOS should provide a lightweight personal knowledge system.

Notes can be linked to:

tasks
projects
goals
people
content
learning topics
Note Types
Quick Note
Meeting Note
Research
Idea
Journal
Documentation
Reference
Learning Note

Notes should support Markdown.

15. Knowledge Graph

Objects should be linkable.

Example:

[Docker]
   ↓
[Learning Goal]
   ↓
[Docker Learning Project]
   ↓
[Docker Tasks]
   ↓
[Docker Notes]

A note may reference a project.

A project may reference a goal.

A task may reference a note.

The system should preserve these relationships.

16. Finance

Finance should initially remain simple.

The objective is awareness and decision support, not accounting software.

Transactions
income
expense
transfer

Fields:

amount
currency
category
description
date
account
project
tags

Currency must support PKR initially.

Categories

Example:

Food
Transport
Hardware
Software
Entertainment
Education
Business
Bills
Other
Finance Dashboard

Show:

Income
Expenses
Savings
Monthly trend
Category breakdown
Upcoming expenses
Financial goals
17. Learning System

Learning should connect knowledge with actual progress.

A learning item may contain:

Topic
Goal
Resources
Notes
Tasks
Projects
Progress

Example:

Docker

Goal:
Become proficient with Docker

Resources:
- Documentation
- Tutorials

Tasks:
- Learn networking
- Learn volumes
- Learn Compose

Projects:
- Containerize WordPress stack
18. Social Media System

Social media is a first-class LifeOS module.

The objective is to manage the entire content lifecycle.

Idea
 ↓
Draft
 ↓
Review
 ↓
Scheduled
 ↓
Published
 ↓
Analytics
 ↓
Learning
 ↓
Future Content
19. Social Platforms

The architecture should support platforms through adapters.

Example:

SocialProvider
├── X
├── LinkedIn
├── Instagram
├── Facebook
├── YouTube
└── TikTok

Do not hard-code platform-specific logic into the core content system.
20. Content Entity
id
title
body
media
platforms
status
scheduledAt
publishedAt
contentType
topic
campaign
tags
createdAt
updatedAt
Content Status
Idea
Draft
Review
Approved
Scheduled
Published
Archived
21. Content Types

Support:

Text
Image
Video
Carousel
Thread
Article
Short-form video
22. Content Calendar

The user should be able to see:

Monday
LinkedIn post

Tuesday
X post

Wednesday
Instagram

Thursday
YouTube

Friday
LinkedIn

The calendar should visually show content state.

23. Social Media AI

AI should help with:

Idea generation

Based on:

interests
previous content
current projects
learning
trends
audience
performance history
Drafting

AI can create drafts.

The user must remain in control of publishing.

Repurposing

Example:

Long article
 ↓
LinkedIn post
 ↓
X thread
 ↓
Instagram carousel
 ↓
Short video script
Analytics

Track:

views
likes
comments
shares
saves
clicks
followers
engagement rate
24. Content Intelligence

LifeOS should eventually answer:

What type of content performs best for me?

Example:

Your technical posts generated:

+42% average engagement

Your personal posts generated:

+18%

Your tutorial posts generated:

+67%

AI can then recommend:

Create more tutorial content about Next.js.
25. Relationships

A lightweight CRM should manage important people.

Person:

name
relationship
company
role
contact information
notes
lastInteraction
nextFollowUp
tags

Possible relationship types:

Client
Friend
Family
Colleague
Prospect
Mentor
Professional
26. AI Assistant

AI is not simply a chatbot.

It should understand LifeOS context.

The assistant should be able to answer:

What should I work on today?

Why am I behind on my goals?

What projects are currently active?

What did I accomplish this week?

How much did I spend this month?

What content should I publish?

What should I learn next?

What tasks are becoming overdue?
27. AI Context System

The AI should retrieve relevant context instead of dumping the entire database into a prompt.

Conceptually:

User Request
      ↓
Intent Detection
      ↓
Context Retrieval
      ↓
Relevant Entities
      ↓
LLM
      ↓
Response / Action Proposal
28. AI Actions

Actions should use structured tools.

Example:

create_task()
update_task()
complete_task()
create_project()
create_goal()
schedule_task()
create_note()
create_content()
create_transaction()

AI should never directly manipulate database records through arbitrary SQL.

29. Confirmation System

Actions should have risk levels.

Low Risk

Can execute automatically:

Create draft note
Create task
Generate content draft
Summarize notes
Medium Risk

Ask confirmation:

Reschedule many tasks
Modify goals
Create financial transaction
High Risk

Always require explicit confirmation:

Delete data
Publish social media
Send message
Move money

30. Automation Engine

LifeOS should eventually support:

Trigger
 ↓
Condition
 ↓
Action

Example:

WHEN
task becomes overdue

IF
priority = high

THEN
notify user

Another:

WHEN
new content is published

THEN
create analytics tracking record
31. Automation Examples
Every morning at 8 AM
→ Generate daily plan

Every Sunday
→ Generate weekly review

Task overdue
→ Notify user

Goal progress unchanged for 14 days
→ Flag goal

Content published
→ Record analytics

End of month
→ Generate financial summary
32. Notifications

Notification channels should be abstracted.

NotificationProvider
├── In-App
├── Email
├── Browser
└── Future providers

Users should control notification preferences.

33. Search

Global search must search:

Tasks
Projects
Goals
Notes
People
Transactions
Content
Learning

Search should support:

exact matching
fuzzy search
tags
filters
dates
semantic search in future versions
34. Global Command Palette

LifeOS should have a command palette similar to developer tools.

Example:

⌘/Ctrl + K

Commands:

Create task
Create project
Create note
Search
Go to dashboard
Plan today
Create content
Record expense
Ask AI
35. Universal Capture

The system should eventually support natural language capture.

Examples:

"Remind me to call Ali tomorrow"

"Spent 1200 on food"

"Create a project for learning Docker"

"Post about my new project Friday"

"Make today's most important task finishing authentication"

The AI should infer structured entities.

36. Areas

LifeOS should organize life into broad areas.

Example:

Work
Business
Learning
Finance
Health
Personal
Social
Content

Areas should be configurable.

37. Time Tracking

Tasks can optionally track:

estimated duration
actual duration
sessions

Example:

Task:
Build authentication

Estimated:
3h

Actual:
4h 20m

This creates useful planning data.

38. Analytics

LifeOS should measure execution, not just activity.

Important metrics:

Task completion rate
Overdue rate
Goal progress
Project velocity
Deep-work time
Habit consistency
Content performance
Income
Expenses
Learning hours
39. Weekly Review

Weekly review should summarize:

Wins

What was accomplished?

Failures

What was repeatedly postponed?

Goals

Which goals progressed?

Projects

Which projects moved forward?

Time

Where did time go?

Finance

How much was spent/earned?

Content

What performed best?

Recommendations

What should change next week?

40. Monthly Review

Monthly review should identify trends.

Example:

Productivity ↑ 14%

Overdue tasks ↓ 8%

Learning ↑ 21%

Expenses ↑ 6%

Content engagement ↑ 34%

AI should explain the major changes.

41. Data Model

Core entities:

User

Area

Task

TaskDependency

Project

ProjectMember

Goal

GoalProgress

Habit

HabitEntry

CalendarEvent

TimeBlock

Note

Tag

Person

Interaction

Transaction

Account

LearningItem

Resource

Content

ContentPlatform

ContentPublication

ContentMetric

Automation

AutomationRun

Notification

AIConversation

AIMessage

AIAction

Attachment

AuditLog
42. Entity Relationships

Simplified:

User
 │
 ├── Areas
 │
 ├── Goals
 │     └── Projects
 │           └── Tasks
 │
 ├── Habits
 │
 ├── Calendar
 │
 ├── Notes
 │
 ├── Finance
 │
 ├── Learning
 │
 ├── People
 │
 └── Content
        └── Publications
               └── Metrics
43. Database Requirements

Preferred database:

PostgreSQL

Requirements:

proper foreign keys
indexes
timestamps
soft deletion where appropriate
migrations
transaction safety
unique constraints
normalized core data
JSON fields only where justified

Do not use JSON blobs as a replacement for proper relational modeling.

44. API Architecture

The application should expose a clean service/API layer.

Conceptually:

/api/tasks
/api/projects
/api/goals
/api/habits
/api/calendar
/api/notes
/api/finance
/api/content
/api/social
/api/people
/api/analytics
/api/ai

Implementation should follow the existing project's framework conventions rather than blindly following these URLs.

45. Authentication

Authentication must support:

secure sessions
OAuth providers where appropriate
protected routes
server-side authorization
session expiration
account deletion

Only the owner should have access initially.

Architecture should not prevent multi-user support later.

46. Authorization

Every protected operation must verify:

authenticated user
+
resource ownership
+
permission

Never trust IDs supplied by the client.

47. Security Requirements

Must include:

secure authentication
CSRF protection where applicable
input validation
output escaping
rate limiting
secure cookies
encrypted secrets
server-side authorization
audit logging for sensitive actions

Social API credentials must never be exposed to the browser.

48. Privacy

LifeOS contains extremely sensitive personal information.

Therefore:

minimize external API transmission
encrypt sensitive credentials
never log secrets
never expose private data in analytics
separate AI context from raw database access
provide data export
provide data deletion
49. Backup

The system should support:

Database backup
Data export
Import
Restore

Exports should use a documented format.

Example:

lifeos-export/
├── tasks.json
├── projects.json
├── goals.json
├── notes/
├── finance.json
└── content.json

50. Audit Log

Sensitive actions should be recorded.

Example:

User created task
AI updated task
User deleted project
Content published
Automation executed

Audit records should include:

actor
action
entity
timestamp
metadata
51. UI Design

The interface should prioritize:

speed
clarity
low cognitive load
keyboard navigation
responsive design
dense information when useful
clean visual hierarchy

Avoid:

excessive animations
dashboard decoration
unnecessary gamification
giant cards everywhere
information overload

The UI should feel like a serious operating system, not a SaaS template.

52. Responsive Design

Desktop is the primary interface.

Mobile should still support:

task capture
daily planning
calendar
habit tracking
notes
notifications
AI assistant
content capture
53. Accessibility

Must support:

keyboard navigation
semantic HTML
proper focus management
screen-reader labels
sufficient contrast
reduced motion
54. Performance

Targets:

Fast initial dashboard load
Minimal unnecessary client-side requests
Optimistic UI where safe
Pagination for large datasets
Virtualization for large lists
Indexed database queries
Background processing for expensive AI operations
55. AI Architecture

AI must be provider-independent.

Create an abstraction:

AIProvider

Possible providers:

OpenAI
Anthropic
Google
Local models

The application should not be structurally tied to one provider.

56. AI Memory

AI should have several context levels.

Immediate Context

Current conversation.

Personal Context

Relevant stable information.

Operational Context

Current tasks, goals, projects and schedule.

Historical Context

Previous activity and analytics.

Knowledge Context

Notes and documents.

The retrieval system should determine which context is relevant.

57. AI Memory Rules

The AI must distinguish:

Fact
Preference
Temporary state
Inference
Suggestion

It should not automatically treat an inference as a permanent fact.

58. AI Agent Architecture

Future agents:

Planner Agent
Research Agent
Content Agent
Finance Agent
Review Agent
Learning Agent
Automation Agent

Agents should use shared tools.

Example:

Planner Agent
 ├── get_tasks()
 ├── get_calendar()
 ├── get_goals()
 ├── get_projects()
 └── create_time_block()
59. Agent Safety

Agents must:

have explicit tool permissions
have action limits
log actions
respect user confirmation rules
fail safely
never fabricate successful actions
60. Social Media Safety

Publishing is a privileged action.

Default:

AI generates content
        ↓
User reviews
        ↓
User approves
        ↓
System publishes

Autonomous publishing may exist later as an explicit opt-in automation.

61. Integrations

Architecture should support integrations through adapters.

Potential integrations:

Google Calendar
GitHub
Social platforms
Email
Cloud storage
Payment/finance providers
AI providers

Integrations should be optional.

LifeOS core must work without them.

62. GitHub Integration

Potential future features:

GitHub repositories
Issues
Pull requests
Commits
Activity

This could allow:

Project:
Dubai Estate

GitHub:
h-waqar/dubai-estate

Activity:
12 commits
3 PRs
4 issues

GitHub activity can contribute to project progress.

63. Developer Workflow Integration

Because LifeOS is also intended to manage development work, it should eventually understand:

Projects
Repositories
Issues
Deployments
Development sessions
Learning

However, LifeOS should not replace GitHub or Linear.

It should aggregate and orchestrate them.

64. Event Architecture

Important system events should be emitted internally.

Examples:

task.created
task.completed
task.overdue
project.completed
goal.progressed
content.published
transaction.created
habit.completed
automation.executed

This enables future automation without rewriting existing modules.

65. Event Bus

Create an internal event abstraction.

Example:

EventBus.publish({
  type: "task.completed",
  entityId: task.id
})

Consumers may include:

Analytics
Notifications
AI
Automations
Activity Log
66. Background Jobs

Expensive work should run asynchronously.

Examples:

AI analysis
social analytics sync
calendar synchronization
weekly report generation
notifications
content processing
embeddings

The UI should never wait unnecessarily for these operations.

67. Search Architecture

Initial version:

PostgreSQL full-text search

Future:

Vector embeddings
+
semantic retrieval

Do not introduce a vector database prematurely.

68. Attachments

Attachments should support:

images
documents
videos
other files

Storage should use an abstraction:

StorageProvider

Possible implementation:

Local
S3-compatible
Cloud storage
69. Settings

Settings should include:

Account

Profile and authentication.

Appearance

Theme and UI preferences.

Notifications

Notification rules.

AI

Provider/model/settings.

Integrations

Connected services.

Privacy

Data controls.

Automation

Automation permissions.

Social

Connected platforms.

70. Import / Export

Users should be able to export their data.

Supported formats should eventually include:

JSON
CSV
Markdown
71. MVP Definition

The first release must NOT attempt to build every feature.

The MVP should include:

Authentication
Dashboard
Tasks
Projects
Goals
Daily Planning
Calendar
Habits
Notes
Global Search
AI Assistant
Basic Analytics
Settings

Social media should initially provide:

Content ideas
Drafts
Content calendar
Platform-independent content management

Actual publishing integrations should come later.

72. Phase 1 — Foundation

Build:

Project architecture
Authentication
Database
Design system
Navigation
User settings
Core entities
Audit logging

Acceptance criteria:

application starts reliably
database migrations work
authentication works
protected routes work
base UI works
automated tests exist
73. Phase 2 — Core Productivity

Build:

Tasks
Projects
Goals
Calendar
Daily Planning
Habits
Dashboard

Acceptance criteria:

A user can:

create a goal
→ create a project
→ create tasks
→ schedule tasks
→ complete tasks
→ see progress reflected
74. Phase 3 — Knowledge

Build:

Notes
Tags
Relationships
Search
Learning

Acceptance criteria:

A user can connect:

Note
→ Project
→ Goal
→ Task

and discover the relationship through search/navigation.

75. Phase 4 — Finance

Build:

Accounts
Transactions
Categories
Financial goals
Reports

Acceptance criteria:

The user can record income/expenses and see accurate totals.

Financial calculations must be covered by tests.

76. Phase 5 — Social Media

Build:

Content ideas
Content editor
Content calendar
Draft management
Platform abstraction
Content analytics model

No publishing automation initially.

77. Phase 6 — AI

Build:

AI provider abstraction
Context retrieval
Tool calling
AI assistant
Natural language capture
Daily planning
Weekly review
78. Phase 7 — Automation

Build:

Event bus
Triggers
Conditions
Actions
Notifications
Background jobs
79. Phase 8 — External Integrations

Build adapters for selected services.

Examples:

Calendar
GitHub
Social platforms
Email
Storage

Only build integrations when they provide clear value.

80. Phase 9 — Intelligence

Advanced functionality:

Personal analytics
Trend detection
Goal risk detection
Time optimization
Content intelligence
AI recommendations
Semantic knowledge search
81. Testing Strategy

Testing is mandatory.

Unit Tests

Test:

business logic
calculations
prioritization
goal progress
habit calculations
finance
recurrence
automation rules
Integration Tests

Test:

API
Database
Authentication
AI tools
External integrations
End-to-End Tests

Critical flows:

Login

Create goal

Create project

Create task

Schedule task

Complete task

Daily planning

Weekly review

Create content

Record transaction
82. AI Testing

AI functionality must not rely exclusively on manual testing.

Use deterministic tool tests.

Example:

Input:
"Create a task to finish authentication tomorrow"

Expected:
tool = create_task

title = "Finish authentication"

dueDate = tomorrow

The exact wording can vary, but structured output must satisfy schema validation.

83. Database Testing

Test:

foreign keys
unique constraints
cascading behavior
transactions
migrations
ownership isolation
84. Security Testing

Test:

unauthenticated access
cross-user resource access
invalid input
expired sessions
malicious payloads
rate limits
85. Definition of Done

A feature is NOT done merely because it renders in the browser.

A feature is done when:

UI exists
+
API/service exists
+
Database logic exists
+
Validation exists
+
Error handling exists
+
Loading states exist
+
Empty states exist
+
Tests exist
+
Authorization exists
+
Documentation exists
86. AI Coding Agent Requirements

AI coding agents must work from this PRD.

They should:

Inspect the existing repository.
Understand the architecture before modifying it.
Never rewrite working architecture without justification.
Create a plan before implementation.
Implement one logical feature at a time.
Run tests after changes.
Run lint/type checking.
Verify database migrations.
Verify affected UI flows.
Report failures honestly.
87. AI Agent Rules

The agent must NEVER:

Invent APIs
Invent environment variables
Invent database schemas without documenting them
Delete working functionality casually
Disable tests to make them pass
Suppress TypeScript errors
Use `any` unnecessarily
Hard-code secrets
Commit credentials
Bypass authentication
88. Code Quality

Preferred:

TypeScript
Strict typing
Small modules
Clear domain boundaries
Reusable components
Server-side validation
Typed API contracts
Database transactions
Error boundaries

Avoid:

God components
God services
Huge route handlers
Duplicated business logic
Untyped objects
Magic strings
Global mutable state
89. Project Structure

The exact structure should adapt to the selected framework, but conceptually:

src/
├── app/
├── components/
├── features/
│   ├── tasks/
│   ├── projects/
│   ├── goals/
│   ├── habits/
│   ├── calendar/
│   ├── notes/
│   ├── finance/
│   ├── learning/
│   ├── social/
│   └── ai/
├── lib/
│   ├── auth/
│   ├── db/
│   ├── ai/
│   ├── events/
│   ├── automation/
│   └── storage/
├── server/
├── types/
└── tests/

The existing repository architecture must be inspected before imposing this structure.

90. Documentation

The repository must contain:

README.md
ARCHITECTURE.md
CONTRIBUTING.md
docs/
├── product/
├── architecture/
├── database/
├── ai/
├── integrations/
└── operations/
91. Environment Configuration

Environment variables should be documented.

Example categories:

DATABASE
AUTH
AI
STORAGE
EMAIL
SOCIAL
CALENDAR
GITHUB

Never commit actual secrets.

Provide:

.env.example
92. Deployment

The system should support containerized deployment.

Production requirements:

Application container
Database
Background worker where required
Persistent storage
Reverse proxy
HTTPS
Backups
Logging

The deployment architecture should remain compatible with a VPS deployment.

93. Observability

Production should have:

structured logs
error tracking
health endpoint
database health checks
job monitoring
AI action logging
94. Disaster Recovery

Document:

database backup procedure
restore procedure
application recovery
environment restoration
data export

A backup that has never been restored is not a backup strategy.

95. UX Principle — Zero Friction

The user should rarely need to navigate through multiple pages to perform basic actions.

Examples:

Create task:
1 interaction

Complete task:
1 interaction

Capture idea:
1 interaction

Record expense:
minimal interactions

Ask AI:
1 interaction
96. UX Principle — Progressive Complexity

Simple users see:

Task
Project
Goal

Advanced users can access:

dependencies
automation
analytics
relationships
AI tools
metadata

Do not expose every database field in every form.

97. UX Principle — Contextual Information

When viewing a task, show relevant context:

Task
 ↓
Project
 ↓
Goal
 ↓
Deadline
 ↓
Related notes
 ↓
Calendar block

Avoid forcing the user to manually search for related information.

98. Core User Journeys
Journey 1 — Capture
User enters:
"Finish Dubai Estate authentication tomorrow"

AI interprets

Task created

Task linked to Dubai Estate project

Due date assigned
Journey 2 — Daily Planning
Open dashboard

LifeOS analyzes:

calendar
deadlines
tasks
goals
projects

AI proposes plan

User approves

Time blocks created
Journey 3 — Goal Progress
Goal
 ↓
Projects
 ↓
Tasks
 ↓
Completion

Goal progress updates
Journey 4 — Content
Idea

Draft

Review

Schedule

Publish

Analytics

AI recommendation
Journey 5 — Weekly Review
Sunday

System analyzes:

tasks
projects
goals
habits
time
finance
content

AI generates weekly review

User adjusts next week
99. Future Vision

Eventually LifeOS should behave like a genuine personal operating system.

The user should be able to say:

"Plan my week."

And LifeOS should understand:

my goals
my projects
my deadlines
my calendar
my habits
my energy/time constraints
my current workload
my recent performance

and propose a realistic plan.

100. Long-Term AI Vision

The eventual system:

                   LIFEOS AI
                       │
          ┌────────────┼────────────┐
          │            │            │
       Planner      Analyst       Creator
          │            │            │
          └────────────┼────────────┘
                       │
                  Tool System
                       │
       ┌───────────────┼────────────────┐
       │               │                │
     Tasks          Calendar          Goals
       │               │                │
    Projects         Habits          Finance
       │               │                │
     Notes           Learning         Social

The AI should become an orchestration layer over the user's life data, rather than simply a chat window.

101. MVP Success Criteria

The MVP succeeds if the user can open LifeOS and answer these questions immediately:

What should I do today?

Yes.

What am I currently working on?

Yes.

Why am I doing it?

Linked goal.

What is overdue?

Yes.

What are my important goals?

Yes.

How am I progressing?

Yes.

What did I accomplish?

Yes.

What should I do next?

AI-assisted answer.

What should I publish?

Content system + AI assistance.

102. Non-Goals

LifeOS should NOT initially attempt to become:

A full accounting platform
A full project-management SaaS
A social network
A CRM replacement
A GitHub replacement
A calendar replacement
A medical system
A banking system

It should orchestrate and connect these domains, not rebuild every existing product.

103. Development Strategy

Development should happen in vertical slices.

Bad:

Build entire database
Build entire backend
Build entire frontend
Then integrate

Preferred:

Feature:
Tasks

Database
+
Service
+
API
+
UI
+
Tests
+
AI tools

Then move to the next feature.

104. Repository Verification Process

When the repository is provided, the implementation should be evaluated against this PRD.

The verification process should include:

Architecture Audit

Check:

framework
database
folder structure
domain boundaries
state management
API architecture
authentication
Feature Audit

Map:

PRD requirement
→ implementation
→ test
→ status

Statuses:

Complete
Partial
Missing
Incorrect
Needs Refactor
105. Automated Verification

Where possible:

install dependencies
run typecheck
run lint
run unit tests
run integration tests
run E2E tests
build production bundle
run database migrations

The exact commands must be determined from the repository rather than assumed.

106. PRD-to-Code Traceability

Maintain a machine-readable requirement list.

Example:

REQ-TASK-001
REQ-TASK-002
REQ-GOAL-001
REQ-AI-001
REQ-SOCIAL-001

Every major feature should map to requirements.

This makes future AI development dramatically easier.

107. Implementation Rule

The PRD is the product contract.

The repository is the implementation.

If they disagree:

inspect
→ identify reason
→ decide
→ update PRD or implementation
→ document decision

Never silently allow architecture drift.

108. Final Product Definition

LifeOS is:

A personal operating system that connects goals, projects, tasks, time, knowledge, money, learning, relationships and content, with an AI layer capable of understanding context and helping the user plan and execute their life.

The system should optimize for:

Clarity
Execution
Consistency
Learning
Leverage
Automation
Long-term progress

Not merely:

More tasks
More notifications
More dashboards
More gamification
109. Build Priority

The implementation priority is:

P0
Foundation
Authentication
Database
Architecture
Design System

P1
Tasks
Projects
Goals
Dashboard
Daily Planning
Calendar

P2
Habits
Notes
Search
Learning

P3
Finance
Analytics

P4
Content
Social Media

P5
AI Assistant
AI Tools
Context Retrieval

P6
Automation
Integrations

P7
Advanced Intelligence

110. The Ultimate Test

LifeOS should pass this test:

If the user stopped using every other productivity application tomorrow, could LifeOS still tell them what matters, what they need to do, why it matters, how they are progressing, and what they should do next?

If the answer is no, the system is incomplete.

END OF PRD