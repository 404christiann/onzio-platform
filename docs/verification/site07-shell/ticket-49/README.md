# Issue #49 Sponsors and Shop evidence

This capture compares the pre-move base `eb82ba3e344000e72839088a39fd46e00b1536b3` with application head `7e63a840a99ecde818af75a6bb8b70af2575b8cd` for `/sponsors` and `/shop` at desktop (1440×900) and phone (390×844). Both production builds ran under `scripts/with-local-db-lock.sh`. The Playwright run used `tests/browser/site07-sponsors-shop.config.ts` against HTTP loopback origins only.

All eight route/viewport/build captures passed. Base and head DOM/link hashes and screenshots match byte-for-byte. Font counts and bytes, Supabase GET counts, and resource errors match. There are no page errors or unexpected blocked requests. The harness blocks non-loopback and non-read HTTP requests, service workers, and WebSockets; it stubs only the loopback Vercel Insights script.

Local Alpha has no Shop rows, so the capture supplies the labeled, read-only `Home kit pilot` response fixture from `tests/browser/homepage-editor-home-kit.spec.ts`. It serves only `shop_kit_section` and `shop_kit_photos` GETs for Alpha's `shop` surface. The expected home, third, and away reads are recorded for base and head and are unchanged. No database rows were written. This comparison proves no added kit-variant reads; it does not assert that the existing read set is minimal.

The JSON manifest contains revisions, routes, viewport sizes, link lists, resource counts, fixture reads, and errors. No hosted service was contacted.

## Sponsors editor correction

A later independent review found that the extraction changed the Sponsors editor's compact homepage-carousel preview into a full Sponsors page. The closeout correction restores the editor file byte-for-byte to base `eb82ba3`. The public Sponsors and Shop implementations and their recorded capture inputs are unchanged by this correction.

The regression guard fails on the incorrect full-page preview and passes after restoration. Component render checks confirm that an empty compact carousel renders nothing and a populated one renders compact sponsor logos without a page hero. TypeScript and lint pass; three focused contracts pass 78 tests, Academy route architecture passes 5 tests, and changed tests pass 104 across five files.

No authenticated editor browser acceptance was run for this correction. Source equivalence and component render checks establish the restoration; the screenshots above remain public-route evidence at their recorded application head. Independent corrected-head review and the coordinator's complete final verification are pending.
