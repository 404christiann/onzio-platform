# Issue 52 registration evidence

Status is in progress. This record does not establish complete issue acceptance.

## Ownership boundary

Christian chose Academy-owned registration pages on 2026-11-02. The Academy module
owns meaningful open, cancelled-checkout, closed, and confirmation page layouts. The
canonical adapters choose Academy layouts from the verified club context at the
outer legacy seam. Other clubs retain their existing neutral layouts. No selector
is added to an Academy component and no hosted assignment contract is introduced.

The platform keeps form data, authorization, loading, CTA/modal interaction, waiver,
signature, submission, and Checkout services. The existing confirmation status and
copy/polling implementation is shared through `useRegistrationConfirmation`; both
the neutral and Academy layouts use that one hook.

The Academy-specific registration slideshow also moves into the Academy site module.
The public program detail page and existing editor preview use the same Academy
program component and slideshow. The slideshow source bytes are unchanged.

## Recorded checks

The development base is `eb82ba3e344000e72839088a39fd46e00b1536b3`.

- Eight characterization cases passed before the extraction. The expanded route tests
  cover Academy, Editorial, Clubhouse, and absent-template dispatch after extraction.
  They cover resolved tenant loading, visible form and CTA, cancellation, closed
  forms, unavailable lifecycle and access states, missing forms, and confirmation.
- Eleven focused contract and route-architecture files pass 158 tests. The changed-file
  preflight passes two files and 58 tests.
- TypeScript and lint pass.
- The coordinator's complete exact-head verification and independent review are pending.
- Local database and production-build browser checks have not run. The shared
  runtime lane is held by other acceptance work.

## Browser proof prepared

`tests/browser/site07-registration-evidence.spec.ts` compares the original and changed
production builds at 1440 by 900 and 390 by 844. It prepares a unique form with real
loopback SQL loading, fills the actual waiver and signature controls, checks the
registration payload, follows an intercepted test Checkout destination, and renders
all confirmation statuses from intercepted test status responses, plus invalid and missing tokens.
It also verifies stopped-form rendering without another submission CTA.

The fixture accepts only the synthetic Alpha club with `kind = test` and verifies
its current published presentation resolves to Academy. It refuses a
non-test Connect row. It snapshots and restores the original test Connect and all
registration rows, including timestamps and dependents, and compares exact row hashes.
It deletes only its unique form and dependent IDs. Browser service workers, WebSockets,
external requests, and unhandled non-read requests are blocked.

Submission responses, the test Checkout destination, and status polling are browser
interceptions. This proof contacts neither Stripe nor email services. It establishes
browser UI and transport behavior, not hosted Checkout or webhook acceptance.

Run under `scripts/with-local-db-lock.sh` after the coordinator releases the runtime
lane. Supply both build origins and SHAs with the `SITE07_REGISTRATION_BASE_URL`,
`SITE07_REGISTRATION_HEAD_URL`, `SITE07_REGISTRATION_BASE_SHA`, and
`SITE07_REGISTRATION_HEAD_SHA` variables, and set `SITE07_REGISTRATION_EVIDENCE_DIR`.
The coordinator exports the vetted local test environment without printing its values.
Then run:

```bash
npx playwright test --config=tests/browser/site07-registration.config.ts
```

Real SQL ledger and tenant behavior are separately covered by
`tests/database/registration-rls.test.ts` and
`tests/database/registration-form-links.test.ts`. The HTTP contracts in
`tests/contracts/registration-submit.test.ts`, `registration-status.test.ts`, and
`stripe-webhook-payment-coverage.test.ts` cover submission, test Checkout parameters,
status projection, and webhook boundaries. Their commands and actual results must be
recorded when run. No unrun suite is marked passed here.

## Next action

Release the shared runtime lane, run the real SQL and
base/head browser proof, inspect screenshots, finish the ledger and handoff, then
commit the final documentation and evidence before coordinator verification.
