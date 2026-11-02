# Issue #50 Roster, Schedule and Standings evidence

This capture compares base `eb82ba3e344000e72839088a39fd46e00b1536b3` with application head `1a622839a83915af0224bb8c2b1fbae4a0b0f8c7` for the homepage, `/roster`, and `/schedule` at desktop (1440×900) and phone (390×844). The homepage remains the declared Standings content destination; no Standings route was added. Both production builds ran under `scripts/with-local-db-lock.sh`. The Playwright capture used `tests/browser/site07-competition-pages.config.ts` and HTTP loopback origins only.

All twelve route/viewport/build captures passed. Normalized main-markup and link hashes match, as do the screenshot pairs byte-for-byte. Font counts and bytes, Supabase GET counts, and resource errors match. There are no page errors. The manifest records Bunny playback GETs as blocked media; no CDN request reaches the network. Other non-loopback requests, service workers, WebSockets, and non-read HTTP requests are blocked.

The JSON manifest contains revisions, routes, viewport sizes, link lists, resource counts, blocked media, and errors. No hosted service was contacted.
