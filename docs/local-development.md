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
STRIPE_WEBHOOK_SECRET
STRIPE_PORTAL_CONFIGURATION_ID
STRIPE_CONNECT_WEBHOOK_SECRET
CRON_SECRET
LIFECYCLE_SUSPENSION_ENABLED
LIFECYCLE_RECONCILIATION_ENABLED
LIFECYCLE_CRON_HEARTBEAT_URL
RESEND_WEBHOOK_SECRET
RESEND_API_KEY
REGISTRATION_EMAIL_FROM
FORCE_PUBLIC_SITE_ONLINE
```

Billing authorization comes from the verified tenant, a fresh authenticated
club session, and an active owner membership. Email allowlists are legacy
compatibility source and are not authoritative for Onzio billing.

`ONZIO_ENVIRONMENT=staging` requires Stripe test mode. Production requires
Stripe live mode. PLAT-102 stores the operator-approved Checkout Price on each
customer club as `clubs.stripe_price_id`; no tier Price environment variables
are accepted. The Portal configuration must enable payment-method updates and
invoice history while disabling subscription cancellation and plan updates.
Lifecycle suspension and reconciliation flags must each be the exact string
`true` or `false`. `RESEND_WEBHOOK_SECRET` is needed only when the local
receiver is separately authorized and configured with Resend.

Native registration and Connect routes are deliberately test-only in this
review build. They require `ONZIO_ENVIRONMENT=staging`, a Stripe `sk_test_`
key, and a separate `STRIPE_CONNECT_WEBHOOK_SECRET`. Forward connected-account
events locally with:

```bash
stripe listen --forward-connect-to localhost:3000/api/stripe/connect-webhook
```

Registration form management, Connect account management, and registrant
record reads use the same fresh passwordless club session as other admin
content: an active owner or admin membership at AAL1 is sufficient. No
club-facing MFA step-up or Starter/Pro entitlement gate applies.

When `RESEND_API_KEY` is configured, registration confirmation sends are real:
the registrant address comes from the paid registration and active club-owner
addresses are resolved server-side from `onzio.club_members` and Supabase Auth.
Set `REGISTRATION_EMAIL_FROM` to a sender on a Resend-verified domain. Resend
acceptance/failure is persisted separately for registrant and owner delivery,
and notification failure never changes paid registration state. `CRON_SECRET`
authenticates both cleanup routes.

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

## Operator workflows

Operator provisioning, owner transfer, lifecycle, export, purge, and TOTP
recovery live only under `lib/operator`. Owner-managed `admin` membership uses
the tenant-bound `/api/admin/members` route and may not transfer ownership.
Operator runtime invocations require a verified bearer session whose subject is
in `ONZIO_OPERATOR_USER_IDS`, is AAL2, and has a TOTP AMR entry no older than
two hours. Scripts obtain that session interactively; never pass or log an
operator UUID as caller authority.

The local-only end-to-end smoke refuses non-loopback Supabase hosts:

```bash
eval "$(supabase status -o env 2>/dev/null)"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
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

## Rose City migration replay

Rose City migration planning, import, reset, and replay are local-only. The
historical `migration:import:rose-city:production` command is retained as an
explicit fail-closed tombstone after the accepted cutover; it has no
credential, Supabase client, SQL execution, or Storage mutation path.
