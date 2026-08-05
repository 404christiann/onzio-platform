# PLAT-102 staging operations

Status: local implementation complete; hosted application is not authorized or
applied by the local package.

## Runtime configuration contract

The protected Preview needs these private values before hosted acceptance:

- `ONZIO_ENVIRONMENT=staging`
- `STRIPE_SECRET_KEY` — test or restricted-test key only
- `STRIPE_WEBHOOK_SECRET` — existing staging endpoint secret
- `STRIPE_PORTAL_CONFIGURATION_ID` — an existing test-mode configuration with
  payment-method update and invoice history enabled, subscription cancellation
  and subscription update disabled
- `CRON_SECRET`
- `LIFECYCLE_SUSPENSION_ENABLED` — exact `true` or `false`
- `LIFECYCLE_RECONCILIATION_ENABLED` — exact `true` or `false`
- `LIFECYCLE_CRON_HEARTBEAT_URL` — HTTPS endpoint accepting a JSON POST with
  `status` (`success` or `failure`) and a non-sensitive `detail` code

`RESEND_WEBHOOK_SECRET` is required only after separate approval creates and
configures the hosted Resend webhook. The local receiver exists at
`/api/webhooks/resend`; do not configure it under the PLAT-102 migration/push
approval unless that approval explicitly includes Resend.

## Staging schema and backfill gate

The checked-in migration is
`20260804024349_plat_102_billing_entitlement.sql`. It adds the kind and Price
intent columns, collapses tier authorization without policy churn, replaces the
Stripe projection RPC, adds the lifecycle RPC, and creates the sanitized
delivery-event ledger.

After a separate exact hosted-mutation approval, apply the migration only to
Supabase staging project `fxefqnoqxbezeccjvrsw`, then run:

```bash
npm run staging:backfill:plat-102 -- \
  --execute \
  --confirm-project=fxefqnoqxbezeccjvrsw
```

The command refuses every other project. The staging baseline confirmed Rose
City has no row, so the approved guard requires that absence and reconciles
exactly Diverse City as `customer` with test Price
`price_1U0Y0sK6WajTkwHYnnttR9nN` plus Alpha/Bravo as `test`. It does not create
Rose City and never reads or writes the live Price.
Secrets stay in the operator's private environment and never appear in command
arguments, output, Git, or chat.

## Hosted acceptance still required

### Staging search-path follow-up

The primary migration and revised three-club backfill are applied. The hosted
security advisor then identified mutable `search_path` on the two new
exposed-schema service-role RPC wrappers. Migration
`20260804035147_plat_102_function_search_paths.sql` fixes only those two
settings. It is applied to staging under separate exact approval; migration
history, grants, empty paths, and the hosted advisor reconcile. The backfill
was not rerun and its audit count remains exactly three.

### PLAT-D024 grace-edit follow-up

Migration `20260804061257_plat_102_grace_content_edits.sql` keeps customer-club
content editing available while projected access is `live` or `grace`, with
`suspended` remaining the enforcement boundary. It is implemented, verified
locally, and applied only to Supabase staging project
`fxefqnoqxbezeccjvrsw` under separate exact approval. Remote history,
definition, empty path, grants, unchanged club/backfill state, and the security
advisor reconcile. Neither earlier PLAT-102 migration nor the three-club
backfill reran.

The former `staging:verify:lifecycle` and `staging:verify:stripe` commands were
Phase 7 tier-era mutation rehearsals. They remain available only under explicit
`phase-7:*:legacy` names and must not be used for PLAT-102 acceptance.

- reconcile before/after counts for the four named clubs
- confirm Checkout refuses client billing input and pins the Diverse City test
  Price
- confirm arbitrary canonical webhook Price projection without tier writes
- verify the existing Portal configuration capabilities read-only
- run lifecycle once clean, once repeated for idempotency, and one controlled
  overdue customer scenario with the suspension flag explicitly governed
- prove demo/test clubs are skipped
- prove drift returns non-200 `RECONCILIATION_DIVERGENCE`
- prove success/failure heartbeat delivery and expected-ping monitoring
- leave `/api/cron/media-cleanup` unchanged and without a heartbeat
- leave the Resend webhook unconfigured unless a separate approval names it

No production, live Stripe, Auth, DNS, Storage, public access, tenant content,
Price creation/modification, `PLAT-103`, `DCFC-601`, or `DCFC-602` is part of
this gate.

## Remaining Bravo hosted-acceptance protocol

