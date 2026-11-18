#!/usr/bin/env bash
# Seed Rose City (cinematic@2) and Diverse City onto the SHARED local Supabase (54321/54322),
# from a pristine copy of the base commit (never from a package worktree, never from the main
# checkout). Must already be inside scripts/with-local-db-lock.sh; verify.sh calls it there.
#
#   seed-local.sh <base-source-dir>
#
# The repo's Rose City seeds refuse anything but the old rehearsal stack (55321/55322, the
# supabase_*_onzio-rose-city-2027 containers, which this skill never touches). Following the
# 2026-11-17 audit recipe, they are copied to <base-source-dir>/scripts/_rcv/, re-pointed at
# 54321/54322, and run from that copy, so receipt files they rewrite land in the throwaway copy.
# Skipped: shop-update (its precondition, a Shop without editions/details, no longer holds on
# main: the shop seed already writes them), partners (it reuses a Woodmen logo that only the
# rehearsal stack has), injury-report (it needs roster player #4; both editors open on their
# starter content), form-links (the tickets seed already sets other destinations), roster and
# schedule: roster needs a production-derived JSON and schedule
# writes into the Rose City revamp folder. No editor in RC-ADMIN-01..06 needs either.
set -euo pipefail
SRC="$(cd "$1" && pwd)"
REVAMP="/Users/christianalcala/Documents/ChatGPT/Rose City 2027 Revamp"
cd "$SRC"
[[ -f .env.local && -d node_modules ]] || { echo "seed: $SRC lacks .env.local or node_modules" >&2; exit 1; }

set -a; . ./.env.local; set +a
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
[[ "$(supabase --version 2>/dev/null | tail -1)" == "2.109.1" ]] || { echo "seed: supabase CLI must be 2.109.1" >&2; exit 1; }
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY|ANON_KEY)=')"
[[ "$API_URL" == "http://127.0.0.1:54321" ]] || { echo "seed: supabase status is not the shared 54321 stack" >&2; exit 1; }
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"

rm -rf scripts/_rcv && mkdir -p scripts/_rcv output
SEEDS=(
  seed-rose-city-2027-local.ts
  seed-rose-city-crest-2027-local.ts
  add-rose-city-crest-submark-local.ts
  seed-rose-city-about-2027-local.ts
  seed-rose-city-contact-2027-local.ts
  seed-rose-city-home-update-2027-local.ts
  seed-rose-city-tickets-2027-local.ts
  seed-rose-city-shop-2027-local.ts
  seed-rose-city-visitor-pages-local.ts
  seed-rose-city-robinson-2027-local.ts
  seed-rose-city-ticket-pages-2027-local.ts
  seed-rose-city-policies-2027-local.ts
  seed-rose-city-national-anthem-2027-local.ts
  seed-rose-city-news-2027-local.ts
  seed-rose-city-news-2027-placeholders-local.ts
)
for seed in "${SEEDS[@]}"; do
  sed -e 's/55321/54321/g; s/55322/54322/g' \
      -e "s#\"\\.\\./lib/#\"@/lib/#g; s#'\\.\\./lib/#'@/lib/#g" \
      -e "s#\\.\\./\\.\\./review-notes/shop-2027/#$REVAMP/review-notes/shop-2027/#g" \
      "scripts/$seed" > "scripts/_rcv/$seed"
done

echo "seed: Diverse City (repo import script, local only)"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" SUPABASE_DB_URL="$SUPABASE_DB_URL" \
  npx tsx scripts/import-diverse-city-local.ts --execute-local --confirm-local > output/rcv-diverse-city.log 2>&1 \
  || { tail -20 output/rcv-diverse-city.log >&2; exit 1; }

for seed in "${SEEDS[@]}"; do
  echo "seed: $seed"
  node --import tsx "scripts/_rcv/$seed" --execute-local > "output/rcv-$seed.log" 2>&1 \
    || { echo "seed: $seed failed" >&2; tail -20 "output/rcv-$seed.log" >&2; exit 1; }
done

# Classic admin for both clubs (the column defaults to classic; set it so a reset to a branch
# with another default cannot change what is verified).
docker exec supabase_db_onzio-platform-contracts psql -U postgres -v ON_ERROR_STOP=1 -Atc \
  "update onzio.clubs set admin_portal='classic' where slug in ('rose-city','diverse-city') returning slug, admin_portal;"
