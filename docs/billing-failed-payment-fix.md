# Failed subscription payment correction

- **Package:** BILLING-FAILED-01
- **Status:** complete; approved production release and canonical reconciliation verified.

## Problem and behavior

A subscription's billing-period end could be stored as paid coverage even when
collection failed. The payment UI then treated a nonactive subscription with a
future stored date as a successful upcoming renewal, and the database retained
an inflated first grace deadline.

The webhook now rebuilds paid coverage from canonical paid recurring invoice
lines, including pagination, customer/subscription/mode validation, current and
legacy API shapes, and the maximum purchased period. Prorations and one-off
items cannot extend recurring coverage. Read failures retry the webhook, and
canonical recovery wins over delayed failures. Grace is derived from verified
paid coverage plus the existing20-day window. Past-due UI shows a failure or
appropriate overdue/grace state with an actionable billing link.

## Changed files

- `lib/stripe-paid-through.ts`, `lib/stripe-event-routing.ts`, `app/api/stripe/webhook/route.ts`
- `lib/stripe-subscription-state.ts`, `components/admin/payments/PaymentStatusCard.tsx`
- `supabase/migrations/20261012184335_stripe_paid_invoice_projection.sql`
- Six regression files across pure, rendered-card, signed-webhook and database coverage
- `vitest.config.ts` enables React's automatic JSX runtime for render contracts
- Handoff and the relevant tenant status ledger

## Acceptance

Full local suite1813/1813 across192 files; focused behavior/render/webhook43,
billing DB8, contracts1059, architecture21 and DB311 pass. Build, TypeScript,
lint and generated database-type parity pass. Six synthetic local desktop/phone
captures cover failed, grace and recovered states, inline Portal errors and
fixture restoration. One unchanged real local email-auth session timing failure
was superseded by passing focused and full unchanged retries.

Christian explicitly approved production deployment and canonical correction on
2026-10-12. Restricted backups were taken and verified before mutation. The
single approved migration ran without seeds; linked migration parity is50/50,
and service-only execution grants remain intact. The guarded, audited,
idempotent maintenance correction matched canonical Stripe evidence, preserved
subscription identity and existing event history, and changed no other tenant's
club or subscription rows. Stripe operations were reads only.

Runtime source3120e39 and formatting-only follow-up725315a reached production as
READY deployment `dpl_5dHf19X2D9bbNrVBNSxuJyrGMbdf`; existing customer aliases,
authenticated owner billing UI, public availability and protected anonymous
login were verified. The exact deployment's error scan returned zero entries.
Final completion notes are documentation-only and do not change runtime source.

Detailed tenant billing facts, invoice identifiers, private screenshots, backup
hashes and reconciliation receipts are kept in restricted local evidence, not
in the current public release notes. Historical published preparation notes
retain their original provenance. No new native-device result is claimed.

**Blockers/exact next step:** none for this package. Preserve the original dirty
OTP checkout and the private backup/rollback evidence.
