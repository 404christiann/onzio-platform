# RC2027-ABOUT — implemented and verified locally

Status: source/local acceptance complete. Christian approved the desktop/phone design and requested implementation with admin editability. Production remains on hold.

Public verified build: http://rose-city.localhost:3208/club/about.
Editor: http://rose-city.localhost:3208/admin/about.
The current source was built independently in `/private/tmp/rose-city-about-runtime`; the older server on3198 was preserved. Restart the verified build with `./node_modules/.bin/next start -H 127.0.0.1 -p 3208` in that snapshot. The source of truth remains this implementation checkout.

## Implementation and ownership

New `CinematicAbout` and scoped `about.css` render the approved white layout, MuseoModerno/Avenir, red rule/button, story/photo grid and shadowed values. The tenant About route dispatches only cinematic@2 to this renderer; other templates keep their existing renderers. `AboutPageCanvas` uses the same component and existing hero/story/values/closing selection targets. Populated admin/public markup is identical. Cleared public sections remain empty, while editor-only targets allow first authoring. Links render only when both label and destination are present. Images use the existing resilient native renderer without runtime optimization.

All page headings, paragraphs, feature photo, values heading, value titles/descriptions, closing text, button label and available-page destination stay in existing `about_page_content` fields. No new schema/API/save/recovery contract or duplicate content source. Existing About/Logo independent revisions, tenant-scoped authorization, actor receipts, conflict/retry/recovery and reference-safe media cleanup are retained. Crest canvas integration and unrelated dirty work were preserved.

The isolated rehearsal initially had no About row. A narrow guarded local import published the original photo normally and inserted the approved old-site copy, with both stadium mentions updated to Robinson Stadium. It confirmed existing Logo/Homepage/Branding/player/season/match/Shop rows unchanged. Import source and hash are under `assets/rose-city-about-2027`; the ignored local receipt is in `output`.

## Verification

- Focused About/render/route/save/recovery/query contracts:27 tests passed. New contracts cover tenant/template dispatch, authored fields, populated preview parity, empty authoring targets and incomplete links.
- Full suite:228 files /2014 tests passed with the isolated local test environment. TypeScript, lint, full Next production build and whitespace checks passed. Existing assertions were not altered.
- Real admin edits to heading, story, values heading, value title/description, closing invitation, button label and destination were saved and verified on the reloaded public page and independently in SQL.
- Actual feature-photo Replace went through authorization/staging/finalization and selected-page Save. The original image was used, and normalized bytes/delivered checksum match the initial import. Final asset is published.
- A phone-style inspector save restored the final Community value. Reloaded admin/public and direct SQL confirm all approved copy restored and no QA markers remain. Phone preview uses the new renderer at375px client width in its390px frame, with no overflow.
- Actual public route at1280px has1265px client/scroll widths. Same-origin temporary QA frames verify390/320px widths:375/375 and305/305 client/scroll widths, single-column values, loaded1200px original photo. That wrapper existed only in the temporary build and its extra QA server was stopped.

Evidence: outer `review-notes/about-2027/implemented/{persistence,layout-checks}.json`, `public-desktop.jpg`, `public-phone.jpg`, `admin-phone.jpg`, `admin-final.jpg`. Logs: `/private/tmp/rose-city-about-{build,types,lint,full-tests}.log`. Public phone screenshot captures the actual route in the temporary QA frames; native hardware/Safari/VoiceOver acceptance is not claimed.

## Remaining boundary

No commit/push, hosted data/schema/storage update, deployment or production launch. The protected static phone deployment predates this implementation. Exact next: review the actual local page/editor, consolidate the current source into the site's shared verification/runtime when appropriate, and complete the existing physical-device and separately authorized release gates. Do not run the local-only seed against hosted infrastructure.
