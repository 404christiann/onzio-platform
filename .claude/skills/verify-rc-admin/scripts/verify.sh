#!/usr/bin/env bash
# verify-rc-admin driver. One call verifies one Rose City admin package (RC-ADMIN-01..06).
#
#   verify.sh doctor  --worktree <pkg>
#   verify.sh run     --worktree <pkg> --route /admin/<editor> --package RC-ADMIN-0N \
#                     [--touched key,key] [--shared-fix] [--base origin/main]
#   verify.sh cleanup
#
# run = gate 1 (scope; a failure exits here, before anything else), doctor (including the env
# target check), gate 5 (typecheck, unit/architecture, selector debt), both production builds,
# then ONE scripts/with-local-db-lock.sh hold for: db reset, seed, servers, sign-in,
# Playwright (gates 2, 3, 4, 6), server teardown. Evidence: <pkg>/test-results/rc-admin-verify/<run>/.
set -uo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
CACHE=/private/tmp/onzio-rc-admin-verify
HEAD_PORT=3110 BASE_PORT=3111
CMD="${1:-}"; shift || true
WT="" ROUTE="" PKG="" TOUCHED="" SHARED=0 BASE=origin/main
while [[ $# -gt 0 ]]; do case "$1" in
  --worktree) WT="$2"; shift 2;; --route) ROUTE="$2"; shift 2;; --package) PKG="$2"; shift 2;;
  --touched) TOUCHED="$2"; shift 2;; --shared-fix) SHARED=1; shift;; --base) BASE="$2"; shift 2;;
  *) echo "verify: unknown argument $1" >&2; exit 64;; esac; done

die() { echo "verify: $*" >&2; exit 1; }
port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

doctor() { # read-only: is this machine and worktree fit to verify?
  local ok=1 main_checkout
  [[ -n "$WT" && -d "$WT/.git" || -f "$WT/.git" ]] || { echo "doctor: --worktree is not a git worktree"; return 1; }
  main_checkout="$(git -C "$WT" worktree list --porcelain | awk 'NR==1{print $2}')"
  [[ "$(cd "$WT" && pwd -P)" != "$(cd "$main_checkout" && pwd -P)" ]] || { echo "doctor: FAIL refusing the main checkout"; ok=0; }
  # Not just "the files exist": every Supabase/database URL must be the shared local stack.
  if [[ -f "$WT/.env.local" && -f "$WT/.env.test" ]]; then
    node "$SKILL/scripts/check-env-target.mjs" "$WT/.env.local" "$WT/.env.test" | sed 's/^/doctor: /'
    [[ ${PIPESTATUS[0]} == 0 ]] || ok=0
  else echo "doctor: FAIL no .env.local/.env.test (scripts/provision-worktree-env.sh $WT)"; ok=0; fi
  [[ -d "$WT/node_modules" ]] || { echo "doctor: FAIL no node_modules (npm ci)"; ok=0; }
  [[ -f "$WT/node_modules/axe-core/axe.min.js" ]] || { echo "doctor: FAIL node_modules/axe-core missing"; ok=0; }
  [[ "$(supabase --version 2>/dev/null | tail -1)" == "2.109.1" ]] || { echo "doctor: FAIL supabase CLI is not 2.109.1"; ok=0; }
  grep -q '^project_id = "onzio-platform-contracts"' "$WT/supabase/config.toml" || { echo "doctor: FAIL supabase/config.toml project is not onzio-platform-contracts"; ok=0; }
  docker ps --format '{{.Names}}' | grep -qx supabase_db_onzio-platform-contracts || { echo "doctor: FAIL shared stack (supabase_db_onzio-platform-contracts) is not running"; ok=0; }
  curl -sf -o /dev/null http://127.0.0.1:54324/api/v1/messages || { echo "doctor: FAIL Inbucket 127.0.0.1:54324 not answering"; ok=0; }
  [[ -d "/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site/public" ]] || { echo "doctor: FAIL Diverse City source assets missing"; ok=0; }
  [[ -f "/Users/christianalcala/Documents/ChatGPT/Rose City 2027 Revamp/review-notes/shop-2027/legacy-public-shop.json" ]] || { echo "doctor: FAIL Rose City shop source JSON missing"; ok=0; }
  git -C "$WT" rev-parse --verify -q "$BASE" >/dev/null || { echo "doctor: FAIL $BASE unknown (git fetch origin main)"; ok=0; }
  for p in $HEAD_PORT $BASE_PORT; do port_free $p || echo "doctor: note port $p is busy now (another locked run?); run waits for the lock, then re-checks"; done
  echo "doctor: ledger $(docker exec supabase_db_onzio-platform-contracts psql -U postgres -Atc 'select max(version) from supabase_migrations.schema_migrations' 2>/dev/null) / newest migration $(ls "$WT/supabase/migrations" | tail -1 | cut -d_ -f1)"
  [[ $ok == 1 ]] && echo "doctor: OK" || return 1
}

