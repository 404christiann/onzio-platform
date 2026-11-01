# onzio-bot: production Supabase instructions

These instructions are addressed to the review bot. They apply only to a PR that adds or
changes files under `supabase/migrations/`. For any other PR, do not touch Supabase at
all. Christian has decided that you merge every PR that meets the review criterion in
`docs/agents/review-bot-contract.md`, migrations included, and that you may apply
migrations to production. This file is how you do that safely. It is built from the
record in `HANDOFF.md` (PR #5 release) and
`docs/phase-11/diverse-city/PRODUCTION-CUTOVER-ROLLBACK.md`.

## Why the order matters

Merging to `main` deploys to production automatically. On 2026-08-14 code reached
production before three migrations it depended on; one selected a column the tenant
lookup reads on every request, and every Diverse City FC page failed with
`UNKNOWN_TENANT` until a rollback. `npm run build` cannot catch this, because it checks
types, not the live schema. So: **migrate first, verify, then merge.** And because code
in production keeps running against the new schema until the new code deploys, the
migration must work with both the old code and the new code (see "Stop" below).

## Scope

Production project ref: `ioalthwsdrlzrubomrow`. Refuse any other ref.
Vercel project: `onzio-platform`, team `404christianns-projects`.

## Preconditions

All must hold. If any fails, do not apply and do not merge. Comment on the PR with the
reason and stop.

1. Your review at the PR's current head reports no High or Medium findings.
2. The PR head contains current `main` (the `main` ruleset requires an up-to-date
   branch). Compute the PR's migrations as
   `git diff --name-only --diff-filter=A origin/main...HEAD -- supabase/migrations`.
3. The PR only **adds** migration files. Any edit, rename or deletion of a migration file
   that already exists on `main` is a stop: applied migrations are immutable.
4. No other migration PR is mid-flight. Do one at a time; the next waits for the previous
   merge to finish.
5. Your credentials are linked to `ioalthwsdrlzrubomrow`, and nothing else.

## Stop and hand to a human: breaking migrations

Read every added migration. Stop, do not apply, and label the PR `blocked` if any file
does one of these, because the code now in production would break the moment it applies:

- drops, renames or retypes a table, column, view, enum value or constraint that
  currently deployed code may use
- drops or replaces a function, including changing its argument list. On 2026-08-04 a
  migration replaced a 15-argument function with a 14-argument one, which broke old code
  and new code in both orders, with no safe sequence.
- tightens a constraint or makes a column `NOT NULL` without a default on a populated
  table
- disables RLS, drops a policy, grants anything to `anon` or `public`, or widens
  `security definer` exposure
- deletes or rewrites existing rows, truncates, or runs data backfills larger than a
  trivial fix-up
- creates an index or alters a table in a way that can hold a long lock on a large table

Additive changes (new tables, new nullable columns, new functions or overloads, new
policies that only add access for existing tenants' own rows, new indexes on small
tables) may proceed. If you are unsure which a statement is, it is a stop.

## Procedure

Run these in order. Record each result for the PR comment.

1. **Link and ledger.** `supabase migration list --linked`. Every migration on
   `origin/main` must show on the Remote side. The Local-only versions must be exactly
   the PR's added files. Anything Remote-only, or Local-only and not in the PR, is a
   stop: production and `main` have diverged and a person must reconcile it.
2. **Rollback target.** Record the current READY production deployment id and URL from
   Vercel. This is the code rollback target.
3. **Pre-apply snapshot (read-only).** Record the count of clubs, the count of verified
   domains in `onzio.club_domains` (read the table's columns first to find how
   verification is stored), and the `onzio.audit_events` count and newest timestamp. Use
   read-only queries.
4. **Backup.** Production has `pitr_enabled=false`, so the daily physical backup is the
   only recovery point. Run `supabase backups list`. Require a completed physical backup
   less than 24 hours old, and record its timestamp. If the audit-event snapshot shows
   production writes since that backup, take fresh restricted logical dumps of `onzio`
   and `onzio_private` into a directory with mode 700 (files 600) outside the repository,
   record their SHA-256, and never commit or print them.
5. **Dry run.** `supabase db push --linked --dry-run --skip-vault`. The files it lists
   must equal the PR's added migrations exactly, in order, with no seeds, roles or Vault
   changes. Any difference is a stop.
6. **Apply.** `supabase db push --linked --skip-vault`. Never add `--include-all`. If it
   fails, do not retry. Re-run step 1 and step 5 to learn what state production is in,
   then stop and report it.
7. **Verify.**
   - `supabase migration list --linked` shows no Local-only versions, and a second
     dry run reports no pending migrations.
   - Read-only SQL confirms a history row for each applied version.
   - The step 3 counts are unchanged, apart from anything the migration was meant to
     change.
   - Generated types match the real schema:
     `supabase gen types typescript --linked --schema onzio` compared with
     `lib/database.generated.ts` on the PR head. On first use, run it against current
     `main` once to learn whether a baseline difference already exists, and from then on
     treat only a change from that baseline as a stop.
8. **Merge** the PR, immediately, in the same run. If the merge fails, retry up to three
   times. If it still fails, comment that migrations are applied and the PR is not
   merged, label it `blocked`, and tell Christian. Do not revert the migrations. A later
   migration PR will stop at step 1 until this is resolved, which is correct.
9. **Post-deploy check.** Wait for Vercel's production deployment of the exact merge
   commit to reach READY. Then, for every verified production domain in
   `onzio.club_domains`, request `/` and expect HTTP 200 with no `UNKNOWN_TENANT` in the
   body. For Diverse City FC also request `/programs`, `/roster` and `/shop`, which the
   2026-09 release used. If anything fails, roll production back to the step 2 target
   and tell Christian immediately. Never roll the database back.

## The PR comment you leave

After step 9 (or at any stop), post one comment: the PR number, the migration versions,
each precondition's result, the backup timestamp, the dry-run file list, the ledger
checks, the snapshot before and after, the deployment ids, and the smoke results, each
with a timestamp. Include no credentials, connection strings, dump contents, row data,
emails or tokens.

## Never

- `supabase db reset` against any target, `--include-all`, `supabase migration repair`,
  `supabase db pull`, `supabase db remote commit`, or `supabase link` to any other ref
- SQL against production that is not one of the PR's migration files or a read-only
  query from steps 3 and 7
- changing Auth settings, SMTP, email templates, Storage buckets or policies outside a
  migration, Edge Function secrets, or `supabase secrets`
- deleting or altering backups, pausing or restoring the project
- touching Stripe, DNS, Vercel environment variables, GitHub rulesets or your own review
  criterion
- merging on any partial, uncertain or unexpected state

## Credentials

Use only the credentials in your own secret store. Never echo them, log them, put them
in a PR comment, or write them to the repository. If any command prints a secret, stop
and tell Christian to rotate it. Prefer the narrowest credential that can run the
commands above.

## When this file does not cover it

Stop, comment, and leave the PR unmerged. Failing closed is always correct here.
