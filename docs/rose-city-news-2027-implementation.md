# RC2027-NEWS: News list, article pages and News editor

Status: implemented locally, 2026-11-04. Christian approved the isolated preview
(outer `design-explorations/news-2027/`) and asked for it to be built. The work is on branch
`codex/rose-city-news-2027` in its own worktree, `implementation/onzio-platform-news`, branched
from `e8cdf22`. Nothing was committed, pushed, merged, deployed or written to a hosted service.

Sources: Sam's `Rose City FC News page 12 2027.jpg` (the list) and
`Rose City FC News x Foothill Transit page 10 28 2027.jpg` (the article), archived in outer
`assets/originals/remaining-pages/` as `news-reference.jpg` and `foothill-article-reference.jpg`.

## Christian's decisions (2026-11-04)

- `/news` opens on the card list. Clicking a card opens that article.
- Five colour-coded categories in Sam's order and colours.
- The Foothill article is Sam's copy word for word, with "Partner with us" linking to
  `/community/partnership`.
- **Date:** Friday, Nov 20, 2026 at 12:00 PM. Sam wrote "Wednesday", but Nov 20, 2026 is a Friday.
- **Duplicates:** Sam's list repeats the Foothill card. Only real articles are shown.
- **Cover:** until Sam sends the original locker-room photo, the article uses a crop of his mockup.
- **Remove:** hides the article and keeps it restorable. Nothing is deleted.
- **Future dates:** an article shows as soon as it is saved. The date is only a label.
- **Styling:** no BoardUI. The site's own styles and the existing admin components are used.

## Public pages (cinematic@2 only)

**`/news`** shows:

- the "RCFC News / Stay up-to-date" heading;
- Sam's legend: Sponsor/Partner `#fc1618`, Partner `#5361ff`, Community `#ffa924`, New Player
  `#00adc6`, News `#3ba84b` (sampled in sRGB from his file);
- one numbered card per shown article, newest first. Each card has its heading above it, then the
  title, the cover and the number, then a colour band with the category. The Community band reads
  "RCFC in the Community", as in Sam's file;
- the partner strip.

With no articles, the page says "News is coming soon."

**`/news/<address>`** shows:

- the dark header with "News", the title and the subtitle;
- the cover, with the dark header running a third of the way down behind it and then a red line,
  as in Sam's art;
- a rule, then the category dot, then the date in the club's time zone;
- the paragraphs and the optional button;
- the partner strip.

An unknown or removed article shows the site's "This page could not be found". Like the existing
Roster detail page, it streams with HTTP 200 because the tenant layout has a `loading.tsx`.
`/news/injury-report` keeps its placeholder until RC2027-INJURY-REPORT.

Below 700px each card stacks: photo, then title and number, then the band. The legend wraps.

## Owner editing (Admin → News, cinematic@2 only)

- **Sidebar:** a News entry in the Website group, visible only for cinematic@2 (icons.download
  `book-open`, medium outline round, the same style as the other admin icons).
- **List:** shown articles with Edit and Remove; removed articles under "Removed from the site"
  with Edit and Restore.
- **Article form:**
  - category, and date and time in club time;
  - card heading, title and optional subtitle;
  - cover photo: upload, replace or remove, plus a photo description;
  - article text, with each line as a paragraph;
  - optional button label and link.
- **Field messages** explain what to fix before saving.
- **Preview:** a phone and desktop preview of the article.
- **Saving:**
  - An article shows on the site as soon as it is saved.
  - Its web address is made from the first title and never changes.
  - Two editors saving at once get a "changed by another editor" message instead of overwriting.
  - A lost response is checked by operation id, so a save can be retried safely.

## Data and rules

- `onzio.cinematic_news_articles` stores one row per article:
  - `slug`, unique per club, reserving `injury-report`;
  - `content` (jsonb);
  - `cover_media_asset_id`, a tenant FK to `media_assets` with the media guard trigger;
  - `published_at`, `removed_at` and `revision`.
- **Rules:** defined in `lib/cinematic-news.ts` (`newsArticleContentSchema`) and mirrored by
  `onzio_private.check_cinematic_news_content`:
  - five categories;
  - card heading up to 40 characters, title 140, subtitle 200, photo description 200;
  - 1 to 40 paragraphs of up to 4,000 characters;
  - a button needs both a label and a link. The link is https on a public host or a path on
    this site.
- **RLS:**
  - visitors read only articles that are not removed, for a club they can read;
  - owners and admins read all of their club's articles;
  - writes need `can_mutate_feature(club, 'news')` and a published cinematic@2 design.
