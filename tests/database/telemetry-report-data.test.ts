import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { createFreshLocalClient } from "../helpers/mfa";
import { expectPostgrestError } from "../helpers/database-security";
import { createLocalClients } from "../helpers/supabase";
import {
  buildMonthlyReport,
  readMonthlyReportRows,
  readReportClubLogo,
  readReportMonths,
} from "../../lib/telemetry/report-data";

// TELEMETRY-05: the monthly report reads only through the signed-in person's own client, so RLS and the
// reader's own club filter are the whole tenant boundary. Nothing can write these tables through the API
// (no insert grant for anyone), so the rows are committed as the postgres superuser, in 2003, a year no
// other test or script uses, and deleted again (first thing in beforeAll too, in case a past run died).
//
//   Alpha:   2003-03-31 and 2003-05-01 (just outside April), and April itself, with two sponsors (one is
//            deleted, so it has history and no listing) and two games on one day.
//   Charlie: April and June. June is Charlie's alone, so Alpha's month list must never show it.
//   Bravo:   April. The multi-club person is in Alpha and Bravo, so RLS lets them read both: only the
//            reader's own club filter keeps one club's page from showing the other's numbers.
//
// Charlie has no season, so only Alpha and Bravo have games.
//
// One more month, 2002-12, holds 1,240 Alpha sponsor rows (40 sponsors x 31 days), more than PostgREST
// returns in one read. It is in 2002 so Alpha's 2003 month list above stays exactly what it asserts.

const ALPHA = CLUB_IDS.alpha;
const BRAVO = CLUB_IDS.bravo;
const CHARLIE = CLUB_IDS.charlie;
const MONTH = "2003-04";

const ALPHA_SPONSOR = "f0000003-0000-4000-8000-0000000000a1";
const ALPHA_REMOVED_SPONSOR = "f0000003-0000-4000-8000-0000000000a2";
const CHARLIE_SPONSOR = "f0000003-0000-4000-8000-0000000000c1";
const BRAVO_SPONSOR = "f0000003-0000-4000-8000-0000000000b1";
const LISTED_SPONSORS = [ALPHA_SPONSOR, CHARLIE_SPONSOR, BRAVO_SPONSOR];

type Totals = { views: number; visitors: number; visits: number; entries: number; engaged_ms: number; engaged_views: number; dropped: number };
const day = (views: number, overrides: Partial<Totals> = {}): Totals => ({
  views,
  visitors: 0,
  visits: 0,
  entries: 0,
  engaged_ms: 0,
  engaged_views: 0,
  dropped: 0,
  ...overrides,
});

const TOTALS: Array<[clubId: string, date: string, row: Totals]> = [
  [ALPHA, "2003-03-31", day(999, { visitors: 900, visits: 800, engaged_ms: 9_000_000, dropped: 9 })],
  [ALPHA, "2003-04-05", day(100, { visitors: 60, visits: 70, entries: 50, engaged_ms: 3_000_000, engaged_views: 40, dropped: 1 })],
  [ALPHA, "2003-04-12", day(50, { visitors: 30, visits: 35, entries: 25, engaged_ms: 1_500_000, engaged_views: 20 })],
  [ALPHA, "2003-05-01", day(777, { visitors: 700, visits: 600, engaged_ms: 7_000_000, dropped: 7 })],
  [CHARLIE, "2003-04-07", day(11, { visitors: 5, visits: 6 })],
  [CHARLIE, "2003-04-14", day(22, { visitors: 9, visits: 10 })],
  [CHARLIE, "2003-06-02", day(33, { visitors: 12, visits: 13 })],
  [BRAVO, "2003-04-09", day(44, { visitors: 20, visits: 21, engaged_ms: 440_000 })],
];

