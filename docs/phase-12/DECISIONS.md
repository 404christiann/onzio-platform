# Onzio Platform Decision Log

Epic: `PLAT-EPIC-001`

Last updated: 2026-08-03

Statuses: `accepted`, `promoted_awaiting_acceptance`, `open`, `superseded`.

Epic status: all fourteen decisions `accepted` 2026-08-03. The `PLAT-101`
privilege classification table is signed off. `PLAT-101` was approved on
2026-08-03 for Supabase staging project `fxefqnoqxbezeccjvrsw`; that approval
does not authorize any other environment or package.

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
| PLAT-D004 | accepted | `clubs.kind` (`customer` \| `demo` \| `test`) is added so the billing requirement is derivable from the tenant's kind rather than maintained as an exceptions list. Rose City becomes `demo`; Alpha/Bravo become `test`; Diverse City is `customer`. Staging reconciliation found no Rose City row on 2026-08-03; Christian explicitly accepted that environment-specific absence as a no-op and prohibited creating one, so staging backfilled only the three existing named clubs. | Only `kind = 'customer'` requires an active subscription. Without it, the lifecycle automation in `PLAT-D006` would need a hand-maintained exclusion list, and any omission from that list would suspend a demo or test tenant. Deriving the requirement from a column makes the safe behaviour the default. |
| PLAT-D005 | accepted | Diverse City launches on the current single-squad product. The teams epic follows the launch. | The teams epic is large — a `teams` table, `team_id` across players/matches/standings and four stats tables, relaxing the `players.age` 14–80 check, reworking `seasons_one_active_per_club`, team selection across every route and admin editor, and a backfill migration. Sequencing it before launch would delay the first paying customer to deliver capability Diverse City's presentational academy content does not need. |
| PLAT-D006 | accepted | Suspension is automatic on a 20-day timer. **Accepted risk:** an automated path exists from a webhook or cron fault to a paying customer's public site going dark. | Manual suspension does not scale and, in practice, does not happen. The risk is accepted rather than avoided, with mitigations: the window is measured from `paid_through`, is 20 days long, requires warning notices before it fires, writes `audit_events` rows with `actor_type = 'system'`, and the cron must be disableable by configuration without a deploy. See the Accepted Risk Register. |
| PLAT-D007 | accepted | `grace_ends_at = paid_through + 20 days`, written by the webhook when the subscription first reaches `past_due`. | Measuring from `paid_through` places Stripe's entire retry cycle inside the grace window, so dunning completes before suspension is even eligible. Measuring from the `past_due` event instead would let a slow retry schedule push a real recovery past the deadline. |
| PLAT-D008 | **price superseded** by `DCFC-D119` on 2026-08-03 | ~~Diverse City subscribes at **$65/month**~~ — now **$75/month**, Onzio purchasing and managing the club's domain for the $10 difference. **No trial** and no `trialing` support are unchanged and still stand. Consequence recorded in `DCFC-D119` and `DCFC-D120`: the existing $65/month live Price can no longer be reused, so a live $75/month Price must be created manually before `DCFC-901` — `PLAT-102`'s prohibited actions and the original `DCFC-D115` both forbid creating live Prices inside a package. | The commercial terms are already agreed, and the club has been using a staging tenant. A trial would add a lifecycle state carrying its own entitlement and expiry behaviour, for no commercial purpose. Dropping `trialing` removes a state from every lifecycle path rather than adding one. |
| PLAT-D009 | accepted | The Stripe webhook **records** the price Stripe reports. Price validation exists **only at Checkout**, which reads `clubs.stripe_price_id` and never a client-supplied value. The fail-closed `UNKNOWN_PRICE` check is deleted. | Once prices are negotiated per club, no allowlist of known Prices can be kept complete, so a fail-closed webhook check would eventually reject a legitimate subscription and desynchronize the projection from Stripe — the billing source of truth. Validation belongs where the value is chosen, at Checkout, where the server pins the Price from the database. This narrows rather than widens trust in client input. |
| PLAT-D010 | accepted | Price changes take effect at the next renewal with no proration (`proration_behavior: 'none'`). Immediate-plus-proration is available as a deliberate per-change operator override. | Negotiated changes are agreed conversationally and rarely need to land mid-cycle. Defaulting to no proration avoids surprise partial charges and credits on a customer's card. The override keeps the immediate path available when a change is genuinely urgent, as an explicit recorded choice rather than the default. |
| PLAT-D011 | accepted | Card payment only. **The 20-day timer in `PLAT-D006` assumes card payment** and must be revisited before any invoice or ACH path ships, because invoices have no dunning cycle and progress at human pace. | Card is what the current customer base uses, and card dunning is what makes a 20-day window sufficient. The dependency is recorded here so an invoice or ACH path cannot be added later without reopening the timer. Accepted cost: clubs requiring purchase orders are excluded for now. |
| PLAT-D012 | accepted | Club accounts are **single-factor** (email code). **Accepted risk:** inbox access equals content-edit access for that club. Mitigated by confining all privileged actions to operator accounts. | Mandatory MFA on club accounts costs every admin an enrollment and a device dependency in exchange for protecting content edits, while the actions that are genuinely dangerous — pricing, cancellation, ownership, domains, archival, cross-tenant work — are operator actions. Moving the second factor to where the power is buys more security for less friction. The risk is accepted, not eliminated. See the Accepted Risk Register. |
| PLAT-D013 | accepted | Operator accounts require **mandatory TOTP**. | Operator functions run through the service-role client and therefore bypass RLS entirely; application-layer authorization is their only gate. This is the highest-value gate in the system, and `PLAT-D012` deliberately concentrates privilege behind it. Related accepted risk: operator power is currently an environment-variable allowlist requiring a deploy to revoke. With one operator, loss of the verified factor blocks every operator action; recovery is therefore an approval-gated, out-of-band dependency documented in `OPERATOR-TOTP-RECOVERY.md`, not a self-service path. |
| PLAT-D014 | accepted | There is **no self-service signup**. Sign-in only, with `shouldCreateUser: false`. An unrecognized address receives an explicit "no account for that address" message plus a contact route, accepting the minor enumeration disclosure in exchange for diagnosable support. | Every account is operator-provisioned, so a signup path would only create orphaned Auth users with no club. The explicit message is the deliberate half of the trade: a generic "check your email" for an address that will never receive one produced exactly the failure that blocked `DCFC-504` — an HTTP 200 with no message sent and no way for the person or the operator to tell why. Enumeration exposure is minor for a platform with no self-service signup. |

