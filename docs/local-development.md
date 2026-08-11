# Local Development and Environment Safety

## Prerequisites

- Node.js 20+
- npm
- Supabase CLI for database contract work
- Docker/Desktop runtime required by local Supabase

## Install and verify

```bash
npm install
npm run test:legacy
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm run test:db
npm test
npm run lint
npm run build
```

The platform suites intentionally fail for unimplemented phases. A red
contract must fail with `[RED CONTRACT]`, not with an import, configuration, or
test-harness error. `npm run test:legacy` must remain green.

## Application environment

Create `.env.local` with environment-specific values. Never copy Rose City's
production file into this repository.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ONZIO_OPERATOR_USER_IDS
ONZIO_ENVIRONMENT
ADMIN_ALLOWED_EMAILS
STRIPE_SECRET_KEY
STRIPE_PRICE_ID_STARTER
STRIPE_PRICE_ID_PRO
STRIPE_WEBHOOK_SECRET
FORCE_PUBLIC_SITE_ONLINE
```

Billing authorization comes from the verified tenant, the authenticated AAL2
session, and an active owner membership. Email allowlists are legacy
compatibility source and are not authoritative for Onzio billing.

`ONZIO_ENVIRONMENT=staging` requires Stripe test mode. Production requires
Stripe live mode. Configure distinct Starter and Pro recurring Price IDs for
each environment.

For local hostname routing, use `alpha.localhost:3000` or another verified
seeded subdomain. Bare `localhost` is rejected unless development explicitly
sets:

```text
ONZIO_LOCAL_TENANT_SLUG=alpha
```

Do not run authenticated CRUD, webhook, Checkout, Portal, seed, or migration
flows against hosted projects.

## Contract-test environment

Copy `.env.test.example` to `.env.test` and use local/test-mode values only.
The safety helper rejects:

- non-loopback Supabase URLs
- `sk_live_` Stripe keys
- webhook secrets containing a live marker

`npm run test:db` also sets `SUPABASE_LOCAL=1`.

## Local Supabase

```bash
supabase start
supabase db reset
```

When using Colima, optional analytics services can be omitted if its host
Docker socket cannot be mounted:

```bash
supabase start -x vector,logflare
```

The current `supabase/config.toml` exposes `public`, `onzio`, `storage`, and
`graphql_public` to the local test stack. Phase 2 migrations live under
`supabase/migrations`, and `supabase/seed.sql` creates only deterministic
Alpha/Bravo synthetic fixtures.

Copy the active local values from `supabase status -o env` into `.env.test`.
The database/Auth helpers currently require the JWT-shaped `ANON_KEY` and
`SERVICE_ROLE_KEY` values:

```text
SUPABASE_TEST_URL=http://127.0.0.1:54321
SUPABASE_TEST_ANON_KEY=<ANON_KEY>
SUPABASE_TEST_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

Do not substitute the newer `PUBLISHABLE_KEY`/`SECRET_KEY` values for these
test variables until the Auth helper is deliberately migrated.

Regenerate and verify committed database types with:

```bash
npm run db:types
npm run db:types:check
```

Never copy or execute the Rose City runbooks under `db/migrations` as Onzio
production migrations. They are legacy source evidence only.

## Lions fixture

The synthetic Starter-tier `lions` tenant (site template `editorial`) is a
two-step local setup:

```bash
npm run db:reset
eval "$(supabase status -o env 2>/dev/null)"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
node scripts/seed-lions-media.mjs
```

The reset applies migrations plus `supabase/seed.sql` (club, identity, roster,
staff, fixtures, story, social links). The media script then processes the
checked-in originals under `supabase/fixtures/lions-media` through the real
validation/normalization pipeline into the local `onzio-media` bucket and
wires `site_branding` and `homepage_slideshow_photos`. It refuses non-loopback
Supabase hosts and is idempotent. Browse the tenant at
`lions.localhost:3000`.

## Operator workflows

Operator provisioning, membership, lifecycle, export, purge, and MFA recovery
live only under `lib/operator`. They are not application routes. Runtime
invocations require the actor UUID in the comma-separated
`ONZIO_OPERATOR_USER_IDS` allowlist.

The local-only end-to-end smoke refuses non-loopback Supabase hosts:

```bash
eval "$(supabase status -o env 2>/dev/null)"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
npm run operator:smoke
```

Hard purge requires an archived club, a verified `club_exports` record, and
exact typed slug confirmation. It deletes storage and tenant rows in dependency
order while preserving immutable audit and Stripe ledgers outside the deleted
tenant. Do not run operator workflows against a hosted project during ordinary
development.

## Read-only Rose City introspection

The guarded script is:

```bash
node scripts/introspect-rose-city.mjs /path/to/rose-city/.env.local --compact
```

It accepts only the known Rose City Supabase hostname and performs `GET`/`HEAD`
requests. It must remain read-only. Do not add row export, mutation, Auth
management, SQL execution, or Storage object deletion to this script.
