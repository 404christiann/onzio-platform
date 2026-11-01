#!/usr/bin/env bash
# Run the full verification set OUTSIDE the Codex sandbox, on one exact commit, and write
# a markdown table of real results. The Codex sandbox cannot inspect processes, open local
# ports, reach the local database or download fonts, so it cannot run most of the set.
#
#   scripts/codex-loop-verify.sh <worktree> <out.md>
#
# A failing check is compared with the same check on a clean copy of the commit the work
# started from (the merge-base with origin/main), and only NEW failures count against the
# change. Exit codes: 0 verified, 1 new failures or a required suite did not run,
# 3 refused to run (the change touches how checks run), 64 usage.
#
#   CODEX_LOOP_VERIFY=types,lint,...   which checks (default: all; "off" skips, see runner)
#   CODEX_LOOP_ENV_FILE=path           local Supabase test values (SUPABASE_TEST_URL etc.)
#   CODEX_LOOP_TRUST_DIFF=1            run even if the change touches checks, config or deps
#   CODEX_LOOP_WORKTREES=dir           where the cached baseline copy lives
#
# Code written by Codex runs here as your user, with network access. What limits that:
# HOME is an empty temporary directory (so ~/.config/gh, ~/.supabase and ~/.ssh are not
# reachable), the environment holds only the env file's values, every SUPABASE*URL value in
# the env file must be loopback, and a change to a root-level file (dependencies, config,
# lint rules), scripts/, CI or supabase/config.toml is refused (exit 3) unless a person says
# so. Residual risk, stated plainly: it is not a sandbox. The macOS keychain and the network
# are still reachable by a process running as you.
set -uo pipefail

