## 2026-10-13 — Shop implemented (RC2027-SHOP)

Status: source/local browser acceptance complete; physical-phone and production gates open.
Approved Shop preview is implemented at /shop and /admin/shop for cinematic@2.
Shared public/admin renderer preserves reduced lead zoom, tight six original red
players, Home/Away, purchase cards, approved map crop and existing sponsor carousel.
All page content/images/framing/visibility have admin controls; sponsor logos use
the existing Sponsors editor. New settings extend the existing atomic Shop save,
revision, receipts/recovery and reference-safe media contracts; Homepage remains
separate. Guarded local seed publishes15 assets and protects unrelated content.
Actual desktop/phone Save→reload→public checks, real map replacement/conflict rebase,
player reorder/restore,15 delivered hashes, types/build/lint and1933 tests pass.
Details/evidence: docs/rose-city-shop-2027-implementation.md and outer
review-notes/shop-2027/implemented. Tickets chat coordinated all shared windows;
its final source and Safari/poster/Crest dirty work are preserved. No hosted writes,
push or deployment. Next: user review; physical-phone and site-wide release gates.

## 2026-10-13 — Crest implemented (RC2027-CREST)

Christian approved the final reference/mobile single-line preview and requested
implementation. Local public page /club/logo and admin About → Club Logo now
share CinematicCrest for cinematic@2. Legacy renderer/other templates remain.
20 exact source-derived graphics were published normally on isolated55321; narrow
seed refuses existing content/hosted endpoints and verifies unrelated rows.
All feature descriptions and artwork use the existing atomic Logo edit contract.
Annotated diagram is a replaceable image; fixed generic heading/subtitle has an
explicit ownership notice in admin. Stem placeholder is approved. No schema or
recovery/tenant/media-identity change. Stable map/color geometry and direct native
image delivery retain the approved layout without lazy-image shifts.

Status: source/local browser acceptance complete; physical-phone gate open.
Types/build/lint,204 files/1874 tests,20 media validations/delivered checksums,
actual1280/390/320, six aligned/untruncated phone rows, actual menu→Crest and real
desktop/phone Save/reload pass. Placeholder restored; final DB query confirms
feature/media identity and separate About preservation. Evidence:
outer review-notes/crest-2027/implemented; asset provenance/receipt/verification:
assets/rose-city-crest-2027. Actual rebuilt app remains at3198. Existing protected
static preview still has its Crest placeholder; no hosted deployment was updated.
Safari/poster dirty work and production hold are preserved. Next page awaits
Christian's choice; physical iPhone and full-site release checks remain open.

## 2026-10-13 — Crest page reference preview (design_review)

Christian supplied the Crest/Identity2027 JPG and Dropbox Our Identity folder;
all30 originals/metadata/checksum receipts are preserved in the outer workspace.
Responsive isolated review: http://127.0.0.1:3200/ with Desktop/Phone/reference
controls. Actual approved cinematic header/footer are reused, with no backend
or application change. White annotated crest and six feature cards lead into
the original dark Pasadena map/color graphics. Phone uses readable stacked
feature copy and two color columns. Christian approved placeholder Stem text
because it will be editable in admin. No new club history/symbolism invented.

Build and CUA1280/390/320 overflow/assets/font checks pass. Evidence/implementation
boundaries: outer design-explorations/crest-2027/README.md and review-notes/crest-2027.
Existing atomic Logo editor permits24 features/six color cards; preserve its
receipt/recovery/tenant/media contracts when implementing cinematic@2 dispatch
in both public renderer and AboutPageCanvas. Page heading/diagram-label authoring
needs an explicit implementation decision. Application implementation awaits
review; existing Safari/poster dirty work, hosted preview and production hold stay.

## 2026-10-13 — Safari review and image-quality audit; hardware gate remains open

Christian requested final iPhone/Safari review and an image-quality explanation,
then a handoff to work on the next page in a new conversation. Accepted baseline
is local commit2f70087 on codex/rose-city-homepage-2027. Review fixes below are
uncommitted; preserve them. No new conversation has been created or next page
chosen. Production launch remains explicitly held.

