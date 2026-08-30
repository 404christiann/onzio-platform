# Diverse City FC Protected Staging Acceptance

Epic: `DCFC-EPIC-002`

Status: `dcfc_603_complete_staging_gate_accepted`

Last updated: 2026-08-06

This checklist is the evidence surface for `DCFC-501`–`DCFC-603`. It is not
authorization to inspect or mutate staging. Each package retains its action
class and separate approval boundary from `ROLLOUT-WORK-PACKAGES.md`.

## Preflight Resource Record (`DCFC-501`)

Record safe identifiers only; never record secrets.

| Resource | Required evidence | Result/evidence |
| --- | --- | --- |
| Supabase | Exact staging organization/project ref, region, health, plan/capacity | **Pass, re-attested 2026-08-02:** `Onzio Staging` (`udlsrxgfpkqjaridfxnz`), Free plan; `Onzio Platform Staging` (`fxefqnoqxbezeccjvrsw`), `us-west-2` / West US (Oregon), healthy `nano`. Dashboard sample: 6/60 connections, 2% CPU, 3% disk, and 49% RAM. Free staging has no downloadable daily backups; Christian accepted the restricted manual-backup replacement for this gate. |
| Schema | Local/remote migration ledgers match; no local seed applied remotely | **Pass:** the approved history-only six-version repair replaced the three verified Phase 7 execution timestamps with the three canonical versions without running schema SQL. The linked ledger now aligns all ten canonical Phase 1-7 versions. `supabase db push --linked --dry-run` lists exactly the ten reviewed Phase 9/11 files reserved for `DCFC-502`; no push or seed ran. Linked `onzio,onzio_private` lint is clean. All 32 current `onzio` tables have RLS; all 15 current security-definer functions have an empty search path. |
| Keys/API | Modern staging-only key posture; `onzio` exposed, `onzio_private` unexposed | **Pass:** the Data API is enabled; exposed schemas are `graphql_public`, `onzio`, and `public`, while `onzio_private` is excluded. The modern default publishable key is active, and the legacy JWT keys remain disabled. `onzio_private` has zero browser table grants and zero `PUBLIC` routine grants. No key value was copied or recorded. |
| Auth/email | Passwordless club email codes, operator TOTP, session boundaries, staging SMTP sender/rate limits | **Pass for the approved PLAT-101 configuration; hosted app acceptance pending:** self-signup remains disabled and email auth enabled. Email codes are six digits, expire after 86,400 seconds, and use a code-only Onzio template with the token first in the subject. Supabase timebox/inactivity remain `never`; the platform enforces 30-day club and two-hour operator-TOTP age from JWT AMR. The former Free-plan leaked-password exception is retired because club password paths were deleted. Existing `DCFC-504` identity/message evidence remains historical; see the amendment below. Custom SMTP, rate limits, staging-only URLs, factors, memberships, and tenant data were not changed by PLAT-101. |
| Existing tenants | Alpha/Bravo IDs, domains, lifecycle/tier, owners/admins, content baseline | **Pass:** Alpha `362f4276-0e0b-4c6a-989d-3e59713c1d9f`, Starter/active/live at `alpha-onzio-staging.vercel.app`, has three active memberships. Bravo `fae51a8d-63b5-468c-bb7a-6e2b31d90035`, Starter/onboarding/preview at `bravo-onzio-staging.vercel.app`, has two. Database baseline: two clubs, two domains, five memberships, four explicitly `orphaned` media rows, 45 audit events. Both Storage buckets have zero objects, matching the orphaned cleanup state. No owner/admin identity was recorded. |
| Vercel | Exact project, protected staging branch/deployment, Preview-only env-name inventory | **Pass for `DCFC-501`:** project `prj_I362ysmh9cse5cRxnL7db4dOhsEs` resolves as `onzio-rcfc`. All non-custom-domain deployments remain protected, Git-fork protection is enabled, and final readback shows exactly one replacement automation bypass with `isEnvVar=true`. Header and query probes reached the application and returned HTTP `400 INVALID_SIGNATURE`, not a Vercel Authentication redirect. The historical ready deployment and stable/Alpha/Bravo aliases remain unchanged. Its older commit is the explicitly recorded release delta for `DCFC-502`, not authorization to deploy it during `DCFC-501`. No environment value or bypass secret was recorded. |
| Stripe | Test mode, existing Starter/Pro Prices, Portal, webhook/event allowlist | **Pass:** the recorded Starter (`$65/month`) and Pro (`$99.99/month`) Prices and test Portal remain unchanged. Enabled test webhook `we_1TxrnaK6WajTkwHYtFEvCEo8` now targets the existing protected staging alias at `/api/stripe/webhook`, includes the replacement bypass, remains `livemode=false`, and retains exactly the seven approved events. No signing secret or bypass value was recorded. |
| Monitoring | Runtime logs, media cleanup boundary, current alert/monitor posture | **Pass:** the final last-24-hour read contained 26 API entries (25 HTTP 200, one expected protected 401), one Auth HTTP 200 info entry, three Storage entries, and 33 Postgres entries. The only two Postgres errors were this acceptance pass's read-only misspelled-column queries and were immediately corrected; no runtime error signal remained. Dashboard overview showed 12 requests in the prior hour with no visible service warning/error. Both Storage buckets remain empty and cleanup queue remains zero. Existing performance-advisor items are informational/pre-existing and are not a staging-capacity stop. |
| Rollback | Prior deployment, schema/tenant backup/export, cleanup owner | **Pass:** prior ready deployment `dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua` remains identifiable. The fresh restricted backup at `/Users/christianalcala/Downloads/onzio-migration-private/diverse-city-staging-phase5-2026-08-02T161244Z` contains non-empty mode-`0600` role/schema/data dumps under a mode-`0700` directory; exact sizes and SHA-256 values are recorded in `DCFC-501-REMEDIATION-PLAN.md`. Christian Alcala remains cleanup/rollback owner. |