| PLAT-D015 | accepted | Operator `aal2` carries an **application-layer maximum age of 2 hours**, measured from the `totp` entry's `timestamp` in the JWT's `amr` claim. Beyond it, privileged operator actions are refused until a fresh TOTP step-up. | `PLAT-101` specified asymmetric session durations — weeks for club accounts, hours for operator accounts — but Supabase exposes session length only as the project-wide `GOTRUE_SESSIONS_TIMEBOX` and `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT`. There is no per-user or per-role session duration, and both account types live in one project's `auth.users`, so the asymmetry is not configurable and must be enforced in application code. Two hours bounds a stolen operator session to a single working block. Step-up costs one TOTP code and preserves the session, so a long provisioning run pays at most a couple of prompts. See Empirical Findings for the claim behaviour this relies on. |
| PLAT-D016 | **superseded** by `PLAT-D021` on 2026-08-03 | ~~Project-wide session policy is a **30-day timebox with no inactivity timeout**.~~ Accepted and superseded the same day: Christian confirmed that Supabase's session `timebox` and `inactivity_timeout` are Pro-and-above, so this is not configurable on the Free staging project and could not be rehearsed there. The 30-day duration survives into `PLAT-D021`; only the enforcement mechanism changed. | Clubs edit sporadically — weeks apart. An inactivity timeout would mostly penalise the monthly editor, forcing an email code on nearly every visit and reproducing the "it logged me out" support pattern `PLAT-D014` cites as hard to diagnose. A single absolute bound is simpler to reason about and to prove. Operators sit under this ceiling but are separately bounded by `PLAT-D015`, so the long timebox does not weaken privileged access. |
| PLAT-D017 | accepted | `assertOperator()` takes a **verified session, not a caller-supplied `actorId`**, and checks three things: the subject is in the operator allowlist, the session is `aal2`, and its `amr` TOTP timestamp is within `PLAT-D015`'s window. Operator scripts sign in as the operator with TOTP and pass the resulting session. | Forced by `PLAT-D015`: the `amr` timestamp cannot be read without the caller's JWT, so the session rule is unbuildable on the current `actorId: string` signature. This closes the flagged authorization gap rather than deferring it — today `assertOperator` proves only that a string appears in `ONZIO_OPERATOR_USER_IDS`, with no session binding and no AAL check, while operator functions bypass RLS entirely through the service-role client, so a leaked service-role key plus a known operator UUID is total compromise. Accepted cost: every hosted operator run gains a TOTP prompt. |
| PLAT-D018 | accepted | `onzio_private.club_has_feature` is **deleted**. `can_read_feature(club, f)` becomes `can_read_club(club)` and `can_mutate_feature(club, f)` becomes `can_mutate_content(club)`, both retaining the now-unused feature parameter as the re-tiering seam. | Verified against the live schema: 115 policies across 29 tables call `can_read_feature` / `can_mutate_feature`, and **zero call `club_has_feature` directly** — its only callers are those two wrappers. So the fork `PLAT-102` posed rested on a false premise, and collapsing the wrappers costs no policy churn at all. The rejected alternative, reducing `club_has_feature` to a lifecycle-and-kind check, is either redundant with the lifecycle tests already inside `can_read_club` / `can_mutate_content`, or it is a second billing test running alongside `public_access` — which is the `PF-002` shape returning under a new name inside the package meant to eliminate it. Retaining the unused parameter keeps re-tiering an edit to two function bodies rather than a rebuild of 115 policies. |
| PLAT-D019 | accepted | Billing reconciliation is **folded into the daily lifecycle cron and is exception-only**. A clean run logs a structured line and returns 200. A divergence writes a `system` audit row, logs at error level, and returns non-200 with `RECONCILIATION_DIVERGENCE`. | At four clubs and one paying customer, a scheduled digest almost always says "nothing wrong," which trains the reader to ignore it. The application has no outbound email capability — Resend is wired only as Supabase Auth's SMTP provider — so an emailed report would mean building a new dependency, secret, and failure mode to deliver all-clears to one person. The non-200 escalation reuses the pattern `/api/cron/media-cleanup` already applies to partial failure. Divergence remains a finding to investigate and never a webhook rejection, per `PLAT-D009`. |
| PLAT-D020 | accepted | The `PLAT-D006` kill switch and the reconciliation check are **separately flagged**. Disabling suspension stops the `public_access` write only; the cron still runs, still reconciles, and still emits warnings and audit rows. | Folding reconciliation into the suspension cron (`PLAT-D019`) would otherwise couple them, so pulling the emergency switch during a webhook fault would silently stop the billing-drift check at the exact moment billing state is least trustworthy. Two flags preserve the `PLAT-D006` mitigation as written — the cron must be disableable without a deploy — while keeping observability alive through the incident. |

