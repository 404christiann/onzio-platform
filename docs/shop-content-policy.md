# Shop content policy

Authorized owners and admins may maintain valid Shop content when the current
design hides it or the public Store is disabled. SITE-06B changes the local
content-maintenance boundary. Public routing, rendering, normal editor controls
and the Store setting retain their existing behavior.

## Content ownership

The strict `ShopSaveRequest` retains two independent surfaces. The `home`
surface owns only the home-kit section and its product photos. The `shop`
surface owns home, away and third kits, their product photos, photo strips and
purchase details. A home save cannot write away or third kits, photo strips or
purchase details.

The active renderer does not restrict the Shop variants or fields a member may
maintain. Empty bullet lists are valid under the existing request schema.
Third-kit photo strips use the existing schema and media ownership rules.
Product photos remain required for a changed kit. Photo strips may be empty.

## Save and recovery authority

The route validates the request, checks session freshness, resolves the trusted
tenant and authorizes access before invoking a user-scoped RPC. Display
availability and a recovery header do not grant maintenance rights.

The database retains RLS, current membership and lifecycle checks, strict JSON
validation, tenant media checks, the two shared advisory locks and existing
content and design revision comparisons. Content maintenance does not publish a
new design or enable the Store.

The complete original JSONB request determines its hash. An exact retry returns
the actor's original receipt after current authorization, before fresh-save
revision comparisons. A reused operation ID with a changed request fails.
Receipt status lookup also filters the selected surface. Save receipts retain the
club, actor and operation key, with surface included in the original request hash.

## Migration and acceptance

The forward migration `20261022193528_shop_content_policy.sql` replaces
`load_shop_page` and `save_shop_page` without changing their public signatures.
It introduces the content-only `onzio_private.validate_shop_section(jsonb)`,
migrates its sole caller and removes the obsolete renderer-boolean signature.
The helper retains immutable invoker execution, an empty search path and narrow
execution grants. Original migrations and stored receipts remain untouched.

Fifty-five new local SQL/HTTP cases cover hidden content, ownership, validation,
authorization, media, rollback and historical receipts. Fifteen new route cases
execute GET and POST. Existing atomic and recovery checks retain their conflict,
authorization and exact-retry assertions. The concurrent Store-disable case
still waits for the shared lock, then verifies a successful save and unchanged
disabled Store setting. Other domains retain their current policy.

The historical receipt case restores the original helper and RPC bodies inside
a rollback-scoped transaction. An actual old-function save creates its receipt
before the entire new migration runs. Subsequent content and design changes do
not change exact replay. No test fabricates a receipt or recreates old tables.
The HTTP case persists a nonempty third-kit strip through loopback PostgREST,
reads the row back and denies an unaffiliated actor without side effects.

Exact commands, revisions, suite results, security/fixture checks and independent
reviews are recorded in HANDOFF.md and the local evidence directory
`/home/coder/.codex/visualizations/2026/10/22/onzio-site06-shop-content-policy`.
No browser or prior Academy acceptance rerun is claimed for this SQL/API package.

## Local delivery

PR36 merged SITE-06A at `53fd7de66cfddbb3e21f9c1737483c928a738415` with a
tree identical to reviewed head `3cd22a044b806d886ae09ea3949be80557681703`.
Its acceptance remains attributed to that revision.

Christian subsequently authorized all remaining local SITE-06 domains, one
reviewed PR at a time. Shop/home-kit is SITE-06B. The remaining identified
domains are About/Logo, Contact, Tryouts and Programs. Each retains its current
policy until its own migration and direct-RPC acceptance are reviewed.
Trusted internal destination checks require domain-specific analysis.

Hosted application, inventory, dispatch, activation and deployment remain
outside this assignment. SITE-07 and SITE-08 need separate direction.
Christian alone reviews, merges and deploys.
