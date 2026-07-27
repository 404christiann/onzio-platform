# Rose City FC — Codebase Summary

## What This Is

Official website for **Rose City Futbol Club**, a semi-professional soccer club based in Pasadena, CA and 2024 UPSL Champions. Public-facing fan site with a protected admin panel for club staff.

Current committed baseline is `9f98c2c1` on `main` (built on `0d4150bf`), and
the current local working tree extends it with admin-managed homepage/about/
sponsor/shop/branding content. Multi-season admin support, player activation
lifecycle fixes, the public visual refresh, independent homepage/shop kit
management, shop-page Home/Away kits, editable shop Purchase Details, the
homepage sponsor fixture, responsive roster cards, shared branding, editable
footer social links, variant-specific static shop-page Photo Rows, Stripe subscription
billing (admin + public lockout), and the Club nav section (About Club + Club
Logo) are implemented. See `docs/new-agent-handoff-2026-07-15.md` for the
current behavioral contract and `docs/stripe-subscription-plan.md` for the
billing design/decision record.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS v3 + custom CSS variables |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email magic link, allowlist-gated) |
| Animations | GSAP |
| Analytics | Vercel Analytics (script injection) |
| Deployment | Vercel |

---

## Brand System — Stick to This

### Colors
```
Green (primary):  #1B4D3E   → green / var(--color-green)
Green dark:       #163D31   → green-dark / var(--color-green-dark)
Green light:      #246655   → green-light / var(--color-green-light)
Red (accent):     #E7001B   → red / var(--color-red)
Red dark:         #9E1123   → red-dark / var(--color-red-dark)
White:            #FFFFFF
Black:            #141414
Gray light:       #F5F5F5
Gray mid:         #9A9A9A
```

### Typography
- **Display / Headings:** `LEMON MILK` Bold Italic from `public/fonts/lemon-milk/` — uppercase, bold italic, tight line-height
- **Body:** `DM Sans` — regular weight, 1.6 line-height

### Spacing
- Section padding utility: `section-padding` (6rem top/bottom, 9rem on md+)
- Max content width: `max-w-7xl mx-auto`
- Horizontal padding: `px-6 lg:px-10`

### Nav behavior
- Transparent over the homepage video hero; the temporarily hidden shop hero
  causes `/shop` to use the light navigation state
- `bg-white/95 backdrop-blur-sm` after scroll or on inner pages
- Five marks come from the Supabase `logos_v2` bucket; only the Rose City mark
  links home, and US Soccer/UPSL remain color
- Public active underline follows the finalized red/black state treatment;
  admin active states remain red

---

## Route Structure

```
/                        → Home (Hero, Home Kit, ChampionsBadge, NextMatchCard, Slideshow, Sponsors, Standings, BehindTheRose)
/roster                  → Season-aware player cards + technical staff from Supabase
/club/about              → DB-backed About Club page (no /club hub — "Club" nav item is not a link)
/club/logo               → DB-backed dark crest-explainer page (nav stays transparent throughout)
/schedule                → Season-aware fixture list
/shop                    → Database-backed Home/Away kit presentation, variant-specific photo row, and purchase details

/admin                   → Dashboard (stat overview + quick actions)
/admin/roster            → CRUD for players and staff
/admin/schedule          → Add / edit fixtures
/admin/stats             → Enter per-match player stats
/admin/season-stats      → Season aggregate view
/admin/seasons           → Create, activate, and safely delete seasons
/admin/shop              → Edit homepage kit, shop Home/Away kits, Photo Row, and Purchase Details
/admin/homepage          → Edit homepage slideshow and Behind the Rose
/admin/about             → Edit About Club and Club Logo pages
/admin/sponsors          → Edit sponsor carousel/footer logos
/admin/standings         → Edit homepage league standings and optional team logos
/admin/branding          → Edit shared club logo and footer social links
/admin/analytics         → Vercel Analytics embed
/admin/payments          → Subscribe/manage the platform's own Stripe subscription (billing-admin only)
/admin/login             → Magic-link login (email allowlist enforced in middleware)
```