| PLAT-D021 | accepted | Session age is enforced **in the platform, from the `amr` claim, not by Supabase session configuration**. One `onzio_private` helper reads the earliest `amr` timestamp as session start; club sessions are bounded at **30 days** in RLS policies, and operator `aal2` at **2 hours** in `assertOperator()` per `PLAT-D015`. The Supabase `timebox` may still be set in production as defence-in-depth, but nothing depends on it. Supersedes `PLAT-D016`. | Supabase's `timebox` and `inactivity_timeout` are Pro-and-above, and `AGENTS.md` locks staging as a **Free** project, so `PLAT-D016` could be neither configured nor rehearsed on staging — it would have shipped as a production-only, never-rehearsed Auth setting. It was also **orphaned**: `PLAT-101`'s hosted boundary is staging Auth configuration only, `PLAT-102` is billing and `PLAT-103` is documentation, and `PLAT-103`'s scope covers only `DCFC-601`/`602`, so no package could have applied it. Enforcing from `amr` removes the plan-tier dependency entirely, works identically on Free and Pro, rehearses fully on staging, and reuses the mechanism `PLAT-D015` already requires — one helper and one test rather than two systems. It must land in RLS and not only in application code, because an app-layer-only check leaves a still-valid old JWT able to reach PostgREST directly, where policies see membership and lifecycle but nothing about session age. Requires deliberate sign-out handling so an expired session prompts re-authentication instead of returning errors. |

