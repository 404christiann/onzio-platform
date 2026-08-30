# Diverse City FC Phase 0-3 Epic

Epic ID: `DCFC-EPIC-001`

Status: `complete`

Last updated: 2026-08-01

Post-`DCFC-304` staging-to-production work is separately proposed in
`ROLLOUT-EPIC.md`. Completion of this epic does not approve that packet or any
rollout package.

## Outcome

Prepare Diverse City FC for a future production rollout as an Onzio tenant by
turning its approved prospect snapshot into a precise visual and content
specification, closing the required reusable platform gaps, and building local
tenant-scoped admin workflows for Programs, Contact, and Tryouts.

This epic ends after local Phase 3 acceptance. It does not provision or launch
a staging or production tenant.

## Sources of Truth

- Platform architecture: `docs/onzio-platform-plan.md`
- Stable repository rules: `AGENTS.md`
- Current shipped state: `HANDOFF.md`
- Test semantics: `tests/README.md`
- Diverse City visual baseline:
  `/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site`
- Pinned snapshot commit:
  `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`
  (superseded `08f7b53c902f7eb97c1bcdbdd70fc74b7ad1a13a`, the pre-`DCFC-003`
  baseline, on 2026-07-31; `5bbdfa3` adds the dedicated Tryouts Date card and
  is the approved Phase 0 visual specification of record — see
  `VISUAL-ACCEPTANCE.md`)
- Client preview:
  `https://diverse-city-fc-preview.vercel.app`

The snapshot is a visual acceptance artifact. It is not production source,
database authority, payment infrastructure, or an Onzio tenant.

## Locked Boundaries

- Productionize Diverse City through the shared Onzio application, not by
  adding credentials to the snapshot.
- Keep all work through Phase 3 local unless Christian separately approves a
  hosted action.
- Do not connect to or mutate hosted Supabase, Storage, Vercel, Stripe, DNS,
  Resend, Auth, email, or club accounts.
- Do not copy the snapshot's inherited Rose City backend into Onzio.
- Do not import placeholder players, staff, fixtures, statistics, prices,
  availability, sponsors, or unresolved claims into production-shaped tables.
- Registration, payment, waiver, signature, and participant information remain
  the responsibility of the club's third-party registration provider.
- Onzio stores only public Tryouts and program content plus validated external
  registration URLs.
- The Contact page initially uses approved contact destinations such as email,
  phone, and social links. A message-submission backend is a separate scope.
- Tenant content and media remain normalized and tenant-scoped. Presentation
  configuration remains operator-controlled and versioned.
- Do not introduce `club.slug === "diverse-city"` presentation branches. If
  parity requires a distinct renderer, define a neutral reusable template or
  registered template capability.
- Keep `noindex, nofollow` on the snapshot and on every private preview until a
  separately approved public launch.

## Phase Scope

### Phase 0 — Complete the visual specification

- Design a general Contact page in the snapshot.
- Design a Tryouts page in the snapshot with an external registration CTA.
- Verify both pages at 1440x900 desktop and 390x844 mobile.
- Record navigation, footer, scroll, responsive, accessibility, and empty-state
  behavior.
- Obtain Christian's approval before declaring the visual additions locked.

Gate: `DCFC-001`, `DCFC-002`, and `DCFC-003` are complete with visual evidence.

### Phase 1 — Lock the production content and capability specification

- Inventory every public route, section, editable field, asset, and behavior.
- Classify content as verified, club-supplied, placeholder, missing, or
  prohibited from production.
- Map the approved visuals to existing Onzio routes, modules, content domains,
  media surfaces, and presentation capabilities.
- Resolve the program model, Contact model, Tryouts model, navigation model,
  presentation-template strategy, and video capability decision.

Gate: `DCFC-101`, `DCFC-102`, and `DCFC-103` are approved and contain no
unresolved implementation-shaping decisions.

### Phase 2 — Add contract-first reusable platform capabilities

- Add intentionally failing contracts before implementation.
- Add normalized tenant-scoped content tables and media relationships.
- Add RLS, grants, composite tenant integrity, validation, database types,
  query mappings, and server mutation contracts.
- Register the required routes, modules, and presentation sections.
- Keep external registration destinations public-content fields only.

Gate: `DCFC-201` through `DCFC-204` pass their focused local contracts plus all
required regression gates.

### Phase 3 — Build local admin workflows

- Build Programs, Contact, and Tryouts admin workflows.
- Use the existing AAL2, membership, lifecycle, entitlement, validation, audit,
  and media boundaries.
- Verify that tenant-scoped edits render through public query contracts.
- Verify desktop and mobile admin usability for affected workflows.

Gate: `DCFC-301` through `DCFC-304` pass local admin-to-public acceptance with
no hosted mutations.

## Delivery Sequence

```text
DCFC-001 Contact visual ----\
                            +--> DCFC-003 visual freeze
DCFC-002 Tryouts visual ----/
                                      |
DCFC-101 content inventory -----------+
                                      v
DCFC-102 platform gap map --> DCFC-103 decisions locked
                                      |
                                      v
DCFC-201 red contracts --> DCFC-202 schema/RLS/types
                                      |
                                      +--> DCFC-203 registries/routes
                                      +--> DCFC-204 queries/mutations
                                                   |
                                                   v
                            DCFC-301 Programs admin
                            DCFC-302 Contact admin
                            DCFC-303 Tryouts admin
                                                   |
                                                   v
                            DCFC-304 local acceptance
```

`DCFC-001` and `DCFC-002` may be implemented independently only in separate
worktrees with explicit file ownership. `DCFC-101` may run read-only while
Phase 0 is being designed, but it cannot be finalized before the visual freeze.

## Agent Operating Model

- Work packages are tool-neutral. Codex or Claude Code may execute any package.
- Every agent reads the repository rules, this epic, the decision log, the
  work-package definition, and the current status before editing.
- One active package owns a coherent contract area.
- Parallel agents use separate branches or worktrees and may not edit the same
  files concurrently.
- One designated integrator merges packages and runs broad verification.
- A work-package assignment does not authorize commits, pushes, deployments,
  hosted writes, or later work packages.
- Before ending, every agent updates `STATUS.md` using its required completion
  record. This applies to completed, in-progress, and blocked work.
- The integrating agent updates `HANDOFF.md` after meaningful merged work.

## Epic Definition of Done

- Contact and Tryouts have approved desktop/mobile visual specifications.
- Every Diverse City page and section has a normalized production content
  mapping or an explicit hide/block decision.
- Programs, Contact, and Tryouts are reusable tenant capabilities rather than
  club-specific branches.
- Every customer-editable field has a protected admin workflow.
- All media flows through the secure tenant media pipeline.
- No registration submission, payment, waiver, medical, or participant data is
  stored in Onzio.
- All focused and required broad local verification passes.
- `STATUS.md` and `HANDOFF.md` describe the actual state and exact next step.
- No hosted or production resource was mutated.

## Later Work Explicitly Excluded

- Diverse City staging provisioning
- Owner invitation or hosted MFA validation
- Hosted media import
- Stripe subscription activation
- Production domain attachment
- Public launch or search-indexing changes
- Third-party registration provider setup
- Contact-message delivery backend
