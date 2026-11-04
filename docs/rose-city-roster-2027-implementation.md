# RC2027-ROSTER implementation

Status: **source/local browser acceptance complete**. Physical-phone/site-wide release gates remain open. Christian approved the roster reference, restored original modal, smoother desktop-only hover, then MuseoModerno/Avenir/red modal styling and implementation using27 active players with a zero-stat2027 season. No hosted rollout is authorized.

Actual app: http://rose-city.localhost:3198/roster. The isolated design review remains at http://127.0.0.1:3205/ for reference.

## Presentation and ownership

`app/(public)/roster/page.tsx` dispatches only `cinematic@2` to `CinematicRosterPage`; existing editorial, clubhouse and legacy branches are retained. The existing tenant route re-export and CinematicShell continue to supply one approved navigation/footer. `CinematicRosterPage` calls `fetchRoster(undefined, club.id)`, handles loading/error/empty states, ignores stale responses and clears the selected-player UI when the tenant changes. No static player data or forced zeroes are included in the renderer. Players/stats continue to be managed through the existing Roster, Seasons and Season Stats admin surfaces.

`CinematicRoster` groups Defenders/Midfielders/Forwards/Goalkeepers, sorts a copy by number, shows real nationality/hometown/captain/media data, and opens the existing `PlayerModal`. The optional `presentation="cinematic"` prop adds only a scoped styling class and an accessible dialog name; the original modal body, carousel, collapsible Bio/Season Stats, image fallback and other-template defaults remain. Scoped modal CSS applies MuseoModerno headings, Avenir details/numbers, roster red#ff0018 and neutral labels. Card photos use the existing raw-source ResilientImage and nationality mapping. No optimizer/remote image transformation or library installation.

Desktop hover requires width≥1025px, hover:hover and pointer:fine. Fixed overlay layers use260ms transform/200ms opacity transitions; rapid reversal retargets. Keyboard focus reveals instantly; phones/tablets tap directly into the original modal without hover movement. Reduced motion removes positional transitions. Escape and focus return are verified.

All new roster classes are scoped under `cinematic-roster` with `squad-` child names. Actual browser verification found Clubhouse's unscoped `roster-page` color variable/pseudo-header and `roster-group` padding would override the approved design. Unique classes eliminate that collision without modifying old styles. A regression assertion prevents reintroducing either root/group class. No global CSS resets were added.

## Local roster/season rehearsal

`scripts/seed-rose-city-roster-2027-local.ts` is a narrow local-only importer; `lib/rose-city-roster-import.ts` builds/validates its plan. It requires explicit execution/source arguments, exact loopback API55321/DB55322, the existing Rose City **test** tenant, the reviewed source project and an empty target roster/season area. It refuses populated rosters, duplicate/existing media identities, cross-tenant/malformed relationships and hosted destinations. No broad tenant seed/reset, schema migration, generated-type edit, membership/billing edit or hosted write.

Read-only source snapshot: outer `assets/roster-2027-source.json`. Existing source records/media remain untouched. Local preparation carries33 canonical player identities (27 active,6 inactive), two existing action-photo identities, one historical2025–26 season,30 historical field-stat rows and3 historical goalkeeper-stat rows. It adds a2027 calendar-year season (start/end2027),24 active field-player stat rows and3 active goalkeeper stat rows with **every numeric stat zero**. 2027 is active only in the isolated local app;2025–26 remains selectable/inactive locally, with aggregate rows byte-equivalent as JSON to the source. Historical fixtures/match-detail rows are outside this narrow roster import and remain in the unchanged source project; this is not a full-club migration or cutover.

Source already-normalized media (33 profile assets,2 action assets,6 flags) is copied byte-for-byte into local public storage, retaining existing UUID paths/checksums/dimensions. Public URL origins become loopback; source creator references are replaced by the existing synthetic local actor. All41 signatures/dimensions, incoming hashes, delivered hashes and media ledger entries are checked. Originals are retained in outer `assets/originals/roster-2027/`. No recompression/recoloring/generated photography. Every other existing media record is preserved.

The roster/stats insert is one serializable transaction with an advisory lock and a second emptiness check. Failed transactions roll back and clean up only their newly created local objects. Before/after digests cover unrelated Onzio tables and exact existing media rows. Receipt: outer `review-notes/roster-2027/implemented/local-import-receipt.json`. A second execution was verified to refuse the populated roster without writes.

## Acceptance evidence

