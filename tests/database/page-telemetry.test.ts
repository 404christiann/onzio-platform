import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { createLocalClients } from "../helpers/supabase";
import { ROSE_CITY_CLUB_ID } from "../../scripts/rose-city-2027-operator-sql";
import { signPayload } from "../../lib/telemetry/ingest";

// TELEMETRY-01 P1: onzio.record_page_event and onzio.page_events. Each test
// runs in a transaction that is rolled back; now() is fixed inside it, so
// every call lands in the same rate-limit minute and the same club day.
// Telemetry is a paid add-on: each test grants it to Alpha and Charlie inside
// its own transaction, after recording that every seeded club starts without it.
// Every write is signed: the tests read the HMAC key from
// onzio_private.telemetry_ingest_keys over this privileged connection and sign
// with lib/telemetry/ingest (node:crypto), exactly as the beacon route does.

let db: Client;
let defaultsBeforeGrant: Record<string, boolean>;
let ingestKeyCache: string | undefined;

type Event = Record<string, unknown>;

function material(seed: string): string {
  return createHash("sha256").update(`material:${seed}`).digest("hex");
}

function event(overrides: Event = {}): Event {
  return {
    type: "view",
    visitorMaterial: material("visitor-a"),
    networkMaterial: material("network-a"),
    path: "/schedule",
    referrerHost: "instagram.com",
    sourceType: "social",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    device: "mobile",
    country: "US",
    city: "Portland",
    isStaff: false,
    ...overrides,
  };
}

async function asAnon(): Promise<void> {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', '', true)");
  await db.query("set local role anon");
}

async function asUser(userId: string): Promise<void> {
  await db.query("reset role");
  const timestamp = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] }),
  ]);
  await db.query("set local role authenticated");
}

async function asOwner(): Promise<void> {
  await db.query("reset role");
}

async function ingestKeyHex(): Promise<string> {
  if (!ingestKeyCache) {
    await asOwner();
    ingestKeyCache = (await db.query("select encode(key, 'hex') as hex from onzio_private.telemetry_ingest_keys")).rows[0].hex as string;
  }
  return ingestKeyCache;
}

/** The exact text the route would sign. ts is stamped at call time unless the payload sets it (even to undefined). */
function payloadText(payload: unknown): string {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload) && !("ts" in payload)) {
    return JSON.stringify({ ...payload, ts: Date.now() });
  }
  return JSON.stringify(payload);
}

/** One call through the exposed wrapper as the anon role, with whatever signature the caller supplies. */
async function callRecord(clubId: string | null, text: string, signature: string | null): Promise<string> {
  await asAnon();
  const { rows } = await db.query("select onzio.record_page_event($1::uuid, $2::text, $3::text) as status", [clubId, text, signature]);
  await asOwner();
  return rows[0].status;
}

async function record(clubId: string, payload: unknown): Promise<string> {
  const text = payloadText(payload);
  return callRecord(clubId, text, signPayload(clubId, text, await ingestKeyHex()));
}

/** Many signed calls under one role switch; returns each call's status in order. */
async function recordMany(clubId: string, payloads: Event[]): Promise<string[]> {
  const key = await ingestKeyHex();
  const texts = payloads.map(payloadText);
  await asAnon();
  const statuses: string[] = [];
  try {
    for (const text of texts) {
      const { rows } = await db.query("select onzio.record_page_event($1::uuid, $2::text, $3::text) as status", [
        clubId,
        text,
        signPayload(clubId, text, key),
      ]);
      statuses.push(rows[0].status);
    }
  } finally {
    await asOwner();
  }
  return statuses;
}

async function windows(clubId: string) {
  await asOwner();
  return (
    await db.query("select bucket, hits from onzio_private.page_event_rate_windows where club_id = $1 order by bucket", [clubId])
  ).rows as Array<{ bucket: string; hits: number }>;
}

/** Simulates the next minute for a club: its counters are gone, so its next accepted event opens a new club window. */
async function nextMinute(clubId: string): Promise<void> {
  await asOwner();
  await db.query("delete from onzio_private.page_event_rate_windows where club_id = $1", [clubId]);
}

async function rows(clubId: string) {
  await asOwner();
  return (
    await db.query(
      `select id::text, local_date::text, event_type, visitor_hash, visit_id, is_entry, path, referrer_host,
              source_type, utm_source, utm_campaign, device, country, city, is_staff
       from onzio.page_events where club_id = $1 order by page_events.id`,
      [clubId],
    )
  ).rows;
}

async function rejects(action: () => Promise<unknown>, expected: { code?: string; message?: string }): Promise<void> {
  await db.query("savepoint expected_failure");
  try {
    await expect(action()).rejects.toMatchObject(expected);
  } finally {
    await db.query("rollback to savepoint expected_failure");
    await asOwner();
  }
}

async function entitle(clubId: string): Promise<void> {
  await asOwner();
  await db.query("insert into onzio_private.club_addons (club_id, addon) values ($1, 'telemetry') on conflict do nothing", [clubId]);
}

async function revoke(clubId: string): Promise<void> {
  await asOwner();
  await db.query("delete from onzio_private.club_addons where club_id = $1", [clubId]);
}

async function hasTelemetry(clubId: string): Promise<boolean> {
  await asAnon();
  const { rows: result } = await db.query("select onzio.club_has_addon($1, 'telemetry') as on", [clubId]);
  await asOwner();
  return result[0].on;
}

async function traces(clubId: string) {
  await asOwner();
  const { rows: result } = await db.query(
    `select (select count(*)::int from onzio.page_events where club_id = $1) as events,
            (select count(*)::int from onzio_private.page_visitor_salts where club_id = $1) as salts,
            (select count(*)::int from onzio_private.page_event_rate_windows where club_id = $1) as windows`,
    [clubId],
  );
  return result[0];
}

const OPERATOR_SQL_DIR = resolve(__dirname, "../../scripts/operator-sql");