Preflight stop conditions:

- [ ] Any resource cannot be proven staging-only.
- [ ] Production or live Stripe credentials appear in Preview scope.
- [ ] Staging migrations drift from reviewed repository migrations.
- [ ] Vercel Deployment Protection is absent or bypass scope is unclear.
- [ ] Alpha or Bravo baseline is unknown or already inconsistent.
- [ ] Capacity/quota cannot safely support the tenant and planned media.

All `DCFC-501` preflight stop conditions are clear. `DCFC-501` is complete.
The ten pending migrations, stale deployment, and tenant absence are the
explicitly enumerated `DCFC-502` work; this record does not authorize applying,
deploying, or provisioning them.

## Remediation Approval Gate

`DCFC-501-REMEDIATION-PLAN.md` records the exact targets, verified migration
mapping, Free-plan decisions, backup destination boundary, atomic bypass/test
webhook sequence, rollback, stop conditions, hosted-mutation ceiling, and
approval language. Christian approved it on 2026-08-02, it completed, and its
authorization is exhausted. It did not authorize any `DCFC-502` action.

## Provisioning and Release (`DCFC-502`)

Prepared inputs, the ten-migration allowlist, exact boundary, rollback, approval,
and final hosted evidence are in `DCFC-502-APPROVAL-PACKET.md`. Christian's
exact approval was received and exhausted on 2026-08-02. All items below passed;
`DCFC-502` is complete and this checklist does not authorize `DCFC-503`.

- [x] Fresh package approval names the exact Supabase ref, Vercel project,
  release commit, migrations, tenant slug/name, hostname, and operator actor.
- [x] Pre-change migration, deployment, tenant/domain, and log evidence saved.
- [x] Only reviewed checked-in migrations are applied; `supabase/seed.sql` is
  never run against hosted staging.
- [x] Exact release commit is deployed from `staging` and remains protected.
- [x] Diverse City is provisioned exactly once through audited operator
  tooling.
- [x] Lifecycle is `onboarding`; public access is `preview`; tier remains the
  operator workflow's pre-billing Starter default.
- [x] Staging domain is active, verified, tenant-specific, and non-indexed.
- [x] Unknown/unverified/cross-tenant hosts fail closed with `no-store` and
  `noindex` behavior.
- [x] Audit event and tenant/domain rows reconcile.
- [x] No content/media, invitation, email, Stripe object, live domain, or
  production resource changed.

## Content, Media, and Presentation (`DCFC-503`)

- [x] Fresh package approval names the exact immutable plan digest and tenant.
- [x] Imported content matches only accepted/hide dispositions from
  `CONTENT-MEDIA-READINESS.md`.
