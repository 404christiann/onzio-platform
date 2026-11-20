import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// TELEMETRY-01: the public beacon must never reach the service-role client or
// key, directly or through any module it imports.

const ROOT = resolve(process.cwd());
const ENTRY_POINTS = ["app/api/t/route.ts", "components/telemetry/PageBeacon.tsx"];
const FORBIDDEN = /supabase-service-role|SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient|service_role/;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null; // a package; packages are checked by the architecture scan's scope
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  throw new Error(`Unresolved local import ${specifier} from ${relative(ROOT, fromFile)}`);
}

async function importGraph(entry: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const queue = [resolve(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = await readFile(file, "utf8");
    seen.set(file, source);
    const specifiers = [
      ...source.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g),
      ...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      const next = resolveLocal(specifier, file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe("page telemetry beacon service-role boundary", () => {
  it.each(ENTRY_POINTS)("%s never imports the service-role client or key, even transitively", async (entry) => {
    const graph = await importGraph(entry);
    const violations = [...graph]
      .filter(([, source]) => FORBIDDEN.test(source))
      .map(([file]) => relative(ROOT, file).replaceAll("\\", "/"));
    expect(violations).toEqual([]);
  });

  it("walks the real beacon graph through the public Supabase client", async () => {
    const files = [...(await importGraph("app/api/t/route.ts")).keys()].map((file) =>
      relative(ROOT, file).replaceAll("\\", "/"),
    );
    expect(files).toEqual(
      expect.arrayContaining([
        "app/api/t/route.ts",
        "lib/supabase-server.ts",
        "lib/telemetry/beacon.ts",
        "lib/telemetry/classify.ts",
        "lib/telemetry/visitor.ts",
        "lib/telemetry/rate-limit.ts",
        "lib/telemetry/entitlement.ts",
      ]),
    );
  });

  it("calls only the exposed narrow wrapper from the beacon", async () => {
    const source = await readFile(resolve(ROOT, "app/api/t/route.ts"), "utf8");
    expect(source).toContain("createPublicClient()");
    expect(source).not.toMatch(/createClient\(/);
    expect([...source.matchAll(/\.rpc\(\s*"([^"]+)"/g)].map((match) => match[1])).toEqual(["record_page_event"]);
    expect(source).not.toMatch(/\.from\(/);
  });

  it("reaches the database only through the two exposed telemetry wrappers", async () => {
    const graph = await importGraph("app/api/t/route.ts");
    const rpcs = new Set<string>();
    for (const source of graph.values()) {
      for (const match of source.matchAll(/\.rpc\(\s*"([^"]+)"/g)) rpcs.add(match[1]);
      expect(source).not.toMatch(/\.from\(\s*"/);
    }
    expect([...rpcs].sort()).toEqual(["club_has_addon", "record_page_event"]);
  });

  it("keeps the migration narrow: two security-definer functions, no write grants, no grants by default", async () => {
    const sql = await readFile(resolve(ROOT, "supabase/migrations/20261119130000_page_telemetry.sql"), "utf8");
    const telemetry = sql.slice(0, sql.indexOf("create or replace function onzio_private.purge_archived_club"));
    // Declarations only (comment lines mention the term too): the event writer and the add-on reader.
    expect(telemetry.match(/^security definer$/gm)).toHaveLength(2);
    expect(telemetry).toMatch(/create function onzio_private\.record_page_event[\s\S]*?security definer\s+set search_path = ''/);
    expect(telemetry).toMatch(/create function onzio_private\.club_has_addon[\s\S]*?security definer\s+set search_path = ''/);
    expect(telemetry).toMatch(/create function onzio\.record_page_event[\s\S]*?security invoker/);
    expect(telemetry).toMatch(/create function onzio\.club_has_addon[\s\S]*?security invoker/);
    // The add-on is enforced inside the writer, before any salt, rate window or event is written.
    const writer = telemetry.slice(telemetry.indexOf("create function onzio_private.record_page_event"));
    const gate = writer.indexOf("if not onzio_private.club_has_addon(p_club_id, 'telemetry') then");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(writer.indexOf("page_visitor_salts"));
    expect(gate).toBeLessThan(writer.indexOf("page_event_rate_windows"));
    // Default OFF: the migration never grants an add-on.
    expect(sql).not.toMatch(/insert\s+into\s+onzio_private\.club_addons/i);
    expect(telemetry).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*club_addons/i);
    expect(telemetry).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*page_events/i);
    expect(telemetry).not.toMatch(/\b(ip_address|user_agent|raw_ip)\b/);
  });
});