---

## Folder Structure

```
app/
  layout.tsx                  Root layout — injects Vercel Analytics script
  (public)/
    layout.tsx                Wraps public pages with Nav + Footer
    page.tsx                  Home — all sections loaded with dynamic() + ssr:false
    roster/page.tsx           Active/historical season-aware Supabase roster
    club/about/page.tsx       DB-backed About Club page
    club/logo/page.tsx        DB-backed dark crest-explainer page
    schedule/page.tsx         Active-season Supabase fixtures
    shop/page.tsx             Shared database-backed kit section + purchase details
  admin/
    layout.tsx                Admin shell layout
    login/page.tsx            Magic-link login form
    auth/callback/route.ts    Supabase OAuth callback handler
    (protected)/              All admin pages — protected by middleware
    (protected)/payments/page.tsx  Subscribe/Manage Billing (billing-admin only)
  api/stripe/
    checkout/route.ts         Creates a Stripe Checkout Session, redirects there
    portal/route.ts           Creates a Stripe Billing Portal session, redirects there
    webhook/route.ts          Verifies Stripe signatures, syncs stripe_subscription
    billing-admin/route.ts    Tells the admin sidebar whether to show the Payments link

components/
  Nav.tsx                     Fixed five-logo nav with hero/light states; "Club" is a non-link hover/tap dropdown trigger (About Club, Club Logo)
  Footer.tsx                  Dark footer with DB-backed partner logos + social URLs
  Hero.tsx                    Half-screen desktop video hero (immersive mobile)
  NextMatchCard.tsx           Crest/sponsor homepage fixture with compact metadata
  OpponentCrest.tsx           Shared circular crest w/ monogram fallback
  ChampionsBadge.tsx          2024 Champions banner
  PhotoSlideshow.tsx          Homepage photo carousel
  ShopKitSection.tsx          Shared public kit presentation
  ShopKitSectionContainer.tsx Loads shop data and fallback content
  ShopPurchaseDetailsSection.tsx DB-backed shop Purchase Details block
  KitImageGrid.tsx            Hands-off autoplay for one-to-six kit photos
  ShopPhotoStrip.tsx          Static up-to-six-photo row, /shop only, no motion
  ShopPhotoStripContainer.tsx Loads variant-specific photo row data with a loading state
  LeagueStandingsTable.tsx    White mobile-fit homepage league table
  LeagueStandingsContainer.tsx Loads standings rows/settings from Supabase
  BehindTheRose.tsx           Club story / editorial section
  PartnerStrip.tsx            Sponsor logo row
  PlayerCard.tsx              Roster card; desktop stats hover, mobile opens modal directly
  PlayerModal.tsx             Player detail overlay with stats + action photos
  StaffCard.tsx               Staff identity/title card (opens StaffModal)
  StaffModal.tsx              Staff detail overlay
  FixtureRow.tsx              Single schedule row (opponent crest included)
  ShopHero.tsx                Desktop shop hero
  ShopHeroMobile.tsx          Mobile shop hero
  ShopSlideshow.tsx           Jersey image carousel
  NationalityFlag.tsx         Supabase flags-bucket image with graceful hiding
  admin/SeasonSelect.tsx      Shared dark admin season picker
  admin/ScaledShopKitPreview.tsx Exact public component scaled for admin
  admin/ScaledShopPhotoStripPreview.tsx Photo row preview, same scaling technique
  admin/AdminSaveFeedback.tsx Shared saving/success notification

lib/
  data.ts                     Static types/fallbacks
  queries.ts                  Season-aware Supabase fetch functions
  db-types.ts                 Raw Supabase DB row types
  supabase.ts                 Supabase client (generic)
  supabase-browser.ts         Browser Supabase client
  supabase-server.ts          Server Supabase client (for Server Components)
  flags.ts                    Nationality-to-storage-filename mappings
  site-flags.ts               Temporary UI switches such as SHOW_SHOP_HERO
  shop-kit.ts                 Shop display and photo diff helpers
  shop-purchase-details.ts    Shop Purchase Details defaults/normalization
  social-links.ts             Footer social-link defaults/normalization
  use-seasons.ts              Client season loading/selection hook
  stripe-client.ts            Single Stripe SDK construction point
  stripe-subscription-state.ts Pure lockout logic (admin: 0-day grace, public: +7-day buffer)
  subscription-mirror.ts      Reads the stripe_subscription singleton row
  supabase-service-role.ts    RLS-bypassing client; webhook + public-route middleware only

middleware.ts                 Protects /admin/* (auth/allowlist + subscription lockout)
                              and the public route list (subscription lockout only)

styles/globals.css            Tailwind imports + CSS variables + base resets
tailwind.config.ts            Custom colors + font families
```

