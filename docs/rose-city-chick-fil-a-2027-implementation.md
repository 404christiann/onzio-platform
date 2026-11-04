# RC2027-CHICK-FIL-A implementation

Status: **complete locally** — approved public/admin design, actual Save/upload persistence, final build and independent media/content audit verified. See final acceptance below. Earlier integration-pending paragraphs record source-freeze milestones.

Christian approved the Food & Beverage layout, centered1/2/3 steps, replacement supplied Phosphor W00 Regular, and Details red#CA2F3B. This page’s worker owns only its renderer/CSS/model/query/editor/tests/prepared inputs/scoped document; parent owns all shared integration and runtime windows. Actual checkout `implementation/onzio-platform`, branch `codex/rose-city-homepage-2027`; unrelated dirty work preserved.

## Source implementation and authoring

- `components/cinematic/CinematicChickFilA.tsx` + `chick-fil-a.css` reproduce approved order/framing/aligned icon-caption-number columns, dedicated map, pending match card/seat motif and original restaurant photo. Public/admin use the same renderer; shell/nav/footer belong to the wrappers once. Actual W00 glyphs, Regular400, no artificial outline, fixed approved Details#CA2F3B. Empty removed images render safely; visibility is honored for all6sections.
- `lib/chick-fil-a-content.ts` defines strict content and Save schemas,8 slots,6 visibility flags, canonical fingerprint, strict browser recovery and hydration by scoped media IDs. Authoring includes page title/subtitle/details heading/body,3 labels/numbers, all images/descriptions/removal and all section visibility. Purchase fields are deliberately absent: Tickets owns purchase URL/unavailable message; Homepage owns match heading/announcement/button label; Schedule owns actual fixture/opponent/time/venue and club timezone. Supplied reference terms are design copy, not independently verified operating claims.
- `lib/chick-fil-a-query.ts` loads by tenant, reconstructs alt-only stored artwork with authoritative snake-case UUID columns before strict parsing, and hydrates only same-tenant published/nondeleted media. Invalid delivery buckets/path traversal/URLs supplied in content cannot become public image sources.
- `components/admin/chick-fil-a/ChickFilAEditor.tsx` uses parent generic `loadVisitorPageEditor` / `saveVisitorPageEditor` for page keychick-fil-a. Save is atomic with independent revision, design revision and operationID; pending operations lock draft until exact retry/receipt confirmation. Recovery is scoped by origin/user/club, rejects mismatched pending content/revision, and preserves media/retirement state. Conflict offers latest revision with retained draft instead of overwriting local edits. Async owner-generation checks stop old-club responses mutating current UI. Shared owner links lead to Tickets/Homepage/Schedule. Restaurant upload uses existing `homepage` photo alias;7 graphics use `homepage-artwork`.
- New font folder `public/fonts/phosphor-w00/` is scoped; earlier/global fonts untouched. Exact font/source/asset preparation records are under `assets/rose-city-chick-fil-a-2027/`; original restaurant bytes preserved,7 graphics fit existing graphic limits, only normal publication normalizes delivery.

## Verification completed by page worker

8 narrow tests in3 files pass: `cinematic-chick-fil-a-content.test.ts`, `cinematic-chick-fil-a-renderer.test.ts`, `cinematic-chick-fil-a-recovery.test.ts`. They cover strict unsafe/duplicate ownership input rejection, scoped media hydration, alt-only storage/snake-case reconstruction and tenant/published filters, recovered pending-operation consistency, authored markup/visibility/shared external purchase behavior and response-loss exact-operation reconciliation. No broad snapshots or weakened assertions.

PostCSS parses scoped CSS. All8 prepared input SHA256 hashes verify; restaurant remains original2484×1422/2313985bytes. React checklist reviewed effect cleanup, current-tenant guards, no conditional hooks, batched independent loading, stable visibility/labels, native images, disabled pending controls, semantic form labels/focusable44px controls and shared renderer. Scoped ESLint passes on4 source files; diff whitespace check passes. No app build, full-suite, DB execution, runtime restart or hosted operation by this worker.

Approved isolated design evidence remains outer `review-notes/chick-fil-a-2027/`, including latest `details-w00-checks.json`, `details-w00-desktop.jpg`, `details-color-source.json` and earlier geometry/screens. Browser viewport1280/390/320 checks establish preview width/step alignment; they are not physical-phone/Safari/VoiceOver acceptance.

