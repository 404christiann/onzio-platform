import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday, formatClubDate, nextClubSaturday } from "../../lib/club-time";
import { savedLabel, websiteState } from "../../lib/save-status";

// ADMIN-RE-07: "Add a game" on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width. Every game the
// spec adds is removed in a finally block, pass or fail. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const FIXTURE = "RE-07 fixture";
const SHOTS = "test-results/admin-reimagined";
// The worst-case strings from the design demo (examples/cd-game, ?data=worst).
const WORST_OPPONENT = `${FIXTURE} Beaverton Hills Soccer Association Premier Academy`.slice(0, 80);
const WORST_VENUE = "Eastmoreland Champions Sports Complex, Field 4";
const WORST_AWAY = `${FIXTURE} Cascade Valley Youth Soccer Association Under-14 Girls Gold`.slice(0, 80);
const WORST_AWAY_VENUE = "Riverside Fields Complex North Annex, Gate B parking";
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

async function removeFixtureGames() {
  await sql("delete from onzio.matches where club_id=$1 and opponent like $2", [ALPHA, `${FIXTURE}%`]);
}

async function alpha() {
  const [club] = await sql<{ slug: string; public_access: "preview" | "live" | "grace" | "suspended"; time_zone: string }>(
    "select slug, public_access, time_zone from onzio.clubs where id=$1",
    [ALPHA],
  );
  const [season] = await sql<{ id: string }>("select id from onzio.seasons where club_id=$1 and active", [ALPHA]);
  return { ...club, seasonId: season.id };
}

function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** Lines a block takes, and whether its text is cut (clamped or ellipsised). */
async function measure(locator: Locator) {
  return locator.evaluate((element) => {
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    return {
      lines: Math.round(element.getBoundingClientRect().height / lineHeight),
      cutAcross: element.scrollWidth > element.clientWidth,
      cutDown: element.scrollHeight > element.clientHeight + 1,
    };
  });
}

