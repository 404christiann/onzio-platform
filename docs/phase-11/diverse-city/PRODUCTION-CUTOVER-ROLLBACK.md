# Diverse City FC Production Cutover and Rollback

Epic: `DCFC-EPIC-002`

Status: `dcfc_702_complete_local_rehearsal_passed`

Last updated: 2026-08-07

This checklist covers `DCFC-701`–`DCFC-1003`. It plans hosted mutations but
authorizes none. Production private preview, billing, domain attachment,
public launch, rollback, and indexing each retain separate explicit approvals.

## RELEASE GATE — schema/code coupling (blocks `DCFC-801`)

**Do not promote `staging` to `main` until every box below is checked.** As of
2026-08-06 production runs commit `10559e5` against migration head
`20260727175200`. Fifteen migrations are pending, and one of them makes the
schema and the application version mutually incompatible in **both** directions.

`20260804024349_plat_102_billing_entitlement.sql` drops the fifteen-argument
`apply_stripe_projection` and creates a fourteen-argument replacement in the
same transaction. Production's deployed commit calls the fifteen-argument form
with `p_tier`; `staging` calls the fourteen-argument form. Therefore:

- Promoting `staging` **without** applying the migrations → every webhook fails
  with `TRANSACTION_ROLLED_BACK`, because the fourteen-argument function does
  not exist in production.
- Applying the migrations **without** promoting → every webhook fails for the
  same reason in reverse, because the fifteen-argument function is gone.

There is no ordering that avoids a gap. Migration and deploy must be executed
back to back, and the gap must be treated as expected webhook downtime. Stripe
retries failed deliveries, so events are not lost, but the window must be short
and deliberately observed. If a zero-gap release is required, split
`20260804024349` so the fourteen-argument overload is added first, the deploy
lands, and the fifteen-argument function is dropped in a later migration.

Pre-flight checklist:

- [ ] Verified, restorable production backup taken immediately before the
      release. `pitr_enabled=false` as of `DCFC-701`, so the daily physical
      backup is the only recovery point — confirm its timestamp.
- [ ] All fifteen pending migrations reviewed, not only the PLAT-102 three.
      They carry Phase 9 presentation, Phase 11 domains, `DCFC-301`–`DCFC-304`,
      and PLAT-101 auth changes. This is the Diverse City launch release, not a
      billing patch.
- [ ] Migration and production deploy scheduled back to back by the same
      operator, in one window, with rollback ready.
- [ ] Post-release: `select p.pronargs from pg_proc p join pg_namespace n on
      n.oid = p.pronamespace where p.proname = 'apply_stripe_projection'`
      returns `14` for both `onzio` and `onzio_private`.
- [ ] Post-release: `POST /api/stripe/webhook` with an unsigned body returns
      HTTP 400 `INVALID_SIGNATURE`, confirming configuration loads. A 500 means
      the release is broken; roll back rather than debug in place.
- [ ] Post-release: one real Stripe event is delivered and applied, not merely
      accepted. A `200` carrying `{"received":true,"rejected":"…"}` is a
      failure — see the `DCFC-701` remediation entry in `HANDOFF.md`.

Current risk if this gate is skipped is low but not zero: Rose City is
`canceled` and the only other live subscription is a non-Onzio client whose
events are rejected by design. That will stop being true the moment Diverse City
begins billing.

## Phase 4 Local Import/Reset/Replay Evidence (`DCFC-403`)

This is local input-readiness evidence only. It does not satisfy or start the
later production-target rehearsal in `DCFC-702`.

- Approved snapshot commit:
  `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`
- Deterministic plan digest:
  `63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`
- Byte-identical plan file SHA-256 across two runs:
  `87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b`
- Initial/idempotent/reset-replay tenant state digest:
  `b595fc81773ed47bd4d4976d45f533e1e1494ad4089514ac6c5567e27fc4376d`
