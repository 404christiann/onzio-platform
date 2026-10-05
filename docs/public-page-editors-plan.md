# Public page editors — Programs, Tryouts, Shop, About

Status: **release in progress** on `codex/public-page-editors-release` from `origin/main` at `5b07964`.
Design concepts were reviewed and approved by Christian on 2026-10-02. The
About closing-button destination was revised to a valid-page dropdown and
approved. The user-provided current `AGENTS.md` instruction retires hosted
Supabase staging; use isolated local Supabase and do not infer that the older
repository copy's staging invariant still applies.

## Final acceptance and release ledger — 2026-10-05

Scope: PPE-00 through PPE-05, Programs, Tryouts, Shop, About and Club Logo. Christian explicitly authorized review/fixes, a PR into main and the release. Contact shipped in PR #10 and its editor/API/public renderer/migration/tests remain unchanged. Original checkout OTP changes and the original editor branch are preserved. Release branch is `codex/public-page-editors-release`, based on main `5b07964`.

**Review and fixes:** independent full-diff review, fixes and fresh follow-up review completed with no remaining findings. Fixed exact ambiguous-save retries, availability changes after a committed receipt, publication lock ordering (281 before page locks), malformed revisions, About/Logo page isolation and durable cleanup, empty Editorial Values/Closing and first crest/color authoring. Rebuilt browser traces identified actual fixed Save-bar interception; a shared measured phone scrollport fixes it without changing iframe CSS viewports. Stable iframe identity restores focus after replacement/redecoration. About tools now have an opaque theme-aware background. Relevant source, routes, migrations, regression tests and this package ledger are updated.

**Passing gates:** TypeScript, lint, production build and diff check; 1044 contract tests, 21 architecture tests, 310 database tests, 1778 full-suite tests. The 51 focused SQL tests include actual independent-session publication locks, committed receipt recovery after page availability changes and purge isolation. Full suite preceded the last UI scrollport/CSS changes; current contracts and the rebuilt browser matrix cover those changes. No assertion was deleted or weakened. Two browser locators now use the exact accessible textbox role; the Shop recovery helper reopens intentionally closed tools.

**Browser evidence:** all 38 distinct cases pass across Academy (29), Cinematic (7), Editorial (3) and Clubhouse (1), including true 390/1440 CSS viewports, original phone selection/focus cases, new actual target geometry, response loss, exact retry, two-admin conflicts, real About persistence, first empty sections and Logo cleanup isolation. Academy evidence is split between 17 successful initial cases and 12 successful corrected-locator recovery cases; the preserved interrupted log is not represented as a single all-green run. Logs: `/private/tmp/onzio-editors-final-{academy-browser,recovery-browser,cinematic-browser,editorial-browser,clubhouse-browser}.log`. Eight local About public comparisons across four templates and two widths match before/after and have no horizontal overflow.

**Native evidence:** authenticated iPhone 17 / iOS 26.5 Safari against loopback 3111 and synthetic local Supabase. About (Editorial), Club Logo (Clubhouse), Programs, Tryouts and Shop all received real keyboard input, saved using reachable controls above the actual software keyboard and persisted after Safari reload/navigation. About was restored through UI; Logo feature was removed and saved through UI. Shop's deliberately empty fixture initially failed the required nonempty bullet validation; adding a bullet through the software keyboard saved successfully and persisted. Program title, a disposable Tryouts event and a generated local normalized Shop photo are isolated fixtures being cleared by the final local reset. Screenshots `/private/tmp/onzio-editors-native-{about,logo,program,tryouts,shop}-keyboard.png` show actual native controls. Native CUA input recovered; the older noWindowsAvailable blocker is superseded. CUA scroll/drag did not reliably synthesize touch scrolling; lower fields were reached through native focus/autoscroll and then edited with the software keyboard. Physical-device touch scrolling and VoiceOver are unverified, not claimed as passes.

**Release preparation:** verified production project `ioalthwsdrlzrubomrow`, READY rollback deployment `dpl_Az73kmJYxZKmoP3nFaL3TEVrSsLt`, completed physical backup `1876532319` and protected fresh schema/data dumps with 55 matching table/COPY sections. Four exact pending editor migrations pass an isolated linked dry-run; unrelated email-branding migration is excluded. Production content counts/fingerprints for 14 tables are unchanged. Diverse City FC baseline includes 13 routes at desktop and phone (26 records), no overflow, and 36 successful image URL checks. Preview auto-deploy is disabled for this PR branch because hosted preview DB targeting is unverified; main auto-deploy remains enabled.