- [x] No preview-only player/staff/fixture/standings/shop/sponsor value or
  temporary Google registration URL is present.
- [x] No registration, payment, waiver, medical, signature, participant, or
  eligibility-document record/table/path is introduced.
- [x] All external registration URLs are approved public content and validate
  to the expected HTTPS host.
- [x] Source/normalized/uploaded/reused/object/asset/reference/checksum totals
  reconcile.
- [x] All media references remain tenant-composite and use UUID-versioned raw
  `onzio-media` URLs.
- [x] No Supabase runtime Image Transformation or `/_next/image` URL appears.
- [x] Staging input is removed after finalization; failed cleanup is queued and
  scoped.
- [x] A production-valid immutable `academy@1` document is assigned/published;
  its digest, routes, modules, font pack, and sections match the manifest.
- [x] Video-backed sections follow the recorded `DCFC-D114` disposition; no
  unimplemented Bunny reference is present.
- [x] Identical replay is idempotent and changes no approved row/object count.

Execution evidence, 2026-08-02: the approved semantic digest
`63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`
and byte SHA-256
`87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b`
reproduced independently. Final staging contains ten tenant-scoped public
objects and ten matching `media_assets` totaling 2,864,062 bytes; every
checksum and path matches, all objects are `image/webp` with
`max-age=31536000`, all ten raw URLs return HTTP 200, and private staging and
cleanup queue counts are zero. Approved content reconciles at four Programs,
one Contact profile/page, four shop-kit photos, two shop-carousel photos, two
Elsa's Bakery placements, and zero Tryouts/players/staff/matches/standings.
All 15 media relationships resolve through the same tenant and forbidden URL/
placeholder scans return zero. Immutable published `academy@1` digest
`1d2c6ce9eb91be5cc18a6017ffc783bdaedd231b40ea2bf5f3830b9b3549a008`
matches the publication and current pointer. Identical replay kept state
fingerprint `babdad9053e708e696f88a6af59e8231`, one import audit, and every
row/object/pointer count unchanged while reusing all ten public objects.
The tenant remains Starter/onboarding/preview with zero subscription; Auth
remains seven users/five MFA factors. `DCFC-503` is complete and its approval
is exhausted. This record does not authorize `DCFC-504`.

## Identity, Email, and MFA (`DCFC-504`)

Read-only preparation on 2026-08-02 selected the no-duplicate reuse path in
`DCFC-504-APPROVAL-PACKET.md`. The existing confirmed Diverse City owner has
no prior sign-in, TOTP factor, or active session, so the proposed acceptance
uses exactly one staging recovery request followed by private password setup,
fresh sign-in, and first-time TOTP enrollment. At preparation time no send or
Auth mutation was authorized or performed, and automatic password/factor
notification settings remained a required pre-send check.

Christian approved the packet and the exact minimal Auth remediation on
2026-08-02. Codex added only the Diverse City callback as the fourth redirect
URL. A fresh dashboard reload showed the Site URL and original branch, Alpha,
and Bravo entries unchanged, the exact tenant callback present, and four total
entries. Christian then submitted the protected recovery form exactly once.
Supabase returned HTTP 200 but did not set `recovery_sent_at`, and Resend has no
new message. The one active owner is a confirmed `example.com` identity rather
than the intended deliverable operator identity; the privately entered address
does not exist in staging Auth. The package is blocked and must not resend
without fresh identity-remediation and one-send approval.

Christian privately confirmed that the absent address is the intended owner
and approved the exact reusable operator-issued invitation flow. The guarded
workflow created one new Auth user, sent exactly one invitation with the
verified tenant callback, added the temporary second owner, and wrote the
expected membership and invitation audits. Resend records the sole message as
delivered. Christian privately opened the link, changed the password, recovered
the browser-saved value, signed in, enrolled exactly one TOTP factor, and
reached AAL2. The protected shell resolved Diverse City FC; Contact loaded at
the Starter boundary, Programs and Tryouts remained Pro-gated, and the
owner-only Payments route loaded the private-preview state. Codex then removed
only the synthetic owner membership with a guarded audited transaction and
retained its pre-existing Auth user. Final state is eight Auth users, one active
owner, one removed synthetic membership, one AAL2 session, zero AAL1 sessions,
one verified TOTP factor, 29 tenant audits, and one operator removal audit.

