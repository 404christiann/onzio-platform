import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubTimeZoneOrDefault, clubToday } from "../../lib/club-time";
import { formatRate } from "../../lib/telemetry/insights-math";

// TELEMETRY-04: the Sponsor Insights tab on local Alpha (switched to
// 'reimagined' by admin-reimagined.global-setup.ts). Alpha gets the add-on flag
// and deterministic rollup rows over the last 30 club-local days; everything it
// inserts is deleted, and the flag, slug and sponsor rows put back, in a
// finally-style afterAll. Screenshots land in test-results/telemetry-insights/.
//
// Seeded days are counted back from today in the club's time zone (offset 1 is
// yesterday, the last day of every window):
//   offsets 1-7    views 20, visitors 8, visits 6, engaged 100000 ms / 20 views
//   offsets 8-30   views 10, visitors 4, visits 3, engaged 90000 ms / 10 views
//   offset 10      no row (gap), offset 3 dropped 7, offset 45 views 1000
//   match on offset 2, sponsor rows on offsets 2 and 12.

const ALPHA = CLUB_IDS.alpha;
const ORIGIN = "http://alpha.localhost:3110";
const HELD_ORIGIN = "http://rose-city.localhost:3110";
const SHOTS = "test-results/telemetry-insights";
const OPPONENT = "T04 Fixture FC";
const SPONSOR_NAME = "T04 Sponsor Co";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

test.describe.configure({ mode: "serial" });

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const db = new Client(config);
  await db.connect();
  try {
    return (await db.query<T>(text, values)).rows;
  } finally {
    await db.end();
  }
}

function daysAgo(today: string, offset: number): string {
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10);
}

const SOURCE_RAW = "Insta gram & co";
const MEDIUM_RAW = "social";
const CAMPAIGN_RAW = "Match day #1";
const QUERY = "utm_source=Insta+gram+%26+co&utm_medium=social&utm_campaign=Match+day+%231";

let snapshot: {
  slug: string;
  adminFlags: unknown;
  sponsors: unknown[];
} | null = null;
let seededDates: string[] = [];
let sponsorId = "";
let removedSponsorId = "";
let primaryHost = "";
let matchLabel = "";

