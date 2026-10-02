---
phase: "20"
name: "Cross-Browser Engine & Adversarial Journey Regression"
created: 2026-10-02
---

# Phase 20: Cross-Browser Engine & Adversarial Journey Regression — Context

## Governance & Origin

Executes requirements **QA-05**, **QA-06**, and **QA-07** from Milestone v2.1 and items 6, 8, and 9 of the authoritative Deferred Independent QA Register (`docs/qa/deferred-independent-qa.md`).

## Objectives & Scope

1. **QA-05 (Cross-Browser Engine Compatibility):**
   - Verify rendering fidelity, layout stability, and interactive behavior across major rendering engines: Chromium (Blink), Mozilla Firefox (Gecko), Apple Safari (WebKit), and Microsoft Edge.
   - Rigorously validate engine-specific behaviors and degradation: CSS backdrop-filter / glassmorphism, flexbox/grid fractional calculations, scrollbar gutters, form control styling, Web Speech API fallback, and storage / cookie handling.
   - Clearly delineate between automated headless Chromium execution, simulated browser environments (Gecko/WebKit user agent and feature profile simulation), and unsupported native OS binaries.

2. **QA-06 (Independent Tester Adversarial Challenge of H01–H12 Scenarios):**
   - Subject the foundation scenarios H01 through H12 to adversarial edge-case probing:
     - Rapid double-submissions and debouncing under load
     - Malformed, boundary-overflow, and adversarial Unicode/special-character inputs
     - Interrupted network requests, slow response latencies, and 500-level server failure recoveries
     - Session tampering, invalid cookie tokens, and single-user registration race attempts
     - Rapid navigation, back/forward cache transitions, and modal interruption while pending
     - Keyboard trap escape attempts and aria-live announcements under stress

3. **QA-07 (Holistic Project-Wide Regression):**
   - Execute holistic end-to-end regression validation spanning Core OS (Phases 1–9: Foundation, Tasks, Projects, Knowledge, Finance, Content, AI, Automations, Integrations, Analytics) and Agent Platform (Phases 10–18: Shared Services, MCP Server, Skills Engine, Zero-Trust Safety, Security Boundary Remediation, Mobile PWA/Voice, Workspace Execution, and Verified Commit Engine).
   - Ensure zero regressions in Phase 19 mobile navigation (>=44px targets, safe-area insets), native screen reader accessibility, and audio hardware noise resilience.

## Key Decisions

- **Engine Validation Architecture:** Validate cross-engine compatibility via targeted automated browser checks (using existing headless Chromium infrastructure) coupled with simulated Gecko (Firefox) and WebKit (Safari) environments (user-agent sniffing, feature detection parity, CSS vendor prefixing, and Web Speech API graceful degradation).
- **Adversarial Harness Structure:** Build dedicated adversarial test suites in `scripts/tests/phase-20/plan-02/` probing each H01–H12 scenario for failure recovery, race conditions, and boundary enforcement.
- **Production Defect Remediation Policy:** If adversarial testing exposes genuine defects in input handling, double-submit protection, or cross-browser styling, fix the underlying production code directly rather than weakening test assertions.
- **Holistic Test Organization:** All Phase 20 test files strictly reside in `scripts/tests/phase-20/plan-01/` and `scripts/tests/phase-20/plan-02/`, preserving repository cleanliness rules (`src/` contains zero test files).

## Discretion Areas

- Selection of specific adversarial payload suites (XSS vectors, boundary string lengths, concurrent promise resolutions).
- Specific UI animation tolerance thresholds during simulated high-latency transitions.
- Diagnostic reporting format for cross-browser engine compatibility matrices.

## Deferred Ideas

- Physical Apple macOS / iOS hardware farms (real Safari WebKit desktop binary on macOS host) — simulated and headless verification employed on Linux host.
- Cloud device testing SaaS integrations (BrowserStack / SauceLabs) — deferred to external infrastructure milestones.
