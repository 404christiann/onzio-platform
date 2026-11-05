# RC2027-INJURY-REPORT: Injury Report page and editor

Status: implemented locally, 2026-11-04. Christian approved the isolated preview
(outer `design-explorations/injury-report-2027/`, port 3215) and the four test seams, and asked for
it to be built. The work is on branch `codex/rose-city-injury-report-2027` in its own worktree,
`implementation/onzio-platform-injury`, branched from `ecb47d1`. Nothing is committed, pushed,
merged, deployed or written to a hosted service.

Source: Sam's `Injury report page 1 2027 Final.jpg`, archived in outer
`assets/originals/remaining-pages/injury-report-reference.jpg`.

## Christian's decisions (2026-11-04)

- **Sample entries:** made up, not copied. Sam's three cards repeat one player with real-looking
  names and clubs. The samples are local seed data only; the owner replaces them in the admin portal.
- **Roster link:** each card takes the player's name, number, position and photo from the Roster.
  The owner edits only injury, timeline and note.
- **Also owner-editable:** the quote, its attribution, the YouTube video, the photo band and its
  description, the Rehab heading, and the "Presented by" partner name and logo.
- **Logo:** the MVMNT CULTR logo file is missing. The slot starts empty and the page shows the
  partner's name as text until the owner uploads a logo.
- **Video:** optional. Without a link the page shows "Watch on YouTube · Coming soon". It uses
  `lib/youtube-embed.ts` and the Home replay's click-to-play pattern.
- **No injuries:** a card in the injury-card style ("No current injuries", "Full squad"), centred
  beside a smaller red cross. This was redesigned after Christian's first review, when the cross was
  overlapping the photo band.
- **Styling:** no BoardUI. The page uses the site's own styles and the editor uses the existing
  admin components.

## Public page (`/news/injury-report`, cinematic@2 only)

- **Heading:** "Injury Report", then "Presented by" and the partner's logo, or the partner's name
  as text.
- **Cards:** in the owner's order. Each shows the player photo, name, red number and position, then
  Injury and Timeline, and an optional italic note.
  - An entry whose player is no longer active on the Roster is hidden.
  - The faint red cross sits in the same grid as the cards, so it always stays inside the card
    section. It is hidden below 1024px.
- **Photo band:** full width, if one is set.
- **Rehab and quote:** the Rehab heading, then the quote with Sam's red "6699" mark and the
  attribution. A blank quote hides the quote block.
- **Video:** nothing loads from YouTube until a visitor presses play.
- **Partner strip:** the same strip as the News pages.
- **Never saved:** the page shows the starting content (the MVMNT CULTR headings, no band, no
  injuries).
- **Other designs:** "not found".

`/news/injury-report` was already reserved from News article addresses (`RESERVED_NEWS_SLUGS`), so
the route needed no middleware change.

## Owner editing (`/admin/injury-report`, cinematic@2 only)

The editor is reached from the Homepage editor's "Edit in Injury Report" shortcut. It has no
sidebar entry, so the exact admin-navigation tests stay as they are. Sections:

- **Presented by:** partner name, and a logo upload, replace or remove. Logos must be PNG or WebP
  and go through the media pipeline as `branding` graphics.
- **Injuries:** up to 24 entries, each player at most once.
  - The player picker lists active Roster players and hides players who already have an entry.
  - Injury, timeline and an optional note.
  - Move up, move down and remove.
  - An entry whose player has left the active Roster is flagged and must be removed before saving.
- **Photo, rehab quote and video:**
  - photo band upload, replace or remove (`news` photographs);
  - photo description, Rehab heading, quote and "Quote by";
  - YouTube link: watch, youtu.be, live or embed links are stored in the embed form.
- **Field messages:** shown beside each field before saving, for example "Enter the injury." or
  "Paste a YouTube video link."
- **Preview:** desktop and phone, using the real page component and Roster photos.
- **Saving:**
  - All changes save together.
  - Unsaved drafts are kept in the browser and restored.
  - Two editors saving at once get "Another editor changed the Injury Report…".
  - A lost response is checked by operation id, so the same save can be retried safely.
  - Uploads the draft no longer uses are cleaned up.

## Data and rules

- **Tables:**
  - `onzio.cinematic_injury_report_content`: one row per club, with the page copy (`content`
    jsonb), `presenter_logo_media_asset_id`, `band_media_asset_id` and `revision`.
  - `onzio.cinematic_injury_entries`: `sort_order` 0–23, `player_id`, `injury`, `timeline` and
    `note`.
  - Entries use a composite tenant FK `(club_id, player_id)` to `onzio.players` with
    `on delete cascade`, and the pair `(club_id, player_id)` is unique.
- **Rules:**
  - Defined in `lib/cinematic-injury-report-content.ts` and mirrored by
    `onzio_private.check_cinematic_injury_report_content`.
  - Partner name: 1–60 characters. Rehab heading: 1–80. Quote: up to 600. Attribution: up to 120.
    Photo description: up to 200.
  - Injury: 1–80. Timeline: 1–40. Note: up to 200.
  - The video link is either blank or the canonical `https://www.youtube.com/embed/<id>?rel=0`.
  - The validator checks every value's type before reading inside it.
- **Permissions:**
  - The page follows the Roster permission (`roster` feature).
  - Visitors read through `can_read_feature`.
  - Writes need `can_mutate_feature(club, 'roster')` and a published cinematic@2 design.
  - Direct writes by visitors or non-members are refused.
