import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// ADMIN-RE-19: "How the team is doing" on local Alpha (switched to 'reimagined'
// by admin-reimagined.global-setup.ts), at phone and laptop width. Every row the
// spec adds is tagged "RE-19 fixture" and removed in a finally block, pass or
// fail. The fixture season is the one the website shows for the run and Alpha's
// own season and players are put back as they were. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const FIXTURE = "RE-19 fixture";
const SEASON_LABEL = `${FIXTURE} 2027`;
const SHOTS = "test-results/admin-reimagined";
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

// ── Fixture data ─────────────────────────────────────────────────────────────

type Game = { vs: string; date: string; us: number | null; them: number | null };
type Person = {
  key: string;
  name: string;
  position: "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
  number: number;
  /** Season totals: goals, assists, fouls won, tackles, minutes, starts. */
  season?: [number, number, number, number, number, number];
  /** Per game, by index into the games: minutes, goals, assists. */
  log?: Record<number, [number, number, number]>;
  /** A keeper's season totals: saves, clean sheets, starts, minutes. */
  keeper?: [number, number, number, number];
};

// The design's own season (cd-analytics-a): W8 D3 L1, 27 scored, 14 let in
const DEMO_GAMES: Game[] = [
  { vs: "Riverside FC", date: "2026-08-16", us: 1, them: 2 },
  { vs: "Northgate Athletic", date: "2026-08-23", us: 2, them: 2 },
  { vs: "Harbor City SC", date: "2026-08-30", us: 3, them: 1 },
  { vs: "Westfield Rovers", date: "2026-09-06", us: 2, them: 0 },
  { vs: "Lakeshore United", date: "2026-09-13", us: 1, them: 1 },
  { vs: "Pinecrest FC", date: "2026-09-20", us: 3, them: 2 },
  { vs: "Summit Valley SC", date: "2026-09-27", us: 2, them: 0 },
  { vs: "Brookside Town", date: "2026-10-04", us: 4, them: 2 },
  { vs: "Oakmont Wanderers", date: "2026-10-11", us: 3, them: 0 },
  { vs: "Riverside FC", date: "2026-10-18", us: 1, them: 1 },
  { vs: "Northgate Athletic", date: "2026-10-25", us: 2, them: 1 },
  { vs: "Harbor City SC", date: "2026-11-01", us: 3, them: 2 },
];

// cd-analytics-b: Maya Chen and Sam Okafor, forwards
const maya: Person = {
  key: "maya",
  name: "Maya Chen",
  position: "Forward",
  number: 11,
  season: [11, 4, 14, 9, 900, 10],
  log: {
    0: [90, 1, 0], 1: [90, 1, 0], 2: [85, 1, 1], 3: [90, 0, 1], 4: [78, 1, 0], 5: [90, 1, 0],
    7: [90, 2, 1], 8: [72, 1, 0], 9: [90, 0, 1], 10: [35, 1, 0], 11: [90, 2, 0],
  },
};
const sam: Person = {
  key: "sam",
  name: "Sam Okafor",
  position: "Forward",
  number: 9,
  season: [6, 3, 8, 12, 864, 12],
  log: {
    0: [70, 0, 1], 1: [75, 1, 0], 2: [90, 0, 0], 3: [60, 1, 0], 4: [72, 0, 0], 5: [65, 1, 1],
    6: [90, 1, 0], 7: [58, 1, 0], 8: [80, 0, 1], 9: [64, 0, 0], 10: [70, 0, 0], 11: [70, 1, 0],
  },
};
const ava: Person = { key: "ava", name: "Ava Ruiz", position: "Defender", number: 4, season: [1, 0, 3, 20, 700, 9], log: { 7: [90, 1, 0] } };
const leo: Person = { key: "leo", name: "Leo Park", position: "Midfielder", number: 8, season: [4, 7, 5, 6, 800, 11], log: { 7: [90, 0, 2] } };
const kai: Person = { key: "kai", name: "Kai Lund", position: "Goalkeeper", number: 1, keeper: [40, 3, 10, 900], log: { 7: [90, 0, 0] } };

const DEMO_PEOPLE = [maya, sam, ava, leo, kai];