| PLAT-D022 | accepted | Cron alerting is a **heartbeat / dead-man's-switch**. The lifecycle cron pings a monitoring URL on a clean run and signals failure explicitly on divergence or error; the service alerts both when a failure is reported **and when an expected ping does not arrive**. Extending the same heartbeat to `/api/cron/media-cleanup` is proposed but **not authorized here** — see the scope note below. | Vercel records cron invocations but sends no native notification for an individual cron failure or non-200, so `PLAT-D019`'s escalation was a pull, not a push, and the delivery half of the reconciliation question was not actually closed. A webhook push from inside the handler would fix that only for runs that happen. The failure mode nothing detects today is **silence** — a dropped `vercel.json` entry, a rotated `CRON_SECRET`, a platform fault — and because this same cron carries `PLAT-D006`'s suspension work, silent non-execution means grace warnings never send and overdue customers never suspend, while reconciliation quietly stops. A heartbeat is the only one of the three options that covers absence, and it costs one outbound fetch and one secret with no SDK and no log drain. Accepted dependency: alerting now depends on a third-party monitor, but its failure mode is a spurious or missed alert, never a broken customer path — materially unlike making email load-bearing for authentication, which is why the same objection did not sink this the way it sank an emailed digest in `PLAT-D019`. |

**Scope note on `PLAT-D022`.** `/api/cron/media-cleanup` has had the same blind
spot since Phase 8 and would benefit from the same heartbeat, but it is Phase 8
infrastructure and `PLAT-102`'s permitted actions name only the new lifecycle
cron. Extending it requires either an explicit widening of `PLAT-102`'s scope or
its own small package. It is recorded here as proposed, not authorized.

| PLAT-D023 | accepted | The `PLAT-D014` unknown-address response is **explicit, names no account, and routes to `onziofutbol@gmail.com`**. Exact text is pinned below. | `shouldCreateUser: false` returns only the generic `Signups not allowed for otp`, so this text is application-side error mapping and must be written down rather than left to implementation. Explicitness is the point: a vague "check your email" for an address that will never receive one is exactly what stalled `DCFC-504`, where Supabase returned HTTP 200, sent nothing, and neither the recipient nor the operator could tell why. The address is a personal Gmail rather than a domain mailbox; accepted deliberately at one operator, with the known cost that it is published on a public error page and will attract scraping. It does not affect authentication deliverability, which flows through Resend on `auth.onziofutbol.com`. |

**Pinned text for `PLAT-D023`.** `PLAT-101` implements this verbatim; wording
changes need a new decision.

> **No account for that address**
>
> We couldn't find an Onzio account for **{email}**.
>
> Onzio accounts are set up by us — there's no signup. If your club is new, or
> you're using a different address than the one we set up for you, that's
> usually the reason.
>
> Double-check the address, or email us at **onziofutbol@gmail.com** and we'll
> sort it out.

## Accepted Risk Register

Accepting the sourcing decision accepts the risk. Risks sourced from a package
are accepted when that package is approved.

