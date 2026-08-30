# Diverse City FC Phase 4 Media Source Inventory

Epic: `DCFC-EPIC-002`

Package: `DCFC-402`

Status: `accepted_and_rehearsed`

Last updated: 2026-08-01

## Boundary and Source Identity

- Source repository:
  `/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site`
- Approved source commit:
  `5bbdfa33d59163b218bbd33745f9cfd4a66d379f`
- Source worktree at inspection: clean
- Inspection method: read-only `file`, `stat`, `sips`, `ffprobe`, and
  `shasum -a 256`
- Hosted mutations: zero

Every row below identifies immutable local source bytes. Christian confirmed
rights/current use for all ten retained assets on 2026-08-01; excluded rows do
not receive a rollout destination. No row authorizes a hosted upload or
source-file change.

## Currently Rendered or Referenced Assets

| Source path | Bytes | Detected type | Dimensions | Alpha | SHA-256 | Current role | Recommended production disposition | Rights/evidence owner |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| `media/about-team-lineup.webp` | 368250 | `image/webp` | 1800x1201 | no | `c442901a981124e8c63f60fdaa0613545774a86021d50879f2db4a51be16cca0` | About lineup | Import as a normalized photo | Christian confirmed rights/current use, 2026-08-01 |
| `media/affiliations/fifa-color.png` | 134389 | `image/png` | 2440x900 | yes | `707a94d1a299b0f49edea8ff35ce0b9dc1902c1c3883aefea643667dad6d25da` | Snapshot navigation affiliation mark | Exclude; Academy has no content-driven affiliation renderer | Separate capability/rights decision if later required |
| `media/affiliations/fifa-white.png` | 134313 | `image/png` | 2440x900 | yes | `29f0f5c25c3f08f9547b6c0da20520d8c5cd39fa3f77df87275fd6cb2e02b2ea` | Snapshot navigation affiliation mark | Exclude; Academy has no content-driven affiliation renderer | Separate capability/rights decision if later required |
| `media/affiliations/upsl-color.png` | 433300 | `image/png` | 954x900 | yes | `00add943501bef56884ea84dcff9e496c17db3b64b1a6c147bcc314ee3adf68f` | Snapshot navigation affiliation mark | Exclude; Academy has no content-driven affiliation renderer | Separate capability/rights decision if later required |
| `media/affiliations/upsl-white.png` | 113592 | `image/png` | 954x900 | yes | `7b024366a525123554a9e2f6cf76a7d5d27f022646c5b3afd9f4b2b360bb3ae5` | Snapshot navigation affiliation mark | Exclude; Academy has no content-driven affiliation renderer | Separate capability/rights decision if later required |
| `media/affiliations/us-soccer-color.png` | 135936 | `image/png` | 954x900 | yes | `f01e38ed81f4e010e5114d14bab1ec91265beef0d503078107021950fec1ee4d` | Snapshot navigation affiliation mark | Exclude; Academy has no content-driven affiliation renderer | Separate capability/rights decision if later required |
| `media/affiliations/us-soccer-white.png` | 40005 | `image/png` | 954x900 | yes | `abdfa90da7881e6522ba37638db3f1e997767c0ac9cf2de5d94df2df9eae186a` | Snapshot navigation affiliation mark | Exclude; Academy has no content-driven affiliation renderer | Separate capability/rights decision if later required |
| `media/crest.png` | 326141 | `image/png` | 750x750 | yes | `d626e62bc58ea37a8a1b9ad20e9bd0bd11c03a9cf386f643a512bb39caa1c326` | Crest, favicon, navigation, footer, match, standings | Normalize/import once and reuse through tenant-scoped references | Christian confirmed rights/current use, 2026-08-01 |
| `media/flags/ElSalvador.png` | 479 | `image/png` | 80x45 | no | `0325efeb9cd30269f18a30faaf848d0e6ee83118dcb0effbb821b0facd087862` | Preview roster nationality | Exclude while roster/staff are hidden | Not required unless official roster uses it |
| `media/flags/Guatemala.png` | 540 | `image/png` | 80x50 | no | `99bcd45fc224df973b378d21b5d825a9c2805e6d7a73bf45f8a7f7acdb6715e0` | Preview roster nationality | Exclude while roster/staff are hidden | Not required unless official roster uses it |
| `media/flags/Mexico.png` | 562 | `image/png` | 80x46 | no | `c0fdb027d455efda31d165351dbac9b2145fdca51aa1f9c9410a346b43bf1f2f` | Preview roster nationality | Exclude while roster/staff are hidden | Not required unless official roster uses it |
| `media/flags/USA.png` | 430 | `image/png` | 80x42 | no | `59ac434b97e6db8b4fcee5c8e1996995562747e76875625f0886f1936488b7c9` | Preview roster nationality | Exclude while roster/staff are hidden | Not required unless official roster uses it |
| `media/gallery/matchday-04.webp` | 385924 | `image/webp` | 1800x1200 | no | `6a74df62bc6a1944bf1d878a682c99ec637d459c40b2da3e95a8d96b5bc65a9d` | Special Kickers card | Exclude; one approved dedicated hero fills the normalized row's single hero reference | Not required |
| `media/gallery/matchday-06.webp` | 147926 | `image/webp` | 1066x1600 | no | `b6548a37c7107ae23b64af274689a5d4f6ada3a53c2bb9f09c5b898bc4530a59` | Men's Teams card | Exclude; one approved dedicated hero fills the normalized row's single hero reference | Not required |
| `media/hero.webp` | 362294 | `image/webp` | 2200x1369 | no | `cfd8146ebad38b74ed4f88ea8e01fd1d70353d6acd8c6c2cc9799b33dfca36c2` | Youth Academy card/hero and homepage Programs | Normalize once and reuse | Christian confirmed rights/current use, 2026-08-01 |
| `media/programs/mens-teams-detail.webp` | 212172 | `image/webp` | 1365x2048 | no | `d4c097b377804a1a0a355fff9ba0e1065407c4a8513b80986fcfa3899985f124` | Men's Teams detail | Import as a normalized photo | Christian confirmed rights/current use, 2026-08-01 |
| `media/programs/mens-teams-hero.webp` | 489252 | `image/webp` | 1920x1280 | no | `4304faa3407a13c275561c0de7b85464a2a30dc7ea2e0d00179f5714868c4c86` | Men's Teams hero | Import as a normalized photo | Christian confirmed rights/current use, 2026-08-01 |
| `media/programs/special-kickers-hero.webp` | 404524 | `image/webp` | 1440x958 | no | `576616dd7e07d7805ecba1011944aa030d7dedf64916195cfa9cac64e28b57b4` | Special Kickers hero | Import as a normalized photo | Christian confirmed rights/current use, 2026-08-01 |
| `media/programs/special-olympics-02.webp` | 466024 | `image/webp` | 1800x1198 | no | `3e572e54d53b317763441fc6955a231ed01788233da7abdb225e2aae76b33744` | Special Olympics card | Exclude; one approved dedicated hero fills the normalized row's single hero reference | Not required |
| `media/programs/special-olympics-hero.webp` | 691640 | `image/webp` | 2400x1957 | no | `a72af0d8e93fe3f028d3198ba5721b7502ffc304c793d8efb5169bc96d698036` | Special Olympics hero | Import as a normalized photo | Christian confirmed rights/current use, 2026-08-01 |
| `media/programs/special-olympics-slide-01.webp` | 480724 | `image/webp` | 1440x1440 | no | `b302f1f2d2c12a26908f1451d435da4e5bc054a409759cab3a3d0cc03429b463` | Snapshot-only Special Olympics carousel | Exclude; no reusable program-carousel relationship exists | Separate capability/rights decision if later required |
| `media/programs/special-olympics-slide-02.webp` | 379568 | `image/webp` | 1440x958 | no | `6f499e1802f60cedd80e57ad62b4d3339c594af782487ed3d5029362d89ca02e` | Snapshot-only Special Olympics carousel | Exclude; no reusable program-carousel relationship exists | Separate capability/rights decision if later required |
| `media/programs/special-olympics-slide-03.webp` | 476662 | `image/webp` | 2000x1334 | no | `7ad64432430397b0dc1ea03254b22c9d6729cc252af675b77f4d1d53c581c5fe` | Snapshot-only Special Olympics carousel | Exclude; no reusable program-carousel relationship exists | Separate capability/rights decision if later required |
| `media/programs/special-olympics-slide-04.webp` | 234648 | `image/webp` | 2000x1474 | no | `b56700f00e6da0bbb28100f826e28d7244629ec35fea0035ae51f68e5faf981a` | Snapshot-only Special Olympics carousel | Exclude; no reusable program-carousel relationship exists | Separate capability/rights decision if later required |
| `media/shop/back_jersey.png` | 2962160 | `image/png` | 1024x1536 | yes | `a094c5cfbd2939435e3ed42b4db36a12d45d9dbfed6d6bc7288482c5c1092917` | Shop back jersey | Normalize/import for confirmed contact-to-order use | Christian confirmed rights/current use, 2026-08-01 |
| `media/shop/front_jersey.png` | 2955869 | `image/png` | 842x1052 | yes | `365fffde453e02b2ac83f1ba5fe692cad1fef05214a93389d1c527a5f07a4909` | Shop front jersey | Normalize/import for confirmed contact-to-order use | Christian confirmed rights/current use, 2026-08-01 |
| `media/social/facebook.svg` | 605 | `image/svg+xml` | vector | yes | `09417fbcaeac1c5cf3ea354d3d0b40b68e70c419eb90619e970318c83349b140` | Contact/footer icon | Reject from media import; use an existing safe application icon or approved raster replacement | Operator implementation evidence |
| `media/social/instagram.svg` | 1701 | `image/svg+xml` | vector | yes | `990957a20b747bc784733a25a8dee74976502828b1c86764c4476d3116696155` | Contact/footer icon | Reject from media import; use an existing safe application icon or approved raster replacement | Operator implementation evidence |
| `media/social/x.svg` | 654 | `image/svg+xml` | vector | yes | `a624af5e89f493c901404993815ef36d33c196fe078f1a134568e3745f7b2ee8` | Contact/footer icon | Reject from media import; use an existing safe application icon or approved raster replacement | Operator implementation evidence |
| `media/sponsors/elsas-bakery.webp` | 48696 | `image/webp` | 720x720 | yes | `6ffc5fa371db4ca17f00a38388f18d2781bf04d3660cbdfff08fc46bd4f076bb` | Homepage and Sponsors logo | Normalize/import once and reuse | Christian confirmed relationship/rights/current use, 2026-08-01 |
| `media/sponsors/sponsor-placeholder.png` | 54309 | `image/png` | 2423x1251 | yes | `890e07d6c39542be62cb2686517d8600334a33028f161e694cd8f20d3af48737` | Two preview sponsor-opportunity cards | Exclude; no production asset or row | Not required |
| `media/video/club-reel-portrait.mp4` | 6561789 | `video/mp4` | 720x1280 | no | `aac0847abe38e9b95086d670338a28ea45cf14d5249a780d9f844cafe062f64f` | Homepage vertical story video | Exclude unless a separate video-capability epic completes | Pending `DCFC-D114` |
| `media/video/club-reel-poster.jpg` | 32155 | `image/jpeg` | 720x1280 | no | `5e28459243bdeef6c0fea11c943857b4b304b410470552356f507159d1d045a0` | Snapshot vertical-story poster | Exclude with the unsupported vertical-story section | Separate capability/rights decision if later required |
| `media/video/homepage-hero-edited.mp4` | 5286121 | `video/mp4` | 1280x720 | no | `78fb801880e4dc6f21b3d8a60e7978a98e66ca5fc0bc60dfe4dd5ae3bc4daf64` | Homepage hero video | Exclude unless a separate video-capability epic completes | Pending `DCFC-D114` |
| `media/video/keeper-save-poster.jpg` | 106571 | `image/jpeg` | 1600x900 | no | `801df56db843ddfe43baff5ecbf13aefded8385bfe1443fdf9d229025073b4c5` | Snapshot homepage hero poster/fallback | Exclude; current Academy hero has no media reference and uses the tenant crest | Separate capability/rights decision if later required |

