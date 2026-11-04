# Crest card 7: Sub-Mark

Sam's Crest reference was updated in Dropbox on 2026-11-01 with a seventh card,
"Sub-Mark". Christian asked for it on 2026-11-04. These are its inputs.

- `inputs/patch7.png`: `Our Identity/Rose City FC Sub-mark.png`, with the
  transparent margins trimmed and the image scaled to 2700px wide, because
  graphic uploads are capped at 3000px.
- `inputs/icon7.png`: `Our Identity/Rose City FC Red Rose Outline.png`, with the
  transparent margins trimmed.
- Card text is transcribed from the reference: title "Sub-Mark", description
  "RCFC is Rose City Futbol Club abbreviated. Rose City FC’s red Rose outline.",
  icon size 56.

The unchanged originals are kept in the outer workspace at
`assets/originals/identity/`. Source and input checksums are in
`manifest.json`, and the local publication record is in
`local-import-receipt.json`.

**Gap:** Sam's heading shows an italic "RCFC" wordmark after the outline icon.
No standalone file for that wordmark is in Dropbox, and the feature has only one
icon slot, so the card shows the outline only.

`scripts/add-rose-city-crest-submark-local.ts --execute-local`:

- runs only against the loopback rehearsal on port 55321 and the Rose City test
  tenant;
- refuses to run if the Crest page is missing or already has a Sub-Mark card;
- publishes both images through the normal media pipeline;
- appends the card only if the row hasn't changed since it was read;
- checks that About, homepage, branding and hero rows are unchanged.

The existing database triggers serialize the write and advance the Logo editor
revision, so an editor tab opened on the older version gets a conflict instead
of overwriting the card. The card stays fully editable in the Logo editor.
No hosted writes.
