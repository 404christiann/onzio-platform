# Onzio Platform Handoff

Last updated: 2026-07-27

## Current State

Phase 6 — Stripe billing — is complete. Phase 7 hosted staging is in progress
and has not passed yet.

Onzio now has strict environment-scoped Starter/Pro Price mapping,
first-subscription Checkout, existing-subscriber Customer Portal routing, and
owner-only billing authorization derived from the verified tenant, AAL2
session, and active membership. Customers, Checkout Sessions, and
Subscriptions carry club/environment metadata, and return URLs use the
verified primary domain.

The Node webhook verifies the raw body, retrieves canonical Stripe
subscription and customer state, validates tenant/environment/customer/
subscription/price ownership, and applies the immutable event ledger,
subscription projection, club tier, lifecycle, and runtime access in one
database transaction. Duplicate, stale, foreign, mismatched, unknown-price,
obsolete, and race-conflicting events fail closed.

Runtime access is clock-driven rather than webhook-timing-dependent:
onboarding/no-subscription clubs remain in private preview, active/trialing/
past-due subscriptions are live, terminal subscriptions move through the
seven-day public grace window, and expired/archived clubs suspend. Content
writes and admin routes become billing-only after paid access ends.

The Phase 6 gate is green: all 24 Stripe contracts, the Stripe architecture
sentinel, and six new database billing regressions pass. The only remaining
intentional failures are eight Phase 8 Rose City transformation/migration
contracts.

No hosted Supabase project, Stripe object, Rose City production data, DNS
record, Vercel deployment, or production credential was changed.

The Phase 7 local preflight was re-verified on 2026-07-27. A production build
passes with loopback-only Supabase and inert test-shaped Stripe configuration,
the database/type/architecture/legacy gates remain green, and the full suite
retains only the eight intentional Phase 8 migration failures. The hosted gate
cannot begin until Supabase, Stripe, and Vercel account access is available.

## Completed Work

### Phase 1 — Bootstrap and threat model

- Copied and verified the Rose City compatibility baseline without secrets,
  dependencies, build output, nested Git state, or the legacy Supabase image
  loader.
- Completed the source/schema/route/read/write/media inventory, access matrix,
  threat model, gap register, and guarded read-only production introspection.
- Preserved the contract-first harness and legacy regression suite.

### Phase 2 — Database security foundation

- Added the `onzio` exposed schema and private `onzio_private` security
  boundary.
- Added tenant-owned content, billing, audit, and media tables with composite
  tenant foreign keys, grants, RLS, storage policies, and deterministic
  Alpha/Bravo fixtures.
- Added generated database types and authenticated local RLS/storage tests.

### Phase 3 — Atomic tenant conversion

- Added strict hostname normalization, verified domain resolution,
  tenant-specific rewrites, tenant-aware cache keys, and `ClubContext`.
- Converted public reads and protected admin mutations to explicit tenant
  scope.
- Added password authentication, TOTP/AAL2 enforcement, role/lifecycle/tier
  authorization, and server-side protected-page gates.
- Removed Rose City content fallbacks from tenant requests.
- Added published `media_assets` resolution and selective image-delivery
  behavior.
- Verified Alpha/Bravo isolation and retained the local database/RLS gate.

### Phase 4 — Secure media pipeline

#### Paths and validation

- Added strict tenant/surface/UUID path construction and parsing in
  `lib/storage-path.ts`.
- Added magic-byte detection, MIME/extension agreement, byte limits,
  decoded-dimension limits, corruption handling, decompression-bomb rejection,
  and photo/graphic allowlists in `lib/media-validation.ts`.
- Rejects SVG, GIF, executable/spoofed, malformed, and unsupported input before
  any public write.

#### Normalization and delivery

- Added Sharp photo processing with orientation correction, metadata
  stripping, no upscaling, a 2400px long edge, and WebP quality 82.