/** Runs an operator SQL file exactly as written, inside this test's transaction (its begin/commit/rollback become a savepoint). */
async function runOperatorSql(kind: "rehearsal" | "commit") {
  await asOwner();
  const sql = readFileSync(resolve(OPERATOR_SQL_DIR, `rose-city-telemetry-enable.${kind}.sql`), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/^begin;$/m, "savepoint operator_sql;")
    .replace(/^commit;$/m, "release savepoint operator_sql;")
    .replace(/^rollback;$/m, "rollback to savepoint operator_sql;");
  const results = (await db.query(sql)) as unknown as Array<{ rows: Array<Record<string, unknown>> }>;
  const readBack = results.find((result) => result.rows?.[0] && "all_ok" in result.rows[0]);
  if (!readBack) throw new Error("operator SQL returned no read-back row");
  return readBack.rows[0];
}

async function roseCityClub(): Promise<void> {
  await asOwner();
  await db.query(
    `insert into onzio.clubs (id, slug, name, lifecycle, public_access, tier, kind)
     values ($1, 'rose-city', 'Rose City FC', 'active', 'live', 'pro', 'demo') on conflict (id) do nothing`,
    [ROSE_CITY_CLUB_ID],
  );
}

async function auditRows(clubId: string) {
  await asOwner();
  return (
    await db.query(
      `select actor_type, operation, resource_type, resource_id, payload from onzio.audit_events
       where club_id = $1 and operation = 'manual.club_addon_grant' order by id`,
      [clubId],
    )
  ).rows;
}

