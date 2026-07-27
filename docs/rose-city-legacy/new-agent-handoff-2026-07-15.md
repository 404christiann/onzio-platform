# Rose City FC New Agent Handoff - 2026-07-15

## Start Here

Repository:

```text
/Users/christianalcala/Downloads/roseCityWebsite
```

Read these files in order:

1. `CLAUDE.md`
2. `HANDOFF.md`
3. `SUMMARY.md`
4. this file
5. `docs/multi-season-implementation-plan.md`
6. `db/migrations/2026-07-multi-season.sql`
7. `docs/stripe-subscription-plan.md`

The last committed release recorded here is `9f98c2c1` on `main`, built on
`0d4150bf`. The current local working tree extends that with admin-managed
homepage/about/sponsor/shop/branding content: homepage slideshow and Behind
the Rose editing, editable About and Club Logo pages, sponsor carousel/footer
logos, shop-page Home/Away kits, editable shop Purchase Details, and editable
footer social links. This handoff was originally written at `1737959a` (`Add
admin-managed shop experience`) and has been refreshed after each shipped or
locally verified release. The worktree
may contain the generated cache file `tsconfig.tsbuildinfo`; do not treat it
as product work or commit it by default. Always inspect `git status` and
current diffs before editing because this repository has previously contained
work from multiple agents. Never `git push` to `main` without the user's
explicit permission for that specific push — see "Working Rules" below.

Local dev and production currently share one Supabase project — there is no
separate test database. Local Stripe testing with test-mode keys writes into
the same `stripe_subscription` row production reads; clear/re-sync it
afterward before trusting it live. See "Stripe Subscription Billing" below.

## Current Product State

Shipped in `9f98c2c1`: a Club nav section. "Club" (after
"Roster" in `components/Nav.tsx`) is **not a link** — it's a hover-triggered
dropdown on desktop and a tap-to-expand accordion on mobile, existing only to
reveal "About Club" (`/club/about`) and "Club Logo" (`/club/logo`); there is
no `/club` hub route. `/club/about` is a light editorial story page.
`/club/logo` is a full-page dark (`#18181A`) crest explainer where the nav
intentionally stays in its transparent/white-text hero state for the whole
scroll (`isAlwaysTransparentPage` in `Nav.tsx`); it renders a single
pre-composed annotated-crest image (`ClubLogo_initial_image.png`), five
feature rows (Name/Rose/#23/Crown/Key, each cropping heavy transparent
padding out of its source PNG via a measured CSS `scale()` on an
`overflow-hidden` box), then the Pasadena map image. Current copy/assets are
editable from `/admin/about`.

Shipped in `5fb0b6fd`: the homepage Next Match presentation has an optional
per-match linked sponsor and compact fixture metadata. Sponsor
fields are edited in `/admin/schedule` and carried from the latest match when
creating a new one. Production sponsor columns and upload policies were
verified on 2026-07-17; existing matches intentionally remain unsponsored.

Shipped in `5fb0b6fd`: homepage and `/shop` kit presentations are split
into independent `home` and `shop` content/photo sets. The admin selects the
surface before editing. Production surface rows, photo sets, and authenticated
write policies were verified on 2026-07-17. The migration remains the setup
path for new environments.

The public website and protected Supabase admin portal are production Next.js
applications deployed by Vercel. The visual refresh and multi-season admin work
described in older handoffs are complete; do not restart those phases.

Brand and typography to preserve:

- Lemon Milk for display headings and DM Sans for body/navigation text.
- red `#E7001B`, black `#141414`, and white `#FFFFFF`.
- public pages should feel editorial and club-forward.
- admin pages should remain dense, dark, and operational.

## Multi-Season Implementation - Complete

Supabase gate:

- `matches.season_id` exists and existing matches are backfilled.
- `player_season_stats` and `goalkeeper_season_stats` use
  `PRIMARY KEY (player_id, season_id)`.
