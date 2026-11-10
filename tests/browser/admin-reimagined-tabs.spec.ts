import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-24: the five tabs that replace the RE-05 top bar and More list, on
// local Alpha at phone and laptop width, light and dark. Alpha stands in for
// Diverse City (programs on its website). Renamed to rose-city, with no
// published design and the Sponsor Insights flag, it stands in for Rose City:
// held, no programs, an Insights tab. Back on 'classic' it keeps the old admin.
// Every fixture is put back in a finally block. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const FIXTURE_OPPONENT = "RE-24 fixture opponent";
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

async function addUnscoredGame() {
  const [{ id: seasonId }] = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [year, month, day] = clubToday(zone).split("-").map(Number);
  const threeDaysAgo = new Date(Date.UTC(year, month - 1, day - 3)).toISOString().slice(0, 10);
  await sql("insert into onzio.matches (club_id, season_id, date, time, opponent) values ($1, $2, $3::date, '10:00', $4)", [
    ALPHA,
    seasonId,
    threeDaysAgo,
    FIXTURE_OPPONENT,
  ]);
}

async function removeFixtureGames() {
  await sql("delete from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, FIXTURE_OPPONENT]);
}

async function setTheme(context: BrowserContext, origin: string, theme: "light" | "dark") {
  await context.addCookies([{ name: "onzio-admin-theme", value: theme, url: origin }]);
}

function main(page: Page) {
  return page.getByRole("main");
}

/** The tab list that is showing at this width (the other one is display: none). */
function tabs(page: Page) {
  return page.getByRole("navigation", { name: "Club admin" });
}

async function tabLabels(page: Page) {
  return tabs(page).getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("data-tab")));
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

