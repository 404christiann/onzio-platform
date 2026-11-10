import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-22: Diverse City screens, proved on local Alpha (the academy
// stand-in). The public Next Match card takes its competition from the game, and
// the Programs page words are editable on the page in both portals. Each test
// seeds what it needs and removes it in a finally block. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const OPPONENT = "RE-22 Lakeshore United";
const COMPETITION = "UPSL Midwest Central";
const STANDINGS_TITLE = "Standings title that is not the competition";
const HEADLINE = "RE-22 Find your place";
const SHOTS = "test-results/admin-reimagined";
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

/** One game in Alpha's active season, `daysAhead` days from the club's today. */
async function addFutureGame(options: { home: boolean; competition: string | null; daysAhead?: number }): Promise<string> {
  const [{ id: seasonId }] = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [year, month, day] = clubToday(zone).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + (options.daysAhead ?? 10))).toISOString().slice(0, 10);
  const [{ id }] = await sql<{ id: string }>(
    `insert into onzio.matches (club_id, season_id, date, time, opponent, competition, home, venue)
     values ($1, $2, $3::date, '19:00', $4, $5, $6, 'Lakeshore Park') returning id`,
    [ALPHA, seasonId, date, OPPONENT, options.competition, options.home],
  );
  return id;
}

async function removeGames() {
  await sql("delete from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, OPPONENT]);
}

async function setStandingsTitle(title: string) {
  await sql(
    `insert into onzio.league_standings_settings (club_id, eyebrow, title, intro) values ($1, '', $2, '')
     on conflict (club_id) do update set title = excluded.title`,
    [ALPHA, title],
  );
}

async function clearStandingsTitle() {
  await sql("delete from onzio.league_standings_settings where club_id=$1", [ALPHA]);
}

async function setPortal(portal: "classic" | "reimagined") {
  await sql("update onzio.clubs set admin_portal=$2 where id=$1", [ALPHA, portal]);
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test("Next Match: an away game shows the game's own competition and Away, never the Standings title", async ({ page }) => {
      await addFutureGame({ home: false, competition: COMPETITION });
      await setStandingsTitle(STANDINGS_TITLE);
      try {
        await page.goto("/");
        const card = page.locator("section", { has: page.getByRole("heading", { name: "Next Match" }) });
        await expect(card.getByText(OPPONENT.toUpperCase(), { exact: false })).toBeVisible({ timeout: 15_000 });
        await expect(card.getByText(COMPETITION, { exact: true })).toBeVisible();
        await expect(card.getByText("Away", { exact: true })).toBeVisible();
        await expect(card.getByText(STANDINGS_TITLE)).toHaveCount(0);
        await expect(card.getByRole("link", { name: "Full Schedule" })).toHaveAttribute("href", /schedule/);
        await expectNoSideScroll(page, width);
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: `${SHOTS}/dc-next-match-away-${width}.png` });
      } finally {
        await removeGames();
        await clearStandingsTitle();
      }
    });

    test("Next Match: a home game with no competition shows Home and no competition line", async ({ page }) => {
      await addFutureGame({ home: true, competition: null });
      await setStandingsTitle(STANDINGS_TITLE);
      try {
        await page.goto("/");
        const card = page.locator("section", { has: page.getByRole("heading", { name: "Next Match" }) });
        await expect(card.getByText(OPPONENT.toUpperCase(), { exact: false })).toBeVisible({ timeout: 15_000 });
        await expect(card.getByText("Home", { exact: true })).toBeVisible();
        await expect(card.getByText(STANDINGS_TITLE)).toHaveCount(0);
        await expect(card.getByText(COMPETITION)).toHaveCount(0);
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: `${SHOTS}/dc-next-match-no-competition-${width}.png` });
      } finally {
        await removeGames();
        await clearStandingsTitle();
      }
    });

    test("Next Match: with no game it says so and keeps Full Schedule", async ({ page }) => {
      await removeGames();
      await page.goto("/");
      const card = page.locator("section", { has: page.getByRole("heading", { name: "Next Match" }) });
      await expect(card.getByText("No game coming up", { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText("Next Opponent")).toHaveCount(0);
      await expect(card.getByRole("link", { name: "Full Schedule" })).toBeVisible();
      await expectNoSideScroll(page, width);
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: `${SHOTS}/dc-next-match-none-${width}.png` });
    });

    for (const portal of ["classic", "reimagined"] as const) {
      test(`Programs page words are editable on the page (${portal} admin)`, async ({ page }) => {
        await setPortal(portal);
        try {
          await page.goto("/admin/programs");
          const main = page.getByRole("main");
          await expect(main.getByRole("heading", { name: "Programs page copy" })).toBeVisible({ timeout: 20_000 });
          // The page below the words box loads after it; give it the same time.
          await expect(main.getByText("Click a heading or paragraph to change its words")).toBeVisible({ timeout: 20_000 });
          await expect(main.getByText("managed by Onzio")).toHaveCount(0);
          await page.screenshot({ path: `${SHOTS}/dc-programs-${portal}-${width}.png`, fullPage: true });

          // A click on the page's heading opens the page header words and puts the cursor there.
          const canvas = page.frameLocator("iframe").first();
          await canvas.locator('[data-program-editor-section="Page heading"]').click({ timeout: 20_000 });
          await expect(main.getByLabel("Headline line 1")).toBeVisible();
          await expect(main.getByText("This wording is managed by Onzio")).toHaveCount(0);

          await main.getByLabel("Headline line 1").fill(HEADLINE);
          // The page itself shows the new words before anything is saved.
          await expect(canvas.getByRole("heading", { level: 1 })).toContainText(HEADLINE);
          await page.screenshot({ path: `${SHOTS}/dc-programs-${portal}-edited-${width}.png`, fullPage: true });

          await main.getByRole("button", { name: /^Save page copy/ }).click();
          await expect(main.getByText("Page copy saved")).toBeVisible();

          await page.goto("/programs");
          await expect(page.getByRole("heading", { level: 1 })).toContainText(HEADLINE);
        } finally {
          await sql("delete from onzio.programs_page_content where club_id=$1", [ALPHA]);
          await setPortal("reimagined");
        }
      });
    }
  });
}
