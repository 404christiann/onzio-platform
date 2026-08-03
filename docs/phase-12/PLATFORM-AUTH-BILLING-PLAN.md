# Platform Auth and Billing Model Plan

Epic ID: `PLAT-EPIC-001`

Status: `proposed_awaiting_approval`

Last updated: 2026-08-03

## Authorization Notice

**This document authorizes nothing.** It is a Class 1 planning artifact. Every
package below requires its own explicit approval naming the package ID and the
exact target environment. No approval rolls forward. Decision IDs (`PLAT-D0xx`)
are proposed and must be promoted into a governed decision log before any
package is assigned.

## Outcome

Replace the tier-based entitlement model and the password/mandatory-MFA admin
auth model with (a) single-factor club accounts and operator-only privileged
actions, and (b) per-club negotiated pricing with no feature tiers.

This work sits between Phase 5 (complete) and Phase 6 of `DCFC-EPIC-002`.
`DCFC-601` cannot be executed as currently written, because it is specified
against a fixed Pro Price and a canonical tier projection that this plan
removes.

## Why This Interrupts the Diverse City Rollout

- `DCFC-601` names "the exact existing test Pro Price" and rehearses "canonical
  Pro projection." Both cease to exist under `PLAT-D003` and `PLAT-D009`.
- `DCFC-602` asserts "Programs/Tryouts correctly remain unavailable before
  billing." That assertion becomes meaningless once everything is included.
- `PF-002`'s five contradictory entitlement sources are resolved by deletion
  here rather than by reconciliation.
- Diverse City is the first paying customer. The billing path should be correct
  before it carries real revenue, not after.

## Sources of Truth

- Stable repository rules: `AGENTS.md`
- Current implementation state: `HANDOFF.md`
- Platform architecture: `docs/onzio-platform-plan.md`
- Open platform findings: `docs/platform-findings.md` (`PF-002` is resolved by
  `PLAT-102`; `PF-001` and `PF-004` remain out of scope)
- Diverse City rollout: `docs/phase-11/diverse-city/`
- Test semantics: `tests/README.md`

## Action Classes

Unchanged from `DCFC-EPIC-002`:

1. **Class 1** — read-only planning, inspection, local documentation.
2. **Class 2** — local rehearsal: local code, loopback-only Supabase, tests,
   rollback rehearsal. No hosted credentials or hosted writes.
3. **Class 3** — hosted mutation of any kind.

---

## Decisions

Promoted into the governed platform decision log at `docs/phase-12/DECISIONS.md`
on 2026-08-03, satisfying prerequisite `P2`, and **accepted by Christian the
same day** — all fourteen unamended, including the risks explicitly accepted in
`PLAT-D006` and `PLAT-D012`. The dated record is in that file's Acceptance
Record; it governs. The table below remains the originating statement of each
decision.

Acceptance settles the decision dependencies of `PLAT-101` and `PLAT-102`. It
does not authorize either package: per the Authorization Notice above, each
still requires its own explicit approval naming the package ID and the exact
target environment.

Each records what was decided and the rationale, including risks explicitly
accepted.

| ID | Decision |
| --- | --- |
| `PLAT-D001` | "Bigger club" means a multi-team youth academy, not a same-shaped club with more volume. |
| `PLAT-D002` | Multi-team is a **quantity**, not a feature. Every club has teams; a single-squad club has one. Scale is a per-club `max_teams` integer. No feature flag, one code path. |
| `PLAT-D003` | Negotiated prices live in the database (`clubs.stripe_price_id`), not in environment configuration. |
| `PLAT-D004` | `clubs.kind` (`customer` \| `demo` \| `test`) is added so the billing requirement is derivable from the tenant's kind rather than maintained as an exceptions list. Rose City becomes `demo`; Alpha/Bravo become `test`; Diverse City is `customer`. |
| `PLAT-D005` | Diverse City launches on the current single-squad product. The teams epic follows the launch. |
| `PLAT-D006` | Suspension is automatic on a 20-day timer. **Accepted risk:** an automated path exists from a webhook or cron fault to a paying customer's public site going dark. |
| `PLAT-D007` | `grace_ends_at = paid_through + 20 days`, written by the webhook when the subscription first reaches `past_due`. Measuring from `paid_through` places Stripe's retry cycle entirely inside the grace window. |
| `PLAT-D008` | Diverse City subscribes at **$65/month, no trial**, billing beginning at Checkout. `trialing` is not supported. |
| `PLAT-D009` | The Stripe webhook **records** the price Stripe reports. Price validation exists **only at Checkout**, which reads `clubs.stripe_price_id` and never a client-supplied value. The fail-closed `UNKNOWN_PRICE` check is deleted. |
| `PLAT-D010` | Price changes take effect at the next renewal with no proration (`proration_behavior: 'none'`). Immediate-plus-proration is available as a deliberate per-change operator override. |
| `PLAT-D011` | Card payment only. **The 20-day timer in `PLAT-D006` assumes card payment** and must be revisited before any invoice or ACH path ships, because invoices have no dunning cycle and progress at human pace. |
| `PLAT-D012` | Club accounts are **single-factor** (email code). **Accepted risk:** inbox access equals content-edit access for that club. Mitigated by confining all privileged actions to operator accounts. |
| `PLAT-D013` | Operator accounts require **mandatory TOTP**. Operator functions run through the service-role client and therefore bypass RLS entirely; application-layer auth is their only gate. |
| `PLAT-D014` | There is **no self-service signup**. Sign-in only, with `shouldCreateUser: false`. An unrecognized address receives an explicit "no account for that address" message plus a contact route, accepting the minor enumeration disclosure in exchange for diagnosable support. |

