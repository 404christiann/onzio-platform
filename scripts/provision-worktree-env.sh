#!/usr/bin/env bash
# Give a ticket worktree its local app and test environment, after checking that it is
# local-only. .env.local and .env.test are gitignored, so a new worktree starts without them,
# and Next.js loads .env.local by itself, so whatever it holds is what a worker's build or dev
# server talks to. The files come from one vetted folder (default ~/.codex/onzio-local-env),
# are refused unless every Supabase and database URL is loopback and nothing names a hosted
# Supabase project or a live Stripe key, and are copied with mode 600. Values are never
# printed, only the names of variables that fail.
#
#   scripts/provision-worktree-env.sh <worktree>
#   CODEX_LOOP_ENV_DIR=dir   where the vetted .env.local and .env.test live
set -uo pipefail

SRC="${CODEX_LOOP_ENV_DIR:-$HOME/.codex/onzio-local-env}"
[[ $# -eq 1 && -d "$1" ]] || { echo "usage: $0 <worktree>" >&2; exit 64; }
WT="$(cd "$1" && pwd)"

vet() { # file
  local f="$1" name val bad=0
  [[ -f "$f" ]] || { echo "provision: $f is missing" >&2; return 1; }
  while IFS='=' read -r name val; do
    [[ "$name" =~ ^[[:space:]]*# || -z "$name" ]] && continue
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    case "$name" in
      *SUPABASE*URL*|*SUPABASE*HOST*|*DATABASE_URL*|*POSTGRES*URL*)
        [[ -z "$val" ]] && continue
        [[ "$val" =~ ^(https?|postgres(ql)?)://([^@/]*@)?(127\.0\.0\.1|localhost|\[::1\])([:/?]|$) ]] \
          || { echo "provision: $f: $name is not a loopback address" >&2; bad=1; } ;;
    esac
  done < "$f"
  # a hosted project or a live key anywhere in the file, whatever the variable is called
  # (comment lines are skipped: .env.test's own header mentions sk_live_ in prose)
  if { grep -vE '^[[:space:]]*#' "$f" || true; } | grep -qiE 'supabase\.(co|com|net)|(sk|rk|pk)_live_'; then
    echo "provision: $f names a hosted Supabase project or a live Stripe key" >&2; bad=1
  fi
  return "$bad"
}

for f in .env.local .env.test; do vet "$SRC/$f" || { echo "provision: nothing copied" >&2; exit 1; }; done
for f in .env.local .env.test; do install -m 600 "$SRC/$f" "$WT/$f" || exit 1; done
echo "provision: .env.local and .env.test copied into $WT (mode 600, loopback only)"