build() { # <dir> <log>
  (cd "$1" && ONZIO_ENVIRONMENT=staging NEXT_TELEMETRY_DISABLED=1 npx next build > "$2" 2>&1) || { tail -30 "$2" >&2; return 1; }
}

run() {
  [[ -n "$WT" && -n "$ROUTE" && -n "$PKG" ]] || die "run needs --worktree, --route and --package"
  WT="$(cd "$WT" && pwd)"
  local stamp out base_sha base_src gate1 gate5 status=0
  stamp="$(date +%Y%m%d-%H%M%S)-${PKG}"
  out="$WT/test-results/rc-admin-verify/$stamp"; mkdir -p "$out/results" "$out/logs"
  base_sha="$(git -C "$WT" rev-parse "$BASE")" || die "$BASE unknown (git fetch origin main)"
  echo "{\"package\":\"$PKG\",\"route\":\"$ROUTE\",\"touched\":\"$TOUCHED\",\"sharedFix\":$SHARED,\"worktree\":\"$WT\",\"head\":\"$(git -C "$WT" rev-parse HEAD)\",\"base\":\"$BASE\",\"baseSha\":\"$base_sha\",\"started\":\"$(date -u +%FT%TZ)\"}" > "$out/results/run.json"

  # Gate 1 runs first and stops the run: a package outside scope never reaches the doctor, the
  # builds, the lock, a db reset or any other database action.
  echo "== gate 1 scope + gate 5 selector debt"
  node "$SKILL/scripts/scope-check.mjs" --worktree "$WT" --base "$BASE" > "$out/results/scope.json"; gate1=$?
  if [[ $gate1 != 0 ]]; then
    node "$SKILL/scripts/report.mjs" "$out" > /dev/null 2>&1
    echo "verify: gate 1 (scope) failed; stopped before any database action. Report: $out/report.html" >&2
    exit 1
  fi
  doctor || die "doctor failed"
  echo "== gate 5 typecheck, unit (includes architecture and contracts), architecture"
  (cd "$WT" && npx tsc --noEmit > "$out/logs/typecheck.log" 2>&1); local tsc=$?
  (cd "$WT" && npm run test:unit > "$out/logs/unit.log" 2>&1); local unit=$?
  (cd "$WT" && npx vitest run --project unit tests/architecture > "$out/logs/architecture.log" 2>&1); local arch=$?
  node -e '
    const fs=require("fs"),[out,tsc,unit,arch]=process.argv.slice(1);
    const tail=(f)=>{const t=fs.readFileSync(f,"utf8");return (t.match(/Tests\s+.*$/m)||[""])[0].trim()+" | "+(t.match(/Test Files\s+.*$/m)||[""])[0].trim()};
    const scope=JSON.parse(fs.readFileSync(out+"/results/scope.json","utf8"));
    fs.writeFileSync(out+"/results/repo-gates.json",JSON.stringify({gate:5,typecheck:+tsc===0,unit:+unit===0,unitSummary:tail(out+"/logs/unit.log"),architecture:+arch===0,architectureSummary:tail(out+"/logs/architecture.log"),selectorDebtIdentical:scope.selectorDebtIdentical},null,2));
  ' "$out" "$tsc" "$unit" "$arch"
  [[ $gate1 == 0 && $tsc == 0 && $unit == 0 && $arch == 0 ]] || status=1

  echo "== builds (package HEAD and pristine $BASE ${base_sha:0:8})"
  # One cache per package worktree (wt-<hash of its realpath>/base-<sha>): two runs on different worktrees never share a
  # build directory, so they cannot break each other's build. The same worktree reuses its own cache for the same SHA.
  base_src="$(node "$SKILL/scripts/holders.mjs" cache-dir "$WT" "$base_sha")"
  echo "verify: base build cache $base_src"
  # At most one base build per worktree: drop older SHAs first (frees space before the build, not after).
  prune_old_base() {
    while IFS= read -r old; do [[ -n "$old" ]] && { echo "verify: removing old base cache $old"; rm -rf "$old"; }; done \
      < <(node "$SKILL/scripts/holders.mjs" stale-cache "$WT" "$base_sha")
  }
  prune_old_base
  # Fail fast with a clear message rather than start a build that could fill the host volume.
  node "$SKILL/scripts/holders.mjs" disk-check "$CACHE" || die "not enough free disk; no build started"
  if [[ ! -f "$base_src/.next/BUILD_ID" ]]; then
    rm -rf "$base_src"; mkdir -p "$base_src"
    git -C "$WT" archive "$base_sha" | tar -x -C "$base_src" || die "archive failed"
    cp -cR "$WT/node_modules" "$base_src/" && install -m 600 "$WT/.env.local" "$WT/.env.test" "$base_src/"
    build "$base_src" "$out/logs/build-base.log" || die "base build failed"
  fi
  node "$SKILL/scripts/holders.mjs" disk-check "$CACHE" || die "not enough free disk; package build not started"
  build "$WT" "$out/logs/build-head.log" || die "package build failed"
  prune_old_base

  # Clear lock holders left behind by a dead or overdue run (recorded server pids only, each re-checked), then say who still
  # holds the lock before we wait for it.
  local lock_file="${ONZIO_DB_LOCK_FILE:-/tmp/onzio-local-db.lock}"
  node "$SKILL/scripts/holders.mjs" sweep "$lock_file"
  if [[ -n "$(lsof -t "$lock_file" 2>/dev/null)" ]]; then
    echo "verify: the DB lock is held; waiting (not killing anything unrecorded). Holders:"
    lsof -nP "$lock_file" 2>/dev/null | sed 's/^/verify:   /'
  fi
  echo "== waiting for the shared local DB lock, then reset + seed + servers + sign-in + browser gates"
  RCV_WT="$WT" RCV_BASE_SRC="$base_src" RCV_OUT="$out" RCV_ROUTE="$ROUTE" RCV_TOUCHED="$TOUCHED" RCV_SHARED_FIX="$SHARED" \
  RCV_SKILL="$SKILL" RCV_HEAD_PORT=$HEAD_PORT RCV_BASE_PORT=$BASE_PORT \
    "$WT/scripts/with-local-db-lock.sh" bash "$SKILL/scripts/locked-run.sh" || status=1

  node "$SKILL/scripts/report.mjs" "$out" || status=1
  echo "verify: base build cache size: $(node "$SKILL/scripts/holders.mjs" cache-size "$WT")"
  echo "verify: report $out/report.html"
  return $status
}

cleanup() { # servers this skill started (pid files), never by process name; evidence is kept
  for f in "$CACHE"/server-*.pid; do [[ -f "$f" ]] && { pkill -P "$(cat "$f")" 2>/dev/null; kill "$(cat "$f")" 2>/dev/null; rm -f "$f"; }; done
  rm -f "$CACHE"/auth-*.json
  echo "cleanup: servers stopped, auth state removed; base build caches kept in $CACHE/wt-*/; evidence kept under <worktree>/test-results/rc-admin-verify/"
}

case "$CMD" in doctor) doctor;; run) run;; cleanup) cleanup;; *) sed -n 2,12p "$0"; exit 64;; esac