const ROLLUPS: Array<[clubId: string, date: string, sponsorId: string, logoViews: number, logoViewers: number, clicks: number]> = [
  [ALPHA, "2003-03-31", ALPHA_SPONSOR, 999, 900, 99],
  [ALPHA, "2003-04-05", ALPHA_SPONSOR, 30, 20, 3],
  [ALPHA, "2003-04-05", ALPHA_REMOVED_SPONSOR, 10, 8, 0],
  [ALPHA, "2003-04-12", ALPHA_SPONSOR, 10, 8, 1],
  [ALPHA, "2003-05-01", ALPHA_SPONSOR, 888, 800, 88],
  [CHARLIE, "2003-04-07", CHARLIE_SPONSOR, 5, 4, 1],
  [CHARLIE, "2003-06-02", CHARLIE_SPONSOR, 6, 5, 0],
  [BRAVO, "2003-04-09", BRAVO_SPONSOR, 7, 6, 2],
];

const SPONSOR_NAMES: Record<string, [clubId: string, name: string]> = {
  [ALPHA_SPONSOR]: [ALPHA, "Report Test Alpha Sponsor"],
  [CHARLIE_SPONSOR]: [CHARLIE, "Report Test Charlie Sponsor"],
  [BRAVO_SPONSOR]: [BRAVO, "Report Test Bravo Sponsor"],
};

const GAMES: Array<[clubId: string, date: string, time: string, opponent: string, home: boolean]> = [
  [ALPHA, "2003-04-05", "10:00", "Report Test Alpha Morning", true],
  [ALPHA, "2003-04-05", "17:00", "Report Test Alpha Evening", false],
  [ALPHA, "2003-05-01", "10:00", "Report Test Alpha May", true],
  [BRAVO, "2003-04-09", "10:00", "Report Test Bravo Away", false],
];

const CLUBS = [ALPHA, BRAVO, CHARLIE];

const BIG_MONTH = "2002-12";
const BIG_SPONSORS = 40;
const BIG_DAYS = 31;

let db: Client | undefined;
let alphaOwner: SupabaseClient<any, any, any>;
let multiClub: SupabaseClient<any, any, any>;
let unaffiliated: SupabaseClient<any, any, any>;
let removedAdmin: SupabaseClient<any, any, any>;
let anon: SupabaseClient<any, any, any>;

async function clean(client: Client): Promise<void> {
  // Exactly what this file seeds: every row of those three clubs dated in 2003, and its own sponsor ids.
  await client.query("delete from onzio.page_daily_totals where club_id = any($1::uuid[]) and local_date >= '2003-01-01' and local_date < '2004-01-01'", [CLUBS]);
  await client.query("delete from onzio.sponsor_daily_rollups where club_id = any($1::uuid[]) and local_date >= '2003-01-01' and local_date < '2004-01-01'", [CLUBS]);
  await client.query("delete from onzio.matches where club_id = any($1::uuid[]) and date >= '2003-01-01' and date < '2004-01-01'", [CLUBS]);
  await client.query("delete from onzio.site_sponsor_logos where id = any($1::uuid[])", [LISTED_SPONSORS]);
  await client.query("delete from onzio.sponsor_daily_rollups where club_id = $1 and local_date >= '2002-12-01' and local_date < '2003-01-01'", [ALPHA]);
}