- Reconciled counts: 10 media assets, 4 Programs, 0 Tryouts/players/staff/
  matches/standings, 2 sponsor references, 4 Shop kit references, 2 Shop
  carousel references, 1 published `academy@1` document, 15 composite
  relationships, and 0 forbidden references.
- The clean-stack rehearsal uploaded 10 objects, reused all 10 on identical
  import, removed 10 objects plus only the Diverse City local tenant during
  reset, uploaded the same 10 on replay, and reproduced the state digest.
- Alpha/Bravo baseline isolation passed. Public/admin desktop/mobile Playwright
  acceptance passed 2/2. Hosted mutations: zero.

The locked artifact and all deferred hosted inputs are recorded in
`ROLLOUT-INPUT-APPROVAL-MANIFEST.md`.

## Production Read-Only Baseline (`DCFC-701`)

### DCFC-701 read-only checkpoint (`2026-08-06`)

Christian approved `DCFC-701` as a read-only production preflight only:
production metadata, logs, schema/migration readback, backup status, Storage/
Auth/Stripe/Vercel/DNS read-only baselines, and documentation updates. No
production mutation, deploy, migration, DNS, Auth/email, Stripe, Storage,
tenant-content, or provisioning action was approved.

Evidence collected in this checkpoint:

- Supabase CLI project list confirms `Onzio Platform Production`
  (`ioalthwsdrlzrubomrow`) in org `404DB` (`zmvjbvoraowhwbkwwtse`), region
  `ca-central-1`, Postgres `17.6.1.147`, status `ACTIVE_HEALTHY`.
- Supabase organization read confirms `404DB` is on the `pro` plan.
- Supabase production physical backups list confirms daily completed physical
  backups from `2026-07-30` through latest completed backup
  `2026-08-06T11:15:23.430Z`; `walg_enabled=true`, `pitr_enabled=false`.
- Vercel CLI confirms project `onzio-rcfc`, project ID
  `prj_I362ysmh9cse5cRxnL7db4dOhsEs`, owner `404christiann's projects`, root
  directory `.`, Next.js framework, Node.js `24.x`.
- Vercel production deployment inspection confirms
  `dpl_CVAdyYykHK47z6LdsYxmf9znWUqf` is `Ready`, target `production`, created
  `2026-07-28 19:00:20 PDT`, with aliases `onzio-rcfc.vercel.app`,
  `onzio-rcfc-404christianns-projects.vercel.app`, and
  `onzio-rcfc-git-main-404christianns-projects.vercel.app`.
- Vercel environment inventory recorded names/scopes only; production names
  present include `CRON_SECRET`, `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ONZIO_ENVIRONMENT`,
  `ONZIO_OPERATOR_USER_IDS`, `STRIPE_PRICE_ID_STARTER`,
  `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_IDS_PRO_GRANDFATHERED`, and
  `STRIPE_WEBHOOK_SECRET`. No values were revealed.
- Vercel project-domain inventory under the account shows no current
  `rosecityfutbolclub.com` domain; `rosecityfutbolclub.com` and
  `www.rosecityfutbolclub.com` HTTP probes return Vercel
  `DEPLOYMENT_NOT_FOUND` 404, while `https://onzio-rcfc.vercel.app/` returns
  HTTP 200 with `x-onzio-cache-tenant:
  32ceba0b-4e25-52c2-bb6b-d82fb87637a7`.
- Rose City route/header probes: `/`, `/club/about`, `/roster`, `/shop`,
  `/schedule`, `/admin/login`, and `/admin/update-password` return HTTP 200 on
  `onzio-rcfc.vercel.app`; `/programs`, `/contact`, and an unknown spoofed Host
  probe fail closed with 404 behavior.
- Vercel production error-log query for the last 24 hours returned no
  error-level logs. The request log query returned only this checkpoint's
  read-only HEAD probes.
- DNS readback for `rosecityfutbolclub.com` records authoritative
  nameservers `ns71.domaincontrol.com` / `ns72.domaincontrol.com`, Microsoft
  365 MX, SPF including GoDaddy/SecureServer, and DMARC `p=none`.
