# Assignment-aware homepage saves

Homepage saves observe the current legacy presentation assignment and installed
editing-binding meaning through their existing opaque `designRevision` token.
The request shape, content revision, operation hash and browser recovery schema
remain unchanged. Public and preview rendering still use the current renderer.

## Assignment and binding authority

Production selection uses `presentation_state.published_document_id`, with its
existing latest-document fallback. Authored release assignments still exist only
in the isolated proof. This change does not create a production release registry,
select retained code, activate an assignment, or prove deployment coordination.

A private `homepage_assignment_epochs` row holds a fresh UUID for every club.
Existing clubs receive rows in the migration. New clubs receive them on insertion.
Presentation-state insertion, deletion, published-pointer changes and club slug
changes advance the epoch. Document insertion in latest-document fallback also
advances it. No-op published-pointer updates and draft-only state updates retain
it. Epoch changes roll back with the transaction. Deleting presentation state
retains its epoch row; deleting the club cascades it.

A return from assignment A to B and back to A therefore cannot revive A's old
homepage token. The epoch is a freshness marker, not publication history. Existing
immutable presentation documents and publication rows remain intact.

The private binding projection records only the key and semantic revision from
[the editing contract](homepage-editing-bindings.md). Database parity tests compare
it with the installed TypeScript resolver. A binding meaning change requires a
matching SQL migration and parity acceptance. Bindings grant no permission.

The homepage-only helper combines a version tag, club identity, the unchanged
legacy design digest, assignment epoch and binding identity into the token.
Missing epoch or unknown binding meaning blocks fresh saves. The shared
`homepage_design` helper retains its previous token for other page editors.
The new private table has RLS and no direct application-role privileges.

## Save and historical replay

The invoker save keeps its existing order. It acquires the common advisory lock,
checks present authorization, validates and hashes the original request, and
looks up the club-and-actor-scoped operation receipt. A matching request returns
that stored response before current assignment, binding, design or content checks.
A changed request under the same operation remains `OPERATION_REUSED`.

Only an uncommitted operation reads the current token. A stale assignment returns
`DESIGN_CHANGED` with SQLSTATE `PT409`. A stale content revision still returns
`CONTENT_CHANGED`. Existing section, field, media, destination, membership,
session, lifecycle and tenant safeguards remain authoritative. No receipt or
historical request acquires new fields, hashes or inferred current identity.

The existing load RPC resolves the current snapshot before operation status.
An unavailable current epoch or design can therefore block receipt lookup through
GET. Authorized exact POST replay remains available. This PR does not add an
operation-status endpoint or a new load-result format.

## Migration and local verification

The migration first attempts the required table locks with `NOWAIT`, then tries
the existing homepage advisory lock without waiting. Contention aborts the whole
transaction before schema changes. Retry the complete migration transaction after
writers finish. Table locks and the advisory lock remain held through commit.
Taking the advisory lock before waiting for DDL locks could deadlock with an
existing writer, whose statement table lock precedes its advisory trigger.

The migration explicitly begins and commits its transaction. Use the repository's
local Supabase migration command; do not execute selected statements individually. Apply
only to the synthetic loopback stack during ordinary development. Hosted migration
and release remain separate approval boundaries.

Run from the task checkout, using `onzio shell` on the prepared VM:

```bash
supabase migration up --local
set -a
. ./.env.test
set +a
npx vitest run tests/database/homepage-assignment-save.test.ts tests/database/homepage-assignment-concurrent.test.ts tests/database/homepage-assignment-migration.test.ts
```

The new database tests exercise real pointer transitions, binding parity, both
save lock orders, receipt replay and migration contention. The new browser tests
exercise desktop and phone conflict retention and a lost committed response across
reassignment. Existing save, tenant, recovery and public/preview suites remain
regressions for this change.

## Next integration

The [draft recovery integration](homepage-draft-recovery.md) handles old unsaved
tokens without rebinding their original operation or inventing old binding
identity. Proven compatible work can be copied into a fresh draft after explicit
review. Incompatible meanings remain available for reference. No claim of complete
recovery across authored assignments follows from these save checks. Authored assignment resolution,
installed-code compatibility and deployment/activation coordination still need
their own proof before activation. Content-policy migration remains separate.