This protocol is not authorization. Run it only after Christian supplies a
fresh approval naming the exact deployment and every temporary mutation below.
Stop at the first failed guard; do not retry a Stripe creation call merely
because its response is uncertain.

### 0. Establish protected-browser access before creating fixtures

- The 2026-08-04 pass proved that ordinary Vercel SSO page access is not enough
  for the owner form POST: the single Checkout request stopped at Vercel's
  edge-middleware layer and never invoked the application function or Stripe.
- Before sending an OTP or adding a temporary membership, have Christian enter
  the existing Vercel protection-bypass value privately and set its cookie only
  on `bravo-onzio-staging.vercel.app`. Do not print, copy to chat, inspect,
  persist in Git, or change the configured bypass value.
- Christian uses the browser address bar privately with this shape, replacing
  only the placeholder locally:
  `https://bravo-onzio-staging.vercel.app/?x-vercel-protection-bypass=PASTE_SECRET_HERE&x-vercel-set-bypass-cookie=true`.
  Both parameters are required: the first authorizes the request and the second
  asks Vercel to redirect with a follow-up authorization cookie.
- After Christian reports that the page loaded, do not inspect the secret-
  bearing URL or browser history. Navigate the retained tab directly to the
  clean `https://bravo-onzio-staging.vercel.app/admin/login` URL and verify it
  stays on Bravo without a Vercel SSO redirect. Only that clean URL may be
  recorded as evidence.
- Prove only that a protected Bravo page stays on the exact approved deployment
  without an SSO redirect. This browser-access preflight creates no application
  session, membership, Stripe object, audit, or tenant mutation.
- If protected access still redirects or blocks, stop before creating any
  fixture or sending any OTP. A stopped pass never carries authorization into a
  later retry.

### 1. Pin the immutable release and baseline

- Require `origin/staging` and local `HEAD` to equal
  `a1f28feb9d0e7206508ff23f115a09190bb7ef04`.
- Require `bravo-onzio-staging.vercel.app` to resolve to Preview/`READY`
  deployment `dpl_4NBVd1L24cRoPemzZgvkHR1U8giV`, whose Git metadata pins that
  exact SHA and branch `staging`.
- Require Bravo to be `test`, `onboarding`, and `preview`, with null Price
  intent and no subscription row.
- Require the configured Stripe test webhook's rolling staging Vercel alias
  `onzio-platform-staging-git-staging-404christianns-projects.vercel.app` to
  resolve to the same exact approved deployment as Bravo. On 2026-08-04 it
  instead resolved to stale deployment `dpl_BdsxrZUAXbTV6ggcguMBVGzn9nS7`
  and rejected the correct $75 flow through legacy `UNKNOWN_PRICE` behavior.
  Resolve this under a separate exact alias approval before creating fixtures;
  never compensate by changing the Price, Product, webhook secret, or endpoint.
  Christian approved and the alias was corrected on 2026-08-04: direct
  resolution and the Vercel alias list both map it to exact approved READY
  deployment `dpl_4NBVd1L24cRoPemzZgvkHR1U8giV`. Recheck this guard before any
  new Stripe object is created; do not assume the mapping remains current.
- Require exactly one active synthetic owner, one active synthetic admin, six
  sessions belonging to those baseline members, 14 historical Stripe ledger
  rows, and 39 audits including exactly one `plat_102.billing_backfill` audit.
  The twelve-row increase from the original 27-audit baseline is three complete
  append-only add/remove membership histories. The five-row Stripe increase
  from the original nine is exactly the stopped flow's `UNKNOWN_PRICE`
  rejections: Checkout completed, Subscription created/deleted, invoice paid,
  and invoice payment succeeded.
- The third stopped pass added no Stripe object or event: deployed permanent
  per-club idempotency keys replayed the prior deleted-Customer/completed-
  Checkout response. Require the session-scoped hashed-idempotency fix to be on
  the exact approved deployment before any fourth-pass membership or email.
- Require both approved temporary identity candidates to have no Bravo
  membership or session. Record only IDs/counts or digests; never record email,
  OTP, TOTP, keys, webhook secrets, or monitor URLs.

### 2. Create and prove only the temporary access fixtures

- Add one temporary owner membership for the configured operator Auth identity
  and one temporary admin membership for the privately selected existing
  staging Auth identity. Write only the two sanitized `membership_added`
  audits authorized for this pass.
- Send one owner OTP and one admin OTP. The owner must reach Payments and Team
  access. The admin must reach the protected portal but remain unable to access
  owner-only Payments or Team access.
