# Issue #51 About page evidence

The captured application revisions are base `eb82ba3e344000e72839088a39fd46e00b1536b3` and About implementation `29e0327075f832ca2bee39adefb6e781530bfa42`. Both were fresh local production builds. The route is `/club/about`, viewed at desktop 1440x900 and phone 390x844.

## Actual Alpha content

`about-capture.json` labels this scenario `actual-alpha-empty`. The synthetic Alpha tenant has no authored About content. The four screenshots compare the existing empty state, not a populated story. Both desktop and phone screenshot pairs are byte-identical. Header, main, footer and link hashes match, and page/resource/blocked-request errors are empty.

## Populated contract fixture

`populated-fixture/about-capture.json` labels this separate scenario `populated-fixture`. It records the complete synthetic payload derived from the valid About fixture in `tests/database/about-content-policy.test.ts`. The story, values and closing CTA render through the unchanged application code.

The test-only Node preload `tests/browser/site07-about-populated-preload.cjs` supplies that payload only for the exact Alpha `GET /rest/v1/about_page_content?select=*&club_id=eq.11111111-1111-4111-8111-111111111111&limit=1` request. It requires an explicit fixture-mode flag. All other server fetches are restricted to loopback read requests. Forwarded requests use manual redirects and reject every 3xx response, so a local URL cannot redirect the server to a hosted destination. The regression covers exact-tenant interception, other-tenant forwarding, write rejection, hosted-target rejection and redirect rejection. No database row is written.

The first populated capture passed DOM, link and resource gates, but inspection found screenshot differences confined to the header's active scroll transition. That initial attempt was not accepted as full screenshot parity. The capture now scrolls instantly, waits for the actual header's computed geometry, transform and opacity to settle with no running header animations, and requires complete screenshot hashes to match. It hides or normalizes no image pixels. The final strict populated rerun passes at both widths. Complete base/head screenshot bytes are identical, and the manifest records each image hash and the settled header state. The saved desktop and phone captures were inspected after that rerun.

## Resources and capture boundary

Each recorded page loads five fonts, 173,316 decoded bytes and 174,816 transferred bytes. Browser GET counts match for `contact_profile`, `programs`, `site_social_links` and `program_media`, one each. Server-rendered About reads are separate from those browser counters. The final populated run recorded three exact fixture GETs per server, including readiness requests, in `serverFixtureGets`.

The capture spec blocks non-loopback and non-read browser requests, WebSockets and service workers. It supplies an empty response only for the local Vercel Insights script. Each complete build/server/capture sequence runs under `scripts/with-local-db-lock.sh`. Both owned servers stop after capture. No hosted service or database mutation is part of this proof.

The scoped runner is `tests/browser/site07-about.config.ts`, which collects only `site07-about-evidence.spec.ts`. Set its `SITE07_ABOUT_BASE_URL`, `SITE07_ABOUT_HEAD_URL`, revision IDs and output directory to the two known local builds. For populated coverage, start both servers with `SITE07_ABOUT_POPULATED_FIXTURE=1` and a Node `--require` of the preload, and set the capture's `SITE07_ABOUT_SCENARIO=populated-fixture`. The fixture changes test-server responses only.

## Remaining acceptance

Both actual-empty and populated-fixture screenshot comparisons pass. Full coordinator verification and independent review remain pending at the final integrated revision. The fixture's feature-image URL is empty, so these screenshots do not establish populated photograph behavior. Public and existing preview callers share the moved component; no new preview surface or editor behavior is introduced.
