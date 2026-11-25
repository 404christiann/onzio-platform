import { createHash, createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { hasOpsFile, readOpsFile } from "../helpers/ops-repo";
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
// The retention sweep (onzio.sweep_page_telemetry) is global and runs as the service role; its tests
// seed old rows inside their own transaction and compare against global counts taken just before, so
// leftover rows from other work cannot change what they prove.

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

// On a freshly reset database page_events has never been analyzed. The sweep's cached generic delete plan then
// estimates one row and re-runs its batch subquery for every row: about 24 s for 12,000 rows instead of 11 ms.
// Production keeps statistics current through autovacuum, so tests that bulk-load the table analyze it too.
async function analyzePageEvents(): Promise<void> {
  await asOwner();
  await db.query("analyze onzio.page_events");
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

async function asService(): Promise<void> {
  await db.query("reset role");
  await db.query("set local role service_role");
}

/** One retention sweep as the service role, called the way the cron calls it (the exposed wrapper). */
async function sweep(maxEvents?: number | null): Promise<Record<string, unknown>> {
  await asService();
  // No try/finally: after a refusal the transaction is aborted and `rejects` restores the role itself.
  const { rows: swept } =
    maxEvents === undefined
      ? await db.query("select onzio.sweep_page_telemetry() as result")
      : await db.query("select onzio.sweep_page_telemetry($1::integer) as result", [maxEvents]);
  await asOwner();
  return swept[0].result;
}

/** The club's own calendar day right now, as the beacon stamps it on events and drop counts. */
async function clubDay(clubId: string): Promise<string> {
  await asOwner();
  return (await db.query("select (now() at time zone time_zone)::date::text as day from onzio.clubs where id = $1", [clubId])).rows[0].day;
}

async function dropCounts(clubId: string) {
  await asOwner();
  return (
    await db.query(
      "select local_date::text, reason, dropped from onzio_private.page_event_drop_counts where club_id = $1 order by reason, local_date",
      [clubId],
    )
  ).rows as Array<{ local_date: string; reason: string; dropped: number }>;
}

/** Puts a club's club-wide counter for the current minute at exactly this value. */
async function setClubCounter(clubId: string, hits: number): Promise<void> {
  await asOwner();
  await db.query(
    `insert into onzio_private.page_event_rate_windows (club_id, bucket, window_start, hits)
     values ($1, '*', date_trunc('minute', now()), $2)
     on conflict (club_id, bucket, window_start) do update set hits = excluded.hits`,
    [clubId, hits],
  );
}

/** n events from distinct visitors, all from the given network keys. */
function manyVisitors(prefix: string, n: number, overrides: Event = {}): Event[] {
  return Array.from({ length: n }, (_, i) => event({ visitorMaterial: material(`${prefix}-${i}`), ...overrides }));
}

const OPERATOR_SQL = (kind: "rehearsal" | "commit") => `scripts/operator-sql/rose-city-telemetry-enable.${kind}.sql`;
const hasOperatorSql = hasOpsFile(OPERATOR_SQL("commit")) && hasOpsFile(OPERATOR_SQL("rehearsal"));

/** Runs an operator SQL file exactly as written, inside this test's transaction (its begin/commit/rollback become a savepoint). */
async function runOperatorSql(kind: "rehearsal" | "commit") {
  await asOwner();
  const sql = readOpsFile(OPERATOR_SQL(kind))
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
      // TELEMETRY-02: sponsor and engagement columns.
      "sponsor_id", "engaged_ms",
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
    // The one event over the club cap was counted, as a club drop.
    expect(await dropCounts(CLUB_IDS.alpha)).toEqual([{ local_date: await clubDay(CLUB_IDS.alpha), reason: "club", dropped: 1 }]);
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
    ["a short wide network value", event({ wideNetworkMaterial: "abc" })],
    ["an upper-case wide network value", event({ wideNetworkMaterial: material("wide-x").toUpperCase() })],
    ["a numeric wide network value", event({ wideNetworkMaterial: 7 })],
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

  it("stores the wide network key only as a salted, 'w:'-prefixed rate-window bucket, never in page_events", async () => {
    const network = material("network-store-64");
    const wide = material("network-store-48");
    await record(CLUB_IDS.alpha, event({ networkMaterial: network, wideNetworkMaterial: wide }));
    const salt = Buffer.from((await db.query("select encode(salt, 'hex') as hex from onzio_private.page_visitor_salts where club_id = $1", [CLUB_IDS.alpha])).rows[0].hex, "hex");
    const salted = (value: string) => createHash("sha256").update(Buffer.concat([salt, Buffer.from(value, "utf8")])).digest("hex");

    const buckets = (await windows(CLUB_IDS.alpha)).map((window) => window.bucket).sort();
    expect(buckets).toEqual([`n:${salted(network)}`, `w:${salted(wide)}`, "*", salted(material("visitor-a"))].sort());
    for (const bucket of buckets) {
      expect(bucket).not.toContain(network);
      expect(bucket).not.toContain(wide);
    }
    for (const value of [network, wide]) {
      const { rows: stored } = await db.query("select count(*)::int as n from onzio.page_events e where e::text like '%' || $1 || '%'", [value]);
      expect(stored[0].n).toBe(0);
    }
  });

  it("accepts an event with no wide network key, or a null one, and keeps no wide counter for it", async () => {
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
    expect(await record(CLUB_IDS.alpha, event({ wideNetworkMaterial: null, visitorMaterial: material("visitor-b") }))).toBe("recorded");
    expect((await windows(CLUB_IDS.alpha)).filter((window) => window.bucket.startsWith("w:"))).toEqual([]);
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(2);
  });

  it("allows only the known bucket kinds in the rate-limit table", async () => {
    const insertBucket = (bucket: string) =>
      db.query(
        "insert into onzio_private.page_event_rate_windows (club_id, bucket, window_start, hits) values ($1, $2, date_trunc('minute', now()) - interval '1 day', 1)",
        [CLUB_IDS.alpha, bucket],
      );
    await asOwner();
    for (const good of [`w:${"a".repeat(64)}`, `n:${"a".repeat(64)}`, "a".repeat(64), "*"]) await insertBucket(good);
    for (const bad of [`x:${"a".repeat(64)}`, `w:${"a".repeat(63)}`, `w:${"A".repeat(64)}`, `ww:${"a".repeat(64)}`, `w:n:${"a".repeat(64)}`, "w:", ""]) {
      await rejects(() => insertBucket(bad), { code: "23514" });
    }
  });

  it("rate-limits a flood from one network rotating visitor material at half the club's headroom, keeping the rest for others", async () => {
    // One machine, 1,300 requests in a minute, a new "visitor" (user agent) every time. Over its 120 floor a network is
    // accepted while its own count plus the club's count is under 1,320. Alone on a quiet club both counts are equal, so
    // event k (k - 1 already recorded) passes while 2 * (k - 1) < 1,320: exactly 660 are recorded.
    const statuses = await recordMany(
      CLUB_IDS.alpha,
      Array.from({ length: 1300 }, (_, i) => event({ visitorMaterial: material(`rotating-${i}`), path: `/news/n${i % 7}` })),
    );
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(660);
    expect(statuses.filter((status) => status === "rate_limited")).toHaveLength(640);
    expect(statuses.slice(0, 660).every((status) => status === "recorded")).toBe(true);
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(660);

    // Only accepted events spent club-wide budget: 660 of 1,200, not 1,300, and the network's counter
    // stopped where it said no instead of being rewritten for every flood request.
    const afterFlood = await windows(CLUB_IDS.alpha);
    expect(afterFlood.find((window) => window.bucket === "*")?.hits).toBe(660);
    const networkBuckets = afterFlood.filter((window) => window.bucket.startsWith("n:"));
    expect(networkBuckets).toHaveLength(1);
    expect(networkBuckets[0].hits).toBe(660);
    // The 640 limited events are counted, not silent.
    expect(await dropCounts(CLUB_IDS.alpha)).toEqual([{ local_date: await clubDay(CLUB_IDS.alpha), reason: "network", dropped: 640 }]);

    // A real visitor on a different network in the same minute is still recorded...
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("real-visitor"), networkMaterial: material("network-b"), path: "/real" }))).toBe("recorded");
    expect((await windows(CLUB_IDS.alpha)).find((window) => window.bucket === "*")?.hits).toBe(661);
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(661);
    // ...and the rest of the club budget is still there for other networks: 539 more fill it to 1,200.
    const others = await recordMany(
      CLUB_IDS.alpha,
      Array.from({ length: 539 }, (_, i) => event({ visitorMaterial: material(`other-${i}`), networkMaterial: material(`other-network-${i}`) })),
    );
    expect(others.every((status) => status === "recorded")).toBe(true);
    expect((await windows(CLUB_IDS.alpha)).find((window) => window.bucket === "*")?.hits).toBe(1200);
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("one-too-many"), networkMaterial: material("network-last") }))).toBe("rate_limited");
  });

  it("counts a visitor-capped event against its network, but not against the club", async () => {
    const statuses = await recordMany(CLUB_IDS.alpha, Array.from({ length: 70 }, (_, i) => event({ path: `/news/n${i}` })));
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(60);
    const counters = await windows(CLUB_IDS.alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(60);
    expect(counters.find((window) => window.bucket.startsWith("n:"))?.hits).toBe(70);
  });
});