async function seed(client: Client): Promise<void> {
  for (const [clubId, date, row] of TOTALS) {
    await client.query(
      `insert into onzio.page_daily_totals (club_id, local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [clubId, date, row.views, row.visitors, row.visits, row.entries, row.engaged_ms, row.engaged_views, row.dropped],
    );
  }
  for (const [clubId, date, sponsorId, logoViews, logoViewers, clicks] of ROLLUPS) {
    await client.query(
      `insert into onzio.sponsor_daily_rollups (club_id, local_date, sponsor_id, logo_views, logo_viewers, clicks)
       values ($1, $2, $3, $4, $5, $6)`,
      [clubId, date, sponsorId, logoViews, logoViewers, clicks],
    );
  }
  // Sponsor n logs n logo views and n logo viewers on each of the month's days (2002-12-01 to 2002-12-31).
  await client.query(
    `insert into onzio.sponsor_daily_rollups (club_id, local_date, sponsor_id, logo_views, logo_viewers, clicks)
     select $1::uuid, $2::date + d, ('f0000003-0000-4000-8000-0001' || lpad(n::text, 8, '0'))::uuid, n, n, 0
     from generate_series(1, $3::int) as n, generate_series(0, $4::int - 1) as d`,
    [ALPHA, `${BIG_MONTH}-01`, BIG_SPONSORS, BIG_DAYS],
  );
  for (const [id, [clubId, name]] of Object.entries(SPONSOR_NAMES)) {
    await client.query(
      "insert into onzio.site_sponsor_logos (id, club_id, name, logo_url, show_on_homepage) values ($1, $2, $3, $4, true)",
      [id, clubId, name, `https://example.test/${name.toLowerCase().replaceAll(" ", "-")}.png`],
    );
  }
  for (const [clubId, date, time, opponent, home] of GAMES) {
    const season = (await client.query("select id from onzio.seasons where club_id = $1 order by active desc limit 1", [clubId])).rows[0];
    if (!season) throw new Error(`The seeded club ${clubId} has no season to hold a game.`);
    await client.query(
      `insert into onzio.matches (club_id, season_id, date, time, opponent, home, venue)
       values ($1, $2, $3, $4, $5, $6, 'Report Test Field')`,
      [clubId, season.id, date, time, opponent, home],
    );
  }
}

beforeAll(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await clean(db);
  await seed(db);
  alphaOwner = (await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" })).client;
  multiClub = (await createFreshLocalClient({ userId: USER_IDS.multiClub, email: "multi-club@alpha.local" })).client;
  unaffiliated = (await createFreshLocalClient({ userId: USER_IDS.unaffiliated, email: "unaffiliated@alpha.local" })).client;
  removedAdmin = (await createFreshLocalClient({ userId: USER_IDS.removed, email: "removed@alpha.local" })).client;
  anon = createLocalClients().anon;
});

afterAll(async () => {
  if (!db) return;
  try {
    await clean(db);
  } finally {
    await db.end();
  }
});

