# Review bot contract

The review format the bot is expected to follow, and what this repository takes for granted
about merging. The bot is operated by Christian, not by this repository. Change this file
when the bot changes, in the same PR.

`scripts/codex-loop.sh` (the Codex runner that read these reviews and pushed fix rounds),
its skip list and `scripts/codex-loop-verify.sh` were removed on 2026-11-08 at Christian's
request. Where this file says "the loop", it describes how that runner read reviews; the
format is kept because it is still the bot's output contract.

## What the loop reads

The bot is the GitHub user `onzio-coder` (override with `ONZIO_BOT_LOGIN`). The loop
trusts only comments from that login.

Each review is one PR comment whose first line is:

```
## onzio-bot review: PR #<n> at `<commit sha, 7 to 40 hex>`
```

`## Review: PR #<n> at ...` also matches. Matching is case-insensitive. The sha is the
head commit the review covers.

- The loop reads the newest such comment. It acts only if that sha is a prefix of the
  PR's current head. A review of an older commit is ignored until the bot reviews the new
  head, so a fix push is never judged on stale findings.
- Findings sit under a `###` heading named Critical, High or Medium. The loop treats a
  section as actionable when it has any content other than "None", "N/A" or "No issues".
  Low findings are never actioned. Anything the bot wants fixed before merge must be
  under one of the three headings; text outside them is invisible to the loop.
- A clean review has no non-empty Critical, High or Medium section.

## Merge criterion, as stated by Christian

The bot may merge a PR once its latest review, at the PR's current head, reports no High
or Medium findings. If it reports any, Codex fixes them and the cycle repeats.

## Decided by Christian (2026-10-31)

- The bot merges every PR that meets the criterion above, including PRs that touch
  `supabase/migrations/`. There is no human-merge carve-out for migrations. Merging to
  `main` deploys to production and does not run the migration-parity check in `CLAUDE.md`
  by itself, so the bot must run the whole procedure in
  `docs/agents/review-bot-supabase.md` before every merge of a PR that adds migrations.
  That procedure is part of the merge, not an option.
- As of 2026-11-01 Christian reports the bot is merging PRs for him. Whether it already has
  the production Supabase access and follows `review-bot-supabase.md` for migration PRs is
  part of its setup, not something this repository can check.
- Christian will give the bot access to the production Supabase project (ref
  `ioalthwsdrlzrubomrow`) so it can apply migrations itself. That access belongs to the
  bot only. Codex and Claude Code stay barred from any hosted Supabase operation by
  `AGENTS.md` and `codex-loop.md`; nothing here changes that.
- The full step-by-step for that path, with its stop conditions, is
  `docs/agents/review-bot-supabase.md`. Give the bot that file.
- Order the bot's merge path must keep, from the 2026-08-14 outage and the established
  Diverse City FC pattern: verify a backup, preview with
  `supabase db push --linked --dry-run --skip-vault`, apply with
  `supabase db push --linked --skip-vault`, confirm `supabase migration list --linked`
  shows every migration in the branch on the Remote side, and only then merge. Merging
  first deploys code against a schema that is not there yet. If any step fails, do not
  merge. The exact steps and stop rules are in `review-bot-supabase.md`.

## Required of every merge, migrations or not

These follow from rules already in the repo and from the review findings on this PR. They
are not new policy for the bot to weigh; Christian can strike one by editing this file.

- The merge is pinned to the head the review covered:
  `gh pr merge <N> --match-head-commit <reviewed sha>`. If the head moves, the review no
  longer counts and the bot stops.
- A PR that touches `supabase/`, data access under `lib/`, or RLS does not merge while a
  required suite is not run or has new failures. `scripts/codex-loop-verify.sh` was removed
  on 2026-11-08 (Christian: no longer needed), so the PR author now runs the suites that
  cover the change (at least `npm run test:db` for database or RLS work, wrapped in
  `scripts/with-local-db-lock.sh`) and lists what ran, with results, in the PR body. A
  database suite that is not run, or a PR body that lists no run, on such a PR is a gap
  for a person to close, not a pass.

## Not yet decided

These were raised when merge power was discussed and have no answer yet. The loop does
not enforce them; the bot's merge setup would have to.

- [ ] The merge requires deterministic checks (types, lint, contracts, build) in
      addition to the review. The `Onzio / independent PR review` status on `main`
      exists today; no other status checks do.
- [ ] The bot itself refuses to merge a PR labeled `hold`. The label exists and the loop
      skips such PRs; whether the bot honors it is part of the bot's setup. The migration
      procedure already uses it as a one-at-a-time lock.
- [ ] The review verdict is tied to the head sha and fails closed on missing or
      malformed output.
