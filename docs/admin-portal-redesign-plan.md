# Protected Admin Portal Redesign

## Reimagined admin build plan (approved 2026-11-08)

This section is the current plan. It builds the club admin that Christian picked in the
design workspace (`~/Downloads/onzio-admin-reimagined`, see `docs/MAP.md` there). The
August 2026 shell redesign below it is kept for history.


Everything below was read at `origin/main` (`ab2e439`, 2026-11-05 "test(browser): fix three checks that failed on clean main (#92)") and in `/Users/christianalcala/Downloads/onzio-admin-reimagined`. Paths are at origin/main unless marked as design workspace. The working tree was not read.

### For Christian, in short

The new admin gets built in ten small steps before anyone sees it, then switched on one club at a time. The first four steps are plumbing: a per-club switch so the old and new admin can live side by side, a club time zone (Diverse City moves to Chicago time), and a place to store people's names so the home can say "Hi Andrea". Then the home and the four big jobs, one step each, tested on the local practice club at phone and laptop size with the worst-case data from the demos. Rose City goes first: its website is paused, so visitors see nothing you save, but what you save is real data in the live database, so enter real games and scores there, not made-up ones. Diverse City follows once you have used it on Rose City and say go. Database changes and deploys follow the repo's standing review-bot rule (decided 2026-10-31): the bot backs up, dry-runs and applies a migration, then merges, and merging to `main` deploys. Changes that rewrite existing rows stop for you, and every club switch is a named stop that waits for you. The rest (season, programs, the other website pages, shop, sign-in, roster, analytics, payments, the club screens) follows in later steps, listed in order below.

### Ground rules the plan encodes

**Named gates.** Migrations and deploys follow the standing rule in `docs/agents/review-bot-contract.md` ("Decided by Christian (2026-10-31)"): the review bot merges a clean PR, migrations included, after running the whole procedure in `docs/agents/review-bot-supabase.md` itself. Merging to `main` deploys to production automatically. The gates below name where that procedure, or a person, has to act:
- `GATE-MIGRATE`: run by the review bot under `docs/agents/review-bot-supabase.md` for every PR that adds a migration, before it merges. It's the `CLAUDE.md` check: `supabase link --project-ref ioalthwsdrlzrubomrow`, `supabase migration list --linked`, `supabase db push --linked --dry-run` (read it), `supabase db push --linked`, re-list until Remote matches the branch. Take a backup first (`AGENTS.md`, Database rules).
- `GATE-DEPLOY`: the merge itself, because merging to `main` deploys to production automatically (`docs/agents/review-bot-supabase.md`). There is no separate `vercel --prod` step. That's why `GATE-MIGRATE` always runs before the merge, never after (the 2026-11-05 ADMIN-PLATFORM-FIXES-02 release in `HANDOFF.md` shows what happens otherwise).
- `GATE-FLIP-RC`, `GATE-FLIP-DC`: the human stops. Only after Christian says go, a person runs the operator script (below) against production for `rose-city`, later `diverse-city`, with `--execute --confirm-project=ioalthwsdrlzrubomrow`.
- `GATE-DATA-DC-TZ`: Diverse City's time zone row change. It rides inside the foundation migration (precedent: `supabase/migrations/20260804024349_plat_102_billing_entitlement.sql` updates rows by slug), so the bot applies it under `GATE-MIGRATE`. The bot treats it as additive, because it's two slug-scoped rows. It's called out here because it changes live club data. Later PRs with real row rewrites (RE-11b backfill, RE-15 sponsor merge, RE-16 retiring shop rows) are stops under `review-bot-supabase.md`: the bot labels them `blocked`, and Christian decides.
- Stripe, DNS, email: none of the first slice touches them. "Send the code again" (later slice) reuses the existing `signInWithOtp` path in `lib/owner-admin-membership.ts`; flag it as an email action when that PR comes up.

**Where the deploy gate bites.** Migrations are in ADMIN-RE-01 (foundation), and later in ADMIN-RE-11b, 11c, 15, 16, 21. `lib/club-context.ts` selects `clubs` columns on every request (`store_enabled` is in that select; the 2026-08-14 outage). The new `clubs` columns must not be added to that select; they are read by a separate, fail-safe query in the admin layout, and a contract test pins the tenant-resolution select string so nobody adds them later.

**Rose City and the hold.** `middleware.ts` returns a noindex 404 for held slugs only for public tenant paths, `/_clubs/<slug>` and `POST /api/register` (`isHeldPublicSiteRequest`); `/admin/**` is not held. So "test on Rose City first" means: Rose City's production `/admin` (its hostname lives in `onzio.club_domains`, not verifiable from the repo), signed in as Christian, the only owner (`docs/rose-city-inventory.md`, design workspace). Saves write real production rows; visitors see none of it while `lib/public-site-hold.ts` holds `rose-city`; `kind=demo` means billing never blocks edits. Two consequences: the "Saved · on your website" wording is false for a held club and needs a hold-aware label (decision 2 below), and test data is real data. Rose City's homepage editor is also thin today (`lib/homepage-editor/capabilities.ts` gives `rose-city` a `legacy-fixed` hero: slideshow photos and Behind the Rose only), so Edit my website on Rose City stays thin until the Rose City slice.

**Old and new side by side.** A per-club switch on `clubs` plus per-slice flags, read in the protected admin layout, default old admin. Details in the rollout section.

**Icons.** The admin already ships icons.download glyphs in `components/admin/icons/` with `approved-selection.json`, pinned by `tests/contracts/admin-icon-refresh.test.ts`. The home's four tiles and More rows are covered (cup, calendar, clipboard-text, edit, users, chart, card, check-circle, minus, plus, lock, download, close, carets). Missing for Add a game and See registrations: clock, map pin, mail, phone, user. Fetch them with the `icons-download` skill and extend `approved-selection.json` in those PRs. `lucide-react` is already a dependency and acceptable. BoardUI is decision 6; nothing below assumes it.

**Workflow fit.** Package IDs `ADMIN-RE-NN`. Each PR ends with the completion record in `docs/phase-11/diverse-city/STATUS.md` (CLAUDE.md requires it for every implementation turn; `ADMIN-PLATFORM-FIXES-01/02` set the precedent) and a `HANDOFF.md` entry; the plan and its ledger go into an existing doc, `docs/admin-portal-redesign-plan.md` is the natural home (decision 8). Design source of truth per screen: the demo `examples/<id>/index.tsx` in the workspace and its `worst` / `empty` / `one` fixtures (`examples/_worst/data-mode.tsx`); the UI rules and limits in `docs/MAP.md`, "Worst-case check (break-ui), 2026-11-07".

**Standard verification per PR** (from `tests/README.md`, `AGENTS.md`): `npx tsc --noEmit`; ESLint on changed files; `npm run test:contracts`; `npm run test:architecture` (the template-selector ratchet in `tests/architecture/template-selectors.test.ts` forbids new template branches, so club differences go through `lib/admin-route-manifest.ts` and `lib/code-site-admin.ts`); `npm run test:db` with `.env.test` exported when a migration is present, plus `npm run db:types` and `npm run db:types:check`; the focused Playwright config against a production build at `http://alpha.localhost:3110` at 390 and 1440 wide (the `admin-guided` precedent); `npm run build`. Browser and database suites run serially.

### The PR sequence

### First slice: foundation, home, four jobs

