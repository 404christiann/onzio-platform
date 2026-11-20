import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { createLocalClients } from "../helpers/supabase";
import { ROSE_CITY_CLUB_ID } from "../../scripts/rose-city-2027-operator-sql";

// TELEMETRY-01 P1: onzio.record_page_event and onzio.page_events. Each test
// runs in a transaction that is rolled back; now() is fixed inside it, so
// every call lands in the same rate-limit minute and the same club day.
// Telemetry is a paid add-on: each test grants it to Alpha and Charlie inside
// its own transaction, after recording that every seeded club starts without it.

let db: Client;
let defaultsBeforeGrant: Record<string, boolean>;

type Event = Record<string, unknown>;

function material(seed: string): string {
  return createHash("sha256").update(`material:${seed}`).digest("hex");
}

function event(overrides: Event = {}): Event {
  return {
    type: "view",
    visitorMaterial: material("visitor-a"),
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

async function record(clubId: string, payload: unknown): Promise<string> {
  await asAnon();
  const { rows } = await db.query("select onzio.record_page_event($1, $2::jsonb) as status", [clubId, JSON.stringify(payload)]);
  await asOwner();
  return rows[0].status;
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
    // Retention runs per club; another club's rows wait for its own first event.
    expect((await rows(CLUB_IDS.charlie)).map((row) => row.id)).toContain(otherClubExpired);
  });

  it("limits each visitor to 60 events a minute", async () => {
    const statuses: string[] = [];
    for (let i = 0; i < 61; i += 1) statuses.push(await record(CLUB_IDS.alpha, event({ path: `/news/n${i}` })));
    expect(statuses.slice(0, 60).every((status) => status === "recorded")).toBe(true);
    expect(statuses[60]).toBe("rate_limited");
    expect(await rows(CLUB_IDS.alpha)).toHaveLength(60);
    expect(await record(CLUB_IDS.alpha, event({ visitorMaterial: material("visitor-b") }))).toBe("recorded");
  });

  it("limits each club to 1,200 events a minute", async () => {
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

describe("onzio.record_page_event through PostgREST", () => {
  it("is exposed to the anon key, while raw events stay unreadable to it", async () => {
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
      const recorded = await anon.rpc("record_page_event", {
        p_club_id: CLUB_IDS.charlie,
        p_event: event({ visitorMaterial: visitor, path: "/postgrest-proof" }),
      });
      expect(recorded.error).toBeNull();
      expect(recorded.data).toBe("recorded");

      const read = await anon.from("page_events").select("id").limit(1);
      expect(read.error?.code).toBe("42501");

      const { rows: stored } = await cleanup.query(
        "select count(*)::int as n from onzio.page_events where club_id = $1 and path = '/postgrest-proof' and occurred_at >= $2",
        [CLUB_IDS.charlie, startedAt],
      );
      expect(stored[0].n).toBe(1);
    } finally {
      // This call commits; remove exactly what it created.
      await cleanup.query("delete from onzio.page_events where club_id = $1 and path = '/postgrest-proof' and occurred_at >= $2", [CLUB_IDS.charlie, startedAt]);
      await cleanup.query("delete from onzio_private.page_event_rate_windows where club_id = $1 and window_start >= date_trunc('minute', $2::timestamptz)", [CLUB_IDS.charlie, startedAt]);
      await cleanup.query("delete from onzio_private.page_visitor_salts where club_id = $1 and created_at >= $2", [CLUB_IDS.charlie, startedAt]);
      if (granted.rowCount === 1) {
        await cleanup.query("delete from onzio_private.club_addons where club_id = $1 and addon = 'telemetry'", [CLUB_IDS.charlie]);
      }
      await cleanup.end();
    }
  });
});
