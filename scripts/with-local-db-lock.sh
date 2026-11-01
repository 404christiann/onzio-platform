#!/usr/bin/env bash
# Run one command while holding the machine-wide lock for the shared local Supabase and
# browser ports. Agents must wrap every database, whole-suite or browser run with this.
# Usage: scripts/with-local-db-lock.sh <command> [args...]
#
# Uses a kernel flock on a lock file, not a pid file: there is no acquire/pid gap to race
# through, no stale lock to guess about, and the lock is released by the OS if the holder
# dies, even from kill -9. The lock fd is inherited by the command and its children.
# Exits 75 if the lock stays busy past ONZIO_DB_LOCK_WAIT seconds.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

LOCK_FILE="${ONZIO_DB_LOCK_FILE:-/tmp/onzio-local-db.lock}"
WAIT_LIMIT_SECONDS="${ONZIO_DB_LOCK_WAIT:-1800}"
POLL_SECONDS="${ONZIO_DB_LOCK_POLL:-10}"

exec perl -e '
use strict; use warnings;
use Fcntl qw(:flock F_SETFD);
my ($file, $limit, $poll, @cmd) = @ARGV;
open(my $fh, ">>", $file) or die "cannot open lock file $file: $!\n";
my $waited = 0;
until (flock($fh, LOCK_EX | LOCK_NB)) {
  if ($waited >= $limit) {
    print STDERR "local database lock busy for over ${limit}s; giving up\n";
    exit 75;
  }
  sleep $poll;
  $waited += $poll;
}
fcntl($fh, F_SETFD, 0) or die "cannot keep lock across exec: $!\n";
exec { $cmd[0] } @cmd or die "cannot exec $cmd[0]: $!\n";
' "$LOCK_FILE" "$WAIT_LIMIT_SECONDS" "$POLL_SECONDS" "$@"