// break-ui: very long and non-Latin names, an emoji, a player with no minutes,
// 38 games, the highest scores the data allows
const WORST_OPPONENTS = [
  "Northgate Athletic Club Under-14 Girls Elite Division Reserves",
  "FC Östersunds-Västerbotten Ungdomsförening",
  "Спортивний клуб Динамо Київ",
  "東京ユナイテッドフットボールクラブ",
];
const WORST_GAMES: Game[] = Array.from({ length: 38 }, (_, index) => {
  const month = 1 + Math.floor(index / 4);
  const day = 1 + (index % 4) * 7;
  return {
    vs: WORST_OPPONENTS[index % WORST_OPPONENTS.length]!,
    date: `2027-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    us: index === 37 ? 99 : index % 5 === 0 ? 12 : index % 4,
    them: index === 37 ? 0 : index % 5 === 0 ? 11 : index % 3,
  };
});
const WORST_PEOPLE: Person[] = [
  {
    key: "aleksandra",
    name: "Aleksandra Wiśniewska-Kowalczyk",
    position: "Forward",
    number: 999,
    season: [27, 1204, 61, 143, 3420, 38],
    log: { 0: [120, 5, 3], 1: [300, 1, 0], 37: [90, 3, 1] },
  },
  { key: "jo", name: "Jo", position: "Forward", number: 0, season: [0, 0, 0, 0, 0, 0] },
  { key: "chris", name: "Christopher Alexander Montgomery III", position: "Forward", number: 107, season: [1, 0, 0, 0, 90, 1], log: { 3: [90, 1, 0] } },
  { key: "xiu", name: "王秀英", position: "Forward", number: 3, season: [2, 0, 1, 1, 180, 2], log: { 3: [90, 1, 0] } },
  { key: "fox", name: "🦊 Fox", position: "Midfielder", number: 8, season: [4, 0, 0, 0, 90, 1], log: { 3: [90, 0, 0] } },
];

type Seeded = { people: Record<string, string>; games: string[]; season: string };

type Snapshot = {
  seasons: { id: string; active: boolean }[];
  players: { id: string }[];
  portal: string;
};

async function snapshot(): Promise<Snapshot> {
  const seasons = await sql<{ id: string; active: boolean }>(
    "select id, active from onzio.seasons where club_id=$1 and label not like $2",
    [ALPHA, `${FIXTURE}%`],
  );
  const players = await sql<{ id: string }>("select id from onzio.players where club_id=$1 and active and caption is distinct from $2", [ALPHA, FIXTURE]);
  const [club] = await sql<{ admin_portal: string }>("select admin_portal from onzio.clubs where id=$1", [ALPHA]);
  return { seasons, players, portal: club.admin_portal };
}

async function removeFixtures() {
  const seasons = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and label like $2", [ALPHA, `${FIXTURE}%`]);
  const seasonIds = seasons.map((row) => row.id);
  const people = await sql<{ id: string }>("select id from onzio.players where club_id=$1 and caption=$2", [ALPHA, FIXTURE]);
  const personIds = people.map((row) => row.id);
  await sql(
    "delete from onzio.player_match_stats where club_id=$1 and (player_id = any($2::uuid[]) or match_id in (select id from onzio.matches where club_id=$1 and season_id = any($3::uuid[])))",
    [ALPHA, personIds, seasonIds],
  );
  await sql(
    "delete from onzio.goalkeeper_match_stats where club_id=$1 and (player_id = any($2::uuid[]) or match_id in (select id from onzio.matches where club_id=$1 and season_id = any($3::uuid[])))",
    [ALPHA, personIds, seasonIds],
  );
  await sql("delete from onzio.player_season_stats where club_id=$1 and (player_id = any($2::uuid[]) or season_id = any($3::uuid[]))", [ALPHA, personIds, seasonIds]);
  await sql("delete from onzio.goalkeeper_season_stats where club_id=$1 and (player_id = any($2::uuid[]) or season_id = any($3::uuid[]))", [ALPHA, personIds, seasonIds]);
  await sql("delete from onzio.matches where club_id=$1 and season_id = any($2::uuid[])", [ALPHA, seasonIds]);
  await sql("update onzio.seasons set active=false where club_id=$1 and id = any($2::uuid[])", [ALPHA, seasonIds]);
  await sql("delete from onzio.seasons where club_id=$1 and id = any($2::uuid[])", [ALPHA, seasonIds]);
  await sql("delete from onzio.players where club_id=$1 and id = any($2::uuid[])", [ALPHA, personIds]);
}

/** Puts Alpha back: its own season shown, its own players on the roster, its own admin. */
async function restore(saved: Snapshot) {
  await removeFixtures();
  await sql("update onzio.seasons set active=false where club_id=$1", [ALPHA]);
  for (const season of saved.seasons.filter((s) => s.active)) {
    await sql("update onzio.seasons set active=true where club_id=$1 and id=$2", [ALPHA, season.id]);
  }
  if (saved.players.length) {
    await sql("update onzio.players set active=true where club_id=$1 and id = any($2::uuid[])", [ALPHA, saved.players.map((p) => p.id)]);
  }
  await sql("update onzio.clubs set admin_portal=$2 where id=$1", [ALPHA, saved.portal]);
}

async function seed(games: Game[], people: Person[], options: { showSeason?: boolean; keepRoster?: boolean } = {}): Promise<Seeded> {
  await removeFixtures();
  const [season] = await sql<{ id: string }>(
    "insert into onzio.seasons (club_id, label, start_year, end_year, active) values ($1,$2,2027,2027,false) returning id",
    [ALPHA, SEASON_LABEL],
  );
  await sql("update onzio.seasons set active=false where club_id=$1", [ALPHA]);
  if (options.showSeason !== false) {
    await sql("update onzio.seasons set active=true where club_id=$1 and id=$2", [ALPHA, season.id]);
  }
  if (!options.keepRoster) {
    await sql("update onzio.players set active=false where club_id=$1 and caption is distinct from $2", [ALPHA, FIXTURE]);
  }
  const ids: string[] = [];
  for (const game of games) {
    const [row] = await sql<{ id: string }>(
      `insert into onzio.matches (club_id, season_id, date, time, opponent, home, rose_city_score, opponent_score)
       values ($1,$2,$3,'10:00',$4,true,$5,$6) returning id`,
      [ALPHA, season.id, game.date, game.vs, game.us, game.them],
    );
    ids.push(row.id);
  }
  const byKey: Record<string, string> = {};
  for (const person of people) {
    const [row] = await sql<{ id: string }>(
      "insert into onzio.players (club_id, number, name, position, age, caption, active) values ($1,$2,$3,$4,20,$5,true) returning id",
      [ALPHA, person.number, person.name, person.position, FIXTURE],
    );
    byKey[person.key] = row.id;
    if (person.keeper) {
      const [saves, clean, starts, mins] = person.keeper;
      await sql(
        "insert into onzio.goalkeeper_season_stats (club_id, player_id, season_id, saves, clean_sheets, starts, mins) values ($1,$2,$3,$4,$5,$6,$7)",
        [ALPHA, row.id, season.id, saves, clean, starts, mins],
      );
    } else if (person.season) {
      const [goals, assists, fouled, tackles, mins, starts] = person.season;
      await sql(
        `insert into onzio.player_season_stats (club_id, player_id, season_id, goals, assists, fouls_suffered, tackles, mins, starts)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ALPHA, row.id, season.id, goals, assists, fouled, tackles, mins, starts],
      );
    }
    for (const [index, [mins, goals, assists]] of Object.entries(person.log ?? {})) {
      const matchId = ids[Number(index)];
      if (!matchId) continue;
      if (person.position === "Goalkeeper") {
        await sql("insert into onzio.goalkeeper_match_stats (club_id, player_id, match_id, mins, saves, goals_against) values ($1,$2,$3,$4,5,1)", [ALPHA, row.id, matchId, mins]);
      } else {
        await sql(
          "insert into onzio.player_match_stats (club_id, player_id, match_id, mins, goals, assists) values ($1,$2,$3,$4,$5,$6)",
          [ALPHA, row.id, matchId, mins, goals, assists],
        );
      }
    }
  }
  return { people: byKey, games: ids, season: season.id };
}