Native Safari tested in Xcode Simulator iPhone17/iOS26.5 on the exact public
phone bundle: native video visibly loops inline without controls, white menu
opens, Club drill-in and Back/Close work, pointer opening has no black close
outline, keyboard opening retains its necessary outline. Landscape rotation
reproduced hamburger overlap with the cutout. Scoped cinematic CSS now uses
max(gutter, env(safe-area-inset-left/right)) for header/dialog header/content,
with20px default/16px narrow gutters, and100 percent WebKit text-size adjustment.
Landscape header and Close now clear the cutout in native Safari screenshots.
Tenant generateViewport adds cover and white theme ONLY for cinematic@2;
actual Next DOM confirms the resulting meta and loaded higher-res poster.

Hardware acceptance remains OPEN: a paired physical phone is available, but
Mirroring is at its setup screen. Setup/privacy/auth settings were not changed.
A user question requested the physical Safari checklist and which images are
blurry; no answer had arrived at this record. Simulator native scroll/drag
input did not move the page, so touch scrolling, address-bar collapse, landscape
inner scrolling and VoiceOver are not claimed. Chrome viewport/source checks
cover sticky/overflow behavior separately. Skill mobile-native explicitly says
Test on hardware before calling it done. Do not relabel Simulator as physical.

Image audit: six original match photos are1200x670; photo1 is1500x837. Delivered
sizes match, so detail is already limited in the supplied originals. At1280 CSS
pixels/DPR2,1200px images have47 percent of ideal pixel width. On390px/DPR3, the
approved mobile1.2 crop has69 percent of ideal vertical detail. Preview assets
are WebP92 then normalized again to WebP82. Avoidable extra compression is a
contributor; larger photographer exports plus a single normalization pass are
the proper next quality step. Do not synthesize missing detail or silently
change approved cropping. Ticket original1800x791 is also limited at large
Retina desktop sizes; raffle2264x3000 and player1500x2068 have more headroom on
phones. Logo PNGs have adequate density. Hero is native1280x720 MP4; higher
source/delivery work is separate and no Bunny configuration changed.

Official same-episode maxres poster fetched/visually verified at1280x720 instead
of480x360, SHA2560c280a7a9ccbfeba7151217719db1a0fe5d6fb0571a8d86fb059005b988be872,
119139 bytes. Original low-res poster retained. Source input/provenance/manifest
and normal validator updated; all30 pass. Only this poster was published through
the real media pipeline on isolated local Supabase55321. CAS-protected row
update verified every other content column unchanged. Script:
scripts/update-rose-city-episode-poster-local.ts --execute-local. Seed uses the
poster checksum in its upload identity to preserve immutable media versions.
Actual app and hosted preview load1280x720. No hosted database write or global
media-normalization change. Prepared source provenance remains outside app in
workspace assets/additional-provenance.json; bundle/input/receipts are in repo.

Protected testing Preview / READY: https://onzio-platform-r5fw865f3-404christianns-projects.vercel.app
Deployment dpl_BoyYYLthzmxMg9hoHqYWqqMAJNom, protection unchanged. Fixed public
content/temporary destinations,51 output files, zero functions/credentials;
not full backend acceptance. Actual rebuilt app: http://rose-city.localhost:3198/.
Final TypeScript, Next production build,202 files/1870 tests, bundle check/build,
actual30-input validator and whitespace pass. Native/hosted captures and audit
JSON: workspace review-notes/iphone-safari-review/. Production preservation:
phone-testing/safari-review-preservation.json. No push/merge/production launch.

Next-conversation handoff: use this isolated checkout and existing branch;
read this section, AGENTS.md and docs/rose-city-2027-implementation.md. Preserve
white sticky navbar, ALL CAPS/Avenir, compact red desktop dropdowns, white phone
menu, transparent blue/white Foothill marks and the uncommitted review fixes.
Do not use the dirty original Downloads checkout. Next page is Christian's
choice; present an isolated responsive design before material new page changes.
Keep the open physical-phone checklist and larger-photo-source request visible.
Before launch: remaining content/copy review, temporary destinations, LEMON MILK
evidence, complete app acceptance and separately authorized hosted rollout.

## 2026-10-13 — Accepted white sticky navbar, local commit requested

Christian accepted the restored white sticky header and asked to commit it.
Commit scope: actual navigation/style changes, approved icon sprite and license,
transparent blue/white Foothill PNGs and provenance, regression contracts,
font-input exclusions and current implementation/testing handoffs. No push,
merge, production launch, domain assignment or hosted data change authorized.
The existing verified result remains202 files/1870 tests, TypeScript/Next build,
artifact check/build/scan and desktop/phone viewport verification. No runtime
changes after those checks. Supplied Avenir confirmation is retained; its
local-only file is still excluded from this commit under the established
production packaging boundary. Protected phone artifact includes confirmed
Avenir. Production packaging is a later explicit release-preparation step.

