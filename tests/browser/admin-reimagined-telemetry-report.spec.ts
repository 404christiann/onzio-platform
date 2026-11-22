import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// TELEMETRY-05: the monthly sponsor report (/admin/insights/report), one printed
// page per sponsor, on local Alpha with the owner's browser state. Alpha gets the
// Sponsor Insights flag and, for one distinctive month long ago (2004-03), daily
// totals, sponsor rollups for two fixture sponsors and a removed one (a sponsor id
// that is not on the list), a listed sponsor with no numbers, and one game on the
// busiest day. Everything added is removed, and the flag put back, in afterAll.
// The sponsors are the suite's own, so a real sponsor list is never touched.
// Screenshots and PDFs land in test-results/telemetry-report/ (artifacts only).

const ALPHA = CLUB_IDS.alpha;
const OUT = "test-results/telemetry-report";
const MONTH = "2004-03";
const MONTH_START = "2004-03-01";
const MONTH_NEXT = "2004-04-01";
const MATCH_DAY = "2004-03-14";
const FIXTURE_OPPONENT = "TELEMETRY-05 fixture";
const FOOTER = "Counted by the club's own website, without cookies. Each visitor is counted once per day.";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

test.describe.configure({ mode: "serial" });

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const db = new Client(config);
  await db.connect();
  try {
    return (await db.query<T>(text, values)).rows;
  } finally {
    await db.end();
  }
}