async function rawEvent(clubId: string, occurredAgo: string): Promise<string> {
  await asOwner();
  const { rows: inserted } = await db.query(
    `insert into onzio.page_events (club_id, occurred_at, local_date, event_type, visitor_hash, visit_id, is_entry, path, source_type, device)
     values ($1, now() - $2::interval, (now() - $2::interval)::date, 'view', repeat('c', 64), gen_random_uuid(), true, '/', 'direct', 'desktop')
     returning id::text`,
    [clubId, occurredAgo],
  );
  return inserted[0].id;
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await db.query("begin");
  ingestKeyCache = undefined;
  defaultsBeforeGrant = {};
  for (const [name, id] of Object.entries(CLUB_IDS)) defaultsBeforeGrant[name] = await hasTelemetry(id);
  await entitle(CLUB_IDS.alpha);
  await entitle(CLUB_IDS.charlie);
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("onzio.record_page_event", () => {
  it("records an anonymous view with a salted visitor hash on the club's own day", async () => {
    expect(await record(CLUB_IDS.alpha, event({ utmSource: "ig", utmCampaign: "matchday-12", sourceType: "campaign" }))).toBe("recorded");

    const [row] = await rows(CLUB_IDS.alpha);
    const today = (
      await db.query("select (now() at time zone time_zone)::date::text as day from onzio.clubs where id = $1", [CLUB_IDS.alpha])
    ).rows[0].day;
    expect(row).toMatchObject({
      local_date: today,
      event_type: "view",
      is_entry: true,
      path: "/schedule",
      referrer_host: "instagram.com",
      source_type: "campaign",
      utm_source: "ig",
      utm_campaign: "matchday-12",
      device: "mobile",
      country: "US",
      city: "Portland",
      is_staff: false,
    });
    expect(row.visitor_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.visitor_hash).not.toBe(material("visitor-a"));
    expect(row.visitor_hash).not.toBe(createHash("sha256").update(material("visitor-a")).digest("hex"));
  });

  it("stores no IP address, user agent, user id or full referrer column", async () => {
    const { rows: columns } = await db.query(
      "select column_name from information_schema.columns where table_schema = 'onzio' and table_name = 'page_events' order by ordinal_position",
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      "id", "club_id", "occurred_at", "local_date", "event_type", "visitor_hash", "visit_id", "is_entry",
      "path", "referrer_host", "source_type", "utm_source", "utm_medium", "utm_campaign", "utm_content",
      "utm_term", "device", "country", "city", "is_staff",
    ]);
  });

  it("continues a visit within 30 minutes and starts a new one after a longer gap", async () => {
    await record(CLUB_IDS.alpha, event({ path: "/" }));
    await record(CLUB_IDS.alpha, event({ path: "/roster", sourceType: "internal", referrerHost: null }));
    const [first, second] = await rows(CLUB_IDS.alpha);
    expect(second.visit_id).toBe(first.visit_id);
    expect([first.is_entry, second.is_entry]).toEqual([true, false]);
    expect(second.visitor_hash).toBe(first.visitor_hash);

    await db.query("update onzio.page_events set occurred_at = now() - interval '31 minutes' where club_id = $1", [CLUB_IDS.alpha]);
    await record(CLUB_IDS.alpha, event({ path: "/shop" }));
    const third = (await rows(CLUB_IDS.alpha))[2];
    expect(third.visitor_hash).toBe(first.visitor_hash);
    expect(third.visit_id).not.toBe(first.visit_id);
    expect(third.is_entry).toBe(true);
  });

  it("gives different visitors and different clubs different ids for the same day", async () => {
    await record(CLUB_IDS.alpha, event());
    await record(CLUB_IDS.alpha, event({ visitorMaterial: material("visitor-b") }));
    await record(CLUB_IDS.charlie, event());
    const [a, b] = await rows(CLUB_IDS.alpha);
    const [c] = await rows(CLUB_IDS.charlie);
    expect(new Set([a.visitor_hash, b.visitor_hash, c.visitor_hash]).size).toBe(3);
    expect(b.visit_id).not.toBe(a.visit_id);
  });

  it("rotates the salt each club day, forgets earlier salts, and drops raw events after 90 days", async () => {
    await record(CLUB_IDS.alpha, event());
    const [before] = await rows(CLUB_IDS.alpha);
    // Pretend today's salt was yesterday's, and seed retention candidates.
    await db.query("update onzio_private.page_visitor_salts set salt_day = salt_day - 1 where club_id = $1", [CLUB_IDS.alpha]);
    await db.query(
      "insert into onzio_private.page_visitor_salts (club_id, salt_day, salt) values ($1, current_date - 10, decode(repeat('ab', 32), 'hex'))",
      [CLUB_IDS.alpha],
    );
    const expired = await rawEvent(CLUB_IDS.alpha, "91 days");
    const kept = await rawEvent(CLUB_IDS.alpha, "89 days");
    const otherClubExpired = await rawEvent(CLUB_IDS.charlie, "91 days");

    await record(CLUB_IDS.alpha, event());

    const after = (await rows(CLUB_IDS.alpha)).at(-1)!;
    expect(after.visitor_hash).not.toBe(before.visitor_hash);
    const { rows: salts } = await db.query(
      "select salt_day::text from onzio_private.page_visitor_salts where club_id = $1",
      [CLUB_IDS.alpha],
    );
    expect(salts).toEqual([{ salt_day: after.local_date }]);
    const ids = (await rows(CLUB_IDS.alpha)).map((row) => row.id);
    expect(ids).not.toContain(expired);
    expect(ids).toContain(kept);
    // The club's own first-event cleanup never touches another club. (The global sweep, which can, runs once
    // per club-minute and this call is in the same minute as the first; it is covered by its own tests below.)
    expect((await rows(CLUB_IDS.charlie)).map((row) => row.id)).toContain(otherClubExpired);
  });

  it("limits each visitor to 60 events a minute", async () => {
    const statuses: string[] = [];
    for (let i = 0; i < 61; i += 1) statuses.push(await record(CLUB_IDS.alpha, event({ path: `/news/n${i}` })));
    expect(statuses.slice(0, 60).every((status) => status === "recorded")).toBe(true);
    expect(statuses[60]).toBe("rate_limited");
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(60);
    // The rejected 61st event spent no club-wide budget.
    expect((await windows(CLUB_IDS.alpha)).find((window) => window.bucket === "*")?.hits).toBe(60);
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("visitor-b") }))).toBe("recorded");
  });

  it("limits each club to 1,200 events a minute across many networks", async () => {
    const statuses = await recordMany(
      CLUB_IDS.alpha,
      Array.from({ length: 1201 }, (_, i) => event({ visitorMaterial: material(`visitor-${i}`), networkMaterial: material(`network-${i}`) })),
    );
    expect(statuses.slice(0, 1200).every((status) => status === "recorded")).toBe(true);
    expect(statuses[1200]).toBe("rate_limited");
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(1200);
    expect((await windows(CLUB_IDS.alpha)).find((window) => window.bucket === "*")?.hits).toBe(1200);
    // The cap is per club: another club in the same minute is unaffected.
    expect(await record(CLUB_IDS.charlie, event())).toBe("recorded");
  });

  it("limits each club to 1,200 events a minute once the club counter is full", async () => {
    await db.query(
      "insert into onzio_private.page_event_rate_windows (club_id, bucket, window_start, hits) values ($1, '*', date_trunc('minute', now()), 1200)",
      [CLUB_IDS.charlie],
    );
    expect(await record(CLUB_IDS.charlie, event())).toBe("rate_limited");
    expect(await rows(CLUB_IDS.charlie)).toEqual([]);
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
  });

  it("refuses clubs that are not publicly live", async () => {
    expect(await record(CLUB_IDS.bravo, event())).toBe("not_public");
    expect(await record(randomUUID(), event())).toBe("not_public");
    expect(await rows(CLUB_IDS.bravo)).toEqual([]);
  });

  it("stores staff events flagged, so rollups can exclude them", async () => {
    await record(CLUB_IDS.alpha, event({ isStaff: true }));
    expect((await rows(CLUB_IDS.alpha)).map((row) => row.is_staff)).toEqual([true]);
  });

  it.each([
    ["an unknown key", event({ clubId: CLUB_IDS.bravo })],
    ["another event type", event({ type: "click" })],
    ["an admin path", event({ path: "/admin/analytics" })],
    ["an API path", event({ path: "/api/t" })],
    ["a relative path", event({ path: "schedule" })],
    ["a path with spaces", event({ path: "/a b" })],
    ["a path over 512 characters", event({ path: `/${"p".repeat(512)}` })],
    ["a short visitor value", event({ visitorMaterial: "abc" })],
    ["a missing visitor value", event({ visitorMaterial: null })],
    ["a short network value", event({ networkMaterial: "abc" })],
    ["an upper-case network value", event({ networkMaterial: material("network-x").toUpperCase() })],
    ["a missing network value", event({ networkMaterial: null })],
    ["a text ts", event({ ts: "now" })],
    ["a missing ts", event({ ts: undefined })],
    ["an unknown source", event({ sourceType: "email" })],
    ["an unknown device", event({ device: "watch" })],
    ["a three-letter country", event({ country: "USA" })],
    ["a long UTM value", event({ utmSource: "x".repeat(101) })],
    ["a non-boolean staff flag", event({ isStaff: "true" })],
    ["a numeric path", event({ path: 7 })],
    ["an array", [event()]],
  ])("rejects %s", async (_label, payload) => {
    await rejects(() => record(CLUB_IDS.alpha, payload), { code: "22023", message: "INVALID_PAGE_EVENT" });
    expect(await rows(CLUB_IDS.alpha)).toEqual([]);
  });
});