### Deferred, recorded to avoid re-litigation

- **Passkeys / WebAuthn** — preferred second factor if step-up is ever
  reintroduced (self-serve billing, or owner-initiated destructive actions).
  Not adopted now because `PLAT-D012` removes the need for any second factor on
  club accounts.
- **SMS / Twilio** — rejected. Cost is negligible at this volume, but US A2P
  10DLC registration adds lead time, and it introduces a third-party dependency
  between an owner and their billing.
- **Magic links** — rejected. On mobile the link opens in an email client's
  in-app browser, creating the session in a context the user then leaves. The
  reported symptom is "it logged me out," which is difficult to diagnose.
- **OAuth (Google/Apple/Microsoft)** — deferred, not rejected. A strictly
  lighter first factor for users who have such an account, but it cannot be the
  primary path because it is not universal.
- **Admin-locked-but-site-up state** — rejected as speculative for a
  single-customer base.

---

## Prerequisites

Neither is a package; both must complete before `PLAT-101` is assigned.

**P1 — Commit the outstanding worktree.** **Complete 2026-08-03.** `DCFC-502`,
`503`, and `504` each excluded commit/push, leaving ~11 modified files including
`scripts/import-diverse-city-staging.ts` and the Phase 5 documentation.
`PLAT-101` builds on that code and requires a clean base. The worktree is now
committed locally on `staging` in four package-grouped commits; the push
remains withheld because it triggers a protected Vercel deployment, a Class 3
action that is not approved.

**P2 — Promote the decisions.** **Complete 2026-08-03.** `PLAT-D001`–`PLAT-D014`
are recorded in `docs/phase-12/DECISIONS.md`, including the accepted risks in
`PLAT-D006` and `PLAT-D012` and the deferred/rejected options. They are
promoted, not accepted: `PLAT-101` and `PLAT-102` still require the dated
acceptance recorded in that file before either is assigned.

---

## PLAT-101 — Admin auth simplification

- **Objective:** replace password-plus-mandatory-MFA admin authentication with
  passwordless email-code sign-in for club accounts, confine AAL2 to operator
  actions, and require TOTP on operator accounts.
- **Action class:** Class 2 for design, implementation, and local verification;
  a single narrow Class 3 to apply the migration and Auth configuration to
  staging.
- **Dependencies:** **all satisfied as of 2026-08-03.** P1 and P2 complete;
  `PLAT-D012`, `PLAT-D013`, and `PLAT-D014` accepted; the privilege
  classification table below signed off. What remains before assignment is the
  package approval itself plus the required inputs listed below — the operator
  user-ID list, the exact unknown-address message, the session durations, and
  the transactional sending domain.
- **Permitted actions:** local schema and policy changes; deletion of the
  password subsystem; Auth email template changes; session-duration
  configuration; loopback-only database and Auth execution; contract, database,
  and browser test changes; the enumerated staging application step.
- **Prohibited actions:** production access; any entitlement, tier, or pricing
  change (those belong to `PLAT-102`); Stripe changes; DNS; Bunny.net; public
  launch; commit or push beyond what the approval names.
- **Required inputs and approvals:** the signed classification table; the
  operator user-ID list; confirmation of the explicit unknown-address message;
  chosen session durations; the sending domain for transactional mail.