Homepage structure and editor are implemented: hero, raffle, real Schedule
next-home card, prices, ticket/map artwork, seven photos, championship,2027
jersey/player, episode, sponsors and footer. Remaining homepage acceptance:
final physical-phone/Safari review of current white sticky navigation and
scroll/menu/video behavior; review2027 prices/raffle/sponsors/fixture and copy
(including imported Closet ball wording); finish destination content where
cinematic version2 still renders temporary pages; confirm remaining LEMON MILK
commercial-use evidence. Confirmed Avenir does not need to be requested again.
Full application/backend destination testing is separate from the static
phone artifact. Final release preparation must preserve existing Schedule,
Shop, social destinations and tenant/media identities; production stays held.

Exact next step: content/copy review and physical-phone feedback, then complete
remaining destination pages and full-application acceptance before any launch.
This section supersedes historical navbar directions below.

## 2026-10-13 — Restored white navbar, sticky desktop and mobile

Christian rejected the floating transparent/docking direction and requested the
prior white header, retained transparent Foothill artwork, a blue-text version,
and sticky navigation. Restored the approved hybrid CSS proportions with a
white sticky top0 header in normal flow (desktop clamp140–196px; phone88px plus
safe-area). Removed hero-overlay/glass/docking layout, state, animation, and
scroll/observer hooks. Homepage hero returns to original proportions. Kept ALL
CAPS desktop labels and Avenir navbar/dropdown, title-case Robinson Stadium,
compact red rounded dropdowns264px/334px stadium, white phone dialog, licensed
icons, hamburger/dropdown motion, keyboard/Back focus and touch outline fix.

Exact original Foothill SVG renders to2432x400 RGBA PNG with transparent exterior
and blue lettering; no geometry or emblem edit. Source blue SVG, PNG, provenance
in workspace assets/prepared/foothill-blue.*; app/public and testing/public use
images/cinematic/foothill-blue.png. PNG SHA256
8a1fc50faf320b1567ee3c04699af8627d1551c09580ae76e1f5df5ebd995754;
712845 transparent pixels, matching white variant. White SVG/PNG retained for
future use. Rose City/Foothill brand guard retained; other partners/tenants keep
configured sources. Both header and white phone menu use transparent blue mark.

Sticky header exposed Next route scroll retention: clicking Schedule from a
scrolled Home left its heading partly behind the header. Pathname-change effect
now resets owner-window scroll instantly for a changed route without a hash,
preserving initial load and hash behavior. Actual Next browser reproduction
now shows scroll0, header bottom173.8125, heading top340.8125 after navigation.

Protected testing Preview / READY: https://onzio-platform-cg8nuyf12-404christianns-projects.vercel.app
Deployment dpl_GKDKqwizUUBQeCjYff4EpyZMhKwB. Fixed-public-content testing artifact
still uses temporary destination pages, zero backend functions/credentials;
50 output files include both logo variants. Existing Vercel Authentication
retained. Actual rebuilt application remains http://rose-city.localhost:3198/.

Verification: focused8/8, final isolated full202 files/1870 tests, TypeScript,
Next production build, Vite check/build/scan and whitespace pass. Browser1280
and1025 confirm sticky header top0 when scrolling, exact white background, no
logo/nav overlap, loaded blue derivative, Avenir and title-cased Stadium entry.
390/320 preserve white phone menu, no touch close outline, blue transparent
mark, Back focus and no horizontal overflow. Hosted desktop/390 verified;
screenshots in review-notes/navbar/white-sticky/. Physical-phone acceptance
remains Christian's review; viewport checks do not establish real-device feel.

Production id/aliases/framework/protection unchanged, recorded in
phone-testing/white-sticky-preservation.json. No push/merge/production launch,
domain assignment, or hosted database write. Next: phone/desktop review of this
protected URL, continue finishing the site, hold production until explicit
approval after completion. Previous transparent/docking records below are
historical and superseded by this section.

## 2026-10-13 — White Foothill mark and animated scroll docking