- [x] Approved owner/admin recipients and roles are stored outside Git.
- [x] Existing Auth identity reuse vs. new identity creation is decided before
  provisioning; no duplicate user is created.
- [x] Each send has explicit approval and only one current action is delivered.
- [x] Provider evidence records message ID/status and recipient domain only;
  no body, code, token, or URL is captured.
- [x] Invitation/recovery callback uses only the verified staging tenant host.
- [ ] Expired, reused, forged, unsupported, and caller-supplied redirects fail
  closed.
- [x] Password setup/recovery succeeds; password values are never recorded.
- [x] AAL1 cannot load protected admin or mutate content.
- [x] Each owner/admin enrolls or verifies TOTP and reaches AAL2; Contact and
  other Starter-accessible protected areas work while Pro-only Programs/
  Tryouts remain unavailable before `DCFC-601` billing projection.
- [x] Admin cannot access billing; owner can reach billing flow.
- [x] Membership removal/revocation behavior is proven safely or inherited
  from a current generic staging gate with directly applicable evidence.
- [x] Final users, memberships, sessions, factors, and audit-event counts match
  the approved identity manifest.

### PLAT-101 amendment — 2026-08-03

`DCFC-504` is complete and its historical evidence remains true for the flow
that was accepted on 2026-08-02, but its password-plus-owner-TOTP sign-in model
is superseded for future releases by accepted decisions `PLAT-D012`–`D017`,
`D021`, and `D023`. PLAT-101 deletes the club recovery/password routes and
makes owner/admin sign-in a six-digit email-code flow at AAL1. Club access is
bounded to 30 days from the earliest valid AMR entry; operator functions alone
require AAL2 plus a TOTP AMR entry no older than two hours.

The approved staging Auth mutation changed only OTP expiry `3600` → `86400`,
OTP length `8` → `6`, and the Magic Link/OTP subject/body from the stock
link-based template to the checked-in code-only Onzio template. Self-signup was
already off, email auth was already on, and session timebox/inactivity remain
`0` (`never`). Schema migrations `20260803192838` and `20260803192943` changed
only the governed authorization functions and six named read policies; no Auth
user, factor, session, membership, tenant content, Storage object, Stripe,
Vercel, DNS, or production resource changed.

Local replacement evidence is green: first and returning owner sign-in, exact
unknown-address failure with no user creation, owner adds/removes an admin,
admin signs in with the pre-sent code, tenant/role/session/operator negative
boundaries, and desktop/mobile protected-shell checks. The deployed staging
application now serves exact approved commit `16b2a21` through protected Preview
deployment `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`, which is `READY`. The build and
deployment protection are verified, but this amendment does not claim hosted UI
acceptance. The approved operator identity has exactly one verified TOTP factor
and no unresolved or other factors, satisfying the enrollment requirement.
Hosted owner/admin UI, AAL1 operator refusal, fresh-AAL2 operator success, and
delivery to Yahoo, AOL, and one ISP-hosted domain are still required before
PLAT-101 can close.

## Public and Admin Acceptance (`DCFC-602`)

Run at 1440×900 desktop and 390×844 mobile.

- [ ] `/`, `/club/about`, and every approved visible core route return the
  intended Diverse City presentation.
- [ ] `/programs` and every approved visible Program slug render exact staged
  content; hidden/unknown slugs fail closed.
- [ ] `/contact` renders current approved destinations and no submission form.
- [ ] `/tryouts` renders only approved events; absent registration fails closed
  and external registration is disclosed as third-party.
- [ ] Navigation/footer contain only approved visible routes and destinations.
- [ ] Typography, spacing, crop/aspect, section order, responsive stacking,
  interaction, focus, reduced-motion, empty/error states, and contrast match
  the accepted visual/production disposition.
- [ ] No horizontal overflow, framework overlay, console/page error, broken
  image, unexpected fallback, or unavailable route exists.
- [ ] Every visible image has positive natural dimensions and a raw immutable
  object URL.
- [ ] Public and admin responses retain `noindex, nofollow` in headers and
  metadata.
- [ ] Programs, Contact, and Tryouts editors load at AAL1 on both viewports,
  per `PLAT-D012` (club accounts are single-factor; AAL2 is operator-only).
