# Rose City 2027 stadium and food page previews

2026-10-13. Christian accepted both layouts with typography corrections. Current Chick-fil-A Details uses the replacement supplied Phosphor W00 font and the meal-pass artwork's red; Robinson body-section headings use Avenir Heavy. The isolated previews include those corrections; application integration remains the next work package.

## Scope and ownership

Christian supplied Food & Beverage and Bus Route references and requested two parallel page workers. Chick-fil-A owns outer `design-explorations/chick-fil-a-2027`, `review-notes/chick-fil-a-2027`, and its original-asset archive, using port 3203. Robinson Stadium owns the corresponding `robinson-stadium-2027` directories and port 3204. The main agent alone owns shared registries, navigation, schemas/types, admin integration, imports, builds, runtime restarts and this ledger. No application integration window is opened during design review.

The previews import the approved application cinematic@2 header/footer through isolated public-content adapters. Existing Homepage, About, Crest, Tickets and Shop source and dirty work are preserved. Preview targets are `/stadium/chick-fil-a` and `/stadium`; the existing separate `/stadium/foothill-transit` destination is preserved.

## Reference and source decisions

- Food & Beverage: supplied meal-pass illustration, three illustrated steps, dedicated Chick-fil-A walking map, next-match card over seat motif, and restaurant photograph. Christian explicitly requests equal, centered 1/2/3 alignment with consistent icon, caption and numeral baselines.
- Robinson Stadium: supplied Road to the Match heading/bus, complete original map including the vertical Robinson Stadium @PCC Line 187 card, directions/parking/route/service-area prose and ticket-benefit section. On phone, separate viewports of the same original map keep the card and walking map legible.
- Dropbox root `/Rose City FC x Onzio 2027` was fully listed without pagination remaining. Its shared namespace is `ns:15404827059//`. Exact Chick-fil-A artwork and photograph are in the root. The existing Tickets original archive supplies the exact bus/map/seat graphics. Original bytes and source receipts are retained; no guessed artwork is substituted.
- The Free Game Ticket file is named PNG but contains a Photoshop PSB composite. Preserve its original bytes and record any lossless display extraction separately.
- Reference copy is supplied design content, not independent confirmation of current partnership terms, parking prices, service routes or discounts.
- A fresh CUA check of actual local `/schedule` shows FIXTURES / SCHEDULE COMING SOON. The previews use an honest next-home-match announcement and do not publish the reference's March 13, Ventura opponent or kickoff as a real fixture. The external purchase URL remains missing.

## Verification and next step

The main agent inspected current Git status and confirmed branch `codex/rose-city-homepage-2027`. Existing local runtime remains on 3198 without a restart. Workers build and verify only their isolated Vite previews. Browser viewport checks do not establish physical-phone or VoiceOver acceptance.

Both isolated Vite builds pass. Fresh CUA checks at desktop 1280 and phone 390/320 confirm loaded artwork/fonts and document widths equal viewport widths. Chick-fil-A step icon edges, caption rows and numeral rows align; horizontal centers differ by at most 0.004px. The smallest-phone caption tracking was tightened to keep all three labels on one line.

Matching the current long footer tagline exposed a 6px desktop overflow in the copied shell. Each preview has a local brand flex-shrink/text min-width override that preserves the existing footer row and shared source. Reassess this against actual public/admin layouts during approved integration; no shared shell patch was made in this design phase.

Main independently reviewed Robinson desktop/phone in CUA and its screenshot overview, and Chick-fil-A desktop/320px screenshots, geometry evidence and live desktop/phone preview controls. Evidence: outer `review-notes/chick-fil-a-2027/{browser-checks.json,desktop.jpg,phone.jpg,phone-320.jpg,overview.jpg}` and `review-notes/robinson-stadium-2027/{browser-checks.json,desktop-full.jpg,phone-full.jpg,small-phone-full.jpg,overview.jpg}`. Source and operation instructions live in each preview README.

Review at `http://127.0.0.1:3203/` and `http://127.0.0.1:3204/`; each provides Desktop, Phone, Small phone and Your reference views. Standalone paths: `/stadium/chick-fil-a?preview=1` and `/stadium?preview=1`. Previews have no backend/save connection.

## Accepted typography corrections

Current Details treatment supersedes the earlier CG correction below: Christian supplied `OnlineWebFonts_COM_599a27c4bba399ca288a5770c37275d4.zip`, containing matching Phosphor W00 Regular TTF/WOFF2 name tables. The exact supplied WOFF2 is used only by Details. Color `#CA2F3B` matches the dominant opaque saturated red in both the original meal-pass PNG and served lossless WEBP (RGB202/47/59;88,543 pixels). Other red controls/numerals remain unchanged. CUA1280/390/320 confirms font loaded at400, exact computed color, no overflow, and unchanged centered-step geometry. Main independently reviewed the rendered screenshot. Current evidence: `review-notes/chick-fil-a-2027/details-w00-checks.json` and `details-w00-review-desktop.jpg`; source archive/member/hash provenance stays in the preview. The prior CG original/receipts are retained as history.