Implemented the requested follow-up in actual CinematicNav and scoped CSS.
Foothill lettering is white with a transparent exterior; original blue emblem
and every SVG path geometry remain exact. The original SVG and derivative SVG/
PNG plus pixel/provenance evidence remain in workspace assets/prepared. PNG
SHA256 30e16506d7201ed7cf798406876d9847d7bb0903f6e458bd92c219e8c04726e3
is copied to public/images/cinematic/foothill-white.png in app and testing bundle.
The derivative is restricted to Rose City's configured Foothill Transit mark;
other tenants/partners retain their configured asset. White phone dialog keeps
the original blue lettering. No CSS inversion or generated logo geometry.

Desktop labels are ALL CAPS; both navbar and dropdown text use CinematicAvenir.
Stock stadium dropdown text is exactly Robinson Stadium; custom edited wording
remains editable. Existing compact red rounded panels and white phone menu,
licensed icons, native modal, Back/focus and pointer close-ring fix remain.

After 120px of desktop scrolling, logos dock into the ends of one glass capsule;
returning below 64px restores the large crest beside the central pill. Docked
crest48px, capsule76px; top crest112px / compact desktop96px retained. Secondary
pages start docked in normal flow. Owner-window listeners are cleaned up. FLIP
animates transform only over240ms with shared ease-in-out, including the glass
surface; current visual bounds support interrupted reversal. Keyboard is instant;
reduced motion uses only a150ms surface fade. These preference branches were
source-checked, not tested on physical hardware. Resize cancels/snap-remeasures.
Font-ready measurement keeps glass aligned with Avenir. Hero-end tint preserved.

Protected testing Preview / READY:
https://onzio-platform-9ir9h18y5-404christianns-projects.vercel.app
Deployment dpl_8XD89C82UcJ8f2wqwc9W2AHUESXM. Vercel Authentication retained.
This fixed-public-content artifact has temporary destination pages,49 output
files, zero functions/database credentials; full backend acceptance is separate.
Actual rebuilt Next.js app remains at http://rose-city.localhost:3198/.

Verification: focused8/8; isolated full202 files/1870 tests; TypeScript, Next
production build, Vite check/build/output scan, and whitespace pass. Initial
sandboxed full-suite attempt was blocked by loopback EPERM; rerun with local
network access passed. Browser1280/1025/390/320 checks confirm docking/reversal,
no overlap or phone overflow, loaded white derivative, unchanged264x334 Stadium
panel with all8 links, computed Avenir/casing, white phone menu/original mark,
no touch close outline, Back focus restoration. Actual Next Home and loaded
Schedule verified (heading175.5px clears header96px). Hosted desktop/390px checks
pass with no browser errors. Screenshots: review-notes/navbar/scroll-docking/.

Production deployment, aliases, framework and protection unchanged, recorded in
phone-testing/scroll-docking-preservation.json. No push/merge/production launch,
custom-domain assignment or hosted DB write. Next: Christian reviews this
protected URL on a physical phone and scroll feel on desktop, continue finishing
the site, keep production held pending completion and explicit launch approval.

# Rose City 2027 approved homepage implementation

## 2026-10-13 — Approved transparent pill implemented, larger crest

Christian selected MVMNT-inspired Logos beside the pill and requested a
slightly bigger Rose City logo. Actual CinematicNav and scoped CSS now use
independent logos beside a translucent centered navigation capsule. Desktop
crest112px vs selected study96px (17 percent larger); compact desktop96px.
The154px Foothill mark remains original artwork on a translucent light plaque.
Avenir, red/black/white colors, all route identities and editable labels remain.

Header floats over the homepage hero, with owner-document IntersectionObserver
increasing capsule tint over lighter content. Secondary pages retain a sticky
header in normal flow, with darker glass and readable labels. Native Bunny
video delivery remains unchanged; hero proportions/scrim follow the approved
transparent study. Phone closed header is transparent over the hero; approved
white dialog,72px/64px closed-header crest, logos, icons, drill-in/back focus,
240ms menu animation and pointer close-ring fix are preserved. Desktop red
menus remain264px /8px padding /38px rows /14px text, Stadium334px with8 links.

Protected testing Preview / READY: https://onzio-platform-dnec5gs12-404christianns-projects.vercel.app
Deployment dpl_BtwXSsuF8nFYkHqV4nVnk4vBht6J; Vercel Authentication retained. This is the
fixed-public-content phone-testing artifact with temporary destination pages,
not full backend/admin/payment acceptance. Updated actual local Next.js app is
running at http://rose-city.localhost:3198/ (PID15074 when restarted).

