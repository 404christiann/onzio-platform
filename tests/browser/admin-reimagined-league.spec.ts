import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-11b: the league table per season, and our row updating itself when a
// score is saved, on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width. Every test
// seeds its own rows and removes them in a finally block. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const OPPONENT = "RE-11b fixture opponent";
const OTHER_SEASON = "RE-11b spring";
// 60 characters with no space to break on: the longest name the box takes.
const LONG_NAME = "Wellington".repeat(6);
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

function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** The seed runs after the migrations, so Alpha's season already works out our row; make sure, and put it back in cleanup. */
async function seedTable(): Promise<string> {
  const [{ id: seasonId }] = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
  await sql("update onzio.seasons set standings_from_scores=true where id=$1", [seasonId]);
  await sql(
    `insert into onzio.league_standings (club_id, season_id, team_name, team_abbreviation, is_club, sort_order, played, wins, draws, losses, goal_difference, points)
     values ($1,$2,'Alpha FC','ALP',true,0,0,0,0,0,0,0),
            ($1,$2,'Rivals FC','RIV',false,1,4,3,0,1,5,9),
            ($1,$2,'${LONG_NAME}',null,false,2,4,1,1,2,-2,4)`,
    [ALPHA, seasonId],
  );
  return seasonId;
}

async function addPastGame(seasonId: string, leagueGame = true): Promise<string> {
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [year, month, day] = clubToday(zone).split("-").map(Number);
  const threeDaysAgo = new Date(Date.UTC(year, month - 1, day - 3)).toISOString().slice(0, 10);
  const [{ id }] = await sql<{ id: string }>(
    `insert into onzio.matches (club_id, season_id, date, time, opponent, competition, home, league_game)
     values ($1,$2,$3::date,'10:00',$4,'League',true,$5) returning id`,
    [ALPHA, seasonId, threeDaysAgo, OPPONENT, leagueGame],
  );
  return id;
}

