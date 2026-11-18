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

# Rose City phone-testing preview

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

## 2026-10-13 — Hamburger and desktop dropdown motion

Christian requested animation for hamburger activation and desktop dropdowns.
Existing actual CinematicNav and scoped styles now animate pointer opening and
closing: white phone dialog fades/slides vertically by 3 percent over 240ms;
red desktop panels fade/lift 8px with subtle scale over 200ms, originating at
their trigger. Transform/opacity only. Interrupted phone entry closes from its
current frame; repeated closing is ignored. Native dialog stays modal through
exit. Desktop closed panels become inert and aria-hidden immediately while the
visual exit completes. Colors, proportions, logos and touch-focus fix retained.

Keyboard activation and Escape are instant with focus restoration; reduced
motion uses 150ms fades without translation/scale. CSS duration unit conversion
handles optimized .24s serialization correctly for WAAPI's millisecond input.
Reduced-motion branches were source-checked; physical preference/device testing
is not claimed. No new animation dependency.

Protected Preview / READY: https://onzio-platform-dzcs3380e-404christianns-projects.vercel.app
Deployment dpl_DFWNp7cjTLyTV1yUfgEJMYs25Uyk. Existing Vercel Authentication retained.
Hosted desktop/390px browser checks confirm motion frames, close completion,
Back to menu focus, keyboard outline/Escape, and no browser errors. Screenshots
and JSON evidence: review-notes/vercel-phone-preview/menu-motion/.
Types/build/package scan pass (48 files, zero functions/credentials). Isolated
full suite: 202 files/1868 tests pass; final duration repair rechecked with
focused 6/6, TypeScript and whitespace. Production id, aliases, framework and
protection unchanged, recorded in phone-testing/menu-motion-preservation.json.

This remains the fixed-public-content phone review artifact; destination pages
are placeholders. Actual local app3198 still serves its prior build; rebuild
before local motion review. No push, merge, production launch, custom-domain
assignment or hosted database write. Next: Christian reviews motion on phone,
then continue site completion while production remains held.

## 2026-10-13 — Touch-opening close-button focus ring fixed

Christian supplied an iPhone Safari screenshot showing a black outline on the
close button immediately after tapping the hamburger. Added one scoped CSS rule
in cinematic.css: a focused close control has no outline while the existing
navigation modality attribute indicates pointer input. Native dialog autofocus,
accessible control naming and keyboard focus styling remain intact. Other
controls, colors, layout and media are unchanged.

Protected testing Preview / READY: https://onzio-platform-4ipd0jmwf-404christianns-projects.vercel.app
Deployment dpl_HTiLmtdUnCwpBgHg7qGoLeA6DHaA supersedes the earlier testing URL.
Hosted390px browser verification: pointer-open close remains focused but outline
style is none; keyboard Enter-open close is focused with data-keyboard-input and
solid3px outline. No browser errors. Screenshot/receipt:
review-notes/vercel-phone-preview/touch-focus/. This is browser verification of
the modality rule; physical iPhone retesting belongs to Christian's review.
Artifact build/types and packaging scan pass; focused6/6 and isolated full202
files/1868 tests pass; repository TypeScript and whitespace pass. Production
deployment, aliases, framework and protection compare unchanged. No production
release, domain assignment, hosted database write, push or merge.

The local3198 server still serves its prior build; the corrected stylesheet is
in the implementation source and the hosted phone-testing bundle. Rebuild3198
when next reviewing the local app. Next: use the new testing URL on the phone
and continue site completion with production on hold.

## 2026-10-13 — Protected Vercel phone-testing preview READY

Christian authorized a testing deployment while keeping production launch on
hold until the site is completely finished. He subsequently confirmed Avenir;
the supplied Medium file is included in this protected preview and verified
byte-for-byte (53,264 bytes; SHA-2566382b3641be89a4527a33737870646d42310255f2b997e65a8b08c8adc73f8cf).
No receipt inspection is claimed. The prior local-only font exclusion remains
in the main app checkout; this testing artifact packages the confirmed font.

Preview: https://onzio-platform-ijmby6ag6-404christianns-projects.vercel.app
Deployment: dpl_7owtWifyekSV1yWBBakSDS7XtfXM, READY / Preview, existing
onzio-platform project prj_I362ysmh9cse5cRxnL7db4dOhsEs. Vercel Authentication
is retained; open the URL on a phone while signed into Christian's Vercel
account. An anonymous browser reaches the login gate; signed-in Chrome loads
and exercises the real homepage/menu components.

Hosted staging was previously retired; current Supabase inventory contains
only production. Therefore the isolated phone-testing/ artifact imports the
actual cinematic@2 React components/styles and freezes only the local public
rehearsal content. Seven photos, six sponsors and22 approved normalized image
objects are bundled; no admin/auth/payment handlers, database credentials,
production reads/exports or hosted database changes are included. Next Link
and pathname have static navigation adapters, and all21 destinations are
placeholder pages for this visual review. This is homepage/navigation testing,
not full Next/server/admin/payment acceptance. The original app source is
unchanged by this deployment, other than documentation.

Verification: artifact TypeScript/build, output scan (48 files, zero functions
or credentials), actual protected hosted Chrome1280/390/320, Avenir source and
font check, loaded logos, native Bunny video readyState4/playing, no overflow,
white drill-in/back focus/About route/Escape and desktop264x334px Stadium menu
with all8 links. Browser error log empty. Anonymous Vercel login protection and
signed-in access verified. Production deployment dpl_2b73gDEd6LrJzoZJDTEbRMdS2K4i,
production aliases, project framework and protection compare unchanged before/
after. Evidence: review-notes/vercel-phone-preview; receipts/build/source in
phone-testing/. Physical phone acceptance is now available for Christian to
perform; it has not been claimed from browser viewports.

Next: collect phone feedback, finish the remaining site pages/features, and keep
production held until completion plus separate explicit approval. No push,
merge, production domain assignment, migration or presentation-pointer change.
