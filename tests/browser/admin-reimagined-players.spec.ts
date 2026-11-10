import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-24d: players in the Games tab on local Alpha (design:
// admin-plain-search-two-clubs.html). A fixture season is shown for the run,
// with four forwards-and-midfielders, results, and one game missing its score;
// Alpha's own season and roster are put back afterwards. Phone and laptop,
// light and dark. Screenshots land in test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const FIXTURE = "RE-24d fixture";
const SHOTS = "test-results/admin-reimagined";
const ORIGIN = "http://alpha.localhost:3110";
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

type Saved = { activeSeasons: string[]; activePlayers: string[] };

async function snapshot(): Promise<Saved> {
  const seasons = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
  const players = await sql<{ id: string }>("select id from onzio.players where club_id=$1 and active and caption is distinct from $2", [ALPHA, FIXTURE]);
  return { activeSeasons: seasons.map((row) => row.id), activePlayers: players.map((row) => row.id) };
}

async function removeFixtures() {
  const seasons = (await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and label=$2", [ALPHA, FIXTURE])).map((row) => row.id);
  const people = (await sql<{ id: string }>("select id from onzio.players where club_id=$1 and caption=$2", [ALPHA, FIXTURE])).map((row) => row.id);
  await sql(
    "delete from onzio.player_match_stats where club_id=$1 and (player_id = any($2::uuid[]) or match_id in (select id from onzio.matches where club_id=$1 and season_id = any($3::uuid[])))",
    [ALPHA, people, seasons],
  );
  await sql("delete from onzio.player_season_stats where club_id=$1 and (player_id = any($2::uuid[]) or season_id = any($3::uuid[]))", [ALPHA, people, seasons]);
  await sql("delete from onzio.matches where club_id=$1 and season_id = any($2::uuid[])", [ALPHA, seasons]);
  await sql("update onzio.seasons set active=false where club_id=$1 and id = any($2::uuid[])", [ALPHA, seasons]);
  await sql("delete from onzio.seasons where club_id=$1 and id = any($2::uuid[])", [ALPHA, seasons]);
  await sql("delete from onzio.players where club_id=$1 and id = any($2::uuid[])", [ALPHA, people]);
}

async function restore(saved: Saved) {
  await removeFixtures();
  await sql("update onzio.seasons set active = (id = any($2::uuid[])) where club_id=$1", [ALPHA, saved.activeSeasons]);
  await sql("update onzio.players set active=true where club_id=$1 and id = any($2::uuid[])", [ALPHA, saved.activePlayers]);
}

const PEOPLE = [
  { key: "maya", name: "Maya Chen", number: 11, position: "Forward", season: [11, 4, 14, 9, 900, 10] },
  { key: "sam", name: "Sam Okafor", number: 9, position: "Forward", season: [6, 3, 8, 12, 864, 12] },
  { key: "noah", name: "Noah Kim", number: 7, position: "Forward", season: [1, 2, 5, 4, 410, 5] },
  { key: "leo", name: "Leo Park", number: 8, position: "Midfielder", season: [4, 7, 6, 10, 800, 9] },
] as const;

async function seed(): Promise<Record<string, string>> {
  await removeFixtures();
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [y, m, d] = clubToday(zone).split("-").map(Number);
  const day = (offset: number) => new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  const [season] = await sql<{ id: string }>(
    "insert into onzio.seasons (club_id, label, start_year, end_year, active) values ($1,$2,2027,2027,false) returning id",
    [ALPHA, FIXTURE],
  );
  await sql("update onzio.seasons set active = (id = $2) where club_id=$1", [ALPHA, season.id]);
  await sql("update onzio.players set active=false where club_id=$1 and caption is distinct from $2", [ALPHA, FIXTURE]);
  const games: string[] = [];
  for (const [offset, vs, us, them] of [[-24, "Prairie Fire FC", 2, 1], [-17, "Northgate Athletic", 4, 2], [-10, "Harbor City SC", 3, 2]] as const) {
    const [row] = await sql<{ id: string }>(
      "insert into onzio.matches (club_id, season_id, date, time, opponent, home, rose_city_score, opponent_score) values ($1,$2,$3,'10:00',$4,true,$5,$6) returning id",
      [ALPHA, season.id, day(offset), vs, us, them],
    );
    games.push(row.id);
  }
  await sql(
    "insert into onzio.matches (club_id, season_id, date, time, opponent, home) values ($1,$2,$3,'10:00','Lakeshore United',true)",
    [ALPHA, season.id, day(-3)],
  );
  const ids: Record<string, string> = {};
  for (const person of PEOPLE) {
    const [row] = await sql<{ id: string }>(
      "insert into onzio.players (club_id, number, name, position, age, caption, active) values ($1,$2,$3,$4,20,$5,true) returning id",
      [ALPHA, person.number, person.name, person.position, FIXTURE],
    );
    ids[person.key] = row.id;
    const [goals, assists, fouled, tackles, mins, starts] = person.season;
    await sql(
      "insert into onzio.player_season_stats (club_id, player_id, season_id, goals, assists, fouls_suffered, tackles, mins, starts) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [ALPHA, row.id, season.id, goals, assists, fouled, tackles, mins, starts],
    );
    for (const [index, matchId] of games.entries()) {
      await sql("insert into onzio.player_match_stats (club_id, player_id, match_id, mins, goals, assists) values ($1,$2,$3,$4,$5,0)", [
        ALPHA,
        row.id,
        matchId,
        90 - index * 10,
        index === 2 ? 1 : 0,
      ]);
    }
  }
  return ids;
}

function main(page: Page) {
  return page.getByRole("main");
}

async function setTheme(context: BrowserContext, theme: "light" | "dark") {
  await context.addCookies([{ name: "onzio-admin-theme", value: theme, url: ORIGIN }]);
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

let saved: Saved;
let ids: Record<string, string> = {};

test.beforeAll(async () => {
  saved = await snapshot();
  ids = await seed();
});

test.afterAll(async () => {
  await restore(saved);
});

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Players card, player page, chips and Enter score (${width}px ${theme})`, async ({ page, context }) => {
      await setTheme(context, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/games");

      // The season card in magenta: three wins from the fixture results.
      const season = main(page).getByTestId("games-season-card");
      await expect(season).toContainText("Top scorer: Maya Chen, 11 goals");
      await expect(season).toContainText("3Won");

      const players = main(page).getByTestId("games-players");
      await expect(players.getByRole("group", { name: "Forwards" }).getByRole("link")).toHaveCount(3);
      await expect(players.getByRole("group", { name: "Midfielders" })).toContainText("Leo Park");
      await expect(players.getByRole("link", { name: "See all 4 players" })).toHaveAttribute("href", "/admin/analytics");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/players-games-${width}-${theme}.png`, fullPage: true });

      await players.getByRole("link", { name: /Maya Chen/ }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/games/players/${ids.maya}$`));
      await expect(main(page).getByRole("heading", { level: 1, name: "Maya Chen" })).toBeVisible();
      await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Maya Chen");
      await expect(page.getByRole("banner").getByRole("link", { name: "Games", exact: true })).toHaveAttribute("href", "/admin/games");
      await expect(page.getByRole("navigation", { name: "Club admin" }).locator('[data-tab="games"]')).toHaveAttribute("aria-current", "true");

      // RE-19's chart and recent games, fed by its own read.
      await expect(main(page).getByTestId("analytics-player")).toBeVisible();
      await expect(main(page).getByTestId("analytics-log-game").first()).toBeVisible();
      // The game still missing its score comes first, with Enter score.
      const missing = main(page).getByTestId("player-missing-score");
      await expect(missing).toContainText("vs Lakeshore United");
      await expect(missing.getByRole("link", { name: "Enter score" })).toHaveAttribute("href", "/admin/score");

      const chips = main(page).getByRole("navigation", { name: "Forwards" });
      await expect(chips.getByRole("link")).toHaveCount(3);
      await expect(chips.getByRole("link", { name: "Maya Chen" })).toHaveAttribute("aria-current", "page");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/players-maya-${width}-${theme}.png`, fullPage: true });

      await chips.getByRole("link", { name: "Sam Okafor" }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/games/players/${ids.sam}$`));
      await expect(main(page).getByRole("heading", { level: 1, name: "Sam Okafor" })).toBeVisible();
      await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Sam Okafor");
    });
  }
}

test("a player who is not in the club's season is not found", async ({ page }) => {
  const response = await page.goto("/admin/games/players/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
});
