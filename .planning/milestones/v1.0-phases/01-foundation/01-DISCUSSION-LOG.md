# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-10
**Phase:** 1-Foundation
**Areas discussed:** First-run setup & authentication lockdown, Design system aesthetic & UI density, Navigation shell & Command Palette (Cmd+K), Audit logging viewer & encryption key setup

---

## First-run setup & authentication lockdown

### Initial user registration and single-user lockdown
| Option | Description | Selected |
|--------|-------------|----------|
| First user to sign up claims ownership | First user to sign up automatically claims ownership and permanently closes public registration | ✓ |
| CLI-only account creation | `pnpm db:seed:admin` — disable public registration routes entirely | |
| Web setup wizard with setup token | Web setup wizard requiring a one-time secret token configured in `.env` (`SETUP_TOKEN`) | |

**User's choice:** (Recommended) First user to sign up automatically claims ownership and permanently closes public registration
**Notes:** Provides a seamless first-time onboarding experience while locking out unauthorized access permanently once registered.

### Owner account authentication credentials
| Option | Description | Selected |
|--------|-------------|----------|
| Email & Password plus Passkey/WebAuthn | Biometric TouchID/FaceID/security keys with password fallback | ✓ |
| Email & Password only | Standard credentials, minimal surface area | |
| Passkey/WebAuthn only | Passwordless biometric auth with one-time backup recovery codes | |

**User's choice:** (Recommended) Email & Password plus Passkey/WebAuthn (biometric TouchID/FaceID/security keys with password fallback)
**Notes:** Delivers fast biometric authentication using Better Auth's passkey plugin while retaining reliable password fallback.

### Session duration and persistence policy
| Option | Description | Selected |
|--------|-------------|----------|
| Long-lived sliding session | 30-day session renewed on activity so daily personal use is frictionless | ✓ |
| Strict fixed-window session | 7 days absolute expiry, requiring periodic re-authentication | |
| Single active session policy | Logging in from a new device immediately terminates existing sessions | |

**User's choice:** (Recommended) Long-lived sliding session (30-day session renewed on activity so daily personal use is frictionless)
**Notes:** Appropriate for a personal operating system to prevent interruptions during daily workflows.

### Account recovery and password reset policy
| Option | Description | Selected |
|--------|-------------|----------|
| CLI recovery + emergency recovery codes | `pnpm auth:reset` plus emergency recovery codes generated at setup (no external SMTP service dependency) | ✓ |
| CLI recovery + optional SMTP email reset | CLI utility combined with optional SMTP email reset links when email credentials are configured | |
| Strict email-only password reset links | Requires active SMTP or Resend API key setup from day one | |

**User's choice:** (Recommended) CLI recovery command (e.g. `pnpm auth:reset`) plus emergency recovery codes generated at setup (no external SMTP service dependency)
**Notes:** Zero third-party service dependencies required to self-host and recover access.

---

## Design system aesthetic & UI density

### Visual design tone and information density
| Option | Description | Selected |
|--------|-------------|----------|
| High-density dark cockpit | Linear / Raycast inspired: compact padding, subtle 1px borders, high data density, zinc neutral tones with crisp status accents | ✓ |
| Spacious modern minimalism | Notion / clean web app style: generous whitespace, relaxed padding, softer contrast | |
| Technical / terminal-adjacent | Dense monospace data accents, stark high contrast, utilitarian information displays | |

**User's choice:** (Recommended) High-density dark cockpit (Linear / Raycast inspired: compact padding, subtle 1px borders, high data density, zinc neutral tones with crisp status accents)
**Notes:** Directly aligns with PRD Section 4 visual language guidelines.

### Color mode and theme switching behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Dark mode by default with toggle | Dark mode by default, with toggle for Light and System modes (synced to cookie and user preferences to prevent page flicker) | ✓ |
| System preference by default | Follows OS mode automatically, with manual toggle override | |
| Dark mode only | Dedicated dark cockpit experience without maintaining light theme variants | |

**User's choice:** (Recommended) Dark mode by default, with toggle for Light and System modes (synced to cookie and user preferences to prevent page flicker)
**Notes:** Ensures rich dark cockpit aesthetic by default while fully supporting light/system preferences without SSR flashing.

### Typography pairing
| Option | Description | Selected |
|--------|-------------|----------|
| Geist Sans + Geist Mono | Tailored for modern web apps, crisp hinting, tabular numerals for dense data | ✓ |
| Inter + JetBrains Mono | Classic, highly legible pairing for productivity software | |
| Native system fonts | -apple-system / Segoe UI + ui-monospace, zero font loading overhead | |

**User's choice:** (Recommended) Geist Sans + Geist Mono (Tailored for modern web apps, crisp hinting, tabular numerals for dense data)
**Notes:** Clean neo-grotesque type with monospace numerals suited for data tables and keyboard shortcuts.

### Notification / toast feedback pattern
| Option | Description | Selected |
|--------|-------------|----------|
| Sonner toasts | Modern stacked notifications with micro-animations, action buttons, and keyboard dismiss | ✓ |
| Classic Radix Toast | Standard corner toast banner | |
| Top status strip / inline banner | Docked to application header | |

**User's choice:** (Recommended) Sonner toasts (modern stacked notifications with micro-animations, action buttons, and keyboard dismiss)
**Notes:** Standard modern feedback primitive in shadcn ecosystem.

---

## Navigation shell & Command Palette (Cmd+K)

### Primary application sidebar layout
| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible sidebar with icon rail | Cmd+B to toggle between full labels and compact icon rail | ✓ |
| Persistent fixed sidebar | Always visible full-width navigation with domain section groupings | |
| Top navigation bar | Horizontal header maximizing full horizontal content width | |

