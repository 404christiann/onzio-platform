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
        "lib/telemetry/ingest.ts",
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

  it("keeps the migration narrow: three security-definer functions, no write grants, no grants by default", async () => {
    const sql = await readFile(resolve(ROOT, "supabase/migrations/20261119130000_page_telemetry.sql"), "utf8");
    const telemetry = sql.slice(0, sql.indexOf("create or replace function onzio_private.purge_archived_club"));
    // Declarations only (comment lines mention the term too): the event writer, the add-on reader, and the
    // trigger that forgets a club's salts when its add-on is removed.
    expect(telemetry.match(/^security definer$/gm)).toHaveLength(3);
    expect(telemetry).toMatch(/create function onzio_private\.record_page_event[\s\S]*?security definer\s+set search_path = ''/);
    expect(telemetry).toMatch(/create function onzio_private\.club_has_addon[\s\S]*?security definer\s+set search_path = ''/);
    expect(telemetry).toMatch(
      /create function onzio_private\.forget_telemetry_when_addon_removed\(\)[\s\S]*?security definer\s+set search_path = ''/,
    );
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

  it("accepts only signed calls: the old unsigned signatures are gone and the signature is checked before anything is read or written", async () => {
    const sql = await readFile(resolve(ROOT, "supabase/migrations/20261119130000_page_telemetry.sql"), "utf8");
    const telemetry = sql.slice(0, sql.indexOf("create or replace function onzio_private.purge_archived_club"));
    // No jsonb-taking record_page_event remains, in any statement.
    expect(telemetry).not.toMatch(/record_page_event\s*\(\s*(p_club_id\s+)?uuid\s*,\s*(p_event\s+)?jsonb/);
    expect(telemetry.match(/record_page_event\(uuid, text, text\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(telemetry).toMatch(/create function onzio\.record_page_event\(\s*p_club_id uuid,\s*p_payload text,\s*p_signature text\s*\) returns text/);

    const writer = telemetry.slice(telemetry.indexOf("create function onzio_private.record_page_event"));
    const keyRead = writer.indexOf("from onzio_private.telemetry_ingest_keys");
    const hmac = writer.indexOf("extensions.hmac(");
    const parse = writer.indexOf("p_payload::jsonb");
    const stale = writer.indexOf("return 'stale';");
    const gate = writer.indexOf("if not onzio_private.club_has_addon(p_club_id, 'telemetry') then");
    expect(writer).toContain("return 'bad_signature';");
    expect(keyRead).toBeGreaterThan(0);
    expect(hmac).toBeGreaterThan(keyRead);
    expect(writer.indexOf("return 'bad_signature';")).toBeGreaterThan(hmac);
    expect(writer.indexOf("return 'bad_signature';")).toBeLessThan(parse);
    expect(parse).toBeLessThan(stale);
    expect(stale).toBeLessThan(gate);
    // The signature covers the club id and the exact payload text.
    expect(writer).toMatch(/extensions\.hmac\(convert_to\(p_club_id::text \|\| E'\\n' \|\| p_payload, 'UTF8'\), v_key, 'sha256'\)/);
  });

  it("keeps the signing key in a private single-row table that no API role can read, generated by the migration", async () => {
    const sql = await readFile(resolve(ROOT, "supabase/migrations/20261119130000_page_telemetry.sql"), "utf8");
    expect(sql).toMatch(/create table onzio_private\.telemetry_ingest_keys \(/);
    expect(sql).toContain("alter table onzio_private.telemetry_ingest_keys enable row level security;");
    expect(sql).toContain(
      "revoke all on table onzio_private.telemetry_ingest_keys from public, anon, authenticated, service_role;",
    );
    expect(sql).not.toMatch(/grant[^;]*telemetry_ingest_keys/i);
    expect(sql).not.toMatch(/create policy[^;]*telemetry_ingest_keys/i);
    // The key is random at migration time; no literal key exists in the repository.
    expect([...sql.matchAll(/insert\s+into\s+onzio_private\.telemetry_ingest_keys[^;]*;/gi)].map((match) => match[0].replace(/\s+/g, " "))).toEqual([
      "insert into onzio_private.telemetry_ingest_keys (key) values (extensions.gen_random_bytes(32));",
    ]);
  });

  it("forgets a club's salts when its telemetry add-on is deleted, and sweeps retention globally", async () => {
    const sql = await readFile(resolve(ROOT, "supabase/migrations/20261119130000_page_telemetry.sql"), "utf8");
    expect(sql).toMatch(
      /create trigger club_addons_forget_telemetry\s+after delete on onzio_private\.club_addons\s+for each row execute function onzio_private\.forget_telemetry_when_addon_removed\(\);/,
    );
    expect(sql).toContain("create index page_events_occurred_idx");
    // The sweep runs only when the club-wide window for the minute is first opened by an accepted event.
    const writer = sql.slice(sql.indexOf("create function onzio_private.record_page_event"), sql.indexOf("-- Archived-club hard purge:"));
    const opened = writer.indexOf("if v_hits = 1 then");
    expect(opened).toBeGreaterThan(writer.indexOf("values (p_club_id, '*', v_window, 1)"));
    expect(writer.indexOf("c_sweep_batch\n      for update skip locked")).toBeGreaterThan(opened);
    expect(writer.indexOf("where s.salt_day < (v_now at time zone 'UTC')::date - 2")).toBeGreaterThan(opened);
    // Network cap, then visitor cap, then the club cap: a rejected event never spends club budget.
    const network = writer.indexOf("values (p_club_id, v_network_bucket, v_window, 1)");
    const visitor = writer.indexOf("values (p_club_id, v_hash, v_window, 1)");
    const club = writer.indexOf("values (p_club_id, '*', v_window, 1)");
    expect(network).toBeGreaterThan(0);
    expect(visitor).toBeGreaterThan(network);
    expect(club).toBeGreaterThan(visitor);
    // Network keys live only in rate windows, salted and prefixed.
    expect(writer).toContain("'n:' || encode(sha256(v_salt || convert_to(v_network, 'UTF8')), 'hex')");
  });
});
