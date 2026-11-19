// Per-worktree build cache paths, lock-holder records, and stale-holder clearing for verify-rc-admin.
// Pure functions are exported for verify.test.mjs; the CLI at the bottom is what verify.sh and
// locked-run.sh call. Nothing here is ever killed by name: only pids recorded by a run, and only
// after the pid is re-checked against its record.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CACHE_ROOT = "/private/tmp/onzio-rc-admin-verify";
// The skill's own run timeout: the browser run shares one session whose access token lasts an hour (SKILL.md), so a
// run older than this is not a healthy run. Never below ONZIO_DB_LOCK_WAIT (default 1800), so a waiter that is still
// allowed to wait cannot sweep a holder that is still allowed to hold.
export const RUN_TIMEOUT_SECONDS = 3600;

export function runTimeoutSeconds(env = process.env) {
  const wait = Number(env.ONZIO_DB_LOCK_WAIT ?? 1800);
  return Math.max(RUN_TIMEOUT_SECONDS, Number.isFinite(wait) ? wait : 1800);
}

// ---- cache: one directory per package worktree, never shared between worktrees ----------------

export function worktreeKey(worktree, realpath = realpathSync) {
  let real = worktree;
  try { real = realpath(worktree); } catch { /* a path that no longer exists still hashes to a stable key */ }
  return "wt-" + createHash("sha256").update(real).digest("hex").slice(0, 12);
}

export function baseCacheDir(worktree, sha, root = CACHE_ROOT, realpath = realpathSync) {
  return join(root, worktreeKey(worktree, realpath), `base-${sha}`);
}

// Directories of this worktree's cache for SHAs other than keepSha. Only `base-*` entries inside this worktree's own key.
export function staleCacheDirs(worktree, keepSha, root = CACHE_ROOT, realpath = realpathSync) {
  const dir = join(root, worktreeKey(worktree, realpath));
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.startsWith("base-") && n !== `base-${keepSha}`).map((n) => join(dir, n));
}

// ---- disk: fail fast instead of filling the host volume (a full disk crashed the Mac on 2026-11-18) -----

export const MIN_FREE_GB = 5;

// Pure: is there room for a build? freeKb is `df -k` "Available" for the volume that holds the cache.
export function diskRoomCheck(freeKb, minGb = MIN_FREE_GB) {
  const freeGb = freeKb / 1024 / 1024;
  if (!Number.isFinite(freeGb)) return { ok: false, freeGb: NaN, message: "could not read free disk space; refusing to build" };
  const ok = freeGb >= minGb;
  return { ok, freeGb, message: ok ? `disk: ${freeGb.toFixed(1)} GB free (minimum ${minGb} GB)`
    : `disk: only ${freeGb.toFixed(1)} GB free on the volume holding the build cache; need at least ${minGb} GB. Free space (old caches, Docker, ~/Library caches) and re-run; no build was started.` };
}

export function freeKbOf(path) {
  const line = sh("df", ["-k", path]).trim().split("\n").pop() ?? "";
  return Number(line.trim().split(/\s+/)[3]);
}

export function dirSizeKb(dir) {
  if (!existsSync(dir)) return 0;
  return Number(sh("du", ["-sk", dir]).split(/\s+/)[0]) || 0;
}

// ---- holders: who may hold the lock's file descriptor ------------------------------------------

export function holdersDir(lockFile = process.env.ONZIO_DB_LOCK_FILE || "/tmp/onzio-local-db.lock") {
  return `${lockFile}.holders`;
}

