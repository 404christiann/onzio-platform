# Phase 1 Rose City Source Inventory

Last verified: 2026-07-26

## Scope and provenance

The application baseline was copied from:

```text
/Users/christianalcala/Downloads/roseCityWebsite
```

The copy includes the source working tree as it existed on 2026-07-26,
including the uncommitted billing-admin allowlist/webhook hardening and its
regression test. It excludes:

- `.git`
- `.env.local` and all secrets
- `node_modules`
- `.next`
- `output`
- `tmp`
- `.DS_Store`
- `tsconfig.tsbuildinfo`
- local Claude settings/locks
- `supabase-image-loader.js`

Rose City's historical Markdown is retained under `docs/rose-city-legacy/`.
It is evidence about the source application, not Onzio architecture authority.

The source application was upgraded during bootstrap from vulnerable
Next.js 14.2.3/React 18 to Next.js 15.5.21/React 19.2.4. The Supabase custom
image loader was not copied; `next.config.mjs` uses exact legacy bucket paths
plus the planned `onzio-media` path.

## Route inventory

### Public pages

| Route | Source |
| --- | --- |
| `/` | `app/(public)/page.tsx` |
| `/roster` | `app/(public)/roster/page.tsx` |
| `/schedule` | `app/(public)/schedule/page.tsx` |
| `/shop` | `app/(public)/shop/page.tsx` |
| `/club/about` | `app/(public)/club/about/page.tsx` |
| `/club/logo` | `app/(public)/club/logo/page.tsx` |
| `/club-logo` | `app/club-logo/route.ts` dynamic logo response |

### Authentication and admin pages

| Route | Purpose |
| --- | --- |
| `/admin/login` | Magic-link login |
| `/admin/auth/callback` | Supabase PKCE callback |
| `/admin` | Operational dashboard |
| `/admin/about` | About/logo content |
| `/admin/analytics` | Player analytics |
| `/admin/branding` | Shared crest and social links |
| `/admin/homepage` | Slideshow and Behind the Rose |
| `/admin/payments` | Subscription status and billing links |
| `/admin/roster` | Players, staff, portraits, season membership |
| `/admin/schedule` | Fixtures, results, crests, match sponsors |
| `/admin/season-stats` | Season totals |
| `/admin/seasons` | Season lifecycle |
| `/admin/shop` | Kits, photos, and purchase details |
| `/admin/sponsors` | Homepage/footer sponsor logos |
| `/admin/standings` | League standings |
| `/admin/stats` | Per-match statistics |

### API routes

| Route | Method/boundary |
| --- | --- |
| `/api/stripe/billing-admin` | Authenticated billing-admin capability check |
| `/api/stripe/checkout` | Authenticated Checkout creation |
| `/api/stripe/portal` | Authenticated Customer Portal creation |
| `/api/stripe/webhook` | Stripe signature verification and service-role projection |

`middleware.ts` currently protects admin routes by email allowlist and enforces
the legacy Stripe lockout. It is not tenant-aware and does not require MFA.

## Production schema introspection

Read-only introspection ran on 2026-07-26 against the verified Rose City
Supabase host using:

- PostgREST OpenAPI `GET`
- per-table `HEAD` requests with exact-count preference
- Storage bucket metadata `GET`

No rows, objects, policies, schema, Auth users, Stripe objects, or settings were
mutated. The reusable guarded command is:

```bash
node scripts/introspect-rose-city.mjs /path/to/rose-city/.env.local --compact
```

The script refuses every Supabase hostname except the known Rose City project.
`403` below means the exact REST count was not available through the inspected
role/grants; it does not mean the table is empty.

