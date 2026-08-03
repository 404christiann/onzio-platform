# Onzio Platform Decision Log

Epic: `PLAT-EPIC-001`

Last updated: 2026-08-03

Statuses: `accepted`, `promoted_awaiting_acceptance`, `open`, `superseded`.

Epic status: all fourteen decisions `accepted` 2026-08-03. The `PLAT-101`
privilege classification table is signed off. No package is authorized.

This is the platform-wide decision log. Tenant-scoped rollout decisions stay in
their own epic log; Diverse City's are in
`docs/phase-11/diverse-city/DECISIONS.md`. Decisions below change the platform
for every tenant and are therefore recorded here rather than in a club log.

## Provenance and Acceptance

`PLAT-D001`–`PLAT-D014` were proposed in
`docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md`, a Class 1 planning artifact
whose Authorization Notice states that it authorizes nothing. Prerequisite
`P2` of that plan requires the decisions to be recorded in a governed decision
log before any package cites them as a dependency. This file satisfies `P2`.

All fourteen were promoted here on 2026-08-03 and accepted by Christian the
same day. The dated record is in the Acceptance Record below. Two carry an
explicit accepted risk rather than a neutral trade-off — `PLAT-D006`
(automated suspension) and `PLAT-D012` (single-factor club accounts) — and
accepting each accepted its risk. Both are restated in the Accepted Risk
Register.

**Acceptance of these decisions is not authorization of any package.** Per the
plan's Authorization Notice, `PLAT-101`, `PLAT-102`, and `PLAT-103` each still
require their own explicit approval naming the package ID and the exact target
environment. What acceptance does is satisfy the decision dependencies:
`PLAT-101` (`PLAT-D012`, `PLAT-D013`, `PLAT-D014`) and `PLAT-102`
(`PLAT-D003`, `PLAT-D004`, `PLAT-D006`–`PLAT-D011`).

## Accepted Decisions