test.beforeAll(async () => {
  const [club] = await sql<{ slug: string; admin_flags: unknown; time_zone: string | null }>(
    "select slug, admin_flags, time_zone from onzio.clubs where id=$1",
    [ALPHA],
  );
  const sponsors = (await sql<{ row: unknown }>("select to_jsonb(t) as row from onzio.site_sponsor_logos t where club_id=$1", [ALPHA])).map(
    (entry) => entry.row,
  );
  snapshot = { slug: club.slug, adminFlags: club.admin_flags, sponsors };
  try {
    await sql("update onzio.clubs set admin_flags = admin_flags || '{\"sponsor_insights\": true}'::jsonb where id=$1", [ALPHA]);
    const [zoneRow] = await sql<{ time_zone: string | null }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
    const today = clubToday(clubTimeZoneOrDefault(zoneRow.time_zone));
    const date = (offset: number) => daysAgo(today, offset);

    const domain = await sql<{ hostname: string }>("select hostname from onzio.club_domains where club_id=$1 and is_primary limit 1", [ALPHA]);
    primaryHost = domain[0]?.hostname ?? "";

    await sql("delete from onzio.page_daily_breakdowns where club_id=$1", [ALPHA]);
    await sql("delete from onzio.sponsor_daily_rollups where club_id=$1", [ALPHA]);
    await sql("delete from onzio.page_daily_totals where club_id=$1", [ALPHA]);

    // Totals.
    for (let offset = 1; offset <= 30; offset += 1) {
      if (offset === 10) continue;
      const recent = offset <= 7;
      seededDates.push(date(offset));
      await sql(
        `insert into onzio.page_daily_totals (club_id, local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped)
         values ($1, $2, $3, $4, $5, $5, $6, $7, $8)`,
        [ALPHA, date(offset), recent ? 20 : 10, recent ? 8 : 4, recent ? 6 : 3, recent ? 100000 : 90000, recent ? 20 : 10, offset === 3 ? 7 : 0],
      );
    }
    seededDates.push(date(45));
    await sql(
      `insert into onzio.page_daily_totals (club_id, local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped)
       values ($1, $2, 1000, 1, 1, 1, 0, 0, 0)`,
      [ALPHA, date(45)],
    );

    // Breakdowns: offset 1 is in every window, offset 20 only in 30 and 90 days.
    const breakdowns: Array<[number, string, string, number, number, number]> = [
      [1, "path", "/", 15, 6, 30000],
      [20, "path", "/", 10, 4, 50000],
      [1, "path", "/schedule", 5, 3, 25000],
      [1, "source", "google", 12, 5, 0],
      [1, "source", "direct", 8, 4, 0],
      [1, "device", "mobile", 14, 6, 0],
      [1, "device", "desktop", 6, 3, 0],
      [1, "country", "United States", 9, 5, 0],
      [1, "city", "Portland", 7, 4, 0],
      [1, "utm_campaign", "matchday-nov", 4, 2, 0],
      [1, "utm_source", "instagram", 4, 2, 0],
    ];
    for (const [offset, dimension, value, views, visitors, engaged] of breakdowns) {
      await sql(
        `insert into onzio.page_daily_breakdowns (club_id, local_date, dimension, value, views, visitors, engaged_ms)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [ALPHA, date(offset), dimension, value, views, visitors, engaged],
      );
    }

    // Sponsors: one saved, one whose logo row no longer exists.
    await sql("delete from onzio.site_sponsor_logos where club_id=$1", [ALPHA]);
    const [sponsor] = await sql<{ id: string }>(
      "insert into onzio.site_sponsor_logos (club_id, name, logo_url, sort_order) values ($1, $2, '/images/partners/tepitoSponsor.png', 0) returning id",
      [ALPHA, SPONSOR_NAME],
    );
    sponsorId = sponsor.id;
    removedSponsorId = randomUUID();
    const rollups: Array<[number, string, number, number, number]> = [
      [2, sponsorId, 100, 40, 3],
      [12, sponsorId, 100, 40, 2],
      [2, removedSponsorId, 50, 20, 0],
    ];
    for (const [offset, id, views, viewers, clicks] of rollups) {
      await sql(
        `insert into onzio.sponsor_daily_rollups (club_id, local_date, sponsor_id, logo_views, logo_viewers, clicks)
         values ($1, $2, $3, $4, $5, $6)`,
        [ALPHA, date(offset), id, views, viewers, clicks],
      );
    }

    // One match inside the 7-day window.
    const [season] = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
    await sql("insert into onzio.matches (club_id, season_id, date, time, opponent) values ($1, $2, $3::date, '10:00', $4)", [
      ALPHA,
      season.id,
      date(2),
      OPPONENT,
    ]);
    matchLabel = `Match day: vs ${OPPONENT}`;
  } catch (error) {
    await cleanup();
    throw error;
  }
});

async function cleanup() {
  const errors: unknown[] = [];
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  };
  await attempt(() => sql("delete from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, OPPONENT]));
  await attempt(() => sql("delete from onzio.page_daily_breakdowns where club_id=$1", [ALPHA]));
  await attempt(() => sql("delete from onzio.sponsor_daily_rollups where club_id=$1", [ALPHA]));
  await attempt(() => sql("delete from onzio.page_daily_totals where club_id=$1", [ALPHA]));
  if (snapshot) {
    const saved = snapshot;
    await attempt(async () => {
      await sql("delete from onzio.site_sponsor_logos where club_id=$1", [ALPHA]);
      if (saved.sponsors.length) {
        await sql("insert into onzio.site_sponsor_logos select * from jsonb_populate_recordset(null::onzio.site_sponsor_logos, $1::jsonb)", [
          JSON.stringify(saved.sponsors),
        ]);
      }
    });
    await attempt(() =>
      sql("update onzio.clubs set slug=$1, admin_flags=$2 where id=$3", [saved.slug, JSON.stringify(saved.adminFlags), ALPHA]),
    );
  }
  if (errors.length) throw errors[0];
}

test.afterAll(async () => {
  await cleanup();
});

function main(page: Page) {
  return page.getByRole("main");
}

async function open(page: Page, width: number, range?: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${ORIGIN}/admin/insights${range ? `?range=${range}` : ""}`);
  await expect(main(page).getByRole("heading", { level: 1, name: "Sponsor Insights" })).toBeVisible();
  await expect(page.getByTestId("insights-totals")).toBeVisible();
}

function stat(page: Page, id: string) {
  return page.getByTestId(id);
}

async function expectTotals(page: Page, totals: { views: string; visitorDays: string; visits: string; avg: string }) {
  await expect(stat(page, "insights-total-views")).toContainText(totals.views);
  await expect(stat(page, "insights-total-visitor-days")).toContainText(totals.visitorDays);
  await expect(stat(page, "insights-total-visits")).toContainText(totals.visits);
  await expect(stat(page, "insights-total-avg-time")).toContainText(totals.avg);
}

async function expectNoSideScroll(page: Page) {
  const { overflow, wide } = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > limit + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    return { overflow: document.documentElement.scrollWidth - limit, wide };
  });
  expect(overflow, `elements past the right edge: ${wide.join(", ")}`).toBeLessThanOrEqual(0);
}

for (const width of [1440, 390]) {
  test(`the dashboard shows the seeded numbers at ${width}px`, async ({ page }) => {
    await open(page, width);
    await expect(page.getByTestId("insights-range").getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "page");
    await expectTotals(page, { views: "360", visitorDays: "144", visits: "108", avg: "0:07" });
    // Days without a row are a marker, not a zero; the match day has a diamond.
    expect(await page.getByTestId("insights-gap-marker").count()).toBe(1);
    await expect(page.getByTestId("insights-match-marker")).toHaveAttribute("aria-label", new RegExp(`^${matchLabel},`));
    await expect(page.getByTestId("insights-daily-chart")).toBeVisible();
    await page.getByText("View as a table").click();
    await expect(page.getByRole("table").first()).toBeVisible();

    const pages = page.getByTestId("insights-top-pages");
    await expect(pages.getByRole("listitem").first()).toContainText("/");
    await expect(pages.getByRole("listitem").first()).toContainText("25");
    await expect(pages.getByRole("listitem").first()).toContainText("0:03");
    await expect(pages.getByRole("listitem").nth(1)).toContainText("/schedule");
    await expect(pages.getByRole("listitem").nth(1)).toContainText("0:05");
    await expect(page.getByTestId("insights-sources")).toContainText("google");
    await expect(page.getByTestId("insights-devices")).toContainText("mobile");
    await expect(page.getByTestId("insights-places")).toContainText("United States");
    await expect(page.getByTestId("insights-places")).toContainText("Portland");
    await expect(page.getByTestId("insights-campaigns")).toContainText("matchday-nov");
    await expect(page.getByTestId("insights-campaigns")).toContainText("instagram");

    const sponsors = page.getByTestId("insights-sponsors");
    const saved = sponsors.getByRole("row", { name: new RegExp(SPONSOR_NAME) });
    await expect(saved.getByRole("cell").nth(0)).toHaveText("200");
    await expect(saved.getByRole("cell").nth(1)).toHaveText("80");
    await expect(saved.getByRole("cell").nth(2)).toHaveText("5");
    await expect(saved.getByRole("cell").nth(3)).toHaveText(formatRate(5 / 200));
    const removed = sponsors.getByRole("row", { name: /Removed sponsor/ });
    await expect(removed.getByRole("cell").nth(0)).toHaveText("50");
    await expect(removed.getByRole("cell").nth(3)).toHaveText(formatRate(0));

    await expect(page.getByTestId("insights-dropped")).toHaveText("7 views weren't counted because of unusual traffic spikes.");
    await expect(page.getByTestId("insights-monthly-report-slot")).toBeVisible();
    await expect(page.getByTestId("insights-updated")).toContainText(/^Updated daily · last /);
    await expect(page.getByTestId("campaign-link-builder")).toBeVisible();
    await expectNoSideScroll(page);
    await page.screenshot({ path: `${SHOTS}/dashboard-${width}.png`, fullPage: true });
  });
}

test("the range switch changes the numbers and keeps the match day", async ({ page }) => {
  await open(page, 1440);
  const before = (await page.getByTestId("insights-span").textContent()) ?? "";
  const nav = page.getByTestId("insights-range");

  await nav.getByRole("link", { name: "7 days" }).click();
  await expect(page).toHaveURL(/range=7/);
  await expect(nav.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "30 days" })).not.toHaveAttribute("aria-current", "page");
  await expectTotals(page, { views: "140", visitorDays: "56", visits: "42", avg: "0:05" });
  expect((await page.getByTestId("insights-span").textContent()) ?? "").not.toBe(before);
  await expect(page.getByTestId("insights-match-marker")).toHaveCount(1);
  await expect(page.getByTestId("insights-gap-marker")).toHaveCount(0);
  const sevenDaySponsor = page.getByTestId("insights-sponsors").getByRole("row", { name: new RegExp(SPONSOR_NAME) });
  await expect(sevenDaySponsor.getByRole("cell").nth(3)).toHaveText(formatRate(3 / 100));
  await page.screenshot({ path: `${SHOTS}/range-7.png`, fullPage: true });

  await nav.getByRole("link", { name: "30 days" }).click();
  await expect(page).toHaveURL(/range=30/);
  await expectTotals(page, { views: "360", visitorDays: "144", visits: "108", avg: "0:07" });
  await expect(page.getByTestId("insights-match-marker")).toHaveCount(1);

  await nav.getByRole("link", { name: "90 days" }).click();
  await expect(page).toHaveURL(/range=90/);
  await expect(nav.getByRole("link", { name: "90 days" })).toHaveAttribute("aria-current", "page");
  await expectTotals(page, { views: "1,360", visitorDays: "145", visits: "109", avg: "0:07" });
  await expect(page.getByTestId("insights-match-marker")).toHaveCount(1);
});