- **RPCs:** `onzio.load_cinematic_injury_report_editor` and
  `onzio.save_cinematic_injury_report_editor`, both security invoker. Receipts are stored in
  `onzio_private.cinematic_injury_report_save_receipts`. The snapshot carries the saved content, the
  active Roster players for the picker, and the logo and band media.
- **Save checks:**
  - Every entry's player must be an active player of this club.
  - The logo must be this club's published graphic, and the band its published photograph.
  - A replaced or cleared logo or band is returned in `retiredMediaAssetIds`. The route retires it
    only when nothing else references it; the seeded band is shared with the Home slideshow and is
    kept.
- **Locks:** advisory lock `734901330`, plus the shared media lock `734901281`.
- **Route:** `app/api/admin/cinematic-injury-report` checks origin, payload, session, tenant (from
  the host, never the body), template and role before the RPC.
- **Types:** `lib/database.generated.ts` gains only the two tables and two RPCs. The Robinson
  editor's migration was also on the shared local ledger, and its types were stripped from this
  branch's regeneration.

## Migration (applied to the isolated local rehearsal only)

- `supabase/migrations/20261105040000_cinematic_injury_report.sql`.
- `scripts/apply-rose-city-injury-report-migration-local.ts --execute-local` applies it. It accepts
  only loopback 55321/55322 and records the migration in the ledger. A dry run inside a rolled-back
  transaction passed first.
- **Before any hosted deploy, the CLAUDE.md migration gate applies.**

## Local content

`scripts/seed-rose-city-injury-report-2027-local.ts --execute-local`:

- **Guards:**
  - runs only on the loopback rehearsal and the Rose City test tenant on cinematic@2;
  - needs the migration;
  - refuses to overwrite existing Injury Report content (checked by running it a second time);
  - checks that Homepage, the slideshow, players, media, Partners and News are unchanged.
- **Sample entries** (made up; the players are real Roster players):

| # | Player (from Roster) | Injury | Timeline | Note |
|---|---|---|---|---|
| 1 | #4 Chris Martinez, Defender | Hamstring strain | 2–3 weeks | Felt tightness in training and was rested as a precaution. |
| 2 | #7 Edgardo Artero, Midfielder | Ankle sprain | Day-to-day | Will be assessed before the next home match. |
| 3 | #9 Aidan Apodaca, Forward | Groin tightness | 1 week | none |

- **Page content:** the sample quote ("…Sample quote: the owner replaces this text in the admin
  portal."), attribution "MVMNT CULTR rehab team", and the band reusing Home's "match photograph 3"
  record (`02d0a76d-…`). There is no logo and no video. Nothing is uploaded.

## Tests (written first, at the four seams Christian confirmed)

- **Content rules** (`tests/contracts/cinematic-injury-report-content.test.ts`, 8 tests): starting
  content, order, required fields and limits, 24 entries, one entry per player, the video link rule
  and normalisation, strict fields.
- **Public page** (`cinematic-injury-report-page.test.ts`, 8 tests):
  - cards with Roster data in the owner's order;
  - inactive players hidden;
  - the No current injuries card;
  - the logo or the name as text;
  - the band, the quote, and a hidden blank quote;
  - video placeholder vs. play button;
  - the never-saved page;
  - not found for other designs.
- **Database** (`tests/database/cinematic-injury-report.test.ts`, 9 tests):
  - atomic save and receipts;
  - the Roster picker;
  - player and media checks;
  - retirement, including a band shared with the slideshow;
  - invalid content and conflicts;
  - tenant and design refusals;
  - public read with no direct writes.
- **Editor and save route** (`cinematic-injury-report-editor.test.ts`, 14 tests):
  - route checks, retirement and conflicts;
  - the club taken from the host;
  - add, move, remove and picker options;
  - flagging players who left the Roster;
  - save request and field messages;
  - upload cleanup;
  - the Homepage shortcut.
- **Changed existing test:** `cinematic-news-pages.test.ts` now expects the real Injury Report at
  `/news/injury-report` instead of the placeholder. Christian approved this.

## Verification (2026-11-04)

- **Tests:**
  - Contract, unit and architecture: 221 files, 1,831 tests pass (1,801 before this package plus
    these 30).
  - Database: 47 files, 418 tests pass.
- **Type check and lint:** `tsc --noEmit` passes. ESLint is clean on every touched file.
- **Real Chrome** (`rose-city.localhost:3197/news/injury-report`), in exact-width frames at 320,
  390, 768, 1280 and 1440px:
  - no horizontal overflow and no broken images;
  - three cards with Roster photos;
  - the cross is shown at 1280 and 1440 and stays above the photo band;
  - no console errors;
  - the desktop page matches the approved preview.
  - At 320px six partner-strip logos had not finished lazy loading (off-screen carousel items).
    None were broken.
- **Editor**, checked in headless Chromium as the synthetic local owner (`o***@alpha.local`):
  - it loaded the three seeded entries with their players;
  - an edited timeline saved, survived a reload and appeared on the public page;
  - a blank injury showed "Enter the injury.";
  - a Vimeo link showed "Paste a YouTube video link.";
  - the 390px editor has no horizontal overflow;
  - the edit was then undone through the editor, and the stored entries and page equal the seed
    again (revision 3).
- **Not checked in a browser:** uploading a logo or band photo. Uploads use the same media client
  and cleanup as Partners and News, and the database tests cover the media rules.

## Waiting on Sam or the club

- The MVMNT CULTR logo file.
- Real injury entries, quote, attribution and video link to replace the samples.