const ORIGIN = "http://alpha.localhost:3110";

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${width}px ${theme}`, () => {
      test.beforeEach(async ({ page, context }) => {
        await page.setViewportSize({ width, height: 844 });
        await setTheme(context, ORIGIN, theme);
      });

      test("a programs club gets Home · Games · Programs · Website · Club", async ({ page }) => {
        await page.goto("/admin");
        await expect(tabs(page)).toHaveCount(1);
        expect(await tabLabels(page)).toEqual(["home", "games", "programs", "website", "club"]);
        await expect(tabs(page).locator('[data-tab="home"]')).toHaveAttribute("aria-current", "page");
        // The bar sits at the bottom on a phone; a sidebar on a laptop.
        const box = await tabs(page).boundingBox();
        if (width === 390) expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
        else expect((box?.x ?? 999) + (box?.width ?? 999)).toBeLessThanOrEqual(252);
        await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/tabs-home-${width}-${theme}.png`, fullPage: true });
      });

      test("each tab has its own page with its main buttons and pages", async ({ page }) => {
        await page.goto("/admin");
        await tabs(page).locator('[data-tab="games"]').click();
        await expect(page).toHaveURL(/\/admin\/games$/);
        await expect(main(page).getByRole("heading", { level: 1, name: "Games and season" })).toBeVisible();
        await expect(tabs(page).locator('[data-tab="games"]')).toHaveAttribute("aria-current", "page");
        await expect(main(page).getByRole("link", { name: "Enter a score" })).toHaveAttribute("href", "/admin/score");
        await expect(main(page).getByRole("link", { name: "Add a game" })).toHaveAttribute("href", "/admin/add-game");
        const games = main(page).getByRole("region", { name: "Pages" });
        await expect(games.getByRole("link", { name: "Games", exact: true })).toHaveAttribute("href", "/admin/schedule");
        await expect(games.getByRole("link", { name: "League table" })).toHaveAttribute("href", "/admin/standings");
        await expect(games.getByRole("link", { name: "How the team is doing" })).toHaveAttribute("href", "/admin/analytics");
        await page.screenshot({ path: `${SHOTS}/tabs-games-${width}-${theme}.png`, fullPage: true });

        await tabs(page).locator('[data-tab="programs"]').click();
        await expect(main(page).getByRole("heading", { level: 1, name: "Programs and sign-ups" })).toBeVisible();
        const programs = main(page).getByRole("region", { name: "Pages" });
        await expect(programs.getByRole("link", { name: "Team roster" })).toHaveAttribute("href", "/admin/roster");
        await expect(programs.getByRole("link", { name: "Sign-up forms" })).toHaveAttribute("href", "/admin/registrations");
        await page.screenshot({ path: `${SHOTS}/tabs-programs-${width}-${theme}.png`, fullPage: true });

        await tabs(page).locator('[data-tab="website"]').click();
        await expect(main(page).getByRole("heading", { level: 1, name: "Your website" })).toBeVisible();
        await expect(main(page).getByTestId("admin-tab-status")).toHaveText("Your website is live");
        await expect(main(page).getByRole("link", { name: "Edit my website" })).toHaveAttribute("href", "/admin/homepage");
        await expect(main(page).getByTestId("admin-view-website")).toHaveAttribute("target", "_blank");
        await page.screenshot({ path: `${SHOTS}/tabs-website-${width}-${theme}.png`, fullPage: true });

        await tabs(page).locator('[data-tab="club"]').click();
        await expect(main(page).getByRole("heading", { level: 1, name: "Club and account" })).toBeVisible();
        const club = main(page).getByRole("region", { name: "Pages" });
        await expect(club.getByRole("link", { name: "Who can sign in" })).toHaveAttribute("href", "/admin/members");
        await expect(club.getByRole("link", { name: "Payments and plan" })).toHaveAttribute("href", "/admin/payments");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/tabs-club-${width}-${theme}.png`, fullPage: true });
      });

      test("a page under a tab gets ‹ back to that tab, and the tab stays lit", async ({ page }) => {
        await page.goto("/admin/roster");
        await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Team roster");
        await expect(tabs(page).locator('[data-tab="programs"]')).toHaveAttribute("aria-current", "true");
        const back = page.getByRole("banner").getByRole("link", { name: "Programs", exact: true });
        await expect(back).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/tabs-roster-${width}-${theme}.png` });
        await back.click();
        await expect(page).toHaveURL(/\/admin\/programs-and-sign-ups$/);
      });

      test("a missing score puts a red dot on Games, never on Home", async ({ page }) => {
        try {
          await addUnscoredGame();
          await page.goto("/admin");
          const games = tabs(page).locator('[data-tab="games"]');
          await expect(games).toContainText("needs you");
          await expect(tabs(page).locator('[data-tab="home"]')).not.toContainText("needs you");
          await games.click();
          await expect(main(page).getByTestId("admin-tab-status")).toHaveText("1 game needs a score");
          await page.screenshot({ path: `${SHOTS}/tabs-dot-${width}-${theme}.png` });
        } finally {
          await removeFixtureGames();
        }
      });

      test("the account menu on the avatar: view website, theme, sign out", async ({ page }) => {
        await page.goto("/admin/games");
        await page.getByTestId(width === 390 ? "admin-account-top" : "admin-account-side").click();
        const menu = page.getByRole("menu");
        await expect(menu.getByRole("menuitem", { name: "View website" })).toHaveAttribute("href", "/");
        await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
        await expect(menu).toHaveCSS("opacity", "1");
        await page.screenshot({ path: `${SHOTS}/tabs-account-${width}-${theme}.png` });
        await menu.getByRole("menuitem", { name: theme === "dark" ? "Light mode" : "Dark mode" }).click();
        await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme === "dark" ? "light" : "dark");
        await page.keyboard.press("Escape");
      });
    });
  }
}

test.describe("the homepage editor takes the whole phone screen", () => {
  test("the tab bar hides while the edit bar is up, and ‹ Website leads back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/homepage");
    await expect(page.getByTestId("admin-edit-bar")).toBeVisible();
    await expect(tabs(page)).toHaveCount(0);
    await page.getByTestId("admin-edit-bar").getByRole("link", { name: "Website", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/website$/);
    await expect(tabs(page)).toHaveCount(1);
  });
});

