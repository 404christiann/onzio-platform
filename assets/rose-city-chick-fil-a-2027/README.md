# Rose City2027 Chick-fil-A inputs

Prepared8 authentic assets for the accepted cinematic@2 Food & Beverage page. `manifest.json` records source/input SHA256, dimensions, byte counts, slot, normal upload purpose/surface/kind and every preparation operation. `copy.json` contains reference-derived editable copy with null asset references; the main-owned local seed must replace these with normal tenant-owned published media IDs.

Run `node assets/rose-city-chick-fil-a-2027/prepare-bundle.mjs` from the application checkout. This command prepares files only; it never uploads, writes content or touches a database.

- Meal pass and seat background preserve original PNG bytes. Dedicated map comes from the exact supplied Chick-fil-A route JPG, decoded to lossless PNG at original2484×1156. Partner crop uses original pixels132,590,805,181, excluding empty canvas.
- Three icons come from existing lossless original-pixel preview strips; decoded to PNG without a further lossy encode. Their exact original crop/resize history is preserved in `source-receipts.json`. The Free Game Ticket original is misnamed `.png` but actually PSB v2. Its original119943632bytes remain in outer assets; merged composite extraction and visual/source hash evidence are documented there. No PSB is handed to the upload validator.
- Restaurant input is the exact original2484×1422 PNG (2313985bytes), with no resize or recompression before the existing photo publisher. Restaurant uses homepage/photo; other slots use homepage/graphic. All prepared inputs fit existing limits; publication performs one normal normalization.
- Original logo/seat provenance and cached metadata are documented in outer `design-explorations/chick-fil-a-2027/supporting-source-metadata.json` and prior source receipts; no guessed artwork or production extraction.
- Actual supplied Phosphor W00 WOFF2 is copied only to new `public/fonts/phosphor-w00/Phosphor W00.woff2` (19936bytes; SHA2564ae4ada359b2db1107a8037e0af2de5c08c712c814cf9ee5821588cc4bb86a7a). Name tables match supplied TTF, Regular400. Archive/member hash/source metadata in `font-source.json`; no bundled executable/demo was used. Current local work does not establish hosted redistribution rights.
- Details color remains approved#CA2F3B, sampled from the original meal-pass red. Other reds remain#FF0018. No global font or palette replacement.

Scope: local integration only. No deployment/hosted write/commit/push authorization. Main owns seed/import execution, migration/type generation and normal pipeline verification. Existing Tickets/Shop/Homepage media identities must remain intact.
