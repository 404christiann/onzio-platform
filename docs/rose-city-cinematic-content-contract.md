# Cinematic homepage revision 2 content contract

The approved Rose City homepage uses the registered `cinematic@2` presentation. Existing templates retain their renderers, homepage fields and six-photo limit. Only revision 2 enables seven match photos and the optional `HomepageDraft.revamp` content.

`lib/cinematic-homepage-content.ts` defines the public content, strict save schema, tenant-neutral defaults, fixed navigation IDs, scoped query and operator import serializer. The new singleton `onzio.homepage_revamp_content` stores editable copy in `content` and seven image identities in composite tenant/media foreign keys. URLs are derived from published, non-retired media for this tenant; clients cannot persist delivery URLs through the homepage save request.

Club editors can replace raffle, ticket/map and trophy images; show or hide the ticket/map; edit next-match heading, ticket button and no-fixture message; edit ticket-price options, descriptions and footnotes; edit championship copy; rename navigation labels; and edit the partner-section heading. Next fixture details still come from Schedule. Shop, sponsors, branding, source videos and kit content retain their existing owners.

Navigation labels use registered stable IDs. Renaming the Stadium group updates its header/footer label without changing the destination. New ticket-button destinations must be internal absolute paths and reject protocol-relative `//host` links. Supplied raffle and ticket artwork remain plain images on the public page.

Operator-only presentation inputs are the header partner, hero poster, seat background and episode poster images, Bunny source IDs and sponsor treatments keyed by existing tenant-filtered sponsor UUID. Table column grants and the save serializer exclude these inputs from club edits. They remain tenant-owned and participate in reference-safe media retirement.

The existing homepage transaction retains its advisory lock, tenant/session authorization, revision conflict checks, actor-scoped idempotent receipt and post-commit cleanup. New content changes advance the same revision and audit trail. A failed image or later section write rolls back the entire operation. Recovery merges only fields changed relative to the recovered baseline, preserving newer unrelated ticket prices and server-owned presentation data; changed ordered lists replace that list. Artwork replacements participate in upload readiness, retry, durable draft recovery and unsaved-upload cleanup.

New artwork uses the secure `homepage-artwork` client mapping to the established homepage/graphic upload pipeline. Photo slideshow uploads retain homepage/photo behavior. Graphic replacement accepts PNG or WebP, up to the existing 5 MB and 3000-pixel-per-side bounds, and preserves alpha. The imported raffle artwork was proportionally prepared within those bounds.

Local verification runs against a separate loopback Supabase stack. `tests/helpers/local-postgres.ts` accepts only a validated local `SUPABASE_DB_URL`; without one it preserves the established local port 54322. Existing PostgreSQL suites use this helper without changing assertions, permitting the isolated revision-2 runtime on port 55322.

Focused coverage: cinematic capabilities/save schemas, trusted-template API gating, seven versus six photos, media hydration, prepared graphic authorization and alpha preservation, navigation-only recovery, atomic save/receipts, unknown version rejection, cross-tenant/retired media denial, readonly presentation columns and service-role import, plus existing homepage concurrency and reference-aware cleanup regressions. No hosted migrations or content writes are part of this implementation commit.

## Actual app browser verification

`playwright.cinematic-homepage.config.ts` and `tests/browser/cinematic-homepage-editor.spec.ts` exercise the actual local application at desktop 1440×900 and phone 390×844. Both cases passed on 2026-10-13: rename a navigation group, change a ticket price, hide/show the map, upload replacement artwork through authenticated authorization → signed staging upload → finalization, save/reload the editor and public page, verify non-clickable loaded artwork, and retain all seven photo identities.

Login used a temporary ignored copy of `scripts/homepage-local-auth.mjs`, changing only the local tenant/port to `rose-city.localhost:3198`, Mailpit to `127.0.0.1:55324`, and the private browser-state directory to `/private/tmp/rose-city-cinematic-tests`. It signs in the existing synthetic owner with a real local email code; credentials are never logged or committed.

```sh
CINEMATIC_HOMEPAGE_STORAGE_STATE=/private/tmp/rose-city-cinematic-tests/local-auth.json node --env-file=.env.test ./node_modules/@playwright/test/cli.js test --config=playwright.cinematic-homepage.config.ts
```

The specs restore original editable copy/settings through the normal homepage API. A committed artwork replacement correctly retires the old asset, so cleanup re-uploads the original artwork bytes through the normal media API and saves a new valid asset identity. This preserves the original artwork appearance and all seven photo identities without bypassing retirement protections; the destination-only ID change is recorded in an ignored test attachment. The public restored screenshots are stored under `test-results/cinematic-homepage-editor/`. Phone coverage is browser emulation; no physical-device keyboard or safe-area claim is made.
