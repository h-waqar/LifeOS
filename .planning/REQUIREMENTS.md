# Requirements: LifeOS (Milestone v2.1)

**Defined:** 2026-10-02  
**Milestone:** v2.1 — Production Hardening & External Quality Assurance  
**Core Value:** A single source of truth connecting goals, projects, tasks, time, knowledge, money, learning, relationships, and content—powered by an AI layer that understands context and helps plan and execute without fragmented tools, duplicate entry, or siloed data.  

## v2.1 Requirements

Requirements for Milestone v2.1, executing the authoritative Deferred Independent QA Register (`docs/qa/deferred-independent-qa.md`) and technical debt reconciliation established during Phase 1 Plan 01-09, Phase 14, and Phase 15.

### Physical Hardware & Mobile Ergonomics

- [x] **QA-01**: Physical Handheld Phone Testing — verification of layout reflow, touch responsiveness, thumb ergonomics, and edge margins on real physical iOS Safari and Android Chrome smartphones.
- [x] **QA-02**: Physical Tablet Device Testing — verification of usability, split-view multitasking, portrait/landscape orientation change, and responsive grid reflow on physical iPad and Android tablet hardware.
- [x] **QA-03**: Real-World Touch & Tactile Ergonomics — verification of thumb zone reachability, tap target bounds (>=44px), scroll momentum, and virtual keyboard viewport resizing without UI displacement.
- [x] **PROD-02**: Mobile Audio Hardware & Ambient Noise Field Testing — verification of Web Speech API voice capture with external microphones, built-in phone microphones, and ambient background noise suppression.

### Assistive Technology & Accessibility

- [x] **QA-04**: Native Screen-Reader Testing — real-world auditory verification and keyboard traversal using native screen readers: NVDA and JAWS on Windows, VoiceOver on macOS and iOS, and TalkBack on Android.

### Cross-Browser Engines & Journey Regression

- [x] **QA-05**: Cross-Browser Engine Compatibility — verification across major non-Chromium desktop browser rendering engines: Mozilla Firefox (Gecko), Apple Safari (WebKit), and Microsoft Edge.
- [x] **QA-06**: Independent Tester Challenge of H01–H12 Scenarios — adversarial re-testing of core productivity scenarios H01 through H12 by an external tester probing edge cases, rapid double-submissions, and boundary conditions.
- [x] **QA-07**: Holistic Project-Wide Regression — complete end-to-end integration regression spanning Core OS (Phases 1–9) and Agent Platform (Phases 10–18) confirming overall system stability.

### Production Infrastructure & Schema Alignment

- [x] **PROD-01**: Production-Environment Verification — live testing under real production cloud constraints: TLS termination, reverse proxy header forwarding, HTTP/2 or HTTP/3, and private CDN cache-control headers.
- [x] **PROD-03**: Drizzle Kit Migration Snapshot Baseline Alignment — reconcile historical snapshot gap for migrations 0012–0026, establishing a verified introspection baseline without modifying existing journal or data integrity.

## Future Requirements (v3.0+)

### Proactive Personal OS Orchestration

- **ORCH-01**: Multi-agent proactive orchestration layer (Planner, Analyst, Creator) coordinating life data.
- **ORCH-02**: "Plan my week" natural language synthesis integrating goals, calendar, deadlines, habits, energy, and workload.
- **ORCH-03**: Proactive daily interventions and automated schedule rebalancing based on detected energy dips.

### Automated Social Publishing

- **PUB-01**: Automated multi-platform OAuth publishing to Twitter/X, LinkedIn, and personal blog.
- **PUB-02**: Two-way social analytics synchronization for published post impressions and engagements.

## Out of Scope

Explicitly excluded to protect milestone boundaries.

| Feature | Reason |
|---------|--------|
| Multi-tenant team collaboration & SaaS billing | LifeOS is strictly an owner-centric personal operating system. |
| Unconstrained autonomous destructive actions | All destructive operations strictly require human approval challenges. |
| Distributed microservices architecture | LifeOS is intentionally architected as a modular monolith. |
| Automated direct social publishing | Deferred to future external integrations milestone. |
| Unstructured schema migrations | Drizzle ORM migrations must remain strictly relational and typed in PostgreSQL. |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| QA-01 | Phase 19 | Satisfied |
| QA-02 | Phase 19 | Satisfied |
| QA-03 | Phase 19 | Satisfied |
| QA-04 | Phase 19 | Satisfied |
| PROD-02 | Phase 19 | Satisfied |
| QA-05 | Phase 20 | Satisfied |
| QA-06 | Phase 20 | Satisfied |
| QA-07 | Phase 20 | Satisfied |
| PROD-01 | Phase 21 | Satisfied |
| PROD-03 | Phase 21 | Satisfied |
