# RC2027-MATCH-SUMMARY: Match Summary page and Schedule columns

Status: implemented locally, 2026-11-04. Christian approved the isolated preview
(outer `design-explorations/match-summary-2027/`), including Sam's white "Watch on YouTube" logo on
the replay card, and asked for it to be built. Every change is local on
`codex/rose-city-homepage-2027`. Nothing was pushed, merged, deployed or written to a hosted
service.

Sources: Sam's `Rose City FC Match Summary page 12 2027 1.jpg` and his Oct 30
`Rose City FC Club Schedule website 2027.jpg`, archived in outer `assets/originals/`.

## Public pages (cinematic@2 only)

**Schedule.** The Schedule gains Summary and "Rewatch the match" columns.

- A match with both scores links "Match Summary" to `/schedule/<match id>`. Upcoming matches show
  no summary link.
- Each match has one optional YouTube link, `replay_video_url`. It is the livestream before kickoff
  and the replay afterwards, because YouTube keeps a livestream's link. The column links to the
  YouTube watch page using Sam's "Watch on YouTube" logo (white on the dark NEXT row). With no
  link, it shows "Stream coming soon" or "Replay coming soon".
- Directions now sit under the venue.

**Match Summary page.** The existing `/schedule/[fixtureId]` route gains a cinematic@2 branch that
renders `CinematicMatchSummaryPage` → `CinematicMatchSummary`. The page shows:

- the page heading, then the Home score strip and "Watch the match below or on YouTube";
- the timeline: goals with the running score, yellow and red cards, and substitutions, using Sam's
  icons;
- statistics as bars drawn to scale, with the higher value in bold;
- match information: stadium, location, date, kickoff and attendance, plus officials and kit
  colors;
- the Home replay card;
- starting XI, bench and managers for both teams.

Any section without data is hidden. A match not played yet shows "The summary … will appear after
the match" and a link back to the Schedule. Bold labels use Avenir Heavy, already shipped for the
Robinson page. Sam's icons are in `public/rose-city/icons/`; the originals are in outer
`assets/originals/icons-2027/`.

## Owner editing (Schedule editor, cinematic@2 only)

- The Result section's link field is now "Stream or replay video (YouTube link)".
- The new **Match summary** section contains:
  - Attendance;
  - Timeline rows: minute, team, type, player (or player on), and assist, note or player off. Rows
    can be moved up or removed;
  - Statistics: one click adds Sam's 16 standard statistics, or add your own rows;
  - Officials: one click adds the referee crew, or add your own;
  - Kit colors: one click adds jersey, shorts and socks;
  - each team's starting XI, bench and managers, typed one per line ("#8 J. Hernandez",
    "G. Morales - Head Coach").
- A blank summary saves as nothing.
- When the timeline has goals, `scorers` follows them, so the Home strip and the summary header
  agree (`matchSummaryColumns`).
- Attendance, the summary and scorers are sent only for cinematic@2 clubs, so other site designs
  never overwrite those columns.

## Data and rules

- `onzio.matches.summary` holds the summary as `jsonb`. Null means none.
- The rules are defined in `lib/match-summary.ts`. Both the admin data route
  (`lib/admin-data-contract.ts`) and the `matches_summary_check` constraint
  (`onzio_private.match_summary_is_valid`) enforce them.
- Limits:
  - 60 timeline rows, 24 statistics, 8 officials and 6 kit rows;
  - 15 starters, 15 bench players and 10 staff per side;
  - statistics between 0 and 100,000;
  - shirt numbers up to 3 digits.
- Stored summaries are read safely (`readMatchSummary`). A damaged value shows as no summary.

## Migration (applied to the isolated local rehearsal only)

- `supabase/migrations/20261104050000_match_summary.sql`. The validator checks each value's type
  before reading inside it, because SQL does not promise to evaluate AND/OR left to right.
- `scripts/apply-rose-city-match-summary-migration-local.ts --execute-local` applies it (loopback
  55321/55322 only).
- Before any hosted deploy, the CLAUDE.md migration gate applies.

## Local content

No summary content was seeded. The owner enters real summaries.

For the browser check, `scripts/sample-rose-city-match-summary-local.ts --apply` put made-up sample
data on the latest played local match (AMSG FC, 16 May 2026). `--remove` then restored it exactly;
afterwards no local match has a summary or attendance.

## Verification

See the HANDOFF entry for 2026-11-04 (Match Summary).
