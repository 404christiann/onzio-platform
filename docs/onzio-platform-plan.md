# Onzio Platform — Secure Multi-Tenant Architecture

## Summary

Onzio will be a multi-tenant club website platform serving an expected 5–10 clubs in the first 12 months.

The platform uses:

- one shared Next.js codebase and Vercel deployment
- a dedicated Supabase Pro production project
- a separate Supabase Free staging project with synthetic data
- the existing Stripe account with tenant-aware metadata and webhooks
- passwordless email-code authentication for club owners and admins
- mandatory TOTP/AAL2 for operators only
- operator-only club provisioning and owner transfer; owners may manage admins
- immediate club-content publishing, with operator-managed draft/publish
  versions for presentation configuration only
- private preview access until a subscription becomes active
- a twenty-day public-site grace period measured from paid-through time
- indefinite archival for returning clubs
- Supabase Storage without Supabase Image Transformations
- normalized immutable images served directly without runtime optimization

Rose City is the first production tenant. Its existing Stripe subscription was
migrated in place.

## Locked Decisions

- **Production database:** dedicated Supabase Pro project, separate from Rose City
- **Staging database:** separate Supabase Free project
- **Hosting:** one Vercel project and deployment serving every tenant domain
- **Billing:** existing Stripe account, one subscription per club
- **Club registrations:** tier-free native forms and waivers for every club; direct
  Stripe Connect charges on club-owned accounts with no Onzio application fee
- **Rose City:** full tenant migration, including data, storage, admins, domain, and billing
- **Authentication:** passwordless email codes for owners/admins; operator TOTP
- **Authentication email:** Supabase Auth through Resend SMTP from one
  Onzio-owned authentication subdomain
- **Membership:** managed only by an Onzio operator in v1
- **Publishing:** club-content saves become publicly visible immediately;
  presentation configuration uses operator-only draft/publish versions
- **Billing self-service:** owners use Stripe Customer Portal
- **Pre-payment behavior:** authenticated preview only
- **Payment lapse:** twenty-day public grace measured from paid-through time
- **Offboarding:** archive indefinitely; hard purge is a separate operator procedure
- **Media:** public assets may remain cached after archival
- **Image processing:** never use Supabase runtime Image Transformations
- **Video:** tenant video is delivered through Bunny.net Stream, a
  third-party video CDN; never transcoded in-house on Vercel or Supabase
- **Non-goals:** no self-service signup, AWS, club-content drafts, dual-write
  migration, or immediate hard deletion

## Core Architecture

### Tenant model

Create the following core tables in the `onzio` schema:

#### `clubs`

- `id uuid primary key`
- `slug text unique not null`
- `name text not null`
- `lifecycle onboarding|active|archived`
- `public_access preview|live|grace|suspended`
- `kind customer|demo|test`; only `customer` requires paid access
- `stripe_price_id` as operator-approved per-club Checkout intent
- dormant `tier starter|pro` rollback metadata, never authorization
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

Owners can manage content and billing and may add or remove admin memberships
through the governed tenant-bound server route. Admins can manage content only;
ownership transfer remains operator-only.

#### `club_subscriptions`

- primary key `club_id`
- unique Stripe customer and subscription IDs
- Stripe-reported price ID (billing fact)
- dormant tier rollback metadata
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

#### Homepage content singletons

Editable homepage content is tenant-scoped and immediately published in v1.
The first section uses `homepage_hero_content` keyed by `club_id` for
headline, intro, and CTA copy. It follows the same public-read and fresh
club-session admin-mutation rules as slideshow and other homepage tables.

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

Do not apply a blanket policy to all content. Define policies per table,
operation, role, lifecycle, and club access state.

### Tier-free content authorization

`PLAT-102` resolves `PF-002` by deleting
`onzio_private.club_has_feature`. Existing policies retain their feature
parameter as a future re-tiering seam, but the wrappers deliberately ignore it:

```sql
can_read_feature(club_id, feature)   -> can_read_club(club_id)
can_mutate_feature(club_id, feature) -> can_mutate_content(club_id)
```

`ADMIN_TABLE_FEATURES` remains a table-to-domain validation map, not a pricing
gate. Presentation `moduleRegistry.entitlement` values are descriptive legacy
metadata only. `clubs.tier` and `club_subscriptions.tier` remain dormant for
rollback and drive no runtime or RLS decision. New content domains must still
be registered at the server mutation boundary and protected by tenant,
membership, lifecycle, and runtime-access checks.

