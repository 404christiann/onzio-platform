# Rose City FC — Agent Handoff Document

---

## Current Shipped State (2026-07-23)

### Shipped: Club Nav Section — About Club & Club Logo (2026-07-23)

- Added a "Club" nav item (`components/Nav.tsx`), positioned after "Roster".
  **"Club" has no page of its own and is not a link** — on desktop it's a
  plain hover-triggered label (`cursor-default`, no `href`); on mobile,
  tapping it expands/collapses an accordion rather than navigating. It exists
  purely to reveal its two children: "About Club" (`/club/about`) and "Club
  Logo" (`/club/logo`). `NavLink.href` is optional to support this; a nav
  item without one is matched active (red/white highlight) whenever the
  current path equals any of its children's paths (`isNavItemActive()`). The
  dropdown/accordion panel mirrors the nav's own transparent-hero vs.
  scrolled-opaque state. There is intentionally no `/club` route — visiting
  it 404s.
- `/club/about` is a light editorial page with editable founding-story copy,
  imagery, a three-value grid, and a closing CTA into `/schedule`.
- `/club/logo` is a full-page **dark** (`#18181A`) crest explainer — the one
  page on the site where the nav intentionally stays in its transparent/
  white-text hero state for the entire scroll (`isAlwaysTransparentPage` in
  `Nav.tsx`), since it never needs to contrast against a light background.
  Top to bottom: a single pre-composed annotated-crest image
  (`ClubLogo_initial_image.png`, supplied directly by Christian — replaced an
  earlier hand-built SVG leader-line diagram that reproduced the same
  artwork), then five feature rows — The Name, The Rose, The #23, The Crown,
  The Key — each pairing a circular crest "patch" badge (one element
  highlighted) with a small inline icon next to the row's title and explainer
  copy, then the Pasadena map image last. Every source PNG in the
  `Aboutassets` bucket carries heavy transparent padding (patches ~82-85%
  fill, icons only ~34-62%); rather than re-exporting the assets, each
  `<Image>` renders inside an `overflow-hidden` box with a measured CSS
  `scale()` transform (`PATCH_SCALE` / per-feature `iconScale` in
  `app/(public)/club/logo/page.tsx`) to crop the padding out so the artwork
  fills its allotted size. The #23 row's assets
  (`Rose City FC 23.png` / `Rose City FC Patch_23.png`) arrived after the
  other four and were added last.
- Club pages/assets are database-backed and editable from `/admin/about` with
  About and Club Logo tabs. The public structure remains the same, but copy
  and key images no longer live only in page files.

### Shipped: Stripe Subscription Billing (`0d4150bf`, built on `a94d4958`/`29f3ada5`)

- Rose City FC pays Christian for this platform via a billing-admin-only
  `/admin/payments` tab. Checkout uses `STRIPE_PRICE_ID`, and the Payments page
  retrieves that Stripe Price to display the current subscription amount
  dynamically rather than hardcoding the old Starter-tier amount.
- Stripe's hosted Checkout (subscribe) and Billing Portal (cancel, undo a
  scheduled cancellation, update card, view invoices) handle the entire
  payment UX — there is no custom card form or cancel-confirmation modal
  anywhere in this app.