describe("onzio.record_page_event signed calls", () => {
  it("rejects a direct call with a missing or wrong signature and writes nothing", async () => {
    const text = payloadText(event());
    const key = await ingestKeyHex();
    const good = signPayload(CLUB_IDS.alpha, text, key);
    const forgeries: Array<[string, string | null, string, string | null]> = [
      ["no signature", CLUB_IDS.alpha, text, null],
      ["an empty signature", CLUB_IDS.alpha, text, ""],
      ["a signature made with another key", CLUB_IDS.alpha, text, signPayload(CLUB_IDS.alpha, text, "ab".repeat(32))],
      ["a signature made for another club", CLUB_IDS.alpha, text, signPayload(CLUB_IDS.charlie, text, key)],
      ["a signature over different text", CLUB_IDS.alpha, text, signPayload(CLUB_IDS.alpha, `${text} `, key)],
      ["a payload changed after signing", CLUB_IDS.alpha, text.replace("/schedule", "/forged"), good],
      ["a club id changed after signing", CLUB_IDS.charlie, text, good],
      ["an upper-case signature", CLUB_IDS.alpha, text, good.toUpperCase()],
      ["a truncated signature", CLUB_IDS.alpha, text, good.slice(0, 63)],
      ["a padded signature", CLUB_IDS.alpha, text, `${good} `],
      ["no club id", null, text, good],
    ];
    for (const [label, club, forgedText, signature] of forgeries) {
      expect(await callRecord(club, forgedText, signature), label).toBe("bad_signature");
    }
    // A null payload cannot be signed either.
    await asAnon();
    expect((await db.query("select onzio.record_page_event($1::uuid, null::text, $2::text) as status", [CLUB_IDS.alpha, good])).rows[0].status).toBe("bad_signature");
    await asOwner();
    for (const club of [CLUB_IDS.alpha, CLUB_IDS.charlie]) {
      expect(await traces(club), club).toEqual({ events: 0, salts: 0, windows: 0 });
    }
    // The same text with its own signature is recorded.
    expect(await callRecord(CLUB_IDS.alpha, text, good)).toBe("recorded");
  });

  it("answers an unsigned call the same way for a club without the add-on, so it reveals nothing", async () => {
    await revoke(CLUB_IDS.charlie);
    const text = payloadText(event());
    expect(await callRecord(CLUB_IDS.charlie, text, null)).toBe("bad_signature");
    expect(await callRecord(CLUB_IDS.bravo, text, null)).toBe("bad_signature");
    expect(await callRecord(randomUUID(), text, null)).toBe("bad_signature");
    expect(await traces(CLUB_IDS.charlie)).toEqual({ events: 0, salts: 0, windows: 0 });
  });

  it("refuses payloads over 8 KiB even when signed, before doing any work", async () => {
    const text = payloadText(event({ utmSource: "x".repeat(9000) }));
    expect(await callRecord(CLUB_IDS.alpha, text, signPayload(CLUB_IDS.alpha, text, await ingestKeyHex()))).toBe("bad_signature");
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
  });

  it("rejects a signed call whose ts is more than five minutes from the database clock, in either direction", async () => {
    for (const ts of [Date.now() - 400_000, Date.now() + 400_000, 0, 1]) {
      expect(await record(CLUB_IDS.alpha, event({ ts })), String(ts)).toBe("stale");
    }
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
    // Inside the window it is accepted.
    expect(await record(CLUB_IDS.alpha, event({ ts: Date.now() - 200_000 }))).toBe("recorded");
    expect(await record(CLUB_IDS.alpha, event({ ts: Date.now() + 200_000, visitorMaterial: material("visitor-b") }))).toBe("recorded");
  });

  it("accepts a correctly signed call, also with non-ASCII text, and agrees with an independent HMAC", async () => {
    const text = payloadText(event({ city: "São Paulo", country: "BR" }));
    const key = await ingestKeyHex();
    const independent = createHmac("sha256", Buffer.from(key, "hex")).update(`${CLUB_IDS.alpha}\n${text}`, "utf8").digest("hex");
    expect(signPayload(CLUB_IDS.alpha, text, key)).toBe(independent);
    expect(await callRecord(CLUB_IDS.alpha, text, independent)).toBe("recorded");
    expect((await rows(CLUB_IDS.alpha)).map((row) => [row.city, row.country])).toEqual([["São Paulo", "BR"]]);
  });

  it("rejects malformed or non-object JSON even when correctly signed, and writes nothing", async () => {
    const key = await ingestKeyHex();
    for (const text of ["{not json", "", "[]", "7", "null", '"text"', '{"a":"\\u0000"}']) {
      await rejects(
        async () => callRecord(CLUB_IDS.alpha, text, signPayload(CLUB_IDS.alpha, text, key)),
        { code: "22023", message: "INVALID_PAGE_EVENT" },
      );
    }
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
  });

  it("no longer has an unsigned signature in either schema", async () => {
    const { rows: functions } = await db.query(
      `select n.nspname, pg_get_function_identity_arguments(p.oid) as args
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'record_page_event' order by n.nspname`,
    );
    expect(functions).toEqual([
      { nspname: "onzio", args: "p_club_id uuid, p_payload text, p_signature text" },
      { nspname: "onzio_private", args: "p_club_id uuid, p_payload text, p_signature text" },
    ]);
    const { rows: old } = await db.query(
      "select to_regprocedure('onzio.record_page_event(uuid,jsonb)') as wrapper, to_regprocedure('onzio_private.record_page_event(uuid,jsonb)') as definer",
    );
    expect(old[0]).toEqual({ wrapper: null, definer: null });
    for (const call of ["select onzio.record_page_event($1::uuid, $2::jsonb)", "select onzio_private.record_page_event($1::uuid, $2::jsonb)"]) {
      await asAnon();
      await rejects(() => db.query(call, [CLUB_IDS.alpha, JSON.stringify(event())]), { code: "42883" });
    }
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
  });

  it("keeps the signing key in a single-row table that no browser role can read or write", async () => {
    const { rows: keys } = await db.query("select id, octet_length(key) as bytes from onzio_private.telemetry_ingest_keys");
    expect(keys).toEqual([{ id: 1, bytes: 32 }]);
    const { rows: security } = await db.query("select relrowsecurity from pg_class where oid = 'onzio_private.telemetry_ingest_keys'::regclass");
    expect(security[0].relrowsecurity).toBe(true);
    await rejects(() => db.query("insert into onzio_private.telemetry_ingest_keys (id, key) values (2, decode(repeat('ab', 32), 'hex'))"), { code: "23514" });
    await rejects(() => db.query("insert into onzio_private.telemetry_ingest_keys (key) values (decode(repeat('ab', 32), 'hex'))"), { code: "23505" });
    await rejects(() => db.query("update onzio_private.telemetry_ingest_keys set key = decode(repeat('ab', 31), 'hex')"), { code: "23514" });
    for (const actor of [asAnon, () => asUser(USER_IDS.ownerAal2)]) {
      await actor();
      await rejects(() => db.query("select key from onzio_private.telemetry_ingest_keys"), { code: "42501" });
      await actor();
      await rejects(() => db.query("update onzio_private.telemetry_ingest_keys set key = decode(repeat('ab', 32), 'hex')"), { code: "42501" });
      await actor();
      await rejects(() => db.query("delete from onzio_private.telemetry_ingest_keys"), { code: "42501" });
    }
  });

  it("stores the network key only as a salted, prefixed rate-window bucket, never in page_events", async () => {
    const network = material("network-store");
    await record(CLUB_IDS.alpha, event({ networkMaterial: network }));
    const salt = Buffer.from((await db.query("select encode(salt, 'hex') as hex from onzio_private.page_visitor_salts where club_id = $1", [CLUB_IDS.alpha])).rows[0].hex, "hex");
    const salted = (value: string) => createHash("sha256").update(Buffer.concat([salt, Buffer.from(value, "utf8")])).digest("hex");

    const buckets = (await windows(CLUB_IDS.alpha)).map((window) => window.bucket).sort();
    expect(buckets).toEqual([`n:${salted(network)}`, "*", salted(material("visitor-a"))].sort());
    for (const bucket of buckets) {
      expect(bucket).not.toContain(network);
      expect(bucket).not.toContain(material("visitor-a"));
    }
    const { rows: stored } = await db.query("select count(*)::int as n from onzio.page_events e where e::text like '%' || $1 || '%'", [network]);
    expect(stored[0].n).toBe(0);
    expect((await rows(CLUB_IDS.alpha))[0].visitor_hash).toBe(salted(material("visitor-a")));
  });

  it("rate-limits a flood from one network rotating visitor material at the network cap, keeping the club budget for others", async () => {
    // One machine, 1,300 requests in a minute, a new "visitor" (user agent) every time.
    const statuses = await recordMany(
      CLUB_IDS.alpha,
      Array.from({ length: 1300 }, (_, i) => event({ visitorMaterial: material(`rotating-${i}`), path: `/news/n${i % 7}` })),
    );
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(120);
    expect(statuses.filter((status) => status === "rate_limited")).toHaveLength(1180);
    expect(statuses.slice(0, 120).every((status) => status === "recorded")).toBe(true);
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(120);

    // Only accepted events spent club-wide budget: 120 of 1,200, not 1,300.
    const afterFlood = await windows(CLUB_IDS.alpha);
    expect(afterFlood.find((window) => window.bucket === "*")?.hits).toBe(120);
    const networkBuckets = afterFlood.filter((window) => window.bucket.startsWith("n:"));
    expect(networkBuckets).toHaveLength(1);
    expect(networkBuckets[0].hits).toBe(120);

    // A real visitor on a different network in the same minute is still recorded.
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("real-visitor"), networkMaterial: material("network-b"), path: "/real" }))).toBe("recorded");
    expect((await windows(CLUB_IDS.alpha)).find((window) => window.bucket === "*")?.hits).toBe(121);
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(121);
  });

  it("counts a visitor-capped event against its network, but not against the club", async () => {
    const statuses = await recordMany(CLUB_IDS.alpha, Array.from({ length: 70 }, (_, i) => event({ path: `/news/n${i}` })));
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(60);
    const counters = await windows(CLUB_IDS.alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(60);
    expect(counters.find((window) => window.bucket.startsWith("n:"))?.hits).toBe(70);
  });
});

