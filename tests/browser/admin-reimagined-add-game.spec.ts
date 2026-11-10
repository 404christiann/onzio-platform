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
  // ilike: RE-07b types an opponent in another case to show it is the same one.
  await sql("delete from onzio.matches where club_id=$1 and opponent ilike $2", [ALPHA, `${FIXTURE}%`]);
  await sql("delete from onzio.site_sponsor_logos where club_id=$1 and name like $2", [ALPHA, `${FIXTURE}%`]);
}

type SavedGame = {
  opponent_short_name: string | null;
  opponent_logo_url: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_link: string | null;
};

async function savedGame(opponent: string): Promise<SavedGame[]> {
  return sql<SavedGame>(
    "select opponent_short_name, opponent_logo_url, sponsor_name, sponsor_logo_url, sponsor_link from onzio.matches where club_id=$1 and opponent=$2",
    [ALPHA, opponent],
  );
}

const fixtureLogo = (name: string) =>
  `http://127.0.0.1:54321/storage/v1/object/public/sponsors/match-sponsors/re-07b-${name}.png`;
const fixtureSponsors = (width: number) => ({
  sponsorA: `${FIXTURE} Acme Plumbing ${width}`,
  sponsorB: `${FIXTURE} Riverside Bank ${width}`,
});

/** Two past games against one opponent; the newer one's short name and logo win. */
async function seedOpponentHistory(seasonId: string, opponent: string) {
  await sql(
    `insert into onzio.matches (club_id, season_id, date, time, opponent, opponent_short_name, opponent_logo_url, home, venue)
     values ($1,$2,'2020-03-01','10:00',$3,'OLD',$4,true,'Old ground'),
            ($1,$2,'2021-03-01','10:00',$3,'RIV',$5,false,'River ground')`,
    [ALPHA, seasonId, opponent, fixtureLogo("old"), fixtureLogo("riverside")],
  );
}

/** The club's latest game, with a sponsor and its link, and one Sponsors-page sponsor. */
async function seedSponsors(seasonId: string, width: number) {
  const { sponsorA, sponsorB } = fixtureSponsors(width);
  await sql(
    `insert into onzio.matches (club_id, season_id, date, time, opponent, home, venue, sponsor_name, sponsor_logo_url, sponsor_link)
     values ($1,$2,'2099-06-01','10:00',$3,true,'Future ground',$4,$5,'https://acme.example')`,
    [ALPHA, seasonId, `${FIXTURE} Latest ${width}`, sponsorA, fixtureLogo("acme")],
  );
  await sql(
    "insert into onzio.site_sponsor_logos (club_id, placement, name, logo_url, sort_order) values ($1,'carousel',$2,$3,99)",
    [ALPHA, sponsorB, fixtureLogo("bank")],
  );
}

