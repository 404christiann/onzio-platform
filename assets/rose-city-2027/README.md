# Rose City2027 reviewed media inputs

This is a portable source bundle for the approved homepage. It contains **30 raster inputs, approximately4.07MB**, a logical-name manifest and a deterministic preparation script. It is not a completed tenant content import or a set of public storage URLs. Originals remain read only in the separate approved-preview workspace; no original12MB player,10MB video, full-page design raster or system font is copied into the repository.

`manifest.json` maps each logical name to its repository-relative `inputPath`, normal-pipeline `kind`, actual MIME, decoded dimensions/alpha, bytes/SHA256, source IDs/revisions where available, original read-only path/SHA256, processing receipt and section assignment. Temporary download URLs and account-sharing payloads are excluded. The original six sponsor inventory is preserved plus Christian's selected Tepito source; the selected source replaces the prior Tepito in the current carousel.

## Approved presentation

- White continuously rotating sponsor row on desktop and phone; six retained sponsors in original order: Chronic Tacos, Modern Woodmen, Niky's, Planted Beauty, selected Tepito, TPA. Duplicate animation set is hidden from accessibility; reduced motion exposes one stationary, horizontally scrollable set.
- The TPA source remains unchanged. Apply its approved inversion in the renderer. Chronic Tacos' original red strip remains unchanged; the approved near-white-lettering-to-dark filter is also renderer-owned. No permanently altered/generated logo is included.
- Raffle and Robinson Stadium ticket/map are complete static image sections. No click/enlargement behavior or hover treatment. The supplied ticket/map stays until its content visibility is disabled through the admin control.
- Approved single Bunny hero loops muted/inline without visible controls. All seven actual match photos automatically rotate in source order **3,1,2,4,5,6,7**, without visible controls; reduced motion/hidden-tab rules remain. The hero video is external configuration, not a bundled MP4. Direct CDN delivery currently requires the player referrer, so production/native playback must be verified deliberately.
- Player is the supplied2027 transparent Foothill Transit jersey cutout. The earlier temporary shop player is omitted.
- Footer uses existing social-icon paths with the approved Instagram gradient, Facebook blue, TikTok cyan/pink on black, YouTube red and X black. Included social PNGs are unchanged existing-path raster masks for normal-media compatibility, not recolored replacements. The repository's existing SVGs remain available for code-native presentation; do not upload raw SVG through the media pipeline.
- Powered by Onzio has full opacity1, dark text/wordmark on white, a real `https://onziofutbol.com/` link and no hover effect. Its original white wordmark is unchanged; dark presentation is renderer-owned CSS inversion.

The reference PNG/JPG/brand-image originals stay outside this bundle at the approved-preview `references/` paths. Do not use the full-page image as application content. Match-card date/opponent/pricing copy in the approved visual reference was sample content; real Next Home Match remains Schedule-backed, with an honest empty state. The Ventura County sample crest was unresolved and is not included or substituted.

## Preparation and limits

Inputs are PNG/WebP graphics or JPEG/WebP photos. They fit the existing media validator: graphics at most3000px per dimension/5MB; photos at most6000px/15MB; all below36million decoded pixels. Only the raffle required another proportional resize: approved preview2400×3180 becomes2264×3000, WebP quality95. No content crop/recoloring occurred. Everything else is an exact copy of an approved processed derivative or original versioned sponsor asset, except existing SVG icon masks rasterized at192×192. Alpha is retained.

Rebuild without network, database or provider operations:

```sh
node assets/rose-city-2027/prepare-bundle.mjs --source-root '/absolute/path/to/approved-preview'
```

The script requires the repository's normal `sharp` dependency. An optional `--dependency-root` selects an existing local development runtime while this isolated worktree's dependencies are being installed. Rebuilding reads source files and writes only this bundle. It verifies actual decoded metadata and the documented format/size/dimension gates.

`verification.json` records that **all30 inputs passed the actual repository `lib/media-validation.ts`**, unchanged, with matching SHA256/bytes/dimensions/alpha. The check compiles that existing TypeScript module and its existing contract-error helper in memory, using the installed normal `sharp` runtime. It performs no database/provider writes and does not weaken or replace the validator.

```sh
node assets/rose-city-2027/verify-bundle.mjs
```

Re-run verification after rebuilding or changing the manifest. The later import must still run authoritative media validation/normalization with trusted tenant authorization and commit its normal ownership/reference receipts; this preparation receipt does not bypass it.

## Fonts and release dependencies

MuseoModerno's official variable TTF is in `public/fonts/museomoderno/MuseoModerno.ttf`; use weight900, with preserved SIL OFL at `public/fonts/museomoderno/OFL.txt`. Existing LEMON MILK BoldItalic and its notice remain at their existing `public/fonts/lemon-milk/` paths; a commercial-use receipt has not been verified. Avenir Medium was local-only in the approved Mac preview. No system TTC or unlicensed Avenir webfont is included; licensed portable Avenir remains a release dependency. No separately editable Phosphor typography is required by the current approved homepage; relevant lettering is already baked into supplied artwork.

This package performs no uploads, seeds, database mutations, provider configuration, deployment or billing changes. Its source/format checks are asset preparation evidence, not proof of completed local import or live delivery.

Supplied2026-10-13 ZIPs are now inspected. Avenir Medium can render from an
ignored local-only font input; it is excluded from deployment uploads and is
not a licensed portable release asset. LEMON MILK BoldItalic already matches
the supplied ZIP. See `docs/rose-city-2027-fonts.md`. Launch is on hold.

## Foothill white-lettering derivative

Trusted source: workspace assets/originals/foothill-official.svg. Lettering paths1,2,3 alone changed blue to white; geometry, emblem and alpha preserved exactly. Prepared SVG/8x transparent PNG and provenance remain in workspace assets/prepared. App runtime uses public/images/cinematic/foothill-white.png; provenance is in foothill-white.provenance.json. Original configured partner image remains in the white mobile dialog.

## Foothill blue-lettering transparent variant

Exact original SVG rasterized at8x, without geometry/fill edits, to public/images/cinematic/foothill-blue.png. Blue SVG/PNG and provenance remain in workspace assets/prepared; app provenance is foothill-blue.provenance.json. Blue is used by the restored white header and mobile dialog; white variant remains saved.

## Safari review: higher-resolution official episode poster

Episode input now uses the same approved YouTube video's maxresdefault.jpg1280x720 (original480x360 retained in the workspace). Exact source copied, no generated detail or resizing. Full source hash/provenance is in manifest.json. All30 inputs pass the existing validator. The local-only scoped update script publishes only this poster and preserves all other content; the seed's poster upload identity includes its checksum. Match originals remain1200x670 (photo1:1500x837); larger photographer exports and avoiding the extra preparation compression pass are the next quality work.
