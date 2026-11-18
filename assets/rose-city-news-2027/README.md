# RC2027-NEWS local seed inputs

`scripts/seed-rose-city-news-2027-local.ts --execute-local` publishes the Foothill Transit article
to the isolated local Rose City rehearsal only. Its cover is cropped from Sam's article mockup,
because his Dropbox has no separate locker-room photo; Christian chose to use the crop until Sam
sends the original (2026-11-04). The owner replaces it in Admin → News.

`manifest.json` records the source and hashes. The seed writes `local-import-receipt.json`.

`scripts/seed-rose-city-news-2027-placeholders-local.ts --execute-local` adds four placeholder
articles (one per remaining category), each with its own copy of the same cover. It writes
`local-placeholder-receipt.json`.