Verification: focused6/6, isolated full202 files/1868 tests, TypeScript, Next
production build, artifact check/build/scan (48 files, zero functions/credentials)
and whitespace pass. Local actual React checks1280/1025/390/320 confirm larger
crest, no overflow/overlap, scrolled tint, red Stadium geometry and all8 links,
white phone dialog/no touch outline, subgroup heading/Back focus/Escape. Actual
Next Home and fully loaded Schedule checked; heading295px clears header148px.
Hosted desktop/390px checks confirm loaded logos/native video, larger crest,
white mobile menu, pointer focus rule and no browser errors. Evidence:
review-notes/navbar/implemented-mvmnt/. Physical phone review remains Christian's
next acceptance step; browser viewports are not physical-device acceptance.

Production id, aliases, framework and protection unchanged, verified against
fresh before/after project reads in phone-testing/transparent-pill-preservation.json.
No push, merge, production launch, custom-domain assignment or hosted database
write. Next: test this protected URL on the phone, finish the remaining site,
and keep production held until completion plus separate explicit approval.

## Initial implementation record

Branch: `codex/rose-city-homepage-2027`, based on `origin/main` at `f91616c`. The unrelated OTP checkout remains untouched. User approval covers implementation and a local commit; no push, merge, deployment, hosted migration, hosted content write or billing/lifecycle change is included.

## Delivered scope

The approved isolated desktop/phone preview is implemented as reusable `cinematic@2`. Existing presentation versions keep their renderers and defaults. The new shell carries the aligned white navigation/Foothill treatment, click/keyboard menus, responsive phone drawer, control-free muted inline looping Bunny hero, whole nonclickable raffle/ticket artwork, editable matchday copy/prices, seven automatically rotating match photos, championship section, supplied 2027 floating player, existing episode source, white rotating sponsor strip, colored socials and fully opaque Powered by Onzio link to `https://onziofutbol.com/`. Public hover effects remain absent. Sponsors pause on keyboard focus, motion honors reduced motion and page visibility, and touch/keyboard slideshow interaction remains available without visible controls.

Next Home Match reads the actual next upcoming HOME fixture from Schedule in the club timezone. No reference/sample fixture, opponent or match sponsor is fabricated. An empty Schedule renders the approved editable announcement state. Buy Tickets initially points to `/tickets`.

All new destinations use temporary pages. Existing roster, schedule, shop, club and sponsors handlers remain intact; Contact and Tryouts get temporary pages specifically for version2 because their previous handlers support other templates. Labels have stable IDs and keep their URLs when renamed. Raffle and ticket are plain images publicly; the editor can replace them and show/hide the ticket/map. Additional editable copy, ownership, atomic save, conflict, recovery and media guarantees are detailed in `docs/rose-city-cinematic-content-contract.md`.

## Reviewed inputs and local rehearsal

`assets/rose-city-2027/manifest.json` carries source identities, revisions, checksums, dimensions and processing notices. It contains 30 reviewed portable raster inputs; the local importer publishes the 22 needed upload assets through the existing validator, normalization and publication pipeline. Code-native social marks and the existing Onzio wordmark use established public assets. The supplied raffle was proportionally prepared within the unchanged 3000px graphic limit. Artwork replacement accepts PNG/WebP under the existing 5MB/3000px limits; alpha is preserved.

`node --env-file=.env.local --import tsx scripts/seed-rose-city-2027-local.ts --execute-local` rehearses only on a loopback Supabase project and refuses hosted endpoints. It creates a local TEST Rose City tenant and synthetic local subscription/membership so public/admin flows can be tested. It does not import real fixtures or touch hosted billing. The local staging namespace is a domain-routing value; all API/database/mail services remain loopback. The importer is not a production import command.

The rehearsal uses Supabase API55321, PostgreSQL55322, Mailpit55324 and site3198. The original stack54321/54322 remains untouched. Environment files, local destination receipt, auth states and generated runtime output are ignored. Docker email templates require the actual `/Users` source path in the isolated runtime; a `/private/tmp` bind incorrectly becomes a directory on this host. This is runtime setup, not an application email-template change.

## Release follow-up

