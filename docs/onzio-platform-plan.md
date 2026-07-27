# Onzio Platform — Secure Multi-Tenant Architecture

## Summary

Onzio will be a multi-tenant club website platform serving an expected 5–10 clubs in the first 12 months.

The platform uses:

- one shared Next.js codebase and Vercel deployment
- a dedicated Supabase Pro production project
- a separate Supabase Free staging project with synthetic data
- the existing Stripe account with tenant-aware metadata and webhooks
- password authentication with mandatory MFA for every owner and admin
- operator-only club provisioning and membership management
- immediate content publishing, with no draft workflow in v1
- private preview access until a subscription becomes active
- a seven-day public-site grace period after paid access ends
- indefinite archival for returning clubs
- Supabase Storage without Supabase Image Transformations
- selective Vercel optimization for large photographs

Rose City will become the first production tenant after the platform passes the staging gate. Its existing Stripe subscription will migrate in place.

## Locked Decisions

- **Production database:** dedicated Supabase Pro project, separate from Rose City
- **Staging database:** separate Supabase Free project
- **Hosting:** one Vercel project and deployment serving every tenant domain
- **Billing:** existing Stripe account, one subscription per club
- **Rose City:** full tenant migration, including data, storage, admins, domain, and billing
- **Authentication:** email/password plus mandatory MFA for owners and admins
- **Membership:** managed only by an Onzio operator in v1
- **Publishing:** admin saves become publicly visible immediately
- **Billing self-service:** owners use Stripe Customer Portal
- **Pre-payment behavior:** authenticated preview only
- **Payment lapse:** seven-day public grace after paid access ends
- **Offboarding:** archive indefinitely; hard purge is a separate operator procedure
- **Media:** public assets may remain cached after archival
- **Image processing:** never use Supabase runtime Image Transformations
- **Non-goals:** no self-service signup, AWS, drafts, dual-write migration, or immediate hard deletion

## Core Architecture

### Tenant model

Create the following core tables in the `onzio` schema:

#### `clubs`

- `id uuid primary key`
- `slug text unique not null`
- `name text not null`
- `lifecycle onboarding|active|archived`
- `public_access preview|live|grace|suspended`
- `tier starter|pro`
- safe public branding/runtime fields
- created and updated timestamps

Lifecycle behavior:

- `onboarding`: authenticated preview only
- `active`: public access depends on subscription state
- `archived`: domains detached, public rendering disabled, sessions rejected, and writes blocked

Normal offboarding updates lifecycle to `archived`; it never deletes tenant rows.

#### `club_domains`

- normalized unique hostname
- `club_id`
- `is_primary`
- `verified_at`
- environment (`staging|production`)
- active/inactive state

A club may have multiple aliases but exactly one active primary domain per environment.

#### `club_members`

- composite primary key `(user_id, club_id)`
- role `owner|admin`
- status `active|removed`
- timestamps

Owners can manage content and billing. Admins can manage content only. Neither role can mutate memberships in v1.

#### `club_subscriptions`

- primary key `club_id`
- unique Stripe customer and subscription IDs
- allowlisted price ID
- derived tier
- status
- cancellation state
- paid-through timestamp
- last applied Stripe event ID and timestamp
- timestamps

#### `stripe_events`

Immutable webhook event ledger used for idempotency and replay protection.

#### `media_assets`

- `id`
- `club_id`
- storage path
- surface
- media kind
- MIME type
- byte size
- dimensions
- checksum
- creator
- timestamps

Content records reference media assets rather than treating arbitrary URLs as authoritative.

#### `audit_events`

Append-only records containing:

- actor
- club
- operation
- resource type and ID
- timestamp
- request metadata

Audit payloads must never include passwords, tokens, Stripe secrets, service-role keys, or complete sensitive records.

### Relational tenant integrity

Adding `club_id` to each table is not sufficient. Every relationship between tenant-owned records must include the tenant:

```sql
unique (club_id, id)

foreign key (club_id, related_id)
  references onzio.related_table (club_id, id)
```

This applies to:

- players and player photos
- players, matches, and match statistics
- players, seasons, and season statistics
- goalkeeper statistics
- shop, sponsor, standings, branding, and homepage relationships
- every future tenant-owned association