- Stripe account read confirms account `acct_1TvPQyK6WajTkwHY` display name
  `Onzio`.
- Stripe live-mode read confirms active live products/prices including
  `Onzio - Diverse City FC` product `prod_V0ZBwEyJqipBOw` with default live
  Price `price_1U0Y2lK6WajTkwHYMBrmmOPe` at `$65/month`, and
  `Diverse City FC Pro Plan` product `prod_UwUmEgeunaSPSI` with live Price
  `price_1TwbmvK6WajTkwHYueLvjhv5` at `$75/month`.
- Stripe live webhook read confirms enabled endpoint
  `we_1TwEpdK6WajTkwHYD5SEYzXX` at
  `https://onzio-rcfc.vercel.app/api/stripe/webhook`, API version
  `2026-06-24.dahlia`, with the seven expected events. No signing secret was
  read or recorded.
- Stripe live customer/subscription inventory confirms one Rose City customer
  with `onzio_club_id=32ceba0b-4e25-52c2-bb6b-d82fb87637a7` and
  `onzio_environment=production`, plus one unrelated MVMNT CULTR customer.
  The sole live subscription currently listed belongs to MVMNT CULTR, not Rose
  City; this needs reconciliation against production database billing state
  before `DCFC-701` can close.
- After Christian approved the production DB SQL/read method, an isolated
  temporary Supabase workdir under `/private/tmp` was linked to production ref
  `ioalthwsdrlzrubomrow`. The repository remained linked to staging. No
  migration, seed, push, pull, dump, restore, or write command was run.
- Production migration ledger contains exactly ten remote versions:
  `20260726000100`, `20260726000200`, `20260726000300`, `20260726000400`,
  `20260726000500`, `20260726000600`, `20260726000700`, `20260727171658`,
  `20260727174006`, and latest `20260727175200`.
- Production table/security posture: 32 `onzio` tables, 32/32 with RLS
  enabled, zero `public` tables, zero `onzio_private` browser table grants,
  zero `onzio_private` PUBLIC routine grants, and 15/15 security-definer
  functions with search-path configuration.
- Production Auth/Storage counts: one Auth user, one identity, two sessions,
  one MFA factor; `onzio-media` is public with 515 objects / 49,834,337 bytes,
  and `onzio-upload-staging` is private with zero objects.
- Production exact state: one club (`rose-city`,
  `32ceba0b-4e25-52c2-bb6b-d82fb87637a7`) at `pro`/`active`/`live`, one
  active owner membership, two domain rows (`onzio-rcfc.vercel.app` active
  primary production; `rosecityfutbolclub.com` inactive non-primary
  production), one `club_subscriptions` row, one applied `stripe_events` row,
  209 audit events, 515 media assets, and zero media cleanup rows.
- Production DB billing projection says Rose City is `active`/`pro` on
  `price_1TwbmvK6WajTkwHYueLvjhv5`, customer `cus_UwVpy1YlirV3li`,
  subscription `sub_1TwcndK6WajTkwHYH1VuFgrG`, paid through
  `2026-08-24T06:41:35+00:00`, with applied event
  `evt_1Txzz4K6WajTkwHYBzaweVRI`.
- Direct live Stripe retrieval of that DB-listed subscription returns
  `status=canceled`, `ended_at=1785280245`, and
  `cancellation_details.reason=cancellation_requested`, while retaining the
  same customer/club/environment metadata and `$75/month` Price. This is a
  production billing projection drift blocker for `DCFC-701` closeout.

Open items before `DCFC-701` can close:

- Resolve or explicitly accept the production billing projection drift:
  database `club_subscriptions.status=active` and `clubs.public_access=live`
  while live Stripe subscription `sub_1TwcndK6WajTkwHYH1VuFgrG` is canceled.
- Supabase production service logs are not exposed by the installed CLI, and
  the Supabase MCP log tools reject the production ref in this session.
