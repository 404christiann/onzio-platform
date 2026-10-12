> Historical two-page workspace evidence at `baa66c1`. The approved Simple
> switch now combines both views at `84f46fe`; current evidence is recorded in
> `docs/admin-stats-simple-switch-verification.md`.

# Season and Match Stats Player workspace verification

Prepared 2026-10-11. Local implementation is complete at application source
`baa66c1` on `codex/admin-guided-redesign`. Release acceptance remains open for
physical-phone touch/paste and a phone screen-reader walkthrough. No push, PR,
remote merge, deployment or hosted mutation was performed.

## Approved behavior and preservation

Christian selected A, Player workspace, and requested the same interaction for
Match Stats. Desktop keeps a searchable position-grouped roster beside the
selected player's grouped fields. Phones use the roster → editor → All players
flow. Selection, search and collapsed groups retain page-owned drafts. Switching
a season or match offers Save & switch, Discard changes and Cancel; failed saves
retain both the draft and the original context. Dirty players and position groups
are marked, and reverting edits clears their dirty state.

All ten outfield and seven goalkeeper fields remain available. Season starts
are numeric; Match starts remain boolean with a native checkbox styled as a
switch. Both pages retain their cohort rules, stale-response guards, loading and
failed-read barriers, whole-scope grouped upserts, conflict keys and Editorial
template redirect. Season totals remain manually entered and independent of
Match Stats. A browser stress fixture exposed the existing Match minutes range
of 0–300; the UI now shows and enforces that limit, including disabling increment
at 300. Season minutes remain unrestricted. No schema, API, auth, RLS, public
page, navigation, shared global control or icon edits were made.

Shared components and CSS are scoped under `components/admin/stats/`. Mobile
inputs use 16px text and 44px controls. A 900px breakpoint covers representative
phone landscape; safe-area padding and actual visualViewport/header/Save-bar
measurements keep numeric focus and Save reachable. Native validation below is
Simulator evidence, not physical-device acceptance.

## Final checks

| Check | Result | Evidence |
| --- | --- | --- |
| Integrated TypeScript | passed | `/private/tmp/onzio-stats-tsc.log` |
| Whole-project lint | no warnings or errors | `/private/tmp/onzio-stats-lint.log` |
| Production build | passed | `/private/tmp/onzio-stats-build.log` |
| Complete legacy/contracts/architecture/local database suite | 187 files, 1,783 tests passed in 43.25s | `/private/tmp/onzio-stats-full.log` |
| New workspace browser regression | 4 passed in 32.7s | `/private/tmp/onzio-stats-workspace-browser.log`; `tests/browser/admin-guided-stats-workspace.spec.ts` |
| Retained management regression | 2 passed in 23.8s | `/private/tmp/onzio-stats-management.log` |
| Stats/schedule loading regression | 5 passed in 2.3s | `/private/tmp/onzio-stats-loading.log`; `tests/browser/admin-loading-stats.spec.ts` |
| Actual-app layout matrix | 20 editor cases passed, plus 12 phone roster captures | `evidence/player-workspace/report.json`; `/private/tmp/onzio-stats-captures.log` |
| Native Safari persistence | 2 Save/reload flows passed on iPhone 17 Simulator, iOS 26.5 | `evidence/player-workspace/native/` |
| Independent source review | no remaining actionable findings | Shared/Season and Match reviewed after integration; root reviewed the minute-limit refinement |
| Whitespace | passed | `git diff --check` |

The new browser suite runs each page at 320/390/1440px, renders both themes,
edits every outfield/goalkeeper field, verifies historical inactive players,
retains drafts while changing player and searching, checks larger Season totals,
Match minute boundaries, phone viewport shrink, and real whole-scope Save/reload.
Separate checks cover cancel/discard/success/failed Save & switch, Match season
switch cancellation and independence from Season totals. Original seven-table
fixture snapshots are compared exactly after cleanup in every case.

Existing management assertions were retained; only the new player-selection
steps were added. Existing loading checks replace incidental old grid-index
locators with the exact player/goal field names and keep identical expected
values. Failed reads still expose no editable defaults; late responses still
cannot overwrite the current scope. Collapsed-group `aria-controls`, `inert`
and keyboard assertions remain intact. Added long-roster phone navigation checks
verify that Back/search appear below the shell and edited totals survive return.
Management fixtures restore the original twelve tables exactly.

## Native Safari and fixture restoration

The existing loopback-only device proxy on 3111 routes to the local Alpha build
on 3110. No tenant, authentication or CSRF rules were changed for device access.
Six fictional review players, one inactive season and one match were held after
all database/browser fixture writers finished. Captures were completed before
native writes so each Before/Guided pair has identical values.

On iPhone 17 Simulator, Season goals changed 6→7; the native numeric keyboard
left both the focused input and Save visible. Tapping Save with that keyboard
open produced success; reloading/reselecting the season and player showed 7.
Match goals changed 1→2 using the actual software number pad and Started changed
true→false. Save with the keyboard open succeeded; reload/reselection retained
both 2 and the off switch. A local database read independently confirmed Season 7,
Match 2 and false starts. A native landscape capture shows safe-area spacing and
the visible fixed Save bar; landscape keyboard acceptance was not separately
recorded. Screenshots are under `evidence/player-workspace/native/`.

The disposable review fixture was then removed. All original seven local table
snapshots matched exactly, including full row contents/timestamps. Cleanup proof:
`/private/tmp/onzio-stats-review-cleanup.log`. The restored snapshot is private at
`/private/tmp/onzio-stats-review-fixture-restored.json`; authentication and service
credentials are never served by the preview or committed.

## Delivery and reproduction

Open `http://127.0.0.1:8768/stats-workspace-review.html` for actual-app desktop/
phone, light/dark, and phone roster/editor captures. This page is a screenshot
review, clearly labeled with fictional data, and links to the local portal.
The existing `review.html` gallery now has refreshed Season/Match Before and
Guided images: eight pairs at 1440/390px in both themes against baseline 41bfb00.
Its other seventeen routes retain their prior 9a001c1 captures/evidence.

Layout captures also cover 1024px tablet and 844×390 landscape. The original
baseline phone tables give the player name column zero width; this verified
legacy limitation is preserved accurately in Before captures, not patched.
The helper waits for the baseline player record to be attached and an actual
input to render. Current workspace captures require rendered fields, expected
theme, visible Save, no overflow, no duplicate IDs, 16px inputs and no errors.

Browser reproduction uses the existing local authenticated state and configs:

```bash
set -a
source .env.test
set +a
ADMIN_GUIDED_STORAGE_STATE=/private/tmp/onzio-guided-auth.json npx playwright test --config=playwright.admin-guided.config.ts tests/browser/admin-guided-stats-workspace.spec.ts tests/browser/admin-guided-management.spec.ts
ADMIN_LOADING_STORAGE_STATE=/private/tmp/onzio-guided-auth.json npx playwright test --config=playwright.admin-loading.config.ts tests/browser/admin-loading-stats.spec.ts
```

Keep database fixture writers serialized. Current-session curated capture
helpers are `/private/tmp/onzio-stats-review-fixture.cjs` and
`/private/tmp/capture-stats-workspace.cjs`; preparing another fixture must not
overwrite an unrestored snapshot. Gallery evidence is intentionally ignored.
Next release step: physical phone touch/paste and screen-reader acceptance,
then explicit publication authorization. Historical Guided verification remains
in `docs/admin-guided-redesign-verification.md`.
