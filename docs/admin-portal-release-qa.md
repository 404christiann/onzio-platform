# Admin portal release QA — 2026-10-12

Status: local technical and physical iPhone acceptance complete. Christian approved the canonical generated-file EOF exception and requested a release PR; production publication approval remains open. The authorized local full-portal review and automated QA are complete on `codex/admin-guided-redesign`; the original OTP checkout is preserved. Frozen build 8 passes its build, complete 189-file/1,791-test suite, TypeScript/lint, exact generation and fresh 72-case visual matrix. Christian has now reported that the portal looks good and seems to be working on his physical iPhone. He separately confirmed that input paste and VoiceOver both worked. These are user-reported physical acceptance results; device model/iOS and specific physical save/upload actions are not inferred.

## Frozen source and integration provenance

Final application/test source is local commit `882384f2531d64fb719e1c3b86fc5c12ed3891a2` (`882384f`), covering 34 QA code/test files on `codex/admin-guided-redesign`. Build 8 uses those same contents, Next build ID `WTlAeANSzUCRXBiW7dUSu`. The review gallery contains all 72 actual captures and has been checked in the app across Desktop/Phone, Light/Dark and phone Stats. Proof is `/private/tmp/onzio-portal-review-proof.png`; final review documentation is saved. Source and capture provenance are recorded here.

Current fetched `origin/main` is `c10bea3f54442f31e4bdf7e3f68456e6c278de65` and remains an ancestor. The non-mutating `git merge-tree --write-tree HEAD origin/main` check exits 0 with tree `0876a06cd55da537d4aab8d87a51b5676d878c9b`. This establishes the recorded local integration state; it does not imply a remote PR conflict check, merge, push or deployment.

## Verified fixes and scope

- One Base UI modal boundary contains focus, handles Escape and restores focus for phone navigation, search, editing panels and Season creation. Closed phone navigation and decorative previews are inert. Search over an unsaved editor preserves that draft. Panel viewport listeners attach after the actual portaled element mounts.
- The final open-search resize case found that its saved desktop position could overflow at tablet width. `AdminGuided.module.css` now clamps the dialog's left edge between the actual safe-area/16px inset and the viewport minus its 28rem width/right inset; maximum width respects both insets. The CSS fix passed the affected case in the final 13-case build 6 modal run.
- Match deletion asks for confirmation, focuses Cancel, and unlocks after a thrown network failure while retaining the match and confirmation for retry. Existing mutation/tenant boundaries remain unchanged.
- Schedule's existing opponent/sponsor logo rows retain their crest/button layout. Choosers now show and accept PNG/WebP, reject unsupported MIME before authorization, and translate the server's unsupported-type code into the same friendly guidance. Backend signature validation remains authoritative.
- Admin Standings opts into strict reads: unavailable data cannot masquerade as an empty editable table. Public/legacy fallbacks remain unchanged.
- Contact, Shop and Tryouts reuse existing section skeletons. Loading fixtures delay their real atomic endpoints; existing assertions remain intact.
- Dashboard, Team Access and Payments wrap at enlarged text sizes. About preview controls wrap. Protected status/selected/control text contrast and two sidebar labels improve; the scoped sidebar axe result is empty. Account naming retains email/role context.
- The build 6 matrix found the Seasons Active badge at 4.3:1 contrast in both light-theme viewport cases. The narrow correction reduces only its success-background tint from 15% to 10%; all four final viewport/theme badge checks pass in build 8.
- The local fixture's top logo object returns 404 from Storage; this is absent fixture storage, not a regressed application URL. The verified clipped sidebar error fallback now uses the existing 40px club-initials treatment and an honest accessible label. Working logos and public image fallback behavior remain unchanged; the actual initials fallback passes in the final captures.
- Suspended content routes retain the verified tenant hostname when redirecting to Payments, including when Next normalizes its internal origin to localhost. Existing grace editing, suspension, owner access, robots policy and authorization rules are preserved.
- NextMatchCard clears a completed GSAP transform. The historical 627/628 comparison was identical actual geometry with differently rounded offset-parent chains; strict public parity passes without assertion changes.
- Database types match exact isolated-local generation. Cleanup intentionally accepts a null actor; SQL/call sites/strict contracts retain that behavior. The existing Simulator proxy defaults to loopback.

