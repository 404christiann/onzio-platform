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