- No restricted evidence package was created because no exact restricted
  evidence location was supplied for `DCFC-701`.
- The live Stripe price/product inventory contains both a `$65/month` Diverse
  City-specific product and the accepted `$75/month` Diverse City FC Pro Plan;
  this is a `DCFC-901` approval/reverification issue, not a mutation in this
  package.

Hosted mutation count for this checkpoint: zero. A read-only `supabase db
query --linked "select 1"` probe executed against the already-linked staging
project only, confirming the CLI link is not production. No production write,
deploy, migration, DNS, Auth/email, Stripe write, Storage write, tenant-content
write, or provisioning occurred.

- [ ] Record the exact production Supabase organization/project ref, region,
  health, plan/capacity, backup status, and current migration ledger.
- [ ] Confirm modern publishable/secret key posture, `onzio` exposure,
  `onzio_private` isolation, RLS/grants, Auth security posture, and operator
  allowlist without revealing values.
- [ ] Record table/tenant/domain/subscription/audit/media counts and current
  Rose City tenant identity/state.
- [ ] Record Storage buckets, object counts/bytes, and current cleanup/usage
  posture; database backups do not substitute for Storage evidence.
- [ ] Record the exact ready production Vercel deployment/commit, environment-
  variable names/scopes, domains, protection posture, and prior deploy target.
- [ ] Record existing live Stripe Product/Price/Portal/webhook identifiers and
  event allowlist read-only; do not infer current price/amount from staging.
- [ ] Record Auth email sender/domain, callback allowlist, rate limit, and
  delivery posture without inspecting secrets or message bodies.
- [ ] Record DNS authority, existing Diverse City records, TTLs, mail records,
  and nameservers before proposing a change.
- [ ] Record public route/TLS/DNS/runtime-log/media baseline for Rose City and
  unknown hosts.
- [ ] Store backups/exports/evidence in a restricted location outside Git and
  verify checksums/permissions.
- [ ] Confirm no production mutation occurred during baseline collection.

## Local Cutover/Rollback Rehearsal (`DCFC-702`)

- [x] Production-target content/media/presentation manifest matches the exact
  staging-accepted digest.
- [x] Release migration ledger replays from scratch on loopback Supabase.
- [x] Import plan is deterministic across two independent runs.
- [x] Import is idempotent and reconciles every table, relationship, object,
  asset reference, checksum, route, module, and presentation pointer.
- [x] Rose City and synthetic Alpha/Bravo remain unchanged and isolated.
- [x] Diverse City renders on simulated production and private hostnames at
  desktop/mobile with `noindex, nofollow`.
- [x] Auth/admin acceptance is rehearsed only with local identities/MFA.
- [x] Stripe behavior uses inert/test-shaped fixtures locally; no live call.
- [x] Rollback restores the previous deployment/config representation and
  removes/restores only Diverse City tenant artifacts.
- [x] Identical replay after rollback produces the original manifest digest
  and acceptance result.
- [x] Full local verification passes without hosted credentials.

## Production Go/No-Go Packet (`DCFC-703`)

Record the following before requesting any mutation:

| Item | Required evidence | Result/evidence |
| --- | --- | --- |
| Release | Exact commit/tree, build, migration list, test results | Pending |
| Import | Source/plan/output digests and reconciliation counts | Pending |
| Backup | Database, Storage, config/domain/billing baselines and restore owner | Pending |
| Tenant | Approved UUID/slug/name/private hostname/tier/lifecycle | Pending |
| Identity | Approved owner/admin roles and safe recipient reference | Pending |
| Billing | Existing live Pro Price and owner Checkout approval | Pending |
| Domain | Exact hostname(s), DNS records/TTL, owner, callbacks | Pending |
| Launch | Window, approver, monitoring owner, stop conditions | Pending |
| Observation | Duration/cadence and indexing decision date | Pending |
| Rollback | Exact prior deployment, private state, DNS, presentation/content/media recovery | Pending |

