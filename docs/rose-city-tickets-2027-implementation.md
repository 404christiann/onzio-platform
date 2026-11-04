# cinematic@2 Tickets — approved implementation

RC2027-TICKETS source/local acceptance complete on 2026-10-13. User approved desktop/phone design and requested approximately15% larger perk icons, then implementation. Public: /tickets, stable navigation ID tickets. Editor: /admin/tickets, accessible from Homepage → Edit in Tickets. Existing sidebar hierarchy and other presentation versions are preserved.

The renderer uses the supplied ticket/banner, seat/card/raffle icons, bus, full bus/parking map and centered Chick-fil-A mark. Whole colored ticket is visible; bannerHeightFraction752/825 omits only its source's bottom blank strip. The map is nonclickable with no tap hint. Three equal perk columns align Pay Later under PERKS. Public prices/benefit headings explicitly avoid inherited uppercase/letter-spacing styles. Original image bytes/provenance stay in the outer archive.

## Content ownership
Tickets owns editable title/subtitle, perk heading/three labels, ordered benefit titles/details/footnote, transit/directions/parking copy, external purchase URL, inactive-link message, banner display fraction, seven artwork references and descriptions.
Homepage remains the single owner of ticket prices, match heading/button wording and empty-match announcement; existing homepage button stays /tickets. The approved Closest ball and PUSD students & staff corrections were applied to those shared rows through the narrow local seed.
Schedule remains the source of actual next HOME fixture/opponent/date/kickoff/venue. Fixture-free local data displays the honest announcement state; reference sample dates/opponents were not inserted.
Purchase uses the configured external HTTPS URL. The URL has not been provided; Buy Tickets remains inactive. Registration, Connect and subscription ownership are preserved.

## Storage and security
Migration20261014000100_cinematic_tickets_page.sql adds onzio.cinematic_tickets_content with independent revision, composite tenant/media foreign keys, homepage read/mutation policies and fresh template gating. Every referenced image is a published non-retired homepage graphic in the same tenant. Asset-row guards serialize references with retirement; the existing FK-scanning retirement routine automatically includes Tickets. Direct/legacy writes undergo the same strict content/media validation and advance revisions.

User-scoped invoker load/save RPCs use the existing lifecycle/session/member boundaries, advisory locks shared with design changes, design/revision conflict checks and actor-scoped operation hashes/receipts. Unknown body fields and client tenant/delivery URLs are rejected. Atomic saves write all changed Tickets fields together. Removed media cleanup follows confirmed saves through the existing reference-safe service boundary, preserving assets still used elsewhere.

The server API resolves the trusted hostname tenant, checks the fresh club session and membership, rejects cross-site mutations, uses the user client and returns no-store snapshots. Public route/query use trusted server onzio scope and only cinematic@2 dispatch; tenant-neutral defaults carry no club offers or media.

Recovery is local browser state scoped by origin/user/club. Partial purchase URLs can remain in an unsaved draft but cannot be published or used as a preview link. Ordered schema serialization avoids false dirty state from PostgreSQL JSON key ordering. Uncertain saves lock the draft and retry the exact request/operation ID; they do not rebase automatically. Optional browser-storage failure does not turn a confirmed save into failure.
Uploads use the existing homepage-artwork authorization → signed private staging → validation/finalization pipeline. Upload readiness blocks Save; alternate graphics reset banner clipping to100%. A new upload failure can be retried by selecting the file again. Descriptions are editable. The frame imports the real public renderer and uses phone/desktop frames; their tested inner content widths388/1278 account for the existing2px browser-frame border.

Shared changes: HomepageEditor adds one cinematic@2 shortcut using its existing unsaved-change go guard; HomepagePreviewFrame adds optional label with unchanged Homepage default. Existing admin-route-manifest is byte-identical to HEAD; existing Homepage saves/media recovery are untouched.

## Local publication and verification
Seven prepared PNGs and source hashes: assets/rose-city-tickets-2027/manifest.json. PNG preparation is lossless; the normal pipeline performs its single existing normalization. Chick-fil-A uses exact source rectangle132,590,805,181 without redrawing. Source seat is white/transparent; public CSS makes the perk silhouette black.

seed-rose-city-tickets-2027-local.ts refuses hosted API/database endpoints, requires55321/55322, checks the test tenant and refuses existing Tickets rows. It protects About/Logo/branding/hero/Shop rows, publishes through the normal media pipeline and checks all seven delivered SHA256 hashes. Tickets insert and the two approved Homepage copy corrections are one guarded local transaction. Existing media identities and unrelated content remain. Local receipt is ignored and is not a hosted-import command.

Final TypeScript, Next production build/lint and whitespace pass. Full isolated suite:208 files /1915 tests. New contracts cover unsafe URLs/strict schemas, tenant-neutral hydration, template route isolation, stale/design conflicts, direct-writer validation, actor receipts/replay, cross-tenant/retired media, reference-safe retirement, lost-response/exact retry and partial/recovered draft ordering. Original assertions were not weakened; exact sidebar tests passed after keeping the canonical sidebar unchanged.
Actual CUA public1280/390/320 checks: no horizontal overflow; eight page images loaded; larger icons and central Pay Later/partner; stable cropped banner; lowercase price/benefit copy; no map link; inactive purchase. Sticky header DOMtop0 at desktop.
Real desktop Subtitle and phone Benefits footnote changes saved/reloaded and appeared publicly; independent SQL verified both, then UI restored approved copy. Seven original Tickets media IDs remain unchanged. An unfinished https:/ draft recovered through reload and clearing it returned to All changes saved without publication. Actual editor phone/desktop preview labels/rendering verified.
Evidence: outer review-notes/tickets-2027/implemented/ browser-checks.json, persistence.json, recovery.json, editor-preview.json and public screenshots. Build/full-test logs: /private/tmp/rose-city-tickets-{build,full-tests}-complete.log. Browser viewport checks do not establish physical iPhone/VoiceOver acceptance.

No commit/push, hosted migration/content write, deployment or production launch. Existing protected static testing deployment still predates Tickets/Crest and was not updated. Production launch and site-wide physical-device/font acceptance remain held. Shop chat received the runtime/schema/build window after Tickets acceptance and owns further shared integration checks.


## 2026-10-13 — Single Match Tickets placement refinement

User requested closer reference placement for the seat background and the red
subtitle beginning just after the G in SINGLE. Tickets CSS only: move the seat
canvas down by its unused bottom margin (bottom -14vw; fixed -105px at phone
artwork height410px), align the desktop subtitle using MuseoModerno SING's
2.64em width, and retain centered phone copy. A smaller tablet clamp minimum
keeps the indented caption on one line without changing desktop/phone sizes.
The isolated review stylesheet mirrors this adjustment. No content, artwork,
schema, other sections or shared source changed.

Vite build and diff whitespace checks pass. CUA prototype1280/768/390/320
shows no horizontal overflow; desktop caption alignment error0.008px and
768px alignment error0px, both single-line. Seat legs meet the section boundary.
Evidence: outer review-notes/tickets-2027/implemented/placement-preview-checks.json
and placement-preview-{desktop,phone}.jpg. Shop completed the combined Next
build/restart with this stable CSS. Actual /tickets at1280 confirms the same
179.2px background shift, single-line subtitle,0.008px G alignment error, and
no overflow. Screenshot includes the seat legs at the section boundary:
placement-actual-desktop.png; measured evidence placement-actual-checks.json.
No runtime/viewport overrides, content writes or schema work by Tickets; Shop
retains its shared integration/full-suite window.
