# Admin portal PR review — 2026-10-12

PR: [#13](https://github.com/404christiann/onzio-platform/pull/13). Latest review: **No findings.** Two confirmed P2 defects were fixed, reproduced before the fixes, and covered by passing browser regressions. Christian explicitly retains the final merge decision. No merge, production deployment, hosted database mutation or live provider action occurred.

## Reviewed source

Original PR head: `91fb64b36b9ee523f9bfc506522b36156f1bb1b2`. Refreshed comparison ref and merge base: `origin/main`, `c10bea3f54442f31e4bdf7e3f68456e6c278de65`. Each review inspected the complete merge-base diff, rather than comparing two branch tips. The original inventory was 94 changed paths; the final source review also included both new browser specs and both uncommitted fixes. Those exact reviewed contents are committed as `c8c960ac64afce3c8ccb2422d00c98cfb1fd93d3`, built with Next build ID `26UE0JzwxYguDfsx5RF-E`.

The explicitly requested `review-agent` skill was delegated to read-only subagents. Reviewers did not edit files, weaken tests, create commits, push, post GitHub comments or delegate further. Root implemented the fixes and ran the final runtime checks. The original dirty OTP checkout was untouched.

## Review rounds

| Round | Reviewer | Result | Resolution |
| --- | --- | --- | --- |
| 1 | `pr13_review_round1` | One P2: restore the Match baseline before discarding a view change | Fixed and reproduced in browser tests |
| 2 | Fresh-context `pr13_review_round2` | Match fix cleared; one additional P2: reconcile inserted Standings teams before retrying a failed refresh | Fixed and reproduced in browser tests |
| 3 | `pr13_review_round2`, new full-diff review after the second fix | **No findings.** Both fixes and both new specs cleared | Final root verification completed below |

**Round 1 — [P2] Restore the match baseline before discarding a view change.** Original finding: `components/admin/stats/MatchStatsEditor.tsx:355–356`. Editing goals from 3 to 8, choosing Season stats and discarding left 8 visible and the unload warning active while navigation was delayed. The handler now restores `baselineStats` before applying the next scope (current lines 355–359). A stalled-navigation test checks the original value, clean save feedback and cleared unload guard while the old tab is still selected, then releases navigation. The pre-fix Match cases failed at both 390px and 1440px; both Season controls already passed.

**Round 2 — [P2] Reconcile inserted teams before retrying a failed refresh.** Original finding: `app/admin/(protected)/standings/page.tsx:309`. A successful team insert followed by a strict refresh failure left the temporary draft ID available for another Save, allowing a duplicate insert. After committed writes, failed reads now put the editor in recovery state, clear the dirty flag and block further mutations. The new 44px “Retry loading” button performs reads only; a successful refresh restores persistent IDs before editing resumes (current lines 227–248 and 330–340). Initial read failures also offer the same recovery action. The pre-fix tests failed because Save stayed enabled after the committed insert.

**Round 3 — No findings.** The reviewer checked the complete updated merge diff and both specs, and independently executed the actual Standings handlers in memory. Failed refreshes prevent further mutations, failed recovery remains read-only, successful recovery preserves the inserted ID, and subsequent edits upsert that same ID. The Match baseline is cleared before stalled navigation. Root then completed the actual-browser and full-suite gates.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| New Match discard regression before fix | 2 Match failures / 2 Season controls passed | `/private/tmp/onzio-pr13-discard-before.log` |
| New Standings recovery regression before fix | All 4 failed at Save incorrectly enabled | `/private/tmp/onzio-pr13-standings-before.log` |
| Both new specs, final build | All 8 passed in 1.4 minutes; 390/1440px; delayed tab navigation and rows/settings refresh failures | `/private/tmp/onzio-pr13-final-regressions.log` |
| Existing Stats persistence/scope cases | All 7 distinct cases passed across original run and unchanged narrow rerun; exact seven-table restoration retained | `/private/tmp/onzio-pr13-stats-after.log`; `/private/tmp/onzio-pr13-stats-rerun.log` |
| Existing Competition empty/error states | Both 320/390px cases passed in 43 seconds; strict reads still hide editable defaults | `/private/tmp/onzio-pr13-competition-states.log` |
| Standings read-failure/public-content contracts | 2 files / 8 tests passed | `/private/tmp/onzio-pr13-standings-contracts.log` |
| Complete suite, isolated local database | 189 files / 1,791 tests passed in 76.01 seconds; database writers serialized | `/private/tmp/onzio-pr13-review-full.log` |
| Production build | Passed; final build ID above | `/private/tmp/onzio-pr13-review-build.log` |
| Standalone TypeScript | Sequential post-build rerun passed | `/private/tmp/onzio-pr13-review-tsc-final.log` |
| Whole-project lint | No ESLint warnings/errors | `/private/tmp/onzio-pr13-review-lint.log` |
| Branch whitespace and non-mutating merge simulation | Passed against refreshed main; source merge tree `005dcff25791b6941d8ef91bf9faa197b8aa5607` | `git diff --check origin/main`; `git merge-tree --write-tree HEAD origin/main` at c8c960a |

The original existing Stats run had five passes, one fixture-readiness timeout during initial desktop Season loading and one case not reached. The two affected cases passed unchanged on the narrow rerun; no assertion, fixture cleanup or timeout was loosened. The initial standalone TypeScript invocation overlapped Next's removal/regeneration of `.next/types` and reported missing generated files. Its sequential final rerun passed; only that final result is the completed gate.

## Limits and release boundary

The new regression specs mock page-data reads/mutations and block unexpected writes/providers. They verify editor state and request sequencing, not a new end-to-end database-persistence claim. Existing Stats tests provide real isolated-local persistence and exact restoration separately. Browser checks use normal synthetic-owner authentication and the isolated localhost Supabase only. No migrations, API/schema/authorization changes, public fallback changes or existing-test weakening are included.

The prior [full portal QA report](admin-portal-release-qa.md) retains its build-8 capture and user-reported iPhone/paste/VoiceOver provenance. Those 72 screenshots were not recaptured for these two narrow logic fixes. The new Standings recovery control was verified in desktop/phone browsers; the earlier physical report is not a new physical acceptance claim for this button. General ambiguous-write failures outside the confirmed post-commit refresh scenario are outside this fix's scope.

GitHub at runtime source head `c8c960a` / base `c10bea3` reports `MERGEABLE` / `CLEAN`, open/non-draft, with an empty statusCheckRollup. This snapshot precedes evidence-only commits; reviewed runtime source is unchanged. The repository has no PR-triggered test workflow; an empty statusCheckRollup is not a remote CI pass. The existing feature-branch Vercel guard remains in place. **Next: Christian reviews these fixes and gives an explicit OK before any merge.** At release time, refresh base/checks and satisfy the repository's production backup/release safeguards before merging and verifying production.
