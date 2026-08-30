# Diverse City FC Production Content and Media Readiness

Epic: `DCFC-EPIC-002`

Status: `accepted`

Last updated: 2026-08-01

This checklist converts `CONTENT-MATRIX.md` into a production gate. It records
known readiness and missing decisions; it does not approve content, import
files, or authorize hosted actions.

## Approved Phase 4 Production Dispositions

`DCFC-401` started on 2026-08-01 after Christian approved `DCFC-EPIC-002`.
The source audit reconfirmed that the approved snapshot remains clean at
`5bbdfa33d59163b218bbd33745f9cfd4a66d379f`, and that its preview-only roster,
TBA fixtures/tryouts, temporary Google registration destinations, sponsor
opportunity cards, seed standings, and preview disclosure are still present.
Christian approved the following baseline and confirmed retained facts and
publication rights on 2026-08-01. The approval authorizes only Class 1 and
loopback-only Class 2 work through `DCFC-404`; it authorizes no hosted action.

| Surface | Approved production disposition | Evidence owner |
| --- | --- | --- |
| Homepage hero | Keep the approved copy in the existing reusable Academy crest-led hero; exclude both the MP4 and poster because `homepage_hero_content` has no media reference | Christian, 2026-08-01 |
| Homepage shop feature and `/shop` | Keep the confirmed contact-to-order match jersey; retain no price, stock, sizing, checkout, or availability claim | Christian, 2026-08-01 |
| Next match and `/schedule` | Import no fixture; retain `/schedule` with a deliberate empty state and hide next-match data | Christian, 2026-08-01 |
| Homepage vertical story | Hide the entire section; exclude its MP4 and poster | Christian, 2026-08-01 |
| Homepage sponsors and `/sponsors` | Remove both preview opportunity cards; keep Elsa's Bakery only | Christian, 2026-08-01 |
| Homepage standings | Import no row; hide until current approved rows are entered through admin | Christian, 2026-08-01 |
| About | Keep approved copy and lineup image | Christian, 2026-08-01 |
| Roster and staff | Import no identities or media; retain `/roster` with a deliberate empty state | Christian, 2026-08-01 |
| Programs | Keep all four approved programs and supported hero/detail media; exclude the unsupported carousel and hide its temporary CTA | Christian, 2026-08-01 |
| Contact | Keep the approved no-form page and confirmed email, phone, location, and social destinations | Christian, 2026-08-01 |
| Tryouts | Publish no event rows; use the deliberate unavailable/contact state; omit the temporary Google CTA | Christian, 2026-08-01 |
| Navigation/footer | Retain existing Academy links; add the smallest reusable tenant-safe empty/fallback behavior in `DCFC-403`; remove the snapshot disclosure because no placeholder row is imported | Christian, 2026-08-01 |
| Crest, affiliation marks, and social icons | Keep the crest; omit affiliation images; use Contact's text social links; do not import the SVG icons | Christian, 2026-08-01 |

This approved baseline avoids turning missing inputs into launch facts and
closes `DCFC-401`. Exact normalized outputs and deterministic local references
are produced and verified by `DCFC-403`.

## Current Platform Capability Audit

The 2026-08-01 read-only audit checked the recommendations against executable
platform code rather than assuming the presentation registry renders every
registered section:

- `homepage_hero_content` has copy and CTA columns but no media reference;
  the non-Rose-City `Hero` renders the tenant crest over a color field.
- `academy.hero` correctly excludes video, but neither it nor the public
  homepage supplies a static-poster media slot.
- the snapshot's vertical-story section has no reusable Academy content or
  media reference; `behind_the_rose_section` is a separate legacy
  YouTube-oriented domain and is not an honest substitute.
- `programs` supports one hero and one detail asset per row. It has no general
  program-carousel relationship, matching `DOMAIN-DESIGN.md`'s explicit
  exclusion of the Special Olympics carousel.
- Academy `Nav` and `Footer` use hardcoded route arrays. The published
  presentation document validates a navigation route list, but the tenant
  runtime resolves only `presentationTemplateKey`; it does not expose the
  published route list to those components.
- Academy affiliation marks have no content-driven nav renderer. The only
  current affiliation images in `Nav` are legacy Rose City or local Clubhouse
  branches.
- Academy Contact already renders social destinations as text links. The
  shared footer expects an image path, so the snapshot SVGs must not be
  uploaded merely to preserve icon presentation.