---

## Data Flow

- **Public pages** use season-aware functions from `lib/queries.ts`. The active
  roster excludes deactivated players; historical roster cohorts are based on
  season-stat membership.
- **Admin pages** use the browser Supabase client directly (client components).
- **Shop content** comes from surface/variant-scoped `shop_kit_section` rows
  and ordered `shop_kit_photos`; the homepage and `/shop` share the same
  presentation component but have independent editable content and photos.
  Public Home/Away tabs appear only on `/shop`. Purchase Details are backed by
  `shop_purchase_details`. Apply `db/migrations/2026-07-shop-kit-details.sql`,
  `db/migrations/2026-07-shop-kit-surfaces.sql`,
  `db/migrations/2026-07-shop-kit-variants.sql`, and
  `db/migrations/2026-07-shop-purchase-details.sql` in new environments.
- **Club branding** comes from the singleton `site_branding` row. The root
  `ClubBrandingProvider` distributes its `logos_v2` path to all club-crest
  surfaces. Footer social URLs come from `site_social_links`. Production
  schema, bucket, and signed-in policies are confirmed; apply
  `db/migrations/2026-07-site-branding.sql` and
  `db/migrations/2026-07-site-social-links.sql` only in new environments.
- **Middleware** refreshes Supabase sessions on every `/admin` request and validates against `ADMIN_ALLOWED_EMAILS` env var.
- **Platform billing** comes from the singleton `stripe_subscription` row, kept in sync by `app/api/stripe/webhook/route.ts` (service-role writes only — RLS grants `SELECT` to `authenticated` but nothing else). `middleware.ts` reads it twice: once (zero grace) to soft-lock `/admin/*` behind `/admin/payments`, and once more (7-day grace on top) to serve a neutral `503` on the public route list. `FORCE_PUBLIC_SITE_ONLINE=true` overrides only the public check.

---

## Key Design Patterns

- All home page sections use `dynamic(() => import(...), { ssr: false })` — no SSR, avoids hydration issues with video/GSAP.
- `Hero.tsx` has a detailed iOS Safari autoplay workaround (first-touch listener + canplay/loadeddata retry).
- Nav switches the applicable logo sources between white hero variants and
  regular/color light-background variants.
- Admin dashboard uses a dark theme (`#141414` accents/sidebar, white type) while the public site is white bg.
- Stats are stored at two granularities: per-match (`player_match_stats`, `goalkeeper_match_stats`) and season aggregate (`player_season_stats`, `goalkeeper_season_stats`).
- Shop hero/slideshow code is preserved but hidden through
  `lib/site-flags.ts`; set `SHOW_SHOP_HERO` to `true` to restore it.
- The homepage Next Match card and the public schedule list share
  `OpponentCrest.tsx` for opponent logos, with a `light`/`dark` variant so the
  fallback monogram stays legible on colored backgrounds; uploaded logo images
  render with no added backdrop/border.