The shared-component React review is cleared. Files changed include the shared modal/shell/search/preview components and Guided CSS, narrowly scoped protected pages/editor styles and PaymentStatusCard, `lib/queries.ts`, `middleware.ts`, NextMatchCard and generated types, plus additive browser/pure regressions. Source and final automated evidence are frozen at build 8. This report, the top HANDOFF entry and `GUIDED-RELEASE-QA` ledger record the current release state.

## Acceptance evidence

Frozen build 8 passes all required code/database gates: the complete 189-file/1,791-test suite in 50.17 seconds, production build, TypeScript/lint and exact local generation. The 13-case modal run passed on build 6 in 96 seconds, including the search resize correction. The fresh build 8 matrix passes all 72 cases with a stable build ID. General physical iPhone feedback and the explicit paste/VoiceOver confirmation are recorded separately below; the scoped hardware acceptance gate is closed.

| Check | Result | Evidence |
| --- | --- | --- |
| Production build | frozen build 8 passed after badge/fallback corrections | `/private/tmp/onzio-release-build.log` |
| TypeScript | passed for frozen build 8 | `/private/tmp/onzio-release-tsc-final.log` |
| Whole-project lint | passed for frozen build 8 | `/private/tmp/onzio-release-lint-final.log` |
| Exact local generated types | passed for frozen build 8 | `/private/tmp/onzio-release-types-check-final.log` |
| Complete suite | frozen build 8: 189 files / 1,791 tests passed in 50.17 seconds | `/private/tmp/onzio-release-full-final8.log` |
| Database | 31 files / 310 tests passed; also included in final complete suite | `/private/tmp/onzio-release-db.log` |
| Contracts | 107 files / 1,051 tests passed; also included in final complete suite | `/private/tmp/onzio-release-contracts.log` |
| Architecture | 3 files / 21 tests passed | `/private/tmp/onzio-release-architecture.log` |
| Modal/keyboard/safe-area | all 13 passed for build 6, including search resize, in 96 seconds | `/private/tmp/onzio-release-modals-final6.log` |
| Website editor checks | 94 distinct passed | breakdown/logs below |
| Empty/error/enlarged-text/role/lifecycle | 8 distinct passed: seven in final states run plus affected lifecycle rerun | `/private/tmp/onzio-release-states-final.log`; `/private/tmp/onzio-release-lifecycle-final.log` |
| Pilot uploads/status/confirmation | 6 distinct passed: Player/Staff at 390/1440px plus affected Match rerun | `/private/tmp/onzio-pilot-release-final.log`; `/private/tmp/onzio-pilot-match-final.log` |
| Team access local browser acceptance | 2 passed | `/private/tmp/onzio-guided-members-release.log` |
| Scoped sidebar axe audit | no violations | `/private/tmp/onzio-release-sidebar-audit.json` |
| Fresh visual/contrast matrix | build 8: all 72 passed; 18 routes × 1440/390px × light/dark; stable build ID, HTTP 200, no overflow/scoped axe violations/JS errors/main alerts, no external hosts or unexpected requests | `/private/tmp/onzio-guided-final-audit-build8/report.json` |
| Native Safari software keyboard | new Player field and fixed actions visible; Cancel works | `/private/tmp/onzio-release-native-player-keyboard.png` |
| Approved phone-origin bridge | frozen build 8 passed fresh OTP request (200), normal email-code sign-in, Stats reload, cookie-prefix alias and 16 phone-origin API requests; provider routes return 503; no external hosts/JS errors | `/private/tmp/onzio-phone-check-final8.log` |
| Physical iPhone general visual/usability review | Christian reports it looks good and seems to be working | direct user feedback; model/iOS/specific actions not inferred |
| Physical iPhone paste/VoiceOver | user-reported pass for both | Christian answered the specific input-paste/VoiceOver question: “Yes, both worked”; model/iOS and specific physical save/upload actions not inferred |

Final capture evidence is `/private/tmp/onzio-guided-final-audit-build8/report.json` and its build-8 log. Root also manually inspected Dashboard light/dark and phone Seasons. Axe incomplete results still require human review: this scoped audit is not a claim of complete accessibility acceptance. Decorative previews/iframes were excluded; public/editor parity remains supported separately by the 94-case website evidence. Registrations' Connect-status request was deliberately fenced and its local “Failed to fetch” feedback was expected; this is not live Stripe Connect/provider acceptance. Missing seeded fixture media is not proof of media acceptance; the real validated pilot uploads/reloads are that separate evidence.

