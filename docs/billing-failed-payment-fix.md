# Failed subscription payment correction

- **Package:** BILLING-FAILED-01
- **Status:** in_progress (local implementation/acceptance complete; live release pending)
- **Base:** current `origin/main`, `1938a7e`, in the attached
  `billing-failed-payment` worktree. Original dirty OTP checkout is preserved.

## Verified problem

Read-only production inspection on 2026-10-12 confirms Diverse City FC's
`invoice.payment_failed` event was applied. The stored subscription is
`past_due`, but `paid_through` was advanced to 2026-11-11 23:16:28 UTC and
`grace_ends_at` to 2026-12-01 23:16:28 UTC; the club remains projected `live`.
The portal interpreted any nonactive subscription with a future paid-through
as active, displaying a successful-looking renewal.

The webhook incorrectly treated Stripe's subscription billing-period end as
proof of payment. The database also retained the first grace deadline even
when canonical evidence corrected paid-through. The new local regression
reproduced that persistence failure before the migration and passes afterward.

## Implementation

- `lib/stripe-paid-through.ts`: read canonical paid recurring invoice-line
  periods for the subscription/customer/mode; ignore prorations and one-off
  items, paginate invoice history/lines, support current and legacy shapes.
  No previously inflated local paid-through is reused. Stripe read failures
  retry the webhook without applying or permanently rejecting the event.
  The maximum purchased coverage across paid invoices prevents a newly issued
  invoice for an older period from shortening service already paid for.
- `app/api/stripe/webhook/route.ts`, `lib/stripe-event-routing.ts`: project only
  verified paid coverage; grace always derives from that coverage plus 20 days.
  Canonical recovery wins over delayed failure events.
- `supabase/migrations/20261012184335_stripe_paid_invoice_projection.sql`:
  preserve transaction/ledger/authorization semantics while allowing canonical
  grace corrections. No tenant-row rewrite or signature change.
- `lib/stripe-subscription-state.ts`,
  `components/admin/payments/PaymentStatusCard.tsx`: show Payment failed with
  Resolve payment for past-due billing even with a future/unknown coverage date;
  existing grace card explains the outstanding invoice and payment action.
  Current-main admin design/icon exports are preserved.
- Regressions: `lib/__tests__/stripe-paid-through.test.ts`,
  `lib/__tests__/stripe-subscription-state.test.ts`,
  `tests/contracts/stripe-subscription.test.ts`,
  `tests/contracts/stripe-webhook-payment-coverage.test.ts`,
  `tests/contracts/payment-failed-card.test.ts`,
  `tests/database/stripe-billing.test.ts`.
- `vitest.config.ts`: compile JSX with React's automatic runtime for the actual
  rendered-card contract. No existing test assertion or boundary was weakened.

## Verification

- 43 focused pure/render/signed-webhook tests pass, including the final
  invoice-creation-order regression.
- 8 focused billing database tests pass, including the reproduced inflated
  grace deadline, correction, repeated failures, tenant and service-role gates.
- Complete contracts: 1,059 tests pass; architecture: 21 tests pass.
- Complete database suite: 311 tests pass using only isolated local Supabase.
- TypeScript passes; lint passes with no warnings/errors.
- Final complete suite: 1,813 tests across 192 files pass (26.86 seconds).
  One preceding final run hit `SESSION_EXPIRED` in the unchanged real local
  email-auth test. Its unchanged focused retry and the unchanged complete
  rerun pass; no auth code or assertion was changed.
- Final local-configured production build and post-build TypeScript pass;
  generated database types match local schema (RPC signature unchanged).
- Real local email-OTP browser login and six captures cover failed, grace and
  recovered states at 1440px/390px. All return200, with zero page errors or
  horizontal overflow. Past due never displays renewal; the existing grace
  banner warns throughout the portal. A simulated Portal500 displays the
  friendly inline error without navigation. This is UI/error-handling
  evidence; no live Stripe Portal/charge or native-device claim.
- The synthetic Alpha kind, subscription fields and public-access fixture
  were restored after browser verification; subscription readback is exact.
- Final logs: `/private/tmp/onzio-billing-full-final-rerun.log`,
  `/private/tmp/onzio-billing-build-final.log`,
  `/private/tmp/onzio-billing-tsc-final.log`,
  `/private/tmp/onzio-billing-db-types.log`;
  other suite logs: `/private/tmp/onzio-billing-{contracts,architecture,db,lint}.log`.
  Browser report: `/private/tmp/onzio-billing-browser-report.json`;
  screenshots: `/private/tmp/onzio-billing-{failed,grace,recovered}-{1440,390}.png`.

## Release boundary and exact next step

Christian explicitly approved deployment and correction of Diverse City's
record to match Stripe on 2026-10-12. Stripe connector access is now working.
Canonical live subscription/customer/environment metadata match the tenant.
All three invoices and their complete recurring line periods were read:
the latest $85 invoice is open/unpaid; the latest paid recurring coverage ends
2026-10-11 23:16:28 UTC, so grace ends2026-10-31 23:16:28 UTC.
These are now live invoice facts rather than synthetic regression assumptions.

Release preparation: fresh restricted schema/functions/permission and affected
billing-row backups are verified under
`/private/tmp/onzio-billing-production-backup` (directory700/files600,
SHA-256 receipt `verification.json`). The prior verified full application
schema/data and daily physical backup remain available. No restore was attempted.
Rollback deployment `dpl_4hbSWo7FB1upzKqqPYtAtdwSn2Rh` is READY. Refreshed
main remains1938a7e with no source divergence. The isolated production CLI link
shows49 applied migrations, and the dry run would apply exactly
`20261012184335_stripe_paid_invoice_projection.sql`, byte-matched to source,
with no seed. Other-tenant billing/club fingerprints were captured read-only.

Exact next step under the approval already granted: apply this exact migration,
verify50/50 migration parity, publish/deploy the accepted application and
reconcile the affected existing projection using
canonical Stripe invoice evidence and an audited privileged operation, or the
next fresh canonical webhook. Resending the already-applied failed event alone
cannot repair it because the immutable ledger correctly rejects duplicates.
Verify failed-payment/grace messaging and recovered-payment behavior after
release. Preserve public access and content editing throughout the actual
20-day grace window. Do not mark live remediation complete before this evidence.