### Public reads

Anonymous users may read only:

- explicitly public content tables
- rows belonging to a publicly accessible club
- rows belonging to a live or grace-accessible club

Anonymous users may never read:

- club memberships
- subscriptions or Stripe event records
- audit records
- staging uploads
- operational or migration records
- onboarding, suspended, or archived tenant content

Published club content is intentionally public and may be enumerated across
live clubs. Private or draft club content is outside v1. Operator-managed
presentation drafts are a separate protected configuration boundary described
in `docs/phase-9/presentation-system-plan.md`; anonymous reads may resolve only
the current published presentation document.

### Authenticated reads and writes

Content mutations require:

- an authenticated user
- a club session within the 30-day application/RLS freshness window
- active membership for the row’s club
- onboarding access, or an active club lifecycle
- live or grace projected access for customer clubs; demo and test clubs do not
  bill

Owners receive billing access. Admins do not.

No authenticated policy permits writes to `club_members`, `stripe_events`, or operator-only lifecycle actions.

RLS remains authoritative even though the application routes mutations through Server Actions or route handlers. Direct Supabase API requests must be constrained by the same tenant, lifecycle, role, session-freshness, and customer paid-access rules.

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

Authentication, Checkout, Portal, and callback URLs derive from the verified primary domain—not directly from a request-provided origin.

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
  kind: "customer" | "demo" | "test";
  stripePriceId: string | null;
  tier: "starter" | "pro";
  role: "owner" | "admin" | null;
};
```

Admin mutation payloads never contain an authoritative `club_id`. The server derives tenant identity from the verified host and session.

## Authentication and Authorization

- Use Supabase passwordless email-code authentication for club accounts.
- Disable self-service signup; sign-in uses `shouldCreateUser: false` and maps
  unknown addresses to the governed explicit support message.
- Bound club sessions to 30 days from the earliest valid JWT `amr` timestamp in
  both application authorization and RLS.
- Require verified TOTP/AAL2 for operator actions, and reject operator TOTP
  assertions older than two hours.
- Provision owners through operator tooling; owners may add or remove `admin`
  memberships through the tenant-bound server route.
- Re-check membership, tenant lifecycle, role, and session age on every
  protected server action.
- Derive the user’s role for the current club only; do not reuse a role from another membership.
- Removed memberships lose access immediately.
- Archived clubs reject existing admin sessions and writes.

Operator TOTP recovery is the approval-gated break-glass procedure in
`docs/phase-12/OPERATOR-TOTP-RECOVERY.md`: manually verify operator identity,
revoke active sessions, replace only the authorized factor, prove fresh AAL2,
and write an append-only audit event. There is no self-service operator
recovery, signup, or owner-transfer UI in v1.

### Transactional authentication email

Supabase Auth sends email codes, invitations, secure email-change, and other
authentication messages through Resend SMTP. The built-in Supabase email
provider is development-only and must not be used for production delivery.

The shared production sender is:

```text
Onzio Accounts <no-reply@auth.onziofutbol.com>
```

`auth.onziofutbol.com` is an Onzio-owned sending subdomain, not a club website
domain. Christian confirmed that he owns `onziofutbol.com` and does not own
`onzio.com`. Configure SPF, DKIM, and DMARC for the owned subdomain without
changing a club's DNS or mail service. Production and staging use separate
scoped Resend credentials and distinct sender addresses on the same verified
subdomain. Secrets live only in the corresponding Supabase Auth SMTP
configuration and never in client code, Git, logs, or chat transcripts.

Every club keeps its own verified website domain. Club sign-in is a six-digit
code flow with the code first in the subject and no magic-link button. The
shared sender does not weaken tenant resolution or permit a caller-provided
redirect.

Initial templates are concise, security-only, and Onzio-branded. They do not
contain marketing content, user-supplied HTML, or an unverified club identity.
Users may belong to multiple clubs, so tenant-specific sender domains or
template branding are not inferred from Auth user metadata. If per-club email
branding becomes a product requirement, implement it later through a
server-controlled Supabase Send Email Auth Hook using verified tenant data.

Keep authentication and marketing delivery separate. Do not use the Auth
sending subdomain for newsletters, match alerts, promotions, or fan email.

Custom SMTP begins at Supabase's default 30-email-per-hour project limit.
Retain the per-user email-code cooldown and return a friendly retry
message for HTTP 429 responses. Do not raise the project-wide limit until
delivery, bounce, complaint, abuse, and onboarding-burst evidence justifies it;
add CAPTCHA before materially increasing the public recovery allowance.

The detailed rollout, verification, cost, approval, and rollback gates are in
`docs/phase-8/resend-smtp-rollout.md`.

## Server Mutation Boundary

Admin pages use validated Server Actions or route handlers.

For every mutation:

1. Resolve the verified tenant.
2. Authenticate the user.
3. Require a fresh club session, or fresh operator TOTP/AAL2 for an operator
   action.
4. Verify active membership and required role.
5. Verify club lifecycle.
6. Verify the club's runtime content access.
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
- native registration submission, status, Connect projection, and expiry
  boundaries
- migration tooling
- media finalization

It must be marked server-only and must not become the general query client.

## Stripe Billing

Stripe is the billing source of truth; Supabase stores a local projection for fast authorization and rendering.

### Checkout and Portal

- Checkout creates only the first subscription.
- Existing subscribers are sent to Customer Portal.
- Owners may update payment methods and view invoices.
- Admins cannot access billing.
- Checkout reads only the resolved customer club's `clubs.stripe_price_id`.
- Portal cancellation and subscription changes are disabled.
- Client-provided Price IDs and legacy tiers are never accepted.

Attach the following metadata to Customers, Checkout Sessions, and Subscriptions:

```text
onzio_club_id
onzio_environment
```

### Configuration validation and verification

- `ONZIO_ENVIRONMENT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `STRIPE_PORTAL_CONFIGURATION_ID` are unconditionally required. Every Stripe
  route validates the full set up front through the shared
  `getStripeRuntimeConfig()` and surfaces a fault-specific error code, so a
  bad deploy fails fast and loud on the first Stripe request, not weeks later
  on the one route that needs the missing piece.
