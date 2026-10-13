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

A release requires a separate approved hosted rollout: backup and review the target, apply `20261013145029_rose_city_cinematic_v2_homepage.sql`, publish the reviewed media through the normal pipeline, map current tenant sponsor UUIDs to approved display treatments, create a validated immutable cinematic2 presentation document and update only the Rose City published pointer. Preserve existing social destinations, Schedule, Shop ownership and all other clubs. The script's synthetic local subscription, membership and club identity fixture must never be applied to hosted data. Account/API secrets are not part of the asset bundle.

MuseoModerno is bundled with its official OFL notice. Avenir currently resolves the approved local installed font with a portable fallback; an appropriate commercial webfont license/file is required for identical appearance across all devices. The existing LEMON MILK commercial-use receipt remains to be confirmed. Neither was purchased or redistributed from macOS. Phosphor lettering remains within supplied artwork.

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