- [ ] Approved edit/read/restore probes reach the anonymous public query layer
  and final before/after content/presentation digests match.
- [ ] Loading, empty, validation, upload, success, error, retry, and unsaved-
  change states are checked on affected admin workflows.

## Alpha/Bravo/Diverse City Isolation (`DCFC-602`)

Route/admin browser sweep update, 2026-08-06: Christian approved deploying the
DCFC-602 local fixes to staging. Final clean Vercel deployment
`dpl_7FrP6DkXd8yrwF5xvrye4Y7dtP54`
(`https://onzio-rcfc-p1mslxsdy-404christianns-projects.vercel.app`) is now the
target for `https://diverse-city-onzio-staging.vercel.app`. A Chrome sweep using
only the approved `.env.local` Vercel bypass cookie checked desktop `1440x900`
and mobile `390x844` for `/`, `/club/about`, `/programs`,
`/programs/youth-academy`, `/programs/special-kickers-program`,
`/programs/special-olympics-soccer`, `/programs/upsl-mens-teams`, `/contact`,
`/tryouts`, `/admin/programs`, `/admin/contact`, and `/admin/tryouts`.
Result: expected Diverse City content rendered on every route; no 404;
no `CLUB_INACTIVE`; no visible Rose City/Pasadena copy; zero broken images;
zero horizontal overflow; zero console errors. This records the
desktop/mobile public-route and owner-admin editor portion only; the unchecked
non-browser isolation/security boxes below still require their own evidence.

Non-browser isolation/security update, 2026-08-06: Supabase staging project
`fxefqnoqxbezeccjvrsw` was checked through read-only SQL plus one
rollback-only authenticated RLS insert probe. No Stripe, Auth session/factor,
email, DNS, Storage-object, public-access, production, or tenant-content
mutation was performed. Evidence: Alpha, Bravo, and Diverse City staging
hostnames each resolved to exactly one active/verified staging tenant; malformed
and spoofed host strings resolved to zero tenants; existing Program, Contact,
Tryouts, media, and presentation relationships had zero cross-tenant
violations; Alpha/Bravo/Diverse private `club_members` RLS visibility was
tenant-scoped for the single-tenant Alpha admin and Bravo owner fixtures; hosted
catalog inspection confirmed composite `(club_id, id)` foreign keys for
Program/media, Tryouts/Program, Tryouts/media, Contact/media, and presentation
document pointers; Storage buckets/policies matched the private staging/public
media posture and route staging path checks through tenant ID plus surface
entitlement. Christian approved restoring the temporary Diverse City admin
membership for `christianalcala3@yahoo.com`; the row was marked `removed` at
`2026-08-06T20:15:19.430016+00:00` and post-cleanup reconciliation confirmed it
removed for Diverse City while `christianjavieralcala@gmail.com` remains active.
Accepted fixture exception: `christianjavieralcala@gmail.com` intentionally
remains an active owner on both Alpha and Diverse City in staging, so those two
tenant memberships are treated as Christian-owned staging fixtures rather than
a cross-tenant leak.

- [x] Each hostname resolves to exactly one tenant and emits a distinct
  tenant/cache identity.
- [x] HTML, RSC, metadata, route params, navigation, media, and presentation
  documents never cross tenants.
- [x] Alpha, Bravo, and Diverse City cannot read private rows belonging to one
  another.
- [x] Each AAL2 identity can write only its own tenant and cannot reference
  another tenant's Program/media/content ID.
- [x] Composite foreign keys reject cross-tenant Program, Tryouts, and media
  relationships with the exact expected signature.
- [x] Content availability is correct: Contact, Programs, and Tryouts are all
  available once `public_access` is `live` or `grace`, per `PLAT-D018`; no
  tier-gated difference remains.
- [x] Direct Storage staging paths enforce the correct surface entitlement and
  tenant ID.
- [x] Unknown, spoofed, inactive, preview-cross-host, and malformed host/origin/
  path/return URL cases fail closed.
- [x] Temporary probe values, memberships, sessions, factors, media, and
  presentation pointers are restored and reconciled.

## Platform Billing Foundation (`PLAT-102`)

Closed out 2026-08-05 on Bravo staging. Evidence recorded in `HANDOFF.md` and
`docs/phase-11/diverse-city/STATUS.md`; each box below was independently
re-verified against the linked staging project rather than taken on claim.