describe("the monthly report reader: the Alpha owner reading Alpha", () => {
  it("lists the months that have data, newest first, from both rollup tables", async () => {
    const result = await readReportMonths(alphaOwner, ALPHA);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.months).toEqual(expect.arrayContaining(["2003-05", "2003-04", "2003-03"]));
    const mine = result.months.filter((month) => month.startsWith("2003-"));
    expect(mine).toEqual(["2003-05", "2003-04", "2003-03"]);
    // Charlie's June is not Alpha's to see.
    expect(result.months).not.toContain("2003-06");
  });

  it("reads April's rows and nothing from the days either side", async () => {
    const result = await readMonthlyReportRows(alphaOwner, ALPHA, MONTH);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.totals.map((row) => [row.local_date, Number(row.views)])).toEqual([
      ["2003-04-05", 100],
      ["2003-04-12", 50],
    ]);
    // Same-day rows have no defined order, so compare them sorted.
    expect(
      result.sponsorRows.map((row) => `${row.local_date} ${row.sponsor_id} ${Number(row.logo_views)}`).sort(),
    ).toEqual(
      [
        `2003-04-05 ${ALPHA_SPONSOR} 30`,
        `2003-04-05 ${ALPHA_REMOVED_SPONSOR} 10`,
        `2003-04-12 ${ALPHA_SPONSOR} 10`,
      ].sort(),
    );
    expect(result.matches).toEqual([
      { date: "2003-04-05", opponent: "Report Test Alpha Morning", home: true },
      { date: "2003-04-05", opponent: "Report Test Alpha Evening", home: false },
    ]);
    // The sponsor list is the club's own list: Alpha's listed sponsor, never Charlie's or Bravo's.
    const listed = result.sponsors.filter((sponsor) => LISTED_SPONSORS.includes(sponsor.id));
    expect(listed.map((sponsor) => sponsor.id)).toEqual([ALPHA_SPONSOR]);
    expect(listed[0].name).toBe("Report Test Alpha Sponsor");
    expect(result.sponsors.map((sponsor) => sponsor.name)).not.toContain("Report Test Charlie Sponsor");
    expect(result.sponsors.map((sponsor) => sponsor.name)).not.toContain("Report Test Bravo Sponsor");
  });

  it("returns the same counts the seed holds, ready to build a report from", async () => {
    const result = await readMonthlyReportRows(alphaOwner, ALPHA, MONTH);
    if (result.status !== "ready") throw new Error("expected a ready read");
    const report = buildMonthlyReport({
      month: MONTH,
      sponsor: "all",
      timeZone: "America/Los_Angeles",
      now: new Date("2026-11-21T20:00:00Z"),
      totals: result.totals,
      sponsorRows: result.sponsorRows,
      sponsors: result.sponsors,
      matches: result.matches,
    });
    expect(report.soFar).toBe(false);
    expect(report.monthLabel).toBe("April 2003");
    expect(report.site).toEqual({
      views: 150,
      visitorDays: 90,
      visits: 105,
      avgTimeOnPageMs: 30_000,
      timeMeasuredDays: 2,
      trafficDays: 2,
      dropped: 1,
    });
    expect(report.pages.map((page) => [page.name, page.removed, page.totals])).toEqual([
      ["Report Test Alpha Sponsor", false, { logoViews: 40, viewerDays: 28, clicks: 4, clickRate: 0.1 }],
      ["Removed sponsor", true, { logoViews: 10, viewerDays: 8, clicks: 0, clickRate: 0 }],
    ]);
    expect(report.pages[0].busiestDays).toEqual([
      { date: "2003-04-05", siteViews: 100, logoViews: 30, matches: ["vs Report Test Alpha Morning", "at Report Test Alpha Evening"] },
      { date: "2003-04-12", siteViews: 50, logoViews: 10, matches: [] },
    ]);
  });

  it("reads every sponsor row of a month that runs past PostgREST's 1,000-row cap, in order", async () => {
    const result = await readMonthlyReportRows(alphaOwner, ALPHA, BIG_MONTH);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.sponsorRows).toHaveLength(BIG_SPONSORS * BIG_DAYS);
    const keys = result.sponsorRows.map((row) => `${row.local_date} ${row.sponsor_id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort());
    // Nothing was cut off: every sponsor has its page and its whole month of logo views (n x 31 days).
    const report = buildMonthlyReport({
      month: BIG_MONTH,
      sponsor: "all",
      timeZone: "America/Los_Angeles",
      now: new Date("2026-11-21T20:00:00Z"),
      totals: result.totals,
      sponsorRows: result.sponsorRows,
      sponsors: result.sponsors,
      matches: result.matches,
    });
    expect(report.pages).toHaveLength(BIG_SPONSORS);
    expect(report.pages.reduce((sum, page) => sum + page.totals.logoViews, 0)).toBe(BIG_DAYS * ((BIG_SPONSORS * (BIG_SPONSORS + 1)) / 2));
  });

  it("reads the club's logo address as text, and never throws", async () => {
    // Whatever Alpha has saved (a public branding row), the reader returns a string.
    expect(typeof (await readReportClubLogo(alphaOwner, ALPHA))).toBe("string");
  });
});

type MonthRead = Awaited<ReturnType<typeof readMonthlyReportRows>>;

// Sponsors, games and the logo are the club's public site content, which a live club shows to anyone, so
// only the rollup rows (the private numbers) are asserted empty when a person has no access.
function expectNoRollupRows(result: MonthRead): void {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") return;
  expect(result.totals).toEqual([]);
  expect(result.sponsorRows).toEqual([]);
}

describe("the monthly report reader: another club's numbers stay out of reach", () => {
  it("gives the Alpha owner zero rows, not an error, for Charlie's April", async () => {
    expectNoRollupRows(await readMonthlyReportRows(alphaOwner, CHARLIE, MONTH));
  });

  it("gives the Alpha owner no months at all for Charlie, so neither April nor June shows", async () => {
    // Charlie has 2003-04 and 2003-06 committed; Alpha's owner sees neither.
    expect(await readReportMonths(alphaOwner, CHARLIE)).toEqual({ status: "ready", months: [] });
  });

  it("gives the Alpha owner no rows for Charlie's June either", async () => {
    expectNoRollupRows(await readMonthlyReportRows(alphaOwner, CHARLIE, "2003-06"));
  });

  it("gives the Alpha owner no rows for Bravo", async () => {
    expectNoRollupRows(await readMonthlyReportRows(alphaOwner, BRAVO, MONTH));
    expect(await readReportMonths(alphaOwner, BRAVO)).toEqual({ status: "ready", months: [] });
  });

  it("keeps a person who belongs to two clubs on the club asked for, even though RLS lets them read both", async () => {
    // RLS alone lets this person see Alpha's and Bravo's April rows together...
    const both = await multiClub
      .schema("onzio")
      .from("page_daily_totals")
      .select("club_id")
      .in("club_id", [ALPHA, BRAVO])
      .gte("local_date", "2003-04-01")
      .lt("local_date", "2003-05-01");
    expect(both.error).toBeNull();
    expect([...new Set((both.data ?? []).map((row: { club_id: string }) => row.club_id))].sort()).toEqual([ALPHA, BRAVO].sort());

    // ...so the reader's own club filter is what keeps one club's page from showing the other's numbers.
    const alpha = await readMonthlyReportRows(multiClub, ALPHA, MONTH);
    const bravo = await readMonthlyReportRows(multiClub, BRAVO, MONTH);
    if (alpha.status !== "ready" || bravo.status !== "ready") throw new Error("expected ready reads");
    expect(alpha.totals.map((row) => row.local_date)).toEqual(["2003-04-05", "2003-04-12"]);
    expect(alpha.sponsorRows.map((row) => row.sponsor_id)).not.toContain(BRAVO_SPONSOR);
    expect(bravo.totals.map((row) => [row.local_date, Number(row.views)])).toEqual([["2003-04-09", 44]]);
    expect(bravo.sponsorRows.map((row) => [row.sponsor_id, Number(row.logo_views)])).toEqual([[BRAVO_SPONSOR, 7]]);
    expect(bravo.matches).toEqual([{ date: "2003-04-09", opponent: "Report Test Bravo Away", home: false }]);
    expect(bravo.sponsors.filter((sponsor) => LISTED_SPONSORS.includes(sponsor.id)).map((sponsor) => sponsor.id)).toEqual([BRAVO_SPONSOR]);

    const alphaMonths = await readReportMonths(multiClub, ALPHA);
    const bravoMonths = await readReportMonths(multiClub, BRAVO);
    if (alphaMonths.status !== "ready" || bravoMonths.status !== "ready") throw new Error("expected ready reads");
    expect(alphaMonths.months.filter((month) => month.startsWith("2003-"))).toEqual(["2003-05", "2003-04", "2003-03"]);
    expect(bravoMonths.months.filter((month) => month.startsWith("2003-"))).toEqual(["2003-04"]);
  });

  it("gives a person with no membership no rollup rows and no months for Alpha", async () => {
    expectNoRollupRows(await readMonthlyReportRows(unaffiliated, ALPHA, MONTH));
    expect(await readReportMonths(unaffiliated, ALPHA)).toEqual({ status: "ready", months: [] });
  });

  it("gives an admin whose membership was removed no rollup rows and no months for Alpha", async () => {
    expectNoRollupRows(await readMonthlyReportRows(removedAdmin, ALPHA, MONTH));
    expect(await readReportMonths(removedAdmin, ALPHA)).toEqual({ status: "ready", months: [] });
  });
});

describe("the monthly report reader: a signed-out visitor", () => {
  it.each([ALPHA, CHARLIE])("is refused the rollup tables for club %s, and the reader reports an error with no rows", async (clubId) => {
    for (const table of ["page_daily_totals", "sponsor_daily_rollups"]) {
      const direct = await anon.schema("onzio").from(table).select("local_date").eq("club_id", clubId);
      expectPostgrestError(direct.error, "42501", `anon reading ${table} for ${clubId}`);
      expect(direct.data).toBeNull();
    }
    expect(await readReportMonths(anon, clubId)).toEqual({ status: "error" });
    expect(await readMonthlyReportRows(anon, clubId, MONTH)).toEqual({ status: "error" });
  });
});
