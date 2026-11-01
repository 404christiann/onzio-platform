#!/usr/bin/env bash
# Strict Codex ticket loop. One iteration = one ticket, one fresh worktree, one fresh
# Codex session. Rules for Codex live in docs/agents/codex-loop.md.
#
#   scripts/codex-loop.sh --dry-run      show what would run, change nothing
#   scripts/codex-loop.sh                implement locally, commit, stop (no network writes
#                                        beyond claiming the ticket)
#   CODEX_LOOP_PUBLISH=1 scripts/codex-loop.sh
#                                        also push the agent branch and open the PR
#
# CODEX_LOOP_MAX caps iterations (default 1: run a pilot before widening it).
# Never merges, deploys, or touches hosted services. Fails closed on any surprise.
set -euo pipefail

REPO="404christiann/onzio-platform"
ROOT="$(git rev-parse --show-toplevel)"
SKIP_FILE="$ROOT/scripts/codex-loop.skip"
GUIDE="$ROOT/docs/agents/codex-loop.md"
WORKTREES="${CODEX_LOOP_WORKTREES:-$HOME/.codex/worktrees}"
MAX_ITERATIONS="${CODEX_LOOP_MAX:-1}"
PUBLISH="${CODEX_LOOP_PUBLISH:-0}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

die() { echo "codex-loop: $*" >&2; exit 1; }

command -v gh >/dev/null    || die "gh not found"
command -v codex >/dev/null || die "codex not found"
[[ -f "$GUIDE" ]]           || die "missing $GUIDE"

skipped() {
  [[ -f "$SKIP_FILE" ]] || return 1
  awk '/^[0-9]+/ {print $1}' "$SKIP_FILE" | grep -qx "$1"
}

# Lowest-numbered open ready-for-agent issue that is unclaimed, not skipped, and has no
# open blocker.
next_ticket() {
  local candidates n open
  candidates="$(gh issue list --repo "$REPO" --state open --label ready-for-agent \
    --limit 200 --json number,labels \
    --jq '.[] | select([.labels[].name] | (index("in-progress") or index("blocked") or index("ready-for-review") or index("ready-for-human")) | not) | .number' | sort -n)"
  for n in $candidates; do
    skipped "$n" && continue
    open="$(gh api "repos/$REPO/issues/$n/dependencies/blocked_by" \
      --jq '[.[] | select(.state == "open")] | length')"
    if [[ "$open" == "0" ]]; then echo "$n"; return 0; fi
  done
  return 1
}

check_labels() {
  local have missing=""
  have="$(gh label list --repo "$REPO" --limit 200 --json name --jq '.[].name')"
  for l in in-progress ready-for-review blocked; do
    grep -qx "$l" <<<"$have" || missing="$missing $l"
  done
  [[ -z "$missing" ]] || die "missing GitHub labels:$missing (create them first)"
}

slugify() { tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-40; }

if (( DRY_RUN )); then
  if n="$(next_ticket)"; then
    title="$(gh issue view "$n" --repo "$REPO" --json title --jq .title)"
    echo "would run: #$n $title"
  else
    echo "idle: no unblocked, unclaimed ready-for-agent ticket"
  fi
  have="$(gh label list --repo "$REPO" --limit 200 --json name --jq '.[].name')"
  for l in in-progress ready-for-review blocked; do
    grep -qx "$l" <<<"$have" || echo "label missing: $l"
  done
  exit 0
fi

check_labels
mkdir -p "$WORKTREES"

for (( i = 1; i <= MAX_ITERATIONS; i++ )); do
  n="$(next_ticket)" || { echo "idle: nothing to do"; exit 0; }
  title="$(gh issue view "$n" --repo "$REPO" --json title --jq .title)"
  slug="$(slugify <<<"$title")"
  branch="agent/site${n}-${slug}"
  wt="$WORKTREES/onzio-ticket-$n"
  work="$(mktemp -d)"
  out="$work/final-message.md"

  echo "== #$n $title"
  git -C "$ROOT" fetch origin --quiet
  [[ ! -e "$wt" ]] || die "$wt already exists; remove it deliberately and rerun"
  git -C "$ROOT" show-ref --verify --quiet "refs/heads/$branch" && die "branch $branch already exists"

  gh issue edit "$n" --repo "$REPO" --add-label in-progress >/dev/null
  gh issue comment "$n" --repo "$REPO" --body "Claimed by the Codex loop. Branch \`$branch\`, worktree \`$wt\`. Publishing: $([[ $PUBLISH == 1 ]] && echo on || echo off)." >/dev/null

  git -C "$ROOT" worktree add "$wt" -b "$branch" origin/main >/dev/null

  {
    cat "$GUIDE"
    printf '\n---\nTicket: #%s\nRepository: %s\nBranch: %s\n\n' "$n" "$REPO" "$branch"
    gh issue view "$n" --repo "$REPO" --json title,body --jq '"# " + .title + "\n\n" + .body'
  } > "$work/prompt.md"

  if ! codex exec -C "$wt" -s workspace-write -o "$out" - < "$work/prompt.md"; then
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress --add-label blocked >/dev/null
    gh issue comment "$n" --repo "$REPO" --body "Codex run failed before reporting. Worktree kept at \`$wt\` for inspection. Nothing was pushed." >/dev/null
    die "codex exec failed on #$n"
  fi

  if [[ ! -s "$out" ]] || head -n1 "$out" | grep -q '^BLOCKED:'; then
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress --add-label blocked >/dev/null
    gh issue comment "$n" --repo "$REPO" --body "$(cat "$out" 2>/dev/null || echo 'Codex produced no final message.')" >/dev/null
    echo "blocked: #$n (worktree kept at $wt)"
    exit 2
  fi

  head -n1 "$out" | grep -q '^TITLE: ' || die "final message of #$n lacks a TITLE: line; worktree kept at $wt"
  [[ -z "$(git -C "$wt" status --porcelain)" ]] || die "worktree $wt has uncommitted changes; not publishing"
  [[ "$(git -C "$wt" rev-list --count origin/main..HEAD)" -gt 0 ]] || die "no commits on $branch"

  pr_title="$(head -n1 "$out" | sed 's/^TITLE: //')"
  tail -n +2 "$out" | sed '1{/^$/d}' > "$work/pr-body.md"
  sha="$(git -C "$wt" rev-parse HEAD)"

  if [[ "$PUBLISH" == "1" ]]; then
    git -C "$wt" push -u origin "$branch"
    url="$(gh pr create --repo "$REPO" --base main --head "$branch" --title "$pr_title" --body-file "$work/pr-body.md")"
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress --add-label ready-for-review >/dev/null
    gh issue comment "$n" --repo "$REPO" --body "Ready for review: $url at \`$sha\`. Reviewer: Claude Code (independent). Merge: Christian only." >/dev/null
    echo "published: $url"
  else
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress --add-label ready-for-review >/dev/null
    gh issue comment "$n" --repo "$REPO" --body "Implemented locally at \`$sha\` on \`$branch\` (worktree \`$wt\`). Not pushed; publishing is off. Report: $out" >/dev/null
    echo "local only: $branch at $sha (report $out)"
  fi
done
