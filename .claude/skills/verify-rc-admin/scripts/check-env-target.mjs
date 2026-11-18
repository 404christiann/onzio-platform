#!/usr/bin/env node
// Refuses to let a run touch anything but the shared local stack (API 54321, DB 54322 on loopback).
// Reads the env files the app, seeds and tests load and checks every Supabase/database URL in them
// (by name, plus any postgres:// value under any name) and the libpq PGHOST/PGHOSTADDR/PGPORT.
// Refuses the production project (ioalthwsdrlzrubomrow), any hosted Supabase, and the
// onzio-rose-city-2027 rehearsal stack (55321/55322). Prints variable names only, never values.
//
//   node check-env-target.mjs <worktree>/.env.local [<worktree>/.env.test ...]
// Exit 0 = every file points at the shared local stack; 1 = refused.
import { existsSync, readFileSync } from "node:fs";

const PRODUCTION_REF = "ioalthwsdrlzrubomrow";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const REHEARSAL_PORTS = new Set(["55321", "55322", "55323", "55324"]);
const EXPECTED = { http: "54321", postgres: "54322" };
// Variables that must exist, per file name.
const REQUIRED = { ".env.local": ["NEXT_PUBLIC_SUPABASE_URL"], ".env.test": ["SUPABASE_TEST_URL"] };
const URL_VARIABLE = /SUPABASE.*(URL|HOST)|DATABASE_URL|DB_URL|POSTGRES.*URL/;

export function checkEnvText(text, fileName = ".env.local") {
  const problems = [];
  const values = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const name = line.slice(0, line.indexOf("=")).replace(/^export\s+/, "").trim();
    const value = line.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    values.set(name, value);
    if (value.includes(PRODUCTION_REF)) problems.push(`${name} names the production project ${PRODUCTION_REF}`);
    else if (/supabase\.(co|com|net|in)\b/i.test(value)) problems.push(`${name} names a hosted Supabase project`);
  }
  for (const name of REQUIRED[fileName] ?? []) if (!values.get(name)) problems.push(`${name} is missing`);
  // libpq variables: psql, pg and the Supabase CLI honour these whatever the URL says.
  for (const name of ["PGHOST", "PGHOSTADDR"]) {
    const value = values.get(name);
    if (value && !LOOPBACK.has(value) && !LOOPBACK.has(`[${value}]`) && value !== "::1") problems.push(`${name} is not loopback`);
  }
  const pgPort = values.get("PGPORT");
  if (pgPort && REHEARSAL_PORTS.has(pgPort)) problems.push(`PGPORT points at the onzio-rose-city-2027 rehearsal stack (port ${pgPort})`);
  else if (pgPort && pgPort !== EXPECTED.postgres) problems.push(`PGPORT is ${pgPort}, expected ${EXPECTED.postgres}`);
  for (const [name, value] of values) {
    // A database URL under any name is checked too, not only the names URL_VARIABLE knows.
    const databaseUrl = /^postgres(ql)?:\/\//i.test(value);
    if ((!URL_VARIABLE.test(name) && !databaseUrl) || !value || value.includes(PRODUCTION_REF)) continue;
    let url;
    try { url = new URL(value); } catch { problems.push(`${name} is not a URL`); continue; }
    const scheme = url.protocol === "http:" ? "http" : /^postgres(ql)?:$/.test(url.protocol) ? "postgres" : null;
    if (!scheme) { problems.push(`${name} uses ${url.protocol} (expected http or postgres)`); continue; }
    if (!LOOPBACK.has(url.hostname)) { problems.push(`${name} is not loopback`); continue; }
    if (REHEARSAL_PORTS.has(url.port)) { problems.push(`${name} points at the onzio-rose-city-2027 rehearsal stack (port ${url.port})`); continue; }
    if (url.port !== EXPECTED[scheme]) problems.push(`${name} uses port ${url.port || "(default)"}, expected ${EXPECTED[scheme]}`);
    for (const key of url.searchParams.keys()) if (["host", "hostaddr", "service", "servicefile"].includes(key)) problems.push(`${name} redirects the connection (${key}=)`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error("usage: check-env-target.mjs <env file> [...]"); process.exit(64); }
  let refused = false;
  for (const file of files) {
    const name = file.split("/").pop();
    const problems = existsSync(file) ? checkEnvText(readFileSync(file, "utf8"), name) : ["file is missing"];
    for (const problem of problems) console.log(`env-target: FAIL ${name}: ${problem}`);
    if (problems.length) refused = true;
  }
  if (!refused) console.log(`env-target: OK (${files.map((f) => f.split("/").pop()).join(", ")} point at 127.0.0.1:54321/54322)`);
  process.exitCode = refused ? 1 : 0;
}