- Programs, Contact, Tryouts, and Sponsors have deliberate empty states.
  Roster and Schedule do not yet provide an equivalent explicit Academy empty
  state, so merely importing zero rows is weaker than an approved route
  disposition.
- Shop cannot safely use a missing-row disposition today:
  `normalizeShopPurchaseDetails(null)` returns the legacy Rose City purchase
  defaults, including a Pasadena retailer and external product URL. A Diverse
  City import must therefore write a fully approved contact-to-order row, or
  `DCFC-403` must add reusable tenant-safe empty behavior before Shop can be
  hidden. Importing an all-empty row is also unsafe because the normalizer
  replaces empty fields with those same defaults.
- About likewise falls back to legacy default content when its tenant row is
  absent. The approved About row must be imported completely if the route stays
  visible; absence is not an honest hide mechanism without a reusable fix.
- the sponsor carousel initializes with legacy defaults before its tenant read
  completes, although the explicit tenant query later replaces them with
  tenant rows or an empty array. Local browser acceptance must prove no
  cross-tenant sponsor content is observable for Diverse City.

These findings do not authorize product changes. They constrain the manifest
to existing honest behavior unless Christian explicitly places the smallest
reusable route-visibility/empty-state work inside `DCFC-403`.

Production-eligible provenance remains limited to:

- `verified_public_source`
- `club_supplied`
- `operator_approved`

`placeholder_preview_only`, `missing`, and `prohibited` values must be
replaced, hidden, or rejected. A public-source label is not by itself proof of
permission to reproduce a logo, photograph, or video; the rights/authorization
field below remains required.

## Route and Section Disposition Baseline

| Surface | Known state after DCFC-304 | Required production disposition | Current gate |
| --- | --- | --- | --- |
| Homepage hero | Approved copy; snapshot uses an MP4 and poster; Bunny capability is not implemented | Use the reusable crest-led Academy hero; exclude MP4 and poster | Accepted; locally rehearsed |
| Homepage shop feature | Jersey imagery exists; sizing, price, availability, and order facts are intentionally not invented | Keep the approved contact-to-order item without commercial claims | Accepted; locally rehearsed |
| Homepage next match | Structure exists; match facts are TBA | Import no fixture and show no next-match fact | Accepted; locally rehearsed |
| Homepage vertical story | Approved copy; snapshot uses a portrait MP4 and poster | Hide the unsupported section; exclude MP4 and poster | Accepted; locally rehearsed |
| Homepage sponsor carousel | Elsa's Bakery plus two preview-only opportunity slots | Keep Elsa's Bakery; remove opportunity rows | Accepted; locally rehearsed |
| Homepage standings | Admin capability exists; current ten-row table is preview seed data | Import no standings rows | Accepted; locally rehearsed |
| About | Copy and lineup image are inventoried; championships claim was accepted for current planning | Import the approved row and normalized lineup image | Accepted; locally rehearsed |
| Roster and staff | 11 player and 4 staff identities are explicit placeholders | Import no identities; render deliberate tenant-safe empty state | Accepted; locally rehearsed |
| Schedule | Three fixtures are entirely TBA | Import no fixtures; render deliberate tenant-safe empty state | Accepted; locally rehearsed |
| Programs overview/details | Four program names/copy/media are club-supplied | Import four approved rows and supported media only | Accepted; locally rehearsed |
| Special Olympics registration | Temporary `https://www.google.com/` destination | Omit the CTA while keeping approved Program content | Accepted; forbidden URL absent |
| Shop | Contact-to-order presentation avoids invented price/sizing | Import the approved contact-to-order row and tenant-safe media | Accepted; locally rehearsed |
| Sponsors | Elsa's Bakery only; more sponsors not confirmed | Import Elsa's Bakery only; render tenant-scoped Academy sponsor data | Accepted; locally rehearsed |
| Contact | Approved email/phone/social/service area; no form | Import confirmed destinations; retain no-form boundary | Accepted; locally rehearsed |
| Tryouts | Real logistics remain absent; temporary Google URL; local capability renders honest TBA | Import no event rows; render unavailable/contact state | Accepted; locally rehearsed |
| Navigation/footer | Current snapshot includes links to placeholder-backed routes and a preview disclosure | Keep approved Academy links with tenant-safe empty states; import no disclosure | Accepted; browser-verified |
| Affiliation marks/social icons/crest | Files and checksums inventoried as verified public sources | Import crest only; exclude affiliation marks/SVGs and use text social links | Accepted; locally rehearsed |

