# Issue #47 Programs page evidence

This capture compares `origin/main` at `29c66f3` with the #47 implementation at `7ac6a06` for `/programs` and `/programs/alpha-academy-pathway`, at desktop (1440×900) and phone (390×844) sizes.

Both revisions were local production builds. Playwright ran with `scripts/with-local-db-lock.sh` against the synthetic Alpha tenant and loopback Supabase. The capture blocks non-loopback requests, non-read HTTP requests, service workers, and WebSockets. It supplies an empty script response only for the local Vercel Insights request.

All eight requests returned HTTP 200. The list and detail page header, main, footer, and link hashes match between revisions at both sizes. Screenshot pairs are byte-identical. Each route/viewport pair loads five font resources (173,316 decoded bytes; 174,816 transferred) and performs one GET each for `programs`, `program_media`, `contact_profile`, and `site_social_links`. The capture recorded no page errors, resource errors, or blocked requests. These counts and hashes are in `programs-capture.json`.

The before/after screenshots are:

- `base-desktop-list.jpg`, `head-desktop-list.jpg`
- `base-phone-list.jpg`, `head-phone-list.jpg`
- `base-desktop-detail.jpg`, `head-desktop-detail.jpg`
- `base-phone-detail.jpg`, `head-phone-detail.jpg`

The capture used `tests/browser/site07-programs-evidence.spec.ts` and `tests/browser/site07-programs.config.ts`. No hosted service was contacted.
