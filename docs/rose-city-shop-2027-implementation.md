# Rose City 2027 Shop implementation

RC2027-SHOP: source/local browser acceptance complete, 2026-10-13. Christian approved the reference preview, reduced lead zoom and tighter six-player spacing, then requested implementation and complete admin ownership. Production launch and site-wide physical-phone acceptance remain open.

Public: `/shop`. Editor: `/admin/shop` → Shop page. Only registered `cinematic@2` dispatches to the new shared `CinematicShop` renderer; existing templates and the separate Homepage shop feature retain their behavior. The established site shell supplies the single header/footer.

The accepted lead uses 80% width with 5% headroom. Six original red player cutouts retain reference order and zero grid gaps; phone uses three columns. Home/Away selects each kit's existing content and original gallery. Both purchase buttons retain the existing Niky's product destination. The normal sponsor carousel uses the existing tenant-owned logos and treatments.

## Content and media ownership

The Shop canvas supports kit headings, descriptions, bullet points, store information, both button labels/destinations, main photos, player-row upload/order/removal, all four purchase cards and footer copy. New controls cover map replacement/removal, description, visibility and percentage crop; sponsor heading/visibility; tab labels, row description, empty-state copy and lead framing. Multiline card bodies preserve address line breaks. Sponsor logos remain editable through the linked existing Sponsors editor.

`onzio.cinematic_shop_content` stores settings and a composite tenant/media foreign key for the map. Public URLs and dimensions are hydrated from published, unretired media; they cannot be persisted in the client save payload. The map uses the original PNG through the normal graphic publication pipeline, with crop performed only in CSS. `shop-artwork` is a compatibility alias for Shop graphic uploads.

Migration `20261112020000_cinematic_shop_page_content.sql` extends the existing Shop snapshot/save transaction and revision. It preserves fresh-session authorization, RLS, design/version checks, actor-scoped idempotent receipts, request hashes, recovery, conflict rebase and post-commit reference-aware cleanup. Settings are accepted only for the cinematic@2 Shop surface. Homepage saves cannot write them. Late failures roll back kit, purchase, map, revision and receipt together. Direct writes validate crop/settings and the same-club published Shop graphic. Media reference guards prevent retiring a referenced map.

## Local import and verification

The 15-input manifest preserves original source hashes. Home lead preparation uses only the approved alpha crop, lossless PNG, followed by one normal publication normalization. Old Home/Away gallery and Away lead inputs are exact original copies. `seed-rose-city-shop-2027-local.ts` refuses hosted endpoints, wrong tenant/ports, and existing Shop content; it protects Homepage, About, Crest, branding, sponsors, matches and Tickets. The seed published all 15 normally and verified delivered checksums. It wrote no hosted data.

Actual local admin saves were checked for kit copy + sponsor heading, map visibility, phone tab labels, phone player order and multiline card bodies. Each was reloaded and verified publicly, then restored. A real map replacement went through authorization, staging, finalization, conflict rebase and atomic Save. It uses the same original image bytes with a new published identity; the former unreferenced map retired normally. All 14 kit image identities and the reference player order remain intact. Final direct database verification confirms all approved content/settings restored and all 15 current delivered checksums match the media ledger.

CUA checked actual public desktop1280 and phone390/320: no horizontal overflow, Home/Away operation, six original red photos, crop and sponsor loading, unchanged purchase links and one site shell. Actual admin desktop1280 and phone390 Save/reload work; phone sheet Save is reachable and the separate Homepage surface has only its own controls. Public/admin share the same renderer. These viewport checks do not establish physical iPhone/VoiceOver acceptance.

TypeScript/build/lint pass, generated types match the isolated local schema including Tickets, and all 1933 tests in 211 files pass. New tests cover schema/model/renderer parity, atomic rollback, receipts/recovery, cross-tenant/retired/wrong-kind media rejection, direct-writer RLS and reference-safe retirement. Existing auth/API timing failures encountered in earlier repeat runs were rechecked without weakening or skipping assertions.

Evidence: outer `review-notes/shop-2027/implemented/` contains browser checks, screenshots and `persistence.json`. Logs: `/private/tmp/rose-city-shop-{build,full}-final.log`. Local app: `http://rose-city.localhost:3198`. No commit/push, hosted migration/content write or deployment. Tickets chat was read and coordinated before shared schema/build/runtime operations; its final CSS and acceptance evidence were preserved. Next: user review of the implemented Shop; physical-phone and production release gates remain separate.
