# Review bot contract

What `scripts/codex-loop.sh --fix` relies on from the review bot, and what it takes for
granted about merging. The bot is operated by Christian, not by this repository. Change
this file when the bot changes, in the same PR.

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

## What the loop writes

- A comment starting `<!-- codex-loop-fix-round -->` for each pushed fix round, so rounds
  can be counted. The cap is three per PR (`CODEX_LOOP_FIX_ROUNDS`).
- The `blocked` label on a PR after the cap, a `BLOCKED:` run, or a runner failure.
- It never approves, merges, closes or enables auto-merge.

## Merge criterion, as stated by Christian

The bot may merge a PR once its latest review, at the PR's current head, reports no High
or Medium findings. If it reports any, Codex fixes them and the cycle repeats.

## Not yet decided

These were raised when merge power was discussed and have no answer yet. The loop does
not enforce them; the bot's merge setup would have to.

- [ ] PRs that touch `supabase/migrations/` stay human-merged. Merging to `main` deploys
      to production, and the migration-parity gate in `CLAUDE.md` cannot be run by an
      agent.
- [ ] The merge requires deterministic checks (types, lint, contracts, build) in
      addition to the review. The `Onzio / independent PR review` status on `main`
      exists today; no other status checks do.
- [ ] A `hold` label or equivalent pauses merging everywhere. The loop already skips a
      PR labeled `hold`.
- [ ] The review verdict is tied to the head sha and fails closed on missing or
      malformed output.