- [x] Migration `20260804024349_plat_102_billing_entitlement.sql` is applied
  only to Supabase staging project `fxefqnoqxbezeccjvrsw` under exact approval.
  Confirmed present in `supabase_migrations.schema_migrations`, alongside its
  two follow-ups (`plat_102_function_search_paths`,
  `plat_102_grace_content_edits`).
- [x] The guarded backfill reconciles exactly Diverse City `customer` with test
  Price `price_1U0Y0sK6WajTkwHYnnttR9nN`, Rose City `demo`, and Alpha/Bravo
  `test`; before/after row counts and sanitized audits match. Re-verified live:
  Diverse City is `kind=customer`, Alpha is `kind=test`, Rose City has no row
  (accepted no-op per `PLAT-D004`), Bravo is `kind=test`.
- [x] Checkout reads only `clubs.stripe_price_id`, refuses client Price/tier
  input, and never reads the live or superseded $65 Price. Confirmed by
  reading `app/api/stripe/checkout/route.ts` and `buildCheckoutDecision`:
  the route never parses a request body for price/tier, and the function
  fail-closes with `UNTRUSTED_BILLING_INPUT` if either is ever supplied; the
  Price comes only from `clubPriceId(club)`.
- [x] Canonical webhook projection records arbitrary Stripe Price facts without
  a tier write or `UNKNOWN_PRICE` rejection. Confirmed by code review of
  `app/api/stripe/webhook/route.ts` and live: a real Checkout applied cleanly
  with the exact `clubs.stripe_price_id` value, no tier write, no rejection.
- [x] Portal allows payment-method updates and invoice history only; cancel and
  subscription update are disabled. Verified live via a real Customer Portal
  Session on Bravo (configuration `bpc_1Tw73SK6WajTkwHYgoLJ1tpN`): invoice
  history and payment-method update visible, no cancel/plan-change control
  present anywhere on the page.
- [x] Day-7/day-17 warning audits are idempotent; the suspension and
  reconciliation flags operate independently; demo/test clubs are skipped.
  Proved via the full six-call lifecycle matrix on Bravo (warnings, an
  identical-repeat idempotency check, an isolated divergence call, an isolated
  suspension call). Demo/test skip independently confirmed: Alpha (`kind=test`)
  shows zero lifecycle audit rows despite every RPC call in this pass running
  system-wide.
- [x] Clean cron runs return 200; drift returns non-200
  `RECONCILIATION_DIVERGENCE`; success/failure heartbeat signals arrive and the
  monitor's missing-ping alarm is proven. All proved through the real
  protected HTTP route with genuine Healthchecks.io success/failure/missing-
  ping emails, not just RPC-level evidence.
- [x] `/api/cron/media-cleanup` remains unchanged and has no heartbeat.
  Confirmed: its last commits predate PLAT-102 entirely (Phase 8), and no
  command in this pass invoked or modified it.
- [x] The local Resend delivery receiver remains unconfigured until a separate
  hosted Resend approval is supplied. Untouched this pass.
- [x] No production, live Stripe, Auth, DNS, Storage, public-access, tenant
  content, Price, teams, `PLAT-103`, `DCFC-601`, or `DCFC-602` mutation occurs
  outside Bravo's own approved lifecycle-proof mutations. All hosted
  mutations this pass were scoped to Bravo (`fae51a8d-63b5-468c-bb7a-6e2b31d90035`)
  and reconciled back to its exact `test`/`onboarding`/`preview` baseline.

## Stripe Test and Lifecycle (`DCFC-601`)

