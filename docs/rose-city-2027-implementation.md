# Rose City 2027 approved homepage implementation

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
