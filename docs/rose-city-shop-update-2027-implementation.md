# RC2027-SHOP-UPDATE: Sam's Oct 28 Shop

Status: implemented locally, 2026-11-04. Christian approved the isolated preview
(outer `design-explorations/shop-update-2027/`) and asked for it to be built. Every change is
local on `codex/rose-city-homepage-2027`. Nothing was pushed, merged, deployed or written to a
hosted service.

Source: Sam's `Rose City FC Shop page 5 2027.jpg` (Dropbox, Oct 28), archived in outer
`assets/originals/shop-2027/`.

## Public Shop page (cinematic@2 only)

Top to bottom, the page now shows:

1. **Lead.** The kit title, then the red eyebrow, then the line for the selected jersey option,
   then the Authentic / Replica buttons. These buttons replace Home/Away publicly; editors still
   see Home/Away so the Away kit stays editable. Each button switches the price, the line and the
   Buy now link. A blank option link falls back to the kit's link. Below the buttons sit the
   description, an "Includes" label with the list, and Buy now.
2. **Jersey Details.** Up to six tiles, each with a photo, title and text. A tile without a photo
   shows a white box.
3. **Jersey Information.** The existing purchase cards, each with an optional icon from Sam's set
   (video camera, jersey, shipping box, no returns). Below them sit the color, material and care
   line, then the thank-you bar with Buy now.
4. The existing six-player photo row.
5. **Size chart.** On phones it is turned sideways so every size fits at 320px.
6. **Map view.** A heading, then the map: Sam's Chick-fil-A Route Zoom Map, shown whole.
7. Sponsors, unchanged.

Empty new sections are hidden publicly. The editor shows a prompt for each one instead.

Icons: Jersey, Shipping Box and No Access are Sam's own PNGs (trimmed) in
`public/rose-city/icons/`. His folder has no video camera, so that icon is the icons.download
video-camera in his red (#e93c2f) with a white play triangle. All of Sam's icons are archived
unchanged in outer `assets/originals/icons-2027/` with hashes.

## Owner editing (Shop editor, Shop page)

New tool buttons:

- **Edit prices:** up to two jersey options, each with a label, price, line under the title and
  an optional purchase link.
- **Edit jersey details:** the heading and up to six tiles, each with a photo upload, replace and
  remove, a description, title and text. Save stays disabled while a photo uploads. An unsaved
  photo is cleaned up when it is replaced or removed.
- **Edit care line:** one item per line, up to eight.
- **Edit size chart:** the heading, sizes as comma-separated values (up to eight), measurements
  with one value per size (up to eight), and the note under the chart.
- **Edit map:** gains a "Map heading" field.
- **Purchase details:** each card gains an Icon picker.

## Data and rules

- Everything new lives in `onzio.cinematic_shop_content`. The words are stored in `content`.
  Detail photos use six new tenant FK columns, `detail_1…6_media_asset_id`, each with a media
  guard trigger, like the map. The existing reference-safe retirement covers them automatically.
- The rules are defined in `lib/cinematic-shop-content.ts` and mirrored by
  `onzio_private.validate_cinematic_shop_content`:
  - At most 2 jersey options, 6 tiles, 4 card icons, 8 care items, and 8×8 size cells.
  - Every size row has one value per size.
  - Links are http(s) or blank.
  - Detail photos must be this club's published Shop images.
- New keys are optional, so Shop settings saved before this change still load and save. The
  editor and the public page fill in empty sections (`withShopDefaults`).
- `save_shop_page` writes the words and photos in the same atomic Shop save, with the same
  revision and receipt. Replaced or removed detail photos are returned in
  `retiredMediaAssetIds`.
- A direct table writer cannot leave a photo on a tile that doesn't exist.

## Migration (applied to the isolated local rehearsal only)

- `supabase/migrations/20261112130000_cinematic_shop_update.sql`
  - Adds the columns, FKs, grants and guards.
  - Adds helper functions.
  - Redefines `validate_cinematic_shop_content`, `validate_cinematic_shop_row`,
    `shop_page_snapshot` and `save_shop_page`. The last two were generated from the newest
    definitions (20261112020000) with counted text replacements.
- `scripts/apply-rose-city-shop-update-migration-local.ts --execute-local` applies it. It
  accepts only loopback 55321/55322 and records the migration in the ledger.
- Before any hosted deploy, the CLAUDE.md migration gate applies.

## Local content

`scripts/seed-rose-city-shop-update-2027-local.ts --execute-local`:

- **Guards:** runs only on the loopback rehearsal and the Rose City test tenant, and refuses if an
  owner has already edited the Shop.
- **Map:** publishes the route map through the normal pipeline. The input is a lossless PNG of
  Sam's JPEG with identical pixels, because graphics must be PNG or WebP. The replaced Bus Route
  map is then retired.
- **Shop kit:** writes Sam's title "City of the Roses", his description and the nine items, and
  blanks the store note.
- **Jersey Information:** writes the heading, Sam's four cards with Niky's at 1726 E Colorado
  Blvd, and the thank-you bar.
- **New sections:** writes Authentic $115 / Replica $95 (no separate links yet), six tiles without
  photos, the icons, the care line, the size chart and "Map view".
- **Protection:** checks that Homepage, About, Crest, branding, hero, matches, other kits and
  photos are unchanged.

Inputs and the receipt are in `assets/rose-city-shop-update-2027/`.

## Waiting on Sam

- Real photos for the six Jersey Details tiles (his file has Real Madrid placeholders).
- A video camera icon, if he wants his own.
- Niky's address: his file says 1726 E Colorado Blvd; the old Shop said 33 E Colorado Blvd.
- Replica-specific copy and a replica purchase link.
- The "Player edition" text is transcribed as written ("worn by … players wear").

## Verification

See the HANDOFF entry for 2026-11-04 (Shop update).
