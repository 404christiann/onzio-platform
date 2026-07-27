# Rose City FC Website

Production website and protected club-management portal for Rose City Futbol
Club, a semi-professional UPSL team based in Pasadena, California.

Built with:

- `Next.js 14` App Router
- `TypeScript`
- `Tailwind CSS`
- `GSAP`
- `Supabase` PostgreSQL, Storage, and Auth
- `Vercel`

## What This Project Includes

The platform includes:

- a cinematic homepage
- a homepage "Next Match" card with team crests, compact fixture metadata,
  and an optional per-match sponsor
- a homepage league standings table after the sponsor carousel
- active and historical season-aware rosters
- fixture and schedule management, including opponent-logo uploads
- player, match, and season statistics
- independently managed database-backed kit presentations for the homepage
  and shop page, including shop-page Home/Away kit variants
- a protected admin portal for roster, schedule, seasons, stats, shop, standings, branding, and platform billing
- admin-managed footer social and partner links

## Design Direction

The visual language is intentionally:

- editorial, club-forward, and premium on public pages
- dense, dark, and operational in the admin portal
- heavy on bold display typography
- black / white / red / green brand palette

Main fonts:

- display: local `LEMON MILK` Bold Italic
- body: `DM Sans`

Core brand colors:

- red: `#E7001B`
- black: `#141414`
- white: `#FFFFFF`

## Shop Experience

- The homepage and `/shop` reuse the same `ShopKitSection` component while
  loading separate content and photo sets.
- The homepage renders one homepage kit. The `/shop` page exposes public
  Home/Away tabs, backed by separate `kit_variant` rows.
- Each presentation's content and one to six ordered photos come from Supabase.
  Multiple Kit Photos autoplay as a hands-off slideshow with no public
  controls; one photo remains static.
- `/admin/shop` lets approved club managers switch between Home Page and Shop
  Page. Home Page edits one kit; Shop Page edits Home Kit and Away Kit, each
  with its own Kit Photos and shop-page Photo Row, plus shared Purchase
  Details, product bullet points, multiline store information, uploads/reorder
  controls, and scaled public previews.
- The admin editor adapts to mobile layouts.
- The cinematic shop slideshow remains implemented but is temporarily hidden
  with `SHOW_SHOP_HERO = false` in `lib/site-flags.ts`.

The shop schema, grants, row-level security, seed content, and Storage policies
are recorded in `db/migrations/2026-07-shop-kit-section.sql`. The production
database setup is already complete; do not rerun it by default. Existing
environments need the additive `db/migrations/2026-07-shop-kit-details.sql`
before bullet points and store information can be saved. The independent
homepage/shop production rows and policies were verified on 2026-07-17;
`db/migrations/2026-07-shop-kit-surfaces.sql` remains the setup path for new
environments and copies existing content without removing data. Apply
`db/migrations/2026-07-shop-kit-variants.sql` for shop-page Home/Away kit
variants and `db/migrations/2026-07-shop-purchase-details.sql` for the
editable shop Purchase Details section.

## Shop Page Photo Row

- Below the kit section on `/shop` only (not the homepage), the selected
  Home/Away kit has its own static row of up to six admin-uploaded photos.
  All photos show at once — no autoplay, no arrows, no motion. Each photo is
  cropped to a fixed portrait shape so the row always looks uniform and
  gapless regardless of source-photo proportions or how many are uploaded.
- On mobile, the row scrolls horizontally instead of wrapping, since six
  columns don't fit a phone width.