async function cleanup() {
  await sql("update onzio.seasons set standings_from_scores=true where club_id=$1 and active", [ALPHA]);
  await sql("delete from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, OPPONENT]);
  await sql("delete from onzio.seasons where club_id=$1 and label=$2", [ALPHA, OTHER_SEASON]);
  await sql(
    "delete from onzio.league_standings where club_id=$1 and (team_name in ('Alpha FC','Rivals FC') or team_name = $2)",
    [ALPHA, LONG_NAME],
  );
}

async function ourRow(seasonId: string) {
  const [row] = await sql<{ played: number; wins: number; goal_difference: number; points: number }>(
    "select played, wins, goal_difference, points from onzio.league_standings where club_id=$1 and season_id=$2 and is_club",
    [ALPHA, seasonId],
  );
  return row;
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await cleanup();
    });
    test.afterEach(cleanup);

    test("saving a score on Enter a score moves our row, and it shows on the Standings page", async ({ page }) => {
      const seasonId = await seedTable();
      const gameId = await addPastGame(seasonId);
      await page.goto("/admin/score");
      const card = main(page).locator(`[data-score-game="${gameId}"]`);
      await expect(card.getByTestId("score-pill")).toHaveText("Result missing");
      for (let goal = 0; goal < 2; goal += 1) {
        await card.getByRole("group", { name: "Alpha FC score" }).getByRole("button", { name: "Add a goal for Alpha FC" }).click();
      }
      await card.getByRole("button", { name: "Save score" }).click();
      await expect(card.getByTestId("score-pill")).toHaveText("Won 2–0");
      expect(await ourRow(seasonId)).toEqual({ played: 1, wins: 1, goal_difference: 2, points: 3 });

      await page.goto("/admin/standings");
      const seasonPicker = page.getByTestId("standings-season");
      await expect(seasonPicker.getByLabel("Season")).toBeVisible();
      const ours = main(page).locator("tr", { has: page.locator('input[aria-label="Team name"][value="Alpha FC"]') });
      await expect(ours.getByLabel("Games played")).toHaveValue("1");
      await expect(ours.getByLabel("Points")).toHaveValue("3");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/league-score-updates-table-${width}.png`, fullPage: true });

      // Editing the score keeps the row right; clearing it puts the game back.
      await sql("update onzio.matches set rose_city_score=0, opponent_score=1 where id=$1", [gameId]);
      expect(await ourRow(seasonId)).toEqual({ played: 1, wins: 0, goal_difference: -1, points: 0 });
      await sql("update onzio.matches set rose_city_score=null, opponent_score=null where id=$1", [gameId]);
      expect(await ourRow(seasonId)).toEqual({ played: 0, wins: 0, goal_difference: 0, points: 0 });
    });

    test("a friendly is kept out of the table", async ({ page }) => {
      const seasonId = await seedTable();
      await page.goto("/admin/add-game");
      const league = page.getByTestId("add-game-league");
      await expect(league.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
      await league.getByRole("radio", { name: "No" }).click();
      await expect(main(page).getByText("Friendlies and cups stay out of your league table.")).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/league-add-game-friendly-${width}.png`, fullPage: true });
      const friendly = await addPastGame(seasonId, false);
      await sql("update onzio.matches set rose_city_score=5, opponent_score=0 where id=$1", [friendly]);
      expect(await ourRow(seasonId)).toEqual({ played: 0, wins: 0, goal_difference: 0, points: 0 });
    });

    test("our row is read-only here, and a page opened before a score was saved cannot put the old numbers back", async ({ page }) => {
      const seasonId = await seedTable();
      await page.goto("/admin/standings");
      const ours = main(page).locator("tr", { has: page.locator('input[aria-label="Team name"][value="Alpha FC"]') });
      await expect(ours.getByLabel("Games played")).toHaveValue("0");
      for (const label of ["Games played", "Wins", "Draws", "Losses", "Goal difference", "Points"]) {
        await expect(ours.getByLabel(label)).toHaveAttribute("readonly", "");
      }
      await expect(page.getByTestId("standings-auto-note")).toBeVisible();
      // Another team's numbers stay typeable.
      const rivals = main(page).locator("tr", { has: page.locator('input[aria-label="Team name"][value="Rivals FC"]') });
      await expect(rivals.getByLabel("Games played")).not.toHaveAttribute("readonly", "");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/league-our-row-read-only-${width}.png`, fullPage: true });

      // A score is saved elsewhere while this page (showing zeros) stays open; then this page is saved.
      const gameId = await addPastGame(seasonId);
      await sql("update onzio.matches set rose_city_score=2, opponent_score=0 where id=$1", [gameId]);
      expect(await ourRow(seasonId)).toEqual({ played: 1, wins: 1, goal_difference: 2, points: 3 });
      await rivals.getByLabel("Games played").fill("5");
      await page.getByRole("button", { name: "Save Standings" }).click();
      await expect(page.getByText("Saved", { exact: false }).first()).toBeVisible();
      expect(await ourRow(seasonId)).toEqual({ played: 1, wins: 1, goal_difference: 2, points: 3 });
      await page.reload();
      await expect(
        main(page).locator("tr", { has: page.locator('input[aria-label="Team name"][value="Alpha FC"]') }).getByLabel("Games played"),
      ).toHaveValue("1");
      const [{ played }] = await sql<{ played: number }>("select played from onzio.league_standings where club_id=$1 and team_name='Rivals FC'", [ALPHA]);
      expect(played).toBe(5);
    });

    test("each season has its own table; starting a season copies the teams at zero", async ({ page }) => {
      const seasonId = await seedTable();
      // This season is typed by hand (as every season before ADMIN-RE-11b is); the one started below works out ours.
      await sql("update onzio.seasons set standings_from_scores=false where id=$1", [seasonId]);
      await sql("update onzio.league_standings set played=4, points=7 where club_id=$1 and season_id=$2 and is_club", [ALPHA, seasonId]);
      await sql("insert into onzio.seasons (club_id,label,start_year,end_year) values ($1,$2,2099,2099)", [ALPHA, OTHER_SEASON]);
      const [{ id: nextId }] = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and label=$2", [ALPHA, OTHER_SEASON]);
      const copied = await sql("select team_name, played, points from onzio.league_standings where club_id=$1 and season_id=$2 order by sort_order", [ALPHA, nextId]);
      expect(copied.map((row) => [row.team_name, row.played, row.points])).toEqual([
        ["Alpha FC", 0, 0],
        ["Rivals FC", 0, 0],
        [LONG_NAME, 0, 0],
      ]);

      await page.goto("/admin/standings");
      const picker = page.getByTestId("standings-season").getByLabel("Season");
      await expect(picker).toHaveValue(seasonId);
      const ours = () => main(page).locator("tr", { has: page.locator('input[aria-label="Team name"][value="Alpha FC"]') });
      await expect(ours().getByLabel("Games played")).toHaveValue("4");
      await page.screenshot({ path: `${SHOTS}/league-season-shown-${width}.png`, fullPage: true });

      await picker.selectOption(nextId);
      await expect(ours().getByLabel("Games played")).toHaveValue("0");
      await expect(main(page).locator('input[aria-label="Team name"]')).toHaveCount(3);
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/league-season-started-${width}.png`, fullPage: true });

      // The 60-character name fits, and the box stops at 60.
      const longName = main(page).locator('input[aria-label="Team name"]').nth(2);
      await expect(longName).toHaveAttribute("maxlength", "60");
    });
  });
}
