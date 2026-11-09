import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-06: Enter a score on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width. Each test seeds
// its own past game and removes it in a finally block, so a failed run leaves
// nothing behind. Screenshots land in test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const FIXTURE_OPPONENT = "RE-06 fixture opponent";
const WORST_CLUB_NAME = "Greater Portland Metropolitan Youth Soccer Association";
const WORST_OPPONENT = "Beaverton Hills Soccer Association Premier Academy";
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

/** One game in Alpha's active season, three days ago in club time, with no score. */
async function addPastGame(opponent: string, competition: string | null = "League"): Promise<string> {
  const [{ id: seasonId }] = await sql<{ id: string }>(
    "select id from onzio.seasons where club_id=$1 and active",
    [ALPHA],
  );
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [year, month, day] = clubToday(zone).split("-").map(Number);
  const threeDaysAgo = new Date(Date.UTC(year, month - 1, day - 3)).toISOString().slice(0, 10);
  const [{ id }] = await sql<{ id: string }>(
    `insert into onzio.matches (club_id, season_id, date, time, opponent, competition, home)
     values ($1, $2, $3::date, '10:00', $4, $5, true) returning id`,
    [ALPHA, seasonId, threeDaysAgo, opponent, competition],
  );
  return id;
}

async function removeGames(...opponents: string[]) {
  await sql("delete from onzio.matches where club_id=$1 and opponent = any($2)", [ALPHA, opponents]);
}

async function unscoredPastGames(): Promise<number> {
  const [{ count }] = await sql<{ count: string }>(
    `select count(*) from onzio.matches m join onzio.seasons s on s.club_id=m.club_id and s.id=m.season_id and s.active
     where m.club_id=$1 and m.rose_city_score is null and m.opponent_score is null and m.date < current_date`,
    [ALPHA],
  );
  return Number(count);
}

async function setClubName(name: string): Promise<string> {
  const [row] = await sql<{ name: string }>(
    "update onzio.clubs c set name=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.name",
    [ALPHA, name],
  );
  return row.name;
}

async function setPortal(portal: "classic" | "reimagined"): Promise<string> {
  const [row] = await sql<{ admin_portal: string }>(
    "update onzio.clubs c set admin_portal=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
    [ALPHA, portal],
  );
  return row.admin_portal;
}