- Preserve the original memberships, Auth identities, and all six original
  sessions. Acceptance sessions are tracked by their new session IDs and are
  the only sessions eligible for revocation during cleanup.

### 3. Prove test/demo entitlement and the one Stripe test flow

- Before changing Bravo's kind, verify the `test` club does not require billing
  and cannot start Checkout.
- Immediately before the Stripe flow, re-resolve both the Bravo alias and the
  rolling staging webhook alias and require both to pin exact approved READY
  deployment `dpl_4NBVd1L24cRoPemzZgvkHR1U8giV`. An alias mismatch is a hard
  stop before Customer or Checkout creation.
- Guarded fixture setup may then set only Bravo to `customer` with exact test
  Price intent `price_1U0Y0sK6WajTkwHYnnttR9nN`. Do not accept a client Price or
  tier and do not alter any Stripe Product or Price.
- Through the protected application, create exactly one temporary Stripe test
  Customer and one first-subscription Checkout Session. Complete only that
  Checkout with private Stripe test input. Require Customer, Checkout, and
  Subscription metadata to name Bravo's UUID and environment `staging`, and
  require the Subscription to use the exact approved Price.
- Wait for only that flow's configured webhook events. Require the local
  subscription projection to name the same temporary Customer, Subscription,
  and Price with no tier write. Treat its Stripe events as append-only history.
- A second owner billing action must create exactly one Customer Portal Session
  using configuration `bpc_1Tw73SK6WajTkwHYgoLJ1tpN`. Verify invoice history
  and payment-method updates are available while cancellation and plan changes
  remain disabled. Do not change the Portal or webhook configuration.

### 4. Use at most six lifecycle invocations

The six-call ceiling covers the complete matrix without changing Vercel
variables:

1. Invoke the protected lifecycle route against the clean projected
   subscription. Require HTTP 200, zero divergence, and a success heartbeat.
2. Guardedly project Bravo into `past_due` grace with paid-through 18 days in
   the past and grace end still in the future. Invoke the RPC with suspension
   disabled and reconciliation enabled. Require exactly the missing day-7 and
   day-17 warning audits and no suspension.
3. Repeat the same RPC flags and timestamp. Require zero new warnings/audits,
   proving idempotency.
4. Create controlled drift only by temporarily changing Bravo's intended Price
   away from the canonical subscription Price, then invoke the protected route.
   Require non-200 `RECONCILIATION_DIVERGENCE`, exactly one sanitized divergence
   audit for the observed pair, and a failure heartbeat. Restore the exact Price
   intent before continuing.
5. Move only Bravo's projected grace end into the past and invoke the RPC with
   suspension enabled and reconciliation disabled. Require exactly one
   suspension and one sanitized `billing_suspended` audit.
6. After restoring Bravo and cleaning the temporary Stripe projection, invoke
   the protected route once more. Require HTTP 200, zero warnings/suspensions/
   divergences, and a success heartbeat.

The four permitted lifecycle audits are the day-7 warning, day-17 warning,
controlled divergence, and suspension. Demo/test clubs must remain skipped.
`/api/cron/media-cleanup` must receive no invocation or heartbeat change.

### 5. Prove monitor behavior and restore it

- On only the configured Healthchecks.io monitor, observe the success ping and
  explicit failure ping produced above.
- Temporarily shorten only that monitor's grace/alert window, withhold a ping,
  and confirm its missing-ping alert. Restore its prior settings and pause it.
- Never write the monitor URL, credentials, recipients, or notification payload
  to Git, chat, application logs, audit payloads, or shell arguments.

### 6. Cleanup and final reconciliation

- Cancel only the temporary Bravo test Subscription and delete only its
  temporary test Customer. Checkout, Portal, invoice/payment, webhook, Stripe
  ledger, and other immutable test history may remain; record their sanitized
  IDs/counts rather than claiming they were deleted.
- Restore Bravo exactly to `test`, `onboarding`, `preview`, null Price intent,
  and no subscription projection. Revoke only the two new OTP sessions, remove
  only the two temporary memberships, and write only the two corresponding
  sanitized `membership_removed` audits.
- Require the original owner/admin memberships and six sessions unchanged;
  Alpha's subscription and Stripe artifacts unchanged; Diverse City's exact
  Price intent unchanged; Rose City still absent; no temporary Bravo Customer
  or Subscription active; and the Bravo alias still on the exact READY
  deployment.
- Reconcile every expected append-only delta: four membership audits, at most
  four lifecycle audits, and only Stripe/webhook history caused by the single
  temporary Checkout/Subscription flow. Stop and report any unexplained delta.