function logoDataUri(letter: string, color: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48">` +
    `<rect width="96" height="48" rx="8" fill="${color}"/>` +
    `<text x="48" y="31" font-family="Arial" font-size="22" font-weight="700" text-anchor="middle" fill="#ffffff">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SPONSOR_BAKERY = { id: randomUUID(), name: "T05 Fixture Bakery", logo: logoDataUri("B", "#b45309") };
const SPONSOR_CAFE = { id: randomUUID(), name: "T05 Fixture Cafe", logo: logoDataUri("C", "#0f766e") };
const SPONSOR_IDLE = { id: randomUUID(), name: "T05 Fixture Idle", logo: logoDataUri("I", "#4b5563") };
const REMOVED_ID = randomUUID();

// 2004-03 for Alpha. Totals: 1,000 page views, 620 visitor-days, 725 visits, 12 dropped. Only Mar 14 has
// engaged time (heartbeats), so time on page is 65,000,000 ms over that day's 300 views = 216,667 ms = 3m 37s,
// measured on 1 of the 6 days with views. Busiest days: Mar 14 (300), Mar 5 (250), Mar 21 (160).
const DAILY_TOTALS = [
  // local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped
  ["2004-03-02", 100, 60, 70, 65, 0, 0, 0],
  ["2004-03-05", 250, 150, 180, 160, 0, 0, 0],
  ["2004-03-09", 90, 55, 60, 58, 0, 0, 0],
  [MATCH_DAY, 300, 190, 220, 200, 65_000_000, 800, 12],
  ["2004-03-21", 160, 100, 120, 105, 0, 0, 0],
  ["2004-03-28", 100, 65, 75, 68, 0, 0, 0],
] as const;

// Bakery: 400 logo views, 260 viewer-days, 8 clicks = 2.0%. Cafe: 150, 105, 5 = 3.3%. Removed: 40, 30, 2 = 5.0%.
const SPONSOR_ROLLUPS = [
  // sponsor id, local_date, logo_views, logo_viewers, clicks
  [SPONSOR_BAKERY.id, "2004-03-05", 120, 80, 3],
  [SPONSOR_BAKERY.id, MATCH_DAY, 200, 130, 4],
  [SPONSOR_BAKERY.id, "2004-03-21", 80, 50, 1],
  [SPONSOR_CAFE.id, "2004-03-09", 50, 35, 2],
  [SPONSOR_CAFE.id, MATCH_DAY, 100, 70, 3],
  [REMOVED_ID, MATCH_DAY, 40, 30, 2],
] as const;

let clubName = "Alpha FC";
let flagsSaved = false;
let savedFlags: unknown = null;

async function removeFixtureRows() {
  await sql("delete from onzio.page_daily_totals where club_id=$1 and local_date >= $2::date and local_date < $3::date", [ALPHA, MONTH_START, MONTH_NEXT]);
  await sql("delete from onzio.sponsor_daily_rollups where club_id=$1 and local_date >= $2::date and local_date < $3::date", [ALPHA, MONTH_START, MONTH_NEXT]);
  await sql("delete from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, FIXTURE_OPPONENT]);
  await sql("delete from onzio.site_sponsor_logos where club_id=$1 and name like 'T05 Fixture %'", [ALPHA]);
}

test.beforeAll(async () => {
  const [club] = await sql<{ name: string; admin_flags: unknown }>("select name, admin_flags from onzio.clubs where id=$1", [ALPHA]);
  clubName = club.name;
  savedFlags = club.admin_flags;
  flagsSaved = true;
  await sql(
    "update onzio.clubs set admin_flags = coalesce(admin_flags, '{}'::jsonb) || '{\"sponsor_insights\": true}'::jsonb where id=$1",
    [ALPHA],
  );
  // A crashed earlier run's leftovers go first.
  await removeFixtureRows();

  // Listed sponsors, switched off in both places so the homepage and footer limits never matter.
  let order = 0;
  for (const sponsor of [SPONSOR_BAKERY, SPONSOR_CAFE, SPONSOR_IDLE]) {
    await sql(
      "insert into onzio.site_sponsor_logos (id, club_id, name, logo_url, sort_order, show_on_homepage, show_in_footer) values ($1, $2, $3, $4, $5, false, false)",
      [sponsor.id, ALPHA, sponsor.name, sponsor.logo, 900 + order++],
    );
  }
  for (const [date, views, visitors, visits, entries, engagedMs, engagedViews, dropped] of DAILY_TOTALS) {
    await sql(
      "insert into onzio.page_daily_totals (club_id, local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)",
      [ALPHA, date, views, visitors, visits, entries, engagedMs, engagedViews, dropped],
    );
  }
  for (const [sponsorId, date, logoViews, logoViewers, clicks] of SPONSOR_ROLLUPS) {
    await sql(
      "insert into onzio.sponsor_daily_rollups (club_id, local_date, sponsor_id, logo_views, logo_viewers, clicks) values ($1, $2::date, $3, $4, $5, $6)",
      [ALPHA, date, sponsorId, logoViews, logoViewers, clicks],
    );
  }
  const [{ id: seasonId }] = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
  await sql(
    "insert into onzio.matches (club_id, season_id, date, time, opponent, home) values ($1, $2, $3::date, '10:00', $4, true)",
    [ALPHA, seasonId, MATCH_DAY, FIXTURE_OPPONENT],
  );
});

test.afterAll(async () => {
  // Every step runs even if an earlier one fails; the first failure is reported at the end.
  const problems: unknown[] = [];
  const attempt = async (step: () => Promise<unknown>) => {
    try {
      await step();
    } catch (error) {
      problems.push(error);
    }
  };
  await attempt(removeFixtureRows);
  if (flagsSaved) {
    await attempt(() =>
      sql("update onzio.clubs set admin_flags=$1::jsonb where id=$2", [savedFlags === null ? null : JSON.stringify(savedFlags), ALPHA]),
    );
  }
  if (problems.length) throw problems[0];
});

function reportUrl(sponsor: string) {
  return `/admin/insights/report?month=${MONTH}&sponsor=${sponsor}`;
}

/** How many of these elements take up room on the page right now (display: none and 0-size boxes do not). */
function visibleCount(locator: Locator): Promise<number> {
  return locator.evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
      }).length,
  );
}

/** The number of pages in a PDF the browser wrote: its page objects, not its page-tree objects. */
async function pdfPageCount(path: string): Promise<number> {
  const text = (await readFile(path)).toString("latin1");
  return (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test("one sponsor: its sheet shows the seeded numbers, the match day, the footnote and the footer", async ({ page }) => {
  await mkdir(OUT, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(reportUrl(SPONSOR_BAKERY.id));

  const sheets = page.locator("[data-report-page]");
  await expect(sheets).toHaveCount(1);
  const sheet = sheets.first();
  await expect(sheet).toHaveAttribute("aria-label", `${SPONSOR_BAKERY.name} report`);
  await expect(page.locator("[data-sponsor-report]")).toHaveCount(1);

  // Header: club, sponsor and month. Alpha has a site logo or it does not; the name is always there.
  await expect(sheet).toContainText(clubName);
  await expect(sheet.getByRole("heading", { level: 2, name: SPONSOR_BAKERY.name })).toBeVisible();
  await expect(sheet.getByRole("img", { name: `${SPONSOR_BAKERY.name} logo` })).toBeVisible();
  await expect(sheet).toContainText("March 2004");
  await expect(sheet).not.toContainText("so far");

  // Site traffic.
  await expect(sheet.locator('[data-stat="views"]')).toContainText("1,000");
  await expect(sheet.locator('[data-stat="visitor-days"]')).toContainText("620");
  await expect(sheet.locator('[data-stat="visits"]')).toContainText("725");
  await expect(sheet.locator('[data-stat="avg-time"]')).toContainText("3m 37s");
  await expect(sheet.locator('[data-stat="avg-time"]')).toContainText("measured on 1 of 6 days");

  // This sponsor on the site.
  await expect(sheet.getByRole("heading", { level: 3, name: `${SPONSOR_BAKERY.name} on your site` })).toBeVisible();
  await expect(sheet.locator('[data-stat="logo-views"]')).toContainText("400");
  await expect(sheet.locator('[data-stat="people-seen"]')).toContainText("260");
  await expect(sheet.locator('[data-stat="people-seen"]')).toContainText("visitor-days");
  await expect(sheet.locator('[data-stat="clicks"]')).toContainText("8");
  await expect(sheet.locator('[data-stat="click-rate"]')).toContainText("2.0%");

  // Busiest days: three of them, the game on the one with the most views.
  await expect(sheet.locator("[data-busy-day]")).toHaveCount(3);
  const busyDays = await sheet.locator("[data-busy-day]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-busy-day")));
  expect(busyDays).toEqual([MATCH_DAY, "2004-03-05", "2004-03-21"]);
  const matchDay = sheet.locator(`[data-busy-day="${MATCH_DAY}"]`);
  await expect(matchDay).toContainText("Sun, Mar 14");
  await expect(matchDay).toContainText("300");
  await expect(matchDay).toContainText("200");
  await expect(matchDay).toContainText("Match day");
  await expect(matchDay).toContainText(`vs ${FIXTURE_OPPONENT}`);
  await expect(sheet.getByText("Match day")).toHaveCount(1);

  // The abuse-limit footnote, and the footer every sheet carries.
  await expect(sheet.locator("[data-report-dropped]")).toHaveText(
    "* 12 page views were left out by our abuse limits (likely automated traffic).",
  );
  await expect(sheet.locator("footer")).toHaveText(FOOTER);

  // The pickers: only months with numbers, this sponsor chosen, the Show and Download PDF buttons.
  const controls = page.locator("[data-report-controls]");
  await expect(controls.locator('select[name="month"]')).toHaveValue(MONTH);
  await expect(controls.locator('select[name="sponsor"]')).toHaveValue(SPONSOR_BAKERY.id);
  const monthValues = await controls.locator('select[name="month"] option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(monthValues).toContain(MONTH);
  expect(monthValues.every((value) => /^\d{4}-\d{2}$/.test(value))).toBe(true);
  expect(monthValues).toEqual([...monthValues].sort().reverse());
  await expect(controls.getByRole("button", { name: "Show" })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await expect(controls.getByRole("link", { name: "Sponsor insights" })).toHaveAttribute("href", "/admin/insights");

  await page.screenshot({ path: `${OUT}/one-sponsor.png`, fullPage: true });

  // A phone is wide enough to read it without scrolling sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet).toBeVisible();
  await expectNoSideScroll(page, 390);
  await page.screenshot({ path: `${OUT}/one-sponsor-390.png`, fullPage: true });
});

test("all sponsors: a sheet for each sponsor with activity, the removed one named, the empty one left out", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(reportUrl("all"));

  const sheets = page.locator("[data-report-page]");
  await expect(sheets).toHaveCount(3);
  // Most logo views first.
  const labels = await sheets.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")));
  expect(labels).toEqual([`${SPONSOR_BAKERY.name} report`, `${SPONSOR_CAFE.name} report`, "Removed sponsor report"]);
  expect(labels).not.toContain(`${SPONSOR_IDLE.name} report`);
  await expect(page.locator("[data-report-empty]")).toHaveCount(0);

  // Every sheet is whole: the same site numbers and the same footer.
  for (let index = 0; index < 3; index++) {
    const sheet = sheets.nth(index);
    await expect(sheet.locator('[data-stat="views"]')).toContainText("1,000");
    await expect(sheet.locator("footer")).toHaveText(FOOTER);
  }
  await expect(sheets.nth(1).locator('[data-stat="click-rate"]')).toContainText("3.3%");
  await expect(sheets.nth(2).locator('[data-stat="logo-views"]')).toContainText("40");

  // The sponsor picker offers the empty listed sponsor and the removed one too.
  const options = await page
    .locator('select[name="sponsor"] option')
    .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).textContent));
  expect(options[0]).toBe("All sponsors");
  expect(options).toEqual(expect.arrayContaining([SPONSOR_BAKERY.name, SPONSOR_CAFE.name, SPONSOR_IDLE.name, "Removed sponsor"]));
  await expect(page.locator('select[name="sponsor"]')).toHaveValue("all");

  await page.screenshot({ path: `${OUT}/all-sponsors.png`, fullPage: true });

  // A listed sponsor with no numbers still gets its one page, with zeros and a dash.
  await page.goto(reportUrl(SPONSOR_IDLE.id));
  await expect(page.locator("[data-report-page]")).toHaveCount(1);
  await expect(page.locator('[data-stat="logo-views"]')).toContainText("0");
  await expect(page.locator('[data-stat="click-rate"]')).toContainText("—");
});

test("print: the admin frame and the pickers go, the sheet stays", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(reportUrl(SPONSOR_BAKERY.id));
  await expect(page.locator("[data-report-page]")).toHaveCount(1);

  const aside = page.locator("[data-admin-shell] > aside");
  const headers = page.locator("[data-admin-shell] > div > header");
  const navs = page.locator("[data-admin-shell] nav");
  const controls = page.locator("[data-report-controls]");
  const downloadPdf = page.getByRole("button", { name: "Print or save as PDF" });

  // On screen they all show; that is what makes the print checks below mean something.
  expect(await visibleCount(aside)).toBe(1);
  expect(await visibleCount(headers)).toBeGreaterThan(0);
  expect(await visibleCount(navs)).toBeGreaterThan(0);
  await expect(controls).toBeVisible();
  await expect(downloadPdf).toBeVisible();

  await page.emulateMedia({ media: "print" });
  expect(await visibleCount(aside)).toBe(0);
  expect(await visibleCount(headers)).toBe(0);
  expect(await visibleCount(navs)).toBe(0);
  await expect(controls).toBeHidden();
  await expect(downloadPdf).toBeHidden();
  await expect(page.getByRole("button", { name: "Show" })).toBeHidden();

  // The sheet is all that is left, on plain white with no frame padding.
  await expect(page.locator("[data-report-page]")).toBeVisible();
  await expect(page.locator("[data-report-page] footer")).toHaveText(FOOTER);
  await expect(page.getByRole("main")).toHaveCSS("padding-left", "0px");
  await expect(page.getByRole("main")).toHaveCSS("background-color", "rgb(255, 255, 255)");

  // Back on screen, nothing stays hidden.
  await page.emulateMedia({ media: "screen" });
  expect(await visibleCount(aside)).toBe(1);
  await expect(downloadPdf).toBeVisible();
});

test("print: other admin pages keep their frame after the report was open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(reportUrl(SPONSOR_BAKERY.id));
  await expect(page.locator("[data-report-page]")).toHaveCount(1);
  // Client-side navigation: the report's stylesheet may stay loaded, but its print rules must not apply.
  await page.getByRole("link", { name: "Sponsor insights" }).click();
  await expect(page).toHaveURL(/\/admin\/insights$/);
  await expect(page.locator("[data-sponsor-report]")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  expect(await visibleCount(page.locator("[data-admin-shell] > aside"))).toBe(1);
});

test("PDF: Letter and A4 files for one sponsor are one page, all sponsors one page each", async ({ page }) => {
  await mkdir(OUT, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const margin = { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" };

  await page.goto(reportUrl(SPONSOR_BAKERY.id));
  await expect(page.locator("[data-report-page]")).toHaveCount(1);
  const letter = `${OUT}/sponsor-report.pdf`;
  const a4 = `${OUT}/sponsor-report-a4.pdf`;
  await page.pdf({ path: letter, format: "Letter", printBackground: true, margin });
  await page.pdf({ path: a4, format: "A4", printBackground: true, margin });
  for (const file of [letter, a4]) {
    expect((await stat(file)).size).toBeGreaterThan(1024);
    expect(await pdfPageCount(file)).toBe(1);
  }

  await page.goto(reportUrl("all"));
  // UI-POLISH-INSIGHTS: the summary page, then one page per sponsor with numbers.
  await expect(page.locator("[data-report-page]")).toHaveCount(4);
  await expect(page.locator("[data-report-summary]")).toHaveCount(1);
  const all = `${OUT}/sponsor-report-all.pdf`;
  await page.pdf({ path: all, format: "Letter", printBackground: true, margin });
  expect((await stat(all)).size).toBeGreaterThan(1024);
  expect(await pdfPageCount(all)).toBe(3);
});