// Alpha publishes the seeded academy document. With nothing published it is a
// generic site, which shows match sponsors like Rose City's. Returns the undo.
const SEEDED_DOCUMENT = "88888888-8888-4888-8888-888888888804";
async function showMatchSponsorsOnAlpha(): Promise<() => Promise<void>> {
  const [state] = await sql<{ published_document_id: string | null }>(
    "select published_document_id from onzio.presentation_state where club_id=$1",
    [ALPHA],
  );
  expect(state.published_document_id).toBe(SEEDED_DOCUMENT);
  await sql("update onzio.presentation_state set published_document_id=null where club_id=$1", [ALPHA]);
  return async () => {
    await sql("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [ALPHA, SEEDED_DOCUMENT]);
  };
}


// Add a game's optional "Which competition?" (follow-up to ADMIN-RE-22). Local
// Alpha is the academy site, which shows a game's own competition on its Next
// Match card, so it asks; a generic site (nothing published) does not.
const UNBROKEN_COMPETITION = "C".repeat(80);
const NON_LATIN_COMPETITION = "春季联赛杯 — Лига чемпионов — دوري الربيع";
const EMOJI_COMPETITION = "⚽🏆 Spring Cup 🏆⚽";

async function savedCompetitions(opponent: string) {
  const rows = await sql<{ competition: string | null }>(
    "select competition from onzio.matches where club_id=$1 and opponent=$2",
    [ALPHA, opponent],
  );
  return rows.map((row) => row.competition);
}

/** Past games, the first competition on the newest date, so they become "Last used" chips in this order. */
async function seedCompetitions(seasonId: string, width: number, competitions: string[]) {
  for (const [index, competition] of competitions.entries()) {
    await sql(
      `insert into onzio.matches (club_id, season_id, date, time, opponent, home, venue, competition)
       values ($1,$2,$3::date,'10:00',$4,true,'Old ground',$5)`,
      [ALPHA, seasonId, `2021-0${competitions.length - index}-01`, `${FIXTURE} Past ${index} ${width}`, competition],
    );
  }
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
        // ADMIN-RE-11b (decision 4): "League game?" is asked, Yes by default.
        await expect(form.getByTestId("add-game-league").getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
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
        await expect(form.getByRole("group", { name: "Last used", exact: true }).getByRole("button", { name: venue })).toBeVisible();
        await expect(form.getByLabel("Who are you playing?")).toHaveValue("");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-added-${width}.png`, fullPage: true });

        const rows = await sql<{ date: string; time: string; home: boolean; league_game: boolean; venue: string; season_id: string }>(
          "select to_char(date, 'YYYY-MM-DD') as date, time::text as time, home, league_game, venue, season_id from onzio.matches where club_id=$1 and opponent=$2",
          [ALPHA, opponent],
        );
        expect(rows).toEqual([{ date: saturday, time: "10:00:00", home: true, league_game: true, venue, season_id: club.seasonId }]);

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
        const chips = form.getByRole("group", { name: "Last used", exact: true });
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

    // ADMIN-RE-07b. Local Alpha is seeded as the academy site (it stands in
    // for Diverse City), whose pages never show match sponsors.
    test("an academy site has no Sponsor?, and an opponent played before keeps its short name and logo", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const club = await alpha();
      const known = `${FIXTURE} Riverside ${width}`;
      try {
        await seedOpponentHistory(club.seasonId, known);
        // Sponsors exist, and still nothing is asked or carried.
        await seedSponsors(club.seasonId, width);
        await openAddGame(page);
        const form = main(page);
        await expect(form.getByText("Sponsor?")).toHaveCount(0);
        await expect(form.getByTestId("add-game-no-sponsor")).toHaveCount(0);

        // The same opponent typed in another case with outer spaces.
        const typed = known.toUpperCase();
        await form.getByLabel("Who are you playing?").fill(`  ${typed}  `);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(await savedGame(typed)).toEqual([
          {
            opponent_short_name: "RIV",
            opponent_logo_url: fixtureLogo("riverside"),
            sponsor_name: null,
            sponsor_logo_url: null,
            sponsor_link: null,
          },
        ]);
        expect(errors).toEqual([]);
      } finally {
        await removeFixtureGames();
      }
    });

    test("asks an optional Which competition?, saves blank as nothing, and keeps Last used fresh", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const posts: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/api/admin/data") && request.method() === "POST") posts.push(request.postData() ?? "");
      });
      const club = await alpha();
      const blank = `${FIXTURE} Blank ${width}`;
      const typed = `${FIXTURE} Typed ${width}`;
      const tapped = `${FIXTURE} Tapped ${width}`;
      try {
        await openAddGame(page);
        const form = main(page);
        const question = form.getByLabel("Which competition?");
        // No competition used yet: the box, its help, and no chips.
        await expect(question).toHaveValue("");
        await expect(question).toHaveAttribute("maxlength", "80");
        await expect(form.getByText("Shows on your homepage next-game card. Leave it blank to show none.")).toBeVisible();
        await expect(form.getByRole("group", { name: "Last used competitions" })).toHaveCount(0);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-competition-none-${width}.png`, fullPage: true });

        // Left blank: it saves nothing (null, not an empty string).
        await form.getByLabel("Who are you playing?").fill(blank);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(await savedCompetitions(blank)).toEqual([null]);
        await expect(form.getByRole("group", { name: "Last used competitions" })).toHaveCount(0);

        // Typed (with outer spaces): saved trimmed, becomes a chip, and the box clears.
        await question.fill("  Spring League ");
        await form.getByLabel("Who are you playing?").fill(typed);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(await savedCompetitions(typed)).toEqual(["Spring League"]);
        await expect(question).toHaveValue("");
        const chips = form.getByRole("group", { name: "Last used competitions" });
        await expect(chips.getByRole("button")).toHaveText(["Spring League"]);
        await page.screenshot({ path: `${SHOTS}/add-game-competition-one-${width}.png`, fullPage: true });

        // A chip fills the box; the next game is saved with it, and it is not listed twice.
        await chips.getByRole("button", { name: "Spring League" }).click();
        await expect(question).toHaveValue("Spring League");
        await expect(chips.getByRole("button", { name: "Spring League" })).toHaveAttribute("aria-pressed", "true");
        await form.getByLabel("Who are you playing?").fill(tapped);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(await savedCompetitions(tapped)).toEqual(["Spring League"]);
        await expect(chips.getByRole("button")).toHaveText(["Spring League"]);

        // The save carries competition only because this site shows it.
        expect(posts).toHaveLength(3);
        expect(posts.map((body) => JSON.parse(body).payload.competition)).toEqual([null, "Spring League", "Spring League"]);
        expect(club.seasonId).toBeTruthy();
        expect(errors).toEqual([]);
      } finally {
        await removeFixtureGames();
      }
    });

    test("the worst-case competition: 80 unbroken characters, non-Latin, emoji, and only the last three chips", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const club = await alpha();
      try {
        // Four past competitions, newest first: unbroken, non-Latin, emoji, then an older one that is dropped (three chips at most).
        await seedCompetitions(club.seasonId, width, [UNBROKEN_COMPETITION, NON_LATIN_COMPETITION, EMOJI_COMPETITION, "Oldest Cup"]);
        await openAddGame(page);
        const form = main(page);
        const chips = form.getByRole("group", { name: "Last used competitions" });
        await expect(chips.getByRole("button")).toHaveText([UNBROKEN_COMPETITION, NON_LATIN_COMPETITION, EMOJI_COMPETITION]);
        await expect(chips.getByRole("button", { name: "Oldest Cup" })).toHaveCount(0);

        // Each chip is one line, cut with "…" when it is too long; the full text is on hover.
        const unbroken = chips.getByRole("button", { name: UNBROKEN_COMPETITION });
        await expect(unbroken).toHaveAttribute("title", UNBROKEN_COMPETITION);
        const unbrokenBox = await measure(unbroken.locator("span"));
        expect(unbrokenBox.lines).toBe(1);
        expect(unbrokenBox.cutAcross).toBe(true);
        for (const text of [NON_LATIN_COMPETITION, EMOJI_COMPETITION]) {
          expect((await measure(chips.getByRole("button", { name: text }).locator("span"))).lines).toBe(1);
        }
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-competition-worst-chips-${width}.png`, fullPage: true });

        // Typing is capped at 80; the 80 unbroken characters stay inside the box.
        const question = form.getByLabel("Which competition?");
        await question.fill("D".repeat(120));
        await expect(question).toHaveValue("D".repeat(80));
        await chips.getByRole("button", { name: UNBROKEN_COMPETITION }).click();
        await expect(question).toHaveValue(UNBROKEN_COMPETITION);
        expect(await question.evaluate((input) => input.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-competition-worst-${width}.png`, fullPage: true });

        // The unbroken, non-Latin and emoji answers each save whole.
        for (const [index, competition] of [UNBROKEN_COMPETITION, NON_LATIN_COMPETITION, EMOJI_COMPETITION].entries()) {
          const opponent = `${FIXTURE} Worst ${index} ${width}`;
          await question.fill(competition);
          await form.getByLabel("Who are you playing?").fill(opponent);
          await form.getByLabel("Where?").fill("Lincoln Park");
          await form.getByRole("button", { name: "Add to schedule" }).click();
          await expect(form.getByTestId("add-game-submit")).toContainText("Added");
          expect(await savedCompetitions(opponent)).toEqual([competition]);
          await expect(question).toHaveValue("");
        }
        expect(errors).toEqual([]);
      } finally {
        await removeFixtureGames();
      }
    });

    test("a site that does not show a game's competition never asks, and sends none", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const posts: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/api/admin/data") && request.method() === "POST") posts.push(request.postData() ?? "");
      });
      const club = await alpha();
      const opponent = `${FIXTURE} NoCompetition ${width}`;
      // With nothing published Alpha is a generic site, like Rose City's.
      const restore = await showMatchSponsorsOnAlpha();
      try {
        await seedCompetitions(club.seasonId, width, ["Spring League"]);
        await openAddGame(page);
        const form = main(page);
        await expect(form.getByText("Which competition?")).toHaveCount(0);
        await expect(form.getByRole("group", { name: "Last used competitions" })).toHaveCount(0);
        await form.getByLabel("Who are you playing?").fill(opponent);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(posts).toHaveLength(1);
        expect(JSON.parse(posts[0]).payload).not.toHaveProperty("competition");
        expect(await savedCompetitions(opponent)).toEqual([null]);
        expect(errors).toEqual([]);
      } finally {
        await removeFixtureGames();
        await restore();
      }
    });

    test("a site that shows match sponsors asks Sponsor?, filled in with the latest game's", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const club = await alpha();
      const { sponsorA, sponsorB } = fixtureSponsors(width);
      const restore = await showMatchSponsorsOnAlpha();
      try {
        // Nothing to pick yet: "No sponsor" and the way to the Sponsors page.
        await openAddGame(page);
        const empty = main(page);
        await expect(empty.getByTestId("add-game-no-sponsor")).toHaveText("No sponsor. Add sponsors");
        await expect(empty.getByRole("link", { name: "Add sponsors" })).toHaveAttribute("href", "/admin/sponsors");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-no-sponsor-${width}.png`, fullPage: true });

        await seedSponsors(club.seasonId, width);
        await page.reload();
        const form = main(page);
        const sponsor = form.getByLabel("Sponsor?");
        await expect(sponsor).toHaveValue("0");
        await expect(sponsor.locator("option")).toHaveText([`${sponsorA} (last game)`, sponsorB, "No sponsor"]);
        await expect(form.getByTestId("add-game-no-sponsor")).toHaveCount(0);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/add-game-sponsor-${width}.png`, fullPage: true });

        // The latest game's sponsor keeps its link.
        const first = `${FIXTURE} Northgate ${width}`;
        await form.getByLabel("Who are you playing?").fill(first);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(await savedGame(first)).toEqual([
          {
            opponent_short_name: null,
            opponent_logo_url: null,
            sponsor_name: sponsorA,
            sponsor_logo_url: fixtureLogo("acme"),
            sponsor_link: "https://acme.example",
          },
        ]);

        // A Sponsors-page sponsor has no link.
        await sponsor.selectOption({ label: sponsorB });
        const second = `${FIXTURE} Eastside ${width}`;
        await form.getByLabel("Who are you playing?").fill(second);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(await savedGame(second)).toEqual([
          {
            opponent_short_name: null,
            opponent_logo_url: null,
            sponsor_name: sponsorB,
            sponsor_logo_url: fixtureLogo("bank"),
            sponsor_link: null,
          },
        ]);

        await sponsor.selectOption({ label: "No sponsor" });
        const third = `${FIXTURE} Westview ${width}`;
        await form.getByLabel("Who are you playing?").fill(third);
        await form.getByLabel("Where?").fill("Lincoln Park");
        await form.getByRole("button", { name: "Add to schedule" }).click();
        await expect(form.getByTestId("add-game-submit")).toContainText("Added");
        expect(await savedGame(third)).toEqual([
          { opponent_short_name: null, opponent_logo_url: null, sponsor_name: null, sponsor_logo_url: null, sponsor_link: null },
        ]);
        expect(errors).toEqual([]);
      } finally {
        await removeFixtureGames();
        await restore();
      }
    });
  });
}
