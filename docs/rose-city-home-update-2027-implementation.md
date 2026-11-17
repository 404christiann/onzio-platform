# RC2027-HOME-UPDATE: Sam's Oct 31 Home additions

Status: implemented locally, 2026-11-04. Christian approved the isolated preview
(outer `design-explorations/home-update-2027/`) and asked for it to be built.
Every change is local on `codex/rose-city-homepage-2027`. No push, merge,
deploy or hosted write.

Source: Sam's `Rose City FC Home page 1 2027 Final.jpg` in Dropbox
`/Rose City FC x Onzio 2027`, dated Oct 31.

## What the public Home page now shows (cinematic@2 only)

1. **Latest result strip**, after the match photographs.
   - It shows the most recent match with both scores entered, home or away.
     Christian chose this rule.
   - It reads only Schedule data: competition, date, venue, both scores and
     scorers.
   - The club label is `club_identity.initials` (RCFC). It falls back to the
     club name.
   - It is hidden while no match has a result.
2. **Replay the Match**, for that same match.
   - It is an embedded YouTube player, the same size as Behind the Rose. The
     red/black matchup card is the click-to-play cover.
   - When the match has no replay, the card shows "Replay coming soon" and
     nothing plays. Christian decided Sam's graphic only illustrates the idea.
   - The embed loads only after a click. Only the stored canonical embed
     pattern is ever embedded.
   - Christian asked on 2026-11-04 for Sam's white "Watch on YouTube" logo
     (`RCFC YouTube website icon white 2027.png`, trimmed copy in
     `public/rose-city/icons/watch-on-youtube-white.png`) on the black side of
     the card in both states. The placeholder adds "Coming soon" under it. The
     same card is used on the Match Summary page.
3. **City of Roses**: when the list has items, an "Includes" label sits above
   it. The store note is hidden when blank. The copy itself is owner-edited
   Shop kit content.
4. **Footer logo**: when the owner sets a footer logo, it replaces the crest,
   name and tagline. When there is none, the footer falls back to today's
   crest and name.

## Owner editing

**Schedule editor (Result section, cinematic@2 only):** "Replay video (YouTube
link)".
- It accepts a watch, youtu.be, live or embed link, and stores
  `https://www.youtube.com/embed/<id>?rel=0`.
- Any other site is refused with a form message.
- A blank field clears the replay.
- The rule is defined in `lib/youtube-embed.ts`. It is enforced again on the
  admin data route (`lib/admin-data-contract.ts`) and by the
  `matches_replay_video_url_check` constraint.

**Homepage editor (Navigation part):** "Footer logo".
- PNG or WebP upload, a description, and "Remove footer logo".
- It is a fourth homepage artwork slot, `footerLogo`. The asset ID is held in
  `homepage_revamp_content.footer_logo_media_asset_id` (tenant FK plus media
  guard), and the JSON holds only the alt text.
- Save, load, snapshot media, foreign- and retired-asset rejection, cleanup
  protection, and retirement on replace or removal all follow the existing
  slots.
- Rows and saves from before this change have no `footerLogo` and still load
  and save.

**Shop editor:** jersey bullet points now allow up to 10. Christian approved
this, because Sam's list has nine. The limit is enforced in
`MAX_KIT_BULLET_POINTS`, the Shop editor contract and text box, and
`onzio_private.validate_shop_section`.

## Migrations (applied to the isolated local rehearsal only)

- `20261112100000_match_replay_video_url.sql`
- `20261112110000_cinematic_footer_logo.sql`
  - Adds the column, FK, column grant and guard trigger.
  - Redefines `check_cinematic_homepage`, `cinematic_homepage_json`,
    `validate_cinematic_homepage_row`, `homepage_snapshot` and `save_homepage`.
    The new definitions were generated from the newest ones with counted text
    replacements, so nothing else changed.
- `20261112120000_shop_kit_ten_bullets.sql`

`scripts/apply-rose-city-home-update-migrations-local.ts --execute-local`
applies them. It accepts only loopback 55321/55322, skips migrations already in
the ledger, and records each one. Before any hosted deploy, the CLAUDE.md
migration gate applies to all three.

## Local content

`scripts/seed-rose-city-home-update-2027-local.ts --execute-local`:

- runs only on the loopback rehearsal and the Rose City test tenant;
- publishes the RCFC sub-mark as the footer logo through the normal media
  pipeline;
- replaces the Home jersey copy with Sam's text and nine items, and blanks the
  store note;
- refuses to run if an owner has already set a footer logo or edited the
  jersey copy;
- checks that About, Crest, branding, hero and matches are unchanged.

Inputs and the receipt are in `assets/rose-city-home-update-2027/`.

No replay video was imported, so the placeholder shows. The latest local result
is the existing sample fixture (16 May 2026, AMSG FC 2–1, "Arcadia City Hall
Stadium"). That is owner data, to be replaced with the real 2027 fixtures in
Schedule.

## Waiting on Sam

- The sample score (1–0 with four listed events).
- The "OCFC" opponent and the Orlando City crest.
- "City of the Roses" vs "City of Roses" (seeded as Sam wrote it).

Red-card markers in the scorer line were not built; `scorers` holds plain text
only.

## Verification

See the HANDOFF entry for this date for the test and browser results.