// Rose City stand-in: slug rose-city (held), no published design (so no
// programs or tryouts), and the Sponsor Insights flag.
test.describe("a held club without programs, with Sponsor Insights", () => {
  const RC = "http://rose-city.localhost:3110";
  let restore: (() => Promise<void>) | null = null;

  test.beforeAll(async () => {
    const [club] = await sql<{ slug: string; admin_flags: unknown }>("select slug, admin_flags from onzio.clubs where id=$1", [ALPHA]);
    const [state] = await sql<{ published_document_id: string | null; draft_document_id: string | null }>(
      "select published_document_id, draft_document_id from onzio.presentation_state where club_id=$1",
      [ALPHA],
    );
    restore = async () => {
      await sql("update onzio.presentation_state set published_document_id=$1, draft_document_id=$2 where club_id=$3", [
        state.published_document_id,
        state.draft_document_id,
        ALPHA,
      ]);
      await sql("update onzio.clubs set slug=$1, admin_flags=$2 where id=$3", [club.slug, JSON.stringify(club.admin_flags), ALPHA]);
    };
    await sql("update onzio.clubs set slug='rose-city', admin_flags=admin_flags || '{\"sponsor_insights\": true}'::jsonb where id=$1", [ALPHA]);
    await sql("update onzio.presentation_state set draft_document_id=coalesce(draft_document_id, published_document_id), published_document_id=null where club_id=$1", [ALPHA]);
  });

  test.afterAll(async () => {
    await restore?.();
  });

  for (const width of [390, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`Home · Games · Website · Insights · Club, and Insights says the site is not live (${width}px ${theme})`, async ({ page, context }) => {
        const cookies = await context.cookies(ORIGIN);
        await context.addCookies(cookies.map((cookie) => ({ ...cookie, domain: "rose-city.localhost" })));
        await setTheme(context, RC, theme);
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`${RC}/admin`);
        expect(await tabLabels(page)).toEqual(["home", "games", "website", "insights", "club"]);

        await page.goto(`${RC}/admin/games`);
        const games = main(page).getByRole("region", { name: "Pages" });
        await expect(games.getByRole("link", { name: "Team roster" })).toHaveAttribute("href", "/admin/roster");

        await page.goto(`${RC}/admin/website`);
        await expect(main(page).getByTestId("admin-tab-status")).toHaveText("Not live yet");

        await page.goto(`${RC}/admin/insights`);
        await expect(main(page).getByRole("heading", { level: 1, name: "Sponsor Insights" })).toBeVisible();
        await expect(main(page).getByTestId("insights-waiting")).toContainText("Your website isn’t live yet");
        await expect(main(page)).not.toContainText(/\b0 visits\b/);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/tabs-held-insights-${width}-${theme}.png`, fullPage: true });

        // No Programs tab, so its page sends the club home.
        await page.goto(`${RC}/admin/programs-and-sign-ups`);
        await expect(page).toHaveURL(/\/admin$/);
      });
    }
  }
});

// Diverse City stays on the classic admin: tab pages send it home and the
// classic sidebar is unchanged.
test.describe("a classic club keeps the old admin", () => {
  let previous = "reimagined";
  test.beforeAll(async () => {
    const [row] = await sql<{ admin_portal: string }>(
      "update onzio.clubs c set admin_portal='classic' from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
      [ALPHA],
    );
    previous = row.admin_portal;
  });
  test.afterAll(async () => {
    await sql("update onzio.clubs set admin_portal=$1 where id=$2", [previous, ALPHA]);
  });

  for (const width of [390, 1440]) {
    test(`no tabs, and tab pages go to the classic dashboard (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin/games");
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.locator('[data-admin-shell="reimagined"]')).toHaveCount(0);
      await expect(tabs(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Quick Actions" })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/tabs-classic-${width}.png` });
    });
  }
});
