# Homepage draft recovery across design changes

Homepage recovery keeps unsaved work in the browser, scoped to its origin,
club and signed-in user. It is best-effort recovery for up to seven days.
It is not server version history. Content becomes public only after an
explicit successful Save homepage.

## Editing meaning and freshness

A homepage design token identifies current assignment freshness. A binding key
and semantic revision describe the meaning of an edit. These are separate
checks. Equal binding meaning does not authorize a content mutation or establish
that saved content is current.

New recovery records capture binding identity. Recovery compares that identity
with both the current SQL snapshot and the installed TypeScript binding contract.
Unknown keys, changed semantic revisions, missing identity and disagreement with
installed code cannot permit automatic restoration or reviewed apply. Equal
opaque tokens do not override an explicit binding mismatch.

With proven equal meaning, changed content or assignment still requires review.
The editor starts from current server content. **Use recovered changes** copies
only the user's changed fields into that draft. It preserves untouched current
fields and uses current content and design revisions. It sends no save request.
A later **Save homepage** uses the ordinary server validation and conflict checks.

An incompatible draft stays separate and copyable in the review dialog. Closing
review or reloading does not attach current identity to the old draft. A changed
field that the current save adapter cannot represent keeps the whole draft in
review. Shared About, Shop and Programs shortcuts do not become homepage writes.
Partial migration between different binding meanings remains separate work.

## Existing records and browser storage

The reader accepts the original version 1 records and new version 2 records.
A version 1 record with the same design token retains its existing recovery path.
A changed-token version 1 record has no historical binding evidence and remains
review-only. Recovery does not infer that evidence from its fields or current
renderer. Reading or closing review does not convert the old record.

The existing IndexedDB database opens at version 2. The upgrade preserves its
`drafts` and `files` stores, record keys and file values. It does not rewrite
stored records or delete the database. Older shipped clients explicitly open
version 1. After the upgrade, those opens fail before an old strict parser can
classify a new record as invalid and delete it. Browser recovery is unavailable
to that older client until compatible code returns. An application rollback
must not delete or downgrade this database.

A blocked upgrade retains the existing timeout and unavailable-storage warning.
Writes resolve after transaction commit. Guarded writes and compare-delete keep
another tab's newer draft and referenced files. A failed reviewed replacement
keeps the source draft available instead of consuming it.

## Pending saves and receipts

A retained pending save requests its original operation status before current
binding, design or content conflicts. A failed lookup or missing status is not
proof that the save did not commit. The original record and files stay available
for another load attempt. Loading never automatically posts a save.

A not-committed result is a current observation, not cancellation of an earlier
request. If the original token and revision remain current but its editing
meaning cannot be proven, recovery stays unresolved. It cannot create a different
operation or clean up that operation's assets on the strength of a missing receipt.

A committed operation adopts the status response's current content. Its historical
receipt is commitment evidence, not a replacement for later administrator edits.
Only the acknowledged recovery copy can be cleared. Pending operation identity
must not be rebound to current tokens or a different renderer. Explicitly copying
compatible stale work into a current draft creates a fresh unsent edit; its next
save uses a new operation.

Leaving after a failed save remains available once its network attempt finishes.
If its status is still uncertain, leaving keeps the recovery copy and local files
for a later status check. The leave dialog explains that retention. It does not
retire assets that an unresolved save may have committed. A retained recovery
conflict also stays separate until explicit discard or successful reviewed apply.

The existing GET RPC still resolves a current snapshot before looking up its
receipt. Invalid current design or a missing assignment epoch can therefore block
GET reconciliation. The unchanged exact POST replay boundary remains available
after current authorization. This PR adds no independent receipt endpoint and
uses no automatic POST fallback.

## Verification and remaining gates

Pure recovery checks exercise version compatibility, binding equality, receipt
priority, changed-field merging and scope rejection. Local browser checks cover
compatible and incompatible reviews, storage upgrade, old-client rejection,
explicit save, response loss, persistence after undo and existing cross-tab
recovery. Shared synthetic
fixture writers run serially. Commands and acceptance results belong in
[the testing guide](../tests/README.md) and the current handoff.

SQL permissions, save payloads and receipt hashes are unchanged. Content-policy
migration, authored release resolution, installed-code compatibility and
activation/deployment coordination remain separate reviewed units. Chromium
checks do not establish native mobile keyboard or screen-reader acceptance.
