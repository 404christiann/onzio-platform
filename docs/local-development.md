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
CRON_SECRET
LIFECYCLE_SUSPENSION_ENABLED
LIFECYCLE_RECONCILIATION_ENABLED
LIFECYCLE_CRON_HEARTBEAT_URL
RESEND_WEBHOOK_SECRET
RESEND_API_KEY
ONZIO_CONTACT_FROM
ONZIO_CONTACT_FALLBACK_TO
FORCE_PUBLIC_SITE_ONLINE
```

Billing authorization comes from the verified tenant, the authenticated AAL2
session, and an active owner membership. Email allowlists are legacy
compatibility source and are not authoritative for Onzio billing.

`ONZIO_ENVIRONMENT=staging` requires Stripe test mode. Production requires
Stripe live mode. PLAT-102 stores the operator-approved Checkout Price on each
customer club as `clubs.stripe_price_id`; no tier Price environment variables
are accepted. The Portal configuration must enable payment-method updates and
invoice history while disabling subscription cancellation and plan updates.
Lifecycle suspension and reconciliation flags must each be the exact string
`true` or `false`. `RESEND_WEBHOOK_SECRET` is needed only when the local
receiver is separately authorized and configured with Resend.
`RESEND_API_KEY` and `ONZIO_CONTACT_FROM` are needed only when the public
contact-form send (`/api/contact`) should actually deliver email:
`ONZIO_CONTACT_FROM` must be a Resend-verified sender address, and
`ONZIO_CONTACT_FALLBACK_TO` is the recipient used when a club has not set a
`contact_profile` email. With any of them unset, the route fails closed with
an explicit `CONTACT_SEND_NOT_CONFIGURED` error instead of pretending to
send.

For local hostname routing, use `alpha.localhost:3000` or another verified
seeded subdomain. Bare `localhost` is rejected unless development explicitly
sets:

```text
ONZIO_LOCAL_TENANT_SLUG=alpha
```

Do not run authenticated CRUD, webhook, Checkout, Portal, seed, or migration
flows against hosted projects.

## Logging in locally as a club owner or admin

Local login uses the same passwordless email-code flow as the product. The
account must already exist as a confirmed local Auth user with an active
`club_members` row for the tenant (the local import scripts seed these with
service-role `auth.admin.createUser` + `email_confirm: true`; there is no
self-service signup).

1. Open `http://<slug>.localhost:3000/admin/login` on the tenant host.
2. Enter the seeded email and request a code.
3. Local Supabase delivers all Auth email to Mailpit at
   `http://127.0.0.1:54324`; the 6-digit code is the first token of the
   message subject.
4. Enter the code. The session cookie is host-scoped, so log in on the
   tenant host you intend to browse.

Preview tenants (`public_access = "preview"`) are anonymous-404 by design;
`/admin/login` still resolves through the `resolve_verified_tenant`
fallback, which requires the tenant's verified `club_domains` row for
`ONZIO_ENVIRONMENT` — every local seed/import creates one. After signing
in, the member session satisfies RLS and the public preview site renders on
the same host.

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