- Added graphic processing with transparency preservation and optimized PNG
  retention when WebP would be larger.
- Kept large photographic surfaces on Vercel optimization and small graphics
  unoptimized.
- Retained the static prohibition on Supabase runtime Image Transformation
  URLs and the exact `onzio-media` remote pattern.

#### Authorization and finalization

- Added `/api/admin/media/authorize` for AAL2, membership, lifecycle, tier,
  surface, MIME, and claimed-size checks.
- Browser uploads go directly to the private `onzio-upload-staging` bucket
  through a short-lived signed upload authorization.
- Added a server-only, HMAC-bound upload authorization tying the upload ID,
  actor, club, surface, kind, staging path, and expiry together.
- Added `/api/admin/media/finalize`, which re-checks tenant/user authorization,
  downloads staging through the narrow service-role boundary, validates and
  normalizes the real bytes, publishes an immutable UUID path, records
  `media_assets` and a narrow audit event, and removes staging.
- Finalization is idempotent. Database/audit failures trigger compensating
  public-object rollback.

#### Replacement, cleanup, and monitoring

- Replaced the Phase 3 fail-closed storage adapter with the secure media
  adapter used by existing admin pages.
- Automatically adds media asset IDs to supported admin content payloads.
- Added versioned Onzio URL parsing for homepage, sponsor, about, and shared
  storage cleanup flows.
- Added `/api/admin/media/cleanup` and retirement behavior that preserves the
  new reference before old-object deletion.
- Added `onzio.media_cleanup_queue` for failed staging/public cleanup retries.
- Added `npm run media:cleanup` for abandoned staging objects older than 24
  hours and `getMediaUsageByClub` for asset/byte monitoring.
- Added `npm run media:smoke` for local end-to-end verification.
- Added an explicit Node 20 WebSocket transport to the shared service-role
  Supabase client.

### Phase 5 — Authentication and operator workflows

#### Operator boundary and provisioning

- Added a server-only operator allowlist through `ONZIO_OPERATOR_USER_IDS`.
- Added validated direct-invocation guards so operator functions cannot be
  exposed through ordinary application routes.
- Added compensated club provisioning for club, verified primary domain,
  owner Auth user/invite, owner membership, and audit creation.
- Reuses an explicitly verified existing Auth user without duplicating the
  account.
- Maps slug/domain conflicts and rolls back database/Auth artifacts when a
  later provisioning step fails.

#### Membership and MFA recovery

- Added operator-only membership activation/reactivation and removal.
- Re-checks the Auth identity, current club lifecycle, and membership state at
  mutation time.
- Prevents removal of the last active owner and restores the previous
  membership if audit recording fails.
- Added manual-identity-verification-gated MFA recovery using Supabase Auth
  admin factor removal and a generated password recovery link.
- Stores only a SHA-256 digest of the operator verification reference in the
  start/completion audit records.

#### Archive, reactivate, export, and purge

- Added archive behavior that suspends the club, detaches domains, blocks
  existing sessions/writes through the existing lifecycle gates, preserves all
  content/media, and records an operator audit.
- Added reactivation into onboarding/private-preview state with the verified
  primary domain restored; billing is still required before public launch.
- Added the privileged `club_exports` verification ledger with no browser
  grants and regenerated database types.
- Added exact-confirmation hard purge with local storage removal and
  dependency-ordered tenant-row deletion.
- Changed immutable audit/Stripe club foreign keys to `on delete set null` so
  their ledgers survive a hard purge without granting service-role
  update/delete access.
- Added a final hard-purge audit outside the deleted tenant.
- Added `npm run operator:smoke` and local-development operator documentation.

### Phase 6 — Stripe billing

#### Checkout, Portal, and authorization

- Added strict, distinct `STRIPE_PRICE_ID_STARTER` and
  `STRIPE_PRICE_ID_PRO` mapping with staging/test and production/live mode
  enforcement.
