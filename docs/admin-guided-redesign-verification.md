# Guided admin redesign — verification

Prepared 2026-10-11. **Acceptance remains in progress.** Root must finish the gallery and final diff record before committing this document. Frozen-source implementation checks below are complete; physical-device acceptance remains outside the recorded evidence. Local implementation does not authorize publication or production changes.

## Scope and source

- Branch: `codex/admin-guided-redesign`; worktree: `/Users/christianalcala/.codex/worktrees/admin-guided-redesign/onzio-platform`.
- Guided checkpoint: `4f61a71`; final frozen source: `9a001c13d94fed44741117ad9a3b5da2ad13e961` (`9a001c1`), including the About wrapper, Safari Time sizing and new browser-test corrections. The icon integration at `dab7b95` retains the reviewed integration tree from `640e57e`.
- Approved icons: `48f9f69`; icon PR #12 was squashed to main as `c10bea3` and is now integrated locally. No icon approval remains outstanding.
- All 19 protected destinations and their active editor compositions are implemented: Dashboard; Homepage, Programs, Tryouts, Shop, About, Sponsors, Contact; Seasons, Roster, Schedule, Match Stats, Season Stats, Standings; Registrations, Analytics, Branding, Team Access, Payments.
- Direction: Guided system typography, neutral light/dark surfaces, blue primary actions, readable labels, grouped controls and distinct desktop/phone layouts.
- Inventory: `docs/admin-guided-redesign-inventory.md`. Final build below includes the frozen Schedule time-input and About wrapper changes.

## Preservation and independent review

The reviewed icon integration has no actionable findings. A later browser comparison verified an About inspector overlap regression; its narrow fix is independently reviewed in source and the unchanged rebuilt Logo case now passes. Handler/control expressions are preserved; the final icon integration separately passed an independent AST comparison of event, control and ARIA attributes plus Guided class references across all 27 changed TSX consumers against `4f61a71`. Icon assets, module, receipt, license and new contract were byte-exact to the approved `48f9f69` source. Shared NativeSelect retains its original public drawing unless an admin explicitly injects the approved chevron; Sponsors and named exceptions retain approved existing drawings.

Navigation names/order and access predicates, theme cookie/server first paint, Dashboard data/chart/semantic alternative, fields, uploads, save/receipt/recovery behavior and the distinct Staff versus Player/Match panel layouts remain. APIs, schema, authentication/session, RLS, billing authorization, tenant resolution and media validation behavior are preserved. Existing contract assertions were not weakened.

The About follow-up adds a real div scroll boundary around the unchanged disabled fieldset. Removing its opening/closing wrapper restores the preceding TSX byte-for-byte; existing handlers, field labels, disabled behavior, save/recovery and iframe owners are exact. The About wrapper CSS wins the phone shared direct-div flex rule by specificity and retains safe-area field padding. Guided increased control height exposed the fieldset anonymous scroll box: its second Replace control extended into the Save footer while the fieldset scrollTop stayed zero. A real div provides the scroll boundary, preserving the fieldset disabled semantics. The unchanged rebuilt Logo second-Replace upload/cleanup-queue case now passes in 3.2s. No assertion was loosened.

Admin styles remain protected and scoped. Public iframe internals retain their fonts; same-document previews use explicit `data-admin-public-preview` boundaries. Horizontal safe-area padding, Programs' inset-aware sticky offset and search height bounds resolve the reviewed geometry issues. The shared panel uses visualViewport height/top, cleans up listeners/animation frames and scrolls only its body to reveal a focused field without changing focus or typed values.

## Verified evidence

These results are separate runs; do not add overlapping suites into a single total.