[[ $# -eq 2 ]] || { echo "usage: $0 <worktree> <out.md>" >&2; exit 64; }
WT="$(cd "$1" && pwd)"; OUT="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREES="${CODEX_LOOP_WORKTREES:-$HOME/.codex/worktrees}"
CHECKS="${CODEX_LOOP_VERIFY:-types,lint,contracts,architecture,build,db,suite}"
ENV_FILE="${CODEX_LOOP_ENV_FILE:-}"
LOCK="$ROOT/scripts/with-local-db-lock.sh"
SCRUB_HOME="$(mktemp -d)"     # HOME for every check: empty, so no credentials on disk
RES="$(mktemp -d)"            # results for the change
BASE_RES="$(mktemp -d)"       # results for the baseline copy

command -v jq >/dev/null || { echo "verify: jq not found" >&2; exit 64; }

# A copy of this script that differs from origin/main is usually a stale coordinator worktree
# running last week's checks: the first orchestrator run on #43 reported failures that a newer
# version had already fixed. Refuse instead of producing evidence from old logic. A person who
# is deliberately testing a changed script can set CODEX_LOOP_ALLOW_STALE_SCRIPT=1.
git -C "$ROOT" fetch origin --quiet 2>/dev/null || true
if [[ "${CODEX_LOOP_ALLOW_STALE_SCRIPT:-0}" != "1" ]] \
   && ! git -C "$ROOT" diff --quiet origin/main -- scripts/codex-loop-verify.sh scripts/with-local-db-lock.sh; then
  echo "verify: this copy of the verify script differs from origin/main (stale worktree?)." >&2
  echo "verify: run 'git -C $ROOT checkout --detach origin/main' and try again." >&2
  exit 64
fi
[[ -z "$(git -C "$WT" status --porcelain)" ]] || { echo "verify: $WT has uncommitted changes" >&2; exit 64; }
[[ -x "$WT/node_modules/.bin/vitest" && -x "$WT/node_modules/.bin/tsc" ]] \
  || { echo "verify: $WT has no installed dependencies (run npm ci there first)" >&2; exit 64; }
HEAD_SHA="$(git -C "$WT" rev-parse HEAD)"
git -C "$WT" fetch origin --quiet 2>/dev/null || true
BASE_SHA="$(git -C "$WT" merge-base origin/main HEAD)"
CHANGED="$(git -C "$WT" diff --name-only "$BASE_SHA..HEAD")"

# ---- 1. refuse to run a change that alters how checks run, unless a person says so
RISKY="$(grep -E '^(scripts/|\.github/|supabase/config\.toml$)|^[^/]+$' <<<"$CHANGED" | grep -vE '\.md$|^(middleware|instrumentation)\.(ts|tsx|js)$' || true)"
if [[ -n "$RISKY" && "${CODEX_LOOP_TRUST_DIFF:-0}" != "1" ]]; then
  { echo "## Verification run by the runner"; echo
    echo "Not run. This change touches root-level files, scripts, CI or Supabase config, which control how checks run, and code written by Codex would execute outside its sandbox. A person must review and run the checks (or set \`CODEX_LOOP_TRUST_DIFF=1\`):"; echo
    sed 's/^/- `/; s/$/`/' <<<"$RISKY"; } > "$OUT"
  exit 3
fi

# ---- 1b. check a clean checkout of the exact commit, not the working directory.
# A worktree carries ignored files (test-results/, .next/, logs) that tsconfig and the build
# pick up, so the same commit can fail there and pass on a clean copy. The baseline is a clean
# checkout, so the change must be one too, and the two then differ only by the commit.
mkdir -p "$WORKTREES"
CHECK_DIR="$WORKTREES/.verify-${HEAD_SHA:0:7}"
if [[ -e "$CHECK_DIR" ]]; then git -C "$ROOT" worktree remove --force "$CHECK_DIR" >/dev/null 2>&1 || rm -rf "$CHECK_DIR"; fi
git -C "$ROOT" worktree prune
git -C "$ROOT" worktree add --detach "$CHECK_DIR" "$HEAD_SHA" >/dev/null 2>&1 \
  || { echo "verify: cannot make a clean checkout of $HEAD_SHA" >&2; exit 64; }
ln -sfn "$WT/node_modules" "$CHECK_DIR/node_modules"
trap 'git -C "$ROOT" worktree remove --force "$CHECK_DIR" >/dev/null 2>&1 || true' EXIT

# ---- 2. scrubbed environment; loopback-only Supabase
scrubbed() { # dir cmd...   run cmd in dir with only HOME/PATH/TMPDIR/locale and the env file
  local d="$1"; shift
  ( cd "$d" && env -i HOME="$SCRUB_HOME" npm_config_cache="$SCRUB_HOME/.npm" PATH="$PATH" \
      TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" CI=1 NEXT_TELEMETRY_DISABLED=1 \
      ENVF="$ENV_FILE" bash -c '
        if [[ -n "$ENVF" ]]; then set -a; . "$ENVF"; set +a; fi
        # Assigned, never defaulted: a hosted value in the env file must not reach the app.
        export NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_TEST_URL:-}"
        export NEXT_PUBLIC_SUPABASE_ANON_KEY="${SUPABASE_TEST_ANON_KEY:-}"
        export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_TEST_SERVICE_ROLE_KEY:-}"
        unset SUPABASE_ACCESS_TOKEN
        exec "$@"' _ "$@" )
}
LOOPBACK_RE='^[a-zA-Z][a-zA-Z0-9+.-]*://([^/@]*@)?(127\.0\.0\.1|localhost|\[::1\])([:/]|$)'
SUPA_URL=""; NONLOOP=""
if [[ -n "$ENV_FILE" && -r "$ENV_FILE" ]]; then
  SUPA_URL="$(env -i bash -c 'set -a; . "$1"; set +a; printf %s "${SUPABASE_TEST_URL:-}"' _ "$ENV_FILE" 2>/dev/null)"
  # Every Supabase URL or host value in the file must be loopback, not just SUPABASE_TEST_URL:
  # the checks and the app read others, and a hosted one would run Codex-written code against
  # a real project.
  while IFS== read -r k v; do
    [[ -n "$k" ]] || continue
    [[ "$v" =~ $LOOPBACK_RE ]] || NONLOOP="$NONLOOP $k"
  done < <(env -i bash -c 'set -a; . "$1"; set +a; env' _ "$ENV_FILE" 2>/dev/null | grep -E '^[A-Za-z_]*SUPABASE[A-Za-z_]*(URL|HOST)[A-Za-z_]*=')
fi
env_reason=""  # empty means a usable, loopback-only local test environment exists
db_reason=""   # empty means the local API also answers (database suites can run)
if [[ -z "$ENV_FILE" || ! -r "$ENV_FILE" ]]; then env_reason="no local test environment (CODEX_LOOP_ENV_FILE not set)"
elif [[ -z "$SUPA_URL" ]]; then env_reason="SUPABASE_TEST_URL is not set in the env file"
elif ! [[ "$SUPA_URL" =~ $LOOPBACK_RE ]]; then env_reason="refusing a non-loopback SUPABASE_TEST_URL"
elif [[ -n "$NONLOOP" ]]; then env_reason="refusing: not a loopback address in the env file:$NONLOOP"
fi
if [[ -n "$env_reason" ]]; then db_reason="$env_reason"
else
  code="$(curl --noproxy '*' -s -o /dev/null --connect-timeout 3 --max-time 6 -w '%{http_code}' "$SUPA_URL/rest/v1/" 2>/dev/null || true)"
  [[ -n "$code" && "$code" != "000" ]] || db_reason="local Supabase is not running (no response from the local API)"
fi

# ---- 3. the checks
LIMIT=(perl -e 'alarm shift @ARGV; exec @ARGV or die "cannot exec $ARGV[0]: $!\n"')

check_cmd() { # name -> prints: timeout lock(0/1) vitest(0/1) command...
  case "$1" in
    types)        echo "600 0 0 npx tsc --noEmit" ;;
    lint)         echo "600 0 0 npm run lint" ;;
    contracts)    echo "900 0 1 npm run test:contracts --" ;;
    architecture) echo "900 0 1 npm run test:architecture --" ;;
    build)        echo "1200 1 0 npm run build" ;;
    db)           echo "1800 1 1 npm run test:db --" ;;
    suite)        echo "2400 1 1 npm test -- $SUITE_EXCLUDE" ;;
    *)            return 1 ;;
  esac
}
# `npm test` runs every vitest file, so it repeats the contracts, architecture and database
# checks. Those three already ran as their own rows, so the whole-suite run covers the rest
# of the files and the rows together are the whole suite. One run of each, not two. The
# form `--exclude=dir/**` has no space and cannot be glob-expanded by the shell into files.
SUITE_EXCLUDE=""; SUITE_NOTE=""
for _n in contracts architecture db; do
  case ",$CHECKS," in *",$_n,"*)
    case "$_n" in contracts) _d=tests/contracts;; architecture) _d=tests/architecture;; db) _d=tests/database;; esac
    SUITE_EXCLUDE="$SUITE_EXCLUDE --exclude=$_d/**"
    SUITE_NOTE="${SUITE_NOTE:+$SUITE_NOTE, }$_n" ;;
  esac