## Supplied but Not Live in the Approved Route Composition

These files were inventoried so they cannot be mistaken for missing input.
They are excluded from the Phase 4 production recommendation unless an
approved visible role is added before the manifest is locked.

| Source path | Bytes | Detected type | Dimensions | Alpha | SHA-256 | Disposition |
| --- | ---: | --- | --- | --- | --- | --- |
| `media/gallery/matchday-01.webp` | 243762 | `image/webp` | 1800x1120 | no | `fca80c17e302348c04a3646f57b20e317766b01723fcf36b9ae3999e13750ba0` | Exclude; referenced only by dead `PhotoSequence`/sample data |
| `media/gallery/matchday-02.webp` | 238714 | `image/webp` | 1800x1200 | no | `a05ce8a3f520112dc8116e88ce00dec5bbeca2434c09d1062eb643c3d494db4e` | Exclude; referenced only by dead `PhotoSequence`/sample data |
| `media/gallery/matchday-03.webp` | 418616 | `image/webp` | 1800x1200 | no | `c06ec1066620cac4cb4e474dcba549c73cf1fc949ec2b0b48649b717224af5d3` | Exclude; referenced only by dead `PhotoSequence`/sample data |
| `media/gallery/matchday-05.webp` | 140812 | `image/webp` | 1024x614 | no | `2b8ac1fb59e41209afc800c4f4d5b048c79d956acec72efbafe93f13e8af7df8` | Exclude; referenced only by dead `PhotoSequence`/sample data |
| `media/gallery/matchday-07.webp` | 376880 | `image/webp` | 1200x1801 | no | `a31dd2655a8d6e368fce07212c92281030c640ae89259adba1a8c32591eb5e0b` | Exclude; referenced only by dead `PhotoSequence`/sample data |
| `media/gallery/matchday-08.webp` | 325116 | `image/webp` | 1600x1067 | no | `1553b4a43ad04c8fc3f47e8a8b415157b5c9eddfc0007711dd1e13c1a52720dd` | Exclude; referenced only by dead `PhotoSequence`/sample data |
| `media/video/keeper-save-landscape.mp4` | 6800470 | `video/mp4` | 1280x720 | no | `a012b92b2c87c938fbc4e985901d641d23218937addd14a84697766027a53efa` | Exclude; not referenced by the approved live route composition |