### Privilege classification — signed off 2026-08-03

Christian signed off on this table unamended on 2026-08-03. The sign-off was
given after the "Add or remove `admin` members — Club owner — aal1" row was
flagged as the one worth the hardest look: under `PLAT-D012` an owner's inbox
is then sufficient to mint another `admin`, and that row is what gives an
application route a path into the operator module. Christian reaffirmed the
table as written, so the row stands at `aal1` deliberately and the added
`admin` gains content edits only. The accepted risk is recorded in the
Accepted Risk Register in `docs/phase-12/DECISIONS.md`.

This closes `PLAT-101`'s sign-off gate. It does not assign or authorize
`PLAT-101`.

| Action | Actor | Level |
| --- | --- | --- |
| Content edits (roster, schedule, photos, programs, contact, store, standings) | Club admin | aal1 |
| Read billing status | Club owner | aal1 |
| Start Checkout (price pinned server-side) | Club owner | aal1 |
| Stripe Customer Portal — update payment method, view invoices | Club owner | aal1 |
| Add or remove `admin` members | Club owner | aal1 |
| Change price, cancel, refund | Operator | aal2 |
| Transfer ownership | Operator | aal2 |
| Domains and DNS | Operator | aal2 |
| Archive, purge, or reactivate a tenant | Operator | aal2 |
| Any cross-tenant action | Operator | aal2 |
| Change a user's email address on the account | Operator | aal2 |

### Scope detail

- **Sign-in:** email OTP via `signInWithOtp` / `verifyOtp`, with the Magic Link
  template altered to emit `{{ .Token }}`. `shouldCreateUser: false`, pinned by
  contract. Code placed **first** in the subject line so it survives
  notification truncation. Six digits, no letters. Single input with
  `autocomplete="one-time-code"` and `inputmode="numeric"`, auto-submitting on
  the sixth digit. OTP expiry set near the 24-hour ceiling. No magic-link
  button.
- **Deletions:** `app/admin/update-password/page.tsx`, password reset and
  strength handling, and the related contract surface. The Free-plan
  leaked-password exception recorded in `STAGING-ACCEPTANCE.md` ceases to apply
  and should be formally retired rather than left standing.
- **Policy layer:** remove `onzio_private.is_aal2()` from club-facing content
  policies while preserving `is_club_member`, `has_club_role`, and lifecycle
  checks. Retain `is_aal2()` on operator-reachable paths.
- **Operator gate:** establish and pin where AAL2 is actually enforced for
  operator actions. `assertOperator()` in `lib/operator/shared.ts` currently
  checks only membership of `ONZIO_OPERATOR_USER_IDS`, and operator functions
  use `createServiceRoleClient()`, which bypasses RLS. This is the highest-value
  gate in the system and must be proven, not assumed.
