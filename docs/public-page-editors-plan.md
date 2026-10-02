# Public page editors — Programs, Tryouts, Shop, About

Status: **in progress** on `codex/public-page-editors` from `origin/main` at `a413eb6`.
Design concepts were reviewed and approved by Christian on 2026-10-02. The
About closing-button destination was revised to a valid-page dropdown and
approved. The user-provided current `AGENTS.md` instruction retires hosted
Supabase staging; use isolated local Supabase and do not infer that the older
repository copy's staging invariant still applies.

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
  media validation, normalized direct URLs, and cleanup safety. No hosted
  mutations or deployment are part of this branch's local implementation.

## Packages

| ID | Status | Outcome and acceptance evidence required |
| --- | --- | --- |
| PPE-00 | complete | Public canvases and section selection; desktop and phone layouts, keyboard entry, page-scoped Save and recovery. Browser checks described below. |
| PPE-01 | in_progress | About and Club Logo canvases, separate saves, ownership, and valid-page closing destination are implemented. Authenticated Clubhouse and Editorial browser parity passed; response-loss receipts, expected revisions, and empty crest authoring remain. |
| PPE-02 | complete | Programs directory to detail, searchable desktop list and phone chooser, Manage programs, and atomic page-scoped Save. |
| PPE-03 | complete | Tryouts intro/event canvas, add/reorder/edit, filled red Delete event, staged Undo, atomic Save, and photo retirement. |
| PPE-04 | complete | Shop page and separate homepage feature, variant/media controls, page-scoped atomic Save, and disabled-store guard. |
| PPE-05 | in_progress | Local security, database, full-suite, build, and cross-template Chromium checks pass. Clubhouse iOS touch passed; Editorial iOS touch and keyboard checks remain. |

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