- Managed from a "Photo Row" tab on `/admin/shop`, next to "Content" and
  "Kit Photos" tabs (the admin editor was split into tabs so only one
  section's fields render at a time, instead of one very long page).
- Backed by the `shop_carousel_photos` table (name predates the current
  static design) with a `kit_variant` column so Home and Away rows stay
  separate. See `db/migrations/2026-07-shop-carousel.sql`; existing global
  rows migrate to the Home Kit by default.
- The kit image uses the same white fade on the homepage and `/shop`, creating
  the intended transition into the photo row without exposing slideshow controls.

## Homepage Content

- `/admin/homepage` manages the public homepage photo slideshow and Behind the
  Rose video section.
- The slideshow supports up to six ordered photos. The migration seeds the
  current three local slideshow images so the homepage does not need to be
  rebuilt manually after enabling the editor.
- The slideshow label shown in the bottom-left corner is editable and seeded
  as `2025 – 2026 Season`.
- New slideshow uploads go to the public `homepage` Storage bucket. When an
  uploaded slideshow photo is removed from the saved set, the admin save flow
  also removes that file from Storage so old replacements do not accumulate.
- Behind the Rose fields include visibility, eyebrow, title, description,
  video URL, iframe title, and caption. The migration seeds the current section
  copy and YouTube embed.

The homepage schema, seed data, grants, row-level security, and Storage
policies are recorded in `db/migrations/2026-07-homepage-content.sql`. If that
migration was already run before the slideshow label became editable, apply
`db/migrations/2026-07-homepage-slideshow-settings.sql` as the additive patch.

## Sponsor Logos

- `/admin/sponsors` manages sponsor logos for the homepage carousel and footer
  as separate placements.
- The homepage carousel appears after the homepage photo slideshow and uses the
  same continuous marquee pattern as the Yorba Linda preview, with Rose City's
  trophy-section black background.
- Carousel logos are capped at 10. Footer logos are capped at 6.
- Both placements are seeded from the sponsor logos Rose City already used.
  New admin uploads go into the public `sponsors/site-sponsors/...` Storage
  folder, and saved removals clean up uploaded files from that folder only.

The sponsor-logo schema, seed data, grants, row-level security, and Storage
cleanup policy are recorded in `db/migrations/2026-07-site-sponsor-logos.sql`.

## League Standings

- The homepage renders a white, mobile-fit league standings table directly
  after the sponsor carousel.
- Rose City's row is highlighted with the club red overlay/accent and uses the
  current shared Rose City crest automatically.
- Other teams can show an uploaded logo or fall back to short abbreviations.
- `/admin/standings` edits the section label/title/intro, teams, records,
  goal difference, points, Rose City row marker, and optional team logos.

The standings schema, seed rows, grants, row-level security, and public
`standings` Storage bucket are recorded in
`db/migrations/2026-07-league-standings.sql`.

## Shared Club Logo

- `/admin/branding` lets an approved club manager upload the main club logo
  once, preview it on light and dark backgrounds, and edit footer social media
  links.
- The saved logo updates website navigation and footer, the Next Match card,
  admin login/sidebar, player photo placeholders, and the browser tab icon.
- The social-link editor changes the footer icons' outbound URLs only; icons
  remain fixed local assets.
- Player records without a real photo retain an empty semantic value, so their
  placeholder follows future logo changes without rewriting roster data.
- Uploads use the public `logos_v2/club-branding` path. When an
  admin-uploaded logo is replaced, the previous uploaded file is removed after
  the new logo is saved.

The production `site_branding` row, public `logos_v2` bucket, and signed-in
upload policies were manually verified on 2026-07-16. New environments must
run the additive `db/migrations/2026-07-site-branding.sql` before testing a
Branding save; it does not change the existing crest file. Run
`db/migrations/2026-07-site-social-links.sql` before saving Social Media Links
in Branding.

## Next Match Card

- The homepage "Next Match" section (`components/NextMatchCard.tsx`) presents
  Rose City on the left, the opponent crest on the right, compact
  date/time/venue metadata, an optional linked match sponsor, and a Full
  Schedule CTA.
- `/admin/schedule` lets club managers upload an opponent logo and set an
  optional competition label per match. It also manages sponsor name, logo,
  and optional website link; new matches prefill only sponsor fields from the
  latest match in the selected season. Logos without an upload fall back to
  an initial-monogram circle via the shared `components/OpponentCrest.tsx`,
  which is also used to show opponent crests on the public `/schedule`
  fixture list.
- Opponent logos upload to the public `opponent-logos` Storage bucket.
  `matches.opponent_logo_url` and `matches.competition` are recorded in
  `db/migrations/2026-07-next-match-card.sql`. The production database setup
  is already complete; do not rerun it by default.

Per-match sponsor columns and authenticated uploads to the public `sponsors`
bucket are recorded in `db/migrations/2026-07-match-sponsors.sql`. Production
was verified on 2026-07-17; apply the migration only in environments that do
not yet have these fields and policies. Existing matches are intentionally
left without a sponsor.

## Platform Billing

- Rose City FC pays Christian for this platform via `/admin/payments`, visible
  and actionable only for emails listed in `BILLING_ADMIN_EMAILS`; other
  admins see a read-only status.
- Checkout uses `STRIPE_PRICE_ID`, and `/admin/payments` retrieves that Stripe
  Price to display the current subscription amount dynamically.
- Stripe's hosted Checkout and Billing Portal handle subscribe, cancel,
  undo-cancellation, card updates, and invoices — there's no custom payment
  UI anywhere in this app.
- A Supabase `stripe_subscription` singleton row is kept in sync by
  `app/api/stripe/webhook/route.ts`; `middleware.ts` reads it (never calling
  Stripe directly) to decide lockout state.
- The live Stripe webhook destination must use the canonical `www` URL:
  `https://www.rosecityfutbolclub.com/api/stripe/webhook`. The apex URL
  redirects with `308`, which Stripe records as a failed delivery.
- If the subscription lapses, `/admin/*` soft-locks behind `/admin/payments`
  immediately (zero grace, since that's exactly what was already paid for).
  The public site (`/`, `/roster`, `/schedule`, `/shop`) gets an *additional*
  7-day buffer before it also locks, serving a neutral `503` placeholder with
  no billing language and `X-Robots-Tag: noindex`. `FORCE_PUBLIC_SITE_ONLINE=true`
  overrides only the public lock, as a manual courtesy switch.
- Full design/decision record and the Stripe Dashboard setup steps (test mode,
  then go-live) are in `docs/stripe-subscription-plan.md`.
- Local dev and production share one Supabase project. Local Stripe testing
  with test-mode keys writes into the same `stripe_subscription` row
  production reads — clear or re-sync it afterward before trusting it live.

## Footer Social Links

Footer social URLs are editable in `/admin/branding` and backed by
`site_social_links`. The default seeded links are:

- Instagram: `https://www.instagram.com/rosecityfutbolclub/`
- Facebook: `https://www.facebook.com/search/top?q=rose%20city%20futbol%20club`
- TikTok: `https://www.tiktok.com/@rosecityfc`
- X: `https://x.com/RoseCityFutbol`
- YouTube: `https://www.youtube.com/@RoseCityFC`

## Project Structure

Key folders:

- `app/` — public and protected admin routes
- `components/` — reusable public and admin UI
- `lib/` — Supabase clients, queries, types, hooks, and helpers
- `db/migrations/` — manually executed Supabase runbooks
- `public/` — local fonts, images, and brand assets
- `styles/` — global styling

Important files:

- `app/(public)/page.tsx` — homepage composition
- `app/(public)/shop/page.tsx` — public shop page
- `app/admin/(protected)/homepage/page.tsx` — homepage slideshow and Behind the Rose editor
- `app/admin/(protected)/sponsors/page.tsx` — sponsor carousel/footer logo editor
- `app/admin/(protected)/shop/page.tsx` — admin shop editor
- `app/admin/(protected)/branding/page.tsx` — shared club-logo and footer social-link editor
- `components/ClubBrandingProvider.tsx` — site-wide active-logo context
- `components/PhotoSlideshow.tsx` — public homepage slideshow
- `components/SponsorCarousel.tsx` — public homepage sponsor marquee
- `components/LeagueStandingsTable.tsx` — public homepage standings table
- `components/LeagueStandingsContainer.tsx` — loads DB-backed standings content
- `components/BehindTheRose.tsx` — public homepage video section
- `components/ShopKitSection.tsx` — shared public kit presentation
- `components/ShopPurchaseDetailsSection.tsx` — DB-backed shop Purchase Details section
- `components/admin/AdminSaveFeedback.tsx` — shared save-state notification
- `lib/queries.ts` — Supabase data queries
- `lib/homepage-content.ts` — homepage defaults, URL normalization, and slideshow diff helpers
- `lib/sponsor-content.ts` — sponsor defaults, placement caps, and logo diff helpers
- `lib/standings-content.ts` — standings defaults, ranking, and abbreviation helpers
- `lib/social-links.ts` — footer social-link defaults and normalization
- `lib/shop-kit.ts` — shop display and photo-diff helpers
- `lib/shop-purchase-details.ts` — shop Purchase Details defaults and normalization
- `lib/social-links.ts` — footer social-link defaults and normalization
- `app/admin/(protected)/payments/page.tsx` — Subscribe/Manage Billing (billing-admin only)
- `app/api/stripe/webhook/route.ts` — verifies Stripe signatures, syncs the subscription mirror
- `lib/stripe-subscription-state.ts` — pure admin (0-day) and public (+7-day) lockout logic
- `middleware.ts` — admin auth/allowlist/lockout and public-route subscription lockout

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_ALLOWED_EMAILS
BILLING_ADMIN_EMAILS
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
FORCE_PUBLIC_SITE_ONLINE   # optional
```

## Verification

Run before deployment:

```bash
npm test
npx tsc --noEmit --pretty false
npm run build
```

Current local verified state includes Stripe subscription billing, the homepage
fixture sponsor presentation, admin-managed homepage/about/sponsors/shop/
branding content, shop-page Home/Away kits, editable shop Purchase Details,
footer social links, responsive player/staff refinements, and the static shop
Photo Row. Latest verification in this working tree is 210/210 Vitest tests,
passing TypeScript, and a passing production build. Pushes to
`main` trigger the Vercel deployment — but never push without the user's
explicit permission for that specific push.