- Replaced the legacy email allowlist with verified-tenant, AAL2,
  active-owner billing authorization.
- Added first-subscription Checkout with idempotent Customer and Session
  creation plus club/environment metadata on the Customer, Checkout Session,
  and Subscription.
- Routes every existing subscription row to Customer Portal and derives all
  success, cancel, and return URLs from the verified primary domain.
- Updated the Payments page for tenant-specific Starter/Pro selection and
  existing-subscriber management.

#### Webhook and transactional projection

- Added raw-body Stripe signature verification and a narrow required-event
  allowlist.
- Retrieves canonical Stripe state for subscription, Checkout, and invoice
  events and verifies canonical Customer metadata.
- Added pure event routing for duplicate, stale, environment, customer,
  subscription, price, obsolete-deletion, and reconciliation decisions.
- Added private security-definer functions plus service-role-only exposed
  wrappers that atomically write `stripe_events`, `club_subscriptions`,
  `clubs.tier`, lifecycle, and runtime access.
- Rejected events receive digest-only ledger records; failed projection writes
  roll back the event insert and every runtime change.
- Revoked direct service-role update/delete access to the immutable Stripe
  ledger while preserving private transactional state transitions and
  hard-purge `club_id` detachment.

#### Runtime access and regression coverage

- Added dynamic database projection for preview, live, grace, and suspended
  access so grace expires without requiring a precisely timed webhook.
- Preserved private-preview content preparation before the first subscription.
- Restricted content mutations and non-billing admin routes after paid access
  ends while keeping Customer Portal available to owners.
- Added deterministic active-subscription seed state for Alpha.
- Added database regressions for atomic application, duplicate/stale
  rejection, rollback, grace expiry, RPC privilege boundaries, and ledger
  immutability.
- Corrected two approved contradictory Stripe fixtures: the duplicate now
  identifies the already-applied event, and Rose City reconciliation carries
  Rose City tenant metadata while preserving the existing subscription ID.

### Phase 7 — protected staging gate (in progress)

- Added `docs/phase-7/staging-gate.md` as the operational acceptance record.
- Defined hard isolation preconditions, the hosted-resource evidence record,
  provisioning order, end-to-end acceptance matrix, and completion decision.
- Re-ran the complete local readiness baseline without hosted credentials.
- Confirmed this checkout is not linked to Vercel or hosted Supabase and
  contains no staging environment file.
- Confirmed the Vercel connector has no signed-in team and this checkout has no
  Vercel link.
- Reused the existing active Stripe test-mode Starter ($65/month) and Pro
  ($99.99/month) Prices and verified both are recurring and non-live.
- Enabled price switching for only those two Prices in the existing default
  test-mode Customer Portal while preserving cancellation-at-period-end and
  no-proration behavior.
- Authenticated the Supabase CLI and created the dedicated `Onzio Staging`
  organization (`udlsrxgfpkqjaridfxnz`) to keep staging separate from Rose City
  and future production.
- Confirmed `Onzio Platform Staging` (`fxefqnoqxbezeccjvrsw`) is active and
  healthy in `us-west-2`.
- The staging organization is temporarily upgraded for the Phase 7/Phase 8
  migration month. This is an operational exception, not a change to the
  steady-state architecture decision to use Free staging.
- Linked this checkout to `fxefqnoqxbezeccjvrsw` using a database password
  stored in macOS Keychain rather than a repository environment file.
- Reviewed the hosted migration dry-run and applied exactly the seven checked-in
  Phase 2–6 migrations without `supabase/seed.sql`.
- Verified all seven local and hosted migration versions match and hosted
  `onzio` plus `onzio_private` schema lint reports no errors.

## Verification

### Phase 6 green gates

```text
npx vitest run tests/contracts/stripe-subscription.test.ts
  24/24 Phase 6 Stripe contracts passed

npm run test:db
  45/45 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only local Supabase values; 23 static pages generated

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors
```