## Content Readiness Checklist (`DCFC-401`)

- [x] Record the approved source, owner, date, and provenance status for every
  factual field.
- [x] Resolve `DCFC-D102`: real Tryouts event visibility, dates, location,
  cost, eligibility/public copy, CTA, and registration destination.
- [x] Resolve `DCFC-D106`: roster, staff, fixtures, standings, shop, sponsors,
  and their route/section/navigation visibility.
- [x] Confirm all four Programs names, summaries, bodies, highlights, layout
  variants, ordering, and visibility.
- [x] Replace the temporary Special Olympics and Tryouts Google URL everywhere,
  or hide the affected CTA/content.
- [x] Reverify Contact email, telephone, service area, and social destinations.
- [x] Confirm the Shop remains contact-to-order unless a separate commerce
  scope is approved; do not add price, stock, checkout, or payment collection.
- [x] Confirm no page/form/API/table accepts registration, payment, waiver,
  medical, signature, eligibility-document, or participant data.
- [x] Confirm external registration links are public content only, validate to
  approved HTTPS destinations, open safely, and disclose third-party handling.
- [x] Record the deliberate empty/unavailable behavior for every hidden or
  absent domain so the site does not silently render a broken section.
- [x] Derive navigation/footer/presentation sections only from approved visible
  surfaces.
- [x] Remove the preview disclosure only after its roster/fixture placeholders
  are absent from every production surface.
- [x] Record approver and approval date for the final content manifest.

## Media Inventory Schema (`DCFC-402`)

The immutable source facts, current roles, recommendations, and pending rights
owners are recorded in `MEDIA-SOURCE-INVENTORY.md`. That inventory covers all
currently rendered/referenced media plus supplied files that are deliberately
excluded from the live production recommendation.

Every asset row must record:

| Field | Requirement |
| --- | --- |
| Stable source path/identifier | Local source or provider object identifier; never a transient browser URL |
| Owning/authorizing party | Club, operator, photographer, designer, or documented public-license source |
| Publication-rights evidence | Dated approval/license reference; file possession alone is insufficient |
| Intended route/section/role | Exact tenant content owner and media surface |
| Source facts | Bytes, detected MIME/signature, dimensions, alpha/orientation, `sha256` |
| Production disposition | Import, deduplicate/reuse, replace, hide, or block |
| Normalization plan | Photo or graphic rule; no SVG/executable; no upscaling |
| Planned destination | Tenant UUID + surface + deterministic asset UUID/versioned extension |
| Normalized facts | Output MIME, dimensions, bytes, checksum; populated during Class 2 rehearsal |
| Content reference | Exact table/row/column or presentation section; composite tenant relationship |
| Rollback treatment | Restore prior reference first, then delete only ledger-proven unreferenced object |
| Staging/production evidence | Object/asset IDs and checksum reconciliation, recorded only after separately approved packages |

## Media Readiness Checklist

- [x] Re-inventory every currently rendered image, graphic, icon, poster, and
  video against the approved snapshot commit `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`.
- [x] Recompute checksums from the supplied source files; do not copy truncated
  display hashes from `CONTENT-MATRIX.md` into an import ledger.
- [x] Confirm rights/authorization for the retained crest, photographs, jersey
  art, and sponsor mark; excluded media receives no rollout destination.
- [x] Identify duplicate bytes reused across routes so one immutable asset can
  be referenced safely where appropriate.
- [x] Reject corrupt, executable, SVG, spoofed, oversized, or traversal-shaped
  input before any public write.
- [x] Normalize photographs and graphics offline/locally first and record exact
  output checksums.
- [x] Use `onzio-upload-staging` only during separately approved hosted imports;
  publish only validated normalized output to UUID-versioned `onzio-media` paths.
- [x] Confirm every Database media reference belongs to the same tenant through
  composite keys.
- [x] Confirm no public URL uses `/storage/v1/render/image/` or `/_next/image`.
- [x] Plan source, normalized, uploaded, reused, linked, retired, and failed
  counts; all totals must reconcile.
- [x] Plan idempotent retry and compensating cleanup for Database/audit failure.
- [x] Preserve source media; no source deletion is part of this epic.

## Bunny.net Stream Readiness

Known snapshot video sources:

- Homepage hero: `media/video/homepage-hero-edited.mp4`
- Vertical story: `media/video/club-reel-portrait.mp4`