| Risk | Source | Status | Mitigation |
| --- | --- | --- | --- |
| Automated suspension can take a paying customer's public site offline on a webhook or cron fault | `PLAT-D006` | **Accepted 2026-08-03** with the decision | Measured from `paid_through`; 20-day buffer; mandatory warning notices; `actor_type = 'system'` audit rows; cron disableable by configuration without a deploy |
| Inbox access equals club content access | `PLAT-D012` | **Accepted 2026-08-03** with the decision | All privileged actions confined to operator accounts under mandatory TOTP (`PLAT-D013`) |
| An owner's inbox is sufficient to add another `admin` | Classification table, signed 2026-08-03 | **Accepted 2026-08-03** with the table, after being flagged | Follows from `PLAT-D012`; the added `admin` gains content edits only, and every privileged action remains operator-gated at aal2 |
| Email deliverability becomes a hard authentication dependency | `PLAT-101` | **Accepted 2026-08-03** with the exact staging package approval | SPF/DKIM in place; DMARC `p=none` pending separate hardening; local signed bounce/failure monitoring is implemented in `PLAT-102` but the hosted Resend webhook remains separately approval-gated and unconfigured; delivery verified against Yahoo and Gmail, AOL and ISP-hosted waived 2026-08-03 as accepted residual risk. |
| Card-only excludes clubs requiring purchase orders | `PLAT-D011` | **Accepted 2026-08-03** for now | Revisit together with the `PLAT-D006` timer assumption when an academy requires it |
| Youth players cannot be entered until the teams epic | `players.age` check constraint (14–80) | Known limitation | Diverse City's academy content is presentational and does not require youth roster rows |
| Operator power is an environment-variable allowlist requiring a deploy to revoke | `PLAT-D013` | **Accepted 2026-08-03** at one operator | Move to an audited `operators` table at the second operator. Note `PLAT-D017` narrows the exposure by binding the caller to a verified session, but revocation still needs a deploy |
| Loss of the sole operator's TOTP device blocks every operator action | `PLAT-D013` | **Documented operational dependency 2026-08-03** | Approval-gated break-glass recovery: verify identity out of band, revoke sessions, replace only the authorized factor, privately re-enroll, prove fresh AAL2, and write an append-only audit event; see `OPERATOR-TOTP-RECOVERY.md` |
| Alerting depends on a third-party heartbeat monitor | `PLAT-D022` | **Accepted 2026-08-03** | Its failure mode is a spurious or missed alert, never a broken customer path; the cron and its suspension logic run regardless of whether the monitor is reachable |

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

All five items from `PLATFORM-AUTH-BILLING-PLAN.md` were worked through on
2026-08-03 and are closed. Two new verification tasks were opened in their
place; neither is a decision.