| Table | Primary key | Foreign keys | Observed count |
| --- | --- | --- | ---: |
| `about_page_content` | `id` | — | unavailable (403) |
| `behind_the_rose_section` | `id` | — | unavailable (403) |
| `club_logo_page_content` | `id` | — | unavailable (403) |
| `goalkeeper_match_stats` | `id` | `player_id → players.id`, `match_id → matches.id` | 6 |
| `goalkeeper_season_stats` | `(player_id, season_id)` | `player_id → players.id`, `season_id → seasons.id` | unavailable (403) |
| `homepage_slideshow_photos` | `id` | — | unavailable (403) |
| `homepage_slideshow_settings` | `id` | — | unavailable (403) |
| `league_standings` | `id` | — | unavailable (403) |
| `league_standings_settings` | `id` | — | unavailable (403) |
| `matches` | `id` | `season_id → seasons.id` | 6 |
| `player_match_stats` | `id` | `player_id → players.id`, `match_id → matches.id` | 40 |
| `player_photos` | `id` | `player_id → players.id` | unavailable (403) |
| `player_season_stats` | `(player_id, season_id)` | `player_id → players.id`, `season_id → seasons.id` | unavailable (403) |
| `players` | `id` | — | 33 |
| `seasons` | `id` | — | unavailable (403) |
| `shop_carousel_photos` | `id` | — | unavailable (403) |
| `shop_kit_photos` | `id` | — | unavailable (403) |
| `shop_kit_section` | `id` | — | unavailable (403) |
| `shop_purchase_details` | `id` | — | unavailable (403) |
| `site_branding` | `id` | — | unavailable (403) |
| `site_social_links` | `id` | — | unavailable (403) |
| `site_sponsor_logos` | `id` | — | unavailable (403) |
| `staff` | `id` | — | 6 |
| `stripe_subscription` | `id` | — | 1 |

### Field inventory

| Table | Columns |
| --- | --- |
| `about_page_content` | `id`, `hero_title`, `story_paragraphs`, `feature_image_url`, `values_heading`, `values`, `closing_text`, `closing_cta_label`, `closing_cta_href`, `updated_at` |
| `behind_the_rose_section` | `id`, `visible`, `eyebrow`, `title`, `description`, `video_url`, `video_title`, `caption`, `updated_at` |
| `club_logo_page_content` | `id`, `annotated_image_url`, `features`, `map_image_url`, `updated_at`, `color_cards` |
| `goalkeeper_match_stats` | `id`, `player_id`, `match_id`, `starts`, `shots_on_goal`, `saves`, `goals_against`, `clean_sheet`, `fouls`, `yellow_cards`, `red_cards`, `minutes`, `mins`, `clean_sheets`, `yellow`, `red` |
| `goalkeeper_season_stats` | `player_id`, `goals_against`, `saves`, `clean_sheets`, `starts`, `yellow`, `red`, `mins`, `season_id` |
| `homepage_slideshow_photos` | `id`, `url`, `alt`, `sort_order`, `created_at` |
| `homepage_slideshow_settings` | `id`, `season_label`, `updated_at` |
| `league_standings` | `id`, `team_name`, `team_abbreviation`, `logo_url`, `played`, `wins`, `draws`, `losses`, `goal_difference`, `points`, `is_club`, `sort_order`, `created_at`, `updated_at` |
| `league_standings_settings` | `id`, `eyebrow`, `title`, `intro`, `updated_at` |
| `matches` | `id`, `date`, `time`, `opponent`, `home`, `venue`, `address`, `score_ours`, `score_them`, `shots_on_goal`, `shots`, `gk_saves`, `offsides`, `fouls`, `passes_ours`, `passes_them`, `created_at`, `season_id`, `opponent_logo_url`, `competition`, `sponsor_name`, `sponsor_logo_url`, `sponsor_link`, `opponent_short_name`, `city`, `state`, `rose_city_score`, `opponent_score` |
| `player_match_stats` | `id`, `player_id`, `match_id`, `starts`, `shots`, `goals`, `assists`, `tackles`, `dfk`, `ck`, `pk`, `fouls`, `offsides`, `yellow_cards`, `red_cards`, `minutes`, `mins`, `yellow`, `red`, `fouls_suffered` |
| `player_photos` | `id`, `player_id`, `url`, `sort_order`, `created_at` |
| `player_season_stats` | `player_id`, `goals`, `assists`, `tackles`, `starts`, `yellow`, `red`, `mins`, `offsides`, `fouls`, `fouls_suffered`, `season_id` |
| `players` | `id`, `number`, `name`, `caption`, `nationality`, `position`, `height`, `weight`, `age`, `hometown`, `school`, `previous_club`, `photo_url`, `active`, `created_at`, `bio`, `pronunciation`, `foot` |
| `seasons` | `id`, `label`, `start_year`, `end_year`, `active`, `created_at` |
| `shop_carousel_photos` | `id`, `url`, `sort_order`, `created_at`, `kit_variant` |
| `shop_kit_photos` | `id`, `url`, `sort_order`, `created_at`, `surface`, `kit_variant` |
| `shop_kit_section` | `id`, `eyebrow`, `title`, `description`, `cta_label`, `cta_link`, `updated_at`, `bullet_points`, `store_note`, `surface`, `kit_variant` |
| `shop_purchase_details` | `id`, `heading`, `cards`, `cta_eyebrow`, `cta_text`, `cta_label`, `cta_link`, `updated_at` |
| `site_branding` | `id`, `club_logo_path`, `updated_at` |
| `site_social_links` | `id`, `label`, `href`, `icon`, `sort_order`, `updated_at` |
| `site_sponsor_logos` | `id`, `placement`, `name`, `logo_url`, `sort_order`, `created_at` |
| `staff` | `id`, `initials`, `name`, `role`, `hometown`, `bio`, `photo_url`, `active`, `created_at`, `nationality` |
| `stripe_subscription` | `id`, `stripe_customer_id`, `stripe_subscription_id`, `status`, `cancel_at_period_end`, `current_period_end`, `updated_at` |

