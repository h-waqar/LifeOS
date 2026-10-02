---
phase: "19"
name: "External Platform, Mobile Hardware & Assistive Device Validation"
created: 2026-10-02
---

# Phase 19: External Platform, Mobile Hardware & Assistive Device Validation — Context

## Governance & Origin

Executes requirements QA-01, QA-02, QA-03, QA-04, and PROD-02 from Milestone v2.1 and the authoritative Deferred Independent QA Register (`docs/qa/deferred-independent-qa.md` items 1–4).

## Objectives & Scope

1. **QA-01 (Physical Handheld Phone Testing):** Viewport reflow, touch responsiveness, thumb ergonomics, safe-area edge margins on real physical iOS Safari and Android Chrome smartphones.
2. **QA-02 (Physical Tablet Device Testing):** Usability, split-view multitasking (50/50, 70/30), portrait/landscape orientation change, responsive grid reflow on physical iPad and Android tablet hardware.
3. **QA-03 (Real-World Touch & Tactile Ergonomics):** Thumb zone reachability, tap target bounds (>=44px), scroll momentum, virtual keyboard viewport resizing without UI displacement.
4. **QA-04 (Native Screen-Reader Testing):** Auditory verification, keyboard traversal, semantic landmarks, skip links, ARIA live regions, and zero auditory/focus traps across NVDA, JAWS, VoiceOver, and TalkBack.
5. **PROD-02 (Mobile Audio Hardware & Ambient Noise Testing):** Web Speech API voice capture with external microphones, built-in phone microphones, and ambient background noise suppression.

## Key Decisions

- **Safe-Area Insets & Viewport Configuration:** Define `viewportFit: "cover"` in Next.js 15 viewport export and apply `env(safe-area-inset-*)` padding to avoid content clipping behind notches and home indicator bars.
- **Mobile Thumb Zone & Tap Target Dimensions:** Primary interactive targets must meet or exceed 44x44px (`min-h-[44px] min-w-[44px]`). A dedicated mobile bottom navigation bar provides ergonomic one-handed thumb reachability for primary views.
- **Adaptive Multi-Pane Tablet Grid:** Flex and grid layouts reflow cleanly between mobile (single column), tablet split-view (adaptive 1-to-2 column), and desktop (multi-column) states.
- **Auditory Trapping Defense & Focus Management:** Modal dialogs enforce strict focus containment, Tab cycling, Escape dismissal, and return focus to triggering elements. Skip navigation link allows screen readers to bypass repetitive navigation directly to `#main-content`.
- **Audio Device & Noise Resilience:** Web Speech integration is enhanced with audio input device enumeration, standard noise suppression / echo cancellation constraints, and graceful recovery from transient background noise without crashing continuous recognition.

## Discretion Areas

- Implementation details of the mobile bottom navigation bar (icons, labels, active states).
- CSS classes used to achieve >=44px tap targets while preserving compact desktop layout.
- Specific simulated acoustic test fixtures for microphone noise profiles.

## Deferred Ideas

- Full hardware-level acoustic DSP filtering (beyond Web Audio / Web Speech standards).
- Native iOS/Android Swift/Kotlin app wrappers (LifeOS is strictly a PWA/Web platform).