- null season counts for matches and both season-stat tables are `0`.
- the active season is `2025–26`, id
  `e3e7e955-4e7d-4887-821b-06ccc23c2cf3`.

Application behavior:

- `fetchActiveSeason()`, `useSeasons`, and the shared admin `SeasonSelect`
  exist.
- `/admin/seasons` is the dedicated, intuitive season-management page.
- `/admin/season-stats` loads and saves the selected season using conflict key
  `(player_id, season_id)`.
- `/admin/schedule` requires a season on every match and filters the list by
  season.
- `/admin/stats` filters its match picker and player cohort by season.
- the dashboard and public schedule use the active-season label and matches.
- adding a player seeds a zero stats row in the active season.
- season deletion is guarded against matches or non-zero stats; permitted
  deletion removes zero seed rows first.

### Player Activation Contract

This lifecycle was added after a public-roster regression:

- the active-season public roster must exclude `players.active = false`.
- historical rosters remain based on season-stat row membership so former
  players still appear in their historical season.
- activating an inactive or older player first upserts a zero active-season
  stats row with `ignoreDuplicates: true`, preserving any existing totals, and
  then sets the player active.
- deactivation keeps season statistics intact.
- admin roster mutations surface errors rather than silently appearing to
  succeed.

Tests cover active to inactive to active, inactive to active to inactive, and
new/older player activation scenarios. Keep these semantics when changing
roster queries or admin actions.

## Shipped Public UI

- Homepage video hero is approximately half-screen on desktop; mobile remains
  immersive.
- The UPSL SoCal North Conference feature is also approximately half-screen.
- Homepage hero CTA is `Team Store`, links to `/shop`, and has no arrow.
- The two-image 2026 kit treatment is used on the homepage immediately after
  the video and on `/shop`; each surface loads its own content and ordered
  photos from the public Supabase `shop` bucket.
- Homepage order is Hero → Home kit presentation → trophy feature → Next Match
  → photo slideshow → sponsor carousel → league standings → Behind the Rose.
- `/admin/homepage` manages the homepage photo slideshow and Behind the Rose
  video section. The slideshow supports up to six ordered photos, with the
  current three local slideshow images seeded and retained as public fallbacks.
  Behind the Rose has editable visibility, eyebrow, title, description, video
  URL, iframe title, and caption, seeded from the current section content.
  New slideshow uploads use the public `homepage` Storage bucket; saved
  removals clean up uploaded Storage objects. Apply
  `db/migrations/2026-07-homepage-content.sql` in environments missing this
  editor/schema.
- `/admin/shop` independently edits the homepage kit and shop-page kits.
  Home Page has one kit. Shop Page has public Home/Away tabs, independent text,
  purchase links, ordered photo sets, Purchase Details, and shop-only
  variant-specific Photo Rows. Its scaled previews use the same public components, and the
  editor adapts to mobile admin layouts.
- `/admin/standings` manages the homepage league standings table. The public
  table renders after the sponsor carousel, uses a white Rose City-branded
  treatment, highlights the Rose City row in red, uses the shared club crest
  for the Rose City row, and lets admins upload optional team logos for the
  other clubs. Run `db/migrations/2026-07-league-standings.sql` before using
  this editor in a new environment.
- Shop form labels use plain language for non-technical club managers.
- Save actions throughout the admin portal use the shared subtle
  saving/success feedback treatment.
- Shop purchase labels are non-bold, detail headings are non-italic, and the
  `Purchase Details` section heading is italic.
- The shop cinematic slideshow remains implemented but is temporarily hidden
  with `SHOW_SHOP_HERO = false` in `lib/site-flags.ts`.
- Navigation shows Rose City, US Soccer, FIFA, Lamar Hunt U.S. Open Cup, and
  UPSL marks from the public `logos_v2` bucket. Only the Rose City mark links,
  and it links home. US Soccer and UPSL remain in color. White variants appear
  over the homepage video, with regular/color variants after scroll and on
  light interior states.
- Navigation labels use DM Sans without changing their established sizing.
- The Rose City color patch from `logos_v2` is shared by the navigation and
  player cards that have no headshot.