| Check | Recorded result | Evidence / qualification |
| --- | --- | --- |
| Unchanged baseline complete suite | 186 files / 1,778 tests passed | `/private/tmp/onzio-guided-baseline-tests.log` |
| Required contracts | 105 files / 1,044 tests passed | Earlier standalone integrated run; final complete suite also passes below |
| Required architecture | 3 files / 21 tests passed | Earlier integrated source |
| Required local database | 31 files / 310 tests passed | Earlier integrated source; isolated synthetic loopback database |
| Required legacy | 47 files / 403 tests passed | Earlier integrated source |
| Owner/admin browser access | 4 cases / 44 assertions passed; 20 screenshots | Local production build: both roles at 390px and 1440px; `/private/tmp/onzio-guided-role-acceptance/report.json` |
| Management browser | 2 passed in 43.9s | Final run; all 12 fixture values restored exactly; `/private/tmp/onzio-guided-management-final-report.json` |
| Persistence browser | 10 distinct checks passed | 4 edit checks in `/private/tmp/onzio-guided-persistence-final.log` plus 6 Add/Save/Reload checks in `/private/tmp/onzio-guided-persistence-add-final.log`; 10 distinct cases, not all tests passing in the initial edit run |
| Existing Programs/Tryouts/Shop public editors | 28 passed (excludes About) | `/private/tmp/onzio-guided-public-editors-final.log` |
| Cinematic About acceptance | 8 distinct cases passed | Six initial distinct passes, committed-500 rerun and fixed Logo case; two Editorial-specific cases were not invoked on the Cinematic fixture |
| About final targeted rerun | 3 unchanged cases passed in 13.1s | Committed-500 4.8s, Logo upload/cleanup queue 3.2s, strict 390/1440/390 viewport 3.0s; `/private/tmp/onzio-guided-about-scroll-final.log` |
| About fixture restoration | Exact nine-table snapshots restored | Original 8 media assets, 58 documents and 7 publications retained; state/content/revision/receipt snapshots equal |
| Existing Contact editor | 6 passed | `/private/tmp/onzio-guided-contact-final.log` |
| Existing loading suite | 8/12 passed; 4 Guided Contact mock failures with the same endpoint gap | Contact mocks omit `/api/admin/contact-editor`; same failure independently reproduced in the baseline desktop loading case on immutable production build at port 3191 (8.4s); the other three baseline viewport cases were not run |
| Existing Homepage suite | 44 distinct checks passed | 39/45 initial passes plus 5 rerun passes; one remaining exact phone CTA-offset assertion reproduced baseline: 628px versus expected 627px |

The baseline production desktop nonmodal-focus check passed. Guided's heading offset was corrected to 28px and its rerun passed; do not classify that as a baseline focus failure. The remaining Homepage CTA assertion is the one-pixel baseline mismatch, not an unverified public-preview regression.

Role checks confirm normal Dashboard content and content quick actions for both roles. Team Access/Payments navigation and label/keyword search entries are owner-only. Owner members GET returns 200 with administrator data and the owner row; admin direct members GET returns 403 `OWNER_REQUIRED`, shows the existing explanatory page error and omits the owner row. Owner Payments shows the active synthetic subscription/Manage billing state; admin direct Payments redirects to `/admin/login?error=owner_required`. Billing authorization GET returns true for owner and false for admin. No mutation request was attempted, and external reads were blocked.

## Final frozen-source gates

| Final gate | Result | Evidence |
| --- | --- | --- |
| Final frozen source identity | `9a001c1` | About wrapper, Safari Time sizing and new test corrections committed locally |
| Final complete suite | 187 files / 1,783 tests passed in 68.13s | `/private/tmp/onzio-guided-full-final.log`; frozen `9a001c1` source |
| Final TypeScript | Passed (exit 0) | `/private/tmp/onzio-guided-about-scroll-tsc.log` |
| Final lint | Passed (exit 0), no ESLint warnings/errors | `/private/tmp/onzio-guided-lint-final.log` |
| Final diff check | Passed (exit 0) | Source and final documentation/artifact diff checked before local commit |
| Final production build | Passed (exit 0) on frozen `9a001c1` source | `/private/tmp/onzio-guided-build-final.log` |
| Final Guided browser suite | 14 distinct cases passed | 13/14 in `/private/tmp/onzio-guided-ui-final.log` (29.8s), plus unchanged strict Staff 1440px rerun in `/private/tmp/onzio-guided-staff-final-rerun.log` (case 1.7s). Initial width 448.000061 versus exact 448 was transient; no assertion was weakened |
| Final route/theme/viewport gallery | 152 captures verified | 19 routes × 1440/390px × light/dark × baseline/Guided, same held synthetic Alpha owner/fixture. All HTTP200, expected theme, no document overflow/page errors/hard readiness failures. Four reports under ignored preview `evidence/` |
| Final native save/reload acceptance | Passed on frozen `9a001c1` | Simulator Safari: Player Name, Match Competition and Homepage Heading saved with software keyboard visible, independently checked through real local DB/API, then Safari-reloaded with persisted values |
| Final native Safari Time geometry/picker | Passed | `/private/tmp/onzio-guided-native-match-time-width-accepted.png` and `/private/tmp/onzio-guided-native-time-picker-accepted.png`; Time fits adjacent fields and native picker opens |

