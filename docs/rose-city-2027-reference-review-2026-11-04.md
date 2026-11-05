# Rose City 2027: comparison with Sam's references (2026-11-04)

The local app at `http://rose-city.localhost:3198` was compared with Sam's
originals in Dropbox (`/Rose City FC x Onzio 2027`), at 1440px and 390px.
No page scrolls sideways, and no images are broken. The evidence crops were
temporary and are not kept in the repo.

## Sam's references changed after implementation

These references match their local copies byte for byte: Tickets, Food &
Beverage, Robinson, the layout diagram, Lockers, Bus Route, Contact, Roster,
Club Partners and Partnership Opportunities. Four do not:

| Page | Built from | Current Dropbox file | New in Sam's file |
|---|---|---|---|
| Home | `references/homepage-final.png` | `Home page 1 2027 Final.jpg`, Oct 31 | Match result strip (RCFC 1–0 OCFC, scorers), "Replay the Match" YouTube section, rewritten City of Roses copy with a 9-item Includes list, RCFC sub-mark footer logo |
| Shop | `references/shop-2027/reference.jpg`, Oct 13 | `Shop page 5 2027.jpg`, Oct 28 | Full redesign: Authentic $115 / Replica $95, six-photo Jersey Details, four Jersey Information cards, attribute line, size chart, map |
| Schedule | `schedule-2027/reference.jpg`, Oct 13 | `Club Schedule website 2027.jpg`, Oct 30 | Summary and Rewatch columns; Directions moved under the venue |
| Crest | `references/crest-2027/reference.jpg`, Oct 13 | `Club Crest & Identity website 2027.jpg`, Nov 1 | Card 7, Sub-Mark (**done locally on 2026-11-04**) |

Sam needs to confirm these before anyone builds them:

- The score is 1–0 but four goal entries are listed.
- "OCFC" is shown with the Orlando City crest.
- The copy uses both "City of Roses" and "City of the Roses".
- The Shop detail photos show a Real Madrid crest and adidas details.
- Sam's Schedule says "EST"; Pasadena kickoffs are Pacific time.

## Content the owner will set in the admin portal (decided 2026-11-04)

Christian decided these stay as they are until the club enters the real values:

- **Schedule fixtures:** the local sample games are dated 2026, use the old
  "Arcadia City Hall Stadium" name, and the "next home" game is in Irvine. That
  is why every Next Home Match box shows Irvine.
- **Ticket purchase link:** Buy Tickets stays disabled ("Ticket link coming
  soon") everywhere except Home, which links to `/tickets`.
- **Crest Stem text:** still placeholder. Sam's file repeats the Key text.
- **"12AM AT MIDNIGHT" color label:** Sam's Dropbox color file is named
  "12am at Midnight", so it is left as is.
- **Roster:** players wear green kits where Sam shows red, and #13 and #23 have
  no photo.

## Decisions from Christian (2026-11-04, after the Home update)

- **About:** Sam approved the current page. There is no missing reference to chase.
- **Shop redesign:** build Sam's Oct 28 layout now. Show plain white boxes
  wherever Sam's file has Real Madrid photos, until Sam uploads the real ones.
  Prices become owner-editable in the admin portal, so the reference prices
  are not a blocker.
- **Match Summary:** it belongs under the existing Schedule content, not as a
  separate menu page.
- **News:** `/news` opens on the card list (`News page 12 2027.jpg`).
  Clicking a card opens its article, laid out like the Foothill article.
- **Match Summary placement and scope:** each finished match in Schedule gets a
  Summary link to its own page (`/schedule/<match>`). The first version builds
  every one of Sam's sections (timeline, statistics, match information,
  replay, lineups, bench, managers) with admin fields. Empty sections are
  hidden.
- **Season Tickets:** wait for Sam's design or explanation. It is not on the
  build list until then.
- **Injury Report:** use sample injury entries for now, since Sam's mockup
  repeats one player. The owner replaces them in the admin portal; the sample
  entries are local seed data only and must not be published as real.
- **References for the remaining pages** (all byte-identical to the copies
  archived on 2026-11-03 in outer `assets/originals/remaining-pages/`):
  Injury Report (`Injury report page 1 2027 Final.jpg`), News list
  (`News page 12 2027.jpg`), Foothill article
  (`News x Foothill Transit page 10 28 2027.jpg`), Match Summary
  (`Match Summary page 12 2027 1.jpg`) and Code of Conduct
  (`Club Code of Conduct website 2027.jpg`).

What the references show, and what is still placeholder:

- **Injury Report:** "Presented by MVMNT CULTR" header, then injury cards
  (player photo, name, number, position, injury, timeline, note), a photo band,
  a "Rehab with MVMNT CULTR" quote, and a YouTube video. The three cards are the
  same player repeated. The quote is filler text, and the MVMNT CULTR logo file
  is still missing.
- **News list:** five color-coded categories (Sponsor/Partner, Partner,
  Community, New Player, News), then numbered cards with a heading, title,
  image and category band. Every card reuses the Foothill title and image.
