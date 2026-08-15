# Search indexing: deferred, and how to do it properly

**Status:** deliberately deferred. Agreed with Christian 2026-08-15, to be
picked up after Lions has been live long enough to observe.

## Current behaviour

Every tenant page is served with `X-Robots-Tag: noindex, nofollow`,
unconditionally, from `applyTenantRobotsPolicy` in `middleware.ts`. Verified
live 2026-08-15 on both `diversecityfc.com` and `columbuslionsfc.com`.

This is **platform-wide and intentional**, not a Lions gap. Diverse City FC has
been live and paying for days and is equally unindexed.

The middleware comment states the rule and the reason:

> `DCFC-D117`: the production site retains `noindex, nofollow` **through
> launch**. Indexing is a separate later approval carried by `DCFC-1003`, after
> observation closes — so this is deliberately unconditional and must not be
> keyed to `public_access`. Going live at `DCFC-903` must not make the site
> indexable as a side effect.

The unconditional shape is the point: it prevents a billing event from making a
site crawlable as a side effect. Someone completes checkout, and Google starts
indexing a site nobody has proofread.

## The prescribed shape, which is not the obvious one

From the same comment:

> When `DCFC-1003` grants indexing, add an explicit per-club opt-in that
> **defaults to blocked**, rather than reintroducing a `public_access` branch
> here.

So: **not** "if the club is live, index it." A new operator-only column —
`clubs.search_indexable`, default `false` — and the header is emitted unless
that flag is set *and* the club is genuinely live. Two conditions, opt-in,
failing closed.

## What the work actually involves

1. Migration adding `clubs.search_indexable boolean not null default false`,
   with a column comment marking it operator-only (same convention as
   `store_enabled`).
2. `middleware.ts`: emit the noindex header unless the club is both
   `search_indexable` and live. Keep the default path unchanged so any club
   that has not opted in is untouched.
3. An operator script to flip it, modelled on
   `scripts/set-club-store-enabled.ts` — dry run by default, `--execute`,
   `--confirm-project`, audited write, read-back reconciliation.
4. **`robots.txt` and a sitemap.** There is currently no `app/robots.ts` and no
   `app/sitemap.ts` anywhere in the repository — the header is the only signal
   we emit. Telling crawlers they may index while giving them nothing to crawl
   is half a feature; both need to be per-tenant, resolved through the same
   club context as every other route.
5. Contract tests asserting the default stays blocked, that a non-opted-in club
   still gets the header, and that going live alone does not flip it — the
   regression the current design exists to prevent.

## Notes for whoever picks this up

- **`DCFC-1003` was never written.** It is referenced in `middleware.ts` and
  `HANDOFF.md` as the package carrying this, but no such doc exists. This is a
  scoping-from-scratch job, not the execution of an existing plan.
- It applies to **both** clubs. Diverse City is equally unindexed, so this is
  one piece of work serving two tenants — worth doing once, together.
- The public site is only reachable at all once billing flips a club to
  `live`/`grace` (`onzio_private.is_publicly_accessible`). Indexing a club that
  is not live would surface pages that 404 for the crawler anyway, which is
  another reason the opt-in must be conjunctive rather than a replacement for
  the liveness check.
- Rough size: a migration, a middleware branch, one script, two new routes and
  their tests. Half a day, not a week — the risk is in the routes, not the flag.