- Final Next production build (including lint/type check), independent TypeScript, ESLint and whitespace checks pass. No assertions removed or weakened.
- Full isolated regression suite: **224 files / 2,004 tests pass**, including existing completed Chick-fil-A/Stadium/Shop/Tickets/Crest contracts. The new pure renderer test stubs only the unused branding query to avoid initializing a browser Supabase client in Node20; the actual app still uses the real query and is browser verified.
- Independent SQL comparison confirms exact preservation of all30+3 historical aggregate rows,27 matching active player/new-season identities,24+3 zeroed new rows, correct season activation and41 published media ledgers. `database-verification.json` records it.
- Actual CUA1280/390/320:27 cards, group counts9/10/5/3, loaded fonts, no horizontal overflow, zero stats,27 loaded portraits/flags, loopback raw media, original carousel action→profile navigation, new modal font/red treatment, Escape/focus return and clean long-name wrapping at320. Desktop hover enters/exits with260ms movement; phone cards have no hover transform/details. Browser error log is empty.
- Source preservation audit:179 pre-existing dirty/untracked files checked; this roster task made no unrelated source edits. Existing shared docs are preserved with append-only roster notes. A subsequent concurrent Schedule change adds only league-logo mapping/bucket entries to the previously recorded admin client; removing those two additions in memory exactly reproduces its baseline hash. The Schedule chat confirms ownership of these newer changes; they remain intact.

Evidence: outer `review-notes/roster-2027/implemented/` includes receipts, database/browser/preservation JSON, desktop/mobile/modal/hover screenshots and `desktop-mobile.jpg`. Logs: `/private/tmp/rose-city-roster-complete-{build,tests,types,lint}.log`. React review checked component/data separation, tenant response cleanup, immutable sorting, accessible buttons/dialog name, focus restoration, existing image fallback and motion gating.

## Release boundary and next step

The combined final app is served locally on3198. No commit, push, hosted data/schema/storage change, preview deployment or production launch. The existing protected static phone preview still predates these later pages. Physical iPhone/Safari/VoiceOver and overall site release gates remain open; browser viewport checks are not physical-device acceptance.

Next: user review of the actual roster, then separately authorized site-wide release preparation. Reconcile current source data for any hosted migration; preserve old matches/match stats and every existing club/public/admin/billing record through the established full migration/release process. Do not run this local-only script against hosted infrastructure or republish a stale public-data snapshot as a full production migration.


## Concurrent work after the verified roster snapshot

New Schedule and About implementation chats became active after the roster build/tests. Read-only chat inspection confirms Schedule owns league/opponent/sponsor admin integration, has captured roster file/table hashes, will preserve roster/season activation and plans a separate verification server. The existing roster build on3198 is left running without another restart. Roster acceptance above applies to the tested snapshot; fresh combined verification of these later changes belongs to those active integration tasks. Shared lib/admin-client.ts gained only two league-logo entries compared with this task's baseline; no roster-task edit was made to that file. Preservation JSON records the concurrent change separately. Do not revert other workers' source or reset the imported roster.


## 2026-10-13 — Actual admin add/edit persistence acceptance

Follow-up to Christian's question: initial roster acceptance did not exercise admin add/edit. This follow-up now verifies the actual authenticated portal on3198 with the existing synthetic local owner, real server-mediated admin API and isolated Supabase55321/55322. No app-source change or runtime restart was needed.

A disposable Midfielder was created through Add player → Save player. The portal automatically inserted a zeroed field-stat row in active2027 and the new card appeared in the public roster. Name, jersey number, hometown, Bio and Captain were edited through Save changes, persisted after admin reload, and appeared in the public card/modal. A temporary Goals2/Minutes90 save through the actual season-stat editor persisted and rendered publicly, confirming the new presentation reads live values.

A disposable Goalkeeper was created at390×844 through the same portal; it received a zeroed goalkeeper-stat row in2027 and appeared publicly. Phone-viewport Hometown/Bio edits saved through the fixed Save changes footer, survived admin reload and appeared in the public modal. Admin and public console error lists were empty. This is browser-viewport evidence, not physical-phone/keyboard/VoiceOver acceptance. Photo/action-photo upload was not exercised in this follow-up.

Both exact QA player IDs and their new-season aggregate rows were removed with a guarded local cleanup. Independent final SQL confirms all33 original players, both seasons/activation flags, two action-photo rows, all54 field and6 goalkeeper aggregate rows and all41 imported roster/flag media records are exactly unchanged from the pre-test baseline. Public roster is back to27 cards, with zero remaining QA cards. Concurrent About media additions/status changes were retained; no unrelated media cleanup or database reset occurred. Production and other agents' source were untouched.

Evidence is in outer review-notes/roster-2027/implemented/: admin-persistence-verification.json, admin-{before,added-field,added-gk,edited,restored,final}-database.json, admin-add-player-phone.png, admin-edited-public-modal.png, admin-stats-public-modal.png, admin-phone-edited-public-modal.png and admin-restored-desktop.png. No new implementation or regression defect was found. Next step remains local user review and separately authorized site-wide release preparation.