describe("telemetry retention sweep", () => {
  /** A club's salts as "days before the UTC date" (0 = today). */
  async function saltAges(clubId: string): Promise<number[]> {
    await asOwner();
    const { rows: ages } = await db.query(
      "select ((now() at time zone 'UTC')::date - salt_day)::int as age from onzio_private.page_visitor_salts where club_id = $1 order by 1",
      [clubId],
    );
    return ages.map((row) => row.age);
  }

  async function addSalt(clubId: string, daysBeforeUtcToday: number): Promise<void> {
    await asOwner();
    await db.query(
      "insert into onzio_private.page_visitor_salts (club_id, salt_day, salt) values ($1, (now() at time zone 'UTC')::date - $2::int, decode(repeat('ab', 32), 'hex'))",
      [clubId, daysBeforeUtcToday],
    );
  }

  async function expiredCount(clubId: string): Promise<number> {
    await asOwner();
    return (await db.query("select count(*)::int as n from onzio.page_events where club_id = $1 and occurred_at < now() - interval '90 days'", [clubId])).rows[0].n;
  }

  it("removes a club's expired events and old salts when any other club's traffic opens a new minute, even if it cannot record", async () => {
    await revoke(CLUB_IDS.charlie); // public but without the add-on
    await rawEvent(CLUB_IDS.charlie, "91 days");
    const charlieKept = await rawEvent(CLUB_IDS.charlie, "89 days");
    await rawEvent(CLUB_IDS.bravo, "120 days"); // not public at all
    const bravoKept = await rawEvent(CLUB_IDS.bravo, "10 days");
    for (const age of [3, 2, 1]) await addSalt(CLUB_IDS.charlie, age);
    for (const age of [9, 4]) await addSalt(CLUB_IDS.bravo, age);

    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");

    expect((await rows(CLUB_IDS.charlie)).map((row) => row.id)).toEqual([charlieKept]);
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).toEqual([bravoKept]);
    // Salts three UTC days old go; two days old stay (no club's current day can be that far behind UTC).
    expect(await saltAges(CLUB_IDS.charlie)).toEqual([1, 2]);
    expect(await saltAges(CLUB_IDS.bravo)).toEqual([]);
    // Alpha's own salt for today is untouched.
    expect((await traces(CLUB_IDS.alpha)).salts).toBe(1);
  });

  it("runs at most once per club per minute, and only on accepted traffic", async () => {
    const first = await rawEvent(CLUB_IDS.bravo, "100 days");
    // Rejected events (bad signature, stale) never open a window, so they never sweep.
    expect(await callRecord(CLUB_IDS.alpha, payloadText(event()), null)).toBe("bad_signature");
    expect(await record(CLUB_IDS.alpha, event({ ts: 0 }))).toBe("stale");
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).toEqual([first]);

    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
    expect(await rows(CLUB_IDS.bravo)).toEqual([]);

    // Same minute: the club window already exists, so nothing is swept.
    const second = await rawEvent(CLUB_IDS.bravo, "100 days");
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("visitor-b") }))).toBe("recorded");
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).toEqual([second]);

    // The next minute sweeps it.
    await nextMinute(CLUB_IDS.alpha);
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("visitor-c") }))).toBe("recorded");
    expect(await rows(CLUB_IDS.bravo)).toEqual([]);
  });

  it("catches up on a backlog over successive minutes, 5,000 rows at a time, oldest first", async () => {
    await asOwner();
    await db.query(
      `insert into onzio.page_events (club_id, occurred_at, local_date, event_type, visitor_hash, visit_id, is_entry, path, source_type, device)
       select $1, now() - interval '100 days' - make_interval(secs => g), (now() - interval '100 days')::date, 'view', repeat('c', 64), gen_random_uuid(), true, '/', 'direct', 'desktop'
       from generate_series(1, 12000) as g`,
      [CLUB_IDS.bravo],
    );
    const kept = await rawEvent(CLUB_IDS.bravo, "89 days");
    expect(await expiredCount(CLUB_IDS.bravo)).toBe(12000);

    const remaining: number[] = [];
    for (let minute = 0; minute < 3; minute += 1) {
      if (minute > 0) await nextMinute(CLUB_IDS.alpha);
      expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material(`minute-${minute}`) }))).toBe("recorded");
      remaining.push(await expiredCount(CLUB_IDS.bravo));
    }
    expect(remaining).toEqual([7000, 2000, 0]);
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).toEqual([kept]);

    // Oldest first: after one batch, the newest expired rows are what is left.
    await db.query(
      `insert into onzio.page_events (club_id, occurred_at, local_date, event_type, visitor_hash, visit_id, is_entry, path, source_type, device)
       select $1, now() - interval '100 days' - make_interval(secs => g), (now() - interval '100 days')::date, 'view', repeat('c', 64), gen_random_uuid(), true, '/', 'direct', 'desktop'
       from generate_series(1, 5001) as g`,
      [CLUB_IDS.bravo],
    );
    await nextMinute(CLUB_IDS.alpha);
    await record(CLUB_IDS.alpha, event({ visitorMaterial: material("minute-oldest") }));
    const { rows: left } = await db.query(
      "select count(*)::int as n, extract(epoch from (now() - max(occurred_at)))::int as newest_age from onzio.page_events where club_id = $1 and occurred_at < now() - interval '90 days'",
      [CLUB_IDS.bravo],
    );
    expect(left[0].n).toBe(1);
    // The one row left is the newest of the batch (100 days and 1 second old), not the oldest.
    expect(left[0].newest_age).toBe(100 * 86400 + 1);
  });

  it("deletes a club's salts and rate counters the moment its add-on is removed, but keeps other clubs'", async () => {
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
    expect(await record(CLUB_IDS.charlie, event())).toBe("recorded");
    expect((await traces(CLUB_IDS.alpha)).salts).toBe(1);
    expect((await traces(CLUB_IDS.alpha)).windows).toBeGreaterThan(0);

    await revoke(CLUB_IDS.alpha);

    // Events stay for the 90-day retention; the material that could link visitors does not.
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 1, salts: 0, windows: 0 });
    expect(await traces(CLUB_IDS.charlie)).toMatchObject({ events: 1, salts: 1 });
    expect((await traces(CLUB_IDS.charlie)).windows).toBeGreaterThan(0);
  });

  it("forgets the old salt on revoke, so a regrant starts a fresh one", async () => {
    await record(CLUB_IDS.alpha, event());
    const before = (await rows(CLUB_IDS.alpha))[0].visitor_hash;
    await revoke(CLUB_IDS.alpha);
    await entitle(CLUB_IDS.alpha);
    await record(CLUB_IDS.alpha, event({ path: "/again" }));
    const after = (await rows(CLUB_IDS.alpha)).at(-1)!;
    expect(after.path).toBe("/again");
    expect(after.visitor_hash).not.toBe(before);
    // The same visitor now looks new: no link survives the revoke.
    expect(after.is_entry).toBe(true);
  });

  it("keeps the trigger function out of every API role's reach", async () => {
    const { rows: grants } = await db.query(
      "select has_function_privilege('anon', 'onzio_private.forget_telemetry_when_addon_removed()', 'execute') as anon, has_function_privilege('authenticated', 'onzio_private.forget_telemetry_when_addon_removed()', 'execute') as authenticated, has_function_privilege('service_role', 'onzio_private.forget_telemetry_when_addon_removed()', 'execute') as service_role",
    );
    expect(grants[0]).toEqual({ anon: false, authenticated: false, service_role: false });
  });
});