| ID | Status | Decision | Rationale |
| --- | --- | --- | --- |
| PLAT-D001 | accepted | "Bigger club" means a multi-team youth academy, not a same-shaped club with more volume. | Sizes the real gap correctly. The platform is a single-squad club site, which follows from having been modelled on Rose City. Serving a larger club is new structure — teams, per-team seasons, per-team rosters and stats — not more rows in the existing shape. Getting this wrong would have led to scaling work that solves nothing. |
| PLAT-D002 | accepted | Multi-team is a **quantity**, not a feature. Every club has teams; a single-squad club has one. Scale is a per-club `max_teams` integer. No feature flag, one code path. | Keeps one rendering and mutation path for every tenant instead of a gated second path. A feature flag would reintroduce exactly the tier-shaped branching that `PLAT-102` exists to delete. `max_teams` becomes the platform's first real quantity limit, enforced at insert with an explicit limit error. |
| PLAT-D003 | accepted | Negotiated prices live in the database (`clubs.stripe_price_id`), not in environment configuration. | Per-club negotiated pricing cannot be expressed as a fixed set of environment Price IDs. Configuration would require a deploy per negotiation and would preserve the tier-to-price mapping this epic removes. The database already holds per-tenant facts and is the natural home for a per-tenant price. |
| PLAT-D004 | accepted | `clubs.kind` (`customer` \| `demo` \| `test`) is added so the billing requirement is derivable from the tenant's kind rather than maintained as an exceptions list. Rose City becomes `demo`; Alpha/Bravo become `test`; Diverse City is `customer`. | Only `kind = 'customer'` requires an active subscription. Without it, the lifecycle automation in `PLAT-D006` would need a hand-maintained exclusion list, and any omission from that list would suspend a demo or test tenant. Deriving the requirement from a column makes the safe behaviour the default. |
| PLAT-D005 | accepted | Diverse City launches on the current single-squad product. The teams epic follows the launch. | The teams epic is large — a `teams` table, `team_id` across players/matches/standings and four stats tables, relaxing the `players.age` 14–80 check, reworking `seasons_one_active_per_club`, team selection across every route and admin editor, and a backfill migration. Sequencing it before launch would delay the first paying customer to deliver capability Diverse City's presentational academy content does not need. |
| PLAT-D006 | accepted | Suspension is automatic on a 20-day timer. **Accepted risk:** an automated path exists from a webhook or cron fault to a paying customer's public site going dark. | Manual suspension does not scale and, in practice, does not happen. The risk is accepted rather than avoided, with mitigations: the window is measured from `paid_through`, is 20 days long, requires warning notices before it fires, writes `audit_events` rows with `actor_type = 'system'`, and the cron must be disableable by configuration without a deploy. See the Accepted Risk Register. |
| PLAT-D007 | accepted | `grace_ends_at = paid_through + 20 days`, written by the webhook when the subscription first reaches `past_due`. | Measuring from `paid_through` places Stripe's entire retry cycle inside the grace window, so dunning completes before suspension is even eligible. Measuring from the `past_due` event instead would let a slow retry schedule push a real recovery past the deadline. |
| PLAT-D008 | accepted | Diverse City subscribes at **$65/month, no trial**, billing beginning at Checkout. `trialing` is not supported. | The commercial terms are already agreed, and the club has been using a staging tenant. A trial would add a lifecycle state carrying its own entitlement and expiry behaviour, for no commercial purpose. Dropping `trialing` removes a state from every lifecycle path rather than adding one. |
| PLAT-D009 | accepted | The Stripe webhook **records** the price Stripe reports. Price validation exists **only at Checkout**, which reads `clubs.stripe_price_id` and never a client-supplied value. The fail-closed `UNKNOWN_PRICE` check is deleted. | Once prices are negotiated per club, no allowlist of known Prices can be kept complete, so a fail-closed webhook check would eventually reject a legitimate subscription and desynchronize the projection from Stripe — the billing source of truth. Validation belongs where the value is chosen, at Checkout, where the server pins the Price from the database. This narrows rather than widens trust in client input. |
| PLAT-D010 | accepted | Price changes take effect at the next renewal with no proration (`proration_behavior: 'none'`). Immediate-plus-proration is available as a deliberate per-change operator override. | Negotiated changes are agreed conversationally and rarely need to land mid-cycle. Defaulting to no proration avoids surprise partial charges and credits on a customer's card. The override keeps the immediate path available when a change is genuinely urgent, as an explicit recorded choice rather than the default. |
| PLAT-D011 | accepted | Card payment only. **The 20-day timer in `PLAT-D006` assumes card payment** and must be revisited before any invoice or ACH path ships, because invoices have no dunning cycle and progress at human pace. | Card is what the current customer base uses, and card dunning is what makes a 20-day window sufficient. The dependency is recorded here so an invoice or ACH path cannot be added later without reopening the timer. Accepted cost: clubs requiring purchase orders are excluded for now. |
| PLAT-D012 | accepted | Club accounts are **single-factor** (email code). **Accepted risk:** inbox access equals content-edit access for that club. Mitigated by confining all privileged actions to operator accounts. | Mandatory MFA on club accounts costs every admin an enrollment and a device dependency in exchange for protecting content edits, while the actions that are genuinely dangerous — pricing, cancellation, ownership, domains, archival, cross-tenant work — are operator actions. Moving the second factor to where the power is buys more security for less friction. The risk is accepted, not eliminated. See the Accepted Risk Register. |
| PLAT-D013 | accepted | Operator accounts require **mandatory TOTP**. | Operator functions run through the service-role client and therefore bypass RLS entirely; application-layer authorization is their only gate. This is the highest-value gate in the system, and `PLAT-D012` deliberately concentrates privilege behind it. Related accepted risk: operator power is currently an environment-variable allowlist requiring a deploy to revoke. |
| PLAT-D014 | accepted | There is **no self-service signup**. Sign-in only, with `shouldCreateUser: false`. An unrecognized address receives an explicit "no account for that address" message plus a contact route, accepting the minor enumeration disclosure in exchange for diagnosable support. | Every account is operator-provisioned, so a signup path would only create orphaned Auth users with no club. The explicit message is the deliberate half of the trade: a generic "check your email" for an address that will never receive one produced exactly the failure that blocked `DCFC-504` — an HTTP 200 with no message sent and no way for the person or the operator to tell why. Enumeration exposure is minor for a platform with no self-service signup. |