The files were inventoried during `DCFC-101`, but the platform currently has
no completed Bunny upload, validation, reference, poster, deletion, fallback,
or monitoring implementation. `PF-004` also records that the proposed external
video reference differs from the image `media_assets` model.

Before either video can be used, a separately approved capability must define
and verify, without borrowing image rules:

- accepted formats/codecs
- maximum bytes, duration, and dimensions
- credential/account ownership and tenant scoping
- authorization and upload flow
- provider video ID/reference validation
- poster ownership and fallback behavior
- processing/ready/failed states
- replacement, deletion, retry, and reconciliation
- delivery allowlist, privacy, cache, cost, and monitoring
- database/reference model resolving `PF-004`
- desktop/mobile/reduced-motion/failure acceptance

`DCFC-D114` selected the first of these honest dispositions for this rollout:

1. hide or replace each video-backed section with specifically approved static
   presentation; or
2. block `DCFC-403` and later rollout packages on a separate video-capability
   epic.

The approved choice hides both video-backed assets/sections; it does not
authorize Bunny.net account, library, upload, credential, or deletion actions.

## Import and Reconciliation Gate

- [x] Final content and media manifests have immutable digests.
- [x] Two independent local planning runs produce identical output/digest.
- [x] Local import and identical replay produce the same tenant state.
- [x] Table row counts and singleton presence match the manifest.
- [x] Composite relationships, slugs, sort order, and visibility reconcile.
- [x] Source/normalized/uploaded/reused/object/asset/reference counts reconcile.
- [x] Every published object checksum matches the planned normalized checksum.
- [x] The published presentation document digest and section/route inventory
  match the approved manifest.
- [x] Hidden routes/sections and rejected placeholders are absent.
- [x] Rollback/reset removes or restores only Diverse City artifacts and leaves
  Alpha/Bravo/Rose City evidence unchanged.
- [x] Hosted mutation count remains zero through `DCFC-404`.

## Approval Record

Accepted on 2026-08-01. `DCFC-401`–`DCFC-404` record:

- final content approver and date
- final media-rights approver and date
- video disposition
- immutable manifest and plan digests
- local import/rollback evidence
- exact unresolved hosted-input blockers and deferrals in
  `ROLLOUT-INPUT-APPROVAL-MANIFEST.md`

## Staging Import Record (`DCFC-503`)

Christian separately approved `DCFC-503` on 2026-08-02 for Supabase staging
project `fxefqnoqxbezeccjvrsw`, tenant
`d88bf71b-9820-49ae-9dc0-7556b0813885`, and the exact immutable semantic
digest recorded above. That approval is exhausted.

The hosted import revalidated and normalized all ten retained sources locally,
staged each normalized output in private `onzio-upload-staging`, downloaded it
for checksum verification, published it once to the translated tenant UUID path
in `onzio-media`, and removed the staging input. Exact database and object
checksum/path/byte counts match; the final private staging and cleanup queue
counts are zero. An identical replay staged and removed ten fresh private
copies, reused and checksum-verified all ten public objects, and changed no
approved database row, object, pointer, state fingerprint, or import-audit
count. No raw source, excluded image, SVG, video, runtime transformation,
optimizer URL, temporary registration URL, or preview-only fact was uploaded
or referenced. Full counts and presentation evidence are in
`STAGING-ACCEPTANCE.md` and `STATUS.md`.

## Production Import Record (`DCFC-802`)

Christian separately approved `DCFC-802` on 2026-08-07 for Supabase
production project `ioalthwsdrlzrubomrow`, tenant
`d7a41762-5158-496e-b415-c83c01ab5c70`, and the same immutable semantic
digest recorded above. This approval is exhausted.

The hosted import reused the identical approved plan and normalized all ten
retained sources locally, staged each in private `onzio-upload-staging`,
checksum-verified, published once to the translated production tenant UUID
path in `onzio-media`, checksum-verified again, and removed the staging
input. Final counts match the plan exactly: 10 media assets, 4 Programs, 1
presentation document, 1 import-audit row. A second identical run of the
guarded database step reproduced the same result with no duplicate audit
row, proving idempotency for real (not only simulated). No raw source,
excluded image, SVG, video, runtime transformation, optimizer URL, or
preview-only fact was uploaded or referenced. Rose City confirmed
unchanged. Full counts and evidence are in `PRODUCTION-CUTOVER-ROLLBACK.md`
and `STATUS.md`.