describe("telemetry headroom-share network limits", () => {
  const alpha = CLUB_IDS.alpha;
  const network = (name: string) => material(`network-${name}`);

  it("records every event of a busy shared network (stadium Wi-Fi) while the club counter is low", async () => {
    const statuses = await recordMany(alpha, manyVisitors("stadium", 400, { networkMaterial: network("stadium") }));
    expect(statuses.every((status) => status === "recorded")).toBe(true);
    expect(await rows(alpha)).toHaveLength(400);
    const counters = await windows(alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(400);
    expect(counters.filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual([400]);
    // Nothing was limited, so nothing was counted as dropped.
    expect(await dropCounts(alpha)).toEqual([]);
  });

  it("records exactly 660 for one network flooding a quiet club, and a fresh network still records afterwards", async () => {
    // Own count and club count both start at 0 and rise together, so event k passes while 2 * (k - 1) < 1,320:
    // k - 1 = 659 is the last that passes, event 661 (k - 1 = 660, 660 + 660 = 1,320) is the first refused.
    const statuses = await recordMany(alpha, manyVisitors("flood", 1300, { networkMaterial: network("flood") }));
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(660);
    expect(statuses.slice(0, 660).every((status) => status === "recorded")).toBe(true);
    expect(statuses.slice(660).every((status) => status === "rate_limited")).toBe(true);
    expect(await rows(alpha)).toHaveLength(660);
    const counters = await windows(alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(660);
    // The network's counter stopped at 660 instead of being rewritten for the 640 limited events.
    expect(counters.filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual([660]);
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "network", dropped: 640 }]);

    // 540 of the club's 1,200 are left for everyone else.
    expect(await record(alpha, event({ visitorMaterial: material("newcomer"), networkMaterial: network("newcomer") }))).toBe("recorded");
    expect((await windows(alpha)).find((window) => window.bucket === "*")?.hits).toBe(661);
  });

  it("gives a shared network about half of the headroom on a busy club, 360 instead of 120 at a club count of 600", async () => {
    // Other networks have already used 600 of the club's minute. Event k has k - 1 recorded for this network and a club
    // count of 600 + (k - 1), so it passes while (k - 1) + 600 + (k - 1) < 1,320, that is while k - 1 < 360: 360 are
    // recorded (a cliff at a club count of 600 would have left 120). The counter is read once per call and the calls run
    // one by one, so the club count it sees includes this network's own accepted events.
    await setClubCounter(alpha, 600);
    const statuses = await recordMany(alpha, manyVisitors("match-day", 1000, { networkMaterial: network("busy") }));
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(360);
    expect(statuses.slice(0, 360).every((status) => status === "recorded")).toBe(true);
    expect(statuses.slice(360).every((status) => status === "rate_limited")).toBe(true);
    expect(await rows(alpha)).toHaveLength(360);
    // Accepted events spent club budget (600 + 360); the network's counter stopped at 360.
    const counters = await windows(alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(960);
    expect(counters.filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual([360]);
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "network", dropped: 640 }]);

    // A network that has not used its share is still recorded, and 240 of the club's 1,200 remain for others.
    expect(await record(alpha, event({ visitorMaterial: material("newcomer"), networkMaterial: network("other") }))).toBe("recorded");
    expect((await windows(alpha)).find((window) => window.bucket === "*")?.hits).toBe(961);
  });

  it("shrinks a network's share smoothly from 660 to its 120 floor as the rest of the club fills", async () => {
    // With y events already used by other networks, a network records n events where (n - 1) + y + (n - 1) is the last
    // value under 1,320: n = (1,320 - y) / 2 (rounded up), never fewer than the 120 floor and never past the club cap.
    const cases: Array<{ otherTraffic: number; recorded: number; note: string }> = [
      { otherTraffic: 0, recorded: 660, note: "(1,320 - 0) / 2" },
      { otherTraffic: 600, recorded: 360, note: "(1,320 - 600) / 2" },
      { otherTraffic: 900, recorded: 210, note: "(1,320 - 900) / 2" },
      { otherTraffic: 1079, recorded: 121, note: "just under 1,080: 121 events still fit, the 122nd would reach 1,321" },
      { otherTraffic: 1080, recorded: 120, note: "1,080 and above: held at the 120 floor" },
      { otherTraffic: 1100, recorded: 100, note: "above 1,080 the 1,200 club cap is what limits it: 1,200 - 1,100" },
    ];
    for (const { otherTraffic, recorded, note } of cases) {
      await nextMinute(alpha);
      if (otherTraffic > 0) await setClubCounter(alpha, otherTraffic);
      const statuses = await recordMany(
        alpha,
        manyVisitors(`curve-${otherTraffic}`, recorded + 20, { networkMaterial: network(`curve-${otherTraffic}`) }),
      );
      expect(statuses.filter((status) => status === "recorded"), `${otherTraffic} other: ${note}`).toHaveLength(recorded);
      expect(statuses.slice(0, recorded).every((status) => status === "recorded"), `${otherTraffic} other`).toBe(true);
      expect((await windows(alpha)).find((window) => window.bucket === "*")?.hits, `${otherTraffic} other: club counter`).toBe(otherTraffic + recorded);
    }
  });

  it("holds a network to its 120 floor once the rest of the club has used 1,080 or more", async () => {
    // 120 recorded takes the club to 1,200; event 121 has 120 + 1,200 = 1,320, which is not under 1,320.
    await setClubCounter(alpha, 1080);
    const statuses = await recordMany(alpha, manyVisitors("over", 130, { networkMaterial: network("busy") }));
    expect(statuses.slice(0, 120).every((status) => status === "recorded")).toBe(true);
    expect(statuses.slice(120).every((status) => status === "rate_limited")).toBe(true);
    expect(await rows(alpha)).toHaveLength(120);
    // Accepted events spent club budget (1,080 + 120); the network's counter stopped at its 120 floor.
    const counters = await windows(alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(1200);
    expect(counters.filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual([120]);
    // These are network drops: the network check runs before the club cap, which is full but not what said no.
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "network", dropped: 10 }]);

    // The club cap still bounds everyone: a brand-new network is turned away by the full club.
    expect(await record(alpha, event({ visitorMaterial: material("newcomer"), networkMaterial: network("other") }))).toBe("rate_limited");
    expect(await dropCounts(alpha)).toEqual([
      { local_date: await clubDay(alpha), reason: "club", dropped: 1 },
      { local_date: await clubDay(alpha), reason: "network", dropped: 10 },
    ]);
  });

  it("limits a network that is past its floor once other traffic takes its own count plus the club's to 1,320", async () => {
    const early = await recordMany(alpha, manyVisitors("early", 400, { networkMaterial: network("early") }));
    expect(early.every((status) => status === "recorded")).toBe(true);
    // 519 other networks, one event each: the club counter reaches 919.
    const others = await recordMany(
      alpha,
      Array.from({ length: 519 }, (_, i) => event({ visitorMaterial: material(`other-${i}`), networkMaterial: network(`other-${i}`) })),
    );
    expect(others.every((status) => status === "recorded")).toBe(true);
    expect((await windows(alpha)).find((window) => window.bucket === "*")?.hits).toBe(919);

    // The early network has 400 (over its 120 floor): 400 + 919 = 1,319 is still under 1,320, so one more is recorded...
    expect(await record(alpha, event({ visitorMaterial: material("early-again"), networkMaterial: network("early") }))).toBe("recorded");
    // ...and now 401 + 920 = 1,321 is not: it is limited, while a network that used 1 event is not.
    expect(await record(alpha, event({ visitorMaterial: material("early-third"), networkMaterial: network("early") }))).toBe("rate_limited");
    expect(await record(alpha, event({ visitorMaterial: material("other-0-again"), networkMaterial: network("other-0") }))).toBe("recorded");
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "network", dropped: 1 }]);
  });

  it("stops counting a network once it has used its headroom share, so its counter is not rewritten without bound", async () => {
    // One visitor sends 1,300 events: 60 are recorded and the rest are visitor drops, but each one still reaches the
    // network counter while its own count plus the club's 60 is under 1,320, so the counter stops at 1,260.
    const statuses = await recordMany(alpha, Array.from({ length: 1300 }, (_, i) => event({ path: `/news/n${i % 5}` })));
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(60);
    expect((await windows(alpha)).filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual([1260]);
    expect(await dropCounts(alpha)).toEqual([
      { local_date: await clubDay(alpha), reason: "network", dropped: 40 },
      { local_date: await clubDay(alpha), reason: "visitor", dropped: 1200 },
    ]);
  });

  it("keeps ten /64s inside one /48 to half of the club's headroom (660), and still records other networks", async () => {
    const wide = material("wide-attacker");
    // One block rotating ten /64 addresses, a new visitor every time, 1,300 requests in a minute. The /48 counter and the
    // club counter rise together, so it passes while 2 * (k - 1) < 1,320: 660 recorded, started first.
    const statuses = await recordMany(
      alpha,
      Array.from({ length: 1300 }, (_, i) =>
        event({ visitorMaterial: material(`rotating-${i}`), networkMaterial: network(`rot64-${i % 10}`), wideNetworkMaterial: wide }),
      ),
    );
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(660);
    expect(statuses.slice(0, 660).every((status) => status === "recorded")).toBe(true);
    expect(statuses.slice(660).every((status) => status === "rate_limited")).toBe(true);
    expect(await rows(alpha)).toHaveLength(660);

    const counters = await windows(alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(660);
    // The /48 counter stopped where it said no.
    expect(counters.filter((window) => window.bucket.startsWith("w:")).map((window) => window.hits)).toEqual([660]);
    // Each /64 saw 130 requests and passed its own check every time (its count plus the club's 660 stays under 1,320);
    // it was the /48 check that turned the last 640 away, so the /64 counters kept counting to 130.
    expect(counters.filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual(Array(10).fill(130));
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "network", dropped: 640 }]);

    // Five real visitors on other networks (a different /48 each, and IPv4 callers with no wide key) still record.
    const bystanders = await recordMany(alpha, [
      ...Array.from({ length: 3 }, (_, i) =>
        event({ visitorMaterial: material(`bystander-v6-${i}`), networkMaterial: network(`bystander-64-${i}`), wideNetworkMaterial: material(`wide-bystander-${i}`) }),
      ),
      ...Array.from({ length: 2 }, (_, i) => event({ visitorMaterial: material(`bystander-v4-${i}`), networkMaterial: network(`bystander-v4-${i}`) })),
    ]);
    expect(bystanders).toEqual(Array(5).fill("recorded"));
    expect((await windows(alpha)).find((window) => window.bucket === "*")?.hits).toBe(665);
  });

  it("shares a /48's headroom the same way on a busy club: 360 recorded at a club count of 600", async () => {
    await setClubCounter(alpha, 600);
    const wide = material("wide-late");
    const statuses = await recordMany(
      alpha,
      Array.from({ length: 1000 }, (_, i) =>
        event({ visitorMaterial: material(`late-${i}`), networkMaterial: network(`late64-${i % 10}`), wideNetworkMaterial: wide }),
      ),
    );
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(360);
    expect(statuses.slice(0, 360).every((status) => status === "recorded")).toBe(true);
    expect(statuses.slice(360).every((status) => status === "rate_limited")).toBe(true);
    const counters = await windows(alpha);
    expect(counters.find((window) => window.bucket === "*")?.hits).toBe(960);
    expect(counters.filter((window) => window.bucket.startsWith("w:")).map((window) => window.hits)).toEqual([360]);
    // Each /64 saw 100 requests, under its 120 floor, so every /64 check passed and the /48 check said no.
    expect(counters.filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual(Array(10).fill(100));
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "network", dropped: 640 }]);
  });

  it("holds a /48 to its 120 floor once the rest of the club has used 1,080 or more", async () => {
    await setClubCounter(alpha, 1080);
    const wide = material("wide-full");
    const statuses = await recordMany(
      alpha,
      Array.from({ length: 130 }, (_, i) =>
        event({ visitorMaterial: material(`full-${i}`), networkMaterial: network(`full64-${i % 10}`), wideNetworkMaterial: wide }),
      ),
    );
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(120);
    expect(statuses.slice(120).every((status) => status === "rate_limited")).toBe(true);
    expect((await windows(alpha)).find((window) => window.bucket === "*")?.hits).toBe(1200);
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "network", dropped: 10 }]);
  });

  it("does not spend a /48's counter on events its own /64 already limited", async () => {
    // At a club count of 1,080 a network is held to its 120 floor, so its own /64 check says no from event 121 on.
    await setClubCounter(alpha, 1080);
    const statuses = await recordMany(
      alpha,
      manyVisitors("single64", 125, { networkMaterial: network("single64"), wideNetworkMaterial: material("wide-single64") }),
    );
    expect(statuses.filter((status) => status === "recorded")).toHaveLength(120);
    const counters = await windows(alpha);
    expect(counters.filter((window) => window.bucket.startsWith("n:")).map((window) => window.hits)).toEqual([120]);
    expect(counters.filter((window) => window.bucket.startsWith("w:")).map((window) => window.hits)).toEqual([120]);
  });

  it("counts every limited event by reason, on the club's own day, and only after the add-on gate", async () => {
    const day = await clubDay(alpha);
    // visitor: one visitor sends 63 events, 3 over its 60 a minute.
    const visitor = await recordMany(alpha, Array.from({ length: 63 }, (_, i) => event({ path: `/news/n${i}` })));
    expect(visitor.filter((status) => status === "rate_limited")).toHaveLength(3);
    expect(await dropCounts(alpha)).toEqual([{ local_date: day, reason: "visitor", dropped: 3 }]);

    // network: the rest of the club has used 1,080, so one network is held to its 120 floor and sends 122 events, 2 over it.
    await setClubCounter(alpha, 1080);
    const busy = await recordMany(alpha, manyVisitors("busy", 122, { networkMaterial: network("busy") }));
    expect(busy.filter((status) => status === "rate_limited")).toHaveLength(2);

    // club: the club counter is at its cap, so a brand-new visitor on a brand-new network is dropped.
    await setClubCounter(alpha, 1200);
    expect(await record(alpha, event({ visitorMaterial: material("late"), networkMaterial: network("late") }))).toBe("rate_limited");

    expect(await dropCounts(alpha)).toEqual([
      { local_date: day, reason: "club", dropped: 1 },
      { local_date: day, reason: "network", dropped: 2 },
      { local_date: day, reason: "visitor", dropped: 3 },
    ]);

    // Anything else that is turned away writes no drop count: bad signature, stale, not public, no add-on.
    expect(await callRecord(alpha, payloadText(event()), null)).toBe("bad_signature");
    expect(await record(alpha, event({ ts: 0 }))).toBe("stale");
    expect(await record(CLUB_IDS.bravo, event())).toBe("not_public");
    await revoke(CLUB_IDS.charlie);
    expect(await record(CLUB_IDS.charlie, event())).toBe("not_entitled");
    for (const club of [CLUB_IDS.bravo, CLUB_IDS.charlie]) expect(await dropCounts(club), club).toEqual([]);
    expect((await dropCounts(alpha)).reduce((sum, row) => sum + row.dropped, 0)).toBe(6);
  });

  it("keeps drop counts when the add-on is removed, because they hold no visitor data", async () => {
    await setClubCounter(alpha, 1200);
    expect(await record(alpha, event())).toBe("rate_limited");
    await revoke(alpha);
    expect(await traces(alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
    expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "club", dropped: 1 }]);
  });

  it("keeps drop counts out of browser roles' reach and constrains what they can hold", async () => {
    const { rows: security } = await db.query("select relrowsecurity from pg_class where oid = 'onzio_private.page_event_drop_counts'::regclass");
    expect(security[0].relrowsecurity).toBe(true);
    for (const actor of [asAnon, () => asUser(USER_IDS.ownerAal2)]) {
      await actor();
      await rejects(() => db.query("select * from onzio_private.page_event_drop_counts"), { code: "42501" });
      await actor();
      await rejects(
        () => db.query("insert into onzio_private.page_event_drop_counts (club_id, local_date, reason, dropped) values ($1, current_date, 'club', 1)", [alpha]),
        { code: "42501" },
      );
    }
    const insertDrop = (club: string, reason: string, dropped: number) =>
      db.query("insert into onzio_private.page_event_drop_counts (club_id, local_date, reason, dropped) values ($1, current_date, $2, $3)", [club, reason, dropped]);
    await asOwner();
    await insertDrop(alpha, "network", 1);
    await rejects(() => insertDrop(alpha, "network", 1), { code: "23505" });
    await rejects(() => insertDrop(alpha, "abuse", 1), { code: "23514" });
    await rejects(() => insertDrop(alpha, "club", 0), { code: "23514" });
    await rejects(() => insertDrop(alpha, "club", -1), { code: "23514" });
    await rejects(() => insertDrop(randomUUID(), "club", 1), { code: "23503" });
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
    await analyzePageEvents();
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
  }, 60_000);

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