A record claiming to belong to one club must never reference another club’s record.

Singletons use `club_id` as their primary or unique key. Surface-specific records use composite uniqueness such as `(club_id, surface)`.

### Database schemas and functions

- Exposed application tables live in `onzio`.
- Authorization and entitlement helpers live in unexposed `onzio_private`.
- Storage continues to use Supabase’s `storage` schema.

Every security-definer function must:

- use `set search_path = ''`
- fully qualify every relation
- revoke default execution from `public`
- grant execution only to the roles that require it
- never live in an exposed schema

Generate Supabase TypeScript types from migrations. CI fails when generated types drift from the committed schema.

## Row-Level Security

Enable RLS on every exposed table in the migration that creates it.

Do not apply a blanket policy to all content. Define policies per table, operation, role, lifecycle, and tier.

### Public reads

Anonymous users may read only:

- explicitly public content tables
- rows belonging to a publicly accessible club
- content enabled by that club’s tier

Anonymous users may never read:

- club memberships
- subscriptions or Stripe event records
- audit records
- staging uploads
- operational or migration records
- onboarding, suspended, or archived tenant content

Published content is intentionally public and may be enumerated across live clubs. Private or draft content is outside v1.

### Authenticated reads and writes

Content mutations require:

- an authenticated user
- AAL2/MFA
- active membership for the row’s club
- active club lifecycle
- an entitled feature

Owners receive billing access. Admins do not.

No authenticated policy permits writes to `club_members`, `stripe_events`, or operator-only lifecycle actions.

RLS remains authoritative even though the application routes mutations through Server Actions or route handlers. Direct Supabase API requests must be constrained by the same tenant, lifecycle, role, and tier rules.

Database triggers write audit events for successful mutations, including direct API mutations.

## Tenant Resolution and Request Boundaries

### Host normalization

Tenant resolution:

- lowercases the hostname
- removes a valid local-development port
- removes a trailing dot
- supports verified punycode hostnames
- rejects schemes, paths, credentials, whitespace, malformed labels, and invalid ports
- resolves only verified active records in `club_domains`

Never trust inbound `x-onzio-*`, `Host`, or `Origin` values as tenant authority without normalization and domain lookup.

### Routing

Middleware/proxy resolves the verified domain and rewrites internally to a tenant-specific pathname:

```text
/_clubs/{slug}/{requested_path}
```

The internal tenant path ensures HTML, RSC, metadata, and route caches cannot collide across hosts.

Unknown, unverified, suspended, and archived hosts fail closed.

Authentication, password-reset, Checkout, Portal, and callback URLs derive from the verified primary domain—not directly from a request-provided origin.

### Club context

The internal contract is:

```ts
type ClubContext = {
  id: string;
  slug: string;
  name: string;
  primaryDomain: string;
  lifecycle: "onboarding" | "active" | "archived";
  publicAccess: "preview" | "live" | "grace" | "suspended";
  tier: "starter" | "pro";
  role: "owner" | "admin" | null;
};
```

Admin mutation payloads never contain an authoritative `club_id`. The server derives tenant identity from the verified host and session.

## Authentication and Authorization

- Use Supabase email/password authentication.
- Require AAL2/MFA before every protected admin page and action.
- Provision users through operator-issued password setup invitations.
- Re-check membership, tenant lifecycle, and MFA on every protected server action.
- Derive the user’s role for the current club only; do not reuse a role from another membership.
- Removed memberships lose access immediately.
- Archived clubs reject existing admin sessions and writes.

MFA recovery requires manual operator identity verification and creates an audit event.

There is no club-managed invitation UI or self-service signup in v1.

## Server Mutation Boundary

Admin pages use validated Server Actions or route handlers.

For every mutation:

1. Resolve the verified tenant.
2. Authenticate the user.
3. Require AAL2.
4. Verify active membership and required role.
5. Verify club lifecycle.
6. Verify feature entitlement.
7. Validate the payload with Zod.
8. Execute using the user-scoped Supabase session.
9. Return structured success or error state.

Security-critical validation is duplicated with database constraints because a signed-in user can call Supabase directly.