- [ ] Christian records go/no-go.
- [ ] A go makes only `DCFC-801` eligible.
- [ ] `DCFC-801`, `DCFC-802`, `DCFC-803`, `DCFC-901`, `DCFC-902`,
  `DCFC-903`, `DCFC-1002`, and `DCFC-1003` still require their own approval.

## Production Private Preview

### Release and tenant (`DCFC-801`)

- [ ] Fresh approval names exact production resources, release, migrations,
  tenant identity, private hostname, and rollback targets.
- [ ] Pre-change backups/baselines remain current immediately before mutation.
- [ ] Apply only reviewed checked-in migrations; never run local seed.
- [ ] Deploy the exact staging-accepted release and record deployment ID/commit.
- [ ] Reverify Rose City public/admin/media/billing smoke and runtime logs.
- [ ] Provision Diverse City exactly once through audited operator tooling as
  `onboarding`/`preview` with the pre-billing Starter tier.
- [ ] Attach only the approved private validation hostname/domain row.
- [ ] Verify unknown and spoofed hosts fail closed.
- [ ] Verify private host returns `noindex, nofollow` and is not public.
- [ ] Record exact mutation counts and audit rows.

### Content/media/presentation (`DCFC-802`)

- [ ] Fresh approval names the immutable plan digest and exact tenant UUID.
- [ ] Import only accepted production content and normalized media.
- [ ] Publish/assign the exact `academy@1` presentation digest.
- [ ] Reconcile source, normalized, uploaded, reused, Database, Storage,
  reference, and presentation counts/checksums.
- [ ] Confirm hidden/blocked content and temporary URLs are absent.
- [ ] Confirm no video is imported unless a separately completed capability is
  named by evidence; otherwise the approved static/hide treatment renders.
- [ ] Confirm no registration/payment/waiver/medical/signature/participant data
  path exists.
- [ ] Confirm media uses raw immutable URLs and intentional fallbacks.
- [ ] Prove idempotent replay and capture a complete compensation ledger.
- [ ] Reverify Rose City and other production tenants are unchanged.

### Auth/admin acceptance (`DCFC-803`)

- [ ] Approved owner/admin membership rows exist exactly once.
- [ ] Each email send has separate approval; record delivery-safe evidence only.
- [ ] Callback and recovery entry use the private verified tenant host.
- [ ] Password setup/recovery, password sign-in, mandatory MFA, and protected
  admin acceptance pass.
- [ ] AAL1 and cross-tenant access fail closed.
- [ ] Desktop/mobile private public and authentication acceptance passes.
- [ ] Pre-billing Starter entitlement correctly withholds Pro-only Programs/
  Tryouts mutations; full Pro editor acceptance is deferred to `DCFC-901`.
- [ ] No secret, code, action URL, password, TOTP seed, token, or session value
  is recorded.
- [ ] Production remains private and non-indexed.

## Live Billing Activation (`DCFC-901`)

- [ ] Reverify the approved existing live standard Pro Price, amount, currency,
  cadence, active state, and environment immediately before Checkout.
- [ ] Confirm the owner and billing contact approve that exact commercial
  state. If not, stop; Price creation/change is outside this package.
- [ ] Confirm the live webhook and exact event allowlist are healthy.
- [ ] Owner initiates first Checkout through the verified tenant application.
- [ ] Agent does not create a Customer/subscription directly.
- [ ] Customer, Checkout Session, and subscription metadata contain exact
  `onzio_club_id` and `onzio_environment=production` values.
- [ ] Canonical webhook applies exactly one subscription projection.
- [ ] Tier is Pro; status and paid-through/trial state match canonical Stripe.
- [ ] Programs and Tryouts editors now authorize approved AAL2 users; an
  approved edit reaches the public query layer and is restored with matching
  before/after digests.
- [ ] Duplicate resend is idempotent; unknown/foreign/stale cases fail closed.
- [ ] Owner reaches Portal; admin remains denied.
- [ ] No Price, Product, Portal, webhook endpoint, unrelated customer, refund,
  cancellation, or tier change occurred.
