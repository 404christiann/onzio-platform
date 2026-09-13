# Admin container skeleton refactor

Branch: `codex/admin-container-skeletons`
Status: **complete locally** — implementation and local acceptance passed; not pushed or deployed.

## Approved behavior

Keep stable page headers/navigation and render loading placeholders inside the
containers they replace. Match responsive card, row, form, image and chart
geometry; reveal coherent sections when their actual dependencies settle.
Remove the full-screen soccer-ball overlay and its artificial minimum wait.
Retain existing content during valid same-context refreshes; prevent stale
context data and premature mutations. Preserve loading announcements and
respect reduced motion. Keep inline saving/upload feedback.

## Work packages

| ID | Status | Implementation | Verification / exact next step |
| --- | --- | --- | --- |
| LOAD-01 | complete | Shared `AdminSkeletonRegion`, reduced-motion Skeleton; Dashboard/Payments fallbacks; unused overlay/hook/keyframe removal | Focused dashboard/shell/theme contracts 16/16. Desktop/mobile server fallback checks and full acceptance passed. |
| LOAD-02 | complete | About, Homepage, Contact, Shop, Sponsors; `AdminContentSkeletons.tsx` | Focused contracts 144/144, scoped lint passed. Desktop/mobile light/dark and Clubhouse variant visual checks passed. |
| LOAD-03 | complete | Schedule, Seasons, Match Stats, Season Stats, Standings; `AdminCompetitionSkeletons.tsx`; context-aware stats readiness | 96 focused contracts and 4 browser race/failure cases passed; markup and empty-cohort fixes verified. |
| LOAD-04 | complete | Analytics, Programs, Tryouts, Registrations; `AdminOperationsSkeletons.tsx`; registrations initial dependency settlement | Focused contracts 77/77, scoped lint passed. Three registration failure/refresh browser regressions passed; desktop/mobile light/dark workspace checks passed. |
| LOAD-05 | complete | `playwright.admin-loading.config.ts`, `tests/browser/admin-loading*.spec.ts` | Local acceptance complete; evidence below. Next step: Christian reviews visuals/diff before any release. |

## Scope and dependency decisions

- All 16 existing ball-loader routes are covered; Roster retains its existing
  row skeletons. Skeleton shape now follows each page's actual layout.
- Dashboard keeps its existing authenticated server data aggregate and
  page-scoped Suspense boundary. Payments keeps its existing authorization and
  billing lookup boundary. Separate containers are visual placeholders, not
  new or duplicated fetches.
- Existing coherent client fetch groups remain grouped. Analytics retains its
  independent trend request. Registration form/account initial requests wait
  for both outcomes before showing the workspace.
- No database migrations, hosted data changes, security policy changes, or
  Stripe configuration changes are part of this refactor.
- Existing unrelated `.gitignore`, `.claude/`, CV United launch document and
  Lions font comparison changes are preserved.

## Local browser checks

Use a local Supabase fixture stack and a running preview with matching tenant
configuration. Set `ADMIN_LOADING_STORAGE_STATE` to a private, authenticated
local Playwright storage-state file, then run:

```sh
ADMIN_LOADING_STORAGE_STATE=/absolute/private/path/local-auth.json \
  npx playwright test --config=playwright.admin-loading.config.ts
```

The default preview is `http://alpha.localhost:3110`; override with
`ADMIN_LOADING_BASE_URL` for another loopback preview. The config refuses
hosted URLs. Never commit browser authentication state. Screenshots/traces are
written under ignored `test-results/`. Browser tests delay actual reads to
inspect loading states; race tests may supply narrow synthetic read responses
without mutating hosted data.

## Acceptance evidence

- TypeScript and ESLint passed; zero lint warnings/errors.
- Contracts: 804/804 across 71 files; architecture: 21/21.
- Local database: 212/212; complete suite: 1,402/1,402 across 134 files.
- Production build passed. Existing Supabase Edge Runtime `process.version`
  warning remains; no new build failure.
- Combined browser run passed 11/11 (13 client routes at desktop/mobile in
  both light/dark themes, reduced motion/navigation, three registration cases,
  three stats cases). The additional final Schedule failure case passed in the
  agent's 4/4 competition browser run. Twelve distinct checked-in browser cases
  passed across these runs.
- Dashboard and Payments: delayed server-side reads proved their real Suspense
  fallbacks at 1440x900 and 390x844; each replaced with loaded content. Locks
  were released in rollback-only transactions, with no content mutation.
- Five content editors passed additional Clubhouse desktop/mobile checks. The
  synthetic local Alpha publication pointer was restored to its original
  Academy document afterward. Editorial gates retain existing contract
  coverage; no hosted tenant was altered or claimed visually accepted.
- Screenshot inspection confirmed container alignment on Dashboard, Payments,
  Homepage and Contact, and light/dark Registrations. No horizontal overflow
  or browser page errors in the comprehensive route checks.
- Visual samples, a server-loading transition recording and suite logs are
  stored locally in ignored `test-results/admin-container-skeletons/`.
- `git diff --check` passed. No push or deployment performed.

## Remaining review and boundaries

Christian's visual review is next. Production release requires a separate,
current approval. Authentication, tenant/billing authorization, database schema,
media handling, and existing inline save/upload feedback remain intact.

Pre-existing limitation preserved: `fetchLeagueStandings` converts ordinary
query errors into fallback settings/rows; this refactor does not change that
shared public/admin query behavior. Thrown initial standings failures now hide
unfinished controls. The loading change does not claim to redesign all existing
error UX or eliminate layout movement when an unknown list resolves empty.