- Homepage composition is Hero → Home kit → trophy feature → Next Match →
  photo slideshow → sponsor carousel → Behind the Rose.
- Player modal Bio and Season Stats begin expanded. Mobile player cards do not
  run the desktop slide-up stats interaction; taps open the modal directly.
- Admin mutations use shared subtle saving/success feedback. The Shop editor is
  responsive and keeps its desktop-site preview scaled within the available
  admin viewport.
- The Branding editor validates and previews a replacement crest on light and
  dark backgrounds, with the preview/usage panel next to the main logo card.
  It also edits footer social URLs.
- `NavLink.href` is optional — a nav item without one (currently only "Club")
  renders as a non-navigating hover/tap trigger for its dropdown/accordion
  instead of a `<Link>`. `/club/logo` is the one route where the nav stays in
  its transparent/white-text hero state for the whole page, since the page
  itself is dark end to end.

---

## Assets

```
public/images/
  hero-poster.jpg             Video poster fallback
  home/                       Homepage slideshow photos
  logo/                       Rose City crest, affiliation logos (FIFA, US Open Cup, USA Soccer), social icons
  partners/                   Sponsor logos (6 partners)
  roster/players/             Player headshots (.webp)
  roster/staff/               Staff headshots (.webp)
  shop/                       Jersey product images
```

Hero video is served from Supabase Storage (not bundled in repo).

Public Supabase Storage buckets also provide:

- `logos_v2` — navigation marks and shared Rose City fallback patch.
- `flags` — roster and technical-staff nationality flags.
- `shop` — homepage/shop kit presentations and the shop Photo Row.
- `sponsors` — footer sponsor marks except Tepito Coffee and per-match sponsor
  uploads.
- `opponent-logos` — admin-uploaded opponent crests for matches.

---

## Updating Content

| What to change | Where |
|---|---|
| Players / staff | Admin panel `/admin/roster` |
| Seasons | Admin panel `/admin/seasons` |
| Schedule / fixtures | Admin panel `/admin/schedule` (season is required); optional opponent logo upload + competition label |
| Match stats | Admin panel `/admin/stats` |
| Homepage/shop kit text, links, and photos | Admin panel `/admin/shop` → choose Homepage or Shop Page |
| Main club logo | Admin panel `/admin/branding` |
| Partners | `components/Footer.tsx` → `partners` array |
| Social links | `components/Footer.tsx` → `socialLinks` array |
| Nav links | `components/Nav.tsx` → `navLinks` array |
| Brand colors | `styles/globals.css` CSS variables + `tailwind.config.ts` |

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-only; bypasses RLS. Stripe webhook + public middleware read.
ADMIN_ALLOWED_EMAILS          # comma-separated list of admin email addresses
BILLING_ADMIN_EMAIL           # single email allowed to see/act on /admin/payments
STRIPE_SECRET_KEY             # sk_test_... locally, sk_live_... in Production
STRIPE_PRICE_ID               # recurring monthly Price ID (test/live differ)
STRIPE_WEBHOOK_SECRET         # per-endpoint signing secret (test/live/local-CLI all differ)
FORCE_PUBLIC_SITE_ONLINE      # optional; "true" overrides only the public-site lockout
```

Local dev and production currently share one Supabase project — there is no
separate test database. Local Stripe testing with test-mode keys writes into
the same `stripe_subscription` row production reads; clear/re-sync it
afterward before trusting it in production.

## Verification Baseline

```text
npm test                         210/210 passed across 12 files (current local verified state)
npx tsc --noEmit --pretty false passed
npm run build                    passed
```

The production build has non-blocking warnings for a few raw `<img>` elements
and unnecessary analytics `useMemo` dependencies. `tsconfig.tsbuildinfo` is a
generated cache and may appear modified after verification.

The earlier `/shop` white-gap report was superseded by the shared kit image
fade and photo-row tuning. The homepage and `/shop` kit image sections now use
that same fade.