- Roster nationality flags come from the public Supabase `flags` bucket and
  hide gracefully when no mapping or asset exists.
- Player and technical-staff cards/modals use the white treatment. Staff cards
  show the name, nationality flag, initials badge, and staff title.
- Player card stats slide up only on desktop hover. Mobile cards stay visually
  stable and open the full player modal directly when tapped.
- Player and staff modal dimensions are bounded by a fixed-yet-responsive
  viewport height with internally scrolling details.
- Player Bio and Season Stats sections begin expanded and remain collapsible.
- Footer sponsors, except Tepito Coffee, use the public Supabase `sponsors`
  bucket. They are larger and remain fully visible without hover.
- Footer social media links are editable from `/admin/branding`; icons remain
  fixed local SVG assets.
- League standings are editable from `/admin/standings`; teams without
  uploaded logos use abbreviations so the table still looks complete.
- `Behind the Rose` responsive headings retain their one-line fixes.

## Authentication And Deployment

- Admin auth uses Supabase email magic links.
- Access is controlled by the comma-separated `ADMIN_ALLOWED_EMAILS`
  environment variable; do not hardcode admin emails.
- A user needs a Supabase Auth account/invitation, their email in the Vercel
  environment variable, and a redeploy after environment changes.
- Supabase Redirect URLs must include the deployment callback, for example
  `https://rose-city-website.vercel.app/admin/auth/callback`. A magic link that
  redirects to the site root is a configuration problem, not a reason to
  hardcode a redirect.
- Pushes to `main` trigger Vercel deployment.

## Admin-Managed Shop Data - Complete

- `shop_kit_section` stores separate `home` and `shop` text/purchase-link records,
  with `kit_variant` splitting each surface into `home` and `away` kits.
- `shop_kit_photos` stores one to six ordered public image URLs per surface and
  kit variant. Multiple Kit Photos autoplay as a fade rotation with no public
  controls; one photo remains static.
- `shop_purchase_details` stores the shop-page Purchase Details heading, four
  detail cards, footer copy, and CTA button/link.
- `site_social_links` stores the footer social media URLs. Icons remain fixed
  local assets; `/admin/branding` edits the outbound links.
- The homepage and `/shop` both use `ShopKitSectionContainer` and the same
  `ShopKitSection` presentation component. Public Home/Away tabs appear only
  on `/shop`; the homepage uses its single home kit presentation.
- `/admin/shop` supports uploads to the public `shop` bucket, photo removal and
  ordering, draft preview, Shop Page Home/Away kit editing, Purchase Details
  editing, and responsive mobile administration.
- `/admin/branding` manages the global club logo and footer social media links.
- In `/admin/branding`, the logo preview/usage panel sits next to the Main
  Club Logo card, and the Social Media Links panel spans below it.
- The editor includes one to eight editable/reorderable product bullet points
  and editable multiline store information in the exact public preview.
- `db/migrations/2026-07-shop-kit-section.sql` records the tables, grants, RLS
  policies, seed content, and storage policies for future environments.
- Production setup is complete. Do not rerun the migration against production
  unless the schema has been re-verified and Christian explicitly requests it.
- The new `bullet_points` and `store_note` columns are an additive follow-up.
  Run `db/migrations/2026-07-shop-kit-details.sql` before testing those saves;
  do not rerun the original Shop migration.
- The Home/Away split is the additive follow-up in
  `db/migrations/2026-07-shop-kit-variants.sql`; it copies the current Home Kit
  content/photos into Away Kit records so existing shop data is not reset.
- The editable purchase-details block is the additive follow-up in
  `db/migrations/2026-07-shop-purchase-details.sql`; run it before saving the
  Purchase tab in `/admin/shop`.
- The editable footer social links are the additive follow-up in
  `db/migrations/2026-07-site-social-links.sql`; run it before saving Social
  Media Links in `/admin/branding`.