test("the campaign link builder encodes the link and copies it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  await open(page, 1440);
  const builder = page.getByTestId("campaign-link-builder");
  const output = page.getByTestId("campaign-link-output");
  await expect(output).toHaveCount(0);

  await builder.getByLabel("Page", { exact: true }).selectOption("/schedule");
  await builder.getByLabel("Source", { exact: true }).fill(SOURCE_RAW);
  await builder.getByLabel("Medium", { exact: true }).fill(MEDIUM_RAW);
  await builder.getByLabel("Campaign", { exact: true }).fill(CAMPAIGN_RAW);
  await expect(output).toBeVisible();
  const link = await output.inputValue();
  expect(link).toMatch(/^https?:\/\//);
  expect(link).toContain("/schedule?");
  expect(link.endsWith(`/schedule?${QUERY}`)).toBe(true);
  if (primaryHost) expect(new URL(link).hostname).toBe(primaryHost.toLowerCase());

  // Too long, or a hidden character: an error and no link.
  await builder.getByLabel("Campaign", { exact: true }).fill("x".repeat(101));
  await builder.getByLabel("Campaign", { exact: true }).blur();
  await expect(builder).toContainText("Use 100 characters or fewer");
  await expect(output).toHaveCount(0);
  await builder.getByLabel("Campaign", { exact: true }).fill("bad\tvalue");
  await builder.getByLabel("Campaign", { exact: true }).blur();
  await expect(builder).toContainText("Remove line breaks, tabs and other hidden characters");
  await expect(output).toHaveCount(0);

  await builder.getByLabel("Campaign", { exact: true }).fill(CAMPAIGN_RAW);
  await expect(output).toHaveValue(link);
  const copy = page.getByTestId("campaign-link-copy");
  await expect(copy).toHaveText("Copy link");
  await copy.click();
  await expect(copy).toHaveText("Copied");
  await expect(builder.getByRole("status")).toHaveText("Link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await builder.scrollIntoViewIfNeeded();
  await builder.screenshot({ path: `${SHOTS}/link-builder.png` });
  await expect(copy).toHaveText("Copy link", { timeout: 5000 });
});

test("a held club sees the waiting card, not the numbers", async ({ page, context }) => {
  try {
    await sql("update onzio.clubs set slug='rose-city' where id=$1", [ALPHA]);
    const cookies = await context.cookies(ORIGIN);
    await context.addCookies(cookies.map((cookie) => ({ ...cookie, domain: "rose-city.localhost" })));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${HELD_ORIGIN}/admin/insights`);
    await expect(main(page).getByRole("heading", { level: 1, name: "Sponsor Insights" })).toBeVisible();
    await expect(page.getByTestId("insights-waiting")).toHaveAttribute("data-held", "true");
    await expect(page.getByTestId("insights-waiting")).toContainText("isn’t live yet");
    for (const id of ["insights-totals", "insights-daily-chart", "insights-sponsors", "campaign-link-builder", "insights-range"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await page.screenshot({ path: `${SHOTS}/held.png`, fullPage: true });
  } finally {
    await sql("update onzio.clubs set slug=$1 where id=$2", [snapshot?.slug ?? "alpha", ALPHA]);
  }
});

test("the dashboard does not scroll sideways at 375px", async ({ page }) => {
  await open(page, 375);
  await expectNoSideScroll(page);
  await expect(page.getByTestId("insights-sponsors")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/dashboard-375.png`, fullPage: true });
});
