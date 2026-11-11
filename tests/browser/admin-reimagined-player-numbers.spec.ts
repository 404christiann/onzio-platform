import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-11c-2: player numbers after the game, the hub's "games need player
// numbers" and the Season totals page, on local Alpha (switched to
// 'reimagined' by admin-reimagined.global-setup.ts). A fixture season is shown
// for each test, with its own players and games; Alpha's own season and roster
// are put back afterwards. Phone and laptop, light and dark, with worst-case
// names. Screenshots land in test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const FIXTURE = "RE-11c-2 fixture";
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

type Saved = { activeSeasons: string[]; portal: string };

async function snapshot(): Promise<Saved> {
  const seasons = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
  const [club] = await sql<{ admin_portal: string }>("select admin_portal from onzio.clubs where id=$1", [ALPHA]);
  return { activeSeasons: seasons.map((row) => row.id), portal: club.admin_portal };
}

async function removeFixtures() {
  const seasons = (await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and label like $2", [ALPHA, `${FIXTURE}%`])).map((row) => row.id);
  const people = (await sql<{ id: string }>("select id from onzio.players where club_id=$1 and caption=$2", [ALPHA, FIXTURE])).map((row) => row.id);
  for (const table of ["player_match_stats", "goalkeeper_match_stats"]) {
    await sql(
      `delete from onzio.${table} where club_id=$1 and (player_id = any($2::uuid[]) or match_id in (select id from onzio.matches where club_id=$1 and season_id = any($3::uuid[])))`,
      [ALPHA, people, seasons],
    );
  }
  for (const table of ["player_season_stats", "goalkeeper_season_stats"]) {
    await sql(`delete from onzio.${table} where club_id=$1 and (player_id = any($2::uuid[]) or season_id = any($3::uuid[]))`, [ALPHA, people, seasons]);
  }
  await sql("delete from onzio.league_standings where club_id=$1 and season_id = any($2::uuid[])", [ALPHA, seasons]);
  await sql("delete from onzio.matches where club_id=$1 and season_id = any($2::uuid[])", [ALPHA, seasons]);
  await sql("update onzio.seasons set active=false where club_id=$1 and id = any($2::uuid[])", [ALPHA, seasons]);
  await sql("delete from onzio.seasons where club_id=$1 and id = any($2::uuid[])", [ALPHA, seasons]);
  await sql("delete from onzio.players where club_id=$1 and id = any($2::uuid[])", [ALPHA, people]);
}

async function restore(saved: Saved) {
  await removeFixtures();
  await sql("update onzio.seasons set active=false where club_id=$1", [ALPHA]);
  await sql("update onzio.seasons set active=true where club_id=$1 and id = any($2::uuid[])", [ALPHA, saved.activeSeasons]);
  await sql("update onzio.clubs set admin_portal=$2 where id=$1", [ALPHA, saved.portal]);
}

type Person = { key: string; name: string; number: number; position: "Goalkeeper" | "Defender" | "Midfielder" | "Forward" };

const SQUAD: Person[] = [
  { key: "keeper", name: "Ben Ward", number: 1, position: "Goalkeeper" },
  { key: "back", name: "Dana Ruiz", number: 4, position: "Defender" },
  { key: "mid", name: "Theo Grant", number: 8, position: "Midfielder" },
  { key: "ana", name: "Ana Ruiz", number: 9, position: "Forward" },
  { key: "kofi", name: "Kofi Mensah", number: 11, position: "Forward" },
];

const WORST: Person[] = [
  { key: "keeper", name: "Konstantin Oberhauser-Wettstein Jr.", number: 1, position: "Goalkeeper" },
  { key: "back", name: "Bartholomew Fitzgerald-Montgomery", number: 3, position: "Defender" },
  { key: "j", name: "J", number: 4, position: "Defender" },
  { key: "mid", name: "Đặng Thị Ngọc Hân", number: 8, position: "Midfielder" },
  { key: "ana", name: "Aleksandra Wiśniewska-Kowalczyk", number: 7, position: "Forward" },
  { key: "kofi", name: "王秀英", number: 999, position: "Forward" },
  { key: "fox", name: "🦊 Fox", number: 0, position: "Forward" },
];

async function clubDay(offset: number): Promise<string> {
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [y, m, d] = clubToday(zone).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

/** A fixture season shown for the test, with the squad in it. */
async function seed(squad: Person[]): Promise<{ season: string; people: Record<string, string> }> {
  await removeFixtures();
  const [season] = await sql<{ id: string }>(
    "insert into onzio.seasons (club_id, label, start_year, end_year, active) values ($1,$2,2031,2031,false) returning id",
    [ALPHA, FIXTURE],
  );
  await sql("update onzio.seasons set active=false where club_id=$1", [ALPHA]);
  await sql("update onzio.seasons set active=true where club_id=$1 and id=$2", [ALPHA, season.id]);
  const people: Record<string, string> = {};
  for (const person of squad) {
    const [row] = await sql<{ id: string }>(
      "insert into onzio.players (club_id, number, name, position, age, caption, active) values ($1,$2,$3,$4,20,$5,true) returning id",
      [ALPHA, person.number, person.name, person.position, FIXTURE],
    );
    people[person.key] = row.id;
    const table = person.position === "Goalkeeper" ? "goalkeeper_season_stats" : "player_season_stats";
    await sql(`insert into onzio.${table} (club_id, player_id, season_id) values ($1,$2,$3)`, [ALPHA, row.id, season.id]);
  }
  return { season: season.id, people };
}

async function addGame(season: string, opponent: string, daysAgo: number, ours: number | null, theirs: number | null): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into onzio.matches (club_id, season_id, date, time, opponent, competition, home, rose_city_score, opponent_score)
     values ($1,$2,$3::date,'10:00',$4,'League',true,$5,$6) returning id`,
    [ALPHA, season, await clubDay(-daysAgo), opponent, ours, theirs],
  );
  return row.id;
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

function row(page: Page, playerId: string) {
  return main(page).locator(`[data-player="${playerId}"]`);
}

let saved: Saved;

test.beforeAll(async () => {
  saved = await snapshot();
});

test.afterAll(async () => {
  await restore(saved);
});

for (const width of [390, 1440]) {
  test(`after a score, who played and scored, then the hub and the totals (${width}px)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const { season, people } = await seed(SQUAD);
    const game = await addGame(season, "Riverside FC", 3, null, null);
    const earlier = await addGame(season, "Harbor City SC", 10, 2, 0);

    // 1. Enter a score: 3–1, then the next step.
    await page.goto("/admin/score");
    const card = main(page).locator(`[data-score-game="${game}"]`);
    for (let goal = 0; goal < 3; goal += 1) {
      await card.getByRole("button", { name: "Add a goal for Alpha FC" }).click();
    }
    await card.getByRole("button", { name: "Add a goal for Riverside FC" }).click();
    await card.getByRole("button", { name: "Save score" }).click();
    await expect(card.getByTestId("score-pill")).toHaveText("Won 3–1");
    const next = card.getByTestId("who-played");
    await expect(next).toContainText("Who played and scored?");
    await expect(next).toContainText("You’ll find it in This season");
    await expect(next.getByRole("link", { name: "Add player numbers" })).toHaveAttribute("href", `/admin/score/${game}`);
    await expectNoSideScroll(page, width);
    await page.screenshot({ path: `${SHOTS}/player-numbers-ask-${width}.png`, fullPage: true });
    // "Later" puts the question away; the game waits in This season's Games card.
    await next.getByRole("button", { name: "Later" }).click();
    await expect(next).toHaveCount(0);

    // 2. The hub counts both scored games until someone is marked as played.
    await page.goto("/admin/seasons");
    await expect(main(page)).toContainText("2 games need player numbers");
    await expect(main(page)).toContainText("vs Riverside FC");
    await expect(main(page).getByRole("link", { name: "Add player numbers" })).toHaveAttribute(
      "href",
      `/admin/score/${game}?from=season`,
    );

    // With its score in, the game has left Enter a score.
    await page.goto("/admin/score");
    await expect(main(page).locator(`[data-score-game="${game}"]`)).toHaveCount(0);

    // 3. The list: goals mark a player as played, and the summary follows the score.
    await page.goto(`/admin/score/${game}?from=season`);
    await expect(main(page).getByRole("heading", { level: 1, name: "vs Riverside FC" })).toBeVisible();
    await expect(main(page).getByTestId("player-numbers-result")).toHaveText("Won 3–1");
    await expect(main(page).getByRole("link", { name: "Back to This season" })).toHaveAttribute("href", "/admin/seasons");
    const summary = main(page).getByTestId("goal-summary");
    await expect(summary).toContainText("0 of 3 goals added");

    const ana = row(page, people.ana);
    await ana.getByRole("button", { name: "Add one to goals for #9 Ana Ruiz" }).click();
    await expect(ana.getByRole("switch", { name: "#9 Ana Ruiz: played" })).toBeChecked();
    await expect(summary).toContainText("1 of 3 goals added");

    const kofi = row(page, people.kofi);
    await kofi.getByRole("button", { name: "Add one to goals for #11 Kofi Mensah" }).click();
    await kofi.getByRole("button", { name: "Add one to goals for #11 Kofi Mensah" }).click();
    await expect(summary).toContainText("3 of 3 goals added");
    await expect(summary).toHaveAttribute("data-ok", "true");

    // One goal back off: "Own goal or not sure" fills the gap.
    await kofi.getByRole("button", { name: "Take one from goals for #11 Kofi Mensah" }).click();
    await expect(summary).toContainText("2 of 3 goals added");
    await summary.getByRole("button", { name: "Own goal or not sure" }).click();
    await expect(summary).toContainText("3 of 3 goals added");

    // An assist, a keeper who played with no numbers, and a card once the player has played.
    const mid = row(page, people.mid);
    await mid.getByRole("button", { name: "Add one to assists for #8 Theo Grant" }).click();
    await mid.getByRole("button", { name: "Add one to yellow for #8 Theo Grant" }).click();
    await row(page, people.keeper).getByRole("switch", { name: "#1 Ben Ward: played" }).click();
    await expect(row(page, people.back).getByRole("button", { name: /yellow/ })).toHaveCount(0);
    await expectNoSideScroll(page, width);
    await page.screenshot({ path: `${SHOTS}/player-numbers-list-${width}.png`, fullPage: true });

    await page.getByTestId("save-player-numbers").filter({ visible: true }).click();
    await expect(page.getByTestId("save-player-numbers").filter({ visible: true })).toContainText("Saved · on each player’s page");

    const saved = await sql<{ player_id: string; played: boolean; goals: number; assists: number; yellow: number }>(
      "select player_id, played, goals, assists, yellow from onzio.player_match_stats where club_id=$1 and match_id=$2",
      [ALPHA, game],
    );
    const by = new Map(saved.map((r) => [r.player_id, r]));
    expect(by.get(people.ana)).toMatchObject({ played: true, goals: 1 });
    expect(by.get(people.kofi)).toMatchObject({ played: true, goals: 1 });
    expect(by.get(people.mid)).toMatchObject({ played: true, assists: 1, yellow: 1 });
    expect(by.get(people.back)).toMatchObject({ played: false, goals: 0 });
    const [keeper] = await sql<{ played: boolean }>(
      "select played from onzio.goalkeeper_match_stats where club_id=$1 and match_id=$2 and player_id=$3",
      [ALPHA, game, people.keeper],
    );
    expect(keeper.played).toBe(true);

    // 4. The hub now counts only the earlier game.
    await page.goto("/admin/seasons");
    await expect(main(page)).toContainText("1 game needs player numbers");
    await expect(main(page).getByRole("link", { name: "Add player numbers" })).toHaveAttribute(
      "href",
      `/admin/score/${earlier}?from=season`,
    );
    await expect(main(page)).toContainText("Added up from 1 game’s player numbers");

    // 5. Season totals: Ana has 1 goal from games; add 2 by hand.
    await main(page).getByRole("link", { name: "See totals" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/seasons/totals\\?season=${season}$`), { timeout: 15_000 });
    await expect(main(page).getByRole("heading", { level: 1, name: "Season totals" })).toBeVisible();
    const anaTotals = row(page, people.ana);
    await expect(anaTotals.getByTestId("total-goals")).toHaveText("1");
    await anaTotals.getByRole("button", { name: "Adjust Ana Ruiz" }).click();
    const sheet = page.getByRole("dialog", { name: "Add numbers for games that aren’t in Onzio" });
    await expect(sheet).toContainText("These add on top of the 1 game you entered.");
    await sheet.getByRole("button", { name: "Add one to goals for Ana Ruiz" }).click();
    await sheet.getByRole("button", { name: "Add one to goals for Ana Ruiz" }).click();
    await expect(sheet).toContainText("Total 3 · 1 from games");
    await page.screenshot({ path: `${SHOTS}/season-totals-adjust-${width}.png` });
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(main(page).getByTestId("totals-saved")).toContainText("Saved · on your website");
    await expect(anaTotals.getByTestId("total-goals")).toHaveText("3");
    await expect(anaTotals.getByTestId("hand-lines")).toContainText("Goals: 1 from games · 2 added by hand");
    const [adjustment] = await sql<{ goals: number }>(
      "select goals from onzio.player_season_adjustments where club_id=$1 and player_id=$2 and season_id=$3",
      [ALPHA, people.ana, season],
    );
    expect(adjustment.goals).toBe(2);

    // Taking off stops at what the games give, so the total never goes below 0.
    await anaTotals.getByRole("button", { name: "Adjust Ana Ruiz" }).click();
    const take = sheet.getByRole("button", { name: "Take one from goals for Ana Ruiz" });
    for (let step = 0; step < 3; step += 1) await take.click();
    await expect(take).toBeDisabled();
    await expect(sheet).toContainText("Total 0 · 1 from games");
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(anaTotals.getByTestId("total-goals")).toHaveText("3");
    await expectNoSideScroll(page, width);
    await page.screenshot({ path: `${SHOTS}/season-totals-${width}.png`, fullPage: true });
  });
}

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`worst case: long and non-Latin names, a 13-goal score (${width}px ${theme})`, async ({ page, context }) => {
      await setTheme(context, theme);
      await page.setViewportSize({ width, height: 900 });
      const { season, people } = await seed(WORST);
      const game = await addGame(season, "St. Bartholomew's Catholic Youth Athletic Association FC", 2, 13, 10);
      await sql(
        "insert into onzio.player_season_adjustments (club_id, player_id, season_id, goals, mins) values ($1,$2,$3,9999,9999)",
        [ALPHA, people.ana, season],
      );

      await page.goto(`/admin/score/${game}`);
      await expect(main(page).getByTestId("goal-summary")).toContainText("0 of 13 goals added");
      await row(page, people.ana).getByRole("button", { name: /Add one to goals/ }).click();
      await expect(main(page).getByTestId("goal-summary")).toContainText("1 of 13 goals added");
      // A long name wraps to two lines at most.
      const name = row(page, people.ana).locator("[title]").first();
      expect((await name.boundingBox())!.height).toBeLessThanOrEqual(44);
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/player-numbers-worst-${width}-${theme}.png`, fullPage: true });

      await page.goto("/admin/seasons/totals");
      await expect(row(page, people.ana).getByTestId("total-goals")).toHaveText("9,999");
      await expect(row(page, people.ana).getByTestId("hand-lines")).toContainText("Goals: 0 from games · 9,999 added by hand");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/season-totals-worst-${width}-${theme}.png`, fullPage: true });
    });
  }
}

test("an empty season says so on both pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { season } = await seed([]);
  const game = await addGame(season, "Riverside FC", 1, 0, 0);
  await page.goto(`/admin/score/${game}`);
  await expect(main(page).getByTestId("player-numbers-empty")).toContainText(`No players in ${FIXTURE} yet`);
  await expect(main(page).getByTestId("goal-summary")).toContainText("No goals in the score");
  await page.goto("/admin/seasons/totals");
  await expect(main(page)).toContainText(`No players in ${FIXTURE} yet`);
});

test("a game that is not the club's is not found, and a classic club gets the old pages", async ({ page }) => {
  const response = await page.goto("/admin/score/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
  const { season } = await seed(SQUAD);
  const game = await addGame(season, "Riverside FC", 1, 1, 0);
  await sql("update onzio.clubs set admin_portal='classic' where id=$1", [ALPHA]);
  try {
    await page.goto(`/admin/score/${game}`);
    await expect(page).toHaveURL(/\/admin\/stats\?view=match$/);
    await page.goto("/admin/seasons/totals");
    await expect(page).toHaveURL(/\/admin\/stats\?view=season$/);
  } finally {
    await sql("update onzio.clubs set admin_portal='reimagined' where id=$1", [ALPHA]);
  }
});