- New environments use `db/migrations/2026-07-shop-kit-surfaces.sql` for the
  `home`/`shop` split. `db/migrations/2026-07-shop-kit-rls-repair.sql` is the
  safe, rerunnable repair for stale authenticated section/photo policies.

## Shared Club Branding - Complete

- `/admin/branding` provides one plain-language main-logo upload workflow with
  file validation, light/dark previews, and the shared save feedback.
- `/admin/branding` also edits the footer social media URLs stored in
  `site_social_links`; social icons remain fixed local SVG assets.
- `site_branding` is a singleton public-read/authenticated-write record. The
  active logo is stored as a `logos_v2` object path rather than a fixed URL.
- `ClubBrandingProvider` supplies navigation, footer, admin login/sidebar,
  next-match crest, and roster placeholder views.
- `/club-logo` dynamically redirects the browser icon to the active crest.
- Missing player photos stay empty in storage. Legacy logo placeholders are
  normalized back to empty on save so they continue following the active crest.
- Run the additive, idempotent
  `db/migrations/2026-07-site-branding.sql` before testing an admin upload in a
  new environment. It does not remove or replace the current crest. The admin
  replacement flow removes the previous admin-uploaded file after the new logo
  is saved.
- Run `db/migrations/2026-07-site-social-links.sql` before saving Social Media
  Links in `/admin/branding` in a new environment.
- Production `site_branding`, the public `logos_v2` bucket, and the signed-in
  Storage policies were manually verified on 2026-07-16. Do not rerun the
  setup against production by default.

## Verification

Current shipped-release checks (2026-07-23, commit `9f98c2c1`):

```text
npm test                         183/183 tests passed across 10 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

Current local working-tree checks after the admin-managed content/social/shop
updates:

```text
npm test                         210/210 tests passed across 12 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

The Club pages ship no new tests (183/183 is unchanged from `0d4150bf`); they
were verified with `npx tsc`, `npm run build`, and browser checks of the
hover dropdown, mobile accordion, `/club` returning 404, and both `/club/about`
and `/club/logo` rendering correctly.

Previous release checks (2026-07-22, commit `0d4150bf`):

```text
npm test                         183/183 tests passed across 10 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

Previous release checks (2026-07-17, commit `5fb0b6fd`):

```text
npm test                         153/153 tests passed across 8 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

Latest release checks (2026-07-16, shop page photo row, commit `5ce20126`):

```text
npm test                         147/147 tests passed across 7 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

Shop-details and shared-branding release (`91d0081e`):

```text
npm test                         129/129 tests passed across 6 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

Latest release checks (2026-07-16, after the Next Match card / opponent-logo
work, commit `9f39c02b`):

```text
npm test                         117/117 tests passed across 5 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

Earlier release checks for the admin-managed shop work:

```text
npm test                         117/117 tests passed across 5 files
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

Known non-blocking build warnings:

- raw `<img>` warnings in the analytics page and `Hero.tsx`.
- unnecessary `useMemo` dependency warnings in the analytics page.

Earlier route smoke checks returned `200` for `/roster`, `/schedule`, and
`/admin/login`; `/admin` correctly redirected unauthenticated requests to login.
Do not mutate production data merely to repeat destructive CRUD verification.

## Remaining Work / Known Limitations

- The Club pages (`/club/about`, `/club/logo`) are editable from
  `/admin/about`; run `db/migrations/2026-07-about-club-content.sql` in
  environments missing those singleton rows.
- The analytics data layer supports nullable match ratings, but the Match Stats
  admin form does not expose a rating input. Confirm rating columns and unique
  constraints in the target database before implementing it.
- Stat submissions are last-write-wins; there is no approval/review workflow.
- Supabase database types are handwritten, and season-stat paths still contain
  record casts. Generated types would improve safety.
- The shop tables and storage bucket require the grants and RLS policies
  recorded in `db/migrations/2026-07-shop-kit-section.sql`. The production
  database setup has already been completed; do not rerun it by default.