describe("the telemetry paid add-on", () => {
  it("is off for every club by default", async () => {
    expect(defaultsBeforeGrant).toEqual({ alpha: false, bravo: false, charlie: false });
  });

  it("drops every event for a public club without it and leaves no trace", async () => {
    await revoke(CLUB_IDS.charlie);
    expect(await hasTelemetry(CLUB_IDS.charlie)).toBe(false);
    for (const payload of [event(), event({ isStaff: true }), event({ visitorMaterial: material("visitor-b") })]) {
      expect(await record(CLUB_IDS.charlie, payload)).toBe("not_entitled");
    }
    expect(await traces(CLUB_IDS.charlie)).toEqual({ events: 0, salts: 0, windows: 0 });
    // Alpha keeps its add-on and is unaffected.
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
  });

  it("stops recording as soon as the add-on is removed", async () => {
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
    await revoke(CLUB_IDS.alpha);
    expect(await record(CLUB_IDS.alpha, event({ path: "/after" }))).toBe("not_entitled");
    expect((await rows(CLUB_IDS.alpha)).map((row) => row.path)).toEqual(["/schedule"]);
  });

  it("records Rose City normally once the operator SQL turns it on, and a rerun is a no-op with one audit event", async () => {
    await roseCityClub();
    expect(await hasTelemetry(ROSE_CITY_CLUB_ID)).toBe(false);
    expect(await record(ROSE_CITY_CLUB_ID, event())).toBe("not_entitled");
    expect(await traces(ROSE_CITY_CLUB_ID)).toEqual({ events: 0, salts: 0, windows: 0 });

    const first = await runOperatorSql("commit");
    expect(first).toMatchObject({ result: "changed: telemetry off -> on", club_slug: "rose-city", telemetry_enabled: true, all_ok: true });
    expect(await hasTelemetry(ROSE_CITY_CLUB_ID)).toBe(true);

    expect(await record(ROSE_CITY_CLUB_ID, event({ path: "/sponsors" }))).toBe("recorded");
    const [row] = await rows(ROSE_CITY_CLUB_ID);
    expect(row).toMatchObject({ path: "/sponsors", event_type: "view", is_entry: true, is_staff: false });

    const second = await runOperatorSql("commit");
    expect(second).toMatchObject({ result: "no-op", telemetry_enabled: true, all_ok: true });
    expect(second.latest_audit_event_id).toBe(first.latest_audit_event_id);
    expect(await auditRows(ROSE_CITY_CLUB_ID)).toEqual([
      {
        actor_type: "migration",
        operation: "manual.club_addon_grant",
        resource_type: "club_addon",
        resource_id: "telemetry",
        payload: {
          addon: "telemetry",
          previous_value: { enabled: false },
          new_value: { enabled: true },
          reason: "TELEMETRY-01: Rose City bought the sponsor analytics (telemetry) add-on",
        },
      },
    ]);
  });

  it("leaves nothing behind after the rehearsal", async () => {
    await roseCityClub();
    const rehearsed = await runOperatorSql("rehearsal");
    expect(rehearsed).toMatchObject({ result: "changed: telemetry off -> on", telemetry_enabled: true, all_ok: true });
    expect(await hasTelemetry(ROSE_CITY_CLUB_ID)).toBe(false);
    expect(await auditRows(ROSE_CITY_CLUB_ID)).toEqual([]);
    expect(await record(ROSE_CITY_CLUB_ID, event())).toBe("not_entitled");
  });

  it("refuses to run when Rose City is missing or archived", async () => {
    await rejects(() => runOperatorSql("commit"), { message: expect.stringContaining("ROSE_CITY_NOT_FOUND") });
    await roseCityClub();
    await db.query("update onzio.clubs set lifecycle = 'archived', public_access = 'suspended', archived_at = now() where id = $1", [ROSE_CITY_CLUB_ID]);
    await rejects(() => runOperatorSql("commit"), { message: "ROSE_CITY_ARCHIVED" });
    expect(await auditRows(ROSE_CITY_CLUB_ID)).toEqual([]);
  });

  it("refuses unknown add-on names instead of answering false", async () => {
    for (const addon of ["roster", "registrations", "", null]) {
      await asAnon();
      await rejects(() => db.query("select onzio.club_has_addon($1, $2)", [CLUB_IDS.alpha, addon]), { code: "22023", message: "UNKNOWN_CLUB_ADDON" });
    }
    await rejects(() => db.query("insert into onzio_private.club_addons (club_id, addon) values ($1, 'roster')", [CLUB_IDS.bravo]), { code: "23514" });
  });

  it("keeps the grants table out of browser roles' reach", async () => {
    for (const actor of [asAnon, () => asUser(USER_IDS.ownerAal2)]) {
      await actor();
      await rejects(() => db.query("select * from onzio_private.club_addons"), { code: "42501" });
      await actor();
      await rejects(() => db.query("insert into onzio_private.club_addons (club_id, addon) values ($1, 'telemetry')", [CLUB_IDS.bravo]), { code: "42501" });
    }
  });
});