**User's choice:** (Recommended) Collapsible sidebar with icon-rail mode and shortcut toggle (Cmd+B to toggle between full labels and compact icon rail)
**Notes:** Gives flexibility between high-density compact working area and full navigation labels.

### Command Palette component architecture
| Option | Description | Selected |
|--------|-------------|----------|
| cmdk headless primitive | The standard shadcn Command engine with instant fuzzy filtering, grouped sections, and nested pages | ✓ |
| Custom Radix Dialog | Bespoke keyboard handling and custom filtering logic | |
| Header search bar dropdown | Simpler fixed modal attached to top navigation | |

**User's choice:** (Recommended) cmdk headless primitive (the standard shadcn Command engine with instant fuzzy filtering, grouped sections, and nested pages)
**Notes:** Proven, accessible foundation for Raycast-like command experience.

### Command Palette scope in Phase 1
| Option | Description | Selected |
|--------|-------------|----------|
| System actions & extensible registry | Page navigation, theme toggle, sidebar toggle, logout, plus modular action registration hook ready for Phase 2+ | ✓ |
| Page navigation jumps only | Simple routing to Settings, Account, Audit Log without interactive system commands | |
| Full command list with disabled placeholders | Disabled items like "Create Task [Phase 2]" | |

**User's choice:** (Recommended) System actions & navigation with extensible action registry (page navigation, theme toggle, sidebar toggle, logout, plus modular action registration hook ready for Phase 2+)
**Notes:** Establishes the reusable action registration contract so future phases plug in seamlessly.

### Keyboard shortcut system
| Option | Description | Selected |
|--------|-------------|----------|
| Standard modifier shortcuts + Help modal | Cmd+K for palette, Cmd+B for sidebar, with a "?" / Cmd+/ Shortcuts modal showing keybindings | ✓ |
| Vim-style sequence navigation chords | "g" followed by "s" for settings, etc. alongside modifier keys | |
| Palette-first minimal model | Cmd+K only, delegating all other actions directly into the palette | |

**User's choice:** (Recommended) Standard modifier shortcuts (Cmd+K for palette, Cmd+B for sidebar) with a '?' / Cmd+/ Shortcuts modal showing keybindings
**Notes:** Zero clash with text input fields while maintaining high discoverability.

---

## Audit logging viewer & encryption key setup

### AES-256-GCM master encryption key source
| Option | Description | Selected |
|--------|-------------|----------|
| LIFEOS_ENCRYPTION_KEY env var | 32-byte key validated on server boot via Zod fail-fast check; 12-factor and Docker-friendly | ✓ |
| Auto-generated file key in .secrets/master.key | Created with restricted 0600 permissions on first launch if absent | |
| Container startup unlock prompt | Requires typing an encryption passphrase on reboot to unlock database secrets | |

**User's choice:** (Recommended) Environment variable `LIFEOS_ENCRYPTION_KEY` (32-byte key validated on server boot via Zod fail-fast check; 12-factor and Docker-friendly)
**Notes:** Clean, standard 12-factor configuration that works seamlessly in local dev, test, and Docker containers.

### Audit log event scope in Phase 1
| Option | Description | Selected |
|--------|-------------|----------|
| Auth events + security changes + entity mutations | Logins, logouts, failed attempts, credential updates, and entity mutations with actor, IP, timestamp, and details | ✓ |
| Security & authentication events only | Focus on auth lifecycle, password changes, and session revocations | |
| Entity mutations only | Focus on data record creations, updates, and deletes, omitting login/logout tracking | |

**User's choice:** (Recommended) Auth events + security changes + entity mutations (logins, logouts, failed attempts, credential updates, and entity mutations with actor, IP, timestamp, and details)
**Notes:** Fulfills SEC-02 and SHELL-04 requirements comprehensively.

### Audit Log viewer page capabilities
| Option | Description | Selected |
|--------|-------------|----------|
| Interactive data table with filters & JSON drawer | Category filters (Auth, Security, Mutation), date range picker, JSON detail drawer, and JSON export button | ✓ |
| Simple chronologically paginated feed | Basic search and collapsible event details | |
| Raw JSON log inspector | Date range filtering and one-click export download | |

**User's choice:** (Recommended) Interactive data table with category filters (Auth, Security, Mutation), date range picker, JSON detail drawer, and JSON export button
**Notes:** Provides clear visibility and inspection of all system events and security occurrences.

### Audit log retention and pruning policy
| Option | Description | Selected |
|--------|-------------|----------|
| Indefinite append-only retention by default | Low volume in personal software; optional manual export-and-purge action in Settings | ✓ |
| Automated rolling window | Automatically purge audit logs older than 90 days | |
| Fixed row cap | Retain most recent 10,000 audit entries and rotate older records | |

**User's choice:** (Recommended) Indefinite append-only retention by default (with optional manual export-and-purge action in Settings)
**Notes:** Maintains an unbroken audit trail for personal security while allowing on-demand export and cleanup.

---

## Agent Discretion

- Project folder layout within `src/` conforming to modular monolith guidelines.
- Specific shadcn/ui components installed for Phase 1.
- Docker compose service configuration for local PostgreSQL development.
- Vitest configuration and test suite organization.

## Deferred Ideas

- Domain schemas (Tasks, Projects, Goals, Notes, CRM, Finances, Content, AI) deferred to Phases 2-9 per vertical slice rule.
- External SMTP email integration deferred until dedicated notification phase.