A release requires a separate approved hosted rollout: backup and review the target, apply `20261112010000_rose_city_cinematic_v2_homepage.sql`, publish the reviewed media through the normal pipeline, map current tenant sponsor UUIDs to approved display treatments, create a validated immutable cinematic2 presentation document and update only the Rose City published pointer. Preserve existing social destinations, Schedule, Shop ownership and all other clubs. The script's synthetic local subscription, membership and club identity fixture must never be applied to hosted data. Account/API secrets are not part of the asset bundle.

MuseoModerno is bundled with its official OFL notice. Avenir loads from the onzio-fonts bucket through `NEXT_PUBLIC_FONT_BASE_URL`, with Figtree as the fallback. On 2026-11-17 Christian accepted hosting the supplied files for launch without a webfont license; the exit plan and follow-up are in `docs/rose-city-2027-fonts.md`. The existing LEMON MILK commercial-use receipt remains to be confirmed. Neither was purchased or redistributed from macOS. Phosphor lettering remains within supplied artwork.

## Verification

Final acceptance: full suite 201 files / 1865 tests; production build, TypeScript, lint, exact database type generation and whitespace checks. Actual desktop1440/phone390 editor workflows passed 2/2, including real graphic upload, save/reload public parity, navigation renaming, prices, map visibility and preservation of seven photo identities. Tests restore original copy/settings through normal APIs; the original raffle bytes are re-published with a new valid media ID because a committed replacement correctly retires the previous identity. Public production smoke at desktop1208/phone390 verifies HTTP200, metadata, loaded media, exactly one header/footer, video and sponsor motion, no controls/artwork links, correct Onzio href/opacity, no overflow and no JS errors. Scoped routing tests also preserve authenticated private previews using only their explicit published pointer. Branding preview overrides use the current tenant’s entered links and canonical social rows replace older UUID duplicates, including authoritative blank rows. Actual captures and diagnostic reports are saved outside the repo under `Rose City 2027 Revamp/review-notes/actual-site/`. Phone results are browser viewport verification, not new physical iPhone or VoiceOver acceptance. Native Bunny delivery has been empirically verified from a normal browser referrer with muted autoplay, inline playback and no controls; bare requests without a referrer returning403 do not reflect normal browser delivery.

## Approved slim navbar follow-up

Christian selected the isolated Slim option. The real cinematic2 shell now has
a72px desktop header with56px crest,44px navigation targets and28px Foothill
logo box, all centered. The phone header is60px plus safe-area inset, with44px
crest/Menu target. Desktop dropdowns start at the header edge. Only scoped CSS
changed; navigation semantics, editable labels, other homepage sections and
presentation versions retain their behavior.

Fresh production build (including lint), sequential TypeScript, full201-file /
1865-test suite and whitespace checks pass. Actual browser1280px/390px confirms
exact header heights, shared vertical centers, no horizontal overflow,
contained Community dropdown with Escape dismissal, and phone drawer open/close.
Captures are saved outside the repository in `review-notes/navbar/` as
`implemented-desktop.png` and `implemented-phone.png`. This is browser viewport
acceptance, not new physical-device testing. Initial sandbox-only build/tests
were blocked by outbound font/loopback network restrictions; unchanged
network-enabled reruns passed. The updated production build is served locally
on3198; no push, hosted content change or deployment occurred.

## Final selection: Roomier (supersedes Slim)

Christian subsequently selected Roomier. Final desktop header88px/crest64px,
phone header68px plus safe-area inset/crest48px, with unchanged centered44px
navigation/Menu targets and28px Foothill box. Desktop panels begin at88px.
The same scoped stylesheet is the only runtime change. Fresh build (including
lint), TypeScript, full201-file/1865-test suite and whitespace checks pass.
Actual1280px/390px checks confirm dimensions, no horizontal overflow, desktop
panel containment/Escape, and phone drawer open/close. Final captures outside
the repo: `review-notes/navbar/roomier-desktop.png` and `roomier-phone.png`.
Local3198 runs the final build; no push or hosted release. These checks use
browser viewports and do not claim additional physical-device acceptance.

## Larger crest refinement

