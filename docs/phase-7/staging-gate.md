# Phase 7 Protected Staging Gate

Last updated: 2026-07-27

## Purpose

This runbook is the acceptance record for Phase 7. The gate is complete only
when every required hosted resource is isolated from production and every
scenario below has current evidence from the protected staging deployment.

Do not put secrets, tokens, complete webhook payloads, customer details, or
service-role credentials in this file.

## Hard Safety Preconditions

- The Supabase project is separate from production. Its organization is
  temporarily Pro for the Phase 7/Phase 8 migration month; steady-state staging
  remains targeted for Free after the migration rollback window.
- The project contains synthetic Alpha and Bravo tenants only.
- `ONZIO_ENVIRONMENT=staging`.
- Stripe uses `sk_test_*`, distinct test-mode Starter and Pro recurring Prices,
  a test-mode Customer Portal configuration, and a staging-only webhook.
- Vercel Deployment Protection is enabled before inviting testers.
- Preview variables point only to the staging Supabase project and Stripe test
  mode. No Rose City or Onzio production credential is present.
- The operator allowlist contains only the staging operator Auth user UUID.
- No Rose City import, production Stripe mutation, DNS change, or cutover is
  performed.

Stop immediately if a project reference, key mode, domain, tenant, customer,
subscription, or Price cannot be proven to be staging-only.

## Hosted Resource Record

Record identifiers that are safe to retain. Never record secret values.

| Resource | Required evidence | Current evidence |
| --- | --- | --- |
| Supabase staging organization | Separate staging organization | `Onzio Staging` (`udlsrxgfpkqjaridfxnz`); temporarily Pro for the migration month |
| Supabase staging project | Project name/ref, plan, region | `Onzio Platform Staging` (`fxefqnoqxbezeccjvrsw`); active/healthy; `us-west-2`; temporarily Pro |
| Applied database schema | Migration list and schema lint | Seven checked-in Phase 2–6 migrations applied without seed; local/remote ledger matches; hosted `onzio,onzio_private` lint clean |
| Supabase runtime keys | New key types only; legacy keys disabled | Publishable/secret key types retained outside the repository; management API verified legacy keys disabled on 2026-07-27 |
| Synthetic tenants | Alpha/Bravo IDs and staging domains | Pending |
| Staging Auth users | Operator, Alpha owner/admin, Bravo owner/admin | Pending |
| Stripe Starter Price | Test-mode Price ID | `price_1Tw6sHK6WajTkwHYRQumSWcM`; active, USD 65/month |
| Stripe Pro Price | Test-mode Price ID | `price_1Tw6rrK6WajTkwHYF7SuHHli`; active, USD 99.99/month |
| Stripe Customer Portal | Test-mode configuration ID | `bpc_1Tw73SK6WajTkwHYgoLJ1tpN`; active/default; payment methods, invoices, cancellation, and Starter/Pro switching enabled |
| Stripe runtime key | Test-mode replacement stored outside repository | Pending rotation after pre-deployment credential-handling incident |
| Stripe webhook | Test endpoint ID and enabled event allowlist | Pending |
| Vercel project/deployment | Project ID and deployment URL | Pending |
| Deployment protection | Protection mode and authenticated probe | Pending |

## Provisioning Sequence

1. Create or select the isolated Supabase staging project.
2. Link this checkout to that exact project and verify the project reference.
3. Apply checked-in migrations in order without `--include-seed`.
   `supabase/seed.sql` is local-only and must never run against a hosted
   project.
4. Provision synthetic Alpha and Bravo clubs and their staging Auth identities
   through the audited operator workflow.
5. Enroll every owner/admin identity in TOTP MFA and verify AAL2.
6. Create distinct Stripe test-mode Starter and Pro recurring Prices.
7. Configure the test-mode Customer Portal for tier changes, payment methods,
   invoices, and cancellation.
8. Create a staging-only webhook for `/api/stripe/webhook` using only the event
   types handled by the application.
9. Create/link the Vercel project, configure Preview variables, and enable
   Deployment Protection.
10. Deploy, verify protection before authentication, and then execute the
    acceptance matrix.

## Acceptance Matrix

For every row, record the date, actor/tenant, result, and a safe evidence
reference such as a test run, request ID, Stripe event ID, or screenshot path.

| Area | Required scenario | Result | Evidence |
| --- | --- | --- | --- |
| Protection | Unauthenticated staging request is challenged | Pending | — |
| Routing | Alpha and Bravo domains resolve to the correct tenant | Pending | — |
| Cache isolation | HTML, RSC, metadata, and images never cross tenants | Pending | — |
| Unknown host | Unknown/unverified host fails closed | Pending | — |
| Authentication | Password setup completes on verified primary domain | Pending | — |
| MFA | AAL1 is rejected and AAL2 is accepted | Pending | — |
| Membership | Removed member loses access immediately | Pending | — |
| Roles | Admin cannot access billing; owner can | Pending | — |
| Entitlement | Starter cannot mutate Pro-only surfaces | Pending | — |
| Tenant RLS | Alpha cannot read/write/reference Bravo private rows | Pending | — |
| Media | Valid photo and transparent graphic finalize successfully | Pending | — |
| Media rejection | Spoofed, SVG, corrupt, oversized, and cross-club input fail | Pending | — |
| Media retry | Finalization retry is idempotent | Pending | — |
| Media cleanup | Replacement and abandoned-staging cleanup are verified | Pending | — |
| Checkout | First subscription creates test Checkout and metadata | Pending | — |
| Portal | Existing subscriber routes to Customer Portal | Pending | — |
| Webhook retry | Duplicate delivery is idempotent | Pending | — |
| Webhook order | Stale/out-of-order event is rejected | Pending | — |
| Webhook boundary | Foreign environment/customer/price fails closed | Pending | — |
| Tier change | Starter/Pro upgrade and downgrade project correctly | Pending | — |
| Retry state | `past_due` remains live through paid time | Pending | — |
| Grace | Terminal status enters seven-day public grace | Pending | — |
| Suspension | Expired grace suspends public rendering and content writes | Pending | — |
| Archive | Archive detaches routing and rejects sessions/writes | Pending | — |
| Reactivation | Reactivation restores preview, not public live access | Pending | — |
| Rollback | Failed projection/finalization leaves no partial state | Pending | — |

## Required Verification

Run the narrow scenario checks during execution, then finish with:

```bash
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm run test:db
npm run test:legacy
npm test
npm run db:types:check
supabase db lint --linked --schema onzio,onzio_private
npm run lint
npm run build
```

The eight Phase 8 Rose City transformation/migration contracts may remain
intentionally red. Every Phase 1–7 contract, architecture sentinel, database
test, and legacy regression must remain green.

## Completion Decision

Phase 7 passes only when:

- every hosted resource row has evidence
- every acceptance scenario is verified
- the complete verification set matches the expected Phase 8-only red state
- deployment protection remains enabled
- runtime logs show no unresolved authorization, webhook, media, or tenant
  isolation errors from the acceptance run
- `HANDOFF.md` records the deployment, verification results, blockers, and
  Phase 8 readiness

Do not begin Phase 8 until Christian explicitly authorizes the Rose City
freeze/import/cutover workflow.
