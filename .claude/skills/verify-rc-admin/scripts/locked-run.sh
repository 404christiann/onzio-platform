#!/usr/bin/env bash
# Runs INSIDE scripts/with-local-db-lock.sh (verify.sh calls it; do not call it bare).
# One hold: reset the shared stack to the package's migrations, seed, start both builds,
# sign in once, run the browser gates, stop the servers it started.
set -uo pipefail
: "${RCV_WT:?}" "${RCV_BASE_SRC:?}" "${RCV_OUT:?}" "${RCV_SKILL:?}"
CACHE=/private/tmp/onzio-rc-admin-verify
LOG="$RCV_OUT/logs"
HEAD_URL="http://rose-city.localhost:$RCV_HEAD_PORT" BASE_URL="http://rose-city.localhost:$RCV_BASE_PORT"
AUTH="$CACHE/auth-$$.json"
LOCK_FILE="${ONZIO_DB_LOCK_FILE:-/tmp/onzio-local-db.lock}"
HOLDERS="$RCV_SKILL/scripts/holders.mjs"
pids=() recorded=()
# Record the servers this run starts beside the lock, so a later run can clear them if this one dies without its trap.
record_holder() { node "$HOLDERS" record "$LOCK_FILE" "$$" "$RCV_WT" ${recorded[@]+"${recorded[@]}"}; }
# Kill exactly what this run started (the server pid and any child it forked), never by name.
stop() {
  for p in ${pids[@]+"${pids[@]}"}; do pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done
  # We hold the DB lock, so whatever still listens on our two ports is ours. A leaked next-server keeps the lock's file
  # descriptor open and blocks every other worker's locked run until it is killed.
  for port in "$RCV_HEAD_PORT" "$RCV_BASE_PORT"; do kill $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null) 2>/dev/null; done
  rm -f "$CACHE"/server-$$-*.pid "$AUTH"
  node "$HOLDERS" remove "$LOCK_FILE" "$$"
}
trap stop EXIT
record_holder # the run itself, before any server: a run that dies early is still recognisable as dead
fail() { echo "locked-run: $*" >&2; echo "{\"gate\":\"setup\",\"error\":\"$*\"}" > "$RCV_OUT/results/setup.json"; exit 1; }

# Defence in depth: re-check the env target here too, before the reset, in case this script is
# ever run without verify.sh's doctor.
node "$RCV_SKILL/scripts/check-env-target.mjs" "$RCV_WT/.env.local" "$RCV_WT/.env.test" "$RCV_BASE_SRC/.env.local" > "$LOG/env-target.log" 2>&1 \
  || { cat "$LOG/env-target.log" >&2; fail "env target refused (see logs/env-target.log)"; }

# NEXT_PUBLIC_* values are inlined into the client bundles at build time, and the base build is
# cached by SHA, so check what the builds actually contain, not only today's env files. (A bare
# "*.supabase.co" is a supabase-js allow-list literal in every build; a project URL is not.)
for dir in "$RCV_WT" "$RCV_BASE_SRC"; do
  if grep -rlE 'ioalthwsdrlzrubomrow|https://[a-z0-9]{20}\.supabase\.(co|in)|(127\.0\.0\.1|localhost):5532[1-4]' "$dir/.next/static" > "$LOG/build-target.log" 2>/dev/null; then
    fail "a build in $dir inlines a non-local Supabase target (see logs/build-target.log; delete its .next and rebuild)"
  fi
done

for p in "$RCV_HEAD_PORT" "$RCV_BASE_PORT"; do
  ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || fail "port $p is in use inside the lock; something outside the lock owns it"
done

echo "locked-run: db reset (package worktree migrations, supabase CLI $(supabase --version 2>/dev/null | tail -1))"
(cd "$RCV_WT" && supabase db reset --local > "$LOG/db-reset.log" 2>&1) || fail "supabase db reset failed (see logs/db-reset.log)"
ledger="$(docker exec supabase_db_onzio-platform-contracts psql -U postgres -Atc 'select max(version) from supabase_migrations.schema_migrations')"
newest="$(ls "$RCV_WT/supabase/migrations" | tail -1 | cut -d_ -f1)"
[[ "$ledger" == "$newest" ]] || fail "ledger $ledger != newest migration $newest after reset"