- **Foothill article:** fully written: title, subtitle, cover, category,
  date and four paragraphs, plus a "Partner with us" button. The date reads
  "Wednesday, Nov 20, 2026", but Nov 20, 2026 is a Friday.
- **Match Summary:** score header, YouTube link, an event timeline (goals,
  cards, substitutions), 16 team statistics, match information (officials,
  kit colors, attendance), the replay card, starting XI, bench and managers
  for both teams. The header says 1–0 but the timeline reaches 3–0; every
  statistic bar has the same split; every lineup row is "#18 A. Mendez"; both
  bench and manager columns are labeled RCFC; the title is spelled
  "Sumarary".
- **Code of Conduct and Stadium Guidelines:** the same accordion layout with
  the same text. Only Accessibility and Animals have answers, and Animals
  appears twice.
- **Season Tickets:** no reference file, no menu item and no route. The only
  public mention is "20% off season tickets" in the Home jersey list.

## Package plan

Each package follows the usual flow: accepted preview → implementation with
owner editing → local acceptance.

1. **RC2027-HOME-UPDATE** (implemented locally on 2026-11-04; see
   `docs/rose-city-home-update-2027-implementation.md`). Match result strip, Replay the Match, new City of
   Roses copy and Includes list, and a new owner-editable footer logo slot for
   the RCFC sub-mark. The footer slot needs a migration, an editor field and
   tests; Christian chose to fold it into this package. The result strip and
   replay should read from Schedule match data, not static copy. Christian
   decided on 2026-11-04 that the replay is an embedded YouTube player with a
   placeholder: Sam's matchup graphic only illustrates the idea. The isolated
   preview is at outer `design-explorations/home-update-2027/`.
2. **RC2027-SCHEDULE-UPDATE.** Summary and Rewatch columns. Depends on the match
   summary decision and the replay URL field from package 1.
3. **RC2027-SHOP-UPDATE.** The new Shop layout. Blocked on real jersey detail
   photos (Real Madrid placeholders) and Sam's confirmation of prices.
4. **RC2027-PARTNERS.** Move the accepted Club Partners and Partnership
   Opportunities previews into `/sponsors` and `/community/partnership`. Waiting
   on the MVMNT CULTR and color Modern Woodmen artwork; the bottom call to
   action on Partnership Opportunities is still undecided.
5. **Later, when Sam sends content:** News, Injury Report, Match Summary,
   Stadium A–Z, Code of Conduct, Know Before You Go, Season Tickets.

### Updated order (2026-11-04, after Christian's answers)

Each package still goes preview → approval → build with owner editing → local
check.

1. **RC2027-SHOP-UPDATE** (implemented locally on 2026-11-04; see
   `docs/rose-city-shop-update-2027-implementation.md`). Sam's Oct 28 layout,
   with white boxes in place of the Real Madrid photos and editable prices.
2. **RC2027-MATCH-SUMMARY** (implemented locally on 2026-11-04; see
   `docs/rose-city-match-summary-2027-implementation.md`), together with the
   Schedule Summary and Rewatch columns. A per-match page with every section of Sam's design.
3. **RC2027-NEWS.** The card list and article pages, with categories and an
   article editor. Foothill is the first real article.
4. **RC2027-INJURY-REPORT** (implemented locally on 2026-11-04 on branch
   `codex/rose-city-injury-report-2027`; see `docs/rose-city-injury-report-2027-implementation.md`).
   Injury cards taken from Roster players, with sample entries, plus the MVMNT CULTR quote and
   video fields.
5. **RC2027-POLICIES.** Stadium Guidelines and Code of Conduct as editable
   accordions, using the two answers Sam wrote.
6. **RC2027-PARTNERS** (implemented locally on 2026-11-04 on branch
   `codex/rose-city-partners-2027`; see `docs/rose-city-partners-2027-implementation.md`), then Know
   Before You Go and Season Tickets when Sam sends them.

### After Match Summary (Christian's plan, 2026-11-04)

Once Match Summary is committed, with Christian's OK, three packages run in parallel. Each gets its
own session and worktree, branched from that commit:

1. **News:** the card list and article pages. Foothill is the first real article.
2. **Stadium Guidelines and Code of Conduct:** they share one accordion layout.
3. **Partners:** Club Partners and Partnership Opportunities. Both previews are already approved.

Then Injury Report, which reuses Roster data, and the Robinson editor, which touches the same
stadium files as the policy pages.

Risks to manage:

- Christian reviewing several previews at once.
- Merge conflicts in shared files: `lib/database.generated.ts`, `HANDOFF.md` and migration
  timestamps.
- Every session sharing one local database and dev server on port 3198.

## Smaller visual differences (low priority)

- **Home:** the match photo rotates through seven shots (Sam shows one), and the
  partner strip shows more logos than Sam's four. Both are owner-driven.
- **Footer:** shows "© Rose City FC" plus Powered by Onzio; social icons are in
  X, YouTube order where Sam has YouTube, X.
- **Robinson:** Sam's mockup has blue seat highlights, but the only supplied
  diagram is the grayscale blank. The Stadium Info text is smaller than in the
  mockup.
- **Shop:** a React shorthand/longhand style warning shows as a dev-overlay
  "1 Issue".