Final navigation crest is76px desktop/56px phone at Christian's request; roomier
header heights remain88px/68px plus phone safe-area. Centered tabs/Foothill and
all behavior are unchanged. Actual1280px/390px checks verify loaded crest,
shared vertical centers and no overflow; captures `review-notes/navbar/
larger-crest-desktop.png` and `larger-crest-phone.png` are outside the repo.
Build/lint, sequential TypeScript and whitespace pass. Full run passed1843 tests
in200 files; registration-rls's22 tests encountered a local connection-readiness
timeout and passed unchanged on focused rerun (4.43s). All1865 distinct tests
pass across the full run/rerun. No new physical-device result is claimed.

## Local font integration and launch hold —2026-10-13

Christian explicitly requested no launch. The supplied Downloads archives were
inspected: LEMON MILK BoldItalic already matches; Avenir Medium is wired into
the local preview, with its unlicensed-for-web font bytes excluded from Git and
Vercel uploads. Archive identities, licensing paths and verification are in
`docs/rose-city-2027-fonts.md`. No commercial-license receipt was found inside
the ZIPs; launch permissions remain unresolved. No hosted write, push or deploy.

## 2026-10-13 — Approved navbar hybrid implemented locally

Christian approved the white-phone combined preview. Implemented the accepted
reference proportions and Original + rounded desktop menus in cinematic@2:
header clamp(140px,13.58vw,196px), crest min(10.35vw,150px), lowered label/partner
alignment, red 264px rounded menus with 8px padding and 38px rows. All destination
links and editable labels remain; there are no repeated desktop menu headings.
Phone uses an 88px/72px header and full-screen white drill-in navigation, both
logos, dark text/red accents, Tickets/Schedule shortcuts, Back to menu, and the
four approved medium/outline/round icons. Icon sources/license/hashes accompany
the selected SVG sprite in public/icons/cinematic-navigation. Shop visibility
still follows the existing club setting; other templates remain unchanged.

Verification: production build including lint, sequential TypeScript and
whitespace; isolated full suite 202 files / 1868 tests; focused navigation and
shell rerun 6/6 after a type-signature correction. The first full invocation
omitted .env.test and failed environment/JWT preconditions; the explicit isolated
rerun passes unchanged. Actual browser1280/1025 and390/320 confirms desktop
264x334px Stadium panel with all8 links, containment and no headings; loaded
logos/white phone background, no horizontal overflow, Back focus restoration,
Escape/menu-trigger focus and body scroll unlock, eight Stadium routes, correct
About href/caret and navigation. Native dialog Tab traversal retains background
inertness while allowing browser chrome. Phone heading case is explicitly scoped
to the approved presentation. Captures/receipts: review-notes/navbar/implemented-hybrid
outside the repository. These are browser viewport checks, not new physical
phone/VoiceOver acceptance.

Local3198 serves the updated build. Existing font-work edits are preserved.
No push, merge, hosted mutation, data export or deployment. Launch stays on hold.
Next: review the local homepage; separately authorize any future release.


## Tickets page complete locally — 2026-10-13

Approved /tickets and /admin/tickets are implemented only for cinematic@2. Reference-matching composition, larger perk icons, shared Homepage prices/match copy, real Schedule fixture, editable Tickets copy/artwork and external HTTPS purchase field are verified locally. Independent strict atomic save/revision/receipt/media contract uses migration20261112030000. Full details, local publication and208-file/1915-test/browser/persistence evidence: docs/rose-city-tickets-2027-implementation.md. Buy Tickets remains inactive until the actual purchase URL is supplied. No deployment or production launch; physical-device gate and existing font boundary remain. Shop chat owns the next shared integration window.

Tickets reference placement refinement verified: seat legs meet section boundary; desktop subtitle starts after G, phone centered. CSS-only change; combined Shop build includes it. See Tickets implementation document and placement-actual-checks.json.

## Chick-fil-A and Robinson Stadium preview work — 2026-10-13

RC2027-CHICK-FIL-A / RC2027-STADIUM: isolated responsive previews ready for review,
using two explicitly requested parallel workers and separate ports 3203/3204.
Exact supplied artwork located; Chick-fil-A steps centered/aligned as requested.
Shared application integration stays with the main agent after desktop/phone
approval. Content/editor/schema/runtime unchanged; previous dirty work preserved.
Both Vite builds pass;1280/390/320 no-overflow checks and main visual review pass.
Chick-fil-A icon/caption/numeral rows align on desktop and both phone widths.
Screenshot overviews/browser evidence and isolated footer-copy fit refinement,
scope, source decisions and exact next step are tracked in
docs/rose-city-stadium-food-2027-design.md.