- No route may read a required Stripe variable outside the shared runtime
  config. A variable only one route validates can go live unset — checkout
  and the webhook succeed, and the gap surfaces as a customer-facing error
  (production, August 2026: `STRIPE_PORTAL_CONFIGURATION_ID` was set in
  Preview but never mirrored to Production).
- After any Stripe environment-variable change in any Vercel environment, and
  after any Stripe Billing Portal configuration change, run
  `npm run stripe:verify-portal-config` with that environment's variables
  exported. It is read-only: it confirms against the live Stripe API that the
  configured Portal configuration exists, is active, matches the environment's
  mode, and carries the approved capabilities — faults an env-var presence
  check cannot catch.

### Webhook processing

- Verify Stripe signatures against the raw request body.
- Subscribe only to required event types.
- Record each event ID before applying state.
- Reject duplicate and stale events.
- Reject events for another environment.
- Record the canonical Stripe-reported Price even when it differs from intent;
  reconciliation reports the divergence without rejecting the webhook.
- Verify the Stripe customer and subscription belong to the resolved club.
- Retrieve canonical Stripe state for create, update, and invoice events.
- Ignore deletion of an obsolete subscription after a replacement exists.
- Update subscription state, runtime access, and event ledger transactionally.

One club may not have multiple active subscriptions.

### Access behavior

- No subscription: private preview only
- `active`: public site live; `trialing` is unsupported and rejected
- first `past_due`: store `grace_ends_at = paid_through + 20 days`
- after paid-through and before grace ends: public grace, with content editing
  still available to active club members
- terminal status after grace: public suspended
- archived club: suspended regardless of billing

The daily lifecycle cron emits idempotent day-7/day-17 warning audits, keeps
reconciliation independently flag-controlled, and moves only overdue customer
clubs to suspended after day 20. Demo and test clubs never require a
subscription. A heartbeat reports clean/failure runs and detects silence.

### Rose City subscription

Rose City’s existing Stripe customer and subscription remain intact. Rose City
is `kind = 'demo'`, so billing does not gate its content. Its existing Price is
recorded as a Stripe fact without becoming a global Checkout allowlist.

During migration:

1. Create Rose City as an Onzio club.
2. Attach its Onzio club/environment metadata to the existing Stripe objects.
3. Reconcile the subscription into `club_subscriptions`.
4. Verify the platform webhook reflects the same subscription ID.
5. Disable the legacy webhook only after platform verification.

No refund or new Checkout is required.