- The Branding editor requires `site_branding` and the scoped
  `logos_v2/club-branding` upload policy from
  `db/migrations/2026-07-site-branding.sql`. Production setup is confirmed;
  this remains a new-environment requirement.
- Authenticated admin CRUD can receive an additional browser pass using safe
  test records if Christian explicitly requests it.
- `PartnerStrip.tsx` may still use older local partner artwork; the completed
  sponsor replacement specifically applies to the footer.
- The existing lint warnings above can be cleaned up separately.
- The first real live Stripe charge had not yet been completed as of this
  handoff; confirm `/admin/payments` before assuming the platform is actively
  billed.
- Local dev and production share one Supabase project — a genuinely isolated
  dev Supabase project would remove the risk of local Stripe testing
  overwriting the live `stripe_subscription` row, but is a real infrastructure
  change, not done as part of this rollout.
- Admin magic-link login requires the same browser/device for both requesting
  and opening the link (Supabase PKCE flow); this is a pre-existing
  limitation, not something introduced by the Stripe work, but worth fixing if
  it becomes a recurring pain point for club staff logging in from phones.

## Next Match Card, Sponsor, And Opponent Logos — 2026-07-17

The opponent-logo foundation shipped through `9f39c02b`; the current fixture
presentation and sponsor workflow shipped in `5fb0b6fd`.

- `components/NextMatchCard.tsx` renders Rose City on the left, a split-line
  red "VS", the opponent crest on the right, compact match date/time/venue
  metadata, optional linked "Presented By" sponsor art, and the Full Schedule
  CTA.
- The mobile metadata line is intentionally small and placed below the
  crest/team-name row to avoid logo overlap.
- New shared component `components/OpponentCrest.tsx`: circular crest that
  renders an uploaded logo image with no added backdrop or border (shows the
  crest artwork as-is), or falls back to an initial-monogram circle when no
  logo is set or the image fails to load. Takes a `variant: "light" | "dark"`
  prop — `"dark"` swaps the fallback monogram/backdrop to a legible
  white-on-translucent treatment for use on colored backgrounds.
- `components/FixtureRow.tsx` (public `/schedule` list) also renders an
  `OpponentCrest` next to the opponent name — 56px, `dark` variant on the
  highlighted next-match row (that row has a dark green background, so the
  default light-variant fallback was nearly invisible there before this fix).
- `/admin/schedule` gained an optional "Competition" text input and an
  opponent-logo upload control on the add/edit match form (same
  select-file → upload → store public URL pattern as `/admin/shop`), plus a
  crest thumbnail in each match's list row.
- `/admin/schedule` also manages nullable `sponsor_name`, `sponsor_logo_url`,
  and `sponsor_link`. New matches inherit only those sponsor fields from the
  latest scheduled match in the selected season; admins can replace or clear
  them. Sponsor art is hidden when no logo is set.
- Data model: `matches.opponent_logo_url` and `matches.competition`, both
  nullable `text`. New public Storage bucket `opponent-logos`. Both were
  created manually in Supabase per `db/migrations/2026-07-next-match-card.sql`
  (bucket created via dashboard first, then the SQL runbook for columns,
  grants, and storage policies) — already applied to production; do not
  rerun by default.
- `lib/db-types.ts` (`DBMatch`), `lib/data.ts` (`Fixture`), and
  `lib/queries.ts` (`mapFixture`) were updated to carry the two new fields
  through to the UI layer.
- `lib/match-sponsor.ts` isolates sponsor carry-forward behavior, covered by
  `lib/__tests__/match-sponsor.test.ts`.

## Shop Page Photo Row — 2026-07-16

Shipped on top of the Next Match Card baseline above, through commit
`5ce20126` (superseding an earlier autosliding-carousel version from
`e47e3085` that was fully replaced, per explicit follow-up feedback, before
release — no carousel code remains).