## Accepted Risk Register

Accepting the sourcing decision accepts the risk. Risks sourced from a package
are accepted when that package is approved.

| Risk | Source | Status | Mitigation |
| --- | --- | --- | --- |
| Automated suspension can take a paying customer's public site offline on a webhook or cron fault | `PLAT-D006` | **Accepted 2026-08-03** with the decision | Measured from `paid_through`; 20-day buffer; mandatory warning notices; `actor_type = 'system'` audit rows; cron disableable by configuration without a deploy |
| Inbox access equals club content access | `PLAT-D012` | **Accepted 2026-08-03** with the decision | All privileged actions confined to operator accounts under mandatory TOTP (`PLAT-D013`) |
| An owner's inbox is sufficient to add another `admin` | Classification table, signed 2026-08-03 | **Accepted 2026-08-03** with the table, after being flagged | Follows from `PLAT-D012`; the added `admin` gains content edits only, and every privileged action remains operator-gated at aal2 |
| Email deliverability becomes a hard authentication dependency | `PLAT-101` | Accepted with the package, not yet approved | Dedicated transactional subdomain with SPF/DKIM/DMARC; bounce and failure monitoring; delivery tested against Yahoo, AOL, and at least one ISP-hosted domain, not only Gmail; operator email-change escape hatch |
| Card-only excludes clubs requiring purchase orders | `PLAT-D011` | **Accepted 2026-08-03** for now | Revisit together with the `PLAT-D006` timer assumption when an academy requires it |
| Youth players cannot be entered until the teams epic | `players.age` check constraint (14–80) | Known limitation | Diverse City's academy content is presentational and does not require youth roster rows |
| Operator power is an environment-variable allowlist requiring a deploy to revoke | `PLAT-D013` | **Accepted 2026-08-03** at one operator | Move to an audited `operators` table at the second operator |

## Deferred and Rejected — Recorded to Avoid Re-litigation

Do not reopen an entry below without the new information its reopen condition
names. Recording the reason is the point: each was considered and set aside for
a stated cause, not overlooked.

| Option | Disposition | Reason | Reopen only if |
| --- | --- | --- | --- |
| Passkeys / WebAuthn | Deferred | The preferred second factor if step-up authentication is ever reintroduced — for self-serve billing, or owner-initiated destructive actions. Not adopted now because `PLAT-D012` removes the need for any second factor on club accounts. | Step-up authentication becomes necessary on club accounts, i.e. `PLAT-D012` is reversed or a privileged action moves from operator to club scope |
| SMS / Twilio | Rejected | Cost is negligible at this volume, but US A2P 10DLC registration adds lead time, and it introduces a third-party dependency sitting between an owner and their billing. | A2P 10DLC lead time is removed, or a customer requirement makes SMS the only viable channel |
| Magic links | Rejected | On mobile the link opens in an email client's in-app browser, creating the session in a context the user then leaves. The reported symptom is "it logged me out," which is difficult to diagnose. | The in-app-browser session-context problem is demonstrably solved, not merely worked around |
| OAuth (Google / Apple / Microsoft) | Deferred, not rejected | A strictly lighter first factor for users who have such an account, but it cannot be the primary path because it is not universal. | Added as a supplementary sign-in path alongside email code — never as a replacement for it |
| Admin-locked-but-site-up state | Rejected | Speculative for a single-customer base: an additional lifecycle state with its own entitlement and recovery behaviour, addressing a scenario that has not occurred. | The scenario actually occurs, or the customer base is large enough that it will |

## Relationships to Existing Records

- `PF-002` (five parallel entitlement sources of truth, with confirmed `shop`
  and `seasons` contradictions) is resolved by deletion in `PLAT-102`, not by
  reconciliation. `PF-001` and `PF-004` remain out of scope.