Validate:

- URL protocols
- colors
- structured JSON
- text and array sizes
- media references
- cross-record tenant consistency

Escape tenant-controlled values in generated HTML and metadata.

The service-role client is allowed only in:

- operator provisioning/recovery
- Stripe webhook processing
- migration tooling
- media finalization

It must be marked server-only and must not become the general query client.

## Stripe Billing

Stripe is the billing source of truth; Supabase stores a local projection for fast authorization and rendering.

### Checkout and Portal

- Checkout creates only the first subscription.
- Existing subscribers are sent to Customer Portal.
- Owners may update payment methods, view invoices, change Starter/Pro, and cancel.
- Admins cannot access billing.
- Only configured Starter and Pro Price IDs are accepted.
- Client-provided price IDs or tiers are never trusted.

Attach the following metadata to Customers, Checkout Sessions, and Subscriptions:

```text
onzio_club_id
onzio_environment
```

### Webhook processing

- Verify Stripe signatures against the raw request body.
- Subscribe only to required event types.
- Record each event ID before applying state.
- Reject duplicate and stale events.
- Reject events for another environment.
- Reject unknown prices.
- Verify the Stripe customer and subscription belong to the resolved club.
- Retrieve canonical Stripe state for create, update, and invoice events.
- Ignore deletion of an obsolete subscription after a replacement exists.
- Update subscription state, runtime entitlement, and event ledger transactionally.

One club may not have multiple active subscriptions.

### Access behavior

- No subscription: private preview only
- `active|trialing`: public site live
- `past_due`: remain live through paid time and Stripe retry handling
- terminal status before grace ends: public grace
- terminal status after grace: public suspended
- archived club: suspended regardless of billing

Once paid access ends, admin access is restricted to billing. Public suspension begins seven days after paid access ends.

### Rose City subscription

Rose City’s existing Stripe customer and subscription remain intact.

During migration:

1. Create Rose City as an Onzio club.
2. Attach its Onzio club/environment metadata to the existing Stripe objects.
3. Reconcile the subscription into `club_subscriptions`.
4. Verify the platform webhook reflects the same subscription ID.
5. Disable the legacy webhook only after platform verification.

No refund or new Checkout is required.

## Secure Media Pipeline

### Storage strategy

Use:

- private `onzio-upload-staging` bucket for temporary raw uploads
- public `onzio-media` bucket for validated normalized assets

Paths use:

```text
{club_id}/{surface}/{asset_uuid}.{extension}
```

Never overwrite a published object in place. Replacements receive a new UUID path. Update the content reference first, then remove the old object. Queue cleanup if deletion fails.

Published objects use immutable cache headers because the URL changes with the asset.

Previously public assets may remain accessible through old URLs or third-party caches after archival. They are not treated as confidential.

### Upload flow

1. AAL2 admin requests upload authorization.
2. Server verifies membership, lifecycle, tier, surface, type, and claimed size.
3. Browser uploads directly to the private staging bucket with a short-lived signed authorization.
4. A Node handler downloads the object.
5. Inspect the actual file signature; do not trust browser MIME or extension.
6. Process the asset with Sharp.
7. Write the normalized result to `onzio-media`.
8. Create `media_assets` and update the content reference transactionally.
9. Delete the staging object.
10. Remove abandoned staging objects older than 24 hours.

Finalization must be idempotent and safe to retry.

### Photograph rules

- input: JPEG, PNG, or WebP
- maximum raw size: 15 MB
- maximum decoded dimensions: 6000×6000
- strip EXIF and metadata
- correct orientation
- resize to a maximum 2400px long edge without upscaling
- store as WebP at quality 82

### Logo and graphic rules

- input: PNG or WebP
- maximum raw size: 5 MB
- maximum decoded dimensions: 3000×3000
- preserve transparency
- strip metadata
- keep optimized PNG when WebP would be larger
- reject SVG, GIF, executables, corrupt files, signature mismatches, and decompression-bomb dimensions

### Image delivery

Do not carry Rose City’s custom Supabase image loader into Onzio.

No platform page may request:

```text
/storage/v1/render/image/
```

Use the default Next/Vercel loader for:

