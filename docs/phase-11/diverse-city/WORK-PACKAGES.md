# Diverse City FC Work Packages

Last updated: 2026-07-31

## Status Values

- `pending`
- `ready`
- `in_progress`
- `blocked`
- `in_review`
- `complete`

Only acceptance evidence may move a package to `complete`.

## Mandatory Agent Completion Record

Before ending any work turn, the assigned agent must append a record to
`STATUS.md` containing:

```text
Date and agent:
Package:
Status:
Completed:
Files changed:
Verification:
Blockers or decisions needed:
Exact next step:
Hosted mutations: none, or explicit approved evidence
```

This record is required even when the package remains `in_progress` or becomes
`blocked`. The agent must also update the package row in `STATUS.md`.

## Standard Package Instructions

Every package inherits these rules:

- Read `AGENTS.md`, `HANDOFF.md`, the platform plan, test README, this epic,
  decisions, and status before editing.
- Confirm the correct repository and worktree before making changes.
- Preserve unrelated user and agent changes.
- Stay within the assigned package and explicit files.
- Add or preserve failing contracts before implementation when the package is
  contract-first.
- Do not weaken tests or introduce club-specific production branches.
- Do not commit, push, deploy, or mutate hosted services without separate
  authorization.
- Update status and handoff evidence before ending.

## Phase 0 Packages

### DCFC-001 — Contact visual specification

Objective: design and implement the Contact page in the isolated snapshot for
local client review.

Dependencies: DCFC-D101 inputs may be represented as clearly documented local
review placeholders only when Christian explicitly approves the temporary
copy. No commercial or contact fact may be invented.

Scope:

- `/contact`
- navigation/footer link placement approved for review
- responsive and accessible contact destinations
- no message persistence or backend

Acceptance:

- snapshot typecheck/build pass
- desktop/mobile browser checks pass
- no broken links, console errors, overlays, or overflow
- screenshots and unresolved copy are recorded

### DCFC-002 — Tryouts visual specification

Objective: design and implement the Tryouts page in the isolated snapshot for
local client review.

Dependencies: DCFC-D102. A temporary external URL may be used only if Christian
explicitly approves it and the UI labels it as review-only.

Scope:

- `/tryouts`
- open, closed, and upcoming visual behavior
- external registration CTA
- no registration form, payment, waiver, or participant data

Acceptance:

- snapshot typecheck/build pass
- desktop/mobile browser checks pass
- external CTA and missing-URL behavior are verified
- screenshots and unresolved content are recorded

### DCFC-003 — Visual freeze and approval

Objective: verify and pin Contact and Tryouts as additions to the Diverse City
visual specification.

Dependencies: DCFC-001 and DCFC-002.

Acceptance:

- all evidence in `VISUAL-ACCEPTANCE.md` is recorded
- Christian's approval and the exact commit are recorded
- `CONTENT-MATRIX.md` reflects the approved pages
- no publication occurs without separate approval

## Phase 1 Packages

### DCFC-101 — Field-level content and asset inventory

Objective: expand `CONTENT-MATRIX.md` to every route, section, field, asset,
admin destination, entitlement, empty state, and provenance classification.

Dependencies: may begin read-only during Phase 0; finalization requires
DCFC-003.

Acceptance:

- every approved route and section is represented
- every production-blocking placeholder or missing fact is explicit
- source assets have stable paths and checksum/provenance requirements
- zero hosted mutations

### DCFC-102 — Reusable platform gap analysis

Objective: compare the approved specification with existing Onzio domains,
routes, registries, media, admin, and presentation capabilities.

Acceptance:

- identifies reusable capabilities versus true gaps
- covers Programs, Contact, Tryouts, navigation, program page variants,
  external CTAs, and video
- rejects club-specific conditionals as a solution
- proposes tests and migration ownership without implementing them

### DCFC-103 — Lock content and presentation architecture

Objective: resolve the open decisions required before contract implementation.

Dependencies: DCFC-003, DCFC-101, and DCFC-102.

Acceptance:

- DCFC-D101 through DCFC-D105 are accepted or explicitly deferred with no
  impact on Phase 2
- normalized table/domain design is approved
- template strategy is approved
- any architecture change is reflected in the canonical platform plan

## Phase 2 Packages

### DCFC-201 — Red contracts

Objective: add focused failing contracts for the approved Programs, Contact,
Tryouts, route, presentation, security, validation, and external-URL behavior.

Dependencies: DCFC-103.

Acceptance:

- tests fail for the intended missing production behavior
- existing green gates remain green
- no test is skipped, weakened, focused, or broadly mocked

### DCFC-202 — Schema, RLS, types, and audit

Objective: implement normalized tenant-scoped persistence for the approved
content domains.

Dependencies: DCFC-201.

Acceptance:

- migration creates tables, constraints, grants, RLS, and audit behavior
- composite tenant integrity and cross-tenant rejection pass
- generated database types are current
- local database lint and focused database tests pass

### DCFC-203 — Presentation routes, modules, and sections

Objective: register the approved reusable public presentation capabilities.

Dependencies: DCFC-201 and approved template strategy.

Acceptance:

- no Diverse City slug checks
- compatibility, entitlement, missing-content, and unknown-key contracts pass
- existing templates retain their verified behavior

### DCFC-204 — Queries and server mutations

Objective: add typed domain mappings, tenant-scoped public reads, and protected
admin mutation boundaries.

Dependencies: DCFC-202 and DCFC-203.

Acceptance:

- public reads resolve only verified tenant content
- admin writes re-check tenant, AAL2, membership, lifecycle, entitlement, and
  payload validation
- external URLs fail closed unless allowlisted protocols pass
- focused and broad contract gates pass

## Phase 3 Packages

### DCFC-301 — Programs admin

Objective: build list/create/edit/reorder/media workflows for the approved
program model.

Dependencies: DCFC-204.

Acceptance:

- all approved program text, media roles, highlights, relationships, and CTAs
  are editable
- validation, upload, success, error, and empty states are complete
- tenant isolation and entitlement behavior pass

### DCFC-302 — Contact admin

Objective: build the approved Contact page editor while reusing canonical
tenant contact data.

Dependencies: DCFC-204.

Acceptance:

- page-specific copy/media and canonical destinations are editable at their
  correct ownership boundaries
- URLs and contact protocols are validated
- no public message-submission backend is introduced

### DCFC-303 — Tryouts admin

Objective: build the approved Tryouts content, status, event, FAQ, media, and
external-CTA workflows.

Dependencies: DCFC-204.

Acceptance:

- open/closed/upcoming states are editable and public-safe
- missing or invalid registration URLs fail closed
- no registration or participant data is stored

### DCFC-304 — Local admin-to-public acceptance

Objective: prove that Programs, Contact, and Tryouts are complete reusable
tenant capabilities before any staging discussion.

Dependencies: DCFC-301, DCFC-302, and DCFC-303.

Acceptance:

- admin edits render correctly on public routes
- Alpha/Bravo cross-tenant isolation passes
- desktop/mobile public and admin checks pass
- TypeScript, contracts, architecture, database, complete suite, database type
  check, lint, build, and diff checks pass
- `STATUS.md` and `HANDOFF.md` contain final evidence and exact next step
- hosted mutation count is zero