## Exact remaining integration and acceptance

Parent wires `/stadium/chick-fil-a`, `/admin/chick-fil-a`, API/shared save plumbing/schema/media contracts and guarded isolated local seed; generates database types; builds/restarts shared app3198. Then verify actual public desktop/phone reference parity, exactly one shell, all delivery assets/font/Details color, no overflow, real Schedule announcement; admin edit→Save→reload→public persistence for copy/step number/visibility/real image replacement, strict conflict/retry/receipt/recovery and preserved other-page content/media. Confirm combined tests/lint/types/build and update scoped status with evidence before calling complete.

No production/hosted write, deployment, commit or push authorized. Physical-phone and production launch acceptance remain open.

## Actual local public and editor acceptance — 2026-10-13

Parent integrated public `/stadium/chick-fil-a`, admin `/admin/chick-fil-a`, atomic API/schema/media publication and started local3198. Parent reports combined TypeScript/build/lint plus222file/1999test suite passing before its latest narrow phone-caption/shared preview-frame fix. The page worker made no shared source/runtime/database command changes.

Actual Chrome1280/390/320 public checks show exactly1header/footer, supplied Phosphor W00 Regular400 loaded with Detailsrgb(202,47,59), settled actual Schedule announcement and inactive Tickets purchase link. Native15px scrollbar gives available widths1265/375/305 respectively; document/body scroll widths match available width with0overflow. All normal public media load, including original restaurant normalized once to2400×1374. Icon and number baselines align exactly; at305px available width the third caption wraps in its centered shared row. Parent has authored a main-owned narrow max360 padding adjustment to keep original captions single-line; fresh latest-build checks remain parent-owned. Initial fallback header/footer/loading state was allowed to settle before conclusions. Chrome fullPage screenshot exports can move the sticky header; use `desktop-top.jpg` for native desktop visual evidence instead of counting headers in that export.

Actual signed-in desktop Save→reload→public passed for temporary subtitle, step number01 and restaurant visibilityfalse. Phone Save restored the exact approved subtitle, number1 and visible restaurant; subsequent editor reload and public read agree. All initial/restored editable input values and8image URLs match exactly (asserted), no retired identities resurrected, no shared Tickets/Homepage/Stadium/branding changes. Evidence: outer `review-notes/chick-fil-a-2027/implemented/persistence.json`, `admin-initial.json`, `desktop-save.jpg`, `phone-save-restored.jpg`, `browser-checks.json`, `desktop-top.jpg`, `phone.jpg`, `phone-320.jpg`. Chrome local login used only synthetic actor owner-aal2@alpha.local and isolated Mailpit55324; no hosted authentication.

Chrome’s filechooser setter is blocked because the ChatGPT extension’s file URL access is disabled. The attempted meal-pass selection stopped before a file was set or a backend upload began; all8media URLs stay unchanged. No extension security permission was changed. Parent now owns its IAB normal upload acceptance for `assets/rose-city-chick-fil-a-2027/inputs/mealPass.png`; this is an alternative browser path, not a product upload failure. Worker released the Chick content and Chrome viewport windows and reset the override; current code remains frozen for parent’s final build.

Remaining: parent IAB actual image upload→Save→reload→public, restored original bytes under a new published identity if replacement retires old source; latest build public caption and preview-frame guard checks; independent DB/content/media preservation. Browser viewport verification still does not establish physical-phone/Safari/VoiceOver acceptance. No deployment/production launch.


## Final local acceptance — 2026-10-13

Both accepted visitor pages are complete locally on3198, with public/admin
routes, independent atomic Save, editable copy/sections/images, supplied W00
meal-pass red and real Avenir Heavy headings. Desktop/phone-width saves and
normal meal-pass/photo/map uploads passed; approved copy and phone crops restored.
Final11 media references/checksums pass; shared original Tickets artwork remains
published. Final combined build/lint/types pass;222-file/1999-test full suite
and final7-file/25-test focused rerun pass. Source-freeze pending notes above are
historical. Canonical integration details and final evidence are in
docs/rose-city-stadium-food-2027-design.md, under Final local implementation
acceptance. Physical-device/VoiceOver and existing release gates remain open;
no commit/push/hosted write/deployment. User local review is the next step.