- hero photography
- slideshows
- roster portraits
- shop photography
- About-page photography

Use `unoptimized` for:

- club logos
- flags
- sponsor logos
- opponent crests
- other small graphics

Initial Next image configuration:

```ts
deviceSizes: [640, 828, 1080, 1440, 1920]
imageSizes: [32, 48, 64, 96, 128, 256, 384]
qualities: [70, 80]
minimumCacheTTL: 2678400
```

Restrict `remotePatterns` to the exact Onzio Supabase host and:

```text
/storage/v1/object/public/onzio-media/**
```

Monitor:

- Vercel transformations
- image cache reads and writes
- Supabase storage and cached egress
- asset count and bytes per club
- failed processing
- abandoned staging objects

Create spend notifications at 50%, 80%, and 100% of the monthly image budget.

If runtime optimization becomes expensive, generate responsive variants during upload. Do not return to Supabase runtime transformations.

## Provisioning, Archival, and Purge

### Provisioning

Operator tooling creates atomically:

- club
- verified primary domain
- owner membership
- onboarding lifecycle
- preview access

An existing Auth user may be added to another club without duplicating the user.

Slug, domain, membership, or Auth failure rolls back the entire operation.

### Archival

Archival:

- detaches public routing
- rejects sessions and writes
- preserves database records and media
- stops or cancels billing according to the offboarding workflow
- records an audit event

Reactivation restores the same club identity and content but requires valid billing before public launch.

### Hard purge

Hard purge is not available through normal application routes.

It requires:

- an export
- explicit operator invocation
- exact typed club confirmation
- ordered deletion
- a final audit record outside the purged tenant data

## Delivery Phases

### Phase 0 — Red contract baseline

The tests-only harness in this repository defines the platform contract before implementation.

Current required gates:

- TypeScript test harness passes
- contract suites fail for missing modules
- architecture suites fail for missing platform configuration
- database suites fail for missing local migrations/schema
- no skipped, todo, or focused tests
- no application implementation exists yet

### Phase 1 — Bootstrap and threat model

- Copy Rose City source without `.git`, dependencies, or build artifacts.
- Preserve the red contract suite.
- Inventory all tables, relationships, reads, writes, storage paths, routes, and public/private fields.
- Read-only introspect the current Rose City production schema.
- Create an access matrix for anonymous, admin, owner, operator, webhook, media processor, and migration actors.
- Initialize local Supabase and environment documentation.
- Verify the Rose City baseline still builds and its existing tests pass alongside the intentional red platform contracts.

### Phase 2 — Database security foundation

- Create `onzio` and `onzio_private`.
- Create core, content, billing, audit, and media schema.
- Add explicit grants and RLS.
- Add composite tenant constraints.
- Add storage buckets and policies.
- Add audit triggers.
- Seed Alpha and Bravo tenants with owners, admins, tiers, lifecycle states, and media fixtures.
- Generate TypeScript types.

Gate:

- schema and database contract tests become green
- cross-club RLS/storage tests become green
- application contracts remain red

### Phase 3 — Atomic tenant conversion

- Add hostname normalization and domain resolution.
- Add tenant-specific internal routing.
- Add `ClubContext`.
- Add feature/lifecycle helpers.
- Convert all reads to explicit tenant scope.
- Convert all admin writes to validated server mutation boundaries.
- Convert storage references to media assets.
- Switch Supabase clients to `onzio` only after all reads and writes are tenant-aware.

Gate:

- tenant, cache, authorization, and feature contracts become green
- two local clubs show isolated content

### Phase 4 — Secure media pipeline

- Implement staging uploads and signed authorizations.
- Implement validation and Sharp normalization.
- Implement `media_assets`.
- Replace Supabase transformation URLs.
- Configure selective Vercel optimization.
- Add retry, replacement, and cleanup behavior.
- Add usage monitoring.

Gate:

- media contracts become green
- static scan finds no Supabase transformation URL
- large photographs are responsive
- small graphics remain unoptimized

### Phase 5 — Authentication and operator workflows

- Add email/password setup.
- Add mandatory MFA.
- Add role and lifecycle enforcement.
- Add operator provisioning.
- Add archive/reactivate/purge tooling.
- Add MFA recovery audit flow.

