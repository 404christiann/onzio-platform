# Programs content maintenance policy

SITE-06F separates valid Programs content maintenance from current display policy.
Current authorized owners and admins may load and save a program page and the
Programs directory under any presentation assignment, including absent presentation
history. This is the sixth and last SITE-06 content domain. Diverse City FC, on
`academy@1`, sees no change.

## Preview eligibility is unchanged

This package changes two SQL procedures per surface and two HTTP routes. It does
not change who sees the Programs editor. `app/admin/(protected)/programs/page.tsx`,
the admin navigation entry, `app/api/admin/programs-preview-forms/route.ts`, the
public Programs routes and the Academy preview component stay Academy-only. A club
on another template can maintain Programs content through the two routes, and that
content does not render until a template with a public Programs page is published.

## Content commands

The page command is `operationId`, nullable `programId`, `expected`, `program`,
and `gallery`. `expected` carries the program's `programUpdatedAt` and the gallery's
`{ id, updatedAt }` rows. A null `programId` with a null baseline and an empty
expected gallery creates a program. `program` keeps its existing twenty-one fields.
`gallery` keeps at most twelve `{ id, mediaAssetId, alt, sortOrder }` items in
contiguous order.

The directory command is `operationId`, `expected`, and `programs`. Both arrays
hold the same length, at most 200. `expected` names every current program with its
`updatedAt`. `programs` assigns each a contiguous `sortOrder` and an `active` or
`hidden` status. Order and visibility belong to the directory. A page save that
changes `slug`, `status`, or `sort_order` on an existing program still fails
`FIELD_UNAVAILABLE`.

The forward migration `20261030170000_programs_content_policy.sql` replaces only
`load_program_page`, `save_program_page`, `load_program_directory`, and
`save_program_directory` with their template eligibility blocks removed. The two
dedicated HTTP routes remove their matching early gate and the recovery-only
dispatch header check. No helper, signature, grant, request flag, design token,
content table, or UI changes. Original migrations and stored receipts remain intact.

## Authority and validation

Current tenant, session freshness, active membership, lifecycle, and RLS checks
remain authoritative. Ordinary loads keep their fresh-member and active or
onboarding lifecycle checks. Saves and operation-status loads also require
current content mutation access. A suspended customer's ordinary load keeps its
read behavior, while save and status requests deny access. Current authority still
precedes exact receipt replay.

Strict envelope and nested key validation remain through the existing private key
checker. The program row populates through the table type, so an uncastable field
fails as a payload error. Highlights stay an array of at most 200 strings of at
most 320 characters. Layout variant and status keep their finite values. The HTTP
schemas keep their strict Zod types, UUID checks, and the baseline rule that
`programId` and `programUpdatedAt` are null together.

The program destination keeps three existing layers, exercised rather than unified.
The HTTP schema bounds `external_cta_href` to 2048 characters and nothing else. The
SQL predicate accepts the empty string, `/`, and values matching
`^(https?://[^[:space:]]+|mailto:[^[:space:]]+|/[^/].*)$` without regard to case,
so a single-slash local path may contain spaces and control characters while a
protocol-relative or `javascript:` value fails. The table check then requires the
empty string or a value starting with `/`, `http://`, `https://`, or `mailto:` in
lower case, at most 2048 characters. Programs hrefs do not use About's finite
internal destination catalog.

A linked `registration_form_id` must exist in the same tenant through the existing
composite foreign key. A stored reference does not require an open form. Public
preview hydration still selects open forms through the Academy-only preview route.

## Concurrency, receipts, and media

The four procedures and the statement triggers on `programs` and `program_media`
take advisory lock `734901281` followed by Programs lock `734901284` before row
locks. The page save compares the program's `updated_at`, the gallery count, and
every gallery row's `updated_at` against `expected`. The directory save compares the
program count and every program's `updated_at`. The existing row trigger gives every
Programs write a strictly newer `updated_at`, so a legacy writer always invalidates
a pending baseline. A stale save fails `CONTENT_CHANGED` without writing a receipt.
A legacy insert of another program does not conflict with a page save of a
different program. That save waits on the lock and then succeeds.

The save hashes the complete original JSONB request. Receipts are keyed by club,
actor, and operation UUID. Exact replay returns the historical response before
content comparison and media validation. A changed request under the same UUID
fails `OPERATION_REUSED`. Another actor sees `not-committed` for that UUID.
Operation-status reads keep the current snapshot alongside the actor's receipt.

Hero, detail, and gallery media must be same-tenant, published, undeleted, in the
normalized bucket, and on the `programs` surface. A gallery item that keeps its row
may keep its stored URL. The save returns `retiredMediaAssetIds` for assets this
program no longer references. Physical cleanup stays in the route and rechecks every
current reference under its existing locks. Cleanup failure cannot turn a confirmed
transaction into a failed save.

The program row, every gallery write and deletion, and the receipt commit as one
transaction. A failure after an earlier write rolls everything back. The directory
save applies every status and order change or none.

## Local acceptance

The package adds 260 behavior cases: 156 direct SQL and loopback PostgREST cases,
18 independent-connection races over both legacy writer tables and both surfaces,
and 86 exported route cases. Four existing suites change from the old denial to the
new policy without losing their receipt, conflict, and authority assertions. The
shared publication race now saves hidden Programs page and directory content after
the observed global wait.

The acceptance creates genuine page and directory receipts through the original
functions before applying the complete migration in rollback scope, then replays
both exactly after a template change and later content changes by another actor.
Installation uses the actual local migration runner. A script compares the installed
bodies against the migration file and against the captured baseline, where only the
four gate blocks differ. Full serial validation, the exact reviewed revision, and the
remaining limits are recorded in [HANDOFF.md](../HANDOFF.md) and the
[SITE ledger](site-architecture.md).

This package changes SQL and API policy. It claims no new browser, hosted
migration, deployment, or frozen Academy acceptance. Parent SITE-06 has no further
authorized local domain after this one.