**Status/next step:** PPE-00 through PPE-04 complete with the above evidence; PPE-05 remains in_progress until the authorized PR, production migrations/main deployment and post-release public parity are recorded. No production mutation, push or PR has yet occurred at this entry. Refresh main, simulate the merge, open/attach PR, verify the exact pending migration package and current backup/fingerprints, apply those four migrations without seeds/roles/content writes, merge the checked PR and verify matching READY production plus public parity. Preserve the rollback deployment and backup.

## Shared contract

- The club's real public page is the editing canvas. A visible section opens
  its contextual tools when selected. Desktop has adjacent tools; phone uses
  a bottom sheet with reachable Save and Done controls.
- One explicit, atomic Save applies the selected public page only. Switching
  pages must preserve or explicitly resolve unsaved work. Failed or uncertain
  saves keep the draft and offer recovery.
- Render template-specific public composition and the club's actual content,
  fonts, media, and ordering. Fixed content explains Onzio ownership. Shared
  content links to its existing owner and states where edits also appear.
- Preserve authorization, tenant RLS, source-backed route/feature availability,
  media validation, normalized direct URLs, and cleanup safety. Christian explicitly authorized the reviewed release into main on 2026-10-05;
  hosted release changes follow verified backups, exact migrations and public parity.

## Packages

| ID | Status | Outcome and acceptance evidence required |
| --- | --- | --- |
| PPE-00 | complete | Public canvases and section selection; desktop and phone layouts, keyboard entry, page-scoped Save and recovery. Browser checks described below. |
| PPE-01 | complete | Selected-page revisions, actor receipts, exact retry, cleanup, empty sections and crest/color authoring; 310 DB / 1778 full / 38 cross-template browser cases and native About/Logo Save/reload accepted. See final acceptance below. |
| PPE-02 | complete | Programs directory to detail, searchable desktop list and phone chooser, Manage programs, and atomic page-scoped Save. |
| PPE-03 | complete | Tryouts intro/event canvas, add/reorder/edit, filled red Delete event, staged Undo, atomic Save, and photo retirement. |
| PPE-04 | complete | Shop page and separate homepage feature, variant/media controls, page-scoped atomic Save, and disabled-store guard. |
| PPE-05 | in_progress | Review clear; 1044 contracts, 21 architecture, 310 DB, 1778 full tests, lint/TypeScript/build and 38 browser cases pass. Native five-editor Save/reload passes; main release and post-deployment public parity remain. |

No package is complete until its behavior, tests, browser evidence, and
remaining limitations are recorded here. Implement one contract area at a
time. Do not weaken existing tests to fit the redesign.

## Source and design evidence

- Homepage exemplar: `components/admin/homepage/HomepageEditor.tsx`,
  `HomepagePreviewFrame.tsx`, and `docs/homepage-editor-redesign-plan.md`.
- Current editors: `app/admin/(protected)/{programs,tryouts,shop,about}/page.tsx`.
- About public route dispatches `EditorialAboutPage`, `ClubhouseAboutPage`,
  then `AboutClubPageClient`; current `ScaledAboutPreview` omits the Clubhouse
  branch. `ClubLogoPageClient` owns the separate crest page.
- Existing route option shape: `lib/site-routes.ts`. Its static list must be
  filtered against the tenant's published/available routes before About uses
  it; legacy unmatched values require explicit review, not silent coercion.
- Accepted visual/interaction artifacts are in the task's
  `design-plans/` directory: Programs navigation, Tryouts, Shop page choices,
  and About page canvas plans and HTML concepts.

## PPE-01 review fixes — 2026-10-05

- Status: **in_progress**; implementation complete, acceptance pending.
- Completed: selected-page About/Logo RPC snapshots, independent revisions including legacy writes, actor receipts and original operation retries after network/500 ambiguity; explicit conflict reload; shared phone dialog; Add/Remove for first About values, crest features and color cards; selectable empty Logo sections; durable reference-safe media cleanup retries.
- Security fixes: receipt recovery precedes current page availability, design/store/content serialize with lock281 then290, tenant purge cascades the new private tables, SQL checks exact published/supported closing destinations, all newly resolved top/nested media persist canonical tenant storage paths with trusted-origin API/public hydration.
- Files: About page/API, `lib/about-editor/*`, About canvas/CSS, `components/ClubLogoPageClient.tsx`, About-only `lib/queries.ts`, CLI-generated migration `20261005160543_about_page_editor_receipts.sql`, unit/public query/source/direct SQL/browser regressions, `HANDOFF.md` and this ledger.
- Evidence: focused About + Editorial source checks **60/60**, source contracts **1012/1012**; actual public query regression protects nested Logo URL hydration and malformed legacy JSON normalization. Three PL/pgSQL CASE comparisons corrected after parent local apply diagnosed syntax. Direct SQL regressions and six real-save browser cases are written; implementation subagent did not run DB/browser/native fixtures.
- Blockers/limits: parent local SQL migration/type generation/full-suite gates, real-save browser fixtures and native keyboard/focus/Save/Done validation, public preservation and fresh review. Chromium viewport simulation does not prove native keyboard behavior.
- Exact next step: parent completes those acceptance gates and records evidence before package completion and authorized PR work. No commit or hosted actions by implementation subagent.

