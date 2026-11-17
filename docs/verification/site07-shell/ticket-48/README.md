# Issue #48 page evidence

This capture compares the pre-move base `bcc002be38467e9cb19126babbe7dce87391a52f` with code head `f7249a5fb90db633551226d4c92ad2780ca3064e` for Academy `/contact` and `/tryouts` at desktop (1440×900) and phone (390×844) sizes.

Both revisions were ordinary local production builds run under `scripts/with-local-db-lock.sh`. The Playwright capture used the committed `tests/browser/site07-contact-tryouts-evidence.spec.ts`. It accepted only HTTP loopback origins, blocked non-loopback and non-read requests, blocked service workers and WebSockets, and supplied an empty JavaScript response only for the loopback Vercel Insights script. No hosted service was contacted.

The capture passed. All eight records have HTTP 200, matching base/head hashes for header, main, footer, and links at each route and viewport, matching font count and byte totals, matching Supabase GET counts, and no page or resource errors. The JSON manifest contains the complete link lists, resource counts, errors, revisions, and screenshot names. The screenshot pairs are byte-identical because the page content and rendering are unchanged by this page-ownership move.

The screenshot set covers both routes and sizes for both revisions. `contact-tryouts-capture.json` is the machine-readable record.