- [ ] Public access remains disabled until `DCFC-903`.

## Domain and Callback Attachment (`DCFC-902`)

- [ ] Fresh approval names each exact hostname and DNS record.
- [ ] Export current authoritative DNS and Vercel/Auth/domain configuration.
- [ ] Confirm domain ownership and whether apex, `www`, or a subdomain is the
  canonical public host; do not assume.
- [ ] Confirm TTL and propagation/maintenance window.
- [ ] Attach only approved hostname(s) to the exact Vercel project.
- [ ] Add/verify matching `club_domains` production rows.
- [ ] Add only exact required Auth Site URL/redirect entries; preserve other
  tenants' valid callbacks.
- [ ] Do not change nameservers, root mail MX, unrelated TXT, or shared Auth
  sending-domain records.
- [ ] Verify authoritative DNS, TLS, Vercel verification, tenant resolution,
  canonical redirect, callback host, and unknown/Host-spoof denial.
- [ ] Verify the site still uses preview/private access and `noindex, nofollow`.
- [ ] Keep the private validation hostname/rollback path until closeout.

## Public Launch (`DCFC-903`)

Final pre-launch gate:

- [ ] Canonical Stripe state is active or trialing and Pro.
- [ ] Production tenant, content/media/presentation, Auth/MFA/admin, domain/DNS/
  callback, and private desktop/mobile gates are all accepted.
- [ ] Backups, prior deployment, prior DNS, private lifecycle state, and
  rollback owner are current.
- [ ] Runtime logs and monitors are clear/active.
- [ ] Christian gives explicit public-launch approval; indexing is explicitly
  excluded from that approval.

Immediate launch evidence:

- [ ] Set public state only through audited/canonical tooling.
- [ ] Public homepage and every visible route return expected status/content.
- [ ] Desktop/mobile public and admin browser acceptance passes.
- [ ] Domain/TLS/canonical redirects and tenant/cache/RSC/metadata isolation
  pass.
- [ ] All visible images load raw with positive dimensions; no unexpected
  fallback, transform, optimizer dependency, or broken media appears.
- [ ] External registration links are exact, safe, disclosed, and collect no
  data in Onzio.
- [ ] Auth recovery/login/MFA/admin and Stripe Portal remain healthy.
- [ ] Unknown, cross-tenant, preview, and suspended cases fail closed.
- [ ] Runtime logs contain no unresolved error.
- [ ] Header and page metadata still say `noindex, nofollow`.
- [ ] Observation window starts and the first checkpoint is scheduled.

## Observation and Reconciliation (`DCFC-1001`)

`DCFC-D116` must record the exact duration. The recommended planning range is
7–14 days, but this document does not select it.

At the start, each scheduled checkpoint, and the end:

- [ ] Public route/TLS/domain/canonical/robots health passes.
- [ ] Desktop/mobile media monitor reports positive dimensions and no
  unexpected fallback, transform, optimizer, or broken object.
- [ ] Runtime logs show no tenant, authorization, cache, media, Auth, billing,
  webhook, or unhandled application error.
- [ ] Table counts, composite relationships, presentation digest, Storage
  object count/bytes/checksums, and external destinations remain reconciled.
- [ ] Owner/admin memberships, sign-in/MFA state, and Auth-email delivery are
  healthy without inspecting secrets/messages.
- [ ] Stripe Customer/subscription/Price/webhook and local projection remain
  canonical, with no unexpected charge/tier/cancellation state.
- [ ] Alpha/Bravo/Rose City/unknown-host isolation remains healthy.
- [ ] No prohibited data collection or new unapproved content/media appears.
- [ ] `noindex, nofollow` remains active until `DCFC-1003` approval.
- [ ] Issues, owners, severity, action, and whether a rollback trigger fired are
  recorded without making silent fixes.

## Stop Conditions

Any of these blocks indexing and makes rollback assessment mandatory:

