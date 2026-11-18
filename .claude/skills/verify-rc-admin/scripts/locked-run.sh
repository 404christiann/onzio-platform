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
pids=()
# Kill exactly what this run started (the server pid and any child it forked), never by name.
stop() { for p in ${pids[@]+"${pids[@]}"}; do pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done; rm -f "$CACHE"/server-$$-*.pid "$AUTH"; }
trap stop EXIT
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
"$RCV_SKILL/scripts/seed-local.sh" "$RCV_BASE_SRC" > "$LOG/seed.log" 2>&1 || { tail -15 "$LOG/seed.log" >&2; fail "seed failed (see logs/seed.log)"; }

start() { # <dir> <port> <name>
  # exec node directly so $! is the server itself (npx would leave next-server as an orphaned child)
  (cd "$1" && ONZIO_ENVIRONMENT=staging NEXT_TELEMETRY_DISABLED=1 exec node node_modules/next/dist/bin/next start -p "$2" > "$LOG/server-$3.log" 2>&1) &
  pids+=($!); echo $! > "$CACHE/server-$$-$3.pid"
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
(cd "$RCV_WT" && RCV_HEAD_URL="$HEAD_URL" RCV_MAIN_URL="$BASE_URL" RCV_STORAGE="$AUTH" RCV_OUT="$RCV_OUT" \
  RCV_ROUTE="$RCV_ROUTE" RCV_TOUCHED="$RCV_TOUCHED" RCV_SHARED_FIX="$RCV_SHARED_FIX" \
  npx playwright test --config="$RCV_SKILL/playwright.config.ts" > "$LOG/playwright.log" 2>&1)
code=$?
tail -40 "$LOG/playwright.log"
exit $code
