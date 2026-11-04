# Approved Rose City Crest 2027 inputs

Christian approved the desktop reference preview and the phone refinement
placing each patch, heading and icon on one line, then requested implementation
on 2026-10-13. The original reference and all 30 Dropbox Our Identity files
remain unchanged in the outer workspace. Only needed assets are packaged here.

20 graphic inputs: annotated crest diagram, six feature patches, six detail
icons, Pasadena map and six official color images. Source IDs/revisions/hashes:
provenance.json. Input dimensions/hashes/transforms: manifest.json. Local
publication identities: local-import-receipt.json. Actual input validation and
delivered-byte checksum evidence: verification.json (20/20).

prepare-assets.py reproduces the lossless inputs from the outer originals;
run from the app checkout. Patches/icons use alpha-only padding trim. Color
images and map keep original geometry/colors. The absent diagram is authored
from the untouched master with the approved label/leader-line coordinates;
the absent Stem icon uses the exact master pixels and the same green-to-alpha
display matrix as the prototype. No generated crest details or redrawn logo
paths. Source graphics receive exactly one normal platform normalization pass.

The existing Logo fields store the annotated diagram as one replaceable image,
and all six patch/icon/title/description records remain admin-editable. The
approved Stem description is explicitly placeholder copy, not invented club
history. Other descriptions follow the supplied reference and are not
independently researched assertions. Generic page title/subtitle are fixed
presentation labels; selecting the heading in admin explains Onzio ownership.
No schema, authorization, revision/receipt, recovery or media-retirement changes.

scripts/seed-rose-city-crest-2027-local.ts --execute-local refuses hosted APIs,
requires the existing Rose City test tenant on port55321, refuses any existing
Logo row and publishes through the normal validation/staging/media pipeline.
It initializes only this local Logo page, with an INSERT that cannot overwrite
an intervening edit. About/homepage/branding preservation is checked explicitly.
Do not use the broad homepage seed to initialize this page.

User launch hold and existing local-only font packaging boundary still apply.
This bundle is not authorization for hosted database writes or production launch.