## Native Club Registrations and Direct Payments

Native registration intake supersedes the earlier external-link-only boundary
and is available to every club without a tier gate. Forms are tenant-owned and may run
independently, with typed core/custom fields, one or more USD price options,
an admin-editable required waiver, and an explicit participant mode:
`minor_only`, `adult_only`, or `both`. A `both` form begins with a required
minor/adult choice and renders only the matching core/scoped fields. The
resolved `minor|adult` participant type is stored on each registration so
notifications and exports remain correct if the draft definition later
changes. One waiver acceptance applies to either branch, and a combined CSV
keeps both branch columns with non-applicable values blank.

Programs and tryouts may opt into one native form through a nullable
`registration_form_id`. The relationship is tenant-safe at the database
boundary through composite `(club_id, registration_form_id)` foreign keys.
Public queries resolve only linked forms whose status is `open`; that native
form opens in `RegistrationCtaButton` and takes CTA precedence. A missing
reference, or one whose form is draft or closed, preserves the existing
program external CTA and tryout external-link/mailto behavior exactly. This is
an explicit per-entry opt-in: adding the capability does not change any club's
site, and form status never gets inferred from the program or tryout status.

The registration security model is:

- anonymous visitors may read only open definitions for publicly accessible
  clubs
- submitted answers, contact details, payment references, and delivery state
  have no anonymous access
- owners and admins with a fresh passwordless AAL1 club session may manage
  their own club's definitions, manage its Connect account, and read its
  registrant records; no club-facing MFA step-up is required
- all submission/payment-state writes are server-mediated and terminate in
  database constraints or service-role-only private functions
- tenant identity, price, amount, fields, waiver, connected account, lifecycle,
  and form status are resolved from server/database state, never trusted from
  the browser
- status polling uses a random opaque token whose SHA-256 hash is stored; the
  response exposes only `pending|paid|refunded|expired`

Each club connects a club-owned Stripe account. Registration Checkout Sessions
are direct charges created on that connected account with dynamic `price_data`,
USD currency, dynamic payment methods, and no `application_fee_amount`,
destination, or transfer. Onzio subscription billing remains a separate Stripe
integration and ledger concern.

The Connect webhook has its own route and signing secret. It retrieves canonical
connected-account objects, verifies account/club/environment/session/form/
registration/amount metadata, and atomically projects
`checkout.session.completed`, `charge.refunded`, and `account.updated` through
the existing immutable `stripe_events` ledger. Browser redirects never mark a
paid registration. A pending row exists before Checkout; $0 registrations are
completed server-side without Stripe. Query-time expiration excludes pending
rows after 24 hours even if the cleanup cron has not run.

The current review implementation is deliberately limited to local Supabase and
Stripe test mode. When a Resend API key and verified sender are configured, the
registrant receives confirmation at the submitted address and active club owners
receive a separate notification at addresses resolved live from club membership
and Supabase Auth. Email acceptance or failure is recorded independently and
never changes paid registration state. Enabling production Connect accounts,
deployment, or club-specific CTA placement requires separate review and approval.

