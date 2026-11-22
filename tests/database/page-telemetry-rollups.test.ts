import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";

// TELEMETRY-02: onzio.rollup_page_telemetry and the three rollup tables. Each test runs in a
// transaction that is rolled back. Raw events are seeded directly as the owner role (the writer is
// covered by page-telemetry.test.ts), with local_date set from the club's own clock.

let db: Client;
let today: string;

function hash(seed: string): string {
  return createHash("sha256").update(`rollup:${seed}`).digest("hex");
}

async function asOwner(): Promise<void> {
  await db.query("reset role");
}
async function asAnon(): Promise<void> {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', '', true)");
  await db.query("set local role anon");
}
async function asService(): Promise<void> {
  await db.query("reset role");
  await db.query("set local role service_role");
}
async function asUser(userId: string): Promise<void> {
  await db.query("reset role");
  const timestamp = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] }),
  ]);
  await db.query("set local role authenticated");
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

async function clubToday(clubId: string): Promise<string> {
  await asOwner();
  return (await db.query("select (now() at time zone time_zone)::date::text as day from onzio.clubs where id = $1", [clubId])).rows[0].day;
}

type Seed = {
  ago?: number; // club-local days before today
  mins?: number; // minutes before now (orders events within a day)
  type?: "view" | "logo_seen" | "click" | "heartbeat";
  visitor: string;
  visit: string;
  entry?: boolean;
  path?: string;
  source?: string;
  device?: string;
  country?: string | null;
  city?: string | null;
  ref?: string | null;
  utmC?: string | null;
  utmS?: string | null;
  staff?: boolean;
  sponsor?: string | null;
  engaged?: number | null;
};