done
[[ -n "$SUITE_NOTE" ]] && SUITE_NOTE="the $SUITE_NOTE files ran as their own rows above and are not run twice"
needs_env() { [[ "$1" == "db" || "$1" == "suite" || "$1" == "build" ]]; }
needs_live_db() { [[ "$1" == "db" || "$1" == "suite" ]]; }

# The command for running only some vitest files. The database check needs SUPABASE_LOCAL=1
# the way `npm run test:db` sets it; without it those tests do not run against the database.
vitest_files_cmd() { case "$1" in db) echo "env SUPABASE_LOCAL=1 npx vitest run";; *) echo "npx vitest run";; esac; }

# run one check in <dir>, store exit/duration/ids/counts under <resdir>. With a 4th argument
# (test files), a vitest check runs only those files.
exec_check() { # dir resdir name [files]
  local d="$1" r="$2" n="$3" t lockflag vit cmd json start rc
  read -r t lockflag vit cmd <<<"$(check_cmd "$n")"
  json="$r/$n.json"; start=$(date +%s)
  local full=($cmd)
  [[ "$vit" == "1" && -n "${4:-}" ]] && full=($(vitest_files_cmd "$n") $4)
  [[ "$vit" == "1" ]] && full+=(--reporter=json "--outputFile=$json")
  if [[ "$lockflag" == "1" ]]; then scrubbed "$d" "$LOCK" "${LIMIT[@]}" "$t" "${full[@]}" >"$r/$n.log" 2>&1
  else scrubbed "$d" "${LIMIT[@]}" "$t" "${full[@]}" >"$r/$n.log" 2>&1; fi
  rc=$?
  echo "$rc" > "$r/$n.exit"; echo $(( $(date +%s) - start )) > "$r/$n.secs"
  if [[ "$vit" == "1" && -s "$json" ]]; then
    jq -r '.testResults[] | . as $f | ($f.name | sub("^.*/(?<p>(tests|lib|app)/.*)$"; "\(.p)")) as $p
           | (($f.assertionResults[]? | select(.status=="failed") | "\($p) > \(.fullName)"),
              (select(.status=="failed" and ([.assertionResults[]? | select(.status=="failed")] | length)==0) | "\($p) (suite)"))' "$json" 2>/dev/null | sort -u > "$r/$n.ids"
    jq -r '"\(.numPassedTests) passed, \(.numFailedTests) failed, \(.numPendingTests) skipped of \(.numTotalTests)"' "$json" > "$r/$n.counts" 2>/dev/null
  else
    grep -iE 'error' "$r/$n.log" | sed -E 's/\([0-9]+,[0-9]+\)//; s/:[0-9]+:[0-9]+//' | sort -u | head -50 > "$r/$n.ids"
    : > "$r/$n.counts"
  fi
}

