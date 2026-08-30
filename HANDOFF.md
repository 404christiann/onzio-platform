# Onzio Platform Handoff

Last updated: 2026-08-30

## `staging` → `main` promotion, Phase 3's `members` route reviewed and fixed before merge — a second real crash-risk bug caught, plus a wrong claim in this file's own previous entry corrected

Agent: Claude Sonnet 5 (Claude Code), 2026-08-30. Status: **The `members` route diff was reviewed with the same 8-angle parallel process used for PR #3, before pushing this time (Christian asked for review-then-push-and-merge, not push-then-review). 10 findings confirmed, 8 fixed, 2 documented and deliberately left. Full verification contract green again after fixes; live-verified end to end again post-fix.**

**Two real correctness bugs, both fixed:**
1. **Orphaned Auth identity on a specific failure path this session's own earlier live testing never happened to trigger.** The `previous` club_members lookup in `addClubAdmin` ran *before* the rollback try/catch boundary — a transient failure there (e.g. the DB read itself erroring) left a just-created Auth identity permanently orphaned, since the catch block's identity-cleanup logic never got a chance to run. Fixed by moving that lookup inside the boundary. Verified by literally reintroducing the bug (temporarily), confirming the new regression test fails and leaks exactly the orphaned identity it's designed to catch, then restoring the fix and confirming the test passes clean.
2. **TOCTOU race in the rollback logic.** The revert branch used a `previous.data` snapshot taken before the upsert, with no guard against a concurrent request having legitimately changed the row in the meantime — a failure in request A after request B's concurrent add had already committed could silently delete B's legitimate membership row. Fixed by adding an `.eq("updated_at", now)` guard to both revert branches, so a revert only applies if the row still shows exactly what *this* request wrote.