- A Supabase `stripe_subscription` singleton row (`id = 1`) is kept in sync by
  `app/api/stripe/webhook/route.ts` (verifies Stripe signatures; handles
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`). `middleware.ts`
  reads this row on every relevant request — it never calls the Stripe API
  directly.
- Admin lockout: once the subscription is genuinely terminal (past what was
  already paid for, zero grace), every `/admin/*` route except
  `/admin/payments` redirects there.
- Public lockout: `/`, `/roster`, `/schedule`, `/shop` get an additional
  7-day buffer past the admin-lockout point before serving a neutral `503`
  placeholder — no billing language, no contact info, `X-Robots-Tag: noindex`
  so search ranking isn't harmed by a temporary lockout.
  `FORCE_PUBLIC_SITE_ONLINE=true` overrides only the public lock.
- Only `BILLING_ADMIN_EMAIL` sees the Subscribe/Manage Billing buttons; other
  `ADMIN_ALLOWED_EMAILS` see a read-only status notice instead.
- Verified end-to-end against real Stripe test-mode data before going live:
  subscribe, cancel-at-period-end (grace banner), undo-cancellation, terminal
  lockout (admin + public, including the 7-day boundary), and the
  `FORCE_PUBLIC_SITE_ONLINE` override. Three real bugs were found and fixed
  during that pass — see `docs/stripe-subscription-plan.md` for the full
  record (a missing `service_role` grant on `stripe_subscription`, the
  webhook silently swallowing write errors, and a Stripe API-version quirk
  where the Billing Portal's cancellation sets `cancel_at` instead of the
  legacy `cancel_at_period_end` boolean).
- Live Stripe keys, the live webhook
  (`https://rosecityfutbolclub.com/api/stripe/webhook`), and live Vercel
  Production env vars are configured and deployed. As of this handoff the
  first real live charge had not yet been completed — the
  `stripe_subscription` table is intentionally empty (`no_subscription`,
  fully unlocked), not an error state.
- **Known risk:** local dev and production share one Supabase project — there
  is no separate test database. Local Stripe testing with test-mode keys
  writes into the same `stripe_subscription` row production reads. Clear or
  re-sync that row (`DELETE FROM stripe_subscription WHERE id = 1;` via the
  service-role key resets it to the safe, unlocked default) after any future
  local Stripe testing, before trusting it in production.
- **Known limitation:** admin magic-link login uses Supabase's PKCE flow,
  which requires requesting and opening the link in the same browser/device.
  Requesting on desktop and opening the emailed link on a phone (or vice
  versa, or inside an email app's embedded browser) will fail.

### Shipped: Match Sponsor Presentation (`5fb0b6fd`)

- `NextMatchCard.tsx` now mirrors the approved crest/VS/fixture metadata
  composition, followed by an optional linked sponsor and Full Schedule CTA.
- Sponsor name, logo, and optional website link live on each match and are
  editable in `/admin/schedule`. Add Match copies only sponsor fields from the
  latest match in the selected season; admins can replace or clear them.
- Existing matches remain empty. Production sponsor columns and upload
  policies were verified on 2026-07-17; retain the migration for new
  environments.

### Shipped: Independent Homepage And Shop Kits (`5fb0b6fd`)

- The homepage and `/shop` now load separate `home` and `shop` kit records.
- `/admin/shop` has a Homepage/Shop Page selector; content fields, purchase
  links, and ordered Kit Photos save independently for the selected surface.
- Added after that release: the homepage remains a single kit presentation,
  while `/shop` has public Home/Away tabs backed by `kit_variant` rows.
  `/admin/shop` edits the Shop Page Home Kit and Away Kit separately, plus
  editable Purchase Details.
- The shop-page Photo Row remains shop-only, but Home Kit and Away Kit now
  have separate row-photo sets.
- Production surface rows, photo sets, and authenticated write policies were
  verified on 2026-07-17. The migration remains the zero-visual-change setup
  path for new environments.

Latest application commit on `main`: `9f98c2c1` (`Remove /club hub page; Club
is now a dropdown-only nav trigger`, on top of `0c8c6b2d`/`0d4150bf`). Vercel
deploys from `main` — but do not `git push` without the user's explicit
per-push permission (see Verification section below).

### Homepage Next Match Card And Opponent Logos

- The homepage fixture is `components/NextMatchCard.tsx`: Rose City crest
  always on the left, red "VS", opponent crest on the right, compact
  date/time/venue metadata, optional linked "Presented By" sponsor art, and
  the retained "Full Schedule" CTA.
- The mobile metadata line is deliberately smaller and given its own row below
  the crest/team-name row so it does not collide with logos.
- `components/OpponentCrest.tsx` is the shared circular crest component: shows
  the uploaded logo image with no added backdrop/border (the crest artwork
  renders as-is), or falls back to an initial-monogram circle when no logo is
  set or the image fails to load. Accepts a `variant: "light" | "dark"` prop —
  `"dark"` is used where the crest sits on a colored background (e.g. the
  highlighted next-match row on `/schedule`) so the fallback monogram and
  backdrop stay legible.
- `components/FixtureRow.tsx` (public `/schedule` list) also renders an
  `OpponentCrest` (56px, `dark` variant on the highlighted next-match row).
- `/admin/schedule` gained an optional "Competition" text field and an
  opponent-logo upload control (mirrors the existing `/admin/shop` upload
  pattern) on the add/edit match form, plus a crest thumbnail in the match
  list rows.
- `/admin/schedule` also manages sponsor name, logo, and optional website link.
  Add Match carries only sponsor fields from the latest match in the selected
  season; clearing the logo hides the sponsor on the homepage.
- New nullable columns: `matches.opponent_logo_url`, `matches.competition`.
- New public Storage bucket: `opponent-logos`. Both were set up manually per
  `db/migrations/2026-07-next-match-card.sql`; do not rerun it by default.

### Public Site And Storefront

- Roster player cards now use a white/light overlay treatment instead of the previous black fade.
- Player and technical-staff nationality flags use the public Supabase `flags`
  bucket and hide gracefully when unavailable.
- Staff cards show the name, nationality flag, initials badge, and staff title
  over the tuned white photo fade.
- Player/staff cards share the tuned white gradient. Modals use a lower white
  gradient and a fixed-yet-responsive height with internal detail scrolling.
- Player Bio and Season Stats start expanded but remain collapsible.
- Player stats reveal only on desktop hover; mobile taps open the modal
  directly without sliding the card content upward.
- Site red was updated to `#E7001B`.
- Site black was updated to `#141414`.
- White remains `#FFFFFF`; headings use local Lemon Milk and body/navigation
  copy uses DM Sans.
- Homepage video and UPSL championship feature are approximately half-screen
  on desktop.
- Homepage CTA is `Team Store`, links to `/shop`, and has no arrow.
- The kit presentation appears after the homepage video and on the shop page
  using the public Supabase `shop` bucket. Both surfaces render the same
  component but load independent text, purchase links, and ordered photos.
- Homepage order is Hero → Home kit presentation → trophy feature → Next Match
  → photo slideshow → sponsor carousel → league standings → Behind the Rose.
- `/admin/shop` edits the small heading, product title, description, purchase
  button text/link, one to eight ordered bullet points, editable multiline store
  information, and one to six ordered kit photos. Shop Page also edits Home/Away
  kits and the Purchase Details section. Multiple kit photos autoplay as a
  hands-off fade rotation with no arrows, dots, dragging, or swiping.
- The Shop editor is responsive on mobile and its scaled desktop preview uses
  the exact public component rather than an approximation.
- Shop field labels use plain language for soccer managers rather than terms
  such as eyebrow or CTA.
- Admin save actions use a shared subtle saving/success notification.
- The shop slideshow remains implemented but is hidden with
  `SHOW_SHOP_HERO = false` in `lib/site-flags.ts`.
- Navigation displays Rose City, US Soccer, FIFA, U.S. Open Cup, and UPSL marks
  from `logos_v2`. Only Rose City links home; US Soccer and UPSL remain color.
- The Rose City color patch is also the fallback for players without photos.
- Footer sponsor art, except Tepito Coffee, comes from the public Supabase
  `sponsors` bucket and remains full-opacity at the larger size.
- Footer social media URLs are editable from `/admin/branding` and stored in
  `site_social_links`; icons remain fixed local SVG assets.
- League standings are editable from `/admin/standings`; Rose City uses the
  shared club logo, and other clubs can use uploaded logos or abbreviations.
- Homepage `Behind the Rose` and `Behind the Rose · Season 1 · Episode 1` were adjusted to stay on one line on mobile and desktop.

### Admin-Managed About, Sponsors, Branding, And Footer Socials

- `/admin/about` edits the public About Club and Club Logo pages, including
  text, images, values/features, and previews. Run
  `db/migrations/2026-07-about-club-content.sql` in environments missing those
  singleton rows.
- `/admin/sponsors` edits homepage carousel logos and footer logos as separate
  placements, backed by `site_sponsor_logos`.
- `/admin/standings` edits the homepage league standings table and optional
  team logos, backed by `league_standings_settings`, `league_standings`, and
  the public `standings` Storage bucket. Run
  `db/migrations/2026-07-league-standings.sql` before using it in a new
  environment.
- `/admin/branding` edits the shared club logo and footer social media URLs.
  Footer social URLs are backed by `site_social_links`; icons remain fixed
  local SVG assets. Run `db/migrations/2026-07-site-social-links.sql` before
  saving social links in a new environment.

### Authentication

- Supabase magic-link admin login uses the deployment origin callback. Redirect
  URLs must include:
  - `http://localhost:3000/admin/auth/callback`
  - `http://127.0.0.1:3000/admin/auth/callback`
  - `https://rose-city-website.vercel.app/admin/auth/callback`
- Admin access is controlled by `ADMIN_ALLOWED_EMAILS`; never hardcode an email.
- Add the user in Supabase Auth, add their email to the Vercel environment
  variable, and redeploy. A magic link landing at `/` indicates redirect URL
  configuration, not an application allowlist workaround.

### Multi-Season Database And App - Complete

Supabase was updated manually through the SQL editor:

- `matches.season_id` was added.
- Existing matches were backfilled to season `2025–26`.
- `player_season_stats` and `goalkeeper_season_stats` now use primary keys:
  - `PRIMARY KEY (player_id, season_id)`
- Existing player season stats have no null `season_id` rows.
- Existing goalkeeper season stats have no null `season_id` rows.
- Existing matches have no null `season_id` rows.
- There is one active season:
  - `e3e7e955-4e7d-4887-821b-06ccc23c2cf3` — `2025–26`

The app phases are also complete:

- shared season query/hook/select helpers.
- dedicated `/admin/seasons` management page.
- season-scoped admin season stats, schedule, and match picker.
- active-season dashboard and public schedule.
- new-player active-season stats seeding and season-delete guards.
- active roster excludes deactivated players while historical seasons retain
  former players through season-stat membership.
- activation upserts a missing active-season zero stats row before setting the
  player active; duplicate rows preserve existing totals.
- roster mutations surface errors instead of silently appearing successful.

### Admin-Managed Shop Database - Complete

- `shop_kit_section` stores one content record per `home`/`shop` surface.
- `shop_kit_photos` stores independently ordered photos per surface.
- Public reads and authenticated admin writes are enabled with explicit grants
  and row-level security policies.
- Authenticated uploads and metadata reads are enabled for the public `shop`
  storage bucket.
- The production setup was completed manually. The reproducible runbook is
  `db/migrations/2026-07-shop-kit-section.sql`; do not rerun it against
  production by default.
- The `bullet_points` and `store_note` follow-up is complete. New environments
  must run `db/migrations/2026-07-shop-kit-details.sql` before those saves.

### Shop Page Photo Row - Complete

- Static gallery on `/shop` only (never the homepage), sitting directly below
  the selected kit section: Home Kit and Away Kit each have their own set of
  up to six admin-uploaded photos, all shown at once with no
  autoplay/motion/arrows. Each photo is cropped (`object-cover`) into a fixed
  portrait column so the row is always gapless and uniform regardless of each
  source photo's proportions or how many are uploaded (fewer photos just means
  a shorter, centered row).
- On mobile, six columns don't fit a phone width, so the row scrolls
  horizontally instead of wrapping.
- Files: `components/ShopPhotoStrip.tsx` (presentational),
  `components/ShopPhotoStripContainer.tsx` (fetch-on-mount, shows a "Loading
  gallery…" state, renders nothing when empty), `components/admin/
  ScaledShopPhotoStripPreview.tsx` (admin preview), `lib/shop-photo-strip.ts`
  (display-mode/max/alt-text helpers, reuses `diffShopKitPhotos` from
  `lib/shop-kit.ts` for the reorder diff).
- Backed by the existing `shop_carousel_photos` table — kept that name
  on purpose, with `kit_variant` added so Home and Away rows save separately.
  Existing rows default to the Home Kit; see
  `db/migrations/2026-07-shop-carousel.sql`.
- Managed from a "Photo Row" tab on `/admin/shop`, alongside "Content" and
  "Kit Photos" tabs for the selected kit (added in the same pass to shorten
  what had become a very long single-column admin form — only one tab's fields
  render at a time now).
- This replaced an earlier autosliding-carousel version (thumbnail rail + main
  pane + GSAP slide) that shipped first, then was fully replaced per explicit
  follow-up feedback before this was ever pushed as final; no carousel code
  remains.
- The earlier white-gap report was superseded by the shared kit image fade and
  subsequent photo-row tuning. The homepage and `/shop` kit image sections now
  use the same fade into the white page.

### Shared Club Branding - Complete

- `/admin/branding` lets an approved admin replace the main club logo once.
- The shared provider updates the public navigation/footer, Next Match card,
  admin login/sidebar, player placeholders, and browser icon.
- Missing-player photo values remain empty so placeholders follow every future
  logo update without rewriting roster rows.
- New environments must run the additive
  `db/migrations/2026-07-site-branding.sql` before testing a save. Production
  `site_branding`, the public `logos_v2` bucket, and the signed-in policies were
  manually verified on 2026-07-16; do not rerun setup there by default.

### Verification And Worktree

- `npm test`: 183/183 passing across 10 files for application commit
  `9f98c2c1` (unchanged from `0d4150bf` — the Club pages ship no new tests).
- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed with non-blocking raw `<img>` and analytics
  `useMemo` dependency warnings.
- The generated `tsconfig.tsbuildinfo` may be locally modified after checks;
  do not commit it by default.
- Continue to inspect diffs before editing and never broadly revert unrelated
  worktree changes.
- Do not `git push` to `main` without the user's explicit permission for that
  specific push — a prior approval does not carry forward to later commits.

## Player Analytics — Recent Work (2026-06-04)

### What Was Built

Three new files and changes to two existing ones, all behind the admin analytics dashboard.

**New files:**
- `lib/db-utils.ts` — `coerceRating(v)`: safely coerces PostgREST NUMERIC strings to `number | null`. Single source of truth; no app imports so safe anywhere.
- `lib/analytics-helpers.ts` — pure functions with no Supabase dependency: `hasEnoughRatings`, `buildFieldRadarData`, `buildGKRadarData`, re-exports `coerceRating`.
- `vitest.setup.ts` + `vitest.config.ts` — Vitest test harness. The repository
  now has 129 tests across six files.

**Modified files:**
- `lib/db-types.ts` — added `rating: number | null` to `DBPlayerMatchStats` and `DBGoalkeeperMatchStats`; added `season_id: string | null` to `DBMatch`.
- `lib/queries.ts` — added `fetchSeasons()`, `fetchPlayerMatchLog()`, `MatchLogRow` type; made `fetchRoster(seasonId?)` season-aware (cohort from stats table, not `active=true`); extended `fetchPlayerMatchTrend` with `rating` field and optional `seasonId`.

### Key Decisions

| Decision | Rationale |
|---|---|
| `rating` is manual entry, nullable | No per-match data (shots, dribbles, etc.) to calculate a meaningful rating automatically |
| Scatter plot hidden below 3 rated matches | `hasEnoughRatings(log, 3)` — shows callout instead; gates rendering in the component |
| Season roster by stats presence, not `active=true` | Historical seasons contain players who have since left; `active=true` would return an empty or wrong roster |
| `coerceRating` lives in `db-utils.ts` | `analytics-helpers` imports `MatchLogRow` from `queries`; putting it in either file created a circular dep |
| `Promise.all` for independent fetches | `fetchRoster` and `fetchPlayerMatchTrend` parallelise their two independent Supabase queries |
| Client-side season filter kept as safety net | Even though `fetchPlayerMatchLog` adds `.eq("season_id")` server-side, the JS check stays as defence-in-depth |

### Schema Status

The multi-season `matches.season_id` migration has now been applied and existing
matches were backfilled. The remaining analytics-specific SQL still needed
before using rating charts is:

```sql
ALTER TABLE player_match_stats      ADD COLUMN IF NOT EXISTS rating NUMERIC(3,1) CHECK (rating >= 0 AND rating <= 10);
ALTER TABLE goalkeeper_match_stats  ADD COLUMN IF NOT EXISTS rating NUMERIC(3,1) CHECK (rating >= 0 AND rating <= 10);
-- Unique constraints (if not already applied):
ALTER TABLE player_match_stats      ADD CONSTRAINT IF NOT EXISTS pms_player_match_unique UNIQUE (player_id, match_id);
ALTER TABLE goalkeeper_match_stats  ADD CONSTRAINT IF NOT EXISTS gms_player_match_unique UNIQUE (player_id, match_id);
```

Also add `rating` to the stats entry form (`app/admin/(protected)/stats/page.tsx`) so staff can enter and backfill ratings.

### Known Limitations

- **Stats form not yet updated** — `rating` field exists in types and queries but the admin form doesn't expose it yet. Scatter plot will show the empty-state callout for all players until ratings are entered.
- **`matches.season_id` exists and current rows are backfilled** — future admin schedule changes must keep new matches from inserting with `season_id: null`.
- **No review/approval for stat submissions** — multiple staff can overwrite each other. The `upsert` with `onConflict: "player_id,match_id"` prevents duplicates but last-write-wins. Add a review step if data quality becomes an issue.
- **Season-stats rows have no typed DB interface** — `fetchRoster` casts them as `Record<string,unknown>` with `as number` casts per field. Add `DBPlayerSeasonStats` / `DBGoalkeeperSeasonStats` to `db-types.ts` when extending this area.

### Running Tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

129 tests across: `lib/__tests__/analytics-helpers.test.ts`,
`club-branding.test.ts`, `queries.test.ts`, `integration.test.ts`,
`player-season.test.ts`, and `shop-kit.test.ts`.

The integration tests mock only Supabase and run the real query + helper pipeline end-to-end. If a new function is added to `queries.ts` or `analytics-helpers.ts`, add a unit test for edge cases and at least one integration scenario.

### Optional Analytics Follow-Up (Not Part Of Completed Multi-Season Rollout)

1. **Verify the analytics SQL above** in the target database before relying on
   rating data; do not assume it has been applied because the separate
   multi-season gate passed.
2. **Add rating input to the stats form** — `app/admin/(protected)/stats/page.tsx`. It's a `NUMERIC(3,1)`, step `0.1`, nullable. The upsert payload already passes through via `{...row}` spread once it's on the row type.
3. **Integrate the rating-specific helpers into the existing analytics UI** —
   the admin analytics dashboard already exists, but it does not yet consume
   `fetchPlayerMatchLog`, `hasEnoughRatings`, or the new radar builder helpers.
4. **Add season selection to analytics** — the core admin stats pages are
   already season-aware; this item applies only to the analytics dashboard.

---

## What This Is

A full-stack web platform for **Rose City FC**, a semi-pro soccer club based in Pasadena, CA competing in the UPSL (United Premier Soccer League). The platform has two distinct surfaces:

1. **Public website** — marketing site for fans, sponsors, and recruits
2. **Admin portal** — private dashboard for club staff to manage roster, schedule, match stats, season stats, and view analytics

Built and maintained by **Christian Alcala** (`christianjavieralcala@gmail.com`), who is the developer — not a club founder or staff member.

Live at: `rosecityfutbolclub.com` (deployed on Vercel)

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.3 (App Router, TypeScript) |
| Styling | Tailwind CSS + CSS custom properties |
| Animations | GSAP + ScrollTrigger |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email magic link) |
| Charts | Chart.js (admin analytics only) |
| Deployment | Vercel |
| Analytics | Vercel Analytics (script injection via `next/script`) |

---

## Folder Structure

```
app/
├── layout.tsx                        # Root layout — Vercel Analytics script lives here
├── (public)/
│   ├── layout.tsx                    # Public layout wrapping Nav + Footer
│   ├── page.tsx                      # Homepage — assembles all home sections
│   ├── roster/page.tsx               # Public roster page
│   ├── club/about/page.tsx           # About Club — founding story, values
│   ├── club/logo/page.tsx            # Club Logo — dark crest explainer page
│   ├── schedule/page.tsx             # Public schedule/fixtures page
│   └── shop/page.tsx                 # Shared kit section + purchase details
└── admin/
    ├── layout.tsx                    # Outer admin layout (no auth check here)
    ├── login/page.tsx                # Magic link login page
    ├── auth/callback/route.ts        # Supabase auth callback handler
    └── (protected)/
        ├── layout.tsx                # Protected layout — sidebar nav, sign out
        ├── page.tsx                  # Admin dashboard (overview)
        ├── roster/page.tsx           # Roster CRUD + photo management + seasons
        ├── schedule/page.tsx         # Match CRUD
        ├── stats/page.tsx            # Per-match stat entry (field + GK)
        ├── season-stats/page.tsx     # Season aggregate stats view
        ├── seasons/page.tsx          # Season creation, activation, delete guards
        ├── shop/page.tsx             # Shared kit content/photo editor + preview
        └── analytics/page.tsx        # Full analytics dashboard

components/
├── Hero.tsx                          # Video hero with autoplay (client-only render)
├── Nav.tsx                           # Fixed nav, frosted glass on scroll, Club dropdown
├── Footer.tsx                        # Social links + partner logos
├── NextMatchCard.tsx                 # Static crest-vs-crest next-match card (homepage)
├── OpponentCrest.tsx                 # Shared circular crest w/ monogram fallback
├── ChampionsBadge.tsx                # 2024 UPSL Champions callout
├── PhotoSlideshow.tsx                # Homepage photo gallery
├── ShopKitSection.tsx                # Shared public kit presentation
├── ShopKitSectionContainer.tsx       # Loads shared shop data with fallback
├── KitImageGrid.tsx                  # Hands-off autoplay for one-to-six kit photos
├── BehindTheRose.tsx                 # Club story/about section
├── FixtureRow.tsx                    # Single row in schedule list (opponent crest included)
├── PlayerCard.tsx                    # Roster card (photo + hover stats)
├── PlayerModal.tsx                   # Full player profile modal
├── StaffCard.tsx                     # Staff member card
└── StaffModal.tsx                    # Staff profile modal

lib/
├── data.ts                           # Static types/fallbacks + purchase details
├── db-types.ts                       # Raw Supabase DB row types (mirrors schema exactly)
├── queries.ts                        # All Supabase fetch functions
├── supabase.ts                       # Browser Supabase client (anon key)
├── supabase-browser.ts               # SSR-safe browser client
├── supabase-server.ts                # Server-side Supabase client
├── shop-kit.ts                       # Shop title/photo display and diff helpers
└── flags.ts                          # Country flag utilities

styles/
└── globals.css                       # CSS custom properties, Google Fonts, base styles

middleware.ts                         # Protects /admin routes, enforces email allowlist
```

---

## Design System

### Brand Colors

Always use CSS custom properties — never hardcode hex values in components.

```css
--color-white:       #FFFFFF
--color-black:       #141414   /* near-black, used for text and dark backgrounds */
--color-green:       #1B4D3E   /* primary brand green */
--color-green-dark:  #163d31
--color-green-light: #246655
--color-red:         #E7001B   /* primary brand red / accent */
--color-red-dark:    #9e1123
--color-gray-light:  #F5F5F5
--color-gray-mid:    #9A9A9A
```

Tailwind also has these mapped in `tailwind.config.ts` if you prefer utility classes.

### Typography

Display headings use local Lemon Milk files from `public/fonts/lemon-milk/`.
Body copy still uses the existing body font stack.

| Role | Font | Usage |
|---|---|---|
| `font-display` | LEMON MILK Bold Italic | Site headings and major display text |
| `font-body` | DM Sans | Body copy, descriptions, captions |

**Display font rules:**
- Always `uppercase`
- Headings should use Bold Italic Lemon Milk
- `tracking-widest` for eyebrow labels
- Headlines use `clamp()` for responsive sizing, e.g. `clamp(2.4rem, 6vw, 4.5rem)`

### Visual Style

The public site has a **cinematic, editorial feel** — think sports magazine, not SaaS dashboard:
- Full-bleed sections, generous whitespace
- Bold uppercase display type
- Minimal color use — mostly black/white with red accents
- GSAP scroll animations on most sections (`opacity: 0` initial, fade/slide in on scroll)
- Green is used for CTAs; red is used for eyebrow labels, the day-of-week on the Next Match card, and accent elements

The admin portal is the **opposite** — dark theme (`#0e0e0e` background, `#141414` sidebar), red active states, dense data layout.

---

## Supabase Schema

### Tables

| Table | Purpose |
|---|---|
| `players` | Active roster — all player profile fields |
| `staff` | Staff members |
| `matches` | Schedule/fixtures — date (`YYYY-MM-DD`), time (`HH:MM` 24h), opponent, opponent_logo_url, competition, home/away, venue |
| `seasons` | Season records — label, start/end year, active flag |
| `player_season_stats` | Aggregated field player stats per season |
| `goalkeeper_season_stats` | Aggregated GK stats per season |
| `player_match_stats` | Per-match field player stats |
| `goalkeeper_match_stats` | Per-match GK stats |
| `player_photos` | Action photos — player_id, url, sort_order |
| `shop_kit_section` | Shared kit text and purchase-link record |
| `shop_kit_photos` | Ordered kit image URLs |
| `stripe_subscription` | Singleton (`id = 1`) mirror of the platform's Stripe subscription state, kept in sync by the webhook; read by `middleware.ts` for admin/public lockout decisions |

### Important Date/Time Convention

- Dates stored as `"YYYY-MM-DD"` strings
- Times stored as `"HH:MM"` 24-hour strings (e.g. `"19:00"`)
- Never assume AM/PM format from the DB — always parse as 24h
- All game times are **America/Los_Angeles (Pacific Time)** — timezone conversion is handled in `schedule/page.tsx` and `NextMatchCard.tsx`

### Auth & Access Control

- Auth is **email magic link** only — no passwords
- `middleware.ts` protects all `/admin/*` routes
- Admin access is controlled by `ADMIN_ALLOWED_EMAILS` env var (comma-separated list)
- To revoke access: remove the user from **Supabase → Authentication → Users** AND remove their email from the env var

### RLS Policies

Current policies use `USING (true)` for authenticated users — meaning any logged-in user can read/write any row. This is acceptable for single-club use but would need to be scoped by `club_id` for multi-tenant deployment.

---

## Data Flow

### Public Site

```
fetchSchedule() / fetchRoster() / fetchStaff()
  → lib/queries.ts (Supabase client query)
  → maps DB row types (DBPlayer, DBMatch, etc.) → UI types (Player, Fixture, etc.)
  → components receive typed UI objects
```

All public data fetches happen **client-side** in `"use client"` components. There is no server-side rendering of dynamic data — pages fetch on mount.

### Static Fallback Data

`lib/data.ts` contains hardcoded roster/schedule fallback arrays that predate
Supabase plus the still-used static purchase-detail metadata for `/shop`. Do not
use the old roster/schedule arrays in new components; fetch operational data
from Supabase through `lib/queries.ts`.

---

## Key Components — Notes

### `Hero.tsx`
- Video autoplay is iOS Safari–sensitive. The `<video>` element must be rendered **client-side only** (never SSR'd) or iOS ignores the autoplay policy.
- Uses a `videoMounted` state flag — the video only renders after `useEffect` fires.
- Shows a poster image (`/images/hero-poster.jpg`) until the video mounts.

### `NextMatchCard.tsx`
- Fetches schedule from Supabase on mount
- Finds the next upcoming fixture using an ISO date string pre-filter + precise timestamp comparison
- Times are parsed as 24-hour format and treated as Pacific Time
- No live ticking state — renders a static crest/VS/competition-pill/day-of-week card once the next fixture is found

### `schedule/page.tsx` (public)
- `fixtureDateTime()` handles both `"HH:MM"` (DB format) and `"H:MM AM/PM"` (legacy format)
- Converts Pacific Time to UTC for comparison against `Date.now()`
- Fixtures before `nextMatchIdx` are styled as past/greyed out

### `analytics/page.tsx` (admin)
- Position filter tabs → player sidebar → `PlayerDashboard`
- `PlayerDashboard` fetches per-match trend data via `fetchPlayerMatchTrend(playerId, isGK)`
- `RadarCard` is a custom SVG — dual polygon (player vs position average)
- All accent colors use `#dc2626` (team red) — no per-position color coding
- Layout: `flex flex-col lg:flex-row` — stacked on mobile, sidebar on desktop

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=       # Server-only; bypasses RLS. Used by the Stripe webhook.
ADMIN_ALLOWED_EMAILS=            # Comma-separated list of allowed admin emails
BILLING_ADMIN_EMAIL=             # Single email allowed to see/act on /admin/payments
STRIPE_SECRET_KEY=               # sk_test_... locally, sk_live_... in Production
STRIPE_PRICE_ID=                 # The recurring monthly Price ID (test/live differ)
STRIPE_WEBHOOK_SECRET=           # Per-endpoint signing secret (test/live/local-CLI all differ)
FORCE_PUBLIC_SITE_ONLINE=        # Optional; "true" overrides only the public-site lockout
```

These live in `.env.local` (gitignored) and must be set in Vercel's project settings for production.

---

## Common Tasks

**Add a new player** → Admin portal → Roster tab → Add Player form

**Add a match** → Admin portal → Schedule tab → Add Match form

**Enter match stats** → Admin portal → Match Stats tab → select match → enter per-player stats

**Update the 2026 kit section** → Admin portal → Shop tab → edit text, purchase
link, and ordered photos → Save Changes

**Add an opponent logo or competition label** → Admin portal → Schedule tab →
Add/Edit Match → Opponent Logo upload + Competition field → Save

**Update the main club logo** → Admin portal → Branding tab → choose a square
transparent image → preview it → Save New Club Logo

**Revoke admin access** → Supabase dashboard → Authentication → Users → delete user

**Check or manage the platform subscription** → Admin portal → Payments tab (billing admin only; other admins see read-only status)

**Update footer sponsor logos** → Admin portal → Sponsors tab → choose Footer
placement → upload/reorder logos → Save Sponsor Logos.

**Update footer social links** → Admin portal → Branding tab → Social Media
Links → edit URLs → Save Social Links.

**Update About Club or Club Logo content** → Admin portal → About tab → choose
About or Club Logo → edit text/images → Save About Pages.

**Deploy** → `git push` to `main` → Vercel auto-deploys

---

## Known Tradeoffs / Future Work

- **No server-side data fetching** — moving roster/schedule fetches to React Server Components would improve performance and keep the Supabase anon key off the client bundle
- **RLS policies are permissive** — for multi-club/multi-tenant use, add `club_id` to all tables and scope policies to `auth.uid()`
- **No generated Supabase types** — `db-types.ts` is hand-maintained. Running `supabase gen types typescript` would eliminate the `as unknown as` casts in `queries.ts`
- **No browser component-test harness** — query, analytics, integration, and
  player-season/shop behavior have 210 Vitest tests, but authenticated admin UI
  behavior still relies on bounded manual verification
- **Client-side joins** — `fetchPlayerMatchTrend` does two queries + a Map join instead of a relational query, because the FK relationship names weren't set up in Supabase. A proper FK join would be cleaner
- **Local dev and production share one Supabase project** — there is no separate test database. Local Stripe testing with test-mode keys writes into the same `stripe_subscription` row production reads; a genuinely isolated dev Supabase project would remove this risk architecturally
- **Admin magic-link login requires same-browser PKCE** — requesting the link on one device/browser and opening the emailed link on another (or inside an email app's embedded browser) fails silently rather than with a clear error

---

## Supabase API Grant Change — Action Required Before October 30, 2026

Supabase is changing how tables are exposed to the Data API (used by `supabase-js`).

- **May 30, 2026** — New projects no longer auto-expose `public` schema tables
- **October 30, 2026** — Enforced on ALL existing projects, including this one

**What this means:** After October 30, any new table you create will NOT be accessible via `supabase-js` until you explicitly grant permissions. Existing tables are unaffected.

**What to do when adding a new table:**

Run this in the Supabase SQL editor immediately after creating a table:

```sql
-- Public read (for tables the public site queries, e.g. players, matches, staff)
GRANT SELECT ON public.your_table_name TO anon, authenticated;

-- Full admin access (for tables only the admin portal writes to)
GRANT ALL ON public.your_table_name TO authenticated;
GRANT SELECT ON public.your_table_name TO anon;
```

**Symptom if you forget:** queries return empty results or throw permission errors even though the table exists and has data. Fix it with the `GRANT` above.

Use the **Security Advisor** in the Supabase dashboard to audit which tables are currently exposed.