**ADMIN-RE-01 — Foundation migration: admin switch, slice flags, club time zone, member names**
- Delivers: nothing visible. The four columns every later step needs, in one migration so `GATE-MIGRATE` runs once for the slice.
- Touches: new `supabase/migrations/<ts>_admin_reimagined_foundation.sql`; `lib/database.generated.ts` (regenerated); `lib/db-types.ts`; new `lib/admin-greeting.ts` (the no-name fallback, pulled forward from RE-04 on 2026-11-08 so the optional name is handled before the column ships: `adminGreeting(displayName)` → "Hi Marco" / "Welcome back"; `memberLabel(displayName, email)` → the name, otherwise the sign-in email).
- Schema: `onzio.clubs.admin_portal text not null default 'classic' check (admin_portal in ('classic','reimagined'))`; `onzio.clubs.admin_flags jsonb not null default '{}'::jsonb check (jsonb_typeof(admin_flags) = 'object')`; `onzio.clubs.time_zone text not null default 'America/Los_Angeles' check (time_zone ~ '^[A-Za-z]+/[A-Za-z_]+(/[A-Za-z_]+)?$')`; `onzio.clubs.time_zone_set_at timestamptz` (null means the default has never been confirmed); `onzio.club_members.display_name text check (display_name is null or char_length(display_name) between 1 and 120)`; `update onzio.clubs set time_zone = 'America/Chicago', time_zone_set_at = now() where slug = 'diverse-city'` and `update onzio.clubs set time_zone_set_at = now() where slug = 'rose-city'` (Los Angeles is already right); `notify pgrst, 'reload schema'`. No RLS change: `clubs` already has `clubs_public_read` (the three new columns are harmless to expose) and `club_members_self_read` (fresh club session, `20260803192838_plat_101_admin_auth_simplification.sql`) lets a signed-in member read their own name. Column comments say "operator-only, set by script" like `store_enabled`. Why `clubs.time_zone` and not `club_identity.time_zone` (`20260812120100_editorial_club_identity.sql`): `club_identity` is an editorial content singleton with required `short_name`, `initials`, `founded_year`; nothing in `lib/` or `app/` reads its `time_zone` today (only the Lions import scripts write it), and Rose City and Diverse City may have no row. Decision 1.
- Gate: `GATE-MIGRATE` before merge, including `GATE-DATA-DC-TZ`. Local first: `supabase db reset` clean.
- Tests: `tests/database/admin-reimagined-foundation.test.ts` (columns, defaults, checks reject bad values, Diverse City row update is slug-scoped, Alpha and Bravo unchanged, anon/authenticated cannot write the new `clubs` columns, a member reads only their own `display_name`); contract test pinning that `lib/club-context.ts`'s `club_domains` select does not mention `admin_portal`, `admin_flags` or `time_zone`.
- Acceptance evidence: `npm run test:db` green on the touched files; `db:types:check`; STATUS record; `migration list --linked` output pasted into the release record after the gate.
- Rollout: applies to every club; no behavior change until code reads the columns.
- Size: S. Depends on: nothing.

