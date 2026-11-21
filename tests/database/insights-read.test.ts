import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadInsightsData, type InsightsClient } from "@/lib/telemetry/insights-data";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";

// TELEMETRY-04: the Sponsor Insights reader, end to end through RLS. Rollup rows
// are seeded over a privileged connection on far-past dates; then real
// authenticated supabase-js clients (locally signed JWTs) read them through
// loadInsightsData. Everything this file inserts is deleted again.

const CLUB_A = CLUB_IDS.alpha;
const CLUB_B = CLUB_IDS.bravo;
const DATES = ["2001-02-01", "2001-02-02", "2001-02-04", "2001-02-05"]; // 2001-02-03 has no row on purpose
const SPONSOR_ID = randomUUID();
// 2001-02-08 12:00 in Los Angeles: yesterday is the 7th, so a 7-day window is 02-01..02-07.
const NOW = new Date("2001-02-08T20:00:00Z");
// A club-B owner who is not a member of club A: the temporary membership is removed in afterAll.
const B_OWNER = USER_IDS.unaffiliated;

let db: Client;
let addedMembership = false;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessToken(userId: string, email: string, otpAgeDays = 0): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "http://127.0.0.1:54321/auth/v1",
    aud: "authenticated",
    exp: now + 3_600,
    iat: now,
    sub: userId,
    role: "authenticated",
    aal: "aal1",
    session_id: randomUUID(),
    email,
    amr: [{ method: "otp", timestamp: now - otpAgeDays * 86_400 }],
  });
  const unsigned = `${header}.${payload}`;
  const secret = process.env.SUPABASE_TEST_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

function clientFor(userId: string, email: string, otpAgeDays = 0): InsightsClient {
  const { supabaseUrl } = assertSafeTestEnvironment();
  return createClient(supabaseUrl, process.env.SUPABASE_TEST_ANON_KEY ?? "local-anon-key-not-configured", {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "onzio" },
    global: { headers: { Authorization: `Bearer ${accessToken(userId, email, otpAgeDays)}` } },
  });
}

async function removeSeed() {
  const clubs = [CLUB_A, CLUB_B];
  for (const table of ["page_daily_totals", "page_daily_breakdowns", "sponsor_daily_rollups"]) {
    await db.query(`delete from onzio.${table} where club_id = any($1::uuid[]) and local_date = any($2::date[])`, [clubs, DATES]);
  }
}

describe("sponsor insights read through RLS", () => {
  beforeAll(async () => {
    db = new Client(localPostgresConfig());
    await db.connect();
    await removeSeed();
    await db.query("delete from onzio.club_members where user_id = $1 and club_id = $2", [B_OWNER, CLUB_B]);
    await db.query("insert into onzio.club_members (user_id, club_id, role, status) values ($1, $2, 'owner', 'active')", [B_OWNER, CLUB_B]);
    addedMembership = true;

    const views = [10, 20, 30, 40];
    for (const [index, date] of DATES.entries()) {
      for (const [club, scale] of [[CLUB_A, 1], [CLUB_B, 1000]] as const) {
        await db.query(
          `insert into onzio.page_daily_totals (club_id, local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped)
           values ($1, $2, $3, $4, $5, 1, $6, $7, $8)`,
          [club, date, views[index] * scale, (4 + index) * scale, (5 + index) * scale, 60_000 * (index + 1), 2 * (index + 1), index],
        );
        await db.query(
          `insert into onzio.page_daily_breakdowns (club_id, local_date, dimension, value, views, visitors, engaged_ms)
           values ($1, $2, 'path', '/', $3, $3, 10000), ($1, $2, 'path', '/schedule', $4, $4, 20000), ($1, $2, 'source', 'direct', $3, $3, 0)`,
          [club, date, views[index] * scale, 5 * scale],
        );
        await db.query(
          `insert into onzio.sponsor_daily_rollups (club_id, local_date, sponsor_id, logo_views, logo_viewers, clicks)
           values ($1, $2, $3, $4, $5, $6)`,
          [club, date, SPONSOR_ID, 100 * scale, 40 * scale, 3 * scale],
        );
      }
    }
  });

  afterAll(async () => {
    try {
      await removeSeed();
      if (addedMembership) await db.query("delete from onzio.club_members where user_id = $1 and club_id = $2", [B_OWNER, CLUB_B]);
    } finally {
      await db.end();
    }
  });

  const input = { clubId: CLUB_A, timeZone: "America/Los_Angeles", range: 7 as const, now: NOW };

  it("gives a fresh owner of the club its own numbers", async () => {
    const owner = clientFor(USER_IDS.ownerAal2, "owner-aal2@alpha.local");
    const result = await loadInsightsData(owner, input);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.start).toBe("2001-02-01");
    expect(result.end).toBe("2001-02-07");
    expect(result.totals).toMatchObject({ views: 100, visitorDays: 4 + 5 + 6 + 7, visits: 5 + 6 + 7 + 8, engagedMs: 60_000 * 10, engagedViews: 2 * 10, dropped: 0 + 1 + 2 + 3 });
    expect(result.daily.map((d) => d.views)).toEqual([10, 20, null, 30, 40, null, null]);
    expect(result.top.path[0]).toMatchObject({ value: "/", views: 100, visitorDays: 100 });
    expect(result.top.path[1]).toMatchObject({ value: "/schedule", views: 20 });
    expect(result.top.source).toEqual([expect.objectContaining({ value: "direct", views: 100, avgTimeMs: null })]);
    expect(result.sitePaths).toEqual(["/", "/schedule"]);
    expect(result.sponsors).toEqual([
      expect.objectContaining({ sponsorId: SPONSOR_ID, name: "Removed sponsor", removed: true, logoViews: 400, logoViewerDays: 160, clicks: 12, clickRate: 0.03 }),
    ]);
    expect(result.computedAt).not.toBeNull();
  });

  it("shows an owner of another club none of this club", async () => {
    const other = clientFor(B_OWNER, "unaffiliated@local.test");
    // Sanity: the same person does see their own club's rows.
    const own = await loadInsightsData(other, { ...input, clubId: CLUB_B });
    expect(own.status).toBe("ready");
    if (own.status === "ready") expect(own.totals.views).toBe(100_000);

    expect(await loadInsightsData(other, input)).toEqual({ status: "no-rollups" });
    for (const table of ["page_daily_totals", "page_daily_breakdowns", "sponsor_daily_rollups"]) {
      const direct = await other.from(table).select("*").eq("club_id", CLUB_A);
      expect(direct.error).toBeNull();
      expect(direct.data).toEqual([]);
    }
  });

  it("shows nothing to an owner whose session is older than 30 days", async () => {
    const stale = clientFor(USER_IDS.ownerAal2, "owner-aal2@alpha.local", 31);
    expect(await loadInsightsData(stale, input)).toEqual({ status: "no-rollups" });
    for (const table of ["page_daily_totals", "page_daily_breakdowns", "sponsor_daily_rollups"]) {
      const direct = await stale.from(table).select("*").eq("club_id", CLUB_A);
      expect(direct.error).toBeNull();
      expect(direct.data).toEqual([]);
    }
  });
});
