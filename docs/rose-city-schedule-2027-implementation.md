# Rose City 2027 Schedule

Package RC2027-SCHEDULE: implemented and verified locally.
Physical-device and production release gates remain open.

Public: http://rose-city.localhost:3211/schedule
Admin: http://rose-city.localhost:3211/admin/schedule
The independently built runtime is /private/tmp/rose-city-schedule-runtime.
Shared3198 and other agents' servers were not restarted. The static design
reference remains at http://127.0.0.1:3206/.

## Behavior

cinematic@2 dispatches to CinematicSchedulePage/CinematicSchedule; other
templates retain their existing renderer. The public page reads the active
season and its actual tenant-scoped fixtures. It uses the club identity zone
for Next and kickoff labels, including away fixtures and DST, and excludes
completed results from Next. Loading/error/retry and empty-season states are
honest. No hardcoded2027 season, opponent, sponsor, or UPSL image is shipped
in the renderer.

Approved white shadowed cards, soft gray header separator, right-aligned
Schedule heading, twelve-pixel badge gap, spaced score hyphen, directions,
dark Next card and sponsor-below-card placement are preserved. Mobile hides
decorative numbers; desktop keeps them. CSS is scoped to cinematic-schedule.
Four fixtures initially display. When more exist, Load more matches appends
four in stable chronological order, announces the visible count, moves focus
to the first newly revealed card without forced scroll, and disappears at
the end. No arbitrary season-length limit. Exactly four or fewer published
matches have no inactive/misleading Load more button.

## All three logo types are editable

Opponent and sponsor upload/replace/remove keep the existing Schedule form,
mutation API and media owners. New per-match League logo uses the same
authorized graphic pipeline on Schedule, with PNG/WebP inputs, published
immutable asset IDs and native source delivery. The admin label appears only
for cinematic@2, which renders it; no dead field is added to other templates.
Competition supplies its accessible label and text fallback on removal.
Opponent removal falls back to its crest monogram; sponsor removal hides the
Presented by line. The sponsor name remains required when its logo is set.

Migration20261014011304 adds nullable league_logo_url/league_logo_asset_id to
matches, a bounded image URL check, composite club/media foreign key, and both
asset and URL retirement guards. Existing RLS/grants and authenticated
server-mediated mutations remain. Catalog-driven reference retirement
recognizes the new FK/URL automatically. Admin upload mapping attaches the
published asset UUID; clearing the URL clears that reference. Admin/public
reads hydrate all three saved media references consistently.

## Local data and preservation

The existing roster-owned active2027 season is reused; Schedule creates or
activates no season. A guarded Schedule-only seed copied the approved three
old results plus upcoming AMSG fixture and published nine reviewed logos
through the normal pipeline on55321/55322. Dates, times, results, home/away
and venues are retained as temporary review content, not official2027
announcements. Source historical data was never changed. Repeat import refuses
a populated schedule. Receipt and source hashes are recorded.

No roster source files were edited. Final exact hashes match all seven
protected roster files; player/profile/photo/season/field-stat/keeper-stat
digests match the starting baseline. During verification the roster agent
independently added its QA Field/Keeper records; read-only chat inspection
confirmed their ownership. They were left intact, and the final check passed
after that agent removed its test data. No roster rollback/reset occurred.

## Verification

- Final isolated Next build, TypeScript and lint pass. Existing Supabase Edge
  process.version warning remains. Generated matches types exactly match the
  isolated schema; only that type block was updated, preserving other WIP.
- Full suite226 files/2010 tests passes. Existing assertions are unchanged.
  New contracts cover13-game first-page rendering, timezone/away Next logic,
  actual stored media, removed-image fallbacks, empty state and stable ordering.
  Local SQL tests reject foreign/retired league media and unsafe URLs and
  verify shared-reference detection/removal.
- Actual admin desktop replaced all three logo types, saved and reloaded;
  public delivery URLs changed to the saved assets. Phone admin removal,
  Save and public reload cleared all three and showed their honest fallbacks.
  Phone uploads restored the approved artwork through the real editor.
  Independent SQL and twelve delivered checksums confirm the final art.
- A temporary13-game Schedule exercised keyboard batches4→8→12→13,
  unique identities, live counts, focus restoration and final button removal.
  Desktop mouse activation also passes. The exact nine acceptance rows were
  removed; the four approved fixtures remain. Actual1440/390/320 layouts
  have no horizontal overflow; mobile numbers are hidden and images load.

Evidence: outer review-notes/schedule-2027/implemented/ includes replacements,
mobile removals, pagination, media/roster preservation, import receipt and
screenshots. Logs: /private/tmp/rose-city-schedule-{build-isolated-final,
full-tests-final,lint}.log.

Runtime note: one final build was mistakenly launched in the shared checkout
and had finished before its stop was attempted. It edited generated build
output only; no roster source changed, and shared servers were not restarted.
The final Schedule artifact was built and restarted only in its independent
runtime. Concurrent About implementation is preserved and outside this
tested Schedule snapshot.

No commit, push, hosted schema/content/media write, deployment, or production
launch occurred. Next: user review/physical-phone acceptance, then a separately
authorized hosted rollout applying this migration and normal reviewed media
publication. Preserve other agents' completed and ongoing work.
