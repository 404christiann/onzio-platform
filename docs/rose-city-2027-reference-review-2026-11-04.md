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