async function openAddGame(page: Page) {
  await page.goto("/admin");
  await main(page).locator('[data-job="add-game"]').click();
  await expect(page).toHaveURL(/\/admin\/add-game$/);
  await expect(main(page).getByRole("heading", { level: 1, name: "Add a game" })).toBeVisible();
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await removeFixtureGames();
    });

    test("adds a game on Alpha; it shows in Coming up and in the schedule", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const club = await alpha();
      const opponent = `${FIXTURE} Northgate ${width}`;
      const venue = `${FIXTURE} Lincoln Park ${width}`;
      const saturday = nextClubSaturday(club.time_zone);
      try {
        await openAddGame(page);
        const form = main(page);
        await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Add a game");
        await expect(form.getByText("No games yet", { exact: true })).toBeVisible();
        // The defaults: Home, next Saturday at 10:00 in club time, the active season.
        await expect(form.getByRole("radio", { name: "Home" })).toHaveAttribute("aria-checked", "true");
        await expect(form.getByRole("radio", { name: "Away" })).toHaveAttribute("aria-checked", "false");
        await expect(form.getByRole("button", { name: /^Date, / })).toHaveText(formatClubDate(saturday, "weekday-short")!);
        await expect(form.getByLabel("Time")).toHaveValue("10:00");
        // The time box has room for "10:00 AM"; nothing is cut off.
        const time = await form.getByLabel("Time").evaluate((input) => input.scrollWidth <= input.clientWidth);
        expect(time).toBe(true);
        await expect(form.getByText("League game?")).toHaveCount(0);
        await page.screenshot({ path: `${SHOTS}/add-game-empty-${width}.png`, fullPage: true });

        // Nothing typed: the opponent is the one question that has to be answered.
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByText("Type who you are playing.")).toBeVisible();
        await expect(form.getByLabel("Who are you playing?")).toBeFocused();

        await form.getByLabel("Who are you playing?").fill(opponent);
        await form.getByLabel("Where?").fill(venue);
        await form.getByRole("button", { name: "Add to schedule" }).click();
        const added = savedLabel(websiteState({ slug: club.slug, publicAccess: club.public_access }), "Added");
        await expect(form.getByTestId("add-game-submit")).toHaveText(added);
        await expect(form.getByRole("status")).toHaveText(added);

        const comingUp = form.getByTestId("add-game-coming-up");
        await expect(comingUp.getByText(`vs ${opponent}`, { exact: true })).toBeVisible();
        await expect(comingUp.getByText(`10:00 AM · ${venue}`, { exact: true })).toBeVisible();
        await expect(form.getByText("No games yet", { exact: true })).toHaveCount(0);
        // The venue becomes a "Last used" chip, and the form is ready for the next game.
        await expect(form.getByRole("group", { name: "Last used" }).getByRole("button", { name: venue })).toBeVisible();
        await expect(form.getByLabel("Who are you playing?")).toHaveValue("");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-added-${width}.png`, fullPage: true });

        const rows = await sql<{ date: string; time: string; home: boolean; venue: string; season_id: string }>(
          "select to_char(date, 'YYYY-MM-DD') as date, time::text as time, home, venue, season_id from onzio.matches where club_id=$1 and opponent=$2",
          [ALPHA, opponent],
        );
        expect(rows).toEqual([{ date: saturday, time: "10:00:00", home: true, venue, season_id: club.seasonId }]);

        // The old Games page still changes and removes games.
        await form.getByRole("link", { name: "Change or remove a game" }).click();
        await expect(page).toHaveURL(/\/admin\/schedule$/);
        // The old page renders a phone list and a laptop list; one of them shows.
        await expect(main(page).getByText(`vs ${opponent}`).filter({ visible: true }).first()).toBeVisible();
        expect(errors).toEqual([]);
      } finally {
        await removeFixtureGames();
      }
    });

    test("the worst-case opponent and venue wrap and truncate", async ({ page }) => {
      const club = await alpha();
      const [year, month, day] = clubToday(club.time_zone).split("-").map(Number);
      const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
      try {
        // An away game already on the schedule, from the worst fixture's "Coming up".
        await sql(
          "insert into onzio.matches (club_id, season_id, date, time, opponent, home, venue) values ($1,$2,$3::date,'13:00',$4,false,$5)",
          [ALPHA, club.seasonId, tomorrow, WORST_AWAY, WORST_AWAY_VENUE],
        );
        await openAddGame(page);
        const form = main(page);
        const chips = form.getByRole("group", { name: "Last used" });
        await chips.getByRole("button", { name: WORST_AWAY_VENUE }).click();
        await expect(form.getByLabel("Where?")).toHaveValue(WORST_AWAY_VENUE);

        await form.getByLabel("Who are you playing?").fill(WORST_OPPONENT);
        await expect(form.getByLabel("Who are you playing?")).toHaveValue(WORST_OPPONENT);
        await form.getByLabel("Where?").fill(WORST_VENUE);
        await form.getByRole("radio", { name: "Away" }).click();
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");

        const comingUp = form.getByTestId("add-game-coming-up");
        for (const [title, meta] of [
          [`at ${WORST_AWAY}`, `1:00 PM · ${WORST_AWAY_VENUE}`],
          [`at ${WORST_OPPONENT}`, `10:00 AM · ${WORST_VENUE}`],
        ]) {
          const titleText = comingUp.getByTitle(title, { exact: true });
          await expect(titleText).toHaveText(title);
          // Names wrap to two lines at most, then "…" (MAP break-ui rule).
          const titleBox = await measure(titleText);
          expect(titleBox.lines).toBeLessThanOrEqual(2);
          const metaText = comingUp.getByTitle(meta, { exact: true });
          const metaBox = await measure(metaText);
          expect(metaBox.lines).toBe(1);
          expect(metaBox.cutAcross).toBe(true);
        }
        // The longest name is clamped, not cut off mid-row.
        expect((await measure(comingUp.getByTitle(`at ${WORST_AWAY}`, { exact: true }))).cutDown).toBe(true);

        // Long venue chips keep one line with "…"; the full name is on hover.
        const chip = chips.getByRole("button", { name: WORST_AWAY_VENUE });
        await expect(chip).toHaveAttribute("title", WORST_AWAY_VENUE);
        const chipBox = await measure(chip.locator("span"));
        expect(chipBox.lines).toBe(1);
        expect(chipBox.cutAcross).toBe(true);

        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-worst-${width}.png`, fullPage: true });
      } finally {
        await removeFixtureGames();
      }
    });
  });
}
