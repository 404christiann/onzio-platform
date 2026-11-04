# cinematic@2 Robinson Stadium — accepted design implementation

RC2027-STADIUM: **complete locally**; public/admin integration, Save/upload persistence, restored map framing and independent final audit pass. Physical-phone/VoiceOver and hosted release gates remain open.

Accepted design comes from `Rose City FC Bus Route page 8 Menu 2027.jpg` and the isolated3204 preview. Renderer `CinematicStadium` and scoped `stadium.css` preserve original bus/full route composite, phone route-card/walking-map viewports, all four sections, and next-match/benefits columns. Four body-section headers use genuine supplied Avenir Heavy54460B from `avenir.zip`, scoped at800 with synthesis disabled. Global/shared fonts remain unchanged.

## Ownership and editing

Stadium owns heading/subtitle, section visibility, editable ordered body sections with headings/body/footnote/bullets, ordered benefits and footnote, three artwork IDs/descriptions, and phone map layout/crops. Homepage owns shared match heading/announcement/button label; Schedule owns real next HOME fixture. Tickets remains single owner of purchase URL and unavailable message. Renderer accepts current `ticketing` values; editor reads Tickets and links to its existing editor instead of duplicating authoring. Separate `/stadium/foothill-transit` is unaffected.

Schema is strict and tenant-neutral by default. Three slots are `bus`, `map`, `partner`; arbitrary URLs/client tenant fields are excluded. Sections have unique stable IDs; crops are positive normalized rectangles fully contained within the image. Original2380x1216 composite uses card96 54 652 1104 and map754 0 1626 1216. Replacement map defaults to full-image phone display; explicit crop controls may re-enable split framing, so original-specific crops never silently apply to arbitrary images. Original bytes stay in the asset archive.

`StadiumEditor` uses the parent's generic independent revision/operation transport. Browser recovery is scoped by origin/user/club. A pending uncertain save locks changes and retries the exact operation. Draft fingerprints canonicalize database JSON ordering. Uploads use the existing homepage-artwork publication boundary. Removed assets are queued for parent reference-safe cleanup; shared Tickets identities must remain usable. Async load/save/upload completions are ignored after a club/context change.

## Parent integration boundaries

Parent alone owns public/admin/API route wrappers, admin links/registries, SQL/RLS/FKs/receipts, generated database types, seeds/publication, shared shell adjustment, combined app builds and runtime restart. Expected routes: `/stadium`, `/admin/stadium`, API `/api/admin/visitor-pages/stadium`; table `onzio.cinematic_stadium_content`. Query requires caller's trusted server onzio client and fetches only same-tenant published/non-retired media.

Accepted authentic inputs/content/provenance are in `assets/rose-city-stadium-2027/`. Prepared bus/map/partner bytes exactly match the Tickets bundle, enabling validated reuse of its published asset IDs. Originals copied byte-for-byte to owned source archive. Parent must publish/import through the normal isolated local pipeline and preserve unrelated content; no hosted writes or casual database reset.

## Verification

Owned narrow contracts cover strict content/crops/unique sections, tenant-neutral defaults, source map geometry, replacement full-frame reset, scoped media hydration, escaping/visibility, shared match/purchase ownership and exact operation recovery. Query regression reconstructs IDs from authoritative tenant FK columns before strict validation because stored JSON artwork contains descriptions only. Same-tenant, published and non-retired query filters are asserted.17 tests in4 contract files pass; ESLint passes for owned TS/TSX, and React hook/accessibility/context-switch review is complete. Responsive text may wrap when administrators enter longer content without changing the approved reference's layout.

Parent integrated public/admin/API routes, schema/RLS/FKs/independent revisions/receipts, exact generated types and guarded source/media seed on the isolated55321/55322 database. Combined TypeScript/build/lint pass; parent reported222 files/1999 full-suite tests before the final shared iframe-readiness guard. Runtime3198 was rebuilt/restarted with that guard; worker did not mutate shared files or restart the app.

Actual Chrome public1280/390/320 checks pass with original heading/subtitle, all four Heavy-font headings, authentic bus/map/partner images and exact phone card/map viewBoxes. No horizontal overflow: scrollWidth equals clientWidth1265/375/305 respectively; Chrome reserves15px for the vertical scrollbar. Public image URLs point directly to normalized isolated media, never a runtime optimizer. Schedule is empty; the real announcement and Tickets-owned inactive purchase message render correctly.

Actual390px protected-editor subtitle plus ticket-benefit visibility Save→reload→public reflection passes. Both approved values were restored through the same UI Save→reload→public flow; worker left no unsaved/pending operation. Parent independently passed desktop save/reload/reflection/restoration. The current shared Tickets map identity stayed unchanged throughout worker copy checks; parent separately owns normal map replacement/full-layout reset/reference-crop restoration and reference-safe shared-media verification.

Chrome initially reproduced an intermittent hidden-srcDoc readiness exception in shared `HomepagePreviewFrame`; parent added a minimal readiness guard and rebuilt. Fresh closed disclosure loads and expanded live preview render without the exception. The preview uses this same renderer and reports the authentic Heavy face loaded, exact source viewBoxes and all four body headings. Shared copy/media schemas and publication contracts were preserved.

Worker evidence: outer `review-notes/robinson-stadium-2027/implemented/` contains `public-checks.json`, `public-{1280,390,320}.jpg`, `phone-persistence.json`, `admin-preview-check.json`, `admin-phone-saved.jpg`, plus the initial Chrome-failure diagnostic. Worker viewport overrides were reset; temporary admin/matrix tabs closed, and Stadium content ownership released to parent for final uploads. Browser viewport checks do not establish physical-phone/VoiceOver acceptance. No commit, push, hosted write or deployment authorized by this local implementation task.


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
