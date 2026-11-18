#!/usr/bin/env node
// Gate 1 (scope) and gate 5 (selector debt file) for a Rose City admin package.
// Reads every change in <worktree> against <base>: commits since the merge base,
// staged, unstaged and untracked files. Read-only; prints JSON to stdout.
//
//   node scope-check.mjs --worktree <path> [--base origin/main]
//
// Exit 0 = pass (warnings allowed), 1 = a forbidden path or RPC reference changed.
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), list[index + 1] ?? ""]);
  return pairs;
}, []));
const worktree = args.worktree || process.cwd();
const base = args.base || "origin/main";
const git = (...argv) => execFileSync("git", ["-C", worktree, ...argv], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const mergeBase = git("merge-base", base, "HEAD").trim();
const changed = new Set();
for (const line of git("diff", "--name-only", mergeBase).split("\n")) if (line) changed.add(line); // commits + staged + unstaged
for (const line of git("ls-files", "--others", "--exclude-standard").split("\n")) if (line) changed.add(line);
// The skill itself lives under .claude/ and never ships with a package.
const files = [...changed].filter((file) => !file.startsWith(".claude/")).sort();

const FORBIDDEN = [
  [/^supabase\//, "supabase/ (migrations, seed.sql, config, templates)"],
  [/^db\//, "db/ (legacy migrations)"],
  [/\.sql$/i, "SQL file"],
  [/^lib\/database\.generated\.ts$/, "generated database types"],
  [/^lib\/db-types\.ts$/, "database types"],
  [/^scripts\/(.*seed.*|import-.*|apply-.*-local\.ts|fixtures\/.*)$/, "seed or import script"],
  [/^tests\/architecture\/cinematic-2-selector-debt\.json$/, "cinematic@2 selector debt baseline (gate 5)"],
];
const APP = /^(app|components|lib|styles|public|packages|types|tests)\/|^middleware\.ts$/;

const failures = [];
const warnings = [];
const app = [];
for (const file of files) {
  const rule = FORBIDDEN.find(([pattern]) => pattern.test(file));
  if (rule) failures.push({ file, reason: rule[1] });
  else if (APP.test(file)) app.push(file);
  else warnings.push({ file, reason: "outside app code (review: docs and status ledgers are expected, deps and config are not)" });
}

// RPC: any added or removed `.rpc(` call, or a changed set of database function names
// referenced from app code (a config object can name the RPC a route calls).
const functionNames = new Set();
let definitions = "";
try {
  definitions = git("grep", "-hioE", "function[[:space:]]+(onzio|onzio_private)\\.[a-z0-9_]+", base, "--", "supabase/migrations");
} catch (error) {
  if (error.status !== 1) throw error; // git grep exits 1 when nothing matches
}
for (const match of definitions.matchAll(/\.([a-z0-9_]+)/gi)) functionNames.add(match[1].toLowerCase());
const diff = git("diff", "--unified=0", mergeBase, "--", ...app.filter((file) => !file.startsWith("tests/")).concat(["__none__"]).filter(Boolean));
const rpcCalls = [];
const tokens = { added: new Map(), removed: new Map() };
let current = "";
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) { current = line.slice(6); continue; }
  if (!/^[+-]/.test(line) || line.startsWith("+++") || line.startsWith("---")) continue;
  const side = line[0] === "+" ? "added" : "removed";
  if (/\.rpc\s*\(/.test(line)) rpcCalls.push({ file: current, side, line: line.slice(1).trim().slice(0, 160) });
  for (const match of line.matchAll(/["'`]([a-z][a-z0-9_]{3,})["'`]/g)) {
    const name = match[1].toLowerCase();
    if (functionNames.has(name)) tokens[side].set(name, (tokens[side].get(name) ?? 0) + 1);
  }
}
const rpcReferenceChanges = [...new Set([...tokens.added.keys(), ...tokens.removed.keys()])]
  .filter((name) => (tokens.added.get(name) ?? 0) !== (tokens.removed.get(name) ?? 0))
  .map((name) => ({ name, added: tokens.added.get(name) ?? 0, removed: tokens.removed.get(name) ?? 0 }));
for (const call of rpcCalls) failures.push({ file: call.file, reason: `.rpc( call ${call.side}: ${call.line}` });
for (const change of rpcReferenceChanges) failures.push({ file: "(app code)", reason: `database function "${change.name}" referenced ${change.removed}→${change.added} times` });

// Gate 5 also requires the selector debt file to be byte-identical to base.
const debtPath = "tests/architecture/cinematic-2-selector-debt.json";
let debtIdentical = false;
try {
  const head = execFileSync("cat", [`${worktree}/${debtPath}`], { encoding: "utf8" });
  debtIdentical = head === git("show", `${base}:${debtPath}`);
} catch { debtIdentical = false; }

const result = {
  base, baseSha: git("rev-parse", base).trim(), head: git("rev-parse", "HEAD").trim(), mergeBase,
  changedFiles: files.length, appFiles: app, warnings, failures,
  selectorDebtIdentical: debtIdentical,
  pass: failures.length === 0 && debtIdentical,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
