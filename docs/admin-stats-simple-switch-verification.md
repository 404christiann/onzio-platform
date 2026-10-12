# Combined Stats Simple switch — verification

Prepared 2026-10-11. Application source `84f46fe` on
`codex/admin-guided-redesign` implements Christian's approved A. Local
implementation is complete; physical-phone touch/paste and screen-reader release
acceptance remains open. No push, PR, remote merge, deployment or hosted mutation.

## Result and preservation

One Stats destination appears under Competition and in authorized search.
Match stats / Season stats tabs share the season picker, selected player, phone
list/detail state and held match selection. Each view has explicit editing
context and a distinct Save match stats / Save season totals action. The
canonical route is `/admin/stats?view=match|season`; the old `/admin/season-stats`
route redirects to the Season tab. The default Stats entry opens Match stats.
Editorial continues to hide Stats and reject direct access to either entry path.
All other route order, icons, role/template and billing filters remain intact.

Only the active editor mounts. Its original cohort, all ten outfield/seven
keeper fields, stale-read cancellation, loading/failure barriers, grouped upserts
and conflict keys are preserved. Season starts remain numeric; Match starts
remain boolean, Match minutes retain 0–300, and manual Season totals remain
independent. Shared state lives outside the active editor and pending-navigation
boundary. No schema, API, authentication, RLS or public-page behavior changed.

Tab, season and match changes protect unsaved edits with Cancel, Discard changes
and Save & switch. A failed or thrown save retains its context and draft. Review
found a stale-baseline window after Season Save & switch; restoring baseline is
now exclusive to Discard. `useTransition` disables the entire active editor and
header controls during accepted view navigation. A held router-response regression
proves freshly saved 33 remains 33 and cannot be edited/saved again while waiting.
Accepted view changes restore keyboard focus to the selected tab after commit;
initial loading and Cancel do not steal focus. Independent source review cleared.

## Final evidence

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript | passed | `/private/tmp/combined-stats-tsc.log` |
| Whole-project lint | no warnings or errors | `/private/tmp/combined-stats-lint.log` |
| Production build | passed | `/private/tmp/combined-stats-build.log` |
| Complete legacy/contracts/architecture/local database suite | 187 files, 1,784 tests passed in 43.37s | `/private/tmp/combined-stats-full.log` |
| Stats workspace + new switch/browser regressions | 7 passed in 45.9s | `/private/tmp/combined-stats-workspace-browser.log` |
| Retained management flows | 2 passed in 46.3s | `/private/tmp/combined-stats-management.log` |
| Loading/stale-read/failure/long-roster flows | 5 passed in 4.4s | `/private/tmp/combined-stats-loading.log` |
| Responsive actual-app captures | 20 view/viewport/theme cases passed | ignored `evidence/combined-stats-implemented/report.json`; `/private/tmp/combined-stats-captures.log` |
| Independent review | no remaining actionable findings | reviewed frozen parent/editors/workspace/navigation/tests |
| Fixture cleanup | exact original seven-table snapshot equality | `/private/tmp/combined-stats-review-cleanup.log` |
| Whitespace | passed | `git diff --check` |

The workspace suite preserves existing full-field persistence assertions at
320/390/1440px in both themes. New 320/1440px flows verify legacy redirect, single
navigation item, held season/player/match/phone-detail selection, numeric/boolean
starts, Cancel/Discard/failed-save/retry, real independent DB totals, keyboard
focus, both themes and large tab targets. The delayed RSC case holds the next
view while checking the saved source field and disabled input/Save/tabs.

Existing browser updates change only approved Save/header labels and wait for
Back or Search after scope loading before selecting a player. Existing values,
DB assertions, failure barriers, group/inert and keyboard assertions remain.
Navigation contracts change exact cardinality 19→18 and Editorial hidden
canonical destinations 4→3 because the two Stats destinations became one;
all other exact hierarchy/access expectations remain. A new contract requires
one Stats result searchable by both match and season terminology.

All fixture writers ran serially against verified loopback Supabase. Workspace
fixtures compare the original seven full tables in `finally`; management compares
its original twelve. The held screenshot fixture used only six fictional players,
one inactive season and one match; it was restored exactly after captures.
Authentication state and original snapshots remain private and outside Git.

## Review and limits

Open `http://127.0.0.1:8768/stats-simple-switch-review.html` for actual application
captures with clearly labeled fictional review players. View/Screen/Theme and
phone roster/editor controls cover both tabs. The live local app is
`http://alpha.localhost:3110/admin/stats`; authentication is required.

Capture sizes: 1440×1000 desktop, 390×844 and 320×740 phones, 1024×768 tablet,
844×390 landscape, both views and themes. Checks include no document overflow,
16px numeric text, visible Save at the editing position, 44px tabs, unique IDs,
correct themes and no page errors/alerts. Desktop review screenshots return to
the heading in a normal viewport so full-page sticky-header painting cannot
obscure the switcher. Phone roster captures show the top-level switch; detail
captures show player entry. These are browser layout evidence, not new physical
hardware or native-keyboard acceptance. Prior native workspace evidence remains
historical in `docs/admin-stats-workspace-verification.md`.

Browser reproduction with the isolated local env and private test session:

```bash
set -a
source .env.test
set +a
ADMIN_GUIDED_STORAGE_STATE=/private/tmp/onzio-guided-auth.json npx playwright test --config=playwright.admin-guided.config.ts tests/browser/admin-guided-stats-workspace.spec.ts tests/browser/admin-guided-management.spec.ts
ADMIN_LOADING_STORAGE_STATE=/private/tmp/onzio-guided-auth.json npx playwright test --config=playwright.admin-loading.config.ts tests/browser/admin-loading-stats.spec.ts
```

Capture helper: `/private/tmp/capture-combined-stats.cjs`; guarded review fixture
helper: `/private/tmp/onzio-stats-review-fixture.cjs`. Evidence is local/ignored.
Do not run another writer while a held snapshot exists. The user asked to be
notified when this scoped implementation was ready before the broader next step;
no broader publication is authorized by this request.
