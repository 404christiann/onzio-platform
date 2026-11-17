import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { parse } from "dotenv";

type Environment = Record<string, string | undefined>;
type ReconstructionEnvironment = Environment & { NODE_ENV: "production" };
const localSupabaseError = "Only local synthetic Supabase is supported";

function assertNoLiveCredentials(environment: Environment) {
  if (Object.values(environment).some(value => value !== undefined && /^(sk|rk)_live_/.test(value.trim()))) {
    throw new Error("Live provider credentials are forbidden");
  }
}

function assertLocalEnvironment(environment: Environment) {
  assertNoLiveCredentials(environment);
  if (!environment.NEXT_PUBLIC_SUPABASE_URL) throw new Error(localSupabaseError);
  for (const [name, value] of Object.entries(environment)) {
    if (name !== "DATABASE_URL" && !(name.includes("SUPABASE") && name.endsWith("_URL"))) continue;
    if (value === undefined) continue;
    let target: URL;
    try { target = new URL(value); } catch { throw new Error(localSupabaseError); }
    const database = name === "DATABASE_URL" || /(?:DB|DATABASE)_URL$/.test(name);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
    const localTarget = database
      ? ["postgres:", "postgresql:"].includes(target.protocol) && target.port === "54322"
      : target.protocol === "http:" && target.port === "54321" && !target.username && !target.password && target.pathname === "/";
    if (!loopback || !localTarget || target.search || target.hash) throw new Error(localSupabaseError);
  }
}

export function loadPilotReconstructionEnvironment(root: string): ReconstructionEnvironment {
  let local: Environment;
  try { local = parse(readFileSync(join(root, ".env.local"))); }
  catch { throw new Error("Could not read local reconstruction environment"); }
  assertNoLiveCredentials(local);
  Object.assign(process.env, { NODE_ENV: "production" });
  let failed = false;
  let loaded: ReturnType<typeof loadEnvConfig>;
  try {
    loaded = loadEnvConfig(root, false, {
      info() {},
      error() { failed = true; },
    }, true);
  } catch { throw new Error("Could not load reconstruction environment"); }
  const { combinedEnv } = loaded;
  if (failed) throw new Error("Could not load reconstruction environment");
  assertLocalEnvironment(combinedEnv);
  return { ...combinedEnv, NODE_ENV: "production" };
}