### Editorial empty-section selection follow-up — 2026-10-05

- Package: PPE-01 **in_progress** pending parent acceptance.
- Fixed: About canvas now adds editor-only selectable Values/Closing targets when Editorial omits those empty sections. Public Editorial/Clubhouse/generic About renderer sources remain unchanged. About iframe selection focuses the target; closing tools restore focus to the replacement public section after authoring makes an empty section visible.
- Files: About canvas/CSS, `tests/browser/public-page-about-save.spec.ts`, handoff/ledger/README.
- Evidence: TypeScript passed; two browser regressions written for 1440px/390px Editorial empty values and closing, first value creation, destination selection, Save payload and focus restoration. These mock only empty snapshot/Save HTTP outcomes and do not claim persisted/native acceptance.
- Exact next step: parent rebuilds, runs these Editorial cases separately from Cinematic Logo fixtures, then native/public acceptance and independent review. No DB/hosted/browser/Simulator run or commit by this subagent.

### Removed unsaved Logo item cleanup follow-up — 2026-10-05

- Package: PPE-01 **in_progress** pending final acceptance.
- Fixed: before removing a crest feature/color draft, queue its patch/icon/color image URLs into the Logo-only cleanup candidates. Saving About preserves those candidates; Logo Save carries them in the durable actor receipt for existing reference-safe retirement.
- Files: About admin page, upload/remove selected-page browser regression, handoff/ledger/README.
- Evidence: TypeScript and diff check passed. Browser regression written for actual item upload/removal and About→Logo Save flow with isolated HTTP media/save outcomes; parent must execute it. No actual storage deletion/runtime acceptance claimed here.
- Exact next step: parent rebuilds and executes the focused browser case with the Cinematic fixture, then final independent review/acceptance. No commit or DB/browser/native/hosted actions by this subagent.

### Shared phone iframe focus/selection follow-up — 2026-10-05

- Package: PPE-00 / PPE-05 **in_progress** for final acceptance.
- Actual failures: Programs original phone test lost selected hero focus after Escape; Tryouts introduction click did not open tools, blocking both phone cases and recovery field lookup. Failure traces preserved by parent under `/private/tmp/onzio-editors-first-browser-failures`.
- Fixes/files: stable preview selection markers and current-node restoration after React decoration in `lib/page-editor-focus.ts`, shared `PageEditorInspector`, Program/Tryouts frames, ScaledTryoutsPreview and optional admin-only Academy/Editorial Tryouts target IDs. No public Tryouts content/layout change.
- Evidence: TypeScript passed; five identity/replacement/duplicate-label/detached-frame unit specifications written, original browser assertions preserved. Per parent coordination, no extra gate/browser run by implementation subagent.
- Exact next step: parent rebuilds and reruns original Academy phone/recovery and Editorial cases, then final native/public review. Native input is presently blocked by CUA `noWindowsAvailable`; this is not accepted native evidence.

### Phone preview target obstruction — 2026-10-05

- Package: PPE-00 / PPE-05 **in_progress** pending rebuilt acceptance.
- Verified cause: the second Tryouts failure trace clicked `(195, 785.81)` under the fixed Save strip on 390×844, despite a successful iframe-local hit test. Initial HTTP data had settled; the frame document did not change.
- Fix/files: shared measured `usePageEditorScrollport.ts`, Tryouts editor wrapper/Save-strip refs, and independent first-selection outer-coordinate browser regression. The persistent Save strip and public preview CSS width/composition are preserved; original phone assertions remain unchanged.
- Evidence: TypeScript and diff check pass. Parent owns unchanged browser reruns, recovery/native/public gates; no runtime acceptance claimed by implementation subagent. About's analogous integration is coordinated with the backend reviewer.
- Exact next step: rebuild and rerun both unchanged Tryouts phone cases plus target geometry regression, then complete remaining release acceptance.

## PPE-01 decisions