// A holder record is stale when its run is dead (or its pid was reused by a different process) or it is older than the timeout.
// alive: (pid) => start-time string, or null when the pid is dead.
export function isStaleHolder(record, { now = Date.now(), timeoutSeconds = RUN_TIMEOUT_SECONDS, startOf }) {
  const started = startOf(record.runPid);
  if (started === null) return { stale: true, reason: "run pid is dead" };
  if (record.runStart && started !== record.runStart) return { stale: true, reason: "run pid was reused by another process" };
  const age = (now - Date.parse(record.startedAt)) / 1000;
  if (!(age >= 0)) return { stale: false, reason: "live" };
  if (age > timeoutSeconds) return { stale: true, reason: `older than the ${timeoutSeconds}s run timeout (${Math.round(age)}s)` };
  return { stale: false, reason: "live and within the run timeout" };
}

// May this pid be killed on the strength of this record? Only if it still looks like the recorded server:
// a next-server / next start command, and the recorded port is held by this very pid.
export function mayKillServer(server, { command, listeningPids }) {
  if (!Number.isInteger(server?.pid) || server.pid <= 1) return { ok: false, reason: "no usable pid in the record" };
  if (!Number.isInteger(server?.port)) return { ok: false, reason: "no port in the record" };
  if (typeof command !== "string" || !/next-server|next(\/dist\/bin\/next)?\s+start/.test(command)) {
    return { ok: false, reason: `pid ${server.pid} is not a next server (command: ${command ?? "gone"})` };
  }
  if (!listeningPids.includes(server.pid)) return { ok: false, reason: `pid ${server.pid} does not hold port ${server.port}` };
  return { ok: true, reason: "matches the record" };
}

// ---- system probes (the only impure part) ------------------------------------------------------

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; }
}
export const startOfPid = (pid) => {
  const out = sh("ps", ["-o", "lstart=", "-p", String(pid)]).trim();
  return out === "" ? null : out;
};
export const commandOfPid = (pid) => sh("ps", ["-o", "command=", "-p", String(pid)]).trim() || null;
export const pidsListeningOn = (port) =>
  sh("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).split("\n").filter(Boolean).map(Number);

export function readHolders(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const file = join(dir, name);
    try { out.push({ file, record: JSON.parse(readFileSync(file, "utf8")) }); } catch { out.push({ file, record: null }); }
  }
  return out;
}

// Clear stale holders. kill/probes are injectable for tests. Returns log lines.
export function sweepHolders(dir, opts = {}) {
  const {
    now = Date.now(), timeoutSeconds = runTimeoutSeconds(), startOf = startOfPid, commandOf = commandOfPid,
    listening = pidsListeningOn, kill = (pid) => process.kill(pid, "SIGTERM"), remove = (f) => rmSync(f, { force: true }),
  } = opts;
  const log = [];
  for (const { file, record } of readHolders(dir)) {
    if (!record) { log.push(`holders: ${basename(file)} unreadable, removed`); remove(file); continue; }
    const verdict = isStaleHolder(record, { now, timeoutSeconds, startOf });
    if (!verdict.stale) { log.push(`holders: run ${record.runPid} (${record.worktree}) kept: ${verdict.reason}`); continue; }
    log.push(`holders: run ${record.runPid} (${record.worktree}) is stale: ${verdict.reason}`);
    for (const server of record.servers ?? []) {
      const check = mayKillServer(server, { command: commandOf(server.pid), listeningPids: listening(server.port) });
      if (!check.ok) { log.push(`holders:   not killing ${server.pid} :${server.port}: ${check.reason}`); continue; }
      try { kill(server.pid); log.push(`holders:   killed ${server.pid} :${server.port} (${server.name ?? "server"})`); }
      catch (e) { log.push(`holders:   could not kill ${server.pid}: ${e.message}`); }
    }
    remove(file);
  }
  return log;
}

export function writeHolder(dir, record) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.runPid}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(record, null, 2));
  renameSync(`${file}.tmp`, file);
  return file;
}