Closed out 2026-08-06 on Diverse City staging
(`d88bf71b-9820-49ae-9dc0-7556b0813885`). Evidence recorded in `HANDOFF.md`
and `docs/phase-11/diverse-city/STATUS.md`. Before this pass could run, a
latent issue was found and fixed: `diverse-city-onzio-staging.vercel.app` was
still pinned to a pre-`PLAT-101`/`PLAT-102` deployment (`8e3cde2`, "Prepare
Diverse City Phase 5 release") and was reassigned to the current deployment
(`dbfe825`) before any of the boxes below could be attempted.

- [x] Existing test Price (`price_1U0Y0sK6WajTkwHYnnttR9nN`, $75/month), Portal,
  webhook, key mode, and environment metadata are reverified; no Price is
  created or changed. Reverified read-only before the pass; unchanged
  throughout.
- [x] Owner starts the first Checkout through the application; admin is
  denied; pre-billing `preview` `public_access` becomes `live` only through
  canonical webhook projection. Owner reached Payments/Team access; admin
  (`christianalcala3@yahoo.com`) reached the Dashboard but not Payments/Team
  access. `public_access` was `preview` before Checkout, `live` immediately
  after the webhook applied.
- [x] Checkout creates exactly one test Customer/subscription with correct
  `onzio_club_id` and `onzio_environment=staging` metadata.
  `sub_1U1ImGK6WajTkwHYSJrFjmuT` / `cus_V1LT4xNreu46xz`, status `active`,
  paid through 2026-09-06.
- [x] Canonical webhook projection writes one applied ledger row and the
  correct `public_access=live` runtime state. Confirmed via direct read of
  `club_subscriptions` and `clubs.public_access` immediately after Checkout.
- [x] Duplicate and stale events are idempotently rejected.
- [x] Foreign environment/customer/tenant and unknown Price fail closed.
  Both proved on the shared webhook route in `PLAT-102`'s Bravo pass the same
  day (5/5 stale retries correctly rejected with `CUSTOMER_METADATA_MISMATCH`)
  — this is tenant-agnostic route code, not re-tested per club.
- [x] Portal opens for the owner; no unapproved cancel/payment change is made
  (Portal has no tier or plan selection to change). Verified live: invoice
  history and payment-method update visible, no cancel/plan-change control
  anywhere on the page, correct tier-free Product name ("Onzio - Diverse City
  FC").
- [x] `past_due`, paid-through, terminal, grace, suspension, archive, and
  reactivation behavior matches `PLAT-D006`/`D007`/`D024` using
  disposable/scoped test state. Full six-call lifecycle matrix run directly
  against Diverse City: clean run, day-7/day-17 warnings, idempotency repeat,
  isolated Price-drift divergence, isolated suspension, final clean run — all
  six passed exactly as specified.
- [x] Failed projection leaves no partial runtime or billing state. No failed
  projection occurred in this pass; the drift/suspension scenarios were
  synthetic RPC-level tests, not failures, and each left only its specified
  audit trail.
- [x] Final staging tenant/subscription/lifecycle state is explicitly chosen,
  restored, and reconciled. Final state: `kind=customer` (unchanged),
  `lifecycle=onboarding`, `public_access=preview`, Price intent unchanged,
  one active member (original owner only), zero subscription rows, 36 audits
  (30 baseline + 6 fully explained by this pass).

## Final Staging Gate (`DCFC-603`)

### DCFC-603 closeout review snapshot (`2026-08-06`)

- Scope: read-only staging inspection only. No hosted mutation executed in this closeout review pass.
- Verified: `DCFC-601` and `DCFC-602` are complete in `STATUS.md`, and their latest entries report no unresolved blockers or pending `DCFC-601`/`DCFC-602` rollback/reconciliation needs.
- Verified: temporary probe/user/session/factor/media/content exceptions are reconciled and recorded in the `DCFC-602` evidence stream.
- Verified: staging host/project state references remain within `fxefqnoqxbezeccjvrsw`, `alpha-onzio-staging.vercel.app`, `bravo-onzio-staging.vercel.app`, and `diverse-city-onzio-staging.vercel.app` boundaries.
- Accepted: Christian explicitly accepted the `DCFC-603` staging gate in this thread on 2026-08-06.

- [x] Every package completion record includes files/evidence, blockers, exact
  next step, rollback result, and hosted mutation counts by provider.
- [x] Full release verification is current: TypeScript, contracts,
  architecture, loopback database, complete suite, generated types, schema
  lint, lint, build, and diff checks.
- [x] Staging runtime logs contain no unresolved authorization, tenant, cache,
  media, Auth/email, billing, or unhandled application error.
- [x] All temporary acceptance mutations are restored and counts/digests match.
- [x] Deployment Protection and `noindex, nofollow` remain active.
- [x] No production, live Stripe, public DNS, Bunny, or indexing mutation
  occurred.
- [x] Christian explicitly accepts or rejects the staging gate.
- [x] Rejection names the blocking package and rollback; acceptance makes
  `DCFC-701` eligible but does not start it.