// Next streams pages in; scope every lookup to <main>.
function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test("tap +, save, and the game takes its result; then every score is in", async ({ page }) => {
      const id = await addPastGame(FIXTURE_OPPONENT);
      try {
        expect(await unscoredPastGames()).toBe(1);
        await page.goto("/admin/score");
        await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Enter a score");
        await expect(main(page).getByRole("heading", { level: 1, name: "Enter a score" })).toBeVisible();

        const card = main(page).locator(`[data-score-game="${id}"]`);
        await expect(card.getByText(`vs ${FIXTURE_OPPONENT}`, { exact: true })).toBeVisible();
        await expect(card.getByTestId("score-pill")).toHaveText("Result missing");
        const save = card.getByRole("button", { name: "Save score" });
        await expect(save).toBeVisible();
        await expect(main(page).getByRole("link", { name: /Who scored\?/ })).toHaveAttribute("href", "/admin/stats?view=match");
        await expect(main(page).getByText("No earlier results yet", { exact: true })).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/score-${width}.png`, fullPage: true });

        const ours = card.getByRole("group", { name: "Alpha FC score" });
        const theirs = card.getByRole("group", { name: `${FIXTURE_OPPONENT} score` });
        for (let goal = 0; goal < 3; goal += 1) {
          await ours.getByRole("button", { name: "Add a goal for Alpha FC" }).click();
        }
        await theirs.getByRole("button", { name: `Add a goal for ${FIXTURE_OPPONENT}` }).click();
        await expect(ours.getByRole("spinbutton")).toHaveValue("3");
        await expect(theirs.getByRole("spinbutton")).toHaveValue("1");

        // Hold the save briefly so the busy state can be seen.
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => (release = resolve));
        await page.route("**/api/admin/data", async (route) => {
          await held;
          await route.continue();
        });
        const idleBackground = await save.evaluate((element) => getComputedStyle(element).backgroundColor);
        const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/admin/data"));
        await save.click();
        const button = card.locator("button[data-state]");
        await expect(button).toHaveText("Saving…");
        await expect(button).toHaveAttribute("aria-busy", "true");
        release();
        expect((await response).status()).toBe(200);
        await page.unroute("**/api/admin/data");

        await expect(button).toHaveText("Saved · on your website");
        await expect(card.getByTestId("score-pill")).toHaveText("Won 3–1");
        // The pointer is still on the button: the saved look must win over hover.
        await expect
          .poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor))
          .not.toBe(idleBackground);
        const [row] = await sql<{ rose_city_score: number; opponent_score: number }>(
          "select rose_city_score, opponent_score from onzio.matches where club_id=$1 and id=$2",
          [ALPHA, id],
        );
        expect(row).toEqual({ rose_city_score: 3, opponent_score: 1 });
        await page.screenshot({ path: `${SHOTS}/score-saved-${width}.png`, fullPage: true });

        // Back on the page later, nothing is left to score.
        await page.reload();
        const allIn = main(page).getByTestId("all-scores-in");
        await expect(allIn.getByRole("heading", { name: "All scores are in" })).toBeVisible();
        await expect(allIn.getByRole("link", { name: "Add a game" })).toHaveAttribute("href", /^\/admin\/(schedule|add-game)$/);
        await expect(main(page).locator("[data-score-game]")).toHaveCount(0);
        const earlier = main(page).getByRole("region", { name: "Earlier results" });
        await expect(earlier.getByText(`vs ${FIXTURE_OPPONENT}`, { exact: true })).toBeVisible();
        await expect(earlier.getByText("Won 3–1", { exact: true })).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/score-all-in-${width}.png`, fullPage: true });

        // The home's tile no longer says a game needs a score, and opens this page.
        await page.goto("/admin");
        const tile = main(page).locator('[data-job="enter-score"]');
        await expect(tile).toHaveText("Enter a score");
        await tile.click();
        await expect(page).toHaveURL(/\/admin\/score$/);
      } finally {
        await page.unroute("**/api/admin/data").catch(() => undefined);
        await removeGames(FIXTURE_OPPONENT);
      }
    });

    test("worst-case names wrap to two lines without a sideways scroll", async ({ page }) => {
      const previousName = await setClubName(WORST_CLUB_NAME);
      try {
        const id = await addPastGame(WORST_OPPONENT, "Cascade Premier League Fall Showcase Cup");
        await page.goto("/admin/score");
        const card = main(page).locator(`[data-score-game="${id}"]`);
        await expect(card.getByRole("group", { name: `${WORST_CLUB_NAME} score` })).toBeVisible();
        const lines = await card.locator('[title]').evaluateAll((elements) =>
          elements.map((element) => {
            const style = getComputedStyle(element);
            return {
              title: element.getAttribute("title"),
              lines: Math.round(element.getBoundingClientRect().height / parseFloat(style.lineHeight)),
            };
          }),
        );
        for (const { lines: count } of lines) expect(count).toBeLessThanOrEqual(2);
        await expect(card.getByTitle(WORST_CLUB_NAME)).toHaveText(WORST_CLUB_NAME);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/score-worst-${width}.png`, fullPage: true });
      } finally {
        await removeGames(WORST_OPPONENT);
        await setClubName(previousName);
      }
    });

    test("a club on the classic admin is sent to the old schedule page", async ({ page }) => {
      const previous = await setPortal("classic");
      try {
        await page.goto("/admin/score");
        await expect(page).toHaveURL(/\/admin\/schedule$/);
      } finally {
        await setPortal(previous as "classic" | "reimagined");
      }
    });
  });
}