## Read and write inventory

### Public/runtime reads

`lib/queries.ts` and `app/club-logo/route.ts` read branding, homepage, about,
shop, sponsors, standings, seasons, rosters, player photos, matches, and
statistics. The legacy app assumes one club and has no `club_id` predicate.

### Admin reads and writes

Admin pages currently construct the browser Supabase client and directly issue
`select`, `insert`, `update`, `upsert`, and `delete` calls for:

- players, staff, and player photos
- matches and match/season statistics
- seasons
- homepage/about/logo content
- shop content and photo ordering
- sponsors, standings, branding, and social links

This is a deliberate Phase 1 finding, not the target architecture. Phase 3
must move mutations behind validated server boundaries while retaining
user-scoped RLS as the final authorization layer.

### Privileged writes

`app/api/stripe/webhook/route.ts` uses the service-role client to upsert the
single `stripe_subscription` projection. `middleware.ts` also uses the service
role to read that row for public lockout, which is outside the approved future
privileged boundary and must be removed during tenant conversion.

## Public and private data classification

### Public content candidates

Club branding, public roster/staff profiles, fixtures/results, public
statistics, seasons, homepage/about/shop copy, published media references,
sponsors, social links, and standings are candidates for anonymous reads only
when the tenant is live/grace and the feature is tier-enabled.

### Private or restricted

- Stripe customer/subscription IDs, status projection, event ledger, and price mapping
- memberships, roles, Auth identities, MFA state, and invitations
- audit events and request metadata
- upload staging paths and validation results
- operator provisioning, migration, archival, and purge state
- internal lifecycle/entitlement decisions not required for safe rendering

The legacy database has no membership, audit, event-ledger, media-asset, tenant,
domain, lifecycle, or entitlement tables.

## Storage inventory

All 14 observed Rose City buckets are public:

| Bucket | Limits observed |
| --- | --- |
| `about-page` | 10 MiB; JPEG/PNG/WebP/GIF |
| `Aboutassets` | no bucket metadata limits |
| `flags` | no bucket metadata limits |
| `homepage` | 10 MiB; JPEG/PNG/WebP/GIF |
| `logos` | no bucket metadata limits |
| `logos_v2` | no bucket metadata limits |
| `opponent-logos` | no bucket metadata limits |
| `player-action-photos` | no bucket metadata limits |
| `roster-images` | no bucket metadata limits |
| `shop` | no bucket metadata limits |
| `sponsors` | no bucket metadata limits |
| `staff-images` | no bucket metadata limits |
| `standings` | 10 MiB; JPEG/PNG/WebP/GIF |
| `videos` | no bucket metadata limits |

Legacy upload code trusts browser `File.type`, writes directly to public
buckets, and sometimes uses stable/upserted paths. Onzio must replace this
with private staging, signature/dimension validation, normalization,
UUID-versioned public paths, `media_assets`, and cleanup/retry handling.

## Reconciliation notes

- Legacy database runbooks remain under `db/migrations`; they are not Onzio
  migrations and must not be run against the new production project.
- Onzio migrations will live under `supabase/migrations`.
- The local `supabase/config.toml` remains contract-harness authority.
- Rose City's current subscription row exists and the real Stripe
  subscription ID must be reconciled in place during Phase 8.
- No production mutation, export, seed, Stripe update, DNS change, or cutover
  was performed during this inventory.