- `DCFC-601` and `DCFC-602` cannot be executed as written: `DCFC-601` names a
  fixed Pro Price and a canonical tier projection removed by `PLAT-D003` and
  `PLAT-D009`, and `DCFC-602` asserts Programs/Tryouts remain unavailable
  before billing, which `PLAT-102` makes meaningless. `PLAT-103` rewrites both.
  Neither package may be modified before `PLAT-103` is assigned.
- `AGENTS.md` architecture invariants affected on acceptance: "Password
  authentication with mandatory MFA for all admins and owners" (`PLAT-D012`,
  `PLAT-D013`) and the tier-based entitlement model (`PLAT-D003`, `PLAT-D004`,
  `PLAT-D009`). Both must be amended in `AGENTS.md` and
  `docs/onzio-platform-plan.md` when the owning package lands, per the decision
  rules below.
- Nothing in Phase 5 is invalidated. The Diverse City staging tenant, its ten
  media assets, its content, and its published `academy@1` presentation stand.
  This epic changes how people authenticate and what they are permitted to do,
  not what is in the database.

## Open Package-Level Items

These are not decision forks and do not gate acceptance of the decisions above.
They are settled inside the package that owns them and recorded here so they are
not lost between the plan and the package.

| Item | Owning package | Status | Note |
| --- | --- | --- | --- |
| Grace warning schedule | `PLAT-102` | **Settled 2026-08-03** | Day 7 and day 17 of the 20-day window, accepted as proposed |
| Final form of `club_has_feature` | `PLAT-102` | Open | A genuine fork with no proposed answer: a lifecycle-and-kind check, or removal with callers repointed at `can_read_club` / `can_mutate_content`. `PLAT-102` picks one against the finished code |
| Reconciliation report cadence and delivery | `PLAT-102` | Open | No cadence or delivery channel proposed yet. Compares `clubs.stripe_price_id` (intent) with `club_subscriptions.price_id` (fact); divergence is a finding, never a webhook rejection |
| Whether AAL2 survives session refresh | `PLAT-101` | Open — determination, not a choice | Must be established empirically against Supabase Auth, not decided. Determines whether operator re-authentication is per-session or per-refresh |
| Exact session durations for club and operator accounts | `PLAT-101` | Open | Only the shape is agreed — asymmetric, weeks for club accounts and hours for operator accounts. The exact values are still required input for `PLAT-101` |

## Acceptance Record

| ID | Accepted on | Approver | Evidence |
| --- | --- | --- | --- |
| `PLAT-D001`–`PLAT-D014` | 2026-08-03 | Christian | Approved as a set, in session, after the fourteen decisions and their rationale were presented for sign-off or amendment following `P2` promotion. No decision was amended. Acceptance of `PLAT-D006` and `PLAT-D012` accepted their stated risks. |
| Privilege classification table (`PLAT-101`) | 2026-08-03 | Christian | Signed off unamended, in session, as presented in the `PLAT-101` section of `PLATFORM-AUTH-BILLING-PLAN.md`. Sign-off was given after the agent flagged the "Add or remove `admin` members — Club owner — aal1" row as the one row worth the hardest look, because under `PLAT-D012` inbox access to an owner's email is then sufficient to mint another admin, and because that row is what gives an application route a path into the operator module. Christian reaffirmed the table as written; the row stands at `aal1` deliberately. |
| Open item — grace warning schedule | 2026-08-03 | Christian | The proposed day 7 and day 17 of the 20-day window, accepted as proposed. `PLAT-102` implements it. |

The remaining four open items in Open Package-Level Items were not settled by
this acceptance: no concrete value was on offer for them, so there was nothing
to approve. They are settled inside their owning package.

## Decision Rules

- Agents may document options and evidence but may not silently resolve an open
  product or architecture decision, and may not treat promotion into this log as
  acceptance.
- A decision that changes platform architecture must also update
  `docs/onzio-platform-plan.md`, and any `AGENTS.md` invariant it contradicts,
  after Christian approves it.
- When a decision is accepted or superseded, record the date, approver, and
  evidence in this file and update the affected work packages, the plan, and
  `HANDOFF.md`.
- A deferred or rejected option is reopened only against its recorded reopen
  condition, and the reopening is recorded here with the new information that
  justified it.