- Static gallery on `/shop` only (never the homepage): Home Kit and Away Kit
  each have their own set of up to six admin-uploaded photos below the
  selected kit section, all shown at once, no autoplay/arrows/motion. Each
  photo is cropped (`object-cover`) into a fixed portrait column so the row
  stays gapless and uniform regardless of each source photo's proportions or
  how many are uploaded — fewer photos just produce a shorter, centered row
  rather than stretched/differently-cropped columns.
- On mobile, six fixed-shape columns don't fit a phone width, so the row
  scrolls horizontally instead of wrapping.
- New files: `components/ShopPhotoStrip.tsx` (presentational),
  `components/ShopPhotoStripContainer.tsx` (client fetch, shows a "Loading
  gallery…" state matching the roster page's loading treatment, renders
  nothing once loaded if empty), `components/admin/
  ScaledShopPhotoStripPreview.tsx` (admin preview, same fixed-1700px-canvas
  scale-down technique as `ScaledShopKitPreview`), `lib/shop-photo-strip.ts`
  (display-mode/max-count/alt-text helpers; reorder diff is a re-export of
  `diffShopKitPhotos` from `lib/shop-kit.ts`, which was already table-agnostic).
- Data model: reuses the existing `shop_carousel_photos` table (`id`,
  `kit_variant`, `url`, `sort_order`, `created_at`) — kept that name rather
  than renaming, with `kit_variant` separating Home and Away photo rows.
  Existing global rows default to the Home Kit. Migration
  `db/migrations/2026-07-shop-carousel.sql` (grants + RLS; no new Storage
  policy needed since it reuses the public `shop` bucket's existing
  authenticated upload policy) remains the setup/update path.
- `/admin/shop` was split into three tabs — "Content", "Kit Photos", "Photo
  Row" — so only one section's fields render at a time. This was a
  side-effect fix for the admin page having become very long/scrolly across
  several rounds of feature additions; tab buttons show live photo counts and
  a small red-dot indicator for validation issues (e.g. Content tab flags if
  every bullet point is removed).
- Tests: `lib/__tests__/shop-photo-strip.test.ts` covers the pure helpers
  (alt text, hidden/shown display-mode gating, max-6 clamping, and the
  reorder diff), mirroring `shop-kit.test.ts`'s structure. Full suite is
  147/147 passing.
- The previous white-gap report was addressed by fading the kit image into the
  white page with a dedicated overlay rather than continuing to adjust Photo
  Row padding. The homepage and `/shop` kit sections now share this fade. The
  hands-off Kit Photos slideshow remains shared by both surfaces.

## Stripe Subscription Billing — 2026-07-22

Shipped through `0d4150bf`, built on `a94d4958` (core billing) and `29f3ada5`
(public lockout).

- Rose City FC pays Christian via a billing-admin-only `/admin/payments` tab.
  Billing admins come from `BILLING_ADMIN_EMAILS` (comma-separated); the legacy
  `BILLING_ADMIN_EMAIL` value still works as a single-address fallback.
  Checkout uses `STRIPE_PRICE_ID`, and the Payments page retrieves that Stripe
  Price to display the current subscription amount dynamically rather than
  hardcoding the old Starter-tier amount.
- Stripe's hosted Checkout (subscribe) and Billing Portal (cancel,
  undo-cancellation, update card, invoices) handle the entire payment UX —
  there is no custom card form or cancel-confirmation modal anywhere in this
  app.
- `lib/stripe-subscription-state.ts` is the pure decision logic: `resolvePaymentsUiState`/
  `isAdminLocked` implement zero-grace admin lockout (locks the instant the
  subscription is genuinely terminal — past what was already paid for);
  `isPublicSiteLocked` adds a *separate*, later +7-day buffer for the public
  site. Both fail open on a missing row, null status, or missing
  `current_period_end` — this is soft enforcement, not a hard security gate.
- `app/api/stripe/webhook/route.ts` verifies Stripe signatures and upserts a
  singleton `stripe_subscription` row (`id = 1`) via the service-role client
  for `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_succeeded`, and `invoice.payment_failed`.