- **RPCs:** `onzio.load_cinematic_news_editor` and `onzio.save_cinematic_news_article`, both
  security invoker, with idempotent receipts in `onzio_private.cinematic_news_save_receipts`.
  - `save` creates or edits an article; `remove` hides it; `restore` shows it again.
  - A cover must be this club's published photo on the new `news` media surface.
  - A replaced or cleared cover is returned in `retiredMediaAssetIds`. The save route retires it
    only when nothing else references it.
- **Route:** `app/api/admin/cinematic-news` checks origin, payload, session, tenant (from the
  host, never the body), template and role before the RPC.
- **Media:** the new `news` surface (photos) is in `MEDIA_SURFACES` and the admin upload client.
- **Types:** only this table and its two RPCs were added to `lib/database.generated.ts`.

## Migration (applied to the isolated local rehearsal only)

- `supabase/migrations/20261105010000_cinematic_news.sql`.
- `scripts/apply-rose-city-news-migration-local.ts --execute-local` applies it. It accepts only
  loopback 55321/55322 and records the migration in the ledger.
- **Before any hosted deploy, the CLAUDE.md migration gate applies.** Note: on the local ledger
  this migration was applied after the Policies (`20261105020000`) and Partners
  (`20261105030000`) migrations, which carry later timestamps.

## Local content

`scripts/seed-rose-city-news-2027-local.ts --execute-local`:

- **Guards:** runs only on the loopback rehearsal and the Rose City test tenant on cinematic@2, and
  refuses once any article exists.
- **Cover:** publishes the cover crop through the normal validation and media pipeline. It is
  stored as a normalized WebP on the `news` surface.
- **Article:** writes Sam's Foothill article, dated Friday, Nov 20, 2026, 12:00 PM Pacific, at
  `/news/foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc`.
- **Protection:** checks that Homepage, About, Contact, Shop, Stadium, Tickets, matches and
  sponsors are unchanged.

Inputs, hashes and the receipt are in `assets/rose-city-news-2027/`.

**Placeholder articles.** Christian asked for the list to match Sam's reference, with all five
categories and placeholder text. `scripts/seed-rose-city-news-2027-placeholders-local.ts
--execute-local` has the same loopback, tenant and design guards. It refuses unless the Foothill
article is the only one, and checks that the Foothill row and the other content are unchanged.

It adds four articles in Sam's card order, dated before Foothill so they number 2 to 5:

| # | Category | Card heading | Title | Button |
|---|---|---|---|---|
| 2 | Community | Foothill Transit | Win free Foothill Transit bus passes at every RCFC home game | See home games → `/schedule` |
| 3 | Partner | Chick-fil-A | Chick-fil-A joins RCFC as an Official Partner | Partner with us → `/community/partnership` |
| 4 | News | Tepito Coffee | Tepito Coffee is brewing at Robinson Stadium this season | none |
| 5 | New Player | Welcome Mendez | RCFC Welcomes Nick Mendez | Meet the roster → `/roster` |

The card headings and the Mendez title are Sam's. The other text is placeholder copy, written
without facts, figures or quotes that would need checking. Each article has its own published copy
of the locker cover, as in Sam's reference, so replacing one card's photo never retires another's.
The receipt is `local-placeholder-receipt.json`.

## Tests (written first, at the four seams Christian confirmed)

- **Content rules** (`tests/contracts/cinematic-news-content.test.ts`): the date in club time
  across daylight saving, the categories, content limits, the button link rule, web addresses,
  paragraphs and newest-first order.
- **Public pages** (`cinematic-news-pages.test.ts`):
  - the list and article;
  - removed articles stay hidden even for a signed-in owner;
  - not found for other site designs;
  - Injury Report keeps its page;
  - the middleware routes article addresses.
- **Database and save route** (`tests/database/cinematic-news.test.ts`,
  `cinematic-news-admin.test.ts`): receipts, unique fixed addresses, conflicts, invalid content
  and direct writes, cover rules and retirement, remove and restore visibility, tenant, role and
  template checks.
- **Editor** (`cinematic-news-editor.test.ts`): draft to save request (new and edit), field
  messages, the sidebar entry and the `news` surface, and the article list.
- **Admin navigation:** the exact admin navigation lists in `admin-route-manifest.test.ts`,
  `admin-sidebar-groups.test.ts` and `editorial-admin-surface.test.ts` now include News. They are
  still exact; DCFC's academy@1 sidebar is unchanged.

## Waiting on Sam

- The original locker-room photo (the cover is a crop of his mockup).
- Real articles to replace the four placeholders (Community, Partner, News, New Player).

## Verification

See the HANDOFF entry for 2026-11-04 (RC2027-NEWS).