# Timing-sensitive tests (process groups, local listeners, 15 s timeouts) fail differently run
# to run under load, so a failure that is "new" against the baseline is run once more, only
# the failing files, with a longer timeout, before it counts against the change. Only
# failures that fail again are real. Vitest checks only.
rerun_new_failures() { # name -> narrows $RES/$n.new to failures that persist
  local n="$1" files json lockflag t vit cmd f
  read -r t lockflag vit cmd <<<"$(check_cmd "$n")"
  [[ "$vit" == "1" ]] || return 0
  files="$(sed -E 's/ (>|\().*$//' "$RES/$n.new" | sort -u | tr '\n' ' ')"
  [[ -n "${files// /}" ]] || return 0
  json="$RES/$n.rerun.json"; rm -f "$json"
  local full=($(vitest_files_cmd "$n") $files --testTimeout=60000 --hookTimeout=90000 --reporter=json "--outputFile=$json")
  if [[ "$lockflag" == "1" ]]; then scrubbed "$CHECK_DIR" "$LOCK" "${LIMIT[@]}" "$t" "${full[@]}" >"$RES/$n.rerun.log" 2>&1
  else scrubbed "$CHECK_DIR" "${LIMIT[@]}" "$t" "${full[@]}" >"$RES/$n.rerun.log" 2>&1; fi
  if [[ -s "$json" ]]; then
    jq -r '.testResults[] | . as $f | ($f.name | sub("^.*/(?<p>(tests|lib|app)/.*)$"; "\(.p)")) as $p
           | (($f.assertionResults[]? | select(.status=="failed") | "\($p) > \(.fullName)"),
              (select(.status=="failed" and ([.assertionResults[]? | select(.status=="failed")] | length)==0) | "\($p) (suite)"))' "$json" 2>/dev/null | sort -u > "$RES/$n.rerun.ids"
    comm -12 "$RES/$n.new" "$RES/$n.rerun.ids" > "$RES/$n.persist"
    cp "$RES/$n.new" "$RES/$n.firstnew"; cp "$RES/$n.persist" "$RES/$n.new"
  fi
}

