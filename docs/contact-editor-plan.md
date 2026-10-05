# Contact section-guide editor

## Scope

Contact-only follow-up to the approved section-guide concept. This branch starts
from `origin/main` at `a413eb6` and excludes Programs, Tryouts, Shop, About and
Club Logo changes from the earlier editor branch. Hosted Supabase staging is
retired under Christian's current repository instructions; all validation uses
isolated local Supabase and synthetic tenant data.

## Acceptance and status ledger

| Package | Status | Completed work | Files | Verification | Blockers and next step |
| --- | --- | --- | --- | --- | --- |
| PPE-06 | in_progress | Approved section-guide editor and all four review fixes; native automatic-zoom and keyboard-hidden Save defects fixed; exact Contact production migration applied. | Contact editor/API/canvas/CSS, public annotations, save contract, migration/types, tests, helper/config and docs. | TypeScript, lint, 982 contracts, 21 architecture checks, 259 DB tests, 1627 full-suite tests, production build, six browser cases and independent review pass. Native iOS Safari Save/Done, persisted edit/restoration and Branding navigation pass. All 13 DCFC routes at desktop/phone widths and 36 image URLs healthy; public renderers otherwise exactly match main. | Implementation accepted. Existing screen-reader waiver is not a pass. Next: authorized merge and matching READY production deployment, then repeat public-site baseline comparison and record final receipt. |

## Save contract

- One explicit Save commits Contact profile and page copy together under the
  authenticated tenant's RLS permissions.
- Revision conflicts require an explicit user decision. Legacy writes advance
  the revision; malformed revisions must fail before content or receipt writes.
- Uncertain outcomes reconcile the original actor-scoped operation receipt.
  Retrying a still-unconfirmed operation keeps its original ID and payload.
- Shared contact details state their ownership. Social links remain in Branding.
- Media retirement runs through the existing reference-safe server boundary
  after a confirmed commit.

## Release boundary

`vercel.json` disables automatic deployments for `codex/contact-editor` only.
The configured hosted Preview database could not be verified (sensitive values
are redacted). Review uses the verified local app. Do not merge or apply this
migration to a hosted database without separate release approval.

## Validation details and limitation

The five browser cases cover real commits hidden behind HTTP 500/network loss,
receipt failure, exact operation retries, modal focus/background isolation and
dismissal/restoration, plus Branding hit testing above Save at 390×844/390×408.
Synthetic changes are restored in `finally`; direct SQL cases roll back. The
existing authentication helper was aligned with the current Email address label
and automatic OTP submission so these checks are repeatable from this branch.

`db:types:check` has a pre-existing difference: the checked-in cleanup RPC accepts
nullable `p_actor_id`, while the generator emits `string`, plus an EOF difference.
Cleanup legitimately sends null. This PR preserves that override; the two new
Contact RPC definitions match local generation. Native iOS keyboard/safe-area acceptance is recorded in the release receipt below;
Chromium reduced height alone does not prove that behavior.

## Pull request

Draft [#10](https://github.com/404christiann/onzio-platform/pull/10) targets
`main` from `codex/contact-editor`. Independent complete-diff and final
helper/documentation reviews reported no findings. The branch merges cleanly
with refreshed `origin/main` at `a413eb6`. No production release occurred.


## Native iOS keyboard follow-up — 2026-10-04

- Package: PPE-06 remains **in_progress** until the native retest and fresh review.
- Evidence: the parent's iPhone 17 / iOS 26.5 Simulator Safari check found automatic input zoom with the previous sub-16px phone fields, and a Save footer hidden by the real software keyboard even though the short Chromium layout check passed.
- Changes: Contact phone inputs/textareas now use 16px text. The open native modal tracks `visualViewport.height` and `offsetTop` on resize/scroll, so its footer remains in the actually visible viewport while the inspector body shrinks and scrolls. Desktop styles, public renderers and canvas sizing are unchanged.
- Files: Contact editor effect, Contact phone CSS, and one additional Contact browser regression. That regression changes only visual-viewport metrics while retaining the layout viewport height; it verifies 16px fields, Done/Save bounds and hit testing, and scrolling the Introduction above the footer. It is not a claim of real keyboard acceptance.
- Verification: TypeScript, 78/78 focused Contact/Editorial contracts, local production build and diff check passed; parent owns the native-device retest and the six browser cases on the rebuilt app. No concurrent Alpha test, Simulator control, hosted operation, push or commit was performed by the implementation subagent.
- Exact next step: parent restarts the rebuilt local server, checks Done and Save with the actual iOS software keyboard, then reruns focused browser regression and read-only review before the authorized merge.

## Release acceptance receipt — 2026-10-04

- Native: iPhone 17 / iOS 26.5 Simulator Safari, actual software keyboard, local synthetic owner; Save above keyboard, Done reachable, no input zoom, persisted native edit and baseline restoration, Social links to Branding. Screenshot `/private/tmp/onzio-contact-ios-keyboard.png`.
- Final gates: 6/6 browser regressions, TypeScript, 982/982 contracts, 21/21 architecture, 259/259 DB and 1627/1627 complete-suite tests; build and independent review clean.
- Public baseline: all 13 actual navigation routes checked at 1440×900 and 390×844; no error page/overflow; all 36 observed image URLs healthy. Public Contact component sources match main after removing only editor markers.
- Production: backed up first; physical backup 1867060607 completed, fresh logical dumps verified across 53 table/COPY sections. Exact Contact SQL applied under returned version 20261005003024; the checked-in filename now matches it. RLS/grants/search paths/triggers verified, existing Contact and social data fingerprints unchanged. No unrelated pending migration applied.
- Release authorization: Christian explicitly requested merge after Simulator/public verification. This supersedes the earlier awaiting-approval notes above. Next: merge PR #10 and verify its matching READY deployment and public baseline.