async function seed(clubId: string, base: string, o: Seed): Promise<void> {
  await asOwner();
  await db.query(
    `insert into onzio.page_events (club_id, occurred_at, local_date, event_type, visitor_hash, visit_id, is_entry,
        path, referrer_host, source_type, utm_campaign, utm_source, device, country, city, is_staff, sponsor_id, engaged_ms)
     values ($1, now() - ($2::int * interval '1 minute'), $3::date - $4::int, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      clubId, o.mins ?? 0, base, o.ago ?? 0, o.type ?? "view", hash(o.visitor), o.visit, o.entry ?? false,
      o.path ?? "/", o.ref ?? null, o.source ?? "direct", o.utmC ?? null, o.utmS ?? null, o.device ?? "mobile",
      o.country === undefined ? "US" : o.country, o.city === undefined ? "Portland" : o.city,
      o.staff ?? false, o.sponsor ?? null, o.engaged ?? null,
    ],
  );
}

async function drops(clubId: string, base: string, ago: number, reason: string, n: number): Promise<void> {
  await asOwner();
  await db.query(
    "insert into onzio_private.page_event_drop_counts (club_id, local_date, reason, dropped) values ($1, $2::date - $3::int, $4, $5)",
    [clubId, base, ago, reason, n],
  );
}

async function rollup(days?: number | null): Promise<{ clubs: number; days: number; rowsWritten: number }> {
  await asService();
  const { rows } =
    days === undefined
      ? await db.query("select onzio.rollup_page_telemetry() as result")
      : await db.query("select onzio.rollup_page_telemetry($1::integer) as result", [days]);
  await asOwner();
  return rows[0].result;
}

async function totals(clubId: string) {
  await asOwner();
  return (
    await db.query(
      `select local_date::text, views, visitors, visits, entries, engaged_ms::int as engaged_ms, engaged_views, dropped, dropped_heartbeats
       from onzio.page_daily_totals where club_id = $1 order by local_date`,
      [clubId],
    )
  ).rows;
}
async function breakdowns(clubId: string, date: string) {
  await asOwner();
  return (
    await db.query(
      `select dimension, value, views, visitors, engaged_ms::int as engaged_ms
       from onzio.page_daily_breakdowns where club_id = $1 and local_date = $2::date
       order by dimension collate "C", value collate "C"`,
      [clubId, date],
    )
  ).rows;
}
async function sponsors(clubId: string, date: string) {
  await asOwner();
  return (
    await db.query(
      `select sponsor_id::text, logo_views, logo_viewers, clicks
       from onzio.sponsor_daily_rollups where club_id = $1 and local_date = $2::date order by sponsor_id`,
      [clubId, date],
    )
  ).rows;
}
async function allRows(clubId: string) {
  await asOwner();
  return (
    await db.query(
      `select k, r from (
         select 't' as k, to_jsonb(t) - 'computed_at' as r from onzio.page_daily_totals t where club_id = $1
         union all select 'b', to_jsonb(b) from onzio.page_daily_breakdowns b where club_id = $1
         union all select 's', to_jsonb(s) from onzio.sponsor_daily_rollups s where club_id = $1
       ) u order by k, r::text`,
      [clubId],
    )
  ).rows;
}

const S1 = "00000000-0000-4000-8000-0000000000a1";
const S2 = "00000000-0000-4000-8000-0000000000a2";
const SC = "00000000-0000-4000-8000-0000000000c1";
const VA = randomUUID();
const VB = randomUUID();
const VC = randomUUID();
const VD = randomUUID();
const VS = randomUUID();
const VX = randomUUID();

/** Alpha: two local days of mixed events plus a staff visitor, drop counts on three days. Charlie: one day. */
async function seedAll(): Promise<void> {
  const a = CLUB_IDS.alpha;
  const b = today;
  await seed(a, b, { type: "view", visitor: "A", visit: VA, entry: true, mins: 30, path: "/schedule", source: "social", device: "mobile", country: "US", city: "Portland", ref: "instagram.com", utmC: "c1", utmS: "ig" });
  await seed(a, b, { type: "view", visitor: "A", visit: VA, mins: 20, path: "/roster", source: "direct", device: "mobile", country: "US", city: "Portland" });
  await seed(a, b, { type: "view", visitor: "B", visit: VB, entry: true, mins: 25, path: "/schedule", source: "search", device: "desktop", country: null, city: null, ref: "google.com" });
  // Heartbeats carry their own (different) fields; the ones with a view inherit the view's dimensions.
  const own = { source: "direct", device: "desktop", country: "GB", city: "London", ref: "own.example", utmC: "own", utmS: "own" };
  await seed(a, b, { type: "heartbeat", visitor: "A", visit: VA, mins: 28, path: "/schedule", engaged: 10000, ...own });
  await seed(a, b, { type: "heartbeat", visitor: "A", visit: VA, mins: 27, path: "/schedule", engaged: 5000, ...own });
  await seed(a, b, { type: "heartbeat", visitor: "B", visit: VB, mins: 24, path: "/schedule", engaged: 20000, ...own });
  // No view of this visit and path: uses its own fields.
  await seed(a, b, { type: "heartbeat", visitor: "C", visit: VC, mins: 10, path: "/orphan", engaged: 7000, source: "direct", device: "tablet", country: "CA", city: "Vancouver", ref: null });
  await seed(a, b, { type: "logo_seen", visitor: "A", visit: VA, mins: 15, sponsor: S1 });
  await seed(a, b, { type: "logo_seen", visitor: "A", visit: VA, mins: 15, sponsor: S2 });
  await seed(a, b, { type: "logo_seen", visitor: "B", visit: VB, mins: 14, sponsor: S1 });
  await seed(a, b, { type: "click", visitor: "A", visit: VA, mins: 13, sponsor: S1 });
  // Staff rows count nowhere.
  await seed(a, b, { type: "view", visitor: "S", visit: VS, entry: true, mins: 12, path: "/staffonly", staff: true });
  await seed(a, b, { type: "heartbeat", visitor: "S", visit: VS, mins: 11, path: "/staffonly", staff: true, engaged: 30000 });
  await seed(a, b, { type: "logo_seen", visitor: "S", visit: VS, mins: 11, sponsor: S1, staff: true });
  await seed(a, b, { type: "click", visitor: "S", visit: VS, mins: 10, sponsor: S2, staff: true });
  // Yesterday.
  await seed(a, b, { ago: 1, type: "view", visitor: "D", visit: VD, entry: true, mins: 60, path: "/schedule", source: "direct", device: "mobile" });
  await seed(a, b, { ago: 1, type: "logo_seen", visitor: "D", visit: VD, mins: 59, sponsor: S2 });
  await drops(a, b, 0, "network", 2);
  await drops(a, b, 0, "visitor", 1);
  await drops(a, b, 1, "club", 4);
  // A day with only heartbeat drops still gets a totals row, and they never count as dropped views.
  await drops(a, b, 2, "heartbeat", 3);
  await drops(a, b, 0, "heartbeat", 5);
  // Charlie.
  const c = CLUB_IDS.charlie;
  const cb = await clubToday(c);
  await seed(c, cb, { type: "view", visitor: "X", visit: VX, entry: true, mins: 5, path: "/charlie", source: "referral", device: "desktop", country: null, city: "Salem", ref: "news.example" });
  await seed(c, cb, { type: "heartbeat", visitor: "X", visit: VX, mins: 4, path: "/charlie", engaged: 2000, source: "direct", device: "mobile" });
  await seed(c, cb, { type: "logo_seen", visitor: "X", visit: VX, mins: 3, sponsor: SC });
}

const ALPHA_D0_BREAKDOWNS = [
  { dimension: "city", value: "Portland", views: 2, visitors: 1, engaged_ms: 15000 },
  { dimension: "city", value: "Vancouver", views: 0, visitors: 0, engaged_ms: 7000 },
  { dimension: "city", value: "unknown", views: 1, visitors: 1, engaged_ms: 20000 },
  { dimension: "country", value: "CA", views: 0, visitors: 0, engaged_ms: 7000 },
  { dimension: "country", value: "US", views: 2, visitors: 1, engaged_ms: 15000 },
  { dimension: "country", value: "unknown", views: 1, visitors: 1, engaged_ms: 20000 },
  { dimension: "device", value: "desktop", views: 1, visitors: 1, engaged_ms: 20000 },
  { dimension: "device", value: "mobile", views: 2, visitors: 1, engaged_ms: 15000 },
  { dimension: "device", value: "tablet", views: 0, visitors: 0, engaged_ms: 7000 },
  { dimension: "path", value: "/orphan", views: 0, visitors: 0, engaged_ms: 7000 },
  { dimension: "path", value: "/roster", views: 1, visitors: 1, engaged_ms: 0 },
  { dimension: "path", value: "/schedule", views: 2, visitors: 2, engaged_ms: 35000 },
  { dimension: "referrer", value: "google.com", views: 1, visitors: 1, engaged_ms: 20000 },
  { dimension: "referrer", value: "instagram.com", views: 1, visitors: 1, engaged_ms: 15000 },
  { dimension: "source", value: "direct", views: 1, visitors: 1, engaged_ms: 7000 },
  { dimension: "source", value: "search", views: 1, visitors: 1, engaged_ms: 20000 },
  { dimension: "source", value: "social", views: 1, visitors: 1, engaged_ms: 15000 },
  { dimension: "utm_campaign", value: "c1", views: 1, visitors: 1, engaged_ms: 15000 },
  { dimension: "utm_source", value: "ig", views: 1, visitors: 1, engaged_ms: 15000 },
];

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await db.query("begin");
  today = await clubToday(CLUB_IDS.alpha);
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("onzio.rollup_page_telemetry", () => {
  it("computes exact totals, breakdowns and sponsor rows, excluding staff events everywhere", async () => {
    await seedAll();
    const result = await rollup();
    expect(result.days).toBe(3);
    expect(result.clubs).toBeGreaterThanOrEqual(2);

    const dateOf = async (ago: number) =>
      (await db.query("select ($1::date - $2::int)::text as d", [today, ago])).rows[0].d as string;

    expect(await totals(CLUB_IDS.alpha)).toEqual([
      { local_date: await dateOf(2), views: 0, visitors: 0, visits: 0, entries: 0, engaged_ms: 0, engaged_views: 0, dropped: 0, dropped_heartbeats: 3 },
      { local_date: await dateOf(1), views: 1, visitors: 1, visits: 1, entries: 1, engaged_ms: 0, engaged_views: 0, dropped: 4, dropped_heartbeats: 0 },
      // visitors counts view rows only: heartbeat-only visitor C is not counted.
      { local_date: today, views: 3, visitors: 2, visits: 2, entries: 2, engaged_ms: 42000, engaged_views: 3, dropped: 3, dropped_heartbeats: 5 },
    ]);

    expect(await breakdowns(CLUB_IDS.alpha, today)).toEqual(ALPHA_D0_BREAKDOWNS);
    expect(await breakdowns(CLUB_IDS.alpha, await dateOf(1))).toEqual([
      { dimension: "city", value: "Portland", views: 1, visitors: 1, engaged_ms: 0 },
      { dimension: "country", value: "US", views: 1, visitors: 1, engaged_ms: 0 },
      { dimension: "device", value: "mobile", views: 1, visitors: 1, engaged_ms: 0 },
      { dimension: "path", value: "/schedule", views: 1, visitors: 1, engaged_ms: 0 },
      { dimension: "source", value: "direct", views: 1, visitors: 1, engaged_ms: 0 },
    ]);
    expect(await breakdowns(CLUB_IDS.alpha, await dateOf(2))).toEqual([]);

    expect(await sponsors(CLUB_IDS.alpha, today)).toEqual([
      { sponsor_id: S1, logo_views: 2, logo_viewers: 2, clicks: 1 },
      { sponsor_id: S2, logo_views: 1, logo_viewers: 1, clicks: 0 },
    ]);
    expect(await sponsors(CLUB_IDS.alpha, await dateOf(1))).toEqual([{ sponsor_id: S2, logo_views: 1, logo_viewers: 1, clicks: 0 }]);

    // Staff never appear anywhere.
    await asOwner();
    expect((await db.query("select 1 from onzio.page_daily_breakdowns where club_id = $1 and value = '/staffonly'", [CLUB_IDS.alpha])).rows).toEqual([]);

    // Charlie.
    const cb = await clubToday(CLUB_IDS.charlie);
    expect(await totals(CLUB_IDS.charlie)).toEqual([
      { local_date: cb, views: 1, visitors: 1, visits: 1, entries: 1, engaged_ms: 2000, engaged_views: 1, dropped: 0, dropped_heartbeats: 0 },
    ]);
    expect(await breakdowns(CLUB_IDS.charlie, cb)).toEqual([
      { dimension: "city", value: "Salem", views: 1, visitors: 1, engaged_ms: 2000 },
      { dimension: "country", value: "unknown", views: 1, visitors: 1, engaged_ms: 2000 },
      { dimension: "device", value: "desktop", views: 1, visitors: 1, engaged_ms: 2000 },
      { dimension: "path", value: "/charlie", views: 1, visitors: 1, engaged_ms: 2000 },
      { dimension: "referrer", value: "news.example", views: 1, visitors: 1, engaged_ms: 2000 },
      { dimension: "source", value: "referral", views: 1, visitors: 1, engaged_ms: 2000 },
    ]);
    expect(await sponsors(CLUB_IDS.charlie, cb)).toEqual([{ sponsor_id: SC, logo_views: 1, logo_viewers: 1, clicks: 0 }]);
  });

  it("counts visitors from view rows only, and keeps heartbeat drops apart from dropped", async () => {
    const c = CLUB_IDS.charlie;
    const cb = await clubToday(c);
    await seed(c, cb, { type: "view", visitor: "X", visit: VX, entry: true, mins: 5, path: "/charlie" });
    await seed(c, cb, { type: "heartbeat", visitor: "X", visit: VX, mins: 4, path: "/charlie", engaged: 2000 });
    await seed(c, cb, { type: "heartbeat", visitor: "Y", visit: randomUUID(), mins: 4, path: "/charlie", engaged: 3000 });
    await seed(c, cb, { type: "logo_seen", visitor: "W", visit: randomUUID(), mins: 3, sponsor: SC });
    await seed(c, cb, { type: "click", visitor: "V", visit: randomUUID(), mins: 3, sponsor: SC });
    await drops(c, cb, 0, "visitor", 2);
    await drops(c, cb, 0, "heartbeat", 7);
    await rollup();
    expect(await totals(c)).toEqual([
      { local_date: cb, views: 1, visitors: 1, visits: 1, entries: 1, engaged_ms: 5000, engaged_views: 2, dropped: 2, dropped_heartbeats: 7 },
    ]);
  });

  it("gives a day with only heartbeat drops a totals row", async () => {
    const c = CLUB_IDS.charlie;
    const cb = await clubToday(c);
    await drops(c, cb, 0, "heartbeat", 4);
    await rollup();
    expect(await totals(c)).toEqual([
      { local_date: cb, views: 0, visitors: 0, visits: 0, entries: 0, engaged_ms: 0, engaged_views: 0, dropped: 0, dropped_heartbeats: 4 },
    ]);
  });

  it("is idempotent: a second run gives identical rows and the same rowsWritten", async () => {
    await seedAll();
    const first = await rollup();
    const before = [await allRows(CLUB_IDS.alpha), await allRows(CLUB_IDS.charlie)];
    expect(before[0].length).toBe(3 + 19 + 5 + 3);
    expect(before[1].length).toBe(1 + 6 + 1);
    const second = await rollup();
    expect(second).toEqual(first);
    expect([await allRows(CLUB_IDS.alpha), await allRows(CLUB_IDS.charlie)]).toEqual(before);
  });

  it("recomputes only the requested window and leaves older rows alone", async () => {
    await seedAll();
    await asOwner();
    await db.query("insert into onzio.page_daily_totals (club_id, local_date, views) values ($1, $2::date - 5, 999)", [CLUB_IDS.alpha, today]);
    await db.query("insert into onzio.page_daily_totals (club_id, local_date, views) values ($1, $2::date - 1, 999)", [CLUB_IDS.alpha, today]);
    await rollup(1);
    const afterOneDay = await totals(CLUB_IDS.alpha);
    expect(afterOneDay.find((row) => row.local_date !== today && row.views === 999)).toBeDefined();
    expect(afterOneDay.filter((row) => row.views === 999)).toHaveLength(2);
    await rollup();
    const afterThree = await totals(CLUB_IDS.alpha);
    expect(afterThree.filter((row) => row.views === 999)).toHaveLength(1); // only the day outside the 3-day window remains
  });

  it("leaves club B's rows correct and untouched when club A's data changes", async () => {
    await seedAll();
    await rollup();
    const charlie = await allRows(CLUB_IDS.charlie);
    const alpha = await allRows(CLUB_IDS.alpha);
    await seed(CLUB_IDS.alpha, today, { type: "view", visitor: "Z", visit: randomUUID(), entry: true, mins: 1, path: "/late" });
    await rollup();
    expect(await allRows(CLUB_IDS.charlie)).toEqual(charlie);
    expect(await allRows(CLUB_IDS.alpha)).not.toEqual(alpha);
    expect((await totals(CLUB_IDS.alpha)).find((row) => row.local_date === today)?.views).toBe(4);
  });

  it("rejects a window outside 1..7 or null as INVALID_ROLLUP_WINDOW", async () => {
    for (const days of [0, 8, -1, null]) {
      await rejects(() => rollup(days), { code: "22023", message: "INVALID_ROLLUP_WINDOW" });
    }
    expect((await rollup(1)).days).toBe(1);
    expect((await rollup(7)).days).toBe(7);
  });

  it("can be run only by the service role", async () => {
    for (const actor of [asAnon, () => asUser(USER_IDS.ownerAal2)]) {
      await actor();
      await rejects(() => db.query("select onzio.rollup_page_telemetry()"), { code: "42501" });
      await actor();
      await rejects(() => db.query("select onzio_private.rollup_page_telemetry()"), { code: "42501" });
    }
    const { rows } = await db.query(
      `select has_function_privilege('anon', 'onzio_private.rollup_page_telemetry(integer)', 'execute') as anon,
              has_function_privilege('authenticated', 'onzio_private.rollup_page_telemetry(integer)', 'execute') as authenticated,
              has_function_privilege('service_role', 'onzio_private.rollup_page_telemetry(integer)', 'execute') as service,
              has_function_privilege('anon', 'onzio.rollup_page_telemetry(integer)', 'execute') as wrapper_anon,
              has_function_privilege('authenticated', 'onzio.rollup_page_telemetry(integer)', 'execute') as wrapper_authenticated,
              has_function_privilege('service_role', 'onzio.rollup_page_telemetry(integer)', 'execute') as wrapper_service`,
    );
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true, wrapper_anon: false, wrapper_authenticated: false, wrapper_service: true });
    expect((await rollup()).days).toBe(3);
  });

  it("shows an owner or admin only their own club's rollup rows, a non-member nothing, and no one can write", async () => {
    await seedAll();
    await rollup();
    const tables = ["onzio.page_daily_totals", "onzio.page_daily_breakdowns", "onzio.sponsor_daily_rollups"];

    for (const userId of [USER_IDS.ownerAal2, USER_IDS.adminAal2]) {
      await asUser(userId);
      for (const table of tables) {
        const { rows } = await db.query(`select distinct club_id from ${table}`);
        expect(rows.map((row) => row.club_id), table).toEqual([CLUB_IDS.alpha]);
      }
      const visible = (await db.query("select count(*)::int as n from onzio.page_daily_totals")).rows[0].n;
      expect(visible).toBe(3);
    }
    for (const userId of [USER_IDS.unaffiliated, USER_IDS.removed]) {
      await asUser(userId);
      for (const table of tables) expect((await db.query(`select 1 from ${table}`)).rows, table).toEqual([]);
    }
    await asAnon();
    await rejects(() => db.query("select 1 from onzio.page_daily_totals"), { code: "42501" });
    await asUser(USER_IDS.ownerAal2);
    await rejects(() => db.query("delete from onzio.page_daily_totals"), { code: "42501" });
    await asUser(USER_IDS.ownerAal2);
    await rejects(() => db.query("insert into onzio.sponsor_daily_rollups (club_id, local_date, sponsor_id) values ($1, current_date, gen_random_uuid())", [CLUB_IDS.alpha]), { code: "42501" });
    await asService();
    await rejects(() => db.query("delete from onzio.page_daily_breakdowns"), { code: "42501" });
  });
});