## Normalization, Destination, and Rollback Contract

- `DCFC-403` will assign deterministic local asset UUIDs and tenant-scoped
  `onzio-media/{tenant_uuid}/{surface}/{asset_uuid}/{version}.{extension}`
  destinations only after the content, rights, and video dispositions above
  are approved.
- Photographs normalize through the existing photo rules; transparent crests,
  marks, logos, and jersey art use the graphic rules. No source is upscaled.
- SVG social icons are prohibited media inputs and will not enter Storage.
- Duplicate source bytes are represented once and may have multiple
  tenant-safe content references.
- Rollback restores content/presentation references first, then removes only
  ledger-proven unreferenced local objects and rows.
- Source files are immutable inputs and are never deleted by this epic.

## Existing Destination Mapping

| Approved source role | Media surface | Content reference | Reuse rule |
| --- | --- | --- | --- |
| Club crest | `branding` | `site_branding.club_logo_path` + `club_logo_asset_id` | One normalized asset reused by all branding consumers |
| About lineup | `about` | `about_page_content.feature_image_url` + `feature_image_asset_id` | One feature-image reference |
| Program card/hero | `programs` | `programs.hero_media_asset_id` | One normalized asset may be the hero for one or more approved rows |
| Program detail | `programs` | `programs.detail_media_asset_id` | Only rows with an approved detail image receive a reference |
| Jersey front/back | `shop` | `shop_kit_photos.media_asset_id` and `shop_carousel_photos.media_asset_id` | Normalize each side once; reuse through multiple tenant-safe rows if Shop is approved |
| Elsa's Bakery logo | `branding` | `site_sponsor_logos.media_asset_id` | One normalized graphic reused by carousel/footer placements if approved |

There are no duplicate SHA-256 values among the 42 source files. Reuse above
means multiple references to one approved normalized asset, not duplicate
source bytes. Every mapped table enforces a composite `(club_id, asset_id)`
foreign key. Affiliation images, SVG social icons, program-carousel images,
video files, video posters, roster flags, preview sponsor art, and dead gallery
inputs have no Phase 4 destination under the corrected recommendation.

## Remaining Gate

`DCFC-402` cannot be marked complete until Christian or the club identifies
the publication-rights evidence owner for every recommended import, confirms
current affiliation/sponsor/shop facts, and accepts a `DCFC-D114` video
disposition. Normalized facts and exact local destination UUIDs are populated
and verified by `DCFC-403`; hosted evidence remains empty through `DCFC-404`.