describe("onzio.page_events access", () => {
  it("lets no browser role write raw events directly", async () => {
    for (const actor of [asAnon, () => asUser(USER_IDS.ownerAal2)]) {
      await actor();
      await rejects(
        () => db.query("insert into onzio.page_events (club_id, local_date, event_type, visitor_hash, visit_id, is_entry, path, source_type, device) values ($1, current_date, 'view', repeat('a', 64), gen_random_uuid(), true, '/', 'direct', 'mobile')", [CLUB_IDS.alpha]),
        { code: "42501" },
      );
      await actor();
      await rejects(() => db.query("update onzio.page_events set path = '/x'"), { code: "42501" });
      await actor();
      await rejects(() => db.query("delete from onzio.page_events"), { code: "42501" });
    }
  });

  it("keeps salts, rate windows and the definer's helper out of browser roles' reach", async () => {
    for (const actor of [asAnon, () => asUser(USER_IDS.ownerAal2)]) {
      await actor();
      await rejects(() => db.query("select * from onzio_private.page_visitor_salts"), { code: "42501" });
      await actor();
      await rejects(() => db.query("select * from onzio_private.page_event_rate_windows"), { code: "42501" });
      await actor();
      await rejects(() => db.query("select onzio_private.page_event_text('{}'::jsonb, 'x', '.', false)"), { code: "42501" });
    }
  });

  it("lets a club's owners and admins read only their own club's events; anon reads nothing", async () => {
    await record(CLUB_IDS.alpha, event());
    await record(CLUB_IDS.charlie, event());

    await asAnon();
    await rejects(() => db.query("select id from onzio.page_events"), { code: "42501" });

    for (const userId of [USER_IDS.ownerAal2, USER_IDS.adminAal2]) {
      await asUser(userId);
      const { rows: visible } = await db.query("select club_id from onzio.page_events");
      expect(visible.map((row) => row.club_id)).toEqual([CLUB_IDS.alpha]);
    }

    for (const userId of [USER_IDS.unaffiliated, USER_IDS.removed]) {
      await asUser(userId);
      expect((await db.query("select club_id from onzio.page_events")).rows).toEqual([]);
    }
    await asOwner();
  });

  it("lists onzio.page_events in the archived-club purge", async () => {
    const { rows: definition } = await db.query(
      "select pg_get_functiondef('onzio_private.purge_archived_club(uuid,text,text,uuid)'::regprocedure) as body",
    );
    expect(definition[0].body).toContain("'onzio.page_events'");
  });
});