**ADMIN-RE-02 — The switch: read the flags fail-safe, operator script, shell plumbing**
- Delivers: Onzio can mark a club `reimagined` and turn slices on; the app reads it; still no visible change (the old shell renders for both values).
- Touches: new `lib/admin-portal.ts` (`readAdminPortal(supabase, clubId)` selects `admin_portal, admin_flags, time_zone` from `onzio.clubs` with the user-scoped client and returns `{ portal: 'classic', flags: {}, timeZone: 'America/Los_Angeles' }` on any error, so a lagging migration or a bad read falls back to the old admin); new `components/admin/AdminPortalProvider.tsx` (client context: portal, flags, timeZone, plus a `useAdminPortal()` hook); `app/admin/(protected)/layout.tsx` reads it and wraps `AdminShell`; new `scripts/set-club-admin-portal.ts <slug> --portal=classic|reimagined [--on=<flag>] [--off=<flag>] [--execute] [--confirm-project=<ref>]`, modelled line for line on `scripts/set-club-store-enabled.ts` (dry run by default, loopback allowed, non-loopback needs `--confirm-project`, audited write, post-write reconciliation). **Automatic time zone (decision 1):** new `POST /api/admin/club-time-zone` (owners only) accepts the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`, validates it with `isValidTimeZone`, and saves it with `time_zone_set_at = now()` only while `time_zone_set_at` is null; `AdminPortalProvider` posts it once on an owner's first admin visit. Nobody types a time zone; Onzio can correct one with `scripts/set-club-admin-portal.ts --time-zone=<zone>`. As built (2026-11-08): `isValidTimeZone` lives in a new `lib/club-time.ts` (shape check matching the column's constraint plus `Intl.DateTimeFormat`, so `Mars/Phobos` is rejected); the write is `setClubTimeZoneOnce` in `lib/owner-admin-membership.ts`, inside the existing service-role boundary, so the route itself never imports the service-role client; `readAdminPortal` also returns `timeZoneConfirmed`, and a failed read counts as confirmed so it never triggers the automatic set.
- Schema: none.
- Tests: `tests/contracts/admin-portal-switch.test.ts` modelled on `tests/contracts/store-enabled-operator.test.ts` (script flags, refusal shapes, dry run) plus fail-safe behavior of `readAdminPortal` with a failing client; `tests/contracts/admin-route-manifest.test.ts` unchanged this PR.
- Acceptance evidence: contracts green; a local dry run and `--execute` against local Supabase for `alpha`, output in STATUS; `npm run build`.
- Rollout: deploys with no visible change when it merges (RE-01's migration is already applied).
- Size: S. Depends on: RE-01.

**ADMIN-RE-03 — Club time zone helper and admin "today"**
- Delivers: the admin reads dates in the club's own time zone (decision 0014); the Diverse City home stops disagreeing with its own schedule.
- Touches: `lib/club-time.ts`, created in RE-02 with `isValidTimeZone` and `clubTimeZoneOrDefault`; this step adds (`clubToday(timeZone)`, `isKickoffPast(date, time, timeZone, graceMinutes)`, `formatClubDate`/`formatClubTime` with the short "Dec 31" form from MAP, reusing RE-02's `isValidTimeZone`); `lib/admin-dashboard-data.ts` (replace the server-local "today" block, lines 78-87, with `clubToday`); `app/admin/(protected)/schedule/page.tsx` formatters (lines 134-153 use `timeZone: "UTC"` on plain dates; switch to the helper). The public schedule (`app/(public)/schedule/page.tsx:38-39`, `components/sites/diverse-city/AcademySchedulePage.tsx:32-33` hardcode Los Angeles) switches to the club's time zone in this PR too (decision 5): Diverse City's public game times become Chicago time. So does Next match: `components/NextMatchCard.tsx:69` and `components/AcademyNextMatch.tsx:85` pick the next game against a UTC `todayStr` (`new Date().toISOString()`), so they switch to `clubToday(timeZone)` here too. Their callers (`components/HomePageClient.tsx`, `components/sites/diverse-city/HomePage.tsx`) pass the club's time zone. Call it out in the release record. As built (2026-11-08): no prop threading. A new `ClubTimeZoneProvider` / `useClubTimeZone()` supplies the zone. The tenant layout fills it from `readPublicClubTimeZone` (`lib/public-club-time-zone.ts`: public client, 1.5 s budget, Los Angeles on any failure), never from `ClubContext` or `lib/club-context.ts`. Admin pages get it from `AdminPortalProvider`. Not covered here, and left for a later step: the Lions clubhouse pages (`ClubhouseSchedulePage`, `ClubhouseHomePage`, `ClubhouseMatchAreaPage`) and `FixtureRow` still read kickoff in the visitor's browser zone.
- Schema: none (column from RE-01).
- Tests: `lib/__tests__/club-time.test.ts` (midnight edge in Chicago vs Los Angeles, DST days, invalid zone fallback, kickoff grace); update `lib/__tests__/admin-dashboard-data.test.ts`.
- Acceptance evidence: legacy and contracts green; build.
- Rollout: both clubs, both admins (old dashboard's "Upcoming" list becomes club-time correct). Safe either way.
- Size: S. Depends on: RE-01, RE-02.

**ADMIN-RE-04 — People's names: read, set your own, members route hardening**
- Delivers: the signed-in person can save a name ("What should we call you?"); the members list carries names; helpers added later get a required name (decision 0010, full UI in RE-18).
- Touches: `app/api/admin/members/route.ts` (new action `set-name { userId?, displayName }`; owners may name anyone active in the club, any member may name themselves; `email` gains `.max(254)` to match `lib/owner-admin-membership.ts`'s `emailSchema`, the break-ui gap); `lib/owner-admin-membership.ts` (`listActiveMembers` selects and returns `display_name`; new `setMemberDisplayName`; audit event `membership_renamed` without the name in the payload, per the no-PII-in-audit rule); `app/admin/(protected)/members/page.tsx` shows names where present (old page, minimal); uses `lib/admin-greeting.ts` from RE-01 (`adminGreeting`, and `memberLabel` wherever a person is listed, so a member with no name shows their email).
- Schema: none (column from RE-01).
- Tests: `tests/database/owner-admin-membership.test.ts` extended (self-name under RLS read, service-role write path, length 120 rejected); contract test for the route's new action and the email max; update `tests/contracts/admin-platform-fixes-02.test.ts` section 13 if the list shape changes.
- Acceptance evidence: db and contracts green; build.
- Rollout: both clubs, no visible change until the new home.
- Size: S. Depends on: RE-01.

**ADMIN-RE-05 — The new home and the reimagined shell**
- Delivers (design: `cd-desktop`, `cd-phone`, `dc-club-home`, `rc-site-tabs` home): under `admin_portal = 'reimagined'`, `/admin` shows "<Club name> · Club admin" (one line, ellipsis), "Hi <first name>" or "Welcome back", "What do you want to do?", the big jobs with hints ("12 games need a score", plural rules and thousands separators; "3 new"), and a More list in glossary words, assembled from the manifest (decision 0005). A slim top bar on every other admin page: "‹ Home", page title, an actions slot. Until each job ships, tiles open the old pages: Enter a score → `/admin/schedule`, Add a game → `/admin/schedule`, See registrations → `/admin/registrations`, Edit my website → `/admin/homepage`; More rows open the old pages under new names (Team roster → `/admin/roster`, This season → `/admin/seasons`, League table → `/admin/standings`, Programs and tryouts → `/admin/programs` and `/admin/tryouts` while separate, Sponsors, Shop, Your club → `/admin/branding`, How the team is doing → `/admin/analytics`, Payments and plan → `/admin/payments`, Who can sign in → `/admin/members`, Sign-up forms → `/admin/registrations`, quiet). "See registrations" is a big job only when the club has a non-archived form that is open or has registrations; otherwise three jobs and Sign-up forms in More (Rose City grill 6, Diverse City grill 9). Tiles that need content mutation hide when `canMutateContent` is false, as quick actions do today.
- Touches: `lib/admin-route-manifest.ts` (new `ADMIN_HOME_JOBS` and `ADMIN_MORE_ROWS` with glossary labels; `AdminRouteAccessContext` gains `adminPortal`, `adminFlags`, `hasLiveSignUps`); new `components/admin/reimagined/ReimaginedShell.tsx`, `HomeJobs.tsx`, `MoreList.tsx`, `TopBar.tsx` (with a `useTopBarActions()` slot); `app/admin/(protected)/layout.tsx` picks the shell by portal; `app/admin/(protected)/page.tsx` renders `ReimaginedHome` or the old dashboard; new `lib/admin-home-data.ts` (games needing a score: active season's `matches` where both `rose_city_score` and `opponent_score` are null and kickoff is at least two hours past in club time; new sign-ups: `registrations` with `status = 'paid'` and `submitted_at` in the last seven days in club time, forms not archived, paged with `.order("id")` like `readAllPaidRegistrations`; live-sign-up test for the fourth tile; no PII selected). Icons from the existing set.
- Schema: none.
- Tests: `tests/contracts/admin-reimagined-home.test.ts` in the style of `tests/contracts/admin-dashboard.test.ts` (server-side, tenant-scoped, no PII, plural/number formatting, three-vs-four jobs, More rows follow `codeSiteAdminFor`, owner-only rows hidden for admins); update `tests/contracts/admin-route-manifest.test.ts` on purpose (the exact-array locks); `lib/__tests__/admin-home-data.test.ts`; new `playwright.admin-reimagined.config.ts` (`testMatch: admin-reimagined*.spec.ts`, Alpha at 3110, 390 and 1440) with a global setup that sets Alpha's `admin_portal` to `reimagined` and restores it, modelled on `tests/browser/alpha-store-enabled.global-setup.ts`; `tests/browser/admin-reimagined-home.spec.ts`: greeting fallback, four tiles, hint text for 0/1/12 games (fixture rows inserted and removed in the spec), long club name truncates (rename Alpha and restore), "‹ Home" present on `/admin/roster`.
- Acceptance evidence: all suites; browser at both widths with screenshots in `test-results/admin-reimagined/`; STATUS record.
- Rollout: deploys with both clubs still `classic`. Nobody sees it until `GATE-FLIP-RC` (RE-10).
- Size: M. Depends on: RE-02, RE-03, RE-04.

**ADMIN-RE-06 — Enter a score (`/admin/score`)**
- Delivers (design: `cd-score`, `cd-score-desktop`, fixtures worst/empty/one): the games that need a score, newest first, each with two steppers (club name and opponent, names wrap two lines then ellipsis), "Save score" → "Saving…" → "Saved · on your website" on the button; the pill goes from "Result missing" to Won/Drew/Lost; "Earlier results" below; the missing "every score is already in" screen (MAP open item): "All scores are in" with a link to Add a game; "Who scored?" card linking to `/admin/stats` (preselect by query param only if `components/admin/stats/CombinedStatsPage.tsx` supports one; not verified). Saving changes the match only; the league table's our-row update is decision 0002 and lands in ADMIN-RE-11b.
- Touches: new `app/admin/(protected)/score/page.tsx` and `components/admin/reimagined/ScoreEntry.tsx` (uses `components/ui/number-stepper.tsx`); writes through `POST /api/admin/data` (`table: "matches"`, `operation: "update"`, `id` filter) rather than the browser-client writes the old schedule page uses, per the Server Mutation Boundary in `docs/onzio-platform-plan.md`; `lib/admin-data-contract.ts` gains a per-table `matchesMutation` schema (scores `int().min(0).max(99)`); `lib/admin-route-manifest.ts` route `score` (feature schedule); the Enter a score tile repoints; a classic-portal guard redirects `/admin/score` → `/admin/schedule` so a club still on the old admin never lands on it.
- Schema: none.
- Tests: contract test for the matches schema and the page's server/tenant rules; `tests/browser/admin-reimagined-score.spec.ts`: seed a past Alpha match without a score, tap +, save, assert the pill and button text, assert the empty state afterwards, 390 and 1440, fixture restored.
- Acceptance evidence: suites; browser; STATUS.
- Rollout: behind the switch.
- Size: M. Depends on: RE-05.

**ADMIN-RE-07 — Add a game (`/admin/add-game`)**
- Delivers (design: `cd-game`): plain questions. "Who are you playing?" (required), "Home or away?" (segmented, Home default), "When?" (date picker via `components/ui/calendar.tsx`/`react-day-picker`, short date form; time; default the next Saturday 10:00 in club time), "Where?" (venue with "Last used" chips from the club's recent distinct venues), the active season pill with a quiet switcher, "Add to schedule" → "Added · on your website", the game drops into "Coming up"; "No games yet" empty state. The "League game?" question is deferred with the column it needs (`matches` has no such column; decision 4).
- Touches: new `app/admin/(protected)/add-game/page.tsx`, `components/admin/reimagined/AddGame.tsx`; `lib/admin-data-contract.ts` `matchesMutation` gains text limits (break-ui gap: `opponent`, `venue`, `competition` have no limit in `20260726000200_phase2_content.sql` or Zod): opponent 1-80, `opponent_short_name` ≤ 20, venue 1-120, competition ≤ 80, address/city/state ≤ 120/80/40, Zod only for now (decision 7 covers database CHECKs); new icons clock, map pin (`icons-download`, `approved-selection.json`); manifest route `add-game`; tile repoint; classic guard → `/admin/schedule`.
- Schema: none.
- Tests: contract tests for the limits and defaults (`lib/__tests__/club-time.test.ts` for next-Saturday); `tests/browser/admin-reimagined-add-game.spec.ts`: add a game on Alpha, see it in Coming up and in `/admin/schedule`, long opponent and venue from the worst fixture wrap and truncate, row removed after; `tests/contracts/admin-icon-refresh.test.ts` updated for the two icons.
- Acceptance evidence: suites; browser; STATUS.
- Rollout: behind the switch.
- Size: M. Depends on: RE-05.

**ADMIN-RE-08 — See registrations (`/admin/sign-ups`)**
- Delivers (design: `cd-regs`): "N new this week", "Newest first, from all your registration forms", tabs All / Paid / Refunded with counts, one row per person (name from `answers.player_name` or `answers.registrant_name`, form title, paid amount, relative time), a details panel on laptop (`components/ui/sliding-panel.tsx`) or a page on phone: parent or guardian (`guardian_name`, `guardian_phone`, `guardian_email`; adult: `registrant_*`; the core field keys in `lib/registration-fields.ts`), payment (amount, date, "Card, through Stripe"), "Download list" using the existing per-form export (`app/api/admin/registrations/export/route.ts` takes `formId`; with more than one form the button offers a form picker; an all-forms CSV is decision 9), "No sign-ups yet" empty state. Form building, publish/stop/archive and Stripe Connect stay on the old `/admin/registrations`, reached from More as "Sign-up forms".
- Touches: new `app/admin/(protected)/sign-ups/page.tsx`, `components/admin/reimagined/SignUps.tsx`; reads through the user-scoped client like `app/admin/(protected)/registrations/page.tsx` does (RLS: `20260820171545_registration_admin_read_policy.sql`); new icons mail, phone, user; manifest route `sign-ups`; tile repoint; classic guard → `/admin/registrations`.
- Schema: none.
- Tests: contract test (reads are tenant-scoped; `status_token_hash` never selected; counts paged); `tests/browser/admin-reimagined-sign-ups.spec.ts` with seeded Alpha registrations (`scripts/seed-special-kickers-registration-local.ts` is the precedent for local registration fixtures), long names from the worst fixture, empty state; compare with `tests/contracts/registrations-admin-ui.test.ts` so nothing there weakens.
- Acceptance evidence: suites; browser; STATUS.
- Rollout: behind the switch. On Rose City the tile is usually absent (no live form), which is the designed behavior.
- Size: M. Depends on: RE-05.

**ADMIN-RE-09 — Edit my website, step one: the homepage under the edit bar**
- Delivers (design: `cd-desktop`, `cd-phone`): the existing click-to-edit homepage editor (`components/admin/homepage/HomepageEditor.tsx` already selects a piece on click and offers "Change the words", "More options", "Done") under the reimagined edit bar: "‹ Home", "You're editing your site", status "Nothing to save yet" / "Not saved yet: Hero" / "Saved · live on your site" on the Save button; "Click to change" and "Changed" tags on hover and after an edit; on phone an edit sheet; the back link asks "Save your changes first?" when dirty (group 3 decision 6, applied to "‹ Home"). The page switcher, About/Contact/Programs/Shop pages, tab renames and seasonal sections are later slices. Break-ui gap closed here: `lib/homepage-editor/contract.ts` `hero.eyebrow` max 20 000 → 120 (verify the save RPC in `20261022183955_homepage_content_policy.sql` has no stricter check; not read).
- Touches: `components/admin/homepage/HomepageEditor.tsx` (chrome swap under `useAdminPortal()`; the save pipeline, recovery and bindings untouched), `components/admin/homepage/homepage-editor.css`, new `components/admin/reimagined/EditBar.tsx`, `lib/homepage-editor/contract.ts`, new `lib/save-status.ts` (hold-aware wording, decision 2), tile repoint to `/admin/homepage`.
- Schema: none.
- Tests: extend `tests/contracts/homepage-editor-save-contract.test.ts` for the eyebrow limit; `tests/browser/admin-reimagined-website.spec.ts` under the homepage config's auth state (edit the hero date line, save, assert the live label and that the public Alpha page shows it; dirty back-link prompt; phone sheet at 390); the homepage browser suite (`playwright.homepage.config.ts`) must stay green, and `npm run fixture:homepage:restore:local` is the recovery if a run is interrupted.
- Acceptance evidence: suites including the full homepage browser config; STATUS.
- Rollout: behind the switch. On Rose City the hero is fixed (legacy), so only slideshow photos and Behind the Rose are editable until ADMIN-RE-20.
- Size: M. Depends on: RE-05.

**ADMIN-RE-10 — First-slice acceptance, release record, Rose City switch-on**
- Delivers: the first slice live for Rose City only.
- Steps: full suites on `main` after RE-09 (`npm test`, `test:architecture`, `test:db`, every Playwright config touched, build); a release record in the existing `docs/admin-portal-production-release.md` pattern; confirm production is on the merged code and `migration list --linked` matches; `GATE-FLIP-RC`: `npx tsx scripts/set-club-admin-portal.ts rose-city --portal=reimagined` dry run, then `--execute --confirm-project=ioalthwsdrlzrubomrow`; Christian signs in on Rose City's admin, walks the home and four jobs on phone and laptop, enters real games and scores; findings become ADMIN-RE-10x fix PRs. After Christian's go: `GATE-FLIP-DC` the same way, after telling the Diverse City owner.
- Tests: none new; evidence is the run log and the STATUS/HANDOFF records (package ID, status, files, verification, blockers, exact next step, hosted mutations with the exact command and output).
- Size: S. Depends on: RE-01 to RE-09.

### Later slices (same rules; each has a slice flag in `clubs.admin_flags` so Rose City goes first)

**ADMIN-RE-11a — This season hub and season names** (design `cd-season-final`, `dc-club-home`; group 1 decisions 8, 12, 13; Diverse City grill 2, 14). Seasons page as the hub: "Start next season" dialog with a suggested name (`lib/season-label.ts` `nextSeasonAfter` extended with Spring/Fall alternation; `seasons.label` is already free text ≤ 40 and unique per club), name counter and duplicate error, then "Show <season> on your website now?" (sets `active`), the "ready · Show it" note, quiet past-season switcher, delete only when empty, first season from the hub. Break-ui: the one-year "2027" label and "2027–28" both come from data; no change needed beyond the suggestion. No schema. Size M.

**ADMIN-RE-11b — League table per season, our row updates itself** (decision 0002). Migration: `league_standings.season_id` (composite FK to `seasons`), backfill every row to the club's active season, unique `(club_id, season_id, sort_order)`; starting a season copies the teams at zero; saving a league game's score updates the `is_club` row (server-side in the data route or an RPC); `team_name` ≤ 60 (break-ui gap; Zod now, CHECK with decision 7). Needs the `matches.league_game boolean not null default true` column (decision 4) in the same migration. `GATE-MIGRATE`. Size L.

*As built (2026-11-10), migration `20261110090000_league_table_per_season.sql`:* `league_standings.season_id` (not null, composite FK to `seasons` with `on delete cascade`, backfilled to the club's shown season, else its newest; a club with table rows and no season stops the migration); unique `(club_id, season_id, sort_order)`, deferred so one save can reorder; `matches.league_game boolean not null default true`; `team_name` CHECK ≤ 60 (the migration stops if a row is over). Triggers do the work for every write path, classic included: a table row saved without a season goes to the shown season (so admin code deployed before this change keeps saving); inserting a season copies the club's newest table into it at zero; saving, editing, clearing or deleting a game recomputes the club's `is_club` row for that season from its saved league games (3 points a win, 1 a draw, both scores in, `league_game` true), locking the row first so two saves at once both count. **Typed numbers stay (Christian, 2026-11-09, "Keep typed, new seasons auto")**: `seasons.standings_from_scores` is false for every season that exists at the migration, so a score saved there leaves the typed our row alone from either admin; it defaults true for every season created after (hub, classic page, a club's first season), and only those work out our row from their games. The Add a game page asks "League game?" (Yes by default). The Standings page has a season picker; the public site shows the shown season's table; the Seasons hub reads the season on view and counts a table with numbers in it as not empty before a delete.

**ADMIN-RE-11c — Player numbers after the game, totals add up** (design `cd-after-game`; decisions 0001; group 1 decisions 1-3, 6, 7, 11). Enter a score gains the "Who played and scored?" step; season totals become sum of match stats plus a per-player adjustment. Migration: reinterpret `player_season_stats` / `goalkeeper_season_stats` as adjustments (or add `*_season_adjustments`) with a report of clubs whose typed totals differ from the sum; align the `mins` caps (match 0-300, season `>= 0`; break-ui gap) by capping adjustments only. `GATE-MIGRATE`. Public roster reads the derived totals. Size L. Split further if needed. As built (2026-11-10): split in two. **11c-1** (migration `20261110220000_season_totals_add_up.sql`, no new screens): new `*_season_adjustments` tables (not a reinterpretation, so old code stays right between `GATE-MIGRATE` and the deploy) and `*_season_totals` views; `played` on player numbers; every totals reader moved to the views; the classic Season stats page and roster panel save typed − games as the adjustment. Christian's decision "Keep today's numbers": adjustments may be negative, backfilled as typed − games so no total moves; every number ±9,999, never a total below 0. **11c-2** (no migration, as built 2026-11-11): "Who played and scored?" after Enter a score, the game's Player numbers page (`/admin/score/<game>`), "N games need player numbers" on the hub, and the Season totals page (`/admin/seasons/totals`) with "from games / added by hand" and Adjust. "Played" is not adjustable by hand (needs a migration; Christian: leave it out).

**ADMIN-RE-12 — Programs and tryouts list** (design `cd-programs-final`, `cd-tryout-final`; decisions 0003, 0004, 0005; group 2 decisions 1-14). One More row; state derived from sign-up way and date (tryout `status` becomes read-time derived; closing the day after the date in club time); price from the form; "N signed up" per form; "Make a copy"; hiding stops sign-ups. Break-ui: the tryouts 500-event cap exists only in Zod (`lib/tryouts-page-editor/contract.ts`): add a count check inside the tryouts save RPC (`20261002143000_tryouts_page_atomic_save.sql` lineage) or drop it (decision 7). Migration likely for the derived state. Size L.

*As built, part 1 (2026-11-10), ADMIN-RE-12b, migration `20261110180000_programs_tryouts_sign_up_state.sql`:* RE-12 ships as three PRs. 12a makes RE-22's Programs words test steady (#131). 12b (this) is the sign-up state. 12c is the "Programs and tryouts" page.

12b rewrites no rows; the new columns start at today's behavior. `tryouts` gains `hidden`, `sign_up_by_contact` (the "They contact you" way) and `stays_open_after_date` (Reopen after the date passed; a trigger clears it whenever the date changes). `programs` gains `sign_ups_closed` and `sign_up_by_contact`. `tryouts.status` stays, so the classic Tryouts page and code deployed before keep working: `closed` means closed by the owner, and `upcoming` and `open` now mean the same thing.

What the site works out when it reads (`lib/sign-up-state.ts`): hidden, then closed by the owner, then closed the day after the date in club time, then taking sign-ups if there is an open form, a link or "They contact you", else not taking sign-ups yet. The word on a public Tryouts card follows that (`open`, `upcoming`, `closed`). Hidden tryouts are left off the page. Tryouts read by date, soonest first. With an open form, the card's Cost is the form's price ("$25", "From $25", "Free"). A closed program keeps its page with "Sign-ups are closed"; "They contact you" shows a "Contact the club" button.

Hiding or closing stops sign-ups at the database. A trigger on new pending registrations refuses a form that one or more programs or tryouts use when none of them is taking sign-ups; a form nobody uses is unaffected. The public form page says closed up front (`onzio.registration_form_accepting`, service role only).

Decision 7: the 500-tryout cap stays, enforced on every write path by a statement trigger on inserts. `save_tryouts_page` already capped its own payload, but `/api/admin/data` and direct writes didn't. `tryouts.updated_at` now advances strictly on every write, as programs' does, so a stale one-row save is caught.

New RPCs for 12c, each with an operation receipt: `save_tryout` (one tryout), `save_program_sign_up` (way, closed, shown or hidden), `copy_program` and `copy_tryout` (the copy carries everything except the date and the form, starts hidden with no sign-up way, shares the photos), and `delete_tryout`. Through them, a form already used by another program or tryout is refused (decision 12).

Production counts (Christian, 2026-11-10): no form stops taking sign-ups and no badge word changes. Two past tryouts close at deploy (1 Diverse City, 1 Lions); Christian: "Yes, close them". Date order moves 2 of Lions' 3 tryouts; Christian: Lions doesn't need attention ("anything regarding lions we shouldnt need to worry about"). `GATE-MIGRATE`.

**ADMIN-RE-13 — Edit my website, every page** (design `cd-site-final`; group 3 decision 1, 2, 6). Page switcher in the edit bar reusing `components/admin/about/AboutPageCanvas.tsx`, `components/admin/contact/ContactPageCanvas.tsx`, `components/admin/ProgramCanvasFrame.tsx`, `components/admin/tryouts/TryoutsPageEditor.tsx`; "These come from Your club · Change them there" shortcuts; "‹ Done" with Save/Discard. Break-ui: About and Shop validate only at Save; add as-you-type counters against the existing Zod limits (`lib/about-editor/contract.ts`, `lib/shop-editor/contract.ts`). No schema. Size L.

**ADMIN-RE-14 — Your club** (design `cd-your-club`; decision 0006; group 3 decisions 10, 11). One page, one Save for logo (`site_branding`), footer line (≤ 160 with counter), social pages (`site_social_links` href ≤ 2048, break-ui gap, Zod), public email/phone/hours (≤ 200)/area from `contact_profile`; "Fit your logo" crop. The JPG copy gap is already closed on main (PR #88: Branding and Sponsors say PNG or WebP; `tests/contracts/admin-platform-fixes-02.test.ts` section 3); verify, don't redo. No schema. Size M. As built (2026-11-09): `/admin/your-club`, reimagined-only; contact details and footer line appear only where the club's website has a Contact page or prints a footer line (`codeSiteAdminFor`, decision 0005), so a Rose City-style site is asked for the logo and social pages only. The Your club More row opens it; the old Branding page stays for classic clubs. Zod added for `site_social_links` and `site_branding`. Logo goes through the media chain as a square PNG after "Fit your logo"; the server stores it as WebP.

**ADMIN-RE-15 — Sponsors, one list** (design `cd-sponsors-final`; decision 0007). Migration: `site_sponsor_logos` gains `show_on_homepage`, `show_in_footer`, `website_url`; merge duplicate rows by `media_asset_id`; `name` ≤ 60 (break-ui gap). Footer switch only where the template's footer shows sponsors (manifest, not a template branch). `GATE-MIGRATE`. Size M.

**ADMIN-RE-16 — Shop list and the Shop page in Edit my website** (design `cd-shop-final`, `cd-shop-page-final`; decisions 0008 amended, 0009). Migration: per-kit `visible` plus "not on your website until a photo"; the closing "Ready to order" button follows the kit (stop reading `shop_purchase_details.cta_link`, which also removes the mailto mismatch gap); retire the `surface = 'home'` rows with a report of clubs whose homepage copy differed. The Shop-off banner from PR #91 stays. `GATE-MIGRATE`. Size L.

**ADMIN-RE-17 — Team roster** (design `cd-roster-final-cascade`). Rework of `app/admin/(protected)/roster/page.tsx` under the shell; the roster phone name clamp noted in MAP. No schema. Size M.

**ADMIN-RE-18 — Who can sign in** (design `cd-signin-final`; decisions 0010, 0013). Every owner listed (already on main, PR #88 item 13), helpers with required names (RE-04 column), "Signed in Tue" / "Hasn't signed in yet" from `auth.users.last_sign_in_at` via the service role in the members route, "Send the code again" (`signInWithOtp`, rate limit stays; email action, say so at release), Remove with Undo (re-activate the membership within the undo window). No schema. Size M.

**ADMIN-RE-19 — How the team is doing** (design `cd-analytics-a` + `cd-analytics-b`). Results game by game and one player at a time, magenta bars; reads `fetchPlayerMatchLog`/`fetchPlayerMatchTrend` in `lib/queries.ts` and `lib/analytics-helpers.ts`. No schema. Size M.

**ADMIN-RE-20 — Payments and plan** (design `cd-payments`, `cd-payments-desktop`). Chrome and words over `components/admin/payments/PaymentStatusCard.tsx` and `app/admin/(protected)/payments/page.tsx`; owner-only, Stripe portal unchanged. No Stripe configuration change. Size S.

**ADMIN-RE-21 — Rose City screens** (design `rc-site-tabs`, `rc-site-matchday`; decisions 0011, 0012; `docs/club-rose-city.md`). All new backend: per-club tab and dropdown names (new table keyed by the platform's page identities; ≤ 24 with counter), seasonal sections show/hide, ticket prices and the temporary Tickets page, Next home game from Schedule in club time, homepage buttons to other websites (`https://` only, same URL rules as programs). Migration(s) under `GATE-MIGRATE`. The public schedule and Next match already moved to club time in RE-03 (decision 5). Only matters to visitors when the hold is lifted, which is its own release decision. Size L, split per feature.