That separate live-mode review happened 2026-08-26/27 and its plan was
executed: the three deliberate test-mode-only gates were lifted, a
backward-compatible migration re-scoped the registration RPCs to
`test`/`production`, a live Connect webhook was registered, and the code was
deployed via the narrow cherry-pick branch `hotfix/registration-live-mode-prod`
(see `HANDOFF.md`). However, the first live "Connect to Stripe" click then
failed on a prerequisite outside this repo entirely: Stripe's one-time
**platform Connect profile questionnaire**
(<https://dashboard.stripe.com/connect/settings/profile>), which live
`accounts.create()` requires and test mode never enforces. As of 2026-08-26
that questionnaire is **pending Christian's completion** — it is NOT yet
confirmed done, and live Connect onboarding remains blocked (no code change
needed) until it is. Track and update its status in
`docs/stripe-live-go-live-checklist.md` ("Platform state record"), which now
also carries the permanent first-time-live Stripe checklist this gap
motivated.

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

1. A fresh club-admin session requests upload authorization.
2. Server verifies membership, lifecycle, runtime content access, surface,
   type, and claimed size.
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

Serve every normalized photograph and graphic directly from its immutable
source URL. Set Next image delivery to `unoptimized: true` globally so a
runtime optimizer quota or service outage cannot remove imagery from the site.
The exact Supabase origin allowlist remains enforced.

Every critical public and admin image surface must replace origin failures with
an intentional, layout-preserving fallback:

- player and staff photography uses initials
- shop, About, slideshow, and trophy photography uses a branded unavailable
  panel
- logos and crests use a neutral mark or monogram
- purely decorative images may hide without collapsing surrounding layout

Normal-health monitoring treats any unexpected fallback as a failure. Separate
source-failure tests require those fallbacks and prohibit broken-image chrome.

Initial Next image configuration:

```ts
unoptimized: true
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

- Supabase storage and cached egress
- asset count and bytes per club
- failed processing
- abandoned staging objects
- unexpected public fallbacks and failed image requests

If direct-delivery bandwidth or page weight becomes expensive, generate
responsive variants during upload. Do not return to Supabase runtime
transformations or make a runtime optimizer a rendering dependency.

## Video Pipeline

Accepted 2026-07-31 (`DCFC-D105`) as part of the Diverse City FC epic. Video
is a distinct capability from the photograph/graphic pipeline above and does
not reuse it.

### Decision

- Tenant video (hero background clips, story/reel sections, and similar) is
  delivered through a third-party video CDN, **Bunny.net Stream**, not
  transcoded or streamed in-house.
- Onzio never runs video encoding inside Vercel serverless functions.
  Encoding video is CPU/memory/time-intensive in a way that does not fit the
  serverless request/response model — the same class of constraint that
  previously required moving Sharp/libvips-dependent work out of
  request-serving code paths for images, except heavier. Vercel and Supabase
  Storage bandwidth pricing is also uncompetitive against a purpose-built
  video CDN once video is a real workload (Supabase Storage egress is
  $0.09/GB uncached; Vercel Blob transfer is $0.05/GB; Bunny.net Stream
  bandwidth is $0.01/GB with free standard H.264 encoding), so self-hosting
  raw video files through the existing image-style pipeline is rejected on
  both engineering-fit and cost grounds, not preference alone.
- This does **not** extend or replace the existing `behind_the_rose_section`
  YouTube-embed pattern (`lib/homepage-content.ts`'s
  `normalizeYouTubeEmbedUrl()`), which remains valid for tenants that prefer
  a standard YouTube player embed for a documentary-style content section.
  Bunny.net Stream is for tenants that need a true full-bleed, autoplaying,
  branded background video, which an iframe embed cannot do cleanly.
- Rose City's existing homepage hero video is a hardcoded,
  `club.slug === "rose-city"` legacy special case in `components/Hero.tsx`
  (a raw Supabase Storage URL baked into the component), not a reusable
  capability. This pipeline does not retrofit Rose City; migrating Rose
  City's hero onto the new capability is a separate, explicitly
  future decision, not authorized by this amendment.

### Upload and delivery flow (high level; exact limits are Phase 2 detail)

1. A fresh club-admin session requests upload authorization for a video field,
   using the same membership/lifecycle/runtime-access/surface checks as the
   photograph flow.
2. The browser or server uploads the source file to Bunny.net Stream via its
   API (not through Supabase Storage staging).
3. Bunny.net Stream performs standard H.264 encoding (free tier) and
   generates a poster/thumbnail.
4. Onzio stores the returned video identifier/playback URL and poster
   reference on the owning content row (e.g. a `video_asset_ref`-style
   column), not in `onzio.media_assets` — Bunny-hosted video is a distinct
   reference type from Supabase-hosted `media_assets` rows and must not be
   conflated with the image pipeline's tenant-safe composite foreign keys.
5. Public pages request video directly from Bunny.net's delivery URL;
   Vercel/Next.js never proxies or transforms video.
6. Replacing a club's video re-runs the same flow and updates the reference;
   old Bunny.net assets are deleted analogous to the image pipeline's
   replacement-then-cleanup order (update the reference first, then remove
   the old asset).

### Explicitly deferred to `DCFC-201`/`DCFC-202`

- Accepted file formats, maximum file size, maximum duration, and dimension
  limits (the video-equivalent of the photograph pipeline's 15MB/6000px
  rules).
- Whether poster images are club-uploaded or Bunny-auto-extracted by
  default.
- Whether Bunny.net API credentials are a single Onzio-wide account (billing
  consolidated at the operator level) or provisioned per-tenant — default
  to a single Onzio-wide account unless a concrete reason emerges to
  isolate per tenant, consistent with the platform's one-shared-deployment
  posture elsewhere.
- Monitoring: whether video delivery failures get the same deliberate
  layout-preserving fallback treatment already required for images.

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
- Configure direct delivery of normalized immutable images.
- Add retry, replacement, and cleanup behavior.
- Add usage monitoring.

Gate:

- media contracts become green
- static scan finds no Supabase transformation URL
- every image bypasses runtime optimization
- large photographs remain bounded by upload normalization
- source failures render deliberate fallbacks without broken-image chrome

### Phase 5 — Authentication and operator workflows

- Add passwordless club email-code sign-in.
- Add mandatory operator TOTP/AAL2.
- Add role and lifecycle enforcement.
- Add operator provisioning.
- Add archive/reactivate/purge tooling.
- Document and rehearse the manual operator TOTP break-glass recovery and audit
  evidence path; do not expose self-service operator recovery.

Gate:

- auth, membership, provisioning, and archival contracts become green

### Phase 6 — Stripe billing

> Historical delivery record. `PLAT-102` supersedes the tier mapping and
> seven-day lifecycle design while retaining the secure webhook foundation.

- Add allowlisted tier mapping.
- Add first-subscription Checkout.
- Add Customer Portal.
- Add idempotent tenant-aware webhook.
- Add subscription/runtime projection.
- Add preview, live, grace, and suspended behavior.

Gate:

- Stripe and subscription contracts become green
- duplicate, stale, foreign, mismatched, and obsolete events are rejected

### Registration feature track — native forms and club payments

- Add tenant-scoped form, field, price, Connect, and submission records.
- Add Standard Account Links onboarding and direct connected-account Checkout
  in Stripe test mode with zero platform fee.
- Add separate Connect webhook projection, passive refund state, real recipient
  email outcomes, expiration cleanup, admin management/CSV, and public modal/status
  polling.
- Keep Rose City and Diverse City wiring outside the generic feature change.

Gate:

- local database, contract, architecture, unit, and build checks are green
- no production/live key, hosted Supabase, deployment, domain, or tenant-specific
  mutation is performed
- manual review approves the generic workflow before club-specific wiring

### Phase 7 — Staging gate

Deploy a protected Vercel staging environment against:

- Supabase Free staging project
- Stripe test mode
- synthetic clubs only

Exercise:

- domains and cache isolation
- club email-code sign-in and operator TOTP
- role enforcement
- uploads and image processing
- Checkout and Portal
- webhook retry/order behavior
- per-club Price intent and customer/demo/test behavior
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

### Phase 8 closeout — production authentication email

- Verify `auth.onziofutbol.com` in Resend with isolated SPF, DKIM, and DMARC
  records.
- Create separate least-privilege staging and production SMTP credentials.
- Configure and verify staging Supabase Auth SMTP first.
- Configure production Supabase Auth SMTP only after staging invitation,
  recovery, callback, password, and MFA acceptance passes.
- Verify Rose City owner recovery from an address outside the Supabase
  organization team.
- Keep the initial Supabase custom-SMTP rate limit at 30 emails per hour and
  verify friendly cooldown/rate-limit behavior.
- Record delivery evidence without recording links, tokens, SMTP credentials,
  or full message bodies.

Gate:

- Auth email reaches non-team recipients through Resend
- invitation and recovery links return to the verified tenant domain
- expired, reused, forged, and cross-tenant redirects fail closed
- club sign-in succeeds by code without a password; operator actions still
  require fresh TOTP/AAL2
- bounce/complaint visibility and an SMTP rollback procedure are verified

### Phase 9 — Versioned presentation system

Implement the approved presentation architecture in
`docs/phase-9/presentation-system-plan.md`.

- Make `onzio-platform` the source of truth for the shared presentation
  package, schema, registries, readiness evaluator, and operator builder.
- Extract Rose City with visual parity as neutral template `cinematic@1`.
- Extract the approved Deportivo visual system as neutral template
  `heritage@1`.
- Store immutable presentation documents with draft and published pointers
  while keeping club content in normalized tables.
- Use semantic theme tokens and curated font packs.
- Allow operators to compose registered sections and navigation.
- Keep Stripe entitlement, enabled modules, section placement, and content
  readiness distinct.
- Enforce provenance and prohibit placeholders/sample content in production.

Gate:

- both templates pass approved desktop/mobile visual parity
- draft, preview, publish, rollback, template switching, RLS, and tenant
  isolation pass
- New tenants render entirely through published presentation-template
  resolution, with no tenant-identity branches. `clubhouse@1` (Lions) is the
  worked precedent: it resolves via
  `club.presentationTemplateKey === "clubhouse@1"`, never a club slug.
- Rose City continues rendering and operating correctly, but **retains six
  documented legacy `club.slug === "rose-city"` branches** that predate the
  presentation system and have not been extracted. This is the honest
  achieved scope of Phase 9, corrected on 2026-08-01 — the gate previously
  claimed Rose City had no tenant-specific presentation special cases, which
  was not true. The remaining branches are enumerated with a per-branch
  extractability assessment in `docs/platform-findings.md` (`PF-001`).
  Extracting them is deliberately deferred: one is blocked on unbuilt video
  infrastructure (`PF-005`), one is a clean template extraction, and three
  require new normalized content domains. A seventh occurrence — the dead
  `ShopHero` branch in `app/(public)/shop/page.tsx`, unreachable because
  `SHOW_SHOP_HERO` is the constant `false` — was removed on 2026-08-01
  rather than documented, since it rendered for no club at all.

  This gate does **not** license adding new slug branches. Rose City's are
  a documented legacy debt with a named register entry; new tenants,
  including Diverse City, must define a neutral reusable template or
  registered template capability instead.

### Phase 10 — Prospect automation

- Normalize intake and record explicit provenance.
- Recommend a template with reasons and allow operator override.
- Generate a self-contained, pinned, Pro-first sales artifact.
- Begin with the Starter/Pro selector expanded and keep both query states
  shareable.
- Use only operator-approved placeholders and label them as sample.
- Produce a desktop/mobile validation and review package.
- Never publish an artifact or import production data without explicit
  operator approval.
- Reject sample, unresolved, or placeholder-backed production imports.

Gate:

- generated artifacts remain sample-only and isolated from production
- Starter and Pro pass in both directions on desktop and mobile
- provenance and publication approval are machine-enforced

### Phase 11 — New club rollout

- Provision through audited operator tooling.
- Keep each tenant in authenticated preview.
- Verify owner email-code access and operator TOTP boundaries.
- Verify content, media, and the approved published presentation.
- Confirm subscription state and customer editing entitlements.
- Verify owner/admin email-code delivery through Resend.
- Attach and verify domains.
- Launch publicly only after all gates pass.

## Verification and Acceptance

### Required security scenarios

- Alpha cannot read private Bravo data.
- Alpha cannot insert, update, delete, upload, or reference Bravo records.
- Composite foreign keys reject cross-club relationships.
- Forged club IDs, hosts, origins, headers, paths, and return URLs fail closed.
- Anonymous users see only content for clubs whose projected public access is
  live or within the approved public grace window.
- Preview, suspended, and archived clubs do not render publicly.
- AAL1 club sessions may access only their tenant-scoped authorized admin
  surfaces; stale sessions and nonmembers fail closed.
- Removed users lose access.
- Auth email uses the Onzio authentication subdomain rather than a club or
  marketing sending domain.
- Email-code delivery reaches approved non-team recipients.
- Reused, expired, forged, and caller-supplied codes/redirects fail closed.
- Auth-email rate limits produce a safe retry response without revealing
  whether an arbitrary address exists.
- Admins cannot access billing.
- Active club members can mutate tenant-scoped content without tier gates;
  customer clubs may edit while projected access is live or grace, and lose
  mutation access only when suspended.
- Direct Supabase requests remain constrained by RLS and database constraints.
- Audit records are immutable and contain no secrets.

### Required Stripe scenarios

- valid first Checkout
- existing customer Portal flow
- client-supplied Price or tier input is rejected
- configured per-club Price intent is used for first Checkout
- cancel at period end
- `past_due` retry period
- twenty-day grace after paid access ends
- terminal suspension
- duplicate webhook
- stale/out-of-order webhook
- environment mismatch
- customer mismatch
- arbitrary canonical webhook Price is retained as Stripe fact while the
  configured club Price intent remains unchanged
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
- no request depends on `/_next/image`
- desktop and mobile browser checks cover every public image surface and
  require direct URLs with positive `naturalWidth`
- unexpected fallbacks fail normal-health checks
- simulated local and Supabase source failures render deliberate fallbacks
  without broken-image chrome

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