- Select About or Club Logo where supported; Academy and Editorial hide Club
  Logo per the current admin gate and accepted design. Save only the selected
  page. Preserve each page's pending media replacements until its own Save.
- Clubhouse public About uses a fixed hero; sponsors belong to Sponsors;
  mission copy appears in both story and closing. Its editor preview must
  match `ClubhouseAboutPage` rather than the generic component.
- Academy closing CTA keeps its existing fixed `/schedule` destination.
  Others select a valid page from a dropdown. The menu is populated from
  routes actually available to the club; no free-form path entry. Existing
  unknown destinations remain visible and must be resolved before Save.
- Verify route availability against actual published navigation and the
  route/template/feature registry. The current registry and some physical
  routes differ; do not silently expose an unapproved page in the picker.

## PPE-01 verification

1. Focused contracts for About page/Logo save scope, route choices, and
   public-preview dispatch, plus existing Editorial About/admin contracts.
2. Local authenticated browser review of Academy, Clubhouse, Editorial, and
   generic public/editor parity at desktop and phone sizes.
3. Failure/unsaved navigation and media replacement checks. Run TypeScript,
   lint, narrow tests, architecture, local database, full suite, and build
   per repository instructions before marking complete.

## Status ledger


### 2026-10-05 — remaining-editor release integration

- Packages: PPE-01 and PPE-05 remain **in_progress**. Existing implementation evidence for PPE-00 and PPE-02 through PPE-04 is preserved; final release review/fixes and acceptance remain to be completed.
- Branch: `codex/public-page-editors-release` starts from current main `5b07964`. Cherry-picked only `31ac6cb` and `964e4dc` as `222f0ca` and `9ab48bf`. Original `codex/public-page-editors` and its complete history are preserved. Contact is already released in main and its editor/native fixes/migration/tests were retained unchanged.
- Integration files: imported remaining-editor implementation/tests/plan; conflict resolution only in `HANDOFF.md` and `tests/contracts/editorial-admin-surface.test.ts`, with main's nullable cleanup `p_actor_id` override retained in generated types. Added current integration documentation. No broad functional fixes yet.
- Verification: TypeScript, 1002/1002 source/behavior contract tests and diff check passed. A path-specific comparison confirmed no Contact editor/API/canvas/public renderer/contract/migration/browser/database-test, auth-helper or Vercel-setting difference from main.
- Blockers: inherited About/Club Logo response-loss/concurrent-save receipts and empty-crest authoring gaps; remaining native acceptance and the fresh independent review. No database reset, browser/Simulator, hosted action, push or PR in this integration step.
- Exact next step: review the complete remaining-editor branch diff against main, coordinate user-authorized fixes, then isolated local/native validation and another review before the requested PR.

### 2026-10-02 — cross-template browser and iOS follow-up

- Packages: PPE-00 remains **complete**; PPE-01 and PPE-05 remain **in_progress**. PPE-02 through PPE-04 remain **complete**.
- Completed: authenticated local Lions `editorial@1` and temporary `clubhouse@1` About previews were compared with their public pages at 1440px and 390px. Both returned 200 with matching page copy, the expected template composition, no page errors, and no horizontal overflow. Clubhouse showed its fixed hero and sponsor ownership targets; Editorial showed only About, without a Club Logo tab. The About iframe now uses 390px Phone and 1440px Desktop CSS viewports, scaled to fit the admin canvas, so the phone heading wraps like the real page. A local browser regression taps a section and checks both viewport widths on Clubhouse and Editorial.
- iOS Safari: on the booted iPhone 17 Simulator through the loopback device proxy, authenticated Clubhouse About and Club Logo canvases rendered; touch selection opened the fixed-heading and crest-feature bottom sheets, Done closed a sheet, and the sheet Save remained reachable above Safari's bottom controls. A later fresh Safari navigation returned to login, so Editorial touch, real keyboard focus, and a full Save on iOS remain unverified.
- Tenant content defect fixed: a Clubhouse tenant without an About or Club Logo row could see Rose City story, crest feature, and color-card defaults in the editor, and an empty Save could publish them. Tenant-scoped normalization and Save preparation now keep absent arrays empty; the historical no-tenant Rose City defaults remain available. The local Lions Club Logo row was absent, and a fresh Chromium editor showed no Rose City text after the fix. New tenants still lack controls to add the first crest feature or color card; this is an authoring gap, not accepted completion.
- Files changed: `components/admin/about/{AboutPageCanvas.tsx,about-editor.css}`, `app/admin/(protected)/about/page.tsx`, `lib/{about-content.ts,queries.ts,about-editor/save.ts}`, focused unit tests, `tests/browser/public-page-about-viewport.spec.ts`, its Playwright config, `tests/README.md`, this ledger, and `HANDOFF.md`.
- Save-protocol assessment: each selected page is one server-mediated row upsert, so a successful statement is atomic and does not write the other page. A failed response keeps the draft, but there is no actor-scoped operation receipt/status lookup or expected revision. If a response is lost after commit, the editor cannot distinguish commit from rollback; another Save can repeat the write and silently overwrite a concurrent admin edit. Retired-image cleanup also cannot be recovered from a lost response. The error now asks the admin to check the live page before retrying. This is a documented acceptance limit, not equivalent to the Programs/Tryouts/Shop RPC protocol.
- Verification: focused About/Editorial contracts 48/48; TypeScript, lint, 1001/1001 contracts, 21/21 architecture checks, and 261/261 local database tests passed. Local Supabase was reset after browser checks; the first reset failed during container recreation, and the diagnostic retry completed. The full suite passed 1656/1656, production build passed, and final TypeScript and diff checks passed. No hosted mutation, push, PR, preview, or deployment occurred.
- Blockers: the About/Club Logo response-loss and concurrent-save protocol, empty Club Logo page authoring, and Editorial/keyboard iOS Safari checks remain. The iOS proxy sign-in worked for one Clubhouse session but a fresh navigation returned to login.
- Exact next step: implement the selected-page revision/receipt protocol and empty Club Logo creation controls under the existing one-Save contract, then exercise response-loss, two-admin conflict, media cleanup, and an authenticated Editorial iOS Safari touch/keyboard pass. Complete final verification and review before marking PPE-01/PPE-05 complete. Seek separate approval before any push or hosted preview.

