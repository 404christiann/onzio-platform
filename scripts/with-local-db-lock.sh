#!/usr/bin/env bash
# Run one command while holding the machine-wide lock for the shared local Supabase and
# browser ports. Agents must wrap every database or browser suite with this script.
# Usage: scripts/with-local-db-lock.sh <command> [args...]
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

LOCK="${ONZIO_DB_LOCK_DIR:-/tmp/onzio-local-db.lock}"
WAIT_LIMIT_SECONDS="${ONZIO_DB_LOCK_WAIT:-1800}"
POLL_SECONDS="${ONZIO_DB_LOCK_POLL:-10}"
waited=0

acquire() {
  if mkdir "$LOCK" 2>/dev/null; then
    echo "$$" > "$LOCK/pid"
    return 0
  fi
  local holder
  holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [[ -z "$holder" ]] || ! kill -0 "$holder" 2>/dev/null; then
    rm -rf "$LOCK"
    return 1
  fi
  return 1
}

until acquire; do
  if (( waited >= WAIT_LIMIT_SECONDS )); then
    echo "local database lock held by pid $(cat "$LOCK/pid" 2>/dev/null || echo unknown) for over ${WAIT_LIMIT_SECONDS}s; giving up" >&2
    exit 75
  fi
  sleep "$POLL_SECONDS"
  waited=$((waited + POLL_SECONDS))
done

trap 'rm -rf "$LOCK"' EXIT INT TERM
"$@"
