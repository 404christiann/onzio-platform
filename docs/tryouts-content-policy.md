# Tryouts content maintenance policy

SITE-06E separates valid Tryouts content maintenance from current display policy.
Current authorized owners and admins may load and save this content under any
presentation assignment, including absent presentation history. Normal editor
controls, previews, bindings, navigation, and public routing keep their existing
policy.

## Content command

The existing atomic request contains `operationId`, `expectedRevision`, nullable
`page`, `events`, and `deletedIds`. The page object contains the two introduction
strings. Null preserves existing copy or an absent singleton. Each event keeps
its existing eighteen fields, including nullable program, registration form,
and hero media references. Events have contiguous zero-based order. Every stored
event must appear exactly once among retained identities and explicit deletions.
Both arrays retain their 500-item limits.

The forward migration replaces only `load_tryouts_page` and `save_tryouts_page`
with their presentation eligibility blocks removed. The dedicated HTTP adapter
removes its matching early gate and recovery-only dispatch condition. No new
policy helper, request flag, signature, design token, or content table is needed.
Original migrations and receipts remain intact.

## Authority and validation

Current tenant, session freshness, active membership, lifecycle, and RLS checks
remain authoritative. Ordinary loads retain their existing fresh-member and
active/onboarding lifecycle checks. Saves and operation-status loads additionally
require current mutation access. An active suspended customer's ordinary load
retains its existing read behavior, while save and status requests deny access.
Current content authority still precedes exact receipt replay.

Strict envelope and nested key validation, text limits, array limits, identity
checks, order, date constraints, and tenant relationships remain. The HTTP schema
uses strict Zod field types. SQL uses the existing row population, casts, table
constraints, and foreign keys for event values. These boundaries retain their
existing differences. HTTP checks date string shape before SQL checks calendar
validity. SQL trims the two introduction strings and preserves event text as
sent. The normal editor builder trims event text before submission.

Registration hrefs keep the existing public-link rules for empty, single-slash
local, HTTP, HTTPS, and mailto destinations. They do not use About's finite
internal destination catalog. SQL additionally rejects whitespace and control
characters and retains its existing web and email patterns. HTTP retains its
current URL predicate. This package changes neither validator.

Program and form references must exist in the same tenant. A stored reference
does not require an active program or open form. Public preview hydration still
selects open forms. Event deletion preserves linked forms and registration
records.

## Concurrency, receipts, and media

Public RPCs and legacy statement triggers retain advisory lock `734901281`
followed by Tryouts lock `734901282`, before row locks. Both event and intro
writers advance the existing shared content revision. Stale content fails CAS
without writing a receipt. Presentation changes alone do not invalidate valid
Tryouts content.

The save hashes the complete original JSONB request before trimming or event
normalization. Actor-scoped receipts use club, actor, and operation UUID. Exact
replay returns the historical response before current content CAS or media
validation. A changed request under the same UUID fails `OPERATION_REUSED`.
Operation-status reads retain current snapshots alongside the actor's original
receipt.

Media must remain same-tenant, published, undeleted, and on the Tryouts surface.
The existing composite foreign keys and reference guards remain. Save returns
old media candidates only after no event in the tenant references them. Physical
cleanup remains a separate boundary that rechecks every current reference under
its existing locks. Cleanup failure cannot turn a confirmed transaction into a
failed save. A later reference prevents retirement even when a historical receipt
names the asset.

Page copy, all event changes, ordering, deletions, revisions, audits, and receipt
insertion remain one transaction. Failure after an earlier write rolls everything
back. Confirmed saves and committed status receipts survive form-preview refresh
failure. Initial loads still reject incomplete form hydration.

## Local acceptance

The package adds 205 behavior cases. Focused acceptance passes 139 SQL, HTTP,
race, and atomic cases and 150 pure route and regression cases. Full serial
validation, exact-revision reviews, and limits are recorded in
[HANDOFF.md](../HANDOFF.md) and the local evidence handoff. The acceptance creates a
genuine receipt through the old function before applying the complete migration
in rollback scope. Final installation uses the actual local migration runner.
Installed bodies, grants, helpers, triggers, RLS, raw types, fixtures, and cleanup
are compared with the captured baseline.

This package changes SQL and API policy. It does not claim new browser, production
build, hosted migration, deployment, or frozen Academy acceptance. Programs
remains the next authorized local SITE-06 package.