**ADMIN-RE-22 — Diverse City screens** (design `dc-site-programs`, `dc-site-matchday`; `docs/club-diverse-city.md`). Programs page words editable on the page; Next match any game with the competition from the game; email to order is already on main (`20261105120000_shop_buy_link_email.sql`). Size M. As built (2026-11-09): no schema. **Programs words:** the words editor that already existed in `/admin/programs` (the homepage band, the Programs page header, the closing band: eleven stored words, `programs_page_content`) is switched on for Diverse City (`showPageCopyEditor`), and a click on the page's heading or closing band opens those words with the cursor in them. It works in both admin portals, because Diverse City edits in the classic one today. Not built, and it needs a schema change: the words that have no stored home (a program page's "The Program" heading, "Community Partners", "Join <club>"), and the click-to-change canvas with the page switcher (RE-13). **Next match:** the card takes the competition from the game (a game with none shows no competition line), shows Home or Away, and says "No game coming up" with only Full Schedule when nothing is scheduled; it never filtered to league games, so any game counts. The Standings title no longer claims to show on it, and the Games form says where the competition shows. **Email to order:** verified, not redone (the database rule, the shared contract and the Shop editor accept `mailto:`; its database test passes). Follow-up, done (2026-11-10): "Add a game" in the new admin now asks an optional "Which competition?" where the club's site definition says the competition shows (`schedule.competitionShowsOnNextMatch`, Diverse City only), with "Last used" chips of the last three competitions; blank saves nothing. No schema. Rose City's form is unchanged.

