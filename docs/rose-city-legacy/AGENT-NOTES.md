# Rose City FC Agent Notes

This repo is the Rose City Futbol Club public website plus protected admin
portal. Treat it as a production Next.js/Supabase project for a real club.

## Current Status

- Shipped in `9f98c2c1` (built on `0d4150bf`): a Club nav
  section. "Club" (`components/Nav.tsx`, after "Roster") is **not a link** —
  it's a hover dropdown on desktop / tap-to-expand accordion on mobile that
  only reveals "About Club" (`/club/about`) and "Club Logo" (`/club/logo`);
  there is no `/club` hub route (`NavLink.href` is now optional to support
  this). `/club/about` is a light editorial story page. `/club/logo` is a
  full-page dark (`#18181A`) crest explainer — the one route where the nav
  intentionally stays in its transparent/white-text hero state for the whole
  page (`isAlwaysTransparentPage` in `Nav.tsx`) — built from a single
  Christian-supplied annotated-crest image plus five feature rows
  (Name/Rose/#23/Crown/Key) and a map image, all sourced from the `Aboutassets`
  Supabase bucket. Every source PNG carries heavy transparent padding; each
  `<Image>` crops it out via a measured CSS `scale()` inside an
  `overflow-hidden` box rather than re-exporting assets.
- Added after `9f98c2c1`: `/admin/about` manages the About Club and Club Logo
  public pages with editable text/images and previews. Run
  `db/migrations/2026-07-about-club-content.sql` in environments missing those
  singleton rows.
- Shipped in `0d4150bf` (built on `a94d4958`/`29f3ada5`): Stripe subscription
  billing for the platform itself. Checkout uses `STRIPE_PRICE_ID`, and
  `/admin/payments` retrieves that Stripe Price so the displayed amount follows
  future Price ID changes instead of hardcoding the old Starter-tier amount.
  Stripe's hosted Checkout and Billing Portal handle
  subscribe/cancel/undo-cancel/update-card; there is no custom payment UI. A
  Supabase `stripe_subscription` singleton row, kept in sync by
  `app/api/stripe/webhook/route.ts`, is what `middleware.ts` reads to decide
  lockout state — it never calls the Stripe API directly.
  - Admin lockout: once the subscription is genuinely terminal (past what was
    already paid for, zero grace beyond that), every `/admin/*` route except
    `/admin/payments` redirects there.
  - Public lockout: `/`, `/roster`, `/schedule`, `/shop` get an additional
    7-day buffer beyond the admin lockout before serving a neutral `503`
    placeholder (no billing language, no contact info) with
    `X-Robots-Tag: noindex`. `FORCE_PUBLIC_SITE_ONLINE=true` overrides only
    the public lock, never the admin one.
  - Only emails listed in `BILLING_ADMIN_EMAILS` see the
    Subscribe/Manage Billing buttons; other `ADMIN_ALLOWED_EMAILS` see a
    read-only status instead. The legacy `BILLING_ADMIN_EMAIL` env var is
    still supported as a single-address fallback.
  - New env vars: `BILLING_ADMIN_EMAILS`, `STRIPE_SECRET_KEY`,
    `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `FORCE_PUBLIC_SITE_ONLINE`.
  - Live Stripe keys, the live webhook
    (`https://www.rosecityfutbolclub.com/api/stripe/webhook`), and live Vercel
    Production env vars are configured and deployed. The first live payment
    created `sub_1TwcndK6WajTkwHYH1VuFgrG`; the `stripe_subscription` row was
    backfilled to `active` after Stripe initially posted to the apex URL and
    received a `308` redirect to `www`.
  - Full design/decision record and the Stripe Dashboard setup steps (test
    mode, then go-live) are in `docs/stripe-subscription-plan.md`.
  - Known risk: local dev and production currently share one Supabase
    project. Local Stripe testing with test-mode keys writes into the same
    `stripe_subscription` row production reads — clear or re-sync that row
    after any future local Stripe testing before trusting it in production.
  - Known limitation: admin magic-link login uses Supabase's PKCE flow, which
    requires requesting and opening the link in the same browser/device;
    requesting on one device and opening the email on another will fail.
- Shipped in `5fb0b6fd`: the homepage Next Match section follows the
  crest/VS/fixture metadata/optional sponsor hierarchy. Per-match sponsor
  name, logo, and optional link are managed in `/admin/schedule`; Add Match
  carries sponsor fields from the latest scheduled match in that season.
  Existing matches remain unsponsored. The production columns and sponsor
  upload policies were verified on 2026-07-17; retain
  `db/migrations/2026-07-match-sponsors.sql` for new environments.
- Shipped in `5fb0b6fd`: homepage and `/shop` kit presentations are
  independently editable. Each surface has its own heading, title,
  description, bullet points, store note, purchase button/link, and ordered
  Kit Photos. The production surface rows, photo sets, and authenticated write
  policies were verified on 2026-07-17. Retain the surface and RLS migrations
  for new environments and repairs.
- Added after `9f98c2c1`: `/admin/shop` now keeps the Home Page kit as a
  single kit presentation and gives the public `/shop` page Home/Away kit
  tabs. Shop-page purchase details are also editable from a Purchase tab.
  Apply `db/migrations/2026-07-shop-kit-variants.sql` and
  `db/migrations/2026-07-shop-purchase-details.sql` in environments missing
  those tables/columns.
- Added after `9f98c2c1`: `/admin/homepage` manages the public homepage
  slideshow and Behind the Rose video section. `PhotoSlideshow.tsx` now loads
  `homepage_slideshow_photos` with the current three local images as fallback
  and migration seed data. `BehindTheRose.tsx` loads the singleton
  `behind_the_rose_section` with the current copy/video as fallback and has a
  visibility toggle. New slideshow uploads use the public `homepage` Storage
  bucket, and saved removals clean up uploaded Storage objects. Run
  `db/migrations/2026-07-homepage-content.sql` in environments that do not yet
  have these tables, policies, seed rows, and bucket policies.
- Added after `9f98c2c1`: `/admin/sponsors` manages two sponsor-logo
  placements. The homepage carousel is capped at 10 logos and renders after
  the homepage slideshow using the Yorba Linda-style continuous marquee on
  Rose City's trophy-section black background. The footer placement is capped
  at 6 logos and replaces the previous hardcoded footer partner strip. Both
  placements are seeded from Rose City's existing sponsor logos. New uploads
  go under `sponsors/site-sponsors/...`; saved removals only clean up files
  from that folder. Run `db/migrations/2026-07-site-sponsor-logos.sql` in
  environments missing this table/policy seed.
- Added after `9f98c2c1`: `/admin/standings` manages a DB-backed homepage
  league standings table rendered directly after the sponsor carousel. The
  public table is white, compact on mobile, uses Rose City red for the club
  highlight/overlay, displays the shared Rose City crest for the `is_club`
  row, and falls back to abbreviations for other clubs without uploaded logos.
  New environments must run `db/migrations/2026-07-league-standings.sql`.
- Added after `9f98c2c1`: `/admin/branding` also manages footer social media
  URLs. The footer reads `site_social_links` with hard-coded defaults as a
  fallback; icons stay as fixed local assets. Run
  `db/migrations/2026-07-site-social-links.sql` before saving those fields in
  a new environment.

- The current application baseline is `9f98c2c1` on `main` (built on
  `0d4150bf`). It includes the Club nav section, Stripe subscription billing
  (admin + public lockout), the fixture sponsor work, independent
  homepage/shop kit content, responsive roster-card refinements, and all
  earlier admin-managed shop, branding, navigation, and multi-season work.
- The shop page has a static "Photo Row" gallery below the kit section on
  `/shop` only (never the homepage): Home Kit and Away Kit each have their
  own row of up to six admin-uploaded photos, all shown at once with no
  motion, each cropped to a fixed portrait shape so the row stays gapless and
  uniform regardless of source-photo proportions or count. Initially shipped
  as `6fe91a9f` (replacing an earlier autosliding-carousel
  attempt from `e47e3085` that was superseded before release) and tuned in
  `5ce20126`. Key files: `components/ShopPhotoStrip.tsx`,
  `ShopPhotoStripContainer.tsx`, `components/admin/ScaledShopPhotoStripPreview.tsx`,
  `lib/shop-photo-strip.ts`. Backed by the existing `shop_carousel_photos`
  table with a `kit_variant` column (existing rows default to `home`) — see
  `db/migrations/2026-07-shop-carousel.sql`. Managed from a "Photo Row" tab
  on `/admin/shop` alongside the selected Home/Away kit-photo editor.
- The kit image now fades into the white page through a dedicated overlay on
  both the homepage and `/shop`, preserving the transition into the photo row.
  Multiple Kit Photos use a hands-off fade rotation that skips failed image
  URLs instead of exposing a blank slide.
- The homepage "Next Match" section is `components/NextMatchCard.tsx`: Rose
  City crest, red "VS", opponent crest, a compact mobile-safe match metadata
  line, optional linked "Presented By" sponsor, and the retained "Full
  Schedule" CTA. Rose City stays on the left.
- Homepage section order is Hero → Home kit presentation → trophy feature →
  Next Match → photo slideshow → sponsor carousel → league standings →
  Behind the Rose.
- The photo slideshow and Behind the Rose content are editable from
  `/admin/homepage`; defaults preserve the shipped local images and current
  Behind the Rose copy/video until the migration is applied.
- Admins can upload an opponent logo and set a competition label per match
  from `/admin/schedule`. Opponent crests also render on the public
  `/schedule` fixture list (`components/FixtureRow.tsx`), sized larger on the
  highlighted next-match row with a dark-background variant for contrast.
  Matches without an uploaded logo fall back to an initial monogram via the
  shared `components/OpponentCrest.tsx`.
- `matches.opponent_logo_url` and `matches.competition` (both nullable text)
  and the public `opponent-logos` Storage bucket exist in production; see
  `db/migrations/2026-07-next-match-card.sql`.
- The Supabase multi-season database gate and app implementation are complete:
  - `matches.season_id` exists.
  - existing matches are backfilled and admin match creation requires a season.
  - `player_season_stats` and `goalkeeper_season_stats` use
    `PRIMARY KEY (player_id, season_id)`.
  - null `season_id` counts for matches/player stats/goalkeeper stats are `0`.
  - season selectors, active-season public data, season management, player
    stat seeding, delete guards, and activation lifecycle handling are live.
- The active season is `2025–26`, id
  `e3e7e955-4e7d-4887-821b-06ccc23c2cf3`.
- The shop slideshow is intentionally hidden, not deleted. Its switch is
  `SHOW_SHOP_HERO` in `lib/site-flags.ts`.
- The homepage and `/shop` reuse the same kit presentation component but load
  independent database-backed content and ordered photo sets selected from
  `/admin/shop`. Public Home/Away tabs appear only on `/shop`, not on the
  homepage.
- Multiple Kit Photos autoplay as a hands-off fade rotation with no public
  arrows, dots, dragging, or swiping; a single photo remains static.
- The Shop editor supports up to eight editable/reorderable bullet points and
  editable multiline store information. Shop Page also exposes Home/Away kit
  editing, variant-specific static Photo Row editing, and a Purchase Details
  tab. New
  environments must apply `db/migrations/2026-07-shop-kit-details.sql`,
  `db/migrations/2026-07-shop-kit-variants.sql`, and
  `db/migrations/2026-07-shop-purchase-details.sql` before those saves.
- `/admin/branding` lets an approved admin upload one shared club logo that
  updates navigation, footer, admin identity, next-match crest, player
  placeholders, and the browser icon. It also edits footer social media URLs.
  New environments must apply `db/migrations/2026-07-site-branding.sql` and
  `db/migrations/2026-07-site-social-links.sql` first.
- Production `site_branding`, the public `logos_v2` bucket, and the signed-in
  Storage policies were manually verified on 2026-07-16. Do not rerun branding
  setup against production by default.
- Admin save actions use the shared subtle saving/success feedback treatment.
- Player card stats remain a desktop-hover treatment; mobile taps open the
  modal directly. Staff cards keep the same white photo fade on mobile and
  show the name, nationality flag, initials badge, and staff title.
- Player modal Bio and Season Stats controls begin expanded but remain
  collapsible.
- The generated TypeScript cache `tsconfig.tsbuildinfo` may appear after
  verification; do not commit it by default.
- A full continuation packet lives at
  `docs/new-agent-handoff-2026-07-15.md`. The Stripe billing design/decision
  record and Dashboard setup steps live at `docs/stripe-subscription-plan.md`.

## Project Rules

- Do not revert broad worktree changes. Multiple agents have touched this repo.
- Local dev and production share one Supabase project — there is no separate
  test database. Before/after any local Stripe test-mode webhook testing,
  clear or re-sync the `stripe_subscription` row (it's a singleton, `id = 1`)
  so stale test data never gets read by the live site.
- Preserve the local Lemon Milk font setup in `public/fonts/lemon-milk/`.
- Keep brand tokens aligned with current CSS/Tailwind:
  - red: `#E7001B`
  - black: `#141414`
  - white: `#FFFFFF`
- Admin pages should stay dense, dark, and operational.
- Public pages should stay editorial and club-forward.
- Use Supabase schema explicitly and keep season-aware queries scoped by
  `season_id` where admin workflows require it.
- Never `git push` to `main` (or any branch Vercel deploys from) without the
  user's explicit permission for that specific push. A prior push being
  approved does not carry forward — ask again each time, especially during
  active iterative visual tuning.

## Verification

Run these after code changes when possible:

```bash
npx tsc --noEmit --pretty false
npm test
npm run build
```

Current local verification after the admin-managed homepage/about/sponsors/shop/
branding updates: TypeScript passed, all 210 Vitest tests passed, and the
production build passed. The build still reports non-blocking
Next.js lint warnings for a few raw `<img>` elements and unnecessary analytics
`useMemo` dependencies. Destructive authenticated CRUD should only be tested
with safe test data or explicit approval. The Stripe integration was verified
end-to-end in test mode (subscribe, cancel, undo-cancel, admin lockout, public
lockout at the 7-day boundary) before going live; see
`docs/stripe-subscription-plan.md` for the full verification record.