BASE_DIR="$WORKTREES/.baseline-${BASE_SHA:0:7}"
ensure_baseline() {
  if [[ ! -d "$BASE_DIR" ]]; then
    git -C "$ROOT" worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null 2>&1 || return 1
  fi
  # The baseline copy is cached by commit, but the worktree it borrows dependencies from
  # changes every run, so the link is always refreshed. A stale link made the baseline fail
  # to start and every real failure look new.
  ln -sfn "$WT/node_modules" "$BASE_DIR/node_modules"
  [[ -x "$BASE_DIR/node_modules/.bin/vitest" && -x "$BASE_DIR/node_modules/.bin/tsc" ]]
}

status_of() { echo "$1|$2"; }
: > "$RES/rows"; NEW_FAIL=0; REQUIRED_MISSING=0; NOTES=""
REQ_DB=0; grep -qE '^(supabase/|tests/database/|lib/)' <<<"$CHANGED" && REQ_DB=1

IFS=',' read -r -a LIST <<<"$CHECKS"
for n in "${LIST[@]}"; do
  check_cmd "$n" >/dev/null || { echo "verify: unknown check $n" >&2; exit 64; }
  label="$n"; case "$n" in types) label="Types";; lint) label="Lint";; contracts) label="Contracts";; architecture) label="Architecture";; build) label="Build";; db) label="Database";; suite) label="Whole suite";; esac
  cmdtxt="$(check_cmd "$n" | cut -d' ' -f4- | sed 's/ --$//')"
  skip=""
  if needs_env "$n" && [[ -n "$env_reason" ]]; then skip="$env_reason"
  elif needs_live_db "$n" && [[ -n "$db_reason" ]]; then skip="$db_reason"; fi
  if [[ -n "$skip" ]]; then
    printf '| %s | `%s` | NOT RUN | %s |\n' "$label" "$cmdtxt" "$skip" >> "$RES/rows"
    if needs_live_db "$n" && (( REQ_DB )); then REQUIRED_MISSING=1; fi
    continue
  fi
  echo "verify: running $n ..." >&2
  exec_check "$CHECK_DIR" "$RES" "$n"
  rc="$(cat "$RES/$n.exit")"; secs="$(cat "$RES/$n.secs")"; counts="$(cat "$RES/$n.counts")"
  [[ "$n" == "suite" && -n "$SUITE_NOTE" ]] && counts="${counts:-exit $rc}; $SUITE_NOTE"
  if [[ "$rc" == "0" ]]; then
    printf '| %s | `%s` | PASS | %s%s (%ss) |\n' "$label" "$cmdtxt" "${counts:-exit 0}" "" "$secs" >> "$RES/rows"
    continue
  fi
  # A failure with nothing identifiable (no failing test, no error line) is never "same as
  # baseline": it is usually a broken environment, so it counts against the change.
  if [[ ! -s "$RES/$n.ids" ]]; then
    NEW_FAIL=1
    printf '| %s | `%s` | **NEW FAILURES** | exit %s with no identifiable failing test or error line; see the runner log (%ss) |\n' "$label" "$cmdtxt" "$rc" "$secs" >> "$RES/rows"
    NOTES="$NOTES"$'\n'"$label failed without identifiable failures; last log lines:"$'\n'"$(tail -5 "$RES/$n.log" | sed 's/^/    /')"
    continue
  fi
  # failed: compare with the baseline copy, once per check
  if ensure_baseline; then
    # Only the files that failed on the change are rerun on the base. Running the whole check
    # again on the base cost as long as the check itself (a full architecture run is ten
    # minutes, the whole suite seventeen) to learn about a handful of files.
    bfiles=""
    read -r _t _l _v _c <<<"$(check_cmd "$n")"
    [[ "$_v" == "1" ]] && bfiles="$(sed -E 's/ (>|\().*$//' "$RES/$n.ids" | sort -u | tr '\n' ' ')"
    exec_check "$BASE_DIR" "$BASE_RES" "$n" "$bfiles"
    brc="$(cat "$BASE_RES/$n.exit")"
    # A baseline that could not start (command not found, no results) proves nothing.
    if [[ "$brc" == "126" || "$brc" == "127" ]]; then brc="?"; fi
    if [[ "$brc" == "?" ]]; then cp "$RES/$n.ids" "$RES/$n.new"
    else comm -23 "$RES/$n.ids" "$BASE_RES/$n.ids" > "$RES/$n.new"; fi
  else brc="?"; cp "$RES/$n.ids" "$RES/$n.new"; fi
  nfirst="$(wc -l < "$RES/$n.new" | tr -d ' ')"
  if [[ "$nfirst" != "0" ]]; then rerun_new_failures "$n"; fi
  nnew="$(wc -l < "$RES/$n.new" | tr -d ' ')"
  if [[ "$nfirst" != "0" && "$nnew" == "0" ]]; then
    printf '| %s | `%s` | PASS (FLAKY) | %s; %s test(s) failed only on the first run and passed when rerun alone with a longer timeout; failures that match the base commit are not counted (%ss) |\n' "$label" "$cmdtxt" "${counts:-exit $rc}" "$nfirst" "$secs" >> "$RES/rows"
  elif [[ "$brc" != "0" && "$brc" != "?" && "$nnew" == "0" ]]; then
    printf '| %s | `%s` | SAME AS BASELINE | %s; clean copy of the base commit fails the same way (exit %s) (%ss) |\n' "$label" "$cmdtxt" "${counts:-exit $rc}" "$brc" "$secs" >> "$RES/rows"
  else
    NEW_FAIL=1
    if [[ "$brc" == "?" ]]; then
      printf '| %s | `%s` | **NEW FAILURES** | exit %s; the clean baseline copy could not run, so these cannot be compared and all %s count against the change (%ss) |\n' "$label" "$cmdtxt" "$rc" "$nnew" "$secs" >> "$RES/rows"
    else
      printf '| %s | `%s` | **NEW FAILURES** | exit %s, %s new failure(s) not on the base commit (%ss) |\n' "$label" "$cmdtxt" "$rc" "$nnew" "$secs" >> "$RES/rows"
    fi
    NOTES="$NOTES"$'\n'"New failures in $label (first 10):"$'\n'"$(head -10 "$RES/$n.new" | sed 's/^/- /')"
  fi
