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
| Applied database schema | Migration list and schema lint | Ten checked-in Phase 2–7 migrations applied without seed; local/remote ledger matches; hosted `onzio,onzio_private` lint clean |
| Supabase runtime keys | New key types only; legacy keys disabled | Publishable/secret key types retained outside the repository; management API verified legacy keys disabled on 2026-07-27 |
| Synthetic tenants | Alpha/Bravo IDs and staging domains | Alpha `362f4276-0e0b-4c6a-989d-3e59713c1d9f` at `alpha-onzio-staging.vercel.app`; Bravo `fae51a8d-63b5-468c-bb7a-6e2b31d90035` at `bravo-onzio-staging.vercel.app` |
| Staging Auth users | Operator, Alpha owner/admin, Bravo owner/admin | Five synthetic `@example.com` identities provisioned; all four club identities verified at AAL2; operator UUID `6188c9c5-b84e-41da-95ce-0b17c21bfcec` is the only allowlisted operator |
| Stripe Starter Price | Test-mode Price ID | `price_1Tw6sHK6WajTkwHYRQumSWcM`; active, USD 65/month |
| Stripe Pro Price | Test-mode Price ID | `price_1Tw6rrK6WajTkwHYF7SuHHli`; active, USD 99.99/month |
| Stripe Customer Portal | Test-mode configuration ID | `bpc_1Tw73SK6WajTkwHYgoLJ1tpN`; active/default; payment methods, invoices, cancellation, and Starter/Pro switching enabled |
| Stripe runtime key | Test-mode replacement stored outside repository | Rotated test key stored outside the repository; Vercel Preview scope only |
| Stripe webhook | Test endpoint ID and enabled event allowlist | `we_1TxrnaK6WajTkwHYtFEvCEo8`; staging URL; exact seven-event application allowlist |
| Vercel project/deployment | Project ID and deployment URL | `onzio-platform-staging` (`prj_I362ysmh9cse5cRxnL7db4dOhsEs`); protected `staging` branch alias `onzio-platform-staging-git-staging-404christianns-projects.vercel.app`; acceptance deployment `dpl_12ECp8kgfQFRz1nTLc6Z2cLJRLUm` |
| Deployment protection | Protection mode and authenticated probe | Standard Vercel Authentication enabled; unauthenticated probe returns a protection redirect and automation-bypass probes reach the application |

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
| Protection | Unauthenticated staging request is challenged | Pass | 2026-07-27 unauthenticated stable-alias probe returned Vercel protection redirect; bypass reached the app |
| Routing | Alpha and Bravo domains resolve to the correct tenant | Pass | Hosted auth verifier returned tenant-specific HTML and admin responses for both verified domains |
| Cache isolation | HTML, RSC, metadata, and images never cross tenants | Pass | Distinct `x-onzio-cache-tenant` values for Alpha/Bravo HTML and RSC; exact-domain metadata resolution and club/version-scoped immutable media paths |
| Unknown host | Unknown/unverified host fails closed | Pass | Unknown deployment host returned 404; cross-host private-preview session returned 404 |
| Authentication | Password setup completes on verified primary domain | Pass | Four password identities signed in through the hosted primary-domain flow |
| MFA | AAL1 is rejected and AAL2 is accepted | Pass | `phase7.hosted_auth_verified`: AAL1 rejected, TOTP AAL2 accepted for four identities |
| Membership | Removed member loses access immediately | Pass | Hosted auth verifier removed Bravo admin, observed write denial and admin redirect, then restored membership |
| Roles | Admin cannot access billing; owner can | Pass | Admin Checkout returned `OWNER_REQUIRED`; Alpha owner reached Stripe Customer Portal |
| Entitlement | Starter cannot mutate Pro-only surfaces | Pass | Hosted Starter write to Pro-only `shop_kit_section` rejected by RLS |
| Tenant RLS | Alpha cannot read/write/reference Bravo private rows | Pass | Four AAL2 sessions wrote own rows; every cross-tenant write and cross-host private read failed |
| Media | Valid photo and transparent graphic finalize successfully | Pass | `phase7.hosted_media_verified`: photo WebP normalization and alpha-preserving graphic normalization |
| Media rejection | Spoofed, SVG, corrupt, oversized, and cross-club input fail | Pass | Hosted media verifier rejected all five boundary classes |
| Media retry | Finalization retry is idempotent | Pass | Hosted media verifier returned the same asset on retry |
| Media cleanup | Replacement and abandoned-staging cleanup are verified | Pass | Retirement deleted the replaced object; scoped synthetic-prefix cleanup removed the abandoned staging object |
| Checkout | First subscription creates test Checkout and metadata | Pass | Test Checkout `cs_test_a1t8DnhWhNxABc1Q4ulvNwsjonWa9kEuFkEC2yIhV1AUs1kUhPAReZnhob` created a correctly scoped Starter subscription |
| Portal | Existing subscriber routes to Customer Portal | Pass | Hosted owner request returned 303 to `billing.stripe.com` |
| Webhook retry | Duplicate delivery is idempotent | Pass | Hosted Stripe verifier rejected the duplicate without a second projection |
| Webhook order | Stale/out-of-order event is rejected | Pass | Hosted Stripe verifier recorded stale-event rejection and preserved current state |
| Webhook boundary | Foreign environment/customer/price fails closed | Pass | Hosted Stripe verifier rejected environment, customer-metadata, and unknown-price mismatches |
| Tier change | Starter/Pro upgrade and downgrade project correctly | Pass | Real test subscription `sub_1TxsLTK6WajTkwHYEUjdWeNR` projected Starter→Pro→Starter |
| Retry state | `past_due` remains live through paid time | Pass | Hosted lifecycle verifier preserved live access |
| Grace | Terminal status enters seven-day public grace | Pass | Hosted lifecycle verifier projected public grace |
| Suspension | Expired grace suspends public rendering and content writes | Pass | Hosted lifecycle verifier projected suspended access after grace expiry |
| Archive | Archive detaches routing and rejects sessions/writes | Pass | Hosted lifecycle verifier detached the disposable domain and denied routing |
| Reactivation | Reactivation restores preview, not public live access | Pass | Hosted lifecycle verifier restored onboarding/private preview |
| Rollback | Failed projection/finalization leaves no partial state | Pass | Hosted Stripe rejection ledger plus disposable-club lifecycle rollback verified atomicity |

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