// ── Page helpers ─────────────────────────────────────────────────────────────

function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

async function openAnalytics(page: Page) {
  await page.goto("/admin/analytics");
  await expect(main(page).getByRole("heading", { level: 1, name: "How the team is doing" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** Lines a block takes, and whether its text is cut. */
async function measure(locator: Locator) {
  return locator.evaluate((element) => {
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    return { lines: Math.round(element.getBoundingClientRect().height / lineHeight), cutAcross: element.scrollWidth > element.clientWidth };
  });
}

async function pickPlayer(page: Page, width: number, seeded: Seeded, key: string, name: string) {
  if (width < 640) {
    await page.getByTestId(`analytics-row-${seeded.people[key]}`).click();
    await expect(page.getByTestId("analytics-player-name")).toBeVisible();
  } else {
    await page.getByTestId(`analytics-chip-${seeded.people[key]}`).click();
  }
  await expect(page.getByTestId("analytics-player-name")).toHaveText(name);
}

for (const width of [390, 1440]) {
  const narrow = width < 640;
  test.describe(`${width}px`, () => {
    let saved: Snapshot;

    test.beforeAll(async () => {
      saved = await snapshot();
    });

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test.afterAll(async () => {
      await restore(saved);
    });

    test("reads the season game by game, opens one game, and lists every game", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await seed(DEMO_GAMES, DEMO_PEOPLE);
        await openAnalytics(page);

        await expect(page.getByTestId("analytics-season")).toHaveText(`${SEASON_LABEL} season, from the scores you enter`);
        await expect(page.getByTestId("analytics-record")).toHaveText("8 won · 3 drawn · 1 lost");
        await expect(page.getByText("Unbeaten in the last 11 games")).toBeVisible();

        // Twelve columns on a laptop, the last six on a phone; the rest are in the list
        const visibleGames = page.getByTestId("analytics-game").filter({ visible: true });
        await expect(visibleGames).toHaveCount(narrow ? 6 : 12);
        await expect(page.getByText(narrow ? "Last 6 games" : "Last 12 games")).toHaveCount(0 + (narrow ? 1 : 0));
        await expect(visibleGames.last()).toHaveAccessibleName("Won 3–2 against Harbor City SC, Sun, Nov 1. Show who scored.");

        // Scored and let in are named beside the chart
        await expect(page.getByTestId("analytics-chart")).toContainText("Scored");
        await expect(page.getByTestId("analytics-chart")).toContainText("Let in");
        // Every column ends in its result letter: not told by color alone
        const letters = await visibleGames.evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
        for (const text of letters) expect(text).toMatch(/[WDL]/);

        // One game: who scored and who set them up
        const brookside = page.getByRole("button", { name: /Won 4–2 against Brookside Town/ });
        await brookside.click();
        const card = page.getByTestId("analytics-game-card");
        await expect(card).toBeVisible();
        await expect(card.getByRole("heading")).toContainText("Won");
        await expect(card.getByRole("heading")).toContainText("4–2");
        await expect(card).toContainText("vs Brookside Town · Sun, Oct 4");
        const scorers = card.getByRole("list", { name: "Who scored" }).getByRole("listitem");
        await expect(scorers).toHaveText([/Maya Chen\s*2 goals/, /Ava Ruiz\s*1 goal/, /Sam Okafor\s*1 goal/]);
        await expect(card).toContainText("Set up by");
        await expect(card).toContainText("Leo Park 2 · Maya Chen 1");
        await expect(card.getByRole("link", { name: "Every player’s numbers" })).toHaveAttribute("href", "/admin/stats");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/analytics-game-${width}.png`, fullPage: true });

        // Closed by its button, and by the keyboard, with focus back on the game
        await card.getByRole("button", { name: "Close game details" }).click();
        await expect(card).toHaveCount(0);
        await expect(brookside).toBeFocused();
        await brookside.click();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("analytics-game-card")).toHaveCount(0);

        // The whole season, as a table
        const all = page.getByTestId("analytics-all-games");
        await expect(all).toHaveText("All 12 games");
        await all.click();
        const table = page.getByTestId("analytics-table");
        await expect(table.getByRole("row")).toHaveCount(13);
        await expect(table.getByRole("row").nth(1)).toContainText("Harbor City SC");
        await expect(table.getByRole("row").nth(1)).toContainText("Won 3–2");
        await expect(table.getByRole("row").last()).toContainText("Lost 1–2");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/analytics-results-${width}.png`, fullPage: true });
        await all.click();
        await expect(table).toHaveCount(0);
        expect(errors).toEqual([]);
      } finally {
        await restore(saved);
      }
    });

    test("shows one player at a time with their shape and their recent games", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        const seeded = await seed(DEMO_GAMES, DEMO_PEOPLE);
        await openAnalytics(page);

        if (narrow) {
          // The phone starts on the list, grouped by position, and a tap opens the player
          await expect(page.getByTestId("analytics-phone-list")).toBeVisible();
          await expect(page.getByTestId("analytics-player")).toBeHidden();
          await expect(page.getByTestId(`analytics-row-${seeded.people.maya}`)).toContainText("#11 · 11 goals");
          await expect(page.getByTestId(`analytics-row-${seeded.people.kai}`)).toContainText("#1 · 40 saves");
          await page.screenshot({ path: `${SHOTS}/analytics-players-list-${width}.png`, fullPage: true });
        } else {
          await expect(page.getByTestId("analytics-picker")).toBeVisible();
          // It opens on the top scorer, and the other forwards are one click away
          await expect(page.getByTestId("analytics-chip-" + seeded.people.maya)).toHaveAttribute("aria-pressed", "true");
          await expect(page.getByTestId("analytics-chip-" + seeded.people.sam)).toHaveAttribute("aria-pressed", "false");
        }

        await pickPlayer(page, width, seeded, "maya", "Maya Chen");
        const player = page.getByTestId("analytics-player");
        await expect(player).toContainText("Forward · #11");
        if (!narrow) await expect(player).toContainText("Played 11 of 12 games");

        // The shape: six corners, each a word and her real number
        const chart = page.getByTestId("analytics-chart-player");
        await expect(chart).toHaveAccessibleName("Maya Chen: Goals 11, Assists 4, Fouls won 14, Tackles 9, Minutes 900, Starts 10");
        for (const corner of ["Goals", "Assists", "Fouls won", "Tackles", "Minutes", "Starts"]) {
          await expect(chart.getByText(corner, { exact: true })).toBeVisible();
        }
        // The edge is the team's best forward: Sam has the most tackles, so Maya stops short there
        await expect(chart.getByText("900", { exact: true })).toBeVisible();

        // Recent games: newest first, in words, with minutes
        const games = page.getByTestId("analytics-log-game").filter({ visible: true });
        await expect(games).toHaveCount(narrow ? 1 : 2);
        await expect(games.first()).toContainText("Harbor City SC");
        await expect(games.first()).toContainText("Sun, Nov 1 · Won 3–2");
        await expect(games.first()).toContainText("2 goals");
        await expect(games.first()).toContainText("90 min");
        if (!narrow) {
          await expect(games.nth(1)).toContainText("Northgate Athletic");
          await expect(games.nth(1)).toContainText("Sun, Oct 25 · Won 2–1");
          await expect(games.nth(1)).toContainText("1 goal");
          await expect(games.nth(1)).toContainText("35 min");
        }
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/analytics-player-${width}.png`, fullPage: true });

        // All of her games: she played 11 of 12, so the list opens to 11
        await page.getByTestId("analytics-log-all").click();
        await expect(page.getByTestId("analytics-log-game").filter({ visible: true })).toHaveCount(11);
        await expect(page.getByTestId("analytics-log-all")).toHaveText("Show fewer");
        await page.getByTestId("analytics-log-all").click();
        await expect(page.getByTestId("analytics-log-game").filter({ visible: true })).toHaveCount(narrow ? 1 : 2);

        // Another player: the shape and the numbers change in place
        if (narrow) await page.getByRole("button", { name: "Players" }).click();
        await pickPlayer(page, width, seeded, "sam", "Sam Okafor");
        await expect(page.getByTestId("analytics-chart-player")).toHaveAccessibleName("Sam Okafor: Goals 6, Assists 3, Fouls won 8, Tackles 12, Minutes 864, Starts 12");
        await expect(page.getByTestId("analytics-player")).toContainText("Forward · #9");

        // A keeper has her own four corners and says saves in words
        if (!narrow) {
          await page.getByTestId(`analytics-chip-${seeded.people.kai}`).click();
          await expect(page.getByTestId("analytics-chart-player")).toHaveAccessibleName("Kai Lund: Saves 40, Clean sheets 3, Starts 10, Minutes 900");
          await expect(page.getByTestId("analytics-log-game").first()).toContainText("5 saves, 1 let in");
        }

        if (narrow) {
          // Back to the list, with focus on the player we left
          await page.getByRole("button", { name: "Players" }).click();
          await expect(page.getByTestId("analytics-phone-list")).toBeVisible();
          await expect(page.getByTestId("analytics-player")).toBeHidden();
          await expect(page.getByTestId(`analytics-row-${seeded.people.sam}`)).toBeFocused();
        }
        expect(errors).toEqual([]);
      } finally {
        await restore(saved);
      }
    });

    test("holds up under the worst data: 38 games, long and non-Latin names, no minutes, the highest scores", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        const seeded = await seed(WORST_GAMES, WORST_PEOPLE);
        await openAnalytics(page);
        await expectNoSideScroll(page, width);

        const visibleGames = page.getByTestId("analytics-game").filter({ visible: true });
        await expect(visibleGames).toHaveCount(narrow ? 6 : 12);
        await expect(page.getByText(narrow ? "Last 6 games" : "Last 12 games").filter({ visible: true })).toHaveCount(1);
        // 99-0 is the latest game: the pill holds it whole and the bar stays inside the chart
        const last = visibleGames.last();
        await expect(last).toHaveAccessibleName(/Won 99–0 against/);
        const pill = last.locator("span").first();
        expect((await measure(pill)).cutAcross).toBe(false);
        const chartBox = (await page.getByTestId("analytics-chart").boundingBox())!;
        const barBox = (await last.locator("span[class*=barFor]").boundingBox())!;
        expect(barBox.y).toBeGreaterThanOrEqual(chartBox.y);
        expect(barBox.x + barBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width);

        // The long opponent wraps inside the open game
        await visibleGames.nth(narrow ? 2 : 6).click();
        const card = page.getByTestId("analytics-game-card");
        await expect(card).toBeVisible();
        const cardBox = (await card.boundingBox())!;
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(width + 1);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/analytics-worst-game-${width}.png`, fullPage: true });
        await card.getByRole("button", { name: "Close game details" }).click();

        // All 38 games in the list
        await page.getByTestId("analytics-all-games").click();
        await expect(page.getByTestId("analytics-table").getByRole("row")).toHaveCount(39);
        await expectNoSideScroll(page, width);
        await page.getByTestId("analytics-all-games").click();

        // Players: long names clamp, nothing leaves the page
        await pickPlayer(page, width, seeded, "aleksandra", "Aleksandra Wiśniewska-Kowalczyk");
        const name = page.getByTestId("analytics-player-name");
        expect((await measure(name)).lines).toBeLessThanOrEqual(2);
        await expect(page.getByTestId("analytics-chart-player")).toHaveAccessibleName(
          "Aleksandra Wiśniewska-Kowalczyk: Goals 27, Assists 1,204, Fouls won 61, Tackles 143, Minutes 3,420, Starts 38",
        );
        await expect(page.getByTestId("analytics-chart-player").getByText("1,204", { exact: true })).toBeVisible();
        // 300 minutes of extra time stays inside its track
        await page.getByTestId("analytics-log-all").click();
        await expect(page.getByText("300 min")).toBeVisible();
        await expectNoSideScroll(page, width);
        const radarLabels = page.getByTestId("analytics-chart-player").locator("span[class*=radarLabel]");
        for (let i = 0; i < (await radarLabels.count()); i += 1) {
          const box = (await radarLabels.nth(i).boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        }
        await page.screenshot({ path: `${SHOTS}/analytics-worst-player-${width}.png`, fullPage: true });
        if (narrow) await page.getByRole("button", { name: "Players" }).click();

        // A player with no minutes
        await pickPlayer(page, width, seeded, "jo", "Jo");
        await expect(page.getByTestId("analytics-no-games")).toHaveText("No games yet");
        await expect(page.getByTestId("analytics-chart-player")).toHaveAccessibleName("Jo: Goals 0, Assists 0, Fouls won 0, Tackles 0, Minutes 0, Starts 0");
        await expectNoSideScroll(page, width);
        if (narrow) await page.getByRole("button", { name: "Players" }).click();

        // Non-Latin and emoji names show their own initial and read whole
        await pickPlayer(page, width, seeded, "xiu", "王秀英");
        if (narrow) await page.getByRole("button", { name: "Players" }).click();
        await pickPlayer(page, width, seeded, "fox", "🦊 Fox");
        await expectNoSideScroll(page, width);

        // Chip names end in an ellipsis rather than widening the row (laptop)
        if (!narrow) {
          const chip = page.getByTestId(`analytics-chip-${seeded.people.chris}`);
          const box = (await chip.boundingBox())!;
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          await expect(chip).toContainText("Christopher Alexander Montgomery III");
        }
        expect(errors).toEqual([]);
      } finally {
        await restore(saved);
      }
    });

    test("is plain for one game, no games, no players, and no season shown", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        // One game: one column, a record, no streak claimed
        await seed([DEMO_GAMES[0]!, { vs: "Not played yet", date: "2027-03-01", us: null, them: null }], [maya]);
        await openAnalytics(page);
        await expect(page.getByTestId("analytics-record")).toHaveText("0 won · 0 drawn · 1 lost");
        await expect(page.getByText(/Unbeaten/)).toHaveCount(0);
        await expect(page.getByTestId("analytics-game").filter({ visible: true })).toHaveCount(1);
        await expect(page.getByTestId("analytics-all-games")).toHaveText("All 1 game");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/analytics-one-game-${width}.png`, fullPage: true });

        // No game has a score yet
        await seed([{ vs: "Not played yet", date: "2027-03-01", us: null, them: null }], [maya]);
        await openAnalytics(page);
        await expect(page.getByTestId("analytics-results")).toContainText("No results yet");
        await expect(page.getByTestId("analytics-results").getByRole("link", { name: "Enter a score" })).toHaveAttribute("href", "/admin/score");
        await expect(page.getByTestId("analytics-game")).toHaveCount(0);
        await page.screenshot({ path: `${SHOTS}/analytics-no-games-${width}.png`, fullPage: true });

        // No players on the roster
        await seed(DEMO_GAMES.slice(0, 3), []);
        await openAnalytics(page);
        await expect(page.getByTestId("analytics-players")).toContainText("No players yet");
        await expect(page.getByTestId("analytics-players").getByRole("link", { name: "Team roster" })).toHaveAttribute("href", "/admin/roster");
        await expect(page.getByTestId("analytics-record")).toHaveText("1 won · 1 drawn · 1 lost");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/analytics-no-players-${width}.png`, fullPage: true });

        // The website shows no season yet
        await seed(DEMO_GAMES, DEMO_PEOPLE, { showSeason: false });
        await openAnalytics(page);
        await expect(page.getByTestId("team-analytics-no-season")).toContainText("isn’t showing a season yet");
        await expect(page.getByRole("link", { name: "Go to This season" })).toHaveAttribute("href", "/admin/seasons");
        expect(errors).toEqual([]);
      } finally {
        await restore(saved);
      }
    });

    test("a club on the classic admin keeps the Analytics page it has today", async ({ page }) => {
      try {
        await seed(DEMO_GAMES, DEMO_PEOPLE);
        await sql("update onzio.clubs set admin_portal='classic' where id=$1", [ALPHA]);
        await page.goto("/admin/analytics");
        await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
        await expect(page.getByTestId("team-analytics")).toHaveCount(0);
      } finally {
        await restore(saved);
      }
    });
  });
}