done

if (( REQ_DB )); then
  for n in db suite; do
    case ",$CHECKS," in *",$n,"*) continue ;; esac
    label="Database"; [[ "$n" == "suite" ]] && label="Whole suite"
    cmdtxt="$(check_cmd "$n" | cut -d' ' -f4- | sed 's/ --$//')"
    printf '| %s | `%s` | NOT RUN | not selected by CODEX_LOOP_VERIFY, but this change touches supabase/, lib/ or tests/database/ |\n' "$label" "$cmdtxt" >> "$RES/rows"
    REQUIRED_MISSING=1
  done
fi

{
  echo "## Verification run by the runner, outside the Codex sandbox"
  echo
  echo "Tested revision: \`$HEAD_SHA\` on base \`$BASE_SHA\`. Run $(date -u +%Y-%m-%dT%H:%MZ). Environment scrubbed to the local test values; Supabase must be loopback."
  echo
  echo "| Check | Command | Result | Detail |"
  echo "| --- | --- | --- | --- |"
  cat "$RES/rows"
  [[ -n "$NOTES" ]] && printf '%s\n' "$NOTES"
  if (( REQUIRED_MISSING )); then
    echo; echo "**Not verified:** this change touches \`supabase/\`, \`lib/\` or \`tests/database/\`, and a database suite did not run. It must not merge until a person runs it."
  fi
} > "$OUT"

echo "verify: logs kept in $RES (baseline: $BASE_RES)" >&2
(( NEW_FAIL )) && exit 1
(( REQUIRED_MISSING )) && exit 1
exit 0