**ADMIN-RE-23 — Retire the classic admin.** Remove the switch, the old dashboard and the old pages once both clubs have run `reimagined` for an agreed period; `admin_portal` and `admin_flags` columns dropped in a later migration. Size M. Only after Christian says the old admin is no longer needed.

**ADMIN-RE-24 — Home and navigation: five tabs, plain search** (picked by Christian 2026-11-10, "lets go with this look"; design `admin-plain-search-two-clubs.html`, React source `prototypes/plain-search/src/clubs.tsx`, write-up in `docs/MAP.md` "Home and navigation, picked"). **Replaces the RE-05 shell (the top bar's "‹ Home") and the More list** around every reimagined admin page. Five tabs that follow the club: a bottom tab bar on a phone, a sidebar on a laptop (760 px and up), real links with `aria-current`, a red dot on a tab that needs you (never Home), the account menu on the avatar (Base UI Menu). Diverse City-style clubs (programs or tryouts on their website): Home · Games · Programs · Website · Club, roster under Programs. Other clubs: Home · Games · Website · Club, roster under Games, plus Insights for a club with the Sponsor Insights add-on. Tab pages are new routes (`/admin/games`, `/admin/programs-and-sign-ups`, `/admin/website`, `/admin/insights`, `/admin/club`); every existing page keeps its route and sits under one tab, with "‹ <tab>" back to it. Stack: Base UI and clsx (already in the app) plus `cmdk` (new dependency) on Tailwind 3.4; no BoardUI; icons from icons.download (medium; solid for the selected tab). Motion: press `scale(0.97)` 160 ms, hover only with a fine pointer, tab switches and ⌘K instant, menus from `var(--transform-origin)` 150 ms in / 100 ms out, `prefers-reduced-motion` honoured. No schema. Classic clubs (Diverse City today) are untouched. Out of scope: the full Sponsor Insights dashboard, the monthly PDF report, the add-on's Stripe price and written addendum. The brief suggested five PRs; the Insights page turned out to be part of the frame (its tab needs a page), so it is four, each behind the existing per-club switch:
- **24a — the frame.** `ReimaginedShell` becomes the tab bar and sidebar; per-club tab list in `lib/admin-tabs.ts` (built from the route manifest and `ADMIN_MORE_ROWS`, so a page added to the manifest lands under a tab by its group without touching the tab file); the tab pages with status pill, main buttons and their pages; avatar menu (View website, light/dark, Sign out); `TopBar` keeps its actions slot and takeover but its "‹ Home" becomes "‹ <tab>", and a page with unsaved changes asks before a tab navigates away; the phone tab bar hides while an editor's own bar is up; the home loses the More list. Red dots from the home's own counts (games needing a score, new sign-ups), read fail-safe. The Insights tab (admin_flags `sponsor_insights`) with its waiting state: "Your website isn't live yet" while the site is held, "No visit numbers yet" otherwise, and what it will show.
- **24b — Home.** Greeting with a plural-correct summary ("Nothing needs you right now" / "1 thing needs you" / "N things need you"), Needs you rows each with its own button, Next game, four jobs (fourth: See sign-ups, or Update ticket prices where the club has the Tickets page), At a glance (season card in magenta from RE-19's queries; website visits card in blue: "Not live yet" while held, the sponsor report row hidden). Diverse City's monthly summary card in Website with the one quiet Sponsor Insights line. Visit numbers need a data source the app does not have yet; until one exists the cards say so instead of showing zeros.
- **24c — Search.** cmdk inside a Base UI Dialog (`modal="trap-focus"`), every page, job, upcoming game and player the person can open, built from the manifest; word-start then substring matching, no fuzzy filter; query resets on close; laptop box at the top of the sidebar plus ⌘K, phone magnifier by the avatar.
- **24d — Players in Games.** A Players card under the season's results; a player page with "‹ Games", chips to switch players, RE-19's six-corner chart and recent games (reusing `TeamAnalytics` and `fetchPlayerMatchLog`/`fetchPlayerMatchTrend`, not rebuilding them).
- Tests: `tests/contracts/admin-route-manifest.test.ts` and `tests/contracts/admin-mobile-navigation.test.ts` updated on purpose; new `tests/contracts/admin-tabs.test.ts`; browser specs under `playwright.admin-reimagined.config.ts` at 390 and 1440, light and dark; the admin-guided suite stays green (classic admin). Overlap: the unpushed Rose City 2027 branch adds routes and More rows to the manifest; they fall into the Website tab by their group with no change to `lib/admin-tabs.ts`. Size L. Depends on RE-05 to RE-19.

### Rollout and the switch

- **Mechanism.** `onzio.clubs.admin_portal` (`classic` default, `reimagined`) decides the shell and the home; `onzio.clubs.admin_flags` (`{"season": true, ...}`) turns later slices on per club. Both are operator-only, like `store_enabled`: set by `scripts/set-club-admin-portal.ts` with dry run, `--execute`, and `--confirm-project=<ref>` for anything not loopback. Read once per request in `app/admin/(protected)/layout.tsx` by `lib/admin-portal.ts`, which returns `classic` on any error. Not part of `lib/club-context.ts`'s tenant resolution, so a missing column can never take a public site down.
- **Coexistence.** New job pages are new routes (`/admin/score`, `/admin/add-game`, `/admin/sign-ups`); old pages keep their routes and keep working inside the reimagined shell with a "‹ Home" bar until their slice replaces them. On a `classic` club the new routes redirect to their old equivalents.
- **Switching on.** The bot applies the migration and merges (`GATE-MIGRATE`, `GATE-DEPLOY`). Then, after Christian's go, `set-club-admin-portal.ts rose-city --portal=reimagined --execute --confirm-project=...` (`GATE-FLIP-RC`). Later `diverse-city` the same way (`GATE-FLIP-DC`). Later slices: `--on=season` for Rose City first, then Diverse City.
- **Switching back.** `--portal=classic` (or `--off=<slice>`) takes effect on the next request; no deploy. There is no per-browser escape link (decision 3); switching back is Onzio's job with the script. Data entered in the new admin is ordinary data in the same tables, so going back loses nothing.
- **Local proving.** Alpha stands in for Diverse City (academy) and, renamed, for Rose City's legacy renderer (`tests/browser/homepage-editor-templates.spec.ts` already does this); the new Playwright config flips Alpha's `admin_portal` for its run and restores it.

### Risks and mitigations

1. A `clubs` column read in tenant resolution before its migration reaches production (the 2026-08-14 outage). Mitigation: separate fail-safe read in RE-02; contract test pins the `club_domains` select; `GATE-MIGRATE` before merging a migration PR, because a merge to `main` may deploy.
2. Rose City testing writes real production rows. Mitigation: enter real games and scores; delete test rows the same day; never run seeds against production.
3. "Saved · on your website" is false while Rose City is held. Mitigation: hold-aware label (decision 2) in `lib/save-status.ts`, driven by `PUBLIC_SITE_HOLD_SLUGS` and `publicAccess`.
4. Diverse City's owner lands in a half-finished admin. Mitigation: `classic` default; the flip is a separate gate after Rose City; old pages stay reachable from More; Onzio can switch the club back in seconds; tell the owner first.
5. Later data migrations (sponsor merge, shop home-surface retirement, season totals) apply to both clubs at once and cannot be flagged per club. Mitigation: each produces a report of affected rows before writing (dry run against staging first), keeps old columns until the slice is accepted on both clubs, and is scheduled after Rose City has accepted the UI behind the flag.
6. The manifest's exact-array tests and the template-selector ratchet fail on new routes and branches. Mitigation: update `tests/contracts/admin-route-manifest.test.ts` deliberately in RE-05; never branch on `presentationTemplateKey`; use `codeSiteAdminFor` and manifest fields.
7. Time zone change shifts "today" for Diverse City's old dashboard too (RE-03). Mitigation: that is the correct behavior; call it out in the release record. Under decision 5 the same PR moves Diverse City's public schedule and Next match to Chicago time, which is a visible change on its live site, so the release record names it.
8. Browser suites share Alpha and leak fixtures when interrupted. Mitigation: run serially under `scripts/with-local-db-lock.sh`; the new global setup restores `admin_portal`; `npm run fixture:homepage:restore:local` for the homepage suite.
9. New text limits reject existing long rows when edited (opponent, venue, competition, team names). Mitigation: Zod only at first; a read-only production length check (decision 7) before any database CHECK.
10. Registrations page shows guardian contact details. Mitigation: same data the old page shows; admin-only, tenant-scoped, user-scoped RLS; never in the home loader or logs.

### Decisions (answered by Christian, 2026-11-08)

1. **Time zone:** stored on `clubs`. It's set automatically from the
   owner's browser on their first admin visit, and nobody types it. Rose City
   (Los Angeles) and Diverse City (Chicago) are seeded in RE-01.
2. **Save label while a site is held or paused:** "Saved · your website is
   paused".
3. **No "Use the old admin for now" link.** Switching back is Onzio's job,
   through the script.
4. **"League game?" waits for RE-11b,** with `matches.league_game` defaulting
   to true.
5. **The public schedule and Next match switch to club time in RE-03.**
6. **No BoardUI.**
7. **Text limits:** Zod first, then database checks after a gated, read-only
   length query. As built (2026-11-09): the query found no
   `matches` row over a limit (8 rows); ADMIN-RE-07c adds the CHECKs and holds
   the Zod limits on edits too. `league_standings.team_name` and
   `site_sponsor_logos.name` were not checked; they belong to RE-11b and RE-15.
8. **Plan approved.** It lives in `docs/admin-portal-redesign-plan.md` in the
   platform repo.
9. **"Download list":** one form at a time, picked from a list.
10. **"N new":** paid sign-ups in the last 7 days, in club time.
11. **Tester:** Christian is the only Rose City tester.

### What I could not verify

- Production rows: Rose City's admin hostname, whether either club has a `club_identity` row and its `time_zone`, Diverse City's forms and registrations, current owner and helper lists. All design-doc claims about production came from Christian's 2026-11-05 read-only query (`docs/club-rose-city.md`).
- Whether production is on `ab2e439`; HANDOFF records PR #88 deployed and #91/#92 merged without a deploy record.
- Current maximum lengths of `matches.opponent`, `venue`, `competition`, `league_standings.team_name` and `site_sponsor_logos.name` in production (needed before any CHECK).
- Whether `/admin/stats` accepts a match preselect query parameter (`components/admin/stats/CombinedStatsPage.tsx` not read).
- Database-side text limits inside the homepage save RPC for `hero.eyebrow` (`20261022183955_homepage_content_policy.sql` not read).
- Later-slice demos (`cd-season-final`, `cd-programs-final`, `cd-shop-*`, `cd-signin-final`, analytics, payments) were read by header and fixtures only; their PR cards rest on the group docs and decisions, not every screen state.
- Sizes are judgement for one developer with coding agents; S under a day, M one to two days, L three or more.

Key files cited: `/Users/christianalcala/Downloads/onzio-admin-reimagined/docs/MAP.md`, `.../docs/GLOSSARY.md`, `.../docs/decisions/0001-0014`, `.../examples/{cd-desktop,cd-phone,cd-score,cd-game,cd-regs,dc-club-home,rc-site-tabs}/index.tsx`, `.../examples/_worst/data-mode.tsx`; at origin/main: `CLAUDE.md`, `AGENTS.md`, `tests/README.md`, `middleware.ts`, `lib/public-site-hold.ts`, `lib/club-context.ts`, `lib/admin-route-manifest.ts`, `lib/code-site-admin.ts`, `lib/admin-dashboard-data.ts`, `lib/owner-admin-membership.ts`, `lib/admin-data-contract.ts`, `lib/homepage-editor/contract.ts`, `lib/homepage-editor/capabilities.ts`, `lib/season-label.ts`, `app/admin/(protected)/{layout,page}.tsx`, `app/api/admin/{data,members,registrations/export}/route.ts`, `scripts/set-club-store-enabled.ts`, `tests/browser/alpha-store-enabled.global-setup.ts`, `supabase/migrations/{20260726000100_phase2_foundation,20260726000200_phase2_content,20260726000300_phase2_security,20260803192838_plat_101_admin_auth_simplification,20260812120100_editorial_club_identity,20260812120200_club_store_enabled,20260820041635_registrations}.sql`.

## Earlier plan: August 2026 shell redesign

Status: approved for implementation on 2026-08-27  
Implementation branch: `codex/admin-portal-redesign`  
Verified base at kickoff: `origin/staging` at `27b7e4316a36592a8b85396a144f1572862ee2bb`

### Objective

Redesign the entire protected Onzio admin portal to closely follow the visual
language and interaction density of the NextAdmin CRM demo while preserving
Onzio's existing architecture, authorization, routes, data flows, and product
behavior. NextAdmin is a visual reference only; do not copy its code or assets.

### Locked Product Decisions

- Apply the redesign to every protected admin route, not public templates or
  unprotected authentication pages.
- Allow substantial presentation and layout restructuring, but preserve every
  existing field, workflow, URL, save/publish behavior, media flow, Server
  Action, route handler, tenant boundary, role check, lifecycle check, billing
  rule, and RLS boundary.
- Keep the club logo and name as the primary sidebar identity. Place a quiet
  `Powered by Onzio` identity in the sidebar footer.
- Never derive admin chrome colors from club branding. Use restrained
  indigo/blue for primary and focus states, soft gray for active navigation,
  green for success, and red for destructive/error states.
- Support explicit light/dark switching. Default to light, persist only the
  user's explicit choice, do not follow the operating-system theme, and render
  the saved theme on the first server response without a flash.
- Include a functional route search and account menu. Omit notifications and
  every decorative control.

### Navigation Contract

Exact order:

1. Dashboard
2. Website
   - Homepage
   - Programs
   - Tryouts
   - Shop
   - About
   - Sponsors
   - Contact
3. Competition
   - Seasons
   - Roster
   - Schedule
   - Match Stats
   - Season Stats
   - Standings
4. Registrations
5. Analytics
6. Club Settings
   - Branding
   - Team Access
7. Payments

Website, Competition, and Club Settings are collapsible. Exactly one group is
open, and the active route's group opens automatically. Preserve all existing
template, role, lifecycle, and billing visibility rules. Team Access and
Payments remain owner-only. Registrations remains standalone and appears
before Analytics.

Create one server-safe route manifest and one pure visibility function. Use
the same filtered route set for desktop navigation, mobile navigation, search,
and dashboard Quick Actions. Hidden routes and keywords must never enter the
client search payload or DOM. The manifest is discovery logic only; existing
page/API checks and RLS remain authoritative.

### Protected Shell

- Sidebar header: club logo and name.
- Sidebar footer: `Powered by Onzio`.
- Header: strict route search, explicit theme toggle, and account menu with
  current identity/role and Sign out.
- No notification control.
- Preserve the fixed desktop sidebar and the existing mobile off-canvas
  behavior: `100dvh`, body scroll lock, safe areas, touch scrolling, drawer
  closure after navigation, focus restoration, and ARIA relationships.
- Grace-state messaging must remain editable and truthful. Suspended customers
  are read-only. Do not weaken or reinterpret the current access boundary.

### Dashboard Contract

The dashboard contains only:

1. Quick Actions: Registrations, Manage Roster, Manage Schedule, Payments.
2. KPIs: Active Players, Active Staff, Season Matches, Paid Registrations.
3. Registration Forms.
4. Upcoming Fixtures & Events.
5. Registration Mix.

Use real tenant-scoped data only. Never use sample values, fake records, or
false zeroes after query errors. Quick Actions are filtered through the same
visibility and mutation-capability logic as navigation and search; unauthorized
actions disappear and the layout reflows without substitutions.

Upcoming Fixtures & Events combines current/future active-season matches with
current/future tryout events. Do not add registration deadline fields or
automatic closing behavior.

Registration Mix:

- uses current, non-archived forms;
- counts only registrations whose current status is exactly `paid`;
- excludes pending, expired, refunded, and non-paid recovery rows;
- groups by form, shows the five leading positive-count forms, and aggregates
  the remainder into `Other`;
- uses stable tie-breaking;
- paginates lightweight source rows so default API row limits cannot truncate
  the result;
- uses exact display rounding that totals 100%;
- provides a semantic text/table representation alongside the Chart.js
  doughnut;
- handles no forms, no paid rows, one form, many forms, long titles, ties,
  loading, and independent query failures.

The dashboard does not include an activity chart or Recent Activity feed.

### Existing Visualizations

Preserve every existing visualization where it currently lives, especially on
Analytics. Restyle charts to match the protected theme using the existing
Chart.js dependency. Do not add a second chart library. Theme changes must
update chart colors without leaking chart instances or retaining stale colors.

### Route Migration Cohorts

1. Shared manifest, visibility tests, theme tokens, and protected primitives.
2. Atomic shell/header/search/account/mobile cutover.
3. CMS and branding: Homepage, Programs, Tryouts, Shop, About, Sponsors,
   Contact, Branding.
4. Competition: Seasons, Roster, Schedule, Match Stats, Season Stats,
   Standings.
5. Sensitive operations: Registrations, Team Access, Payments.
6. Dashboard and Analytics.
7. Whole-portal stabilization, browser verification, and documentation.

Sensitive registration, membership, and billing pages migrate after the shared
foundation to minimize conflicts with recent work. Do not deploy or integrate
a half-migrated protected portal.

### Verification Contract

Add focused coverage for:

- exact route order and group membership;
- every role, template, lifecycle, tenant-kind, and billing visibility matrix;
- navigation/search/Quick Action parity and search non-leakage;
- light default, explicit persistence, reload behavior, no OS following,
  correct first paint, and public/auth style isolation;
- dashboard tenant scoping, query errors, and every Registration Mix edge case;
- absence of client-supplied `club_id`, service-role dashboard access, and PII
  selection;
- mobile account/search/theme access, keyboard behavior, focus restoration,
  body scroll lock, and horizontal overflow;
- semantic headings and landmarks, described errors, `aria-live`, accessible
  chart alternatives, focus visibility, reduced motion, and WCAG AA contrast;
- every protected route at representative desktop/mobile sizes in light and
  dark mode.

Run narrow suites after each cohort, then run:

```bash
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm run test:db
npm test
npm run test:legacy
npm run lint
npm run build
npm run db:types:check
supabase db lint --local --schema onzio,onzio_private
git diff --check
```

Database-inclusive tests must use loopback local Supabase credentials only.
Do not delete, skip, weaken, or broadly mock a failing contract.

### Expected Boundaries

Expected changes include the protected layout and all protected page files,
`components/AdminShell.tsx`, selected protected shared components and sidebar
primitives, scoped admin tokens in `styles/globals.css`, a shared route
manifest, server-only dashboard queries/reducers, Chart.js theme helpers,
focused unit/contract/browser tests, this plan, and `HANDOFF.md`.

Explicitly out of scope:

- public page/template redesigns;
- login/auth screen redesigns;
- framework, React, Tailwind, or dependency upgrades;
- database migrations or generated-type changes;
- changes to middleware, session semantics, RLS, Stripe, Connect, webhooks,
  media authorization/finalization, or existing mutation boundaries;
- hosted Supabase, Stripe, Vercel, DNS, migration, seed, deploy, or production
  actions.

Expected schema migrations: none.  
Expected new dependencies: `@dnd-kit/core` and `@dnd-kit/sortable` were approved
as an explicit, repo-owner-confirmed exception on 2026-08-27 for Programs' drag
reorder (see the implementation plan's resolved decision D3). No other new
dependency was added.

### Acceptance

The work is complete only when every protected route is visually coherent in
both themes, the exact navigation/search/action visibility contract holds,
all existing product behavior and security boundaries are preserved, all
dashboard data is truthful and tenant-scoped, responsive and accessibility
checks pass, and the required test/build gates are green or an unrelated
baseline failure is recorded with exact evidence.