## Pre-existing database-type drift

`npm run db:types:check` fails identically on unchanged baseline and Guided. Tracked generated types are byte-identical, SHA256 `cafecf1cead787e951c77cbcfa878b6b0fc5f7d70dd6000a16082e2cca184519`; the checker is also unchanged. Read-only local generation differs only in `retire_unreferenced_media_asset.Args.p_actor_id` (`string` versus tracked `string | null`) and a final blank line. No tracked schema/types were regenerated. Record **baseline failure**, not a pass or a Guided regression; resolve separately through an intentional schema/generator/type-contract decision.

## Native and release boundaries

Final frozen-source iOS Simulator Safari acceptance used the actual software keyboard. Player Name, Match Competition and Homepage Heading were edited and saved with that keyboard visible, independently verified through the real local DB/API, then reloaded in Safari with persisted values. Evidence under `/private/tmp/`: `onzio-guided-native-player-save-keyboard.png`, `onzio-guided-native-player-reload.png`, `onzio-guided-native-match-save-keyboard.png`, `onzio-guided-native-match-reload.png`, `onzio-guided-native-homepage-save-keyboard.png` and `onzio-guided-native-homepage-reload.png`.

The original complete Player/Match rows were restored exactly (`/private/tmp/onzio-guided-native-persistence-cleanup.log`). Original Homepage hero content was restored through its real API save boundary; revision and receipt history legitimately advanced (`/private/tmp/onzio-guided-native-homepage-cleanup.log`). Do not describe Homepage history as byte-identical restoration.

Schedule Time now fits its adjacent fields and still opens the native picker. The narrow protected-input `box-border appearance-none` adjustment preserves type, value, required validation and change handler. Simulator evidence does not establish physical-device touch scrolling, physical-device clipboard/paste behavior or VoiceOver acceptance.
Representative persistence and source parity do not establish every upload, recovery/conflict, template, lifecycle or billing state. Keep unrecorded required acceptance honest. Hosted staging is retired; all testing here uses isolated local synthetic data. No provider action, hosted write, production mutation or release is authorized by this document. Independent inspection of the final Time delta confirms only protected Schedule input classes changed (`box-border appearance-none`); type, value, required validation and change handler remain exact. Public/shared styles and native dialog viewport behavior are unchanged.

Gallery delivery: `design-previews/admin-guided-redesign/review.html`, opened locally at `http://127.0.0.1:8768/review.html`. The helper waits each editor's actual preview marker and fonts. Baseline dark Homepage1440 did not reach networkidle within10s; its meaningful DOM/preview readiness passed and its loaded PNG was independently inspected. Every other capture has no readiness note. The gallery supports all19 destinations, both sizes/themes and side-by-side comparison. Native interaction screenshots are under ignored `evidence/interactions/`; browser auth remains outside that tree.

Next: review the implemented comparison and complete the documented remaining acceptance before release. HANDOFF and the scoped package ledger record this evidence. GUIDED-PLAN is complete; keep implementation/verification packages **in_progress** wherever their required acceptance evidence remains open, including physical touch/VoiceOver where required. Obtain contemporaneous release approval before pushing/deploying production.