- **Sessions:** ~~asymmetric — long for club accounts (weeks), short for operator
  accounts (hours)~~ — **superseded 2026-08-03.** Supabase exposes session length
  only project-wide, so this is not configurable as written. Replaced by
  `PLAT-D016` (30-day timebox, no inactivity timeout, project-wide) plus
  `PLAT-D015` (application-layer 2-hour maximum age on operator `aal2`, read
  from the JWT's `amr` TOTP timestamp). AAL2 **does** survive session refresh —
  proven, not assumed — so operator re-auth is per-session, which is why
  `PLAT-D015` is required. Evidence is in `docs/phase-12/DECISIONS.md`.
- **Invitations:** generalize the server-only invitation and membership workflow
  built during `DCFC-504` so a club owner can add an `admin`, including
  server-side creation of the Auth user (required, because
  `shouldCreateUser: false` otherwise leaves an invited person unable to sign
  in).
- **Identity hygiene:** separate the operator identity from any club-owner
  identity. Provide a club-admin-only test identity carrying no operator
  privileges, so the shipped flow can be verified as a real club user
  experiences it.
- **Deliverability:** SPF, DKIM, and DMARC on a dedicated transactional
  subdomain; bounce and failure monitoring; delivery verified against Yahoo,
  AOL, and at least one ISP-hosted domain, not only Gmail. Email is now the sole
  authentication path and is a hard dependency.

- **Acceptance criteria:** every row of the classification table is enforced and
  proven; a club admin completes first sign-in and a returning sign-in with no
  password and no second factor; an unrecognized address receives the explicit
  message and no Auth user is created; an operator action is refused below AAL2;
  operator TOTP is enrolled and required; club sessions persist across the
  configured window while operator sessions expire within theirs; an owner adds
  an `admin` who then signs in successfully; no password code path remains
  reachable; the full suite is green.
- **Verification commands/evidence:** `git status --short`; `git diff --check`;
  `npx tsc --noEmit`; `npm run db:reset` from scratch; the complete loopback
  suite (current baseline 662/662 across 68 files); architecture tests; generated
  database-type check; `supabase db lint` on `onzio,onzio_private`; `npm run
  build`; desktop and mobile Playwright evidence for sign-in and protected admin;
  a negative contract proving `shouldCreateUser: false`; a negative contract
  proving operator refusal at aal1; delivery evidence per provider without
  recording any code or secret.
- **Rollback expectations:** the migration must ship with a reviewed down path
  restoring `is_aal2()` on club-facing policies. Auth configuration changes
  (template, expiry, session duration) must be recorded with prior values so
  they can be restored exactly. Existing enrolled factors are retained, not
  deleted, so rollback does not lock anyone out.
- **Exact hosted-mutation boundary:** staging Supabase schema and Auth
  configuration only, plus the enumerated policy migration. Zero production,
  Stripe, tenant content, Storage, DNS, Bunny.net, or public-access mutation.
- **Expected documentation updates:** `docs/onzio-platform-plan.md` (auth model),
  `STAGING-ACCEPTANCE.md`, `docs/platform-findings.md` (retire the leaked-password
  exception), a `DCFC-504` amendment covering the superseded sign-in evidence,
  this plan, and `HANDOFF.md`.

---

## PLAT-102 — Billing and entitlement model

- **Objective:** delete the tier-based entitlement system, resolve `PF-002` by
  collapsing five sources of truth to one, and move negotiated per-club pricing
  into the database.
- **Action class:** Class 2 for implementation and local verification; a narrow
  Class 3 to apply the migration and backfill staging.
- **Dependencies:** `PLAT-101` complete, because both packages rewrite the same
  policies and this one must be written against `PLAT-101`'s finished state.
  `PLAT-D003`, `PLAT-D004`, and `PLAT-D006`–`PLAT-D011` were accepted on
  2026-08-03, so only the `PLAT-101` dependency and this package's own approval
  remain.
- **Permitted actions:** schema migration; deletion of tier and entitlement
  code; the lifecycle cron; webhook projection changes; Checkout changes;
  Portal configuration; contract and database test changes; the enumerated
  staging application and backfill.
- **Prohibited actions:** production access; any live-mode Stripe action;
  creating or modifying live Prices; DNS; public launch; introducing a `teams`
  table or `max_teams` (deferred to the teams epic per `PLAT-D002`); invoice or
  ACH support (`PLAT-D011`).
- **Required inputs and approvals:** the Diverse City price and interval
  ($65/month per `PLAT-D008`); the test-mode Price to use for rehearsal; the
  `kind` assignment for all four existing tenants; Portal capability set. The
  grace-warning schedule is settled — day 7 and day 17, accepted 2026-08-03.

### Scope detail

- **Entitlement collapse.** `onzio_private.club_has_feature` currently carries a
  hardcoded allowlist (`branding`, `roster`, `schedule`, `homepage`, `about`,
  `contact`) with Pro-by-default for unlisted names. Reduce it to a lifecycle
  and kind check with no feature dimension. Delete `STARTER_FEATURES` from
  `lib/club-features.ts`. Repoint the `storage.objects` surface policies at the
  same single source, eliminating the permissive `branding` fallback. Demote
  `moduleRegistry`'s `entitlement` field to descriptive metadata. Retain
  `ADMIN_TABLE_FEATURES` as a table-to-domain map for mutation validation, not
  as a tier gate.
- **Resolve the two contradictions by inclusion.** `shop` and `seasons` are both
  included. This closes `PF-002`.
- **Keep the seam.** Retain `clubs.tier` as a dormant column driving nothing.
  Re-tiering later should be an edit in one place, not a rebuild of five.
- **Pricing.** Add `clubs.stripe_price_id`. Checkout reads it server-side and
  never accepts a client-supplied Price. Delete `tierForPriceId()`,
  `priceIdForTier()`, `UNKNOWN_PRICE`, `parseGrandfatheredProPriceIds()`,
  `assertDisjointPrices()`, and the `STRIPE_PRICE_ID_STARTER` /
  `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_IDS_PRO_GRANDFATHERED` configuration.
- **Tenant kind.** Add `clubs.kind`. Backfill: Diverse City `customer`, Rose City
  `demo`, Alpha and Bravo `test`. Only `kind = 'customer'` requires an active
  subscription.
- **Lifecycle automation.** The webhook writes
  `grace_ends_at = paid_through + 20 days` on first `past_due`. A daily cron —
  added alongside the existing `/api/cron/media-cleanup` entry in `vercel.json`
  — moves `public_access` from `grace` to `suspended` once `grace_ends_at`
  passes. It must be idempotent, must write `audit_events` rows with
  `actor_type = 'system'`, must skip any club whose `kind` is not `customer`,
  and must emit warning notices before suspending. Successful payment
  reactivates automatically.
- **Portal configuration.** Payment-method updates and invoice history enabled;
  cancellation and plan switching disabled.
- **Price changes.** `proration_behavior: 'none'` by default, taking effect at
  the next renewal; immediate proration only as a recorded per-change operator
  override.
- **Reconciliation.** A report comparing `clubs.stripe_price_id` (intent) with
  `club_subscriptions.price_id` (fact). Divergence is a finding to investigate,
  never a webhook rejection.

- **Acceptance criteria:** exactly one source of truth for entitlement, with an
  agreement contract asserting no other source can contradict it; an active,
  live, Starter-shaped club — the `Charlie` fixture added during `DCFC-204` —
  renders every route with content, closing the `shop` blank-page path; Checkout
  refuses a client-supplied Price; the webhook records an arbitrary Price without
  rejection; a `demo` club with no subscription is never suspended; the cron
  suspends exactly one overdue `customer` club, is proven idempotent across
  repeat runs, and writes a `system` audit row; warning notices are emitted
  before suspension; successful payment restores `live`; Portal exposes payment
  method and invoices but neither cancellation nor plan switching; `PF-002` is
  moved to Resolved with this package ID.
- **Verification commands/evidence:** `npm run db:reset`; the full loopback
  suite; architecture tests; the new entitlement agreement contract; generated
  database types; `supabase db lint` on `onzio,onzio_private`; `npm run build`;
  Stripe **test-mode** Checkout, webhook projection, and Portal evidence with
  safe identifiers only; cron execution evidence including a deliberate second
  run; before-and-after row counts for the backfill.
- **Rollback expectations:** additive schema is retained; a reviewed down path
  restores the previous `club_has_feature` body. The cron must be disableable by
  configuration without a deploy, since it is the only automation able to take a
  customer's site offline. Any club suspended during rehearsal must be restored
  and reconciled.
- **Exact hosted-mutation boundary:** staging Supabase schema and the four named
  tenant rows; Stripe **test mode** only; the staging cron entry. Zero
  production, live Stripe, Auth, DNS, Bunny.net, or public-access mutation.
- **Expected documentation updates:** `docs/onzio-platform-plan.md` (entitlement
  and billing model), `docs/platform-findings.md` (`PF-002` resolved),
  `STAGING-ACCEPTANCE.md`, this plan, and `HANDOFF.md`.

---

## PLAT-103 — Rewrite DCFC-601 and DCFC-602

- **Objective:** respecify the two Phase 6 packages against the new
  authorization and billing model so Diverse City's rollout can resume.
- **Action class:** Class 1 — documentation only.
- **Dependencies:** `PLAT-101` and `PLAT-102` complete and accepted.
- **Permitted actions:** rewriting `ROLLOUT-WORK-PACKAGES.md` entries for
  `DCFC-601` and `DCFC-602`, and the corresponding rows in
  `STAGING-ACCEPTANCE.md`.
- **Prohibited actions:** executing either package; any hosted mutation.
- **Acceptance criteria:** `DCFC-601` no longer references a fixed Pro Price,
  tier projection, or `trialing`, and instead rehearses a single $65/month
  Checkout with the Price read from `clubs.stripe_price_id`, the configured
  Portal capability set, and the `paid_through + 20` grace and automatic
  suspension path. `DCFC-602` no longer asserts tier-gated availability and
  instead asserts full content availability plus unchanged Alpha/Bravo/DCFC
  isolation, at aal1 for club actions.
- **Expected documentation updates:** `ROLLOUT-WORK-PACKAGES.md`,
  `ROLLOUT-EPIC.md`, `STAGING-ACCEPTANCE.md`, `STATUS.md`, `HANDOFF.md`.

---

## Sequence and Gates

1. **P1 / P2** — commit the worktree; promote the decisions.
2. **`PLAT-101`** — auth simplification. Gate: classification table signed.
3. **`PLAT-102`** — billing and entitlement model. Gate: `PLAT-101` accepted.
4. **`PLAT-103`** — rewrite 601/602. Gate: `PLAT-102` accepted.
5. **`DCFC-601` → `602` → `603`** — Phase 6, first real revenue.
6. **`DCFC-701`–`1003`** — production, launch, observation, closeout.
7. **Teams epic** — after the launch, per `PLAT-D005`.

Nothing in Phase 5 is invalidated. The Diverse City staging tenant, its ten
media assets, its content, and its published `academy@1` presentation all stand.
This plan changes how people authenticate and what they are permitted to do, not
what is in the database.

---

## Deferred: the teams epic

Sketched only, so its scope is not underestimated when it is scheduled. Not
authorized by this plan.

The platform is currently a **single-squad club site**, which follows from
having been modelled on Rose City. Serving multi-team academies requires:

- A `teams` table, tenant-scoped using the existing `(club_id, id)` composite
  pattern.
- `team_id` on `players`, `matches`, `league_standings`, and the four stats
  tables. The composite-foreign-key design — whether team-scoped rows carry
  `(club_id, team_id)` composites or `team_id` alongside `club_id` — is a real
  decision requiring its own review.
- **Relaxing `players.age`.** It is currently
  `check (age between 14 and 80)`, verified as unaltered by any later migration.
  No U13 player can be inserted today.
- **Reworking `seasons_one_active_per_club`**, a unique index enforcing a single
  active season per club, to be per team.
- `clubs.max_teams`, enforced at insert with an explicit limit error — the first
  real quantity limit, per `PLAT-D002`.
- Team selection across every roster, schedule, standings, and stats route, plus
  the corresponding admin editors.
- A migration giving every existing club one auto-created team, with all
  existing players attached, invisible to Rose City and Diverse City.

---

## Accepted Risks

| Risk | Source | Mitigation |
| --- | --- | --- |
| Automated suspension can take a paying customer's public site offline on a webhook or cron fault | `PLAT-D006` | Measured from `paid_through`, 20-day buffer, mandatory warning notices, `system` audit rows, cron disableable without a deploy |
| Inbox access equals club content access | `PLAT-D012` | All privileged actions confined to operator accounts under mandatory TOTP |
| Email deliverability becomes a hard authentication dependency | `PLAT-101` | Dedicated transactional subdomain with SPF/DKIM/DMARC, bounce monitoring, multi-provider delivery testing, operator email-change escape hatch |
| Card-only excludes clubs requiring purchase orders | `PLAT-D011` | Accepted for now; revisit with the timer assumption when an academy requires it |
| Youth players cannot be entered until the teams epic | `players.age` constraint | Known limitation; Diverse City's academy content is presentational and does not require youth roster rows |
| Operator power is an env-var allowlist requiring a deploy to revoke | `PLAT-D013` | Acceptable at one operator; move to an audited `operators` table at the second |

---

## Open Items

**All five closed on 2026-08-03.** They were worked through in a structured
design review that probed the loopback stack and the live local schema rather
than reasoning from this document — and three of the five turned out not to be
package-level detail at all, because this plan's framing of them was wrong.
Outcomes, rationale, and evidence are in `docs/phase-12/DECISIONS.md`.

- ~~Grace warning schedule~~ — **settled:** day 7 and day 17 of the 20-day
  window, as proposed.
- ~~Final form of `club_has_feature`~~ — **settled by `PLAT-D018`.** The fork
  posed here was a false choice: 115 policies call `can_read_feature` /
  `can_mutate_feature` and none call `club_has_feature` directly.
- ~~Reconciliation report cadence and delivery~~ — **settled by `PLAT-D019`
  and `PLAT-D020`.**
- ~~Whether AAL2 survives session refresh~~ — **proven: it does.** Operator
  re-auth is per-session.
- ~~Exact session durations~~ — **settled by `PLAT-D015` and `PLAT-D016`,**
  after the asymmetric framing proved unimplementable.

Two verification tasks were opened in their place, tracked in
`DECISIONS.md`: whether session `timebox` / `inactivity_timeout` are available
on Supabase Free (staging is Free, production is Pro), and whether Vercel
notifies on a failed cron for this account.