echo "locked-run: seed Rose City + Diverse City"
# Right after a reset PostgREST can still serve the old schema cache ("Could not query the database for the schema cache"):
# ask it to reload and retry the seed a few times (local stack only; the seed is upserts).
seeded=0
for attempt in 1 2 3; do
  docker exec supabase_db_onzio-platform-contracts psql -U postgres -qAtc "NOTIFY pgrst, 'reload schema'" >/dev/null 2>&1 || true
  sleep $((attempt * 3))
  "$RCV_SKILL/scripts/seed-local.sh" "$RCV_BASE_SRC" > "$LOG/seed.log" 2>&1 && { seeded=1; break; }
  grep -q "schema cache" "$LOG/seed.log" || break
  echo "locked-run: seed hit a stale schema cache (attempt $attempt), retrying"
done
[[ $seeded == 1 ]] || { tail -15 "$LOG/seed.log" >&2; fail "seed failed (see logs/seed.log)"; }

# with-local-db-lock.sh opens the lock and deliberately clears close-on-exec so the lock outlives its exec, which means
# every child of this script inherits the lock fd. A server must not: a leaked server would hold the DB lock for as long
# as it lives. Close the fd(s) that point at the lock file in the server's own subshell, before it execs node.
lock_fds() { # prints the fd numbers this script has open on the lock file (lsof: /dev/fd inodes sit on a different device)
  local real; real="$(cd "$(dirname "$LOCK_FILE")" && pwd -P)/$(basename "$LOCK_FILE")"
  lsof -a -p $$ -d 3-255 -Ffn 2>/dev/null | awk -v want="$real" '/^f/{fd=substr($0,2)} /^n/{ if (substr($0,2)==want) print fd }'
}
start() { # <dir> <port> <name>
  # exec node directly so $! is the server itself (npx would leave next-server as an orphaned child)
  local fd closers=""
  for fd in $(lock_fds); do closers+="exec $fd>&-; "; done
  (cd "$1" && eval "$closers" && ONZIO_ENVIRONMENT=staging NEXT_TELEMETRY_DISABLED=1 exec node node_modules/next/dist/bin/next start -p "$2" > "$LOG/server-$3.log" 2>&1) &
  pids+=($!); echo $! > "$CACHE/server-$$-$3.pid"
  recorded+=("$3:$!:$2"); record_holder
}
start "$RCV_WT" "$RCV_HEAD_PORT" head
start "$RCV_BASE_SRC" "$RCV_BASE_PORT" base
for url in "$HEAD_URL" "$BASE_URL"; do
  ready=0
  for _ in $(seq 90); do
    # Ready means the tenant resolves and the login page renders, not just that the port answers.
    curl -sf "$url/admin/login" | grep -q "Send sign-in code" && { ready=1; break; }
    sleep 1
  done
  [[ $ready == 1 ]] || fail "$url/admin/login never rendered (see logs/server-*.log)"
done

echo "locked-run: sign in (Inbucket code)"
(cd "$RCV_WT" && node "$RCV_SKILL/scripts/sign-in.mjs" "$HEAD_URL" "$AUTH" > "$LOG/sign-in.log" 2>&1) || fail "sign-in failed (see logs/sign-in.log)"

echo "locked-run: browser gates 2, 3, 4, 6"
# Playwright runs from the repo that holds this skill (its node_modules), not from the package worktree: the spec imports
# @playwright/test from here, and two copies of it in one run is an error. Same directory when the skill lives in the package.
SKILL_REPO="$(cd "$RCV_SKILL/../../.." && pwd)"
(cd "$SKILL_REPO" && RCV_HEAD_URL="$HEAD_URL" RCV_MAIN_URL="$BASE_URL" RCV_STORAGE="$AUTH" RCV_OUT="$RCV_OUT" \
  RCV_ROUTE="$RCV_ROUTE" RCV_TOUCHED="$RCV_TOUCHED" RCV_SHARED_FIX="$RCV_SHARED_FIX" \
  npx playwright test --config="$RCV_SKILL/playwright.config.ts" > "$LOG/playwright.log" 2>&1)
code=$?
tail -40 "$LOG/playwright.log"
exit $code