- tenant or cache leakage
- unauthorized read/write/upload or AAL/MFA bypass
- incorrect tenant/domain/callback resolution
- lost/corrupt/unreconciled content, relationship, presentation, or media
- broken critical route/media on desktop or mobile
- unexpected Stripe customer/subscription/Price/amount/tier/environment state
- registration/payment/waiver/medical/signature/participant data entering Onzio
- production placeholder or unapproved claim/media/URL
- sustained runtime/auth/email failure that prevents ordinary use
- inability to identify or execute the documented rollback safely

## Conditional Rollback (`DCFC-1002`)

- [ ] Record trigger, timestamp, evidence, decision owner, and exact approved
  rollback target.
- [ ] Set Diverse City to preview/suspended before deeper recovery when public
  integrity or security is uncertain.
- [ ] Restore prior deployment if release behavior is causal.
- [ ] Restore prior presentation/content pointers and verify their digests.
- [ ] Compensate only manifest-ledger-created unreferenced media objects; never
  broad-delete Storage.
- [ ] Deactivate new domain rows/aliases/callbacks and restore exact prior DNS
  when domain routing is causal.
- [ ] Handle billing only through approved Stripe/customer workflow and
  canonical webhooks; never edit projection tables directly.
- [ ] Revoke unexpected sessions/memberships/factors through audited Auth/
  operator tooling.
- [ ] Reconcile public stop, private/admin safety, tenant isolation, Database,
  Storage, Auth, billing, DNS, deployment, and logs.
- [ ] Preserve audit/Stripe ledgers and all incident evidence.
- [ ] Do not hard purge the tenant.
- [ ] A forward retry requires a new root-cause fix, local/staging rehearsal,
  and fresh approval.

## Indexing and Closeout (`DCFC-1003`)

- [ ] Observation completed without an unresolved stop condition.
- [ ] Christian separately approves indexing for exact public hostname(s).
- [ ] Remove robots gates only through a reusable tenant/presentation
  configuration; never add a Diverse City slug branch.
- [ ] Production public routes emit indexable header/meta behavior.
- [ ] Canonical URL and sitemap contain only approved Diverse City URLs.
- [ ] Staging, private aliases, preview deployments, and unknown hosts remain
  `noindex, nofollow`.
- [ ] Rollback of indexing restores `noindex, nofollow` and is verified.
- [ ] Final content/media/tenant/Auth/billing/domain/deployment evidence is
  reconciled.
- [ ] Monitoring owners and ongoing cadence are recorded.
- [ ] `STATUS.md` and `HANDOFF.md` contain the final package record, mutation
  counts, unresolved operational issues, and next maintenance step.
- [ ] `DCFC-EPIC-002` is marked complete only after all required evidence is
  present.

## 2026-08-06 - Billing projection repair gate

Production cutover remains gated on resolving Rose City billing drift:

- DB projection: `sub_1TwcndK6WajTkwHYH1VuFgrG` recorded as `active`/`pro`, paid through `2026-08-24T06:41:35+00:00`.
- Live Stripe readback: the same subscription is `canceled` with cancellation reason `cancellation_requested`.
- Canonical Stripe event available for repair: `evt_1TyK93K6WajTkwHY9zzFiSYB`, type `customer.subscription.deleted`, created `2026-07-28T23:10:45+00:00`, `pending_webhooks=1` at readback.
- Safe repair preference: replay the canonical Stripe event to the live webhook endpoint, then verify the production DB projection changed to the terminal Stripe status while preserving paid-through/grace semantics.
- Mutation status: no repair action has been run yet; explicit production mutation approval is required.

## 2026-08-06 - Replay attempt blocked

The approved canonical replay of `evt_1TyK93K6WajTkwHY9zzFiSYB` to `we_1TwEpdK6WajTkwHYD5SEYzXX` did not run because Stripe rejected the request before delivery with `more_permissions_required`. The active restricted live key lacks webhook replay/write permission. No production mutation occurred from this attempt.