- `middleware.ts` reads that row directly (never calling Stripe) twice: once
  for `/admin/*` (redirects everything except `/admin/payments` once
  terminal) and once for the explicit public path list `/`, `/roster`,
  `/schedule`, `/shop` (serves a neutral `503` — no billing language, no
  contact info, `X-Robots-Tag: noindex` — once 7 days past the admin-lockout
  point). `FORCE_PUBLIC_SITE_ONLINE=true` overrides only the public check.
  Neither check touches `/api/stripe/*`, which stay reachable in every state.
- Before this feature ships to any environment, before the first-ever
  Checkout completes, the `stripe_subscription` table is empty — both lockout
  checks fail open on a missing row, so nothing locks on a fresh deploy.
- Verified end-to-end against real Stripe test-mode data before going live:
  subscribe, cancel-at-period-end (State 3 grace banner), undo-cancellation
  back to State 2, terminal lockout at the admin boundary, the public 7-day
  boundary (tested at day 0, day 6, and day 7 by backdating the mirror row),
  and the `FORCE_PUBLIC_SITE_ONLINE` override. Three real bugs were found and
  fixed during that pass:
  1. `service_role` had no table-level `GRANT` on `stripe_subscription` —
     service_role bypasses RLS *policies* but not table *grants*, so every
     webhook write was silently rejected. Fixed in
     `db/migrations/2026-07-stripe-subscription.sql`.
  2. The webhook wasn't checking Supabase's write response for an error, so
     failures (like #1) still returned `200 OK` to Stripe, meaning Stripe
     never retried. Fixed to throw on a write error so Stripe's automatic
     retry takes over.
  3. On this Stripe API version (`2026-06-24.dahlia`), the Billing Portal's
     "cancel at period end" action sets `cancel_at` rather than the legacy
     `cancel_at_period_end` boolean. The webhook now treats either signal as
     "scheduled to cancel."
- Full design/decision record (every interview answer this feature was built
  from) and the Stripe Dashboard setup steps (test mode, then go-live) are in
  `docs/stripe-subscription-plan.md`.
- Live payment incident on 2026-07-24: Stripe Checkout completed and created
  `sub_1TwcndK6WajTkwHYH1VuFgrG`, but `checkout.session.completed` initially
  stayed pending because Stripe posted to the apex URL
  `https://rosecityfutbolclub.com/api/stripe/webhook`, which Vercel redirects
  to `www` with `308`. The live `stripe_subscription` row was backfilled to
  `active`. Stripe endpoint `we_1TwEpdK6WajTkwHYD5SEYzXX` now points to
  `https://www.rosecityfutbolclub.com/api/stripe/webhook`; a signed no-op
  probe to the `www` URL returned `200 {"received":true}`. Resend a Stripe
  event after deploys to verify automatic syncing.
- **Known risk:** local dev and production share one Supabase project — there
  is no separate test database. Local Stripe testing with test-mode keys
  writes into the same `stripe_subscription` row production reads. Always
  clear or re-sync that row after local Stripe testing before trusting it in
  production — `DELETE FROM stripe_subscription WHERE id = 1;` via the
  service-role key resets it to the safe, unlocked default.
- **Known limitation:** admin magic-link login uses Supabase's PKCE flow,
  which requires requesting and opening the link in the same browser/device.
  Requesting on desktop and opening the emailed link on a phone (or the
  reverse, or inside an email app's embedded browser) fails silently.

## Working Rules

- Never `git push` to `main` (or any branch Vercel deploys from) without the
  user's explicit permission for that specific push. Approval to push earlier
  in a session does not carry forward to later commits — ask again each time.
- Do not make broad reversions or erase unrelated dirty-worktree changes.
- Preserve the established visual system and recently tuned gradient/modal
  behavior unless Christian explicitly asks to change it.
- Keep all season-aware reads and writes scoped by `season_id`.
- Do not rerun the completed destructive database migration by default.
- Use `apply_patch` for edits, add focused tests for behavior changes, and run
  TypeScript, Vitest, and a production build before calling a change Vercel
  ready.