### 2026-10-02 — implementation and local acceptance

- Packages: PPE-00, PPE-02, PPE-03, PPE-04 **complete**; PPE-01 and PPE-05 **in_progress**.
- Completed: Academy Programs directory/detail and Manage navigation; Tryouts staged Delete/Undo and photo cleanup; Shop page choices; About and Club Logo canvases and page-scoped saves; valid internal About destination dropdown; template availability gates; phone-first preview selection; RPC response-loss receipts for Programs, Tryouts, and Shop. Fixed the Tryouts confirmation portal so both Delete controls render filled red with white text. Raised the mobile About/Club Logo sheet Save footer above scrolling media so its touch target remains usable.
- Files changed: admin editors and public preview components; new `components/admin/{about,shop,tryouts}` and `lib/{about-editor,program-page-editor,shop-editor,tryouts-page-editor}`; page API routes; three checked-in migrations; generated database types; focused contracts and database tests; `scripts/homepage-local-auth.mjs` selector; this ledger and `HANDOFF.md`. No hosted data changed.
- Verification: final isolated local Supabase reset applied all migrations; TypeScript passed; 1001/1001 contracts, 21/21 architecture checks, 261/261 database tests, 1653/1653 full-suite tests, production build after the final CSS change, and `git diff --check` passed. Chromium on the built app at 1440px and 390px showed each editor's public canvas with zero page errors or horizontal overflow. Programs navigation/section selection, Tryouts Delete/Undo and red/white confirmation, Shop page switch, About Save/reload/restore, Club Logo selection and Save/reload/restore on a temporary synthetic Bravo fixture, About destination choices, and keyboard entry were checked. The footer fix was checked in the local browser. Bravo's fixture lifecycle was restored afterward.
- Blockers/limits: iOS Safari touch behavior and authenticated Clubhouse/Editorial browser parity have not been exercised. About and Club Logo use one tenant-row server-mediated upsert per Save; this inherited path does not have the operation receipt/concurrent revision protocol used by the new Programs, Tryouts, and Shop RPCs. No push, PR, hosted preview, or production release occurred.
- Exact next step: complete the remaining Clubhouse/Editorial and real-device browser matrix, then review the branch diff. Request separate approval before any push, hosted preview, or deployment.

### 2026-10-02 — planning checkpoint

- Package: PPE-00 / PPE-01, **in progress**.
- Completed: design decisions accepted, isolated branch created from main,
  public/About/Club Logo source and existing editor contracts traced.
- Files changed: this plan only. Design artifacts live outside the repo in
  the task visualization workspace.
- Verification: design prototype passed static HTML/JS/asset checks. Product
  implementation and tests have not started.
- Blockers: none for local implementation. The exact destination list must
  be resolved from published routes during PPE-01.
- Exact next step: implement the About/Club Logo page selector, page-scoped
  save, template-accurate canvas and destination dropdown, then run focused
  contracts before proceeding to other packages.