// ---- opt-in cleanup of this worktree's own base-build cache -----------------------------------
// `verify.sh cleanup --worktree <wt>`: removes <cache root>/wt-<key of THIS worktree> and nothing else (each is about 1.8 GB and only
// goes away with the worktree otherwise). Never another worktree's directory, never while a live run of this worktree holds it.
export function removeOwnCache(worktree, opts = {}) {
  const {
    root = CACHE_ROOT, realpath = realpathSync, holders = readHolders(holdersDir()), exists = existsSync,
    rm = (dir) => rmSync(dir, { recursive: true, force: true }), now = Date.now(), timeoutSeconds = runTimeoutSeconds(), startOf = startOfPid,
  } = opts;
  const key = worktreeKey(worktree, realpath);
  const dir = join(root, key);
  if (!/^wt-[0-9a-f]{12}$/.test(basename(dir)) || dirname(dir) !== root) return { removed: false, dir, why: "not a per-worktree cache directory" };
  if (!exists(dir)) return { removed: false, dir, why: "this worktree has no cache" };
  const live = holders.find(({ record }) => record?.worktree && worktreeKey(record.worktree, realpath) === key && !isStaleHolder(record, { now, timeoutSeconds, startOf }).stale);
  if (live) return { removed: false, dir, why: `a run of this worktree is still going (pid ${live.record.runPid}); not removing its cache` };
  rm(dir);
  return { removed: true, dir, why: "removed" };
}

// ---- CLI ---------------------------------------------------------------------------------------
// holders.mjs cache-dir <worktree> <sha>
// holders.mjs stale-cache <worktree> <keepSha>             prints dirs to delete, one per line
// holders.mjs disk-check <dir> [minGb]                     exit 1 with a message when free space is under the minimum
// holders.mjs cache-size <worktree>
// holders.mjs own-cache <worktree>                          removes that worktree's own wt-* cache (opt-in, see removeOwnCache)
// holders.mjs sweep [lockFile]                              clears stale holders, logs what it did
// holders.mjs record <lockFile> <runPid> <worktree> [name:pid:port ...]
// holders.mjs remove <lockFile> <runPid>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "cache-dir") console.log(baseCacheDir(a[0], a[1]));
  else if (cmd === "stale-cache") console.log(staleCacheDirs(a[0], a[1]).join("\n"));
  else if (cmd === "disk-check") {
    mkdirSync(a[0], { recursive: true });
    const r = diskRoomCheck(freeKbOf(a[0]), a[1] ? Number(a[1]) : MIN_FREE_GB);
    (r.ok ? console.log : console.error)(r.message); process.exit(r.ok ? 0 : 1);
  } else if (cmd === "own-cache") {
    const r = removeOwnCache(a[0]);
    console.log(`own cache: ${r.why}: ${r.dir}`); process.exit(r.removed || r.why.startsWith("this worktree has no") ? 0 : 1);
  } else if (cmd === "cache-size") {
    const kb = dirSizeKb(join(CACHE_ROOT, worktreeKey(a[0])));
    console.log(`${(kb / 1024).toFixed(0)} MB in ${join(CACHE_ROOT, worktreeKey(a[0]))} (the head build lives in the worktree's own .next)`);
  } else if (cmd === "sweep") for (const line of sweepHolders(holdersDir(a[0]))) console.log(line);
  else if (cmd === "record") {
    const [lockFile, runPid, worktree, ...servers] = a;
    let startedAt = new Date().toISOString();
    try { startedAt = JSON.parse(readFileSync(join(holdersDir(lockFile), `${runPid}.json`), "utf8")).startedAt ?? startedAt; } catch { /* first write */ }
    writeHolder(holdersDir(lockFile), {
      runPid: Number(runPid), runStart: startOfPid(Number(runPid)), startedAt, worktree,
      servers: servers.map((s) => { const [name, pid, port] = s.split(":"); return { name, pid: Number(pid), port: Number(port) }; }),
    });
  } else if (cmd === "remove") rmSync(join(holdersDir(a[0]), `${a[1]}.json`), { force: true });
  else { console.error("holders.mjs: unknown command"); process.exit(64); }
}