Chick-fil-A Details uses the actual supplied `/Users/christianalcala/Downloads/Phosphor CG Regular/Phosphor CG Regular.otf` at regular weight400 and the reference red. Its decorative glyphs replace the simulated outline; synthetic weight/stroke is removed. The original font is copied only into this local preview with its source/hash receipt. All other headings and section geometry stay unchanged. CUA1280/390/320 confirms the font loaded and all step geometry remains identical to previous evidence. Focused evidence: `review-notes/chick-fil-a-2027/details-font-{checks.json,desktop.jpg,phone.jpg,phone-320.jpg}`.

Robinson's four `.robinson-directions h2` headings use the actual supplied Avenir Heavy face at weight800, under preview-only `RobinsonAvenirHeavy`, with synthetic weight disabled. Exact source archive member, byte size and hash are recorded in `review-notes/robinson-stadium-2027/avenir-heavy-source.json`. Display titles, benefit headings, layout and artwork remain unchanged. CUA1280/390/320 confirms font loading and no overflow. Main independently inspected the final visibly bold screenshot. Focused evidence: `section-heading-checks.json` and `section-headings-desktop.jpg` in that evidence directory. Both final Vite builds pass.

Next: implement editable copy/images/sections using the existing tenant, revision, receipt, recovery, media and Save contracts, preserving these accepted designs and typography. No commit/push, hosted writes, deployment or production launch is authorized in this phase.


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


## Final local implementation acceptance — 2026-10-13

RC2027-CHICK-FIL-A and RC2027-STADIUM are **complete locally**. Two explicitly
requested page subagents implemented the scoped public renderers and editors;
main integrated trusted public/admin/API routes, independent atomic Save,
migrations, generated types, reference-safe media publication and shared
Homepage editor shortcuts. Actual review: http://rose-city.localhost:3198/stadium
and http://rose-city.localhost:3198/stadium/chick-fil-a. Editors: /admin/stadium
and /admin/chick-fil-a. Runtime3198 serves the final combined production build.

Details uses supplied Phosphor W00 Regular400 and exact meal-pass #CA2F3B;
three icons/captions/numerals align, including320px viewport with305px available
width. Robinson body headings use actual Avenir Heavy800. Both pages preserve
authentic artwork, approved composition and one shared navigation/footer.
Shared purchase URL/unavailable copy stays in Tickets; match copy in Homepage;
real fixtures in Schedule. Current absent purchase URL and empty Schedule show
honest inactive purchase/announcement states.

Acceptance includes public1280/390/320 checks, desktop and phone-width editor
Save/reload/public persistence, approved copy/visibility restoration, and main
normal filechooser uploads for meal-pass graphic, restaurant photograph and
Stadium map. Each saved replacement persists into editor reload and public
rendering. Map replacement correctly resets full-image mode; approved split
phone crops restored through UI and Save, with at most0.001px source-coordinate
rounding. Three normal replacement identities retain the original artwork.
Original shared Tickets map/bus/partner remain published; Tickets map FK intact.
Final DB audit confirms all approved copy/settings restored and all11 referenced
media are same-tenant published, correct category and checksum-verified.

The hidden Chrome srcDoc preview timing crash is fixed by waiting for document
root/head/body; fresh closed/open Stadium editor preview retest passes. Scoped
ESLint and final combined build pass. Full suite:222 files/1999 tests. Final
focused renderer/content/query/recovery rerun:7 files/25 tests. Fresh generated
database types exactly match the isolated schema. Atomic Save/API/DB tests
include conflict, strict scope, actor receipts, exact retry and media guards.
RLS is enabled; all four load/save RPCs are invoker functions; anon has no table
write grants. No broad suite rerun after CSS/root timing changes was necessary.

Migrations20261112040000 and20261112050000 plus initial guarded import
preserved all existing rows at execution. Full-suite synthetic fixtures later
changed eight global table digests; this is distinguished from page migration
preservation. Rose City clubs/branding/presentation-state timestamps precede
publication. Previous Homepage/About/Crest/Tickets/Shop dirty work is retained.

Independent final evidence: outer
review-notes/visitor-pages-2027/implemented/{parent-browser-checks.json,
final-database-checks.json,chick-desktop-final.png,chick-phone-final.png,
stadium-desktop-final.png,stadium-bold-headings-final.png}. Worker persistence,
preview and responsive evidence lives in the corresponding Chick/Stadium
implemented evidence folders. Build/test logs and local migration/import
receipts remain under /private/tmp/rose-city-visitor-*; no credentials included
in review evidence.

Physical-phone/Safari/VoiceOver acceptance remains open. Browser viewport
checks establish responsive behavior only. No commit, push, hosted mutation,
export or deployment performed or authorized. Next: user local review; any
release requires its own authorization and existing launch gates.
