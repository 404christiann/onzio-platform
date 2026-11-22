import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// TELEMETRY-06: Sponsor Insights on the classic admin, on local Alpha (classic)
// with the owner's browser state. Alpha gets the Sponsor Insights flag and, for
// 2004-03, one day of totals and one fixture sponsor's rollups so the report has
// a sheet to print. Alpha's admin_portal is never changed: the suite stops if
// Alpha is not classic. Everything added is removed, and the flags put back, in
// afterAll. Screenshots land in test-results/admin-classic-insights/.

const ALPHA = CLUB_IDS.alpha;
const OUT = "test-results/admin-classic-insights";
const MONTH = "2004-03";
const DAY = "2004-03-14";
const SPONSOR = { id: randomUUID(), name: "T06 Fixture Bakery" };
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

function visibleCount(locator: Locator): Promise<number> {
  return locator.evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
      }).length,
  );
}

async function setFlag(on: boolean) {
  await sql(
    on
      ? "update onzio.clubs set admin_flags = admin_flags || '{\"sponsor_insights\": true}'::jsonb where id=$1"
      : "update onzio.clubs set admin_flags = admin_flags - 'sponsor_insights' where id=$1",
    [ALPHA],
  );
}

async function removeFixtureRows() {
  await sql("delete from onzio.page_daily_totals where club_id=$1 and local_date=$2::date", [ALPHA, DAY]);
  await sql("delete from onzio.sponsor_daily_rollups where club_id=$1 and local_date=$2::date", [ALPHA, DAY]);
  await sql("delete from onzio.site_sponsor_logos where club_id=$1 and name like 'T06 Fixture %'", [ALPHA]);
}

let savedFlags: unknown = undefined;

test.beforeAll(async () => {
  const [club] = await sql<{ admin_portal: string; admin_flags: unknown }>(
    "select admin_portal, admin_flags from onzio.clubs where id=$1",
    [ALPHA],
  );
  expect(club.admin_portal, "Alpha must be on the classic admin for this suite").toBe("classic");
  savedFlags = club.admin_flags;
  await removeFixtureRows();
  await setFlag(true);
  await sql(
    "insert into onzio.site_sponsor_logos (id, club_id, name, logo_url, sort_order, show_on_homepage, show_in_footer) values ($1, $2, $3, $4, 990, false, false)",
    [SPONSOR.id, ALPHA, SPONSOR.name, "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='48'/%3E"],
  );
  await sql(
    "insert into onzio.page_daily_totals (club_id, local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped) values ($1, $2::date, 300, 190, 220, 200, 0, 0, 0)",
    [ALPHA, DAY],
  );
  await sql(
    "insert into onzio.sponsor_daily_rollups (club_id, local_date, sponsor_id, logo_views, logo_viewers, clicks) values ($1, $2::date, $3, 200, 130, 4)",
    [ALPHA, DAY, SPONSOR.id],
  );
});

test.afterAll(async () => {
  await removeFixtureRows();
  if (savedFlags !== undefined) {
    await sql("update onzio.clubs set admin_flags=$1::jsonb where id=$2", [JSON.stringify(savedFlags), ALPHA]);
  }
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The sidebar and print checks read the desktop frame.");
});

test("the classic sidebar lists Insights and opens the page in the classic frame", async ({ page }) => {
  await page.goto("/admin");
  const link = page.locator("#admin-sidebar").getByRole("link", { name: "Insights", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/admin\/insights$/);
  // UI-POLISH-INSIGHTS: the heading is the month's answer (only 2004-03 has numbers here).
  await expect(page.getByRole("heading", { level: 1, name: /^Your sponsors were seen 200 times in March 2004$/ })).toBeVisible();
  await expect(page.locator("[data-sponsor-table]")).toContainText("T06 Fixture Bakery");
  await expect(page.locator('[data-admin-insights-page="classic"]')).toBeVisible();
  await expect(page.locator('[data-admin-shell="reimagined"]')).toHaveCount(0);
  await expect(link).toHaveAttribute("data-active", "true");
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/insights-classic.png`, fullPage: true });
});

test("print: the classic frame and the pickers go, the sheet stays", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/insights/report?month=${MONTH}&sponsor=${SPONSOR.id.toLowerCase()}`);
  await expect(page.locator("[data-report-page]")).toHaveCount(1);
  await expect(page.locator('[data-admin-shell="reimagined"]')).toHaveCount(0);

  const sidebar = page.locator('[data-slot="sidebar"]');
  const header = page.locator(".admin-portal > div > header");
  const navs = page.locator(".admin-portal nav");
  const controls = page.locator("[data-report-controls]");
  const downloadPdf = page.getByRole("button", { name: "Print or save as PDF" });

  expect(await visibleCount(sidebar)).toBe(1);
  expect(await visibleCount(header)).toBe(1);
  expect(await visibleCount(navs)).toBeGreaterThan(0);
  await expect(controls).toBeVisible();
  await expect(downloadPdf).toBeVisible();
  await page.screenshot({ path: `${OUT}/report-classic-screen.png`, fullPage: true });

  await page.emulateMedia({ media: "print" });
  expect(await visibleCount(sidebar)).toBe(0);
  expect(await visibleCount(header)).toBe(0);
  expect(await visibleCount(navs)).toBe(0);
  await expect(controls).toBeHidden();
  await expect(downloadPdf).toBeHidden();
  await expect(page.locator("[data-report-page]")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCSS("padding-left", "0px");
  await expect(page.getByRole("main")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const sheet = await page.locator("[data-report-page]").boundingBox();
  expect(sheet?.x ?? 999).toBeLessThan(40);
  await page.screenshot({ path: `${OUT}/report-classic-print.png`, fullPage: true });
  await page.pdf({ path: `${OUT}/report-classic.pdf`, format: "Letter", printBackground: true });

  await page.emulateMedia({ media: "screen" });
  expect(await visibleCount(sidebar)).toBe(1);
  await expect(downloadPdf).toBeVisible();
});

test("without the flag the sidebar has no Insights and the page sends you to the dashboard", async ({ page }) => {
  await setFlag(false);
  try {
    await page.goto("/admin/insights");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator("#admin-sidebar").getByRole("link", { name: "Insights", exact: true })).toHaveCount(0);
    await page.goto("/admin/insights/report");
    await expect(page).toHaveURL(/\/admin$/);
  } finally {
    await setFlag(true);
  }
});