Website breakdown: Homepage 45, Programs/Tryouts/Shop 28, Contact 6, Cinematic About 8, Editorial About 2 and loading/reduced-motion 5. Homepage, Contact and Cinematic About include real local API persistence/recovery. Programs/Tryouts/Shop and Editorial authoring use mocked mutation/receipt boundaries and cannot be counted as new database-persistence evidence. Logs: `/private/tmp/onzio-release-{homepage-final,public,contact,about-cinematic,about-editorial,loading-final}.log`.

States cover Seasons/Standings/Analytics empty, failed-read and retry behavior; Registrations empty/list/detail failures; 200% text at 320/390px; actual owner/admin API denials; real isolated customer grace and suspended recovery; and a narrow browser-fulfilled billing configuration failure without a provider action. Pilot checks cover real validated photograph/graphic upload, Save/reload/render, Player deactivation Cancel/Confirm and activation with retained stats, Staff status changes, and Match invalid-JPEG/no-authorization, valid-PNG, confirmation focus/Cancel/Escape, aborted-request recovery and confirmed real deletion.

Original logical content/presentation selections and original media/immutable records were preserved. Genuine revision/receipt history and new unpublished immutable QA versions remain as normal history. New upload assets were retired through normal reference-safe cleanup; legitimate orphaned media/audit rows remain, so preservation is not a claim that every table's total row count is unchanged. Scoped pilot/lifecycle independent checks verify original full rows. Timestamp restoration uses only named timestamp triggers inside local transactions, retaining business/security/revision constraints. Authentication states/recovery snapshots remain private, outside Git.

A transient admin `PRIMARY_DOMAIN_REQUIRED` result came from restarting the local server without the explicit `ONZIO_ENVIRONMENT=production` value matching Alpha's synthetic production-domain records. Restarting with that value and localhost Supabase fixed it; no domain was missing and no domain mutation or database restoration was required. This is a local synthetic database, not hosted production.

No production/hosted mutation, provider action, push, PR, merge or deployment occurred.

## Release preparation — approved formatting exception

Christian explicitly authorized retaining the generator-owned trailing blank line and opening a PR. `.gitattributes` exempts only `lib/database.generated.ts` from `blank-at-eof`; other whitespace checks and the exact type-generation contract remain unchanged. `git check-attr` confirms that one file's value and leaves `components/AdminShell.tsx` unspecified. Whole-branch `git diff --check origin/main` passes, exact local generated types pass, architecture 21 and unchanged cron contracts 12 pass. Logs: `/private/tmp/onzio-pr-types-check.log`, `/private/tmp/onzio-pr-architecture.log`, `/private/tmp/onzio-pr-cron-contracts.log`.

`vercel.json` adds `codex/admin-guided-redesign: false` to the existing automatic-preview branch list. Hosted staging is retired; opening this PR must not create a hosted preview against an unverified database. Production branch deployment settings and cron definitions are unchanged.

Only explicit production release approval remains. PR branch publication is authorized; main merge/deployment and live provider/payment actions are not. Record the created PR, current head/base, GitHub mergeability and check state before the final handoff. No new runtime changes invalidate the recorded code/browser/physical QA evidence.

## Physical iPhone acceptance

Christian's direct general report is “Looks good, seems. to working fin. .” His response to the specific input-paste and VoiceOver question is “Yes, both worked”. Record these as successful user-reported physical iPhone visual/usability, input-paste and VoiceOver acceptance. The scoped hardware gate is closed. No device model/iOS, exact screen-reader coverage or specific physical save/upload action is inferred; real local automated persistence/upload checks remain separate evidence above.

The walkthrough used the approved exact-peer route `http://192.168.1.133:3114/admin`, restricted to phone `192.168.1.132`, with the synthetic owner and normal email-code flow. Its renewed bounded window was 16:25–16:55 UTC (9:25–9:55 a.m. America/Los_Angeles). The final build 8 authentication/API bridge passed without external hosts/JavaScript errors; provider routes were blocked. Earlier interrupted/transient checks were superseded without an auth bypass. Earlier rejected LAN-wide proxy/credential-copy alternatives were not applied and are historical, not an unresolved access blocker. No new physical QA-record mutation is established by the user's feedback, and none is claimed.

Exact next step: publish and attach the requested release PR, verify its mergeability/checks, then obtain explicit production release approval. The local technical review and scoped physical acceptance are complete; publication is not authorized. Any required live provider acceptance needs separate scope/authorization. The completed local review/documentation is saved without publication. `GUIDED-RELEASE-QA` local acceptance is complete; release readiness is tracked under `GUIDED-RELEASE-PR`.