### Intentional-red later-phase gates

```text
npm run test:contracts
  128 passed, 8 intentional failures, 136 total

npm run test:architecture
  16/16 passed

npm test (with local Supabase test values)
  432 passed, 8 intentional failures, 440 total
```

The remaining failures are assigned to later phases:

- eight Rose City transformation/migration contracts (Phase 8)

### Phase 7 local preflight — 2026-07-27

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:architecture
  16/16 passed

npm run test:db
  45/45 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npm run test:contracts
  128 passed, 8 intentional Phase 8 failures, 136 total

npm test (with loopback-only local Supabase values)
  432 passed, 8 intentional Phase 8 failures, 440 total

npm run db:types:check
  generated definitions match the local schema

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  23 static pages generated
```

No test was deleted, skipped, marked todo, loosened, or broadly mocked. Two
contradictory Phase 6 fixtures were corrected with Christian's approval.

Known non-blocking warnings:

- four raw `<img>` warnings
- three unnecessary analytics `useMemo` dependency warnings
- the existing Supabase SSR Edge-runtime compile warning

## Known Constraints and Blockers

- Initialized this directory as a Git repository and published `main` to
  `git@github.com:404christiann/onzio-platform.git`; initial platform commit
  `14addff` is available to Vercel's GitHub importer.
- The dedicated Supabase staging project is provisioned, linked, and migrated.
- The dedicated Onzio production Supabase project remains a Phase 8
  prerequisite and has not been provisioned.
- The Vercel connector still reports no team, but the authenticated
  `404christiann's projects` dashboard is available through Christian's
  approved Chrome session. This checkout has no `.vercel` link yet.
- Stripe test-mode Starter/Pro Prices and Customer Portal configuration are
  ready. The staging webhook cannot be created or exercised until the protected
  Vercel deployment URL exists.
- Hosted operator execution must configure the exact actor UUID allowlist in
  `ONZIO_OPERATOR_USER_IDS`; no operator application UI or route exists.
- `npm run test:db` and full database-inclusive tests need JWT-shaped local
  `ANON_KEY` and `SERVICE_ROLE_KEY` values mapped into the
  `SUPABASE_TEST_*` variables.
- A hosted environment must schedule `npm run media:cleanup` and configure the
  planned 50%, 80%, and 100% Vercel image-spend notifications.
- The development-only ESLint 8 dependency-chain findings remain until the
  planned framework/lint-tooling migration.

## Next Milestone

Begin Phase 7 — protected staging gate.

Use `docs/phase-7/staging-gate.md` as the authoritative execution and evidence
record.

1. Import `404christiann/onzio-platform` into Vercel from the now-populated
   `main` branch and configure Deployment Protection before inviting testers.
2. Configure the hosted Supabase API/Auth settings using the protected staging
   URL, then provision synthetic Alpha and Bravo identities through the audited
   operator workflow.
3. Create the Stripe test-mode staging webhook after the protected deployment
   URL exists.
4. Deploy the protected Vercel staging environment with synthetic clubs only.
5. Exercise Checkout, Portal, retries, out-of-order events, tier changes,
   grace/suspension, archive/reactivation, and rollback end to end.
6. Re-run domain/cache, MFA/role, media, and tenant-isolation acceptance
   scenarios before authorizing any production migration.

Do not begin Rose City import, production Stripe mutation, DNS work, or cutover
without explicit approval.

## Working Commands

```bash
npm run db:start
npm run db:reset
npm run db:types
npm run db:types:check
npm run test:db
npm run test:legacy
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm test
npm run media:smoke
npm run media:cleanup
npm run operator:smoke
npm run lint
npm run build
```

For Apple Silicon systems where analytics/vector services conflict with the
local container runtime:

```bash
supabase start -x vector,logflare
```

After each meaningful milestone, update this file with shipped work,
verification, blockers, and the next step.