Gate:

- auth, membership, provisioning, and archival contracts become green

### Phase 6 — Stripe billing

- Add allowlisted tier mapping.
- Add first-subscription Checkout.
- Add Customer Portal.
- Add idempotent tenant-aware webhook.
- Add subscription/runtime projection.
- Add preview, live, grace, and suspended behavior.

Gate:

- Stripe and subscription contracts become green
- duplicate, stale, foreign, mismatched, and obsolete events are rejected

### Phase 7 — Staging gate

Deploy a protected Vercel staging environment against:

- Supabase Free staging project
- Stripe test mode
- synthetic clubs only

Exercise:

- domains and cache isolation
- password setup and MFA
- role enforcement
- uploads and image processing
- Checkout and Portal
- webhook retry/order behavior
- tier changes
- suspension
- archive/reactivation
- rollback

Production migrations cannot run until staging passes.

### Phase 8 — Rose City migration

Before migration, tell the Rose City admin to stop all website updates and record the freeze time.

Then:

1. Back up/export database rows, Auth mapping, and storage inventory.
2. Import existing media through an offline processor without Supabase Image Transformations.
3. Normalize large photographs and preserve suitable transparent graphics.
4. Generate versioned paths and media asset records.
5. Transform and import tenant-scoped data.
6. Validate relationships, counts, checksums, and representative renders.
7. Validate Rose City privately on the platform.
8. Reconcile the existing Stripe subscription.
9. Switch the domain and webhook.
10. Run public, admin, media, and billing smoke tests.

Keep the legacy deployment and database unchanged and read-only through the rollback window.

If acceptance fails, restore domain routing while admin writes remain frozen.

### Phase 9 — New club rollout

- Provision through audited operator tooling.
- Keep each tenant in authenticated preview.
- Verify owner access and MFA.
- Verify content and media.
- Confirm subscription state.
- Attach and verify domains.
- Launch publicly only after all gates pass.

## Verification and Acceptance

### Required security scenarios

- Alpha cannot read private Bravo data.
- Alpha cannot insert, update, delete, upload, or reference Bravo records.
- Composite foreign keys reject cross-club relationships.
- Forged club IDs, hosts, origins, headers, paths, and return URLs fail closed.
- Anonymous users see only live tier-enabled content.
- Preview, suspended, and archived clubs do not render publicly.
- AAL1 sessions cannot access admin.
- Removed users lose access.
- Admins cannot access billing.
- Starter users cannot mutate Pro-only features.
- Direct Supabase requests remain constrained by RLS and database constraints.
- Audit records are immutable and contain no secrets.

### Required Stripe scenarios

- valid first Checkout
- existing customer Portal flow
- plan upgrade and downgrade
- cancel at period end
- `past_due` retry period
- seven-day grace
- terminal suspension
- duplicate webhook
- stale/out-of-order webhook
- environment mismatch
- customer mismatch
- unknown price
- obsolete subscription deletion
- transaction rollback
- Rose City subscription reconciliation without changing its subscription ID

### Required media scenarios

- valid JPEG, PNG, and WebP
- transparent graphics
- portrait, landscape, square, and small images
- exact size/dimension boundaries
- MIME spoofing
- SVG/script input
- corrupt/truncated media
- oversized upload
- decompression-bomb dimensions
- cross-club path
- missing entitlement
- archived club upload
- failed database finalization
- idempotent retry
- replacement cleanup failure
- abandoned staging cleanup
- no Supabase Image Transformation URLs
- Vercel optimization only for large photos

### Required migration scenarios

- source/destination row-count reconciliation
- tenant relationship integrity
- storage object count and checksum reconciliation
- representative visual comparison
- idempotent import
- missing media failure
- duplicate record failure
- corrupt media failure
- relationship mismatch failure
- rollback readiness

### CI

CI ultimately runs:

```text
supabase start
supabase db reset
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The platform is accepted when:

- every contract, database, architecture, and legacy regression test is green
- two synthetic clubs remain isolated end to end
- staging passes all security and billing flows
- Rose City serves successfully from Onzio with its data, media, admins, domain, and existing subscription intact