describe("onzio.sweep_page_telemetry (the daily retention cron)", () => {
  const UTC_TODAY = "(now() at time zone 'UTC')::date";

  async function saltAges(clubId: string): Promise<number[]> {
    await asOwner();
    const { rows: ages } = await db.query(
      `select (${UTC_TODAY} - salt_day)::int as age from onzio_private.page_visitor_salts where club_id = $1 order by 1`,
      [clubId],
    );
    return ages.map((row) => row.age);
  }

  async function addSalt(clubId: string, daysBeforeUtcToday: number): Promise<void> {
    await asOwner();
    await db.query(
      `insert into onzio_private.page_visitor_salts (club_id, salt_day, salt) values ($1, ${UTC_TODAY} - $2::int, decode(repeat('ab', 32), 'hex'))`,
      [clubId, daysBeforeUtcToday],
    );
  }

  async function addWindow(clubId: string, minutesAgo: number, hits = 5): Promise<void> {
    await asOwner();
    await db.query(
      "insert into onzio_private.page_event_rate_windows (club_id, bucket, window_start, hits) values ($1, '*', date_trunc('minute', now()) - make_interval(mins => $2::int), $3)",
      [clubId, minutesAgo, hits],
    );
  }

  /** How old, in whole minutes, each of a club's counters is. */
  async function windowAges(clubId: string): Promise<number[]> {
    await asOwner();
    const { rows: ages } = await db.query(
      "select (extract(epoch from (date_trunc('minute', now()) - window_start)) / 60)::int as age from onzio_private.page_event_rate_windows where club_id = $1 order by 1",
      [clubId],
    );
    return ages.map((row) => row.age);
  }

  async function addDrop(clubId: string, daysBeforeUtcToday: number, reason: string): Promise<void> {
    await asOwner();
    await db.query(
      `insert into onzio_private.page_event_drop_counts (club_id, local_date, reason, dropped) values ($1, ${UTC_TODAY} - $2::int, $3, 4)`,
      [clubId, daysBeforeUtcToday, reason],
    );
  }

  /** What the sweep should delete right now, across every club, from the database's own point of view. */
  async function expired() {
    await asOwner();
    const { rows: counts } = await db.query(
      `select (select count(*)::int from onzio.page_events where occurred_at < now() - interval '90 days') as events,
              (select count(*)::int from onzio_private.page_visitor_salts where salt_day < ${UTC_TODAY} - 2) as salts,
              (select count(*)::int from onzio_private.page_event_rate_windows where window_start < now() - interval '1 hour') as windows,
              (select count(*)::int from onzio_private.page_event_drop_counts where local_date < ${UTC_TODAY} - 90) as drops`,
    );
    return counts[0] as { events: number; salts: number; windows: number; drops: number };
  }

  async function dropReasons(clubId: string): Promise<string[]> {
    return (await dropCounts(clubId)).map((row) => row.reason);
  }

  it("with no traffic at all, deletes a de-entitled club's expired events, old salts, old counters and old drop counts", async () => {
    await revoke(CLUB_IDS.charlie); // public, but without the add-on, so it can never record or sweep itself
    await rawEvent(CLUB_IDS.charlie, "91 days");
    await rawEvent(CLUB_IDS.charlie, "100 days");
    const charlieKept = await rawEvent(CLUB_IDS.charlie, "89 days");
    await rawEvent(CLUB_IDS.bravo, "120 days"); // not public at all
    const bravoKept = await rawEvent(CLUB_IDS.bravo, "10 days");
    await rawEvent(CLUB_IDS.alpha, "95 days"); // an entitled club that simply had no visitors today
    for (const age of [3, 2, 1, 0]) await addSalt(CLUB_IDS.charlie, age);
    for (const age of [30, 5]) await addSalt(CLUB_IDS.bravo, age);
    for (const minutes of [180, 61, 59, 0]) await addWindow(CLUB_IDS.charlie, minutes);
    await addDrop(CLUB_IDS.charlie, 91, "network");
    await addDrop(CLUB_IDS.charlie, 91, "visitor");
    await addDrop(CLUB_IDS.charlie, 90, "club");
    await addDrop(CLUB_IDS.charlie, 5, "network");
    await addDrop(CLUB_IDS.bravo, 200, "visitor");

    const before = await expired();
    expect(before.events).toBeGreaterThanOrEqual(4);
    expect(before.salts).toBeGreaterThanOrEqual(3);
    expect(before.windows).toBeGreaterThanOrEqual(2);
    expect(before.drops).toBeGreaterThanOrEqual(3);

    // No event was recorded in this test: the sweep ran on nothing but its own call.
    expect(await sweep()).toEqual({
      maxEvents: 100000,
      eventsDeleted: before.events,
      saltsDeleted: before.salts,
      rateWindowsDeleted: before.windows,
      dropCountsDeleted: before.drops,
      moreEventsRemain: false,
    });

    expect((await rows(CLUB_IDS.charlie)).map((row) => row.id)).toEqual([charlieKept]);
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).toEqual([bravoKept]);
    expect(await rows(CLUB_IDS.alpha)).toEqual([]);
    // Salts more than two UTC days old go; two days old and newer stay.
    expect(await saltAges(CLUB_IDS.charlie)).toEqual([0, 1, 2]);
    expect(await saltAges(CLUB_IDS.bravo)).toEqual([]);
    // Counters more than an hour old go; the current minute and one 59 minutes old stay.
    expect(await windowAges(CLUB_IDS.charlie)).toEqual([0, 59]);
    // Drop counts more than 90 days old go; 90 days and newer stay.
    expect(await dropReasons(CLUB_IDS.charlie)).toEqual(["club", "network"]);
    expect(await dropReasons(CLUB_IDS.bravo)).toEqual([]);
    expect(await expired()).toEqual({ events: 0, salts: 0, windows: 0, drops: 0 });
  });

  it("changes nothing when nothing has expired, and a second run deletes nothing", async () => {
    await rawEvent(CLUB_IDS.alpha, "89 days");
    await addSalt(CLUB_IDS.alpha, 1);
    await addWindow(CLUB_IDS.alpha, 30);
    await addDrop(CLUB_IDS.alpha, 10, "club");
    await sweep();
    const afterFirst = { events: (await rows(CLUB_IDS.alpha)).length, salts: await saltAges(CLUB_IDS.alpha), windows: await windowAges(CLUB_IDS.alpha), drops: await dropReasons(CLUB_IDS.alpha) };
    expect(afterFirst).toEqual({ events: 1, salts: [1], windows: [30], drops: ["club"] });
    expect(await sweep()).toEqual({
      maxEvents: 100000,
      eventsDeleted: 0,
      saltsDeleted: 0,
      rateWindowsDeleted: 0,
      dropCountsDeleted: 0,
      moreEventsRemain: false,
    });
  });

  it("deletes at most p_max_events, in batches, oldest first, and reports that more remain", async () => {
    await asOwner();
    await db.query(
      `insert into onzio.page_events (club_id, occurred_at, local_date, event_type, visitor_hash, visit_id, is_entry, path, source_type, device)
       select $1, now() - interval '100 days' - make_interval(secs => g), (now() - interval '100 days')::date, 'view', repeat('c', 64), gen_random_uuid(), true, '/', 'direct', 'desktop'
       from generate_series(1, 12000) as g`,
      [CLUB_IDS.bravo],
    );
    await analyzePageEvents();
    const oldest = await rawEvent(CLUB_IDS.bravo, "3650 days");
    const kept = await rawEvent(CLUB_IDS.bravo, "89 days");
    const total = (await expired()).events;
    expect(total).toBeGreaterThanOrEqual(12001);

    // One row: the oldest of all goes first.
    expect(await sweep(1)).toMatchObject({ maxEvents: 1, eventsDeleted: 1, moreEventsRemain: true });
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).not.toContain(oldest);
    expect((await expired()).events).toBe(total - 1);

    // A bound that is not a multiple of the 5,000-row batch is still respected exactly.
    expect(await sweep(7500)).toMatchObject({ maxEvents: 7500, eventsDeleted: 7500, moreEventsRemain: true });
    expect((await expired()).events).toBe(total - 7501);

    // Zero deletes no events but still reports the backlog.
    expect(await sweep(0)).toMatchObject({ eventsDeleted: 0, moreEventsRemain: true });
    expect((await expired()).events).toBe(total - 7501);

    // A large bound finishes the job in one call and says nothing remains.
    expect(await sweep(1_000_000)).toMatchObject({ eventsDeleted: total - 7501, moreEventsRemain: false });
    expect((await expired()).events).toBe(0);
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).toEqual([kept]);
  });

  it("refuses a negative or missing bound", async () => {
    for (const bad of [-1, null]) {
      await rejects(() => sweep(bad), { code: "22023", message: "INVALID_SWEEP_LIMIT" });
    }
  });

  it("does not depend on, or interfere with, the sweep inside record_page_event", async () => {
    await rawEvent(CLUB_IDS.bravo, "100 days");
    // The cron removes it with no traffic; a later accepted event finds nothing left and records normally.
    await sweep();
    expect(await rows(CLUB_IDS.bravo)).toEqual([]);
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
    const stale = await rawEvent(CLUB_IDS.bravo, "100 days");
    await nextMinute(CLUB_IDS.alpha);
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("visitor-b") }))).toBe("recorded");
    expect((await rows(CLUB_IDS.bravo)).map((row) => row.id)).not.toContain(stale);
  });

  it("can be executed by the service role only: not by anon, signed-in users or public", async () => {
    for (const fn of ["onzio.sweep_page_telemetry(integer)", "onzio_private.sweep_page_telemetry(integer)"]) {
      const { rows: grants } = await db.query(
        `select has_function_privilege('anon', $1, 'execute') as anon,
                has_function_privilege('authenticated', $1, 'execute') as authenticated,
                has_function_privilege('service_role', $1, 'execute') as service_role`,
        [fn],
      );
      expect(grants[0], fn).toEqual({ anon: false, authenticated: false, service_role: true });
      // No PUBLIC entry (an aclitem with an empty grantee), which would make it executable by every role.
      const { rows: acl } = await db.query("select array_to_string(proacl, ',') as acl from pg_proc where oid = $1::regprocedure", [fn]);
      expect(acl[0].acl, fn).not.toBeNull();
      expect(acl[0].acl, fn).not.toMatch(/(^|,)=X\//);
    }
    for (const actor of [asAnon, () => asUser(USER_IDS.ownerAal2)]) {
      await actor();
      await rejects(() => db.query("select onzio.sweep_page_telemetry(1)"), { code: "42501" });
      await actor();
      await rejects(() => db.query("select onzio_private.sweep_page_telemetry(1)"), { code: "42501" });
    }
    // The service role can, and the call is the exposed wrapper the cron uses.
    expect(await sweep(0)).toMatchObject({ maxEvents: 0, eventsDeleted: 0 });
    await asService();
    expect((await db.query("select onzio_private.sweep_page_telemetry(0) as result")).rows[0].result).toMatchObject({ maxEvents: 0 });
    await asOwner();
  });

  it("is a security-definer function with an empty search path, behind a security-invoker wrapper", async () => {
    const { rows: functions } = await db.query(
      `select n.nspname, p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'sweep_page_telemetry' order by n.nspname`,
    );
    // PostgreSQL stores `set search_path = ''` in proconfig as search_path="" (the empty value quoted).
    const emptyPath = (config: string[] | null) => (config ?? []).some((entry) => /^search_path=(""|)$/.test(entry));
    expect(functions.map((fn) => [fn.nspname, fn.prosecdef, emptyPath(fn.proconfig)])).toEqual([
      ["onzio", false, true],
      ["onzio_private", true, true],
    ]);
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

  it.skipIf(!hasOperatorSql)("records Rose City normally once the operator SQL turns it on, and a rerun is a no-op with one audit event", async () => {
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

  it.skipIf(!hasOperatorSql)("leaves nothing behind after the rehearsal", async () => {
    await roseCityClub();
    const rehearsed = await runOperatorSql("rehearsal");
    expect(rehearsed).toMatchObject({ result: "changed: telemetry off -> on", telemetry_enabled: true, all_ok: true });
    expect(await hasTelemetry(ROSE_CITY_CLUB_ID)).toBe(false);
    expect(await auditRows(ROSE_CITY_CLUB_ID)).toEqual([]);
    expect(await record(ROSE_CITY_CLUB_ID, event())).toBe("not_entitled");
  });

  it.skipIf(!hasOperatorSql)("refuses to run when Rose City is missing or archived", async () => {
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

// TELEMETRY-02: logo_seen, click and heartbeat events.
async function seedSponsors(clubId: string, n: number): Promise<string[]> {
  await asOwner();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { rows: inserted } = await db.query(
      "insert into onzio.site_sponsor_logos (club_id, name, logo_url) values ($1, $2, '/s.png') returning id::text",
      [clubId, `Sponsor ${i}-${randomUUID().slice(0, 6)}`],
    );
    ids.push(inserted[0].id);
  }
  return ids;
}

async function sponsorRows(clubId: string) {
  await asOwner();
  return (
    await db.query(
      `select event_type, sponsor_id::text, engaged_ms, visit_id::text, is_entry, occurred_at::text, local_date::text, path, device
       from onzio.page_events where club_id = $1 order by id`,
      [clubId],
    )
  ).rows;
}

const INVALID = { code: "22023", message: "INVALID_PAGE_EVENT" };

describe("telemetry sponsor and engagement events", () => {
  it("writes one logo_seen row per sponsor sharing the visit, and spends one hit of each cap", async () => {
    const ids = await seedSponsors(CLUB_IDS.alpha, 3);
    expect(await record(CLUB_IDS.alpha, event({ type: "logo_seen", sponsorIds: ids }))).toBe("recorded");

    const written = await sponsorRows(CLUB_IDS.alpha);
    expect(written).toHaveLength(3);
    expect(new Set(written.map((row) => row.sponsor_id))).toEqual(new Set(ids));
    expect(new Set(written.map((row) => row.visit_id)).size).toBe(1);
    expect(new Set(written.map((row) => row.occurred_at)).size).toBe(1);
    expect(new Set(written.map((row) => row.local_date)).size).toBe(1);
    expect(written.every((row) => row.event_type === "logo_seen" && row.is_entry === false && row.engaged_ms === null)).toBe(true);

    const used = await windows(CLUB_IDS.alpha);
    expect(used).toHaveLength(3); // visitor, network, club-wide
    expect(used.every((row) => row.hits === 1)).toBe(true);
    expect(used.map((row) => row.bucket).filter((bucket) => bucket === "*" || bucket.startsWith("n:"))).toHaveLength(2);
  });

  it("spends one hit of the visitor, network and club windows for a click, and only the visitor, 'hn:' and 'h:*' windows for a heartbeat", async () => {
    const [sponsor] = await seedSponsors(CLUB_IDS.alpha, 1);
    expect(await record(CLUB_IDS.alpha, event({ type: "click", sponsorId: sponsor }))).toBe("recorded");
    let used = await windows(CLUB_IDS.alpha);
    expect(used).toHaveLength(3);
    expect(used.every((row) => row.hits === 1)).toBe(true);

    // A heartbeat needs an open visit that began with a view.
    await nextMinute(CLUB_IDS.alpha);
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
    await nextMinute(CLUB_IDS.alpha);
    expect(await record(CLUB_IDS.alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("recorded");
    used = await windows(CLUB_IDS.alpha);
    expect(used).toHaveLength(3); // visitor, heartbeat network, club-wide heartbeat
    expect(used.every((row) => row.hits === 1)).toBe(true);
    expect(used.some((row) => row.bucket === "h:*")).toBe(true);
    expect(used.some((row) => row.bucket.startsWith("hn:"))).toBe(true);
    expect(used.some((row) => row.bucket === "*" || row.bucket.startsWith("n:") || row.bucket.startsWith("w:"))).toBe(false);
  });

  describe("heartbeat budget", () => {
    const alpha = CLUB_IDS.alpha;

    async function setCounter(bucket: string, hits: number): Promise<void> {
      await asOwner();
      await db.query(
        `insert into onzio_private.page_event_rate_windows (club_id, bucket, window_start, hits)
         values ($1, $2, date_trunc('minute', now()), $3)
         on conflict (club_id, bucket, window_start) do update set hits = excluded.hits`,
        [alpha, bucket, hits],
      );
    }

    it("records a heartbeat while the club's view counter is full, and still drops a view", async () => {
      expect(await record(alpha, event())).toBe("recorded");
      await setClubCounter(alpha, 1200);
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("recorded");
      expect(await record(alpha, event({ visitorMaterial: material("late-viewer") }))).toBe("rate_limited");
      expect((await windows(alpha)).find((row) => row.bucket === "*")?.hits).toBe(1200);
    });

    it("drops a heartbeat at 6,000 without an event, counts it under 'heartbeat', and still records a view", async () => {
      expect(await record(alpha, event())).toBe("recorded");
      await setCounter("h:*", 6000);
      const before = (await rows(alpha)).length;
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("rate_limited");
      expect(await rows(alpha)).toHaveLength(before);
      expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "heartbeat", dropped: 1 }]);
      expect((await windows(alpha)).find((row) => row.bucket === "h:*")?.hits).toBe(6000);
      expect(await record(alpha, event({ visitorMaterial: material("viewer-after") }))).toBe("recorded");
    });

    it("records a heartbeat from a network whose view budget is used up", async () => {
      const crowded = material("network-crowded");
      await setClubCounter(alpha, 1080);
      const statuses = await recordMany(alpha, manyVisitors("crowd", 130, { networkMaterial: crowded }));
      expect(statuses.filter((status) => status === "recorded")).toHaveLength(120);
      expect(statuses[129]).toBe("rate_limited");
      expect(
        await record(alpha, event({ type: "heartbeat", engagedMs: 5000, visitorMaterial: material("crowd-0"), networkMaterial: crowded })),
      ).toBe("recorded");
      expect(
        await record(alpha, event({ type: "heartbeat", engagedMs: 5000, visitorMaterial: material("crowd-1"), networkMaterial: crowded })),
      ).toBe("recorded");
    });

    it("still respects the shared per-visitor cap, counting the drop under 'heartbeat'", async () => {
      const visitor = material("busy-reader");
      expect(await record(alpha, event({ visitorMaterial: visitor }))).toBe("recorded");
      await nextMinute(alpha);
      const statuses = await recordMany(
        alpha,
        Array.from({ length: 61 }, () => event({ type: "heartbeat", engagedMs: 5000, visitorMaterial: visitor })),
      );
      expect(statuses.filter((status) => status === "recorded")).toHaveLength(60);
      expect(statuses[60]).toBe("rate_limited");
      expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "heartbeat", dropped: 1 }]);
      expect((await windows(alpha)).find((row) => row.bucket === "h:*")?.hits).toBe(60);
    });

    /** The 'hn:' bucket the writer uses for a network (salted, so read the day's salt). */
    async function hnBucket(networkMaterial: string): Promise<string> {
      await asOwner();
      const { rows: found } = await db.query(
        `select 'hn:' || encode(sha256(salt || convert_to($2, 'UTF8')), 'hex') as bucket
         from onzio_private.page_visitor_salts where club_id = $1`,
        [alpha, networkMaterial],
      );
      expect(found).toHaveLength(1);
      return found[0].bucket;
    }

    it("drops a heartbeat when its network is at 1,200, counts it, and still records a view from that network", async () => {
      expect(await record(alpha, event())).toBe("recorded");
      await setCounter(await hnBucket(material("network-a")), 1200);
      const before = (await rows(alpha)).length;
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("rate_limited");
      expect(await rows(alpha)).toHaveLength(before);
      expect(await dropCounts(alpha)).toEqual([{ local_date: await clubDay(alpha), reason: "heartbeat", dropped: 1 }]);
      expect(await record(alpha, event({ visitorMaterial: material("other-viewer") }))).toBe("recorded");
    });

    it("keys the heartbeat network cap on the IPv6 /48 when there is one", async () => {
      const wide = material("wide-a");
      expect(await record(alpha, event({ wideNetworkMaterial: wide }))).toBe("recorded");
      await setCounter(await hnBucket(wide), 1200);
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000, wideNetworkMaterial: wide }))).toBe("rate_limited");
      expect((await dropCounts(alpha)).map((row) => [row.reason, row.dropped])).toEqual([["heartbeat", 1]]);
    });
  });

  describe("heartbeat open-visit gate", () => {
    const alpha = CLUB_IDS.alpha;

    async function shiftEvents(minutes: number): Promise<void> {
      await asOwner();
      await db.query("update onzio.page_events set occurred_at = occurred_at - make_interval(mins => $2) where club_id = $1", [alpha, minutes]);
    }

    it("answers no_visit and writes nothing when the club has no salt today", async () => {
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("no_visit");
      expect(await traces(alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
      expect(await dropCounts(alpha)).toEqual([]);
    });

    it("answers no_visit and writes nothing for a visitor without an open visit (a rotated user agent)", async () => {
      expect(await record(alpha, event())).toBe("recorded");
      const before = await traces(alpha);
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000, visitorMaterial: material("rotated-agent") }))).toBe("no_visit");
      expect(await traces(alpha)).toEqual(before);
      expect(await dropCounts(alpha)).toEqual([]);
    });

    it("answers no_visit when the open visit holds only logo_seen or click rows", async () => {
      const [sponsor] = await seedSponsors(alpha, 1);
      expect(await record(alpha, event({ type: "click", sponsorId: sponsor }))).toBe("recorded");
      expect(await record(alpha, event({ type: "logo_seen", sponsorIds: [sponsor] }))).toBe("recorded");
      const before = await traces(alpha);
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("no_visit");
      expect(await traces(alpha)).toEqual(before);
      expect(await dropCounts(alpha)).toEqual([]);
    });

    it("records no fake visitors from one network rotating its user agent, and the totals do not move", async () => {
      expect(await record(alpha, event())).toBe("recorded");
      const before = await traces(alpha);
      const statuses = await recordMany(
        alpha,
        Array.from({ length: 1300 }, (_, i) => event({ type: "heartbeat", engagedMs: 5000, visitorMaterial: material(`fake-${i}`) })),
      );
      expect(statuses.filter((status) => status !== "no_visit")).toHaveLength(0);
      expect(await traces(alpha)).toEqual(before);
      expect(new Set((await rows(alpha)).map((row) => row.visitor_hash)).size).toBe(1);
      expect(await dropCounts(alpha)).toEqual([]);
    });

    it("keeps a visit open for 29 minutes and closes it after 31 with no other event", async () => {
      expect(await record(alpha, event())).toBe("recorded");
      await shiftEvents(29);
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("recorded");
      await shiftEvents(31);
      const before = await traces(alpha);
      expect(await record(alpha, event({ type: "heartbeat", engagedMs: 5000 }))).toBe("no_visit");
      expect(await traces(alpha)).toEqual(before);
    });
  });

  it("drops unknown and other-club sponsor ids from a logo_seen write", async () => {
    const own = await seedSponsors(CLUB_IDS.alpha, 2);
    const [foreign] = await seedSponsors(CLUB_IDS.charlie, 1);
    const status = await record(CLUB_IDS.alpha, event({ type: "logo_seen", sponsorIds: [own[0], randomUUID(), foreign, own[1]] }));
    expect(status).toBe("recorded");
    const written = await sponsorRows(CLUB_IDS.alpha);
    expect(written.map((row) => row.sponsor_id).sort()).toEqual([...own].sort());
    expect((await windows(CLUB_IDS.alpha)).every((row) => row.hits === 1)).toBe(true);
  });

  it("returns unknown_sponsor and writes nothing when no sponsor belongs to the club", async () => {
    const [foreign] = await seedSponsors(CLUB_IDS.charlie, 1);
    const before = await traces(CLUB_IDS.alpha);
    expect(await record(CLUB_IDS.alpha, event({ type: "logo_seen", sponsorIds: [randomUUID(), foreign] }))).toBe("unknown_sponsor");
    expect(await record(CLUB_IDS.alpha, event({ type: "click", sponsorId: foreign }))).toBe("unknown_sponsor");
    expect(await traces(CLUB_IDS.alpha)).toEqual(before);
    expect(before).toEqual({ events: 0, salts: 0, windows: 0 });
    expect(await dropCounts(CLUB_IDS.alpha)).toEqual([]);
  });

  it("writes a click with its sponsor id and no entry flag when there is no open visit", async () => {
    const [sponsor] = await seedSponsors(CLUB_IDS.alpha, 1);
    expect(await record(CLUB_IDS.alpha, event({ type: "click", sponsorId: sponsor.toUpperCase() }))).toBe("recorded");
    const written = await sponsorRows(CLUB_IDS.alpha);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ event_type: "click", sponsor_id: sponsor, is_entry: false, engaged_ms: null });
  });

  it("accepts heartbeats of 1000 and 60000 ms and rejects the rest", async () => {
    expect(await record(CLUB_IDS.alpha, event())).toBe("recorded");
    expect(await record(CLUB_IDS.alpha, event({ type: "heartbeat", engagedMs: 1000 }))).toBe("recorded");
    expect(await record(CLUB_IDS.alpha, event({ type: "heartbeat", engagedMs: 60000 }))).toBe("recorded");
    const written = await sponsorRows(CLUB_IDS.alpha);
    expect(written.map((row) => row.engaged_ms)).toEqual([null, 1000, 60000]);
    expect(written.every((row) => row.sponsor_id === null)).toBe(true);
    expect(written.map((row) => row.is_entry)).toEqual([true, false, false]);
    expect(new Set(written.map((row) => row.visit_id)).size).toBe(1);
    for (const engagedMs of [999, 60001, 1500.5, 0, -1000, "5000", null, true]) {
      await rejects(() => record(CLUB_IDS.alpha, event({ type: "heartbeat", engagedMs })), INVALID);
    }
    await rejects(() => record(CLUB_IDS.alpha, event({ type: "heartbeat" })), INVALID);
  });

  it("rejects key and type mismatches as INVALID_PAGE_EVENT", async () => {
    const [sponsor] = await seedSponsors(CLUB_IDS.alpha, 1);
    const eleven = Array.from({ length: 11 }, () => randomUUID());
    const cases: Event[] = [
      event({ type: "view", sponsorIds: [sponsor] }),
      event({ type: "view", sponsorId: sponsor }),
      event({ type: "view", engagedMs: 5000 }),
      event({ type: "view", sponsorIds: null }),
      event({ type: "click", sponsorId: sponsor, engagedMs: 5000 }),
      event({ type: "click", sponsorId: sponsor, sponsorIds: [sponsor] }),
      event({ type: "click" }),
      event({ type: "click", sponsorId: null }),
      event({ type: "click", sponsorId: "not-a-uuid" }),
      event({ type: "click", sponsorId: 5 }),
      event({ type: "logo_seen", sponsorId: sponsor, sponsorIds: [sponsor] }),
      event({ type: "logo_seen", sponsorId: sponsor }),
      event({ type: "logo_seen", sponsorIds: [sponsor], engagedMs: 5000 }),
      event({ type: "logo_seen" }),
      event({ type: "logo_seen", sponsorIds: [] }),
      event({ type: "logo_seen", sponsorIds: eleven }),
      event({ type: "logo_seen", sponsorIds: [sponsor, sponsor] }),
      event({ type: "logo_seen", sponsorIds: [sponsor, sponsor.toUpperCase()] }),
      event({ type: "logo_seen", sponsorIds: ["not-a-uuid"] }),
      event({ type: "logo_seen", sponsorIds: [sponsor, 5] }),
      event({ type: "logo_seen", sponsorIds: [null] }),
      event({ type: "logo_seen", sponsorIds: sponsor }),
      event({ type: "logo_seen", sponsorIds: { id: sponsor } }),
      event({ type: "logo_seen", sponsorIds: 5 }),
      event({ type: "logo_seen", sponsorIds: null }),
      event({ type: "heartbeat", engagedMs: 5000, sponsorId: sponsor }),
      event({ type: "heartbeat", engagedMs: 5000, sponsorIds: [sponsor] }),
      event({ type: "heartbeat", engagedMs: "5000" }),
      event({ type: "view", sponsorIds: "x" }),
    ];
    for (const payload of cases) {
      await rejects(() => record(CLUB_IDS.alpha, payload), INVALID);
    }
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
    // Ten distinct ids is the largest accepted array.
    const ten = await seedSponsors(CLUB_IDS.alpha, 10);
    expect(await record(CLUB_IDS.alpha, event({ type: "logo_seen", sponsorIds: ten }))).toBe("recorded");
    expect(await sponsorRows(CLUB_IDS.alpha)).toHaveLength(10);
  });

  it("answers bad_signature for a forged signature on each new type", async () => {
    const [sponsor] = await seedSponsors(CLUB_IDS.alpha, 1);
    const payloads = [
      event({ type: "logo_seen", sponsorIds: [sponsor] }),
      event({ type: "click", sponsorId: sponsor }),
      event({ type: "heartbeat", engagedMs: 5000 }),
    ];
    for (const payload of payloads) {
      const text = payloadText(payload);
      expect(await callRecord(CLUB_IDS.alpha, text, signPayload(CLUB_IDS.alpha, text, "ab".repeat(32)))).toBe("bad_signature");
      expect(await callRecord(CLUB_IDS.alpha, text, "0".repeat(64))).toBe("bad_signature");
    }
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
  });

  it("answers not_entitled and writes nothing for each new type when the club lacks the add-on", async () => {
    const [sponsor] = await seedSponsors(CLUB_IDS.alpha, 1);
    await revoke(CLUB_IDS.alpha);
    for (const payload of [
      event({ type: "logo_seen", sponsorIds: [sponsor] }),
      event({ type: "click", sponsorId: sponsor }),
      event({ type: "heartbeat", engagedMs: 5000 }),
    ]) {
      expect(await record(CLUB_IDS.alpha, payload)).toBe("not_entitled");
    }
    expect(await traces(CLUB_IDS.alpha)).toEqual({ events: 0, salts: 0, windows: 0 });
  });

  it("puts a heartbeat in the visit its view opened, and it is never an entry", async () => {
    expect(await record(CLUB_IDS.alpha, event({ type: "view" }))).toBe("recorded");
    expect(await record(CLUB_IDS.alpha, event({ type: "heartbeat", engagedMs: 3000 }))).toBe("recorded");
    const written = await sponsorRows(CLUB_IDS.alpha);
    expect(written.map((row) => [row.event_type, row.is_entry])).toEqual([
      ["view", true],
      ["heartbeat", false],
    ]);
    expect(new Set(written.map((row) => row.visit_id)).size).toBe(1);
  });
});