| Item | Owning package | Status | Note |
| --- | --- | --- | --- |
| Grace warning schedule | `PLAT-102` | **Settled 2026-08-03** | Day 7 and day 17 of the 20-day window, accepted as proposed |
| Final form of `club_has_feature` | `PLAT-102` | **Settled 2026-08-03** | Resolved by `PLAT-D018`. The posed fork was based on a false premise; see Empirical Findings |
| Reconciliation report cadence and delivery | `PLAT-102` | **Settled 2026-08-03** | Resolved by `PLAT-D019` and `PLAT-D020` |
| Whether AAL2 survives session refresh | `PLAT-101` | **Resolved 2026-08-03 — proven, not decided** | AAL2 survives refresh. Operator re-authentication is therefore per-session, never per-refresh, which is what makes `PLAT-D015` necessary. Evidence in Empirical Findings |
| Exact session durations for club and operator accounts | `PLAT-101` | **Settled 2026-08-03** | Resolved by `PLAT-D015` and `PLAT-D016`, after the original asymmetric framing was found to be unimplementable via Auth configuration |
| ~~are `timebox` / `inactivity_timeout` available on Supabase Free?~~ | `PLAT-101` | **Resolved 2026-08-03 — no, Pro and above** | Confirmed by Christian. `PLAT-D016` was therefore unconfigurable and unrehearsable on Free staging, and orphaned besides — no package could apply it. Superseded by `PLAT-D021`, which enforces session age from the `amr` claim and depends on no plan tier |
| ~~`PLAT-D014`'s explicit unknown-address message is application work~~ | `PLAT-101` | **Settled 2026-08-03** | Text and contact route pinned by `PLAT-D023`. Remains application-side error mapping; Supabase supplies only the generic `Signups not allowed for otp` |
| **New:** DMARC on `onziofutbol.com` is `p=none` | separate small task | Open — hardening | Verified live 2026-08-03: DKIM (`resend._domainkey.auth`), SPF (`send.auth`, `v=spf1 include:amazonses.com ~all`), and bounce MX all resolve correctly; DMARC exists at the root but only monitors. Acceptable while email is a convenience, weaker once email is the sole authentication path. Tightening to `p=quarantine` is a DNS change needing its own approval and is **not** a `PLAT-101` blocker |
| ~~does Vercel notify on a failed cron for this account?~~ | `PLAT-102` | **Resolved 2026-08-03 — no, it records only** | Confirmed by Christian. Vercel logs cron invocations to the Logs and Cron tabs; native notifications cover deployment failures and broad error-rate anomalies, but there is no native push or webhook for an individual cron failure or non-200. `PLAT-D019`'s escalation was therefore a pull. Closed by `PLAT-D022`, which also covers the non-execution case neither option addressed |

## Empirical Findings

Established on 2026-08-03 against the loopback stack and the live local schema,
not asserted from the plan. Throwaway probe users were deleted; no hosted
system was touched.

| Finding | Method | Consequence |
| --- | --- | --- |
| **AAL2 survives access-token refresh.** `auth.sessions.aal` is a session-level column. Across two refreshes 12s apart — past the 10s reuse interval, with token strings and `iat`/`exp` all advancing — `aal` stayed `aal2` and `amr` kept `password` + `totp` on one session id | Local Supabase probe, TOTP enrolled and verified, `refreshSession` twice | Closes the open item. Operator re-auth is per-session, so session lifetime is the only bound on privileged access — the reason `PLAT-D015` exists |
| **`amr[totp].timestamp` is stable across refresh while `iat` moves.** The claim records when the session reached aal2 | Same probe, full `amr` decoded before and after refresh | Gives `PLAT-D015` its input as a plain JWT claim — no `auth.sessions` read, no service-role lookup, usable identically in SQL and application code. `iat` is token age, not session age, and is unusable for this |
| **In-place TOTP re-verification advances the timestamp and keeps the session.** `1785779037 → 1785779072`, same session id | Same probe, second `challengeAndVerify` after a fresh TOTP window | Step-up is one code with no sign-out and no email round-trip, which is what makes a 2-hour window cheap enough to accept |
| **Supabase session length is project-wide.** `timebox` and `inactivity_timeout` map to `GOTRUE_SESSIONS_TIMEBOX` / `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT`, server-level env settings | Supabase CLI config schema; running GoTrue container environment | `PLAT-101`'s asymmetric session durations are not configurable. Forced `PLAT-D015` and `PLAT-D016` |
| **115 policies across 29 tables gate on the feature wrappers, and none call `club_has_feature` directly.** Its only callers are `can_read_feature` and `can_mutate_feature` | `pg_policies` and `pg_proc` queries against the live local schema | `PLAT-102`'s posed fork was a false choice. Made `PLAT-D018` free of policy churn |
| **The application has no outbound email capability.** Resend is configured only as Supabase Auth's SMTP provider; no `lib/` code sends mail | Source search across `lib/` and `app/` | An emailed reconciliation report would be a new dependency, not a scheduling choice. Informed `PLAT-D019` |
| **Email-OTP sign-in produces `amr: [{method: "otp", timestamp}]` at `aal1`, and the timestamp is stable across refresh** while `iat` moves | Local probe: `signInWithOtp` with `shouldCreateUser: false`, code retrieved from the local mailbox, `verifyOtp`, then refresh | Confirms the club half of `PLAT-D021` is buildable on the same mechanism as `PLAT-D015`. `aal1` is the expected single-factor result under `PLAT-D012` |
| **`shouldCreateUser: false` on an unknown address returns the generic `Signups not allowed for otp`** and creates no user | Same probe, negative case | No user is created, as `PLAT-D014` requires. But the explicit "no account for that address" message is **application-side error mapping**, not a Supabase-provided message — an implementation obligation `PLAT-101` must carry |
| **The stock Magic Link template emits a link, not a code.** The local template produced a `verify?token=…&type=magiclink` URL with no six-digit code | Same probe, message body inspected | Independently confirms `PLAT-101`'s stated requirement to alter the template to emit `{{ .Token }}`. Until that change, there is no code for a user to type |

