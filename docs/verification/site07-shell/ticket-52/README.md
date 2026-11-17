# Issue 52 registration evidence

Implementation and local acceptance are ready for coordinator verification. Issue
#52 remains in progress until complete exact-head verification and independent review.

## Page and service ownership

Christian chose Academy-owned registration pages on 2026-11-02. The Academy module
owns open, cancelled-checkout, closed, and confirmation page layouts. Canonical
adapters choose Academy layouts from verified club context at the outer legacy seam.
Other clubs retain their neutral layouts. Academy components contain no selector.

The platform keeps form data, authorization, loading, CTA/modal interaction, waiver,
signature, submission, and Checkout services. Both confirmation layouts consume the
same shared `useRegistrationConfirmation` status/copy/polling implementation. That
polling body and the moved Academy slideshow are byte-identical to their originals.

## Shared signature fix and comparison control

The original baseline `89670652fa7467e5e6e64e0c39f1aa5f9a58d848` has a shared
registration defect. Drawing a real canvas stroke activates Clear once without an
intentional Clear interaction. The modal then reports `REGISTRATION_FIELD_REQUIRED`
and sends no POST, although every native input is valid. The sanitized
[red proof](signature-red-proof.json) records those observations and limits.

The isolated fix is `de10518490f518bb2c26eff5a4dceb0c96bbbc3a`. Signature fields
use a named group instead of a forwarding label; normal input labels and layout
classes remain. The focused regression fails before the fix and passes after it.
No event suppression, fake signature state, or payment logic change is used.

The successful comparison isolates page ownership with the shared fix on both sides.

| Build | Source revision | Meaning |
| --- | --- | --- |
| Control | `2a18ac69752aff16e18d22abd4291eaddb26c2ca` | Original `8967065` plus only the shared signature fix and its regression. No Academy registration page extraction. |
| Head | `de10518490f518bb2c26eff5a4dceb0c96bbbc3a` | Academy page extraction, merged `8967065`, and the same shared signature fix. |

Both are fresh local production builds. [Build identities](build-identities.json)
record their source SHAs and actual Next.js build IDs. Original-baseline red evidence
is separate from this successful control/head comparison.

## Verification results

| Check | Observed result |
| --- | --- |
| Focused contracts and route architecture | 12 files, 160 tests pass. |
| Changed-file preflight | 3 files, 60 tests pass. |
| TypeScript and lint | Pass. |
| Real registration SQL | `registration-rls.test.ts` and `registration-form-links.test.ts`, 26 tests pass. Includes tenant and service-role boundaries, participant/form relationships, paid-ledger application, duplicate deliveries, expiry, and refunds with synthetic provider references. |
| Control and head production builds | Both pass under the shared local database lock. |
| Browser fixture lifecycle | Published fixture create, close, remove, and exact original-row restoration pass before browser interactions. |
| Browser flow and visual comparison | Pass. 36 captures form 18 byte-identical pairs across nine states at 1440 by 900 and 390 by 844. |
| Complete final-head verifier | Pending coordinator execution. |
| Independent final-head review | Pending. |

The [capture manifest](registration-capture.json) records source identity, state,
viewport, screenshot hashes, main/dialog/header/footer DOM hashes, links, fonts,
browser REST reads, expected unknown-status responses, and fixture restoration hashes.
Every screenshot file was independently rehashed against the manifest. All 18 unique
head screenshots were visually inspected; each control screenshot has identical bytes.

The successful browser test asserts an actual raw pointer signature causes zero
implicit Clear activations, the waiver is checked, native validity passes, and the
real client POST contains the chosen price, participant, answers, signature PNG, and
waiver acceptance. It follows the intercepted test Checkout destination. It checks
pending, paid, refunded, expired, unknown, missing-token, cancelled-checkout, and closed
states. Unknown status contributes exactly one explicitly expected intercepted 404
per build and viewport. Unexpected page errors, HTTP errors, and blocked requests
are asserted empty.

Header/footer DOM, links, main/dialog markup, screenshot bytes, and REST reads match
for every pair. Font count and decoded/transfer bytes do not increase. Signed-form
captures use the same real focus/pointer state in both builds, verify the checked
checkbox is not active, hovered, or focused, and wait for finite animations and two
paint frames. No pixels are hidden or normalized and image equality is not loosened.

## Fixtures, recovery, and limits

Only the synthetic Alpha club with `kind = test` is accepted, and its published
presentation must resolve to Academy. Supabase must be loopback and any original
Connect row must be test-mode. Unique forms and dependents are removed. Original
rows are persisted mode600 outside the repository before mutation, and restoration
receipts preserve timestamps and dependents. Final original and restored SHA256 are
both `def6d57cbdd3c7ffca82e16d315634329cc9703d38af9c1d0d5748b11b42c9b7`.

The first harness attempt deleted required fields before closing its form and failed
cleanup. Only its unique form/dependents and newly inserted inert Connect fixture
were recovered. The repaired harness closes first and preserves primary and cleanup
errors. One interrupted diagnostic was recovered from its persisted original snapshot
with an exact matching hash. The lifecycle regression and final full browser run both
verify restoration. Both owned servers stopped and the shared lock was released.

Submission responses, the Stripe test Checkout destination, and confirmation status
responses are explicit browser interceptions. No Stripe or email API is contacted.
Real SQL ledger behavior is separate from that browser transport proof. This does not
establish hosted Checkout/webhook acceptance or a real-money payment.

Existing visual limits are unchanged in control and head. Some long phone headings
extend beyond the available width, and Alpha's footer logo uses its existing fallback.
This record proves ownership parity and the shared signature repair, not a new phone
layout or physical-device acceptance. Full-site acceptance can assess those baseline
visual limits separately.

## Reproduce

Run all database, build, server, and browser work serially under
`scripts/with-local-db-lock.sh`. Use the vetted local test environment without printing
its values. Build and serve the recorded control and head, then supply both origins
and SHAs through `SITE07_REGISTRATION_BASE_URL`, `SITE07_REGISTRATION_HEAD_URL`,
`SITE07_REGISTRATION_BASE_SHA`, and `SITE07_REGISTRATION_HEAD_SHA`. Set
`SITE07_REGISTRATION_EVIDENCE_DIR` to a dedicated output folder and run:

```bash
npx playwright test --config=tests/browser/site07-registration.config.ts
```

The evidence spec and config are separate from normal Playwright configurations. The
coordinator's next action is complete verification and independent review of the final
committed result. No push, PR, merge, deployment, hosted query, or production operation
was performed by this worker.