**Correction to this file's own previous entry.** Yesterday's entry claimed "the earlier scouting agent's claim that [a DB test] exists at `tests/database/owner-admin-membership.test.ts` was wrong -- that file doesn't exist on either branch." That was wrong. It exists on `staging` (237 lines, exercises `addClubAdmin`/`removeClubAdmin`/`listClubAdmins` against a real local Supabase instance) and was simply never ported. Ported and adapted now (new function names, `sendRecoveryEmail` instead of `sendCode`, dropped the passwordless-token-claims test since that's covered by `tests/contracts/authorization.test.ts` instead) — plus a new third test specifically for the orphaned-identity bug above, since neither `staging`'s original test nor anything else covered that exact failure point.

**Also fixed, lower severity:** the API route's error handler collapsed nearly every `ContractError` code to HTTP 403 (now maps to 401/404/409/429/502 appropriately); the page's `MEMBERSHIP_REQUIRED` message presumed it was always about the *target* admin when it can also fire about the *actor's own* lost membership (reworded to stay accurate either way); four reachable error codes (`CLUB_ARCHIVED`, `CLUB_INACTIVE`, `MFA_REQUIRED`, `UNKNOWN_TENANT`) were missing from the page's error-message map, falling through to a generic, non-actionable fallback; `createClubOwnerSession` was renamed to `createClubOwnerSessionFromVerifiedIdentity` with a much more explicit warning comment, since it does zero verification itself and a future second call site could easily misuse it; added membership-capability test coverage for the archived-club and inactive-membership rejection paths in `tests/contracts/authorization.test.ts` (only "content" had that coverage before).

**Found but deliberately left, not fixed:**
- The onboarding-lifecycle carve-out (`lib/authorization.ts`) lets a club start *billing* setup before going active, but not *membership* management — an owner can't invite a co-admin during onboarding. This might be intentional (block team changes until live) or might just be an oversight from the "membership" capability copying billing's owner-required shape without deciding its own lifecycle policy. This is a product decision, not something to unilaterally change either direction.
- `writeOwnerAudit` duplicates the existing `lib/operator/shared.ts` `writeOperatorAudit` almost exactly. Considered reusing it, but it hardcodes `actor_type: "operator"` and throws a plain `Error` (not the `ContractError` this feature's error-code-driven UI depends on) for its 6 existing callers — extending a widely-used shared helper to accommodate a 7th caller with different semantics was judged riskier than the ~15 lines of duplication it would remove.

**Also surfaced, not part of the 10-finding cap, worth knowing about:** `lib/membership-route-auth.ts` is now a third near-identical copy of the same getUser/AAL2/getClubContext/authorize boilerplate pattern (`lib/billing-route-auth.ts` was the first; `lib/media-route-auth.ts` already existed as a second, pre-dating this session entirely). Three copies is a real signal a `requireCapabilityAuthorization(request, capability)` factory is due, especially with 4 more Phase 3 routes coming that will likely each want their own capability gate -- flagging for whoever picks up the next route rather than doing that refactor unilaterally mid-route-port. Separately: the invite email is Supabase's stock "Reset your password" copy, which will read oddly to a first-time invitee who never had a password -- real UX polish, needs Christian's input on copy/branding, not a code fix. And the two `/api/admin/*` error-response shapes on `main` already disagree with each other (`{error: code}` here vs `{error: {code, message}}` elsewhere) — pre-existing inconsistency this route didn't create and isn't positioned to unilaterally resolve.

**Verification after fixes:** tsc clean, `npm test` 506/506 (up from 499 -- 3 new DB tests, 4 new contract tests), lint clean, build clean. Live-verified logged in locally again: added and removed a real admin through the fixed code path, confirmed both still work end to end.

**Working tree.** All fixes applied directly on top of the uncommitted Phase 3 `members` work on `staging-to-main-promotion` (still synced to `origin/main` at `fb593e9`, nothing pushed from this branch yet as of this entry). No production database, Stripe, or hosted state touched.

**Exact next step:** commit, push, open/update a PR, merge -- Christian's instruction this time was to review before pushing rather than after, so there's no separate "PR review" step expected before the merge like Phase 2 had. Phase 3's other 4 routes (contact, programs, registrations, tryouts) remain unstarted.


## `staging` → `main` promotion, Phase 3 started — `members` ("Team access") route ported and live-verified end to end, adapted off passwordless auth onto main's real password+MFA model

Agent: Claude Sonnet 5 (Claude Code), 2026-08-30. Status: **`members` route fully ported, wired into the sidebar (owner-only), and live-verified: added a real admin, confirmed the password-recovery email actually landed in Mailpit with `type=recovery`, removed the admin, confirmed both `audit_events` rows and the `club_members` status transition in the database directly.** Not committed to a branch/PR yet — working tree only.

**Why this took more than a "port the file" pass.** The earlier Phase 4 scouting agent called `members` the safest Phase 3 route (smallest, `club_members` table already live on `main`). That undersold it: `lib/owner-admin-membership.ts` on `staging` is built entirely on PLAT-101's passwordless session-freshness model (`lib/auth-session.ts` — JWT AMR timestamps, a 30-day freshness window) and invites new admins via `signInWithOtp` (a passwordless sign-in code email). `main` has neither: it's still on password+TOTP auth, has no AMR-freshness concept anywhere in its codebase, and its login page is password-only, so an admin provisioned via a passwordless code would have no way to actually sign in. Porting either piece verbatim would have imported a whole auth architecture `main` hasn't adopted, not just a page.

**How it was adapted, not just copied:**
- Discovered `main` already has a canonical route-authorization pattern for exactly this shape of privileged action: `lib/authorization.ts`'s `authorizeAdminAccess` + `lib/billing-route-auth.ts`'s `requireBillingRouteAuthorization`, used by `/api/stripe/billing-admin` to gate owner-only billing access (getUser → AAL2 → club role, all re-checked fresh). Added a third `capability: "membership"` value alongside `"content"`/`"billing"` (owner-required, same as billing) and a parallel `lib/membership-route-auth.ts` mirroring the billing one exactly, instead of inventing a new bespoke auth-checking function. Added contract test coverage for the new capability in `tests/contracts/authorization.test.ts` (owner allowed, admin rejected with `OWNER_REQUIRED`).
- `lib/owner-admin-membership.ts` ported with its `assertClubOwnerSession` (staging's access-token-claims-based re-verification) replaced by a plain `createClubOwnerSession(actorId, clubId)` — the re-check-at-mutation-time property is preserved, just done once via `requireMembershipRouteAuthorization` in the route handler instead of a second time inside the library function against claims `main` doesn't have.
- The invite flow now calls `session.client.auth.resetPasswordForEmail(email, { redirectTo })` instead of `signInWithOtp` — reusing the exact password-recovery mechanism `main`'s own `/admin/login` "Forgot your password?" flow already sends (`lib/auth-email-callback.ts`'s `createAuthEmailCallbackUrl`, landing on `/admin/auth/callback` → `/admin/update-password`, both pre-existing). A newly-invited admin gets a real path to set a password and log in through `main`'s actual login page, instead of a link to a passwordless flow that doesn't exist here.
- `createServiceRoleClient` usage in the new `lib/owner-admin-membership.ts` required adding it to `tests/architecture/platform-architecture.test.ts`'s service-role import allowlist (mirrors what `staging`'s own version of this same architecture test already does for this same file).
- `components/AdminShell.tsx`: re-added `ownerOnly?: boolean` to `AdminNavItem` and the "Team access" nav entry under Club Settings (Phase 2 deliberately left this out since the route didn't exist yet) — gated on `club.role === "owner"`, matching `staging`'s `cf97d2b8` shape.

**Live-verified, not just gate-green:** logged in as `owner-aal2@alpha.local`, confirmed "Team Access" renders correctly in the sidebar and the page loads the real seeded admins via the new auth chain end to end. Added `new-admin-test@alpha.local` — UI confirmed, then independently confirmed in Mailpit that a genuine "Reset your password" email arrived with `type=recovery` in the link (not a sign-in code), and directly queried the local database to confirm both the `membership_added` audit row and the `club_members` upsert landed correctly. Removed the same admin — UI confirmed, then confirmed the `membership_removed` audit row and the `status: "removed"` transition directly in the database. One local-only wrinkle, not a code bug: the recovery email's `redirect_to` came back pointing at port 3000, not this session's dev server on port 3023, because local Supabase's `additional_redirect_urls` in `supabase/config.toml` only allows port 3000 — the code correctly computed and passed the real request origin; GoTrue's allowlist just doesn't include the nonstandard port this session happened to run on.

**Verification:** tsc clean, `test:architecture` 18/18 (confirms the new service-role allowlist entry didn't break the boundary check and does allow the new file), `npm test` 499/499, `npx vitest run tests/contracts/authorization.test.ts` 23/23 (21 pre-existing + 2 new), lint clean, build clean (`/admin/members` and `/api/admin/members` both compiled, 27 routes total now).

**Deliberately not done, worth flagging:** no dedicated DB-level contract test for `addClubAdmin`/`removeClubAdmin`/`listClubAdmins` themselves (staging has none either, and the earlier scouting agent's claim that one exists at `tests/database/owner-admin-membership.test.ts` was wrong — that file doesn't exist on either branch). The new `authorization.test.ts` coverage tests the authorization boundary, not the membership-mutation logic itself. Live verification exercised the real add/remove/audit path directly against the database, which is real coverage, but a proper contract test would be a good follow-up alongside the same reuse-cleanup pass noted in the entry below this one.

**Working tree.** Uncommitted on `staging-to-main-promotion` (synced to `origin/main` at `fb593e9` before starting). New files: `app/admin/(protected)/members/page.tsx`, `app/api/admin/members/route.ts`, `components/admin/form-styles.ts`, `lib/owner-admin-membership.ts`, `lib/membership-route-auth.ts`. Modified: `components/AdminShell.tsx`, `lib/authorization.ts`, `tests/architecture/platform-architecture.test.ts`, `tests/contracts/authorization.test.ts`. No production database, Stripe, or hosted state touched — all verification was against the local Supabase instance.

**Exact next step:** commit this, then the same pattern as Phases 1-2: push, open/update a PR, review before merge (the review process caught a real bug last time — worth repeating here given this phase involved more invention than a straight port). The other 4 Phase 3 routes (contact, programs, registrations, tryouts) remain unstarted; per the earlier scouting report, `contact` is next-safest, then `tryouts`/`programs` (need a `FileUpload` component ported first), `registrations` last (Stripe Connect coupling, largest scope).


## `staging` → `main` promotion, Phase 2 + Phase 4 (partial) merged to `main` — an 8-angle parallel code review caught and fixed a real crash risk before merge

Agent: Claude Sonnet 5 (Claude Code), 2026-08-29. Status: **[PR #3](https://github.com/404christiann/onzio-platform/pull/3) merged to `main` (`d07f1d1`). `main` now has the multi-tenant AdminShell (Phase 2) and the `seasons` page port (Phase 4, 1 of 14 pages).**

**Review before merge, not just after.** Christian asked for the PR to be reviewed before merging, not just opened. Ran an 8-angle parallel finder pass (correctness x3, reuse, simplification, efficiency, altitude, CLAUDE.md conventions) against the diff, then a 1-vote verifier pass on every surviving candidate. 10 findings survived verification (9 CONFIRMED, 1 REFUTED and dropped — a claimed empty-`club.name` edge case, refuted by a DB `NOT NULL` + length-`≥1` CHECK constraint on `clubs.name` that makes it unreachable).

**The most important finding, fixed before merge:** `app/admin/(protected)/layout.tsx` (this session's own Phase 2 work) added a *second*, redundant `ClubContextProvider` with its own independent `getClubContext()` call — but the ancestor `app/admin/layout.tsx` (pre-existing, untouched) already provides one for the whole `/admin/*` tree. Two independent DB round-trips per request, and two disconnected club-data sources (branding reading the outer club, `AdminShell` reading the inner one). Worse: if the outer call transiently failed, it renders with *zero* providers mounted at all — but the inner layout's own independent call could still succeed, rendering `AdminShell`, whose `useClubBranding()` call would then throw on the missing ancestor provider and crash the shell for an otherwise-valid authenticated admin. Fixed by dropping the redundant provider wrap (kept the `getClubContext()` call itself, since this layout still needs it for its own role/lifecycle authorization gate).

**Also fixed:** `.admin-nav-scrollbar`'s thumb/focus-outline colors were hardcoded white, unscoped to theme — invisible in the light theme this same PR made reachable via the new toggle; swapped to `hsl(var(--foreground) / alpha)` so it adapts to both themes (and updated the contract test pinning the old literal value). A dead `sr-only` span in `AdminThemeToggle` (shadowed by a non-empty `aria-label`, never announced to screen readers) was removed. `NAV_ITEMS`/`NAV_STRUCTURE`'s href coupling was loosely `string[]` with no compile-time link — a typo used to silently drop a nav item with zero error; now `NAV_ITEMS` is `as const satisfies readonly AdminNavItem[]` and `NAV_STRUCTURE.hrefs` is typed against the derived union (smoke-tested with a deliberate typo before and after the fix — confirmed it now fails `tsc`, confirmed it didn't before).

**6 more findings were real but left unfixed, documented instead:** `seasons/page.tsx` hand-rolls button styling instead of using `components/ui/button.tsx`'s already-built `brand`/`secondary`/`destructive` variants; the grouped-nav accordion pattern duplicates a hand-rolled disclosure pattern that already exists independently 5 other places in the codebase (roster page x2, stats page, PlayerModal x2); the club-initials fallback duplicates logic already in `components/Nav.tsx` and a dedicated `teamAbbreviation` helper in `lib/standings-content.ts`; two UI behavior changes (desktop sidebar now sticky/viewport-clamped instead of flowing with the page; active-nav-item highlight lost its background+left-border, now only bold text/icon color) are real and worth a human eyeball, but both are inherited verbatim from the upstream shadcn `Sidebar` primitive's actual design, not something introduced by carelessness; `AdminLoading.tsx`'s default export and `"brand"` tone are shipped with zero call sites. Left these for a follow-up reuse-cleanup pass rather than fixing now, since several would mean diverging from what's actually verified/shipped on `staging` (risking un-tested new deviations) and the accordion/button consolidation is a genuinely separate refactor, not a one-line fix.

**Verification after fixes:** full contract re-run clean (tsc, `npm test` 499/499, lint, build 25/25). Live-verified logged in locally again post-fix: club name/branding still resolve correctly through the single remaining provider, no console errors, seasons page renders correctly in light theme (this time the browser screenshot tool rendered it correctly too, unlike the rendering-artifact noted in the entry below).

**Working tree.** `main` here fast-forwarded from `b1c37cb` to `d07f1d1` to pick up the merge (`git pull --ff-only origin main`). No production database, Stripe, or hosted state touched.

**Exact next step:** unchanged from the entry below regarding Phase 4's remaining 13 pages — still need Christian's explicit decision on the `presentationTemplateKey`/`packages/presentation` scope question before continuing. Phase 3 (5 missing routes) remains fully unblocked, unstarted, and independent of that decision. The 6 documented-not-fixed cleanup items above are worth their own small follow-up pass whenever there's a natural pause, not urgent.

## `staging` → `main` promotion, Phase 2 done + Phase 4 started (1 of 14 pages) — Phase 4 blocked wide open on a real discovery, needs Christian's call before continuing

Agent: Claude Sonnet 5 (Claude Code), 2026-08-29. Status: **Phase 2 fully committed (`f53e612`) and live-verified. Phase 4 partially started (`22abb0c`, `seasons` page only) — then stopped deliberately on discovering the true scope of what blocks the other 13 pages. Not pushed yet.**

**Phase 2 — done.** `components/AdminShell.tsx` now consumes `useClubContext()` instead of hardcoding "Rose City" everywhere, and uses the shadcn `Sidebar`/`SidebarProvider`/etc. primitives from Phase 1 with the same grouped-nav shape (Website/Competition/Club Settings) staging's PLAT-104 commit introduced — trimmed to only routes that exist on `main` today (no Programs/Contact/Tryouts/Team access, since those are Phase 3). `app/admin/(protected)/layout.tsx` now wraps the shell in `ClubContextProvider` and a new `AdminThemeProvider` (theme resolved from a cookie server-side); existing password+MFA auth untouched. Ported `lib/admin-theme.ts`, `components/admin/AdminThemeProvider.tsx`/`AdminThemeToggle.tsx`, and the `.admin-nav-scrollbar` CSS utility the shell references. Updated `tests/contracts/admin-mobile-navigation.test.ts` to match staging's own fix for this exact test (commit `3dacd50`, within the `534cb9b3→cf97d2b8` range the plan cites) since the viewport-clamp classes now live in the Sidebar primitive, not `AdminShell.tsx` directly.

Full Verification Contract green (tsc, `test:contracts` 190/190, `test:architecture` 18/18, `test:db` 48/48, `npm test` 499/499, `test:legacy` 243/243, lint, build 25/25, `db:types:check`, `supabase db lint`, `git diff --check`). Live-verified logged in locally: sidebar shows "Alpha FC" not "Rose City", grouped nav shows only real routes, mobile drawer and desktop persistent sidebar both render correctly, theme toggle actually switches the shell.

**Local dev environment gotcha found and fixed along the way, worth remembering:** the shared local Supabase instance had been reseeded with `staging`'s newer per-environment `club_domains` data by the earlier `db reset` run from the diverse-city worktree (see the entry below this one) — which broke `main`'s simpler, non-environment-aware `getClubContextBySlug` query (`.single()` found 2 matching primary domains instead of 1, both `is_primary=true`, one per environment). Fixed by re-running `supabase db reset` from *this* worktree so the shared local DB matches `main`'s own migrations+seed again. **Whoever picks this up next: if `/admin` login redirects with `not_authorized` unexpectedly, check this first before assuming it's a code bug** — it's an easy trap in a shared local Postgres across multiple worktrees on different branches.

Also found (separately) that `.env.test` had new-style `sb_publishable_`/`sb_secret_` keys instead of the JWT-shaped ones the test helpers require (`tests/helpers/supabase.ts` reads `SUPABASE_TEST_ANON_KEY`/`SUPABASE_TEST_SERVICE_ROLE_KEY` as raw Supabase client keys, which must be the legacy JWT format per `docs/local-development.md`), **and** discovered vitest never auto-loads `.env.test` into `process.env` in this repo's config at all (no `dotenv` wiring in `vitest.config.ts`/`vitest.setup.ts`) — `npm run test:db` silently red-contracts without it. Fixed the key format in `.env.test` (gitignored, local-only fix) and worked around the loading gap by exporting the file into the shell before invoking vitest (`export $(grep -v '^#' .env.test | xargs) && npm run test:db`). The loading gap itself is still unfixed and will bite the next person who runs `npm run test:db` fresh — worth a real fix (wire `dotenv/config` into `vitest.setup.ts`) as its own small task.

**Phase 4 — started, then deliberately stopped after a real discovery.** Before touching any pages, ran 3 parallel scouting agents to diff every Phase 3/4 file against `staging`'s pre-redesign commit (`27b7e43`) instead of guessing. Findings:
- Only **`seasons`** was genuinely polish-only and independent of everything else — ported it (`22abb0c`): semantic design tokens instead of hardcoded hex/rgba, a `Skeleton` loading state, `AdminLoadingDots` on the "Creating…" button. Also ported `components/admin/AdminLoading.tsx` and the `@keyframes spinner-ellipsis` animation it needs. Full Verification Contract green again after this; live-verified logged in, including confirming (via cookie + `getComputedStyle` at every DOM level) that the theme toggle genuinely produces correct light-theme values — the screenshot tool in this session's browser didn't visually reflect it correctly even though every independent check confirmed the CSS was right, which reads as a rendering artifact of the automation environment itself, not a real defect. Worth a plain human eyeball check regardless before fully trusting this.
- **11 of the other 13 pages** (`about`, `roster`, `schedule`, `analytics`, `dashboard`, `homepage`, `shop`, `sponsors`, `standings`, `stats`, `season-stats`) all read `club.presentationTemplateKey`, which **does not exist on `main`'s `ClubContext` at all**. On `staging` it's backed by `packages/presentation/index.ts` — a self-contained but substantial **1361-line template/theming registry** (defines `cinematic@1`/`heritage@1`/`clubhouse@1`/`academy@1`/`editorial@1`/`pathway@1` presentation templates, their sections, fonts, validation, readiness scoring) plus its own DB tables (`presentation_state`, `presentation_documents`). This is the **public-site theming system**, not an admin-polish detail — porting it is a materially bigger, different-shaped effort than "Phase 4 polish," and not something to pull in unilaterally under that banner. **This needs Christian's explicit decision**: either scope it in as its own reviewed phase/step (porting the registry + migrations + whatever else depends on it), or re-scope Phase 4 to explicitly exclude all `presentationTemplateKey`-gated pages until that's decided separately.
- **2 pages aren't polish at all**, regardless of the template-key question: `payments` (staging adds a new `PaymentStatusCard` component and changes the underlying Supabase query shape — `tier` vs `grace_ends_at` — which doesn't line up with `main`'s current `lib/stripe-subscription-state.ts` type) and `branding` (adds a whole new DB-backed "footer tagline" feature via a `site_branding` table). Both should be scoped as their own steps, not bundled into "polish."

**Working tree.** Two commits on `staging-to-main-promotion`, not yet pushed: `f53e612` (Phase 2) and `22abb0c` (Phase 4 partial). Local `main`-worktree-adjacent Supabase state was reset again as described above; no production database or Stripe state touched anywhere in this entry.

**Exact next step:** push this branch and open a PR (or update the existing one) so Christian can review the diff, same pattern as Phase 1. Before any more Phase 4 work: get Christian's decision on the `presentationTemplateKey`/`packages/presentation` scope question above — that answer determines whether the next 11 pages are "port the registry, then the pages" or "skip them entirely for now." `payments` and `branding` need their own separate scoping regardless of that answer. Phase 3 (5 missing routes) remains fully unblocked and unstarted, and does not depend on any of this.

## `staging` → `main` promotion, Phase 1 merged to `main` — production now carries the shared UI component system, nothing wired up yet, Phase 2 still needs Christian's explicit go-ahead

Agent: Claude Sonnet 5 (Claude Code), 2026-08-29. Status: **[PR #2](https://github.com/404christiann/onzio-platform/pull/2) merged to `main` via a standard merge commit (`4019949`). `main` now contains everything described in the Phase 1 entry directly below this one.**

Christian reviewed the diff via the PR, then separately logged in on the actual `staging` build (after I caught and fixed a stale worktree checkout that had been silently 16 commits behind `origin/staging` — see the `staging` verification note below) and clicked through Dashboard, Homepage, Registrations, and Analytics, confirming the redesign target state looks right. He then asked to merge PR #2 directly, which required his explicit go-ahead twice (the CLI merge was blocked by this environment's auto-mode classifier on the first attempt since the PR was still in draft; he marked it ready for review himself, and the retry succeeded).

**`staging` verification note, worth keeping.** The `/Users/christianalcala/Downloads/onzio-platform-diverse-city` worktree used for the `staging` comparison had a stale local `staging` branch checkout, 16 commits behind `origin/staging` — missing the entire admin-portal-redesign work and everything after it (registrations, Stripe Connect, PLAT-101 passwordless auth). It was fast-forwarded to `origin/staging` (`d4d7df5`) mid-session, `npm install` re-run, and `supabase db reset` re-applied all migrations including the new registration tables. Anyone using that worktree for future phase verification should confirm it's still current before trusting what it renders — it's easy for a long-lived worktree to drift silently behind `origin/staging` again.

**Working tree.** `main` locally in `/Users/christianalcala/Downloads/onzio-platform` (a separate worktree from `/Users/christianalcala/Downloads/onzio-platform-admin-portal`, where the promotion branch work happened) was fast-forwarded from `a5ad8a0` to `4019949` to pick up the merge. The `staging-to-main-promotion` branch was not deleted after merging (`--delete-branch=false`), so it still exists on `origin` if needed for reference.

**Exact next step, unchanged:** do not start Phase 2 (`AdminShell.tsx`) without Christian's explicit go-ahead. Also still open: Phase 0's Supabase backup/PITR checkpoint was never confirmed (still needs Christian's Dashboard access), and `supabase migration list --linked` should be re-checked before any future production-affecting step even though it was clean at last check.

## `staging` → `main` promotion, Phase 1 complete (shared UI component system ported, additive-only, zero regression risk) — resume on branch `staging-to-main-promotion`, not `codex/admin-portal-redesign`

Agent: Claude Sonnet 5 (Claude Code), 2026-08-29. Status: **Phase 1 of the approved 6-phase promotion plan is committed on a new integration branch cut from `origin/main`. Nothing has been pushed or merged. `main` itself is untouched.**

**Why this entry looks like it's picking up mid-story with no lead-up.** This HANDOFF.md is `main`'s own copy of the file, last touched 2026-07-27 — it predates the entire admin-portal-redesign effort, which happened on `staging`/`codex/admin-portal-redesign` and has its own much longer HANDOFF.md history on that branch (not this one; the two branches' copies of this file have diverged along with everything else). The approved promotion plan lives at `/Users/christianalcala/.claude/plans/snoopy-squishing-rose.md` — read it in full for complete context. The short version: `staging` has the redesign fully merged; `main` (production) does not, and the two branches diverged by 259+ commits, so promotion is happening as its own 6-phase effort rather than a direct cherry-pick or merge.

**Branch note, important:** this promotion's work happens on a new branch, **`staging-to-main-promotion`**, cut from `origin/main` (not `codex/admin-portal-redesign`, which carries `staging`'s full unrelated history). A fresh session resuming this work should `git checkout staging-to-main-promotion` (or confirm it's already checked out) before reading further — this HANDOFF entry and all promotion commits live there. Re-run `git status`/`git log` to confirm before trusting any of this if picking up cold.

**Phase 0 status:** migration parity reconfirmed clean immediately before this session (`supabase migration list --linked` → all local/remote pairs matched, 0 drift) and `origin/main` reconfirmed unchanged from the plan's original divergence analysis (still exactly 5 commits unique to `main`, same ones the plan already accounted for). The integration branch was cut from `origin/main` at `a5ad8a0`. **Still not done: an explicit Supabase backup/PITR checkpoint.** There is no CLI or MCP tool available to trigger or confirm a manual backup snapshot — Supabase Pro plans run continuous PITR automatically regardless, but confirming/taking an explicit checkpoint needs the Supabase Dashboard, which needs Christian's login. This was flagged to him in-session; not resolved as of this entry. Proceeding with Phase 1 anyway was judged safe because Phase 1 is purely additive local file changes with zero production contact — but Phase 0 shouldn't be considered fully closed until Christian confirms the checkpoint, and it should be re-raised before Phase 6's actual merge to `main` at the latest.

**Phase 1 — done.** Ported verbatim from `origin/staging`, all additive, nothing on `main` imports any of it yet:
- `lib/utils.ts` and all 10 `components/ui/*` files (verified each file's imports first — confirmed clean boundary, only external libraries and `lib/utils.ts`, nothing app-specific)
- The 8 npm packages (`@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `lucide-react`, `react-day-picker`, `motion`), installed at the same major/minor ranges staging uses (some resolved to slightly newer patch versions than staging's exact lockfile — e.g. `lucide-react` `^1.31.0` → `^1.37.0` — still same major, expected for a fresh install, not a version-fork risk)
- `tailwind.config.ts`: added `theme.extend.aria.invalid` and the new admin design-token color layer (`background`/`foreground`/`card`/`popover`/.../`sidebar`), and the `tailwindcss-animate` plugin — all additive keys
- The `.admin-theme[data-admin-theme="light"|"dark"]`-scoped CSS variable block (lines 41–139 of `staging`'s `styles/globals.css`), appended to the end of `main`'s `styles/globals.css`

**One deliberate scope trim vs. staging's actual diff, worth flagging explicitly.** Staging's `tailwind.config.ts`/`styles/globals.css` changes are bundled with a second, unrelated refactor: converting the *existing* brand colors (`white`/`black`/`green`/`red`/`gray`) from hardcoded hex to `rgb(var(--tw-*-rgb) / <alpha-value>)`, backed by a `:root`-level RGB-triple block. The approved plan explicitly scopes Phase 1 to the `.admin-theme`-scoped block only ("not `:root`, stays scoped so it can never repaint the public site or login route") and doesn't mention this brand-color refactor at all. Porting `tailwind.config.ts`'s diff verbatim would have pointed `white`/`black`/`green`/`red`/`gray` at undefined CSS variables (since the backing `:root` block was deliberately not ported), breaking every public-site page using those utilities. Caught this before applying the diff, not after — kept `main`'s existing hex values untouched and only added the genuinely-new admin design-token keys alongside them. If a later phase wants that brand-color refactor too, it needs its own explicit pass (porting the `:root` RGB-triple block from `styles/globals.css` at the same time), not an assumption that Phase 1 already covers it.

**Verification:** `npx tsc --noEmit` clean, `npm run lint` clean (only 3 pre-existing warnings in `analytics/page.tsx`, unrelated to this change), `npm run build` clean (25/25 static pages, same route list and comparable bundle sizes as before — the one Edge Runtime notice on `@supabase/supabase-js` is pre-existing and unrelated, noted in this repo's history already). Confirmed via `grep` that no existing file under `app/`/`components/`/`lib/` imports `@/components/ui/*` or `@/lib/utils` yet — zero code paths reach the new files, so this cannot have caused any visible regression. Did not do a live browser spot-check this session: the port-3022 dev server documented in prior entries belongs to the *other* worktree (`onzio-platform-diverse-city`, running `staging`), and attaching to it would have verified the wrong branch, not this one; setting up a separate local dev server/tenant for this branch specifically was judged unnecessary given the static evidence (no imports = no possible visual diff) already fully accounts for Phase 1's "confirm zero visual change" requirement. A future phase that actually wires these components into a page should get a real live check.

**Committed, not pushed.** Single commit `2f04d78` ("Phase 1: port shared UI component system from staging") on `staging-to-main-promotion`, 15 files changed. Nothing pushed to `origin`; nothing touches `main`.

**Exact next step:** per this session's carried-over guardrail, **do not start Phase 2 (`components/AdminShell.tsx`) without explicitly checking in with Christian first** — the plan itself flags Phase 2 onward as needing dedicated attention, not a same-sitting continuation, since it's the piece most feared to be an opaque rewrite (though the plan's research found it's actually a well-documented incremental history). Before Phase 2 starts, also worth closing the loop on the still-open Phase 0 backup/PITR checkpoint with Christian.

## Current State

Phase 8 local Rose City transformation/preflight implementation and the
read-only Onzio production preflight are complete. The exposed legacy
production credential has been contained. The production migration and cutover
have not begun.

The isolated `Onzio Platform Staging` Supabase project now contains only
synthetic Alpha and Bravo tenants. Ten checked-in migrations are applied
without the local seed, modern publishable/secret keys replace disabled legacy
keys, leaked-password protection and TOTP MFA are enabled, and the exposed
`onzio` schema remains separated from private security helpers. Supabase's
security advisor has no warnings; its four remaining informational notices
describe intentionally policy-free internal/write-only tables.

The protected `onzio-platform-staging` Vercel project serves the `staging`
branch behind Vercel Authentication. Preview-scoped variables contain only
staging Supabase and Stripe test-mode values. Alpha and Bravo have separate
verified staging domains, and unknown or cross-tenant hosts fail closed.

The real Stripe test path is exercised end to end: owner Checkout created an
active Starter subscription, the staging webhook projected it, Customer Portal
opened for the owner, and Starter→Pro→Starter changes projected correctly.
Duplicate, stale, foreign-environment, customer-metadata, and unknown-price
events failed closed.

Hosted verification covers AAL1/AAL2, roles, membership revocation, tenant RLS,
HTML/RSC cache isolation, Starter/Pro entitlements, media normalization and
rejection, retry and cleanup, paid/grace/suspended lifecycle states, archive,
reactivation, and atomic rollback. Alpha is restored active/live/Starter with
its test subscription; Bravo is restored onboarding/private-preview with no
subscription.

No Rose City production data, production Stripe subscription, production DNS
record, or production Supabase schema/data was mutated. The only production
mutations were the explicitly approved credential-safety changes: legacy API
keys were disabled and the legacy HS256 signer was revoked. The eight Phase 8
Rose City transformation/migration contracts are now green, as are the complete
local contract, architecture, database, legacy, and combined suites.

## Completed Work

### Phase 1 — Bootstrap and threat model

- Copied and verified the Rose City compatibility baseline without secrets,
  dependencies, build output, nested Git state, or the legacy Supabase image
  loader.
- Completed the source/schema/route/read/write/media inventory, access matrix,
  threat model, gap register, and guarded read-only production introspection.
- Preserved the contract-first harness and legacy regression suite.

### Phase 2 — Database security foundation

- Added the `onzio` exposed schema and private `onzio_private` security
  boundary.
- Added tenant-owned content, billing, audit, and media tables with composite
  tenant foreign keys, grants, RLS, storage policies, and deterministic
  Alpha/Bravo fixtures.
- Added generated database types and authenticated local RLS/storage tests.

### Phase 3 — Atomic tenant conversion

- Added strict hostname normalization, verified domain resolution,
  tenant-specific rewrites, tenant-aware cache keys, and `ClubContext`.
- Converted public reads and protected admin mutations to explicit tenant
  scope.
- Added password authentication, TOTP/AAL2 enforcement, role/lifecycle/tier
  authorization, and server-side protected-page gates.
- Removed Rose City content fallbacks from tenant requests.
- Added published `media_assets` resolution and selective image-delivery
  behavior.
- Verified Alpha/Bravo isolation and retained the local database/RLS gate.

### Phase 4 — Secure media pipeline

#### Paths and validation

- Added strict tenant/surface/UUID path construction and parsing in
  `lib/storage-path.ts`.
- Added magic-byte detection, MIME/extension agreement, byte limits,
  decoded-dimension limits, corruption handling, decompression-bomb rejection,
  and photo/graphic allowlists in `lib/media-validation.ts`.
- Rejects SVG, GIF, executable/spoofed, malformed, and unsupported input before
  any public write.

#### Normalization and delivery

- Added Sharp photo processing with orientation correction, metadata
  stripping, no upscaling, a 2400px long edge, and WebP quality 82.
- Added graphic processing with transparency preservation and optimized PNG
  retention when WebP would be larger.
- Kept large photographic surfaces on Vercel optimization and small graphics
  unoptimized.
- Retained the static prohibition on Supabase runtime Image Transformation
  URLs and the exact `onzio-media` remote pattern.

#### Authorization and finalization

- Added `/api/admin/media/authorize` for AAL2, membership, lifecycle, tier,
  surface, MIME, and claimed-size checks.
- Browser uploads go directly to the private `onzio-upload-staging` bucket
  through a short-lived signed upload authorization.
- Added a server-only, HMAC-bound upload authorization tying the upload ID,
  actor, club, surface, kind, staging path, and expiry together.
- Added `/api/admin/media/finalize`, which re-checks tenant/user authorization,
  downloads staging through the narrow service-role boundary, validates and
  normalizes the real bytes, publishes an immutable UUID path, records
  `media_assets` and a narrow audit event, and removes staging.
- Finalization is idempotent. Database/audit failures trigger compensating
  public-object rollback.

#### Replacement, cleanup, and monitoring

- Replaced the Phase 3 fail-closed storage adapter with the secure media
  adapter used by existing admin pages.
- Automatically adds media asset IDs to supported admin content payloads.
- Added versioned Onzio URL parsing for homepage, sponsor, about, and shared
  storage cleanup flows.
- Added `/api/admin/media/cleanup` and retirement behavior that preserves the
  new reference before old-object deletion.
- Added `onzio.media_cleanup_queue` for failed staging/public cleanup retries.
- Added `npm run media:cleanup` for abandoned staging objects older than 24
  hours and `getMediaUsageByClub` for asset/byte monitoring.
- Added `npm run media:smoke` for local end-to-end verification.
- Added an explicit Node 20 WebSocket transport to the shared service-role
  Supabase client.

### Phase 5 — Authentication and operator workflows

#### Operator boundary and provisioning

- Added a server-only operator allowlist through `ONZIO_OPERATOR_USER_IDS`.
- Added validated direct-invocation guards so operator functions cannot be
  exposed through ordinary application routes.
- Added compensated club provisioning for club, verified primary domain,
  owner Auth user/invite, owner membership, and audit creation.
- Reuses an explicitly verified existing Auth user without duplicating the
  account.
- Maps slug/domain conflicts and rolls back database/Auth artifacts when a
  later provisioning step fails.

#### Membership and MFA recovery

- Added operator-only membership activation/reactivation and removal.
- Re-checks the Auth identity, current club lifecycle, and membership state at
  mutation time.
- Prevents removal of the last active owner and restores the previous
  membership if audit recording fails.
- Added manual-identity-verification-gated MFA recovery using Supabase Auth
  admin factor removal and a generated password recovery link.
- Stores only a SHA-256 digest of the operator verification reference in the
  start/completion audit records.

#### Archive, reactivate, export, and purge

- Added archive behavior that suspends the club, detaches domains, blocks
  existing sessions/writes through the existing lifecycle gates, preserves all
  content/media, and records an operator audit.
- Added reactivation into onboarding/private-preview state with the verified
  primary domain restored; billing is still required before public launch.
- Added the privileged `club_exports` verification ledger with no browser
  grants and regenerated database types.
- Added exact-confirmation hard purge with local storage removal and
  dependency-ordered tenant-row deletion.
- Changed immutable audit/Stripe club foreign keys to `on delete set null` so
  their ledgers survive a hard purge without granting service-role
  update/delete access.
- Added a final hard-purge audit outside the deleted tenant.
- Added `npm run operator:smoke` and local-development operator documentation.

### Phase 6 — Stripe billing

#### Checkout, Portal, and authorization

- Added strict, distinct `STRIPE_PRICE_ID_STARTER` and
  `STRIPE_PRICE_ID_PRO` mapping with staging/test and production/live mode
  enforcement.
- Replaced the legacy email allowlist with verified-tenant, AAL2,
  active-owner billing authorization.
- Added first-subscription Checkout with idempotent Customer and Session
  creation plus club/environment metadata on the Customer, Checkout Session,
  and Subscription.
- Routes every existing subscription row to Customer Portal and derives all
  success, cancel, and return URLs from the verified primary domain.
- Updated the Payments page for tenant-specific Starter/Pro selection and
  existing-subscriber management.

#### Webhook and transactional projection

- Added raw-body Stripe signature verification and a narrow required-event
  allowlist.
- Retrieves canonical Stripe state for subscription, Checkout, and invoice
  events and verifies canonical Customer metadata.
- Added pure event routing for duplicate, stale, environment, customer,
  subscription, price, obsolete-deletion, and reconciliation decisions.
- Added private security-definer functions plus service-role-only exposed
  wrappers that atomically write `stripe_events`, `club_subscriptions`,
  `clubs.tier`, lifecycle, and runtime access.
- Rejected events receive digest-only ledger records; failed projection writes
  roll back the event insert and every runtime change.
- Revoked direct service-role update/delete access to the immutable Stripe
  ledger while preserving private transactional state transitions and
  hard-purge `club_id` detachment.

#### Runtime access and regression coverage

- Added dynamic database projection for preview, live, grace, and suspended
  access so grace expires without requiring a precisely timed webhook.
- Preserved private-preview content preparation before the first subscription.
- Restricted content mutations and non-billing admin routes after paid access
  ends while keeping Customer Portal available to owners.
- Added deterministic active-subscription seed state for Alpha.
- Added database regressions for atomic application, duplicate/stale
  rejection, rollback, grace expiry, RPC privilege boundaries, and ledger
  immutability.
- Corrected two approved contradictory Stripe fixtures: the duplicate now
  identifies the already-applied event, and Rose City reconciliation carries
  Rose City tenant metadata while preserving the existing subscription ID.

### Phase 7 — protected staging gate

- Added `docs/phase-7/staging-gate.md` and completed every hosted-resource and
  acceptance row with staging-only evidence.
- Created the separate `Onzio Staging` organization
  (`udlsrxgfpkqjaridfxnz`) and `Onzio Platform Staging` project
  (`fxefqnoqxbezeccjvrsw`) in `us-west-2`.
- Linked the checkout using a Keychain-held database password and applied ten
  checked-in Phase 2–7 migrations without `supabase/seed.sql`.
- Added a minimal private-preview resolver, exact webhook routing bypass, and
  empty-search-path/revoked-execution hardening for hosted runtime functions.
- Disabled legacy `anon`/`service_role` API keys, retained modern
  publishable/secret keys outside the repository, enabled leaked-password
  protection, and kept TOTP enrollment/verification enabled.
- Added a guarded `npm run staging:provision` workflow and provisioned the
  operator plus synthetic Alpha/Bravo owner/admin identities with verified
  domains, memberships, audit records, and TOTP AAL2 factors.
- Linked the Vercel project `onzio-platform-staging`
  (`prj_I362ysmh9cse5cRxnL7db4dOhsEs`) to GitHub, scoped all staging values to
  the `staging` Preview branch, and enabled Vercel Authentication.
- Deployed the protected staging application and mapped the Alpha/Bravo aliases
  to the verified `staging` branch deployment.
- Rotated the Stripe test secret, retained it outside the repository, and
  configured test Starter/Pro Prices, Customer Portal, and webhook
  `we_1TxrnaK6WajTkwHYtFEvCEo8` with the exact seven-event allowlist.
- Created and paid a real test Checkout, projected subscription
  `sub_1TxsLTK6WajTkwHYEUjdWeNR`, verified Portal and Starter/Pro switching,
  then restored Alpha to active/live/Starter.
- Added reusable hosted auth, Stripe, media, and lifecycle verifier scripts.
  The media cleanup verifier now scopes destructive cleanup to its unique
  synthetic club prefix.

### Phase 8 — local Rose City migration gate

- Added `lib/migration/rose-city-transform.ts` as a pure, deterministic
  preflight and transformation boundary with no hosted or filesystem writes.
- Added tenant-key injection, snake-case relationship mapping, real duplicate
  detection, tenant relationship validation, declared row-count reconciliation,
  media availability/corruption/checksum checks, and traversal-safe media paths.
- Added deterministic UUID-versioned `onzio-media` plans that never use
  Supabase runtime Image Transformations and preserve transparent-graphic
  extension behavior when declared.
- Preserved the existing Rose City Stripe subscription ID in the transformed
  result and added a stable source digest for idempotent replay verification.
- Added five regressions that prove real malformed manifests fail without
  relying only on the original contract simulation flags.
- Added `docs/phase-8/rose-city-migration-runbook.md` with the target evidence,
  credentials, approval boundaries, backup/export gate, rehearsal sequence,
  production/cutover sequence, rollback window, and acceptance evidence.
- Verified `Onzio Platform Production` as project ref
  `ioalthwsdrlzrubomrow`, region `ca-central-1`, Micro compute, status
  `ACTIVE_HEALTHY`, in the Pro `404DB` organization.
- Completed the read-only production preflight through the authenticated
  Supabase Dashboard: the `public` schema has no tables, migration history is
  empty, Auth has no users, Storage has no buckets, scheduled daily backups are
  available, and the project usage view shows no disk overage.
- Recorded a credential-safety incident: the Supabase CLI returned complete
  legacy JWT keys without `--reveal`, exposing the legacy production
  service-role credential in the tool transcript.
- Contained the incident under Christian's explicit approval: disabled the
  legacy `anon` and `service_role` API keys, retained the modern
  publishable/secret posture, and revoked the previous legacy HS256 signing key
  so the exposed service-role JWT is no longer trusted. The current signer is
  ECC P-256.

## Verification

### Phase 6 green gates

```text
npx vitest run tests/contracts/stripe-subscription.test.ts
  24/24 Phase 6 Stripe contracts passed

npm run test:db
  45/45 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only local Supabase values; 23 static pages generated

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors
```

### Intentional-red later-phase gates

```text
npm run test:contracts
  129 passed, 8 intentional failures, 137 total

npm run test:architecture
  16/16 passed

npm test (with local Supabase test values)
  434 passed, 8 intentional failures, 442 total
```

The remaining failures are assigned to later phases:

- eight Rose City transformation/migration contracts (Phase 8)

### Phase 7 final gate — 2026-07-27

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npm run test:contracts
  129 passed, 8 intentional Phase 8 failures, 137 total

npm test (with loopback-only local Supabase values)
  434 passed, 8 intentional Phase 8 failures, 442 total

npm run db:types:check
  generated definitions match the local schema

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  23 static pages generated

supabase db lint --linked --schema onzio,onzio_private
  no schema errors
```

Hosted staging verification:

- `phase7.hosted_auth_verified`: AAL1/AAL2, four tenant sessions, RLS/cache
  isolation, roles, Starter entitlement, Portal, and immediate revocation pass
- `phase7.hosted_media_verified`: normalization, rejection, idempotency,
  retirement, and scoped abandoned-staging cleanup pass
- `phase7.hosted_stripe_verified`: duplicate, stale, environment, customer, and
  Price boundaries pass
- `phase7.hosted_lifecycle_verified`: retry, grace, suspension, archive,
  reactivation, and rollback pass
- real Stripe test Checkout, webhook projection, Customer Portal, and
  Starter→Pro→Starter projection pass
- Supabase security advisor reports no warnings; four intentional
  `rls_enabled_no_policy` informational notices remain

### Phase 8 local gate — 2026-07-27

```text
npx vitest run tests/contracts/provisioning-migration.test.ts \
  tests/contracts/rose-city-transform-regressions.test.ts
  23/23 passed

npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:contracts
  142/142 passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm test (with loopback-only local Supabase values)
  447/447 passed across 35 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase values; 23 static pages generated
```

No test was deleted, skipped, marked todo, loosened, or broadly mocked.

Known non-blocking warnings:

- four raw `<img>` warnings
- three unnecessary analytics `useMemo` dependency warnings
- the existing Supabase SSR Edge-runtime compile warning

## Known Constraints and Blockers

- `Onzio Platform Production` is healthy and its empty application state was
  verified through the Dashboard. No production migration has been applied,
  the checkout is not linked to production, and no production SQL was run.
- The exposed legacy production service-role key must never be reused. Its API
  keys are disabled and its legacy HS256 signing key is revoked; production
  configuration must use only the modern key posture.
- Rose City production freeze/import/cutover has not begun and still requires
  Christian's explicit approval.
- The staging organization is temporarily Pro for the Phase 7/Phase 8
  migration month; the architectural steady state remains Free staging after
  the migration rollback window.
- The Vercel staging project's Production scope is intentionally unused.
  Staging secrets exist only on the protected `staging` Preview branch, so
  `main` must not be treated as the hosted staging target.
- Hosted operator execution must configure the exact actor UUID allowlist in
  `ONZIO_OPERATOR_USER_IDS`; no operator application UI or route exists.
- `npm run test:db` and full database-inclusive tests need JWT-shaped local
  `ANON_KEY` and `SERVICE_ROLE_KEY` values mapped into the
  `SUPABASE_TEST_*` variables.
- A hosted environment must schedule `npm run media:cleanup` and configure the
  planned 50%, 80%, and 100% Vercel image-spend notifications.
- The development-only ESLint 8 dependency-chain findings remain until the
  planned framework/lint-tooling migration.

## Next Milestone

Phase 8 full local import rehearsal and production-provisioning gate.

First, create the immutable Rose City database/Auth/Storage export and complete
the full local transformation/import/rollback rehearsal. Before any production
schema/data mutation, verify the Rose City source backups and object checksums,
record the freeze/rollback evidence in
`docs/phase-8/rose-city-migration-runbook.md`, and obtain separate explicit
approval to apply the reviewed migrations to the exact production ref.

Do not begin Rose City freeze/import, production migration, Auth configuration,
Storage work, production Stripe mutation, Vercel production deployment, DNS
work, webhook cutover, organization downgrade, or project deletion without the
applicable explicit approval.

## Working Commands

```bash
npm run db:start
npm run db:reset
npm run db:types
npm run db:types:check
npm run test:db
npm run test:legacy
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm test
npm run media:smoke
npm run media:cleanup
npm run operator:smoke
npm run lint
npm run build
```

For Apple Silicon systems where analytics/vector services conflict with the
local container runtime:

```bash
supabase start -x vector,logflare
```

After each meaningful milestone, update this file with shipped work,
verification, blockers, and the next step.