## Acceptance Record

| ID | Accepted on | Approver | Evidence |
| --- | --- | --- | --- |
| `PLAT-D001`–`PLAT-D014` | 2026-08-03 | Christian | Approved as a set, in session, after the fourteen decisions and their rationale were presented for sign-off or amendment following `P2` promotion. No decision was amended. Acceptance of `PLAT-D006` and `PLAT-D012` accepted their stated risks. |
| Privilege classification table (`PLAT-101`) | 2026-08-03 | Christian | Signed off unamended, in session, as presented in the `PLAT-101` section of `PLATFORM-AUTH-BILLING-PLAN.md`. Sign-off was given after the agent flagged the "Add or remove `admin` members — Club owner — aal1" row as the one row worth the hardest look, because under `PLAT-D012` inbox access to an owner's email is then sufficient to mint another admin, and because that row is what gives an application route a path into the operator module. Christian reaffirmed the table as written; the row stands at `aal1` deliberately. |
| Open item — grace warning schedule | 2026-08-03 | Christian | The proposed day 7 and day 17 of the 20-day window, accepted as proposed. `PLAT-102` implements it. |
| `PLAT-D023` | 2026-08-03 | Christian | Christian supplied `onziofutbol@gmail.com` as the contact route after being told the address would be published on a public error page and that a domain mailbox would read as more legitimate. He chose the Gmail address; the trade-off is recorded in the decision rather than re-argued. |
| `PLAT-D022` | 2026-08-03 | Christian | Accepted after Christian confirmed Vercel records cron failures without notifying, which left `PLAT-D019`'s escalation as a pull. Chosen over an in-handler webhook push and over a log drain, because only a heartbeat detects a cron that stops firing — the failure mode that would silently disable `PLAT-D006`'s suspension warnings as well as reconciliation. |
| `PLAT-D021` | 2026-08-03 | Christian | Accepted after Christian confirmed that Supabase session `timebox` / `inactivity_timeout` are Pro-and-above, which invalidated the premise of `PLAT-D016` the same day. Chosen over accepting a third Free-plan staging exception, and over upgrading staging to Pro (an `AGENTS.md` invariant change). Verified before recording: an email-OTP sign-in produces a stable `amr` timestamp, so the club bound is buildable on the mechanism `PLAT-D015` already needs. |
| `PLAT-D015`–`PLAT-D020` | 2026-08-03 | Christian | Decided one at a time in a structured design review of the four remaining open items, later the same day. Each was chosen against stated alternatives and their costs. The review ran probes against the loopback stack and queries against the live local schema rather than reasoning from the plan; results are in Empirical Findings. Three of the six were forced by findings that contradicted the plan's own framing: `PLAT-D015`/`PLAT-D016` because asymmetric session durations are not configurable, `PLAT-D017` because the session rule cannot be built on the current `assertOperator` signature, and `PLAT-D018` because no policy calls `club_has_feature` directly. `PLAT-D020` resolves a collision the review found between `PLAT-D019` and the `PLAT-D006` kill-switch mitigation. |

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
