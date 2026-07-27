# Onzio Platform Handoff

Last updated: 2026-07-27

## Current State

Phase 7 — protected staging — is complete.

The isolated `Onzio Platform Staging` Supabase project now contains only
synthetic Alpha and Bravo tenants. Ten checked-in migrations are applied
without the local seed, modern publishable/secret keys replace disabled legacy
keys, leaked-password protection and TOTP MFA are enabled, and the exposed
`onzio` schema remains separated from private security helpers. Supabase's
security advisor has no warnings; its four remaining informational notices
describe intentionally policy-free internal/write-only tables.

The protected `onzio-platform-staging` Vercel project serves the `staging`
branch behind Vercel Authentication. Preview-scoped variables contain only
staging Supabase and Stripe test-mode values. Alpha and Bravo have separate
verified staging domains, and unknown or cross-tenant hosts fail closed.

The real Stripe test path is exercised end to end: owner Checkout created an
active Starter subscription, the staging webhook projected it, Customer Portal
opened for the owner, and Starter→Pro→Starter changes projected correctly.
Duplicate, stale, foreign-environment, customer-metadata, and unknown-price
events failed closed.

Hosted verification covers AAL1/AAL2, roles, membership revocation, tenant RLS,
HTML/RSC cache isolation, Starter/Pro entitlements, media normalization and
rejection, retry and cleanup, paid/grace/suspended lifecycle states, archive,
reactivation, and atomic rollback. Alpha is restored active/live/Starter with
its test subscription; Bravo is restored onboarding/private-preview with no
subscription.

No Rose City production data, production Stripe subscription, production DNS
record, or production Supabase project was mutated. The only intentional test
failures remain the eight Phase 8 Rose City transformation/migration contracts.

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

### Phase 7 — protected staging gate

- Added `docs/phase-7/staging-gate.md` and completed every hosted-resource and
  acceptance row with staging-only evidence.
- Created the separate `Onzio Staging` organization
  (`udlsrxgfpkqjaridfxnz`) and `Onzio Platform Staging` project
  (`fxefqnoqxbezeccjvrsw`) in `us-west-2`.
- Linked the checkout using a Keychain-held database password and applied ten
  checked-in Phase 2–7 migrations without `supabase/seed.sql`.
- Added a minimal private-preview resolver, exact webhook routing bypass, and
  empty-search-path/revoked-execution hardening for hosted runtime functions.
- Disabled legacy `anon`/`service_role` API keys, retained modern
  publishable/secret keys outside the repository, enabled leaked-password
  protection, and kept TOTP enrollment/verification enabled.
- Added a guarded `npm run staging:provision` workflow and provisioned the
  operator plus synthetic Alpha/Bravo owner/admin identities with verified
  domains, memberships, audit records, and TOTP AAL2 factors.
- Linked the Vercel project `onzio-platform-staging`
  (`prj_I362ysmh9cse5cRxnL7db4dOhsEs`) to GitHub, scoped all staging values to
  the `staging` Preview branch, and enabled Vercel Authentication.
- Deployed the protected staging application and mapped the Alpha/Bravo aliases
  to the verified `staging` branch deployment.
- Rotated the Stripe test secret, retained it outside the repository, and
  configured test Starter/Pro Prices, Customer Portal, and webhook
  `we_1TxrnaK6WajTkwHYtFEvCEo8` with the exact seven-event allowlist.
- Created and paid a real test Checkout, projected subscription
  `sub_1TxsLTK6WajTkwHYEUjdWeNR`, verified Portal and Starter/Pro switching,
  then restored Alpha to active/live/Starter.
- Added reusable hosted auth, Stripe, media, and lifecycle verifier scripts.
  The media cleanup verifier now scopes destructive cleanup to its unique
  synthetic club prefix.

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
  129 passed, 8 intentional failures, 137 total

npm run test:architecture
  16/16 passed

npm test (with local Supabase test values)
  434 passed, 8 intentional failures, 442 total
```

The remaining failures are assigned to later phases:

- eight Rose City transformation/migration contracts (Phase 8)

### Phase 7 final gate — 2026-07-27

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npm run test:contracts
  129 passed, 8 intentional Phase 8 failures, 137 total

npm test (with loopback-only local Supabase values)
  434 passed, 8 intentional Phase 8 failures, 442 total

npm run db:types:check
  generated definitions match the local schema

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  23 static pages generated

supabase db lint --linked --schema onzio,onzio_private
  no schema errors
```

Hosted staging verification:

- `phase7.hosted_auth_verified`: AAL1/AAL2, four tenant sessions, RLS/cache
  isolation, roles, Starter entitlement, Portal, and immediate revocation pass
- `phase7.hosted_media_verified`: normalization, rejection, idempotency,
  retirement, and scoped abandoned-staging cleanup pass
- `phase7.hosted_stripe_verified`: duplicate, stale, environment, customer, and
  Price boundaries pass
- `phase7.hosted_lifecycle_verified`: retry, grace, suspension, archive,
  reactivation, and rollback pass
- real Stripe test Checkout, webhook projection, Customer Portal, and
  Starter→Pro→Starter projection pass
- Supabase security advisor reports no warnings; four intentional
  `rls_enabled_no_policy` informational notices remain

No test was deleted, skipped, marked todo, loosened, or broadly mocked.

Known non-blocking warnings:

- four raw `<img>` warnings
- three unnecessary analytics `useMemo` dependency warnings
- the existing Supabase SSR Edge-runtime compile warning

## Known Constraints and Blockers

- The dedicated Onzio production Supabase project remains a Phase 8
  prerequisite and has not been provisioned.
- Rose City production freeze/import/cutover has not begun and still requires
  Christian's explicit approval.
- The staging organization is temporarily Pro for the Phase 7/Phase 8
  migration month; the architectural steady state remains Free staging after
  the migration rollback window.
- The Vercel staging project's Production scope is intentionally unused.
  Staging secrets exist only on the protected `staging` Preview branch, so
  `main` must not be treated as the hosted staging target.
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

Phase 8 — Rose City transformation and migration.

Before implementation, read the Phase 8 plan and eight intentional-red
contracts, provision the dedicated Onzio production Supabase project, and
prepare the backup/freeze/rollback evidence. Do not start the production
freeze, import, Stripe subscription migration, DNS work, or cutover until
Christian explicitly authorizes that workflow.

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