// PostgREST answers PGRST202 for a function that has no match for the arguments sent, and PGRST205 for a
// table that is not in its schema cache (onzio_private is not an exposed schema).
const NO_MATCHING_FUNCTION = "PGRST202";
const MISSING_TABLE = "PGRST205";

describe("onzio.record_page_event through PostgREST", () => {
  it("is exposed to the anon key but accepts only signed calls, while raw events stay unreadable to it", async () => {
    const { anon } = createLocalClients();
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    const visitor = material(`postgrest-${randomUUID()}`);
    // This call commits, so the add-on must be committed too. Release this
    // test's transaction first: its uncommitted grant would block that insert.
    await db.query("rollback");
    await db.query("begin");
    const cleanup = new Client(localPostgresConfig());
    await cleanup.connect();
    // Remove the grant afterwards only if this test added it.
    const granted = await cleanup.query(
      "insert into onzio_private.club_addons (club_id, addon) values ($1, 'telemetry') on conflict do nothing returning club_id",
      [CLUB_IDS.charlie],
    );
    try {
      const key = (await cleanup.query("select encode(key, 'hex') as hex from onzio_private.telemetry_ingest_keys")).rows[0].hex as string;
      const payload = JSON.stringify({ ...event({ visitorMaterial: visitor, path: "/postgrest-proof" }), ts: Date.now() });

      // Anyone holding only the public anon key can post, but not forge: no or wrong signature writes nothing.
      const forged = JSON.stringify({ ...event({ visitorMaterial: visitor, path: "/postgrest-forged" }), ts: Date.now() });
      for (const signature of ["0".repeat(64), signPayload(CLUB_IDS.charlie, forged, "ab".repeat(32)), ""]) {
        const rejected = await anon.rpc("record_page_event", { p_club_id: CLUB_IDS.charlie, p_payload: forged, p_signature: signature });
        expect(rejected.error).toBeNull();
        expect(rejected.data).toBe("bad_signature");
      }
      // The old unsigned shape no longer exists, and a call with no signature argument is not a function.
      const oldShape = await anon.rpc("record_page_event", { p_club_id: CLUB_IDS.charlie, p_event: event({ path: "/postgrest-forged" }) });
      expect(oldShape.error?.code).toBe(NO_MATCHING_FUNCTION);
      expect(oldShape.data).toBeNull();
      const unsigned = await anon.rpc("record_page_event", { p_club_id: CLUB_IDS.charlie, p_payload: forged });
      expect(unsigned.error?.code).toBe(NO_MATCHING_FUNCTION);
      expect(unsigned.data).toBeNull();

      const recorded = await anon.rpc("record_page_event", {
        p_club_id: CLUB_IDS.charlie,
        p_payload: payload,
        p_signature: signPayload(CLUB_IDS.charlie, payload, key),
      });
      expect(recorded.error).toBeNull();
      expect(recorded.data).toBe("recorded");

      const read = await anon.from("page_events").select("id").limit(1);
      expect(read.error?.code).toBe("42501");
      const keyRead = await anon.from("telemetry_ingest_keys").select("key").limit(1);
      expect(keyRead.error?.code).toBe(MISSING_TABLE);

      const { rows: stored } = await cleanup.query(
        "select path, count(*)::int as n from onzio.page_events where club_id = $1 and path in ('/postgrest-proof', '/postgrest-forged') and occurred_at >= $2 group by path",
        [CLUB_IDS.charlie, startedAt],
      );
      expect(stored).toEqual([{ path: "/postgrest-proof", n: 1 }]);
    } finally {
      // This call commits; remove exactly what it created.
      await cleanup.query("delete from onzio.page_events where club_id = $1 and path in ('/postgrest-proof', '/postgrest-forged') and occurred_at >= $2", [CLUB_IDS.charlie, startedAt]);
      await cleanup.query("delete from onzio_private.page_event_rate_windows where club_id = $1 and window_start >= date_trunc('minute', $2::timestamptz)", [CLUB_IDS.charlie, startedAt]);
      await cleanup.query("delete from onzio_private.page_visitor_salts where club_id = $1 and created_at >= $2", [CLUB_IDS.charlie, startedAt]);
      if (granted.rowCount === 1) {
        await cleanup.query("delete from onzio_private.club_addons where club_id = $1 and addon = 'telemetry'", [CLUB_IDS.charlie]);
      }
      await cleanup.end();
    }
  });
});