Christian accepted both page layouts with typography corrections: Chick-fil-A
Details now uses his supplied Phosphor CG Regular, and Robinson's four body
section headers use bold Avenir. Corrections stay in isolated previews and
preserve approved layout/artwork/centered steps. Font/rendered evidence and the
accepted-page integration next step are in the scoped design ledger above.

Current Details supersedes the previous CG font: user's replacement archive
supplies Phosphor W00, now rendered with the meal-pass graphic's sampled
#CA2F3B red. Current1280/390/320 font/color/alignment evidence is recorded in the
same scoped ledger; isolated preview only.


## 2026-10-13 — Accepted visitor pages integrated locally

Christian explicitly requested subagents to implement the accepted Chick-fil-A
and Robinson Stadium designs. The two page workers own scoped renderers, content
models, editors and assets; the main agent owns shared routes, atomic Save/API,
migrations, generated types, local publication and combined verification. Both
public routes and independent admin editors now run on local3198.

Migrations20261112040000 and20261112050000 applied only to guarded isolated
55321/55322 test tenant, without a reset. Eleven media references use seven new
normal-pipeline publications plus four verified existing Tickets assets. Original
content/media identities were preserved. Independent strict revisions, actor
receipts, recovery, RLS and media reference guards cover both pages. Full suite
passes222 files/1999 tests; combined build, TypeScript and scoped lint pass.

Desktop/phone public verification and normal editor persistence acceptance are
in progress. A Chrome hidden-srcDoc preview root timing issue was found and
fixed with a narrow shared guard; final rebuild/retest pending. Physical-device
and VoiceOver acceptance remain open. No commit, push, hosted write, export or
deployment; previous Homepage/About/Crest/Tickets/Shop work remains preserved.


## Final local acceptance — 2026-10-13

Both accepted visitor pages are complete locally on3198, with public/admin
routes, independent atomic Save, editable copy/sections/images, supplied W00
meal-pass red and real Avenir Heavy headings. Desktop/phone-width saves and
normal meal-pass/photo/map uploads passed; approved copy and phone crops restored.
Final11 media references/checksums pass; shared original Tickets artwork remains
published. Final combined build/lint/types pass;222-file/1999-test full suite
and final7-file/25-test focused rerun pass. Source-freeze pending notes above are
historical. Canonical integration details and final evidence are in
docs/rose-city-stadium-food-2027-design.md, under Final local implementation
acceptance. Physical-device/VoiceOver and existing release gates remain open;
no commit/push/hosted write/deployment. User local review is the next step.


## 2026-10-13 — Approved roster implemented (RC2027-ROSTER)

Actual /roster now uses the approved cinematic cards and original PlayerModal
with MuseoModerno/Avenir/red styling; mouse-only260ms desktop hover and phone
tap modal. Real shared tenant roster query/admin data; no hardcoded players or
zeroes in the renderer. Narrow local rehearsal preserves33 player identities/
30+3 historical totals/two action photos, creates active2027 with24+3 zeroed
stat rows for27 active players and copies41 exact normalized assets.
Build/types/lint,224 files/2004 tests, actual1280/390/320 and independent SQL/
media/file-preservation checks pass. Other agents' completed pages intact.
Full ownership/evidence/limitations: docs/rose-city-roster-2027-implementation.md.
No hosted write/deployment/launch. Physical-phone and site-wide release gates
remain. Historical fixtures remain in the unchanged source project.


## 2026-10-13 — Schedule implemented (RC2027-SCHEDULE)

Approved cinematic@2 /schedule and existing /admin/schedule now support all
three editable opponent/sponsor/league images, real active-season data, club
timezone Next, four-card Load more batches and hidden phone numbering. Local
Schedule-only rehearsal reuses the existing2027 season, with four approved
copied fixtures and nine normalized logo assets. Real admin Save/reload/public
replacement, mobile removal/restoration,13-game pagination,226-file/2010-test
suite, types/build/lint and twelve delivered logo checksums pass. Final roster
source/table hashes match the starting baseline; other work is preserved.
Independent local app: http://rose-city.localhost:3211/schedule. Source, migration,
media ownership, runtime caveat and gates: docs/rose-city-schedule-2027-implementation.md.
No hosted writes/deployment; physical phone and combined release remain open.
