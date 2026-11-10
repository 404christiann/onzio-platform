import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";
import { savedLabel, websiteState } from "../../lib/save-status";

// ADMIN-RE-11a: "This season" on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width. Every season
// the spec adds is removed in a finally block, pass or fail, and Alpha's own
// season is switched back on. The empty state sets Alpha's only season aside
// and puts it back row for row. Screenshots land in test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const FIXTURE = "RE-11a fixture";
// A name typed over the suggestion that carries its own year (the spec removes it).
const TYPED_NAME = "Fall 2025";
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

type SeasonRow = { id: string; label: string; start_year: number; end_year: number; active: boolean };

async function seasons(): Promise<SeasonRow[]> {
  return sql<SeasonRow>(
    "select id, label, start_year, end_year, active from onzio.seasons where club_id=$1 order by start_year, label",
    [ALPHA],
  );
}

async function original(): Promise<SeasonRow> {
  const rows = await sql<SeasonRow>(
    "select id, label, start_year, end_year, active from onzio.seasons where club_id=$1 and label not like $2 order by start_year limit 1",
    [ALPHA, `${FIXTURE}%`],
  );
  return rows[0];
}

/** Takes every fixture season away; with `keep`, switches that season (Alpha's own) back on. */
async function removeFixtureSeasons(keep?: string) {
  const fixtures = await sql<{ id: string }>(
    "select id from onzio.seasons where club_id=$1 and (label like $2 or label like $3 or label = $4)",
    [ALPHA, `${FIXTURE}%`, `%${FIXTURE}%`, TYPED_NAME],
  );
  const ids = fixtures.map((row) => row.id);
  if (ids.length) {
    await sql("delete from onzio.player_season_stats where club_id=$1 and season_id = any($2::uuid[])", [ALPHA, ids]);
    await sql("delete from onzio.goalkeeper_season_stats where club_id=$1 and season_id = any($2::uuid[])", [ALPHA, ids]);
    await sql("delete from onzio.matches where club_id=$1 and season_id = any($2::uuid[])", [ALPHA, ids]);
    await sql("update onzio.seasons set active=false where club_id=$1 and id = any($2::uuid[])", [ALPHA, ids]);
  }
  await sql("delete from onzio.seasons where club_id=$1 and id = any($2::uuid[])", [ALPHA, ids]);
  if (keep) await sql("update onzio.seasons set active=(id=$2) where club_id=$1", [ALPHA, keep]);
}

async function addSeason(label: string, startYear: number, endYear = startYear) {
  const [row] = await sql<{ id: string }>(
    "insert into onzio.seasons (club_id, label, start_year, end_year, active) values ($1,$2,$3,$4,false) returning id",
    [ALPHA, label, startYear, endYear],
  );
  return row.id;
}

async function alpha() {
  const [club] = await sql<{ slug: string; public_access: "preview" | "live" | "grace" | "suspended"; time_zone: string }>(
    "select slug, public_access, time_zone from onzio.clubs where id=$1",
    [ALPHA],
  );
  return club;
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
    };
  });
}

// ADMIN-RE-24: This season is on the Games tab's page (it was a More row).
async function openHub(page: Page) {
  await page.goto("/admin/games");
  await main(page).getByRole("link", { name: "This season" }).click();
  await expect(page).toHaveURL(/\/admin\/seasons$/);
  await expect(main(page).getByRole("heading", { level: 1, name: "This season" })).toBeVisible();
  await expect(page.getByTestId("admin-top-bar-title")).toHaveText("This season");
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await removeFixtureSeasons();
      await sql("update onzio.seasons set active=(id=$2) where club_id=$1", [ALPHA, (await original()).id]);
    });

    test("starts a season, asks to show it, shows it, switches back and deletes the empty one", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const club = await alpha();
      const first = await original();
      const saved = savedLabel(websiteState({ slug: club.slug, publicAccess: club.public_access }));
      const name = `${FIXTURE} ${width}`;
      try {
        await openHub(page);
        const hub = main(page);
        await expect(hub.getByText("The season your website shows.")).toBeVisible();
        await expect(hub.getByText("League table", { exact: true })).toBeVisible();
        await expect(hub.getByText("Player totals", { exact: true })).toBeVisible();
        await expect(hub.getByText("Games", { exact: true })).toBeVisible();
        await expect(hub.getByText("Next season", { exact: true })).toBeVisible();
        // The three cards open the pages that hold their numbers.
        await expect(hub.getByRole("link", { name: "Update the table" })).toHaveAttribute("href", "/admin/standings");
        await expect(hub.getByRole("link", { name: "See totals" })).toHaveAttribute("href", "/admin/stats?view=season");
        await expect(hub.getByRole("link", { name: "See games" })).toHaveAttribute("href", "/admin/schedule");
        // One season: the label is just a label, with nothing to open.
        await expect(page.getByTestId("season-switcher-static")).toHaveText(first.label);
        await expect(page.getByTestId("season-ready-note")).toHaveCount(0);
        // The shown season is never deletable.
        await expect(hub.getByRole("button", { name: /^Delete / })).toHaveCount(0);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/seasons-hub-${width}.png`, fullPage: true });

        // Start next season: the name is filled in from the latest season ("2026" -> "2027").
        await hub.getByRole("button", { name: "Start next season" }).click();
        const dialog = page.getByRole("dialog", { name: "Start next season?" });
        const field = dialog.getByLabel("Season name");
        await expect(field).toHaveValue(String(first.start_year + 1));
        await expect(field).toBeFocused();
        await expect(dialog.getByText(`Suggested from ${first.label}. Change it if you like.`)).toBeVisible();
        await expect(dialog.getByText(`${String(first.start_year + 1).length} / 40`)).toBeVisible();
        await expect(dialog.getByText("Player totals start at zero for every active player")).toBeVisible();
        await expect(dialog.getByText(`${first.label} is kept and can still be corrected`)).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/seasons-start-${width}.png`, fullPage: true });

        // A name that is taken: readable error, Start is off.
        await field.fill(first.label);
        await expect(dialog.getByRole("alert")).toHaveText(`A season called “${first.label}” already exists. Pick another name.`);
        await expect(dialog.getByRole("button", { name: "Start season" })).toBeDisabled();
        await field.fill(first.label.toUpperCase().concat(" "));
        await expect(dialog.getByRole("alert")).toContainText("already exists");
        // Over 40 characters: the counter says so and Start is off.
        await field.fill("x".repeat(41));
        await expect(dialog.getByText("41 / 40")).toBeVisible();
        await expect(dialog.getByRole("alert")).toHaveText("Use 40 characters or fewer.");
        await expect(dialog.getByRole("button", { name: "Start season" })).toBeDisabled();
        await field.fill("   ");
        await expect(dialog.getByRole("alert")).toHaveText("Give the season a name.");
        await page.screenshot({ path: `${SHOTS}/seasons-start-error-${width}.png`, fullPage: true });

        // A good name starts it, then the one follow-up question.
        await field.fill(name);
        await expect(dialog.getByRole("alert")).toHaveCount(0);
        await dialog.getByRole("button", { name: "Start season" }).click();
        const ask = page.getByRole("dialog", { name: `Show ${name} on your website now?` });
        await expect(ask).toBeVisible();
        await expect(ask.getByText(`Until you switch, your website keeps showing ${first.label}.`)).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/seasons-show-${width}.png`, fullPage: true });

        const [made] = await sql<{ id: string; active: boolean; start_year: number; end_year: number }>(
          "select id, active, start_year, end_year from onzio.seasons where club_id=$1 and label=$2",
          [ALPHA, name],
        );
        expect(made).toMatchObject({ active: false, start_year: first.start_year + 1, end_year: first.end_year + 1 });
        // Every active player has a totals row at zero, field players and goalkeepers apart.
        const [players] = await sql<{ n: string }>("select count(*) n from onzio.players where club_id=$1 and active", [ALPHA]);
        const [totals] = await sql<{ n: string }>(
          `select (select count(*) from onzio.player_season_stats where club_id=$1 and season_id=$2)
                + (select count(*) from onzio.goalkeeper_season_stats where club_id=$1 and season_id=$2) n`,
          [ALPHA, made.id],
        );
        expect(Number(totals.n)).toBe(Number(players.n));

        // "Not yet": the website keeps showing the old season and the page keeps a calm note.
        await ask.getByRole("button", { name: "Not yet" }).click();
        await expect(ask).toHaveCount(0);
        const note = page.getByTestId("season-ready-note");
        await expect(note).toContainText(`${name} is ready`);
        await expect(hub.getByText(`${name} has been started`)).toBeVisible();
        await expect(hub.getByText("Started", { exact: true })).toBeVisible();
        await expect(hub.getByRole("button", { name: "Start next season" })).toHaveCount(0);
        expect((await seasons()).find((season) => season.label === first.label)?.active).toBe(true);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/seasons-ready-${width}.png`, fullPage: true });

        // "Show it" switches the website to it.
        await note.getByRole("button", { name: "Show it" }).click();
        await expect(page.getByTestId("seasons-status")).toHaveText(saved);
        await expect(page.getByTestId("season-ready-note")).toHaveCount(0);
        await expect(page.getByTestId("season-switcher").getByRole("combobox")).toHaveValue(made.id);
        const afterShow = await seasons();
        expect(afterShow.filter((season) => season.active).map((season) => season.label)).toEqual([name]);

        // The past-season switcher: look at the old season, which is not on the website.
        await page.getByTestId("season-switcher").getByRole("combobox").selectOption(first.id);
        await expect(page).toHaveURL(new RegExp(`/admin/seasons\\?season=${first.id}$`));
        await expect(hub.getByText(`You’re looking at ${first.label}. Your website shows ${name}.`)).toBeVisible();
        await expect(hub.getByText(`${first.label} is not on your website.`)).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/seasons-past-${width}.png`, fullPage: true });

        // Show the old one again; the fixture season is empty, so it can be deleted.
        await hub.getByRole("button", { name: "Show it on your website" }).click();
        await expect(page.getByTestId("seasons-status")).toHaveText(saved);
        expect((await seasons()).filter((season) => season.active).map((season) => season.label)).toEqual([first.label]);

        await page.getByTestId("season-switcher").getByRole("combobox").selectOption(made.id);
        await expect(hub.getByText(`${name} has no games and no player numbers.`)).toBeVisible();
        await hub.getByRole("button", { name: "Delete this season" }).click();
        const confirm = page.getByRole("dialog", { name: `Delete ${name}?` });
        await expect(confirm.getByText("It has no games and no player numbers. This can’t be undone.")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/seasons-delete-${width}.png`, fullPage: true });
        await confirm.getByRole("button", { name: "Delete season" }).click();
        await expect(page.getByTestId("seasons-status")).toHaveText(`${name} was deleted.`);
        expect((await seasons()).map((season) => season.label)).toEqual([first.label]);
        const [left] = await sql<{ n: string }>(
          "select count(*) n from onzio.player_season_stats where club_id=$1 and season_id=$2",
          [ALPHA, made.id],
        );
        expect(Number(left.n)).toBe(0);
        expect(errors).toEqual([]);
      } finally {
        await removeFixtureSeasons(first.id);
      }
    });

    test("keeps a season that gained a game, and says a name another person just used", async ({ page }) => {
      const first = await original();
      const suggested = String(first.start_year + 1);
      const mine = `${FIXTURE} kept ${width}`;
      try {
        // A name that was free when the dialog opened and taken before Start was pressed.
        await openHub(page);
        await main(page).getByRole("button", { name: "Start next season" }).click();
        const dialog = page.getByRole("dialog", { name: "Start next season?" });
        await expect(dialog.getByLabel("Season name")).toHaveValue(suggested);
        await addSeason(suggested, first.start_year + 1);
        await dialog.getByRole("button", { name: "Start season" }).click();
        await expect(dialog.getByRole("alert")).toHaveText(`A season called “${suggested}” already exists. Pick another name.`);
        await expect(dialog.getByRole("button", { name: "Start season" })).toBeEnabled();
        await page.screenshot({ path: `${SHOTS}/seasons-duplicate-${width}.png`, fullPage: true });
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await sql("delete from onzio.seasons where club_id=$1 and label=$2", [ALPHA, suggested]);

        // A season that looked empty when the page opened but has a game now is not deleted.
        const id = await addSeason(mine, first.start_year + 1);
        await page.goto(`/admin/seasons?season=${id}`);
        await main(page).getByRole("button", { name: "Delete this season" }).click();
        await sql(
          "insert into onzio.matches (club_id, season_id, date, time, opponent, home, venue) values ($1,$2,'2099-06-01','10:00',$3,true,'Ground')",
          [ALPHA, id, `${FIXTURE} opponent`],
        );
        await page.getByRole("dialog", { name: `Delete ${mine}?` }).getByRole("button", { name: "Delete season" }).click();
        await expect(page.getByRole("dialog", { name: `Delete ${mine}?` }).getByRole("alert")).toHaveText(
          `${mine} has games or player numbers now, so it was kept.`,
        );
        expect((await seasons()).map((season) => season.label)).toContain(mine);
      } finally {
        await removeFixtureSeasons(first.id);
      }
    });

    test("saves the years the typed name says, not the suggestion's", async ({ page }) => {
      const first = await original();
      try {
        await openHub(page);
        await main(page).getByRole("button", { name: "Start next season" }).click();
        const dialog = page.getByRole("dialog", { name: "Start next season?" });
        // The suggestion follows 2026 ("2027"); the typed name is a year earlier.
        await expect(dialog.getByLabel("Season name")).toHaveValue(String(first.start_year + 1));
        await dialog.getByLabel("Season name").fill(TYPED_NAME);
        await dialog.getByRole("button", { name: "Start season" }).click();
        await expect(page.getByRole("dialog", { name: `Show ${TYPED_NAME} on your website now?` })).toBeVisible();
        const [made] = await sql<{ start_year: number; end_year: number; active: boolean }>(
          "select start_year, end_year, active from onzio.seasons where club_id=$1 and label=$2",
          [ALPHA, TYPED_NAME],
        );
        expect(made).toEqual({ start_year: 2025, end_year: 2025, active: false });
      } finally {
        await removeFixtureSeasons(first.id);
      }
    });

    test("worst-case names, one season and many seasons stay inside the page", async ({ page }) => {
      const first = await original();
      // 40 characters, the most the database allows: unbroken Latin, non-Latin and emoji.
      const unbroken = `${FIXTURE} ${"W".repeat(40 - FIXTURE.length - 1)}`;
      const nonLatin = `${FIXTURE} 春季赛${"联".repeat(40 - FIXTURE.length - 4)}`;
      const emoji = `${"🏆".repeat(13)}${FIXTURE}${"🏆".repeat(13)}`;
      expect([...unbroken].length).toBe(40);
      expect([...nonLatin].length).toBe(40);
      expect([...emoji].length).toBe(40);
      try {
        const unbrokenId = await addSeason(unbroken, 2027);
        await addSeason(nonLatin, 2028);
        const emojiId = await addSeason(emoji, 2029);
        for (let year = 2030; year < 2042; year += 1) await addSeason(`${FIXTURE} ${year}`, year);
        // The website still shows Alpha's own season; the newest is "ready".
        await openHub(page);
        const hub = main(page);
        const note = page.getByTestId("season-ready-note");
        await expect(note).toContainText(`${FIXTURE} 2041 is ready`);
        // Many seasons: a switcher that lists every one of them.
        const switcher = page.getByTestId("season-switcher").getByRole("combobox");
        await expect(switcher.locator("option")).toHaveCount(16);
        await expectNoSideScroll(page, width);

        // The longest names on the page itself.
        await page.goto(`/admin/seasons?season=${unbrokenId}`);
        await expect(hub.getByText(`You’re looking at ${unbroken}.`)).toBeVisible();
        await expectNoSideScroll(page, width);
        const startedTitle = hub.getByText(/ has been started$/);
        await expect(startedTitle).toHaveAttribute("title", `${FIXTURE} 2041`);
        await page.screenshot({ path: `${SHOTS}/seasons-worst-${width}.png`, fullPage: true });

        await page.goto(`/admin/seasons?season=${emojiId}`);
        await expect(hub.getByText(`You’re looking at ${emoji}.`)).toBeVisible();
        await expect(hub.getByRole("button", { name: "Delete this season" })).toBeVisible();
        await expectNoSideScroll(page, width);

        // The ready note keeps to one line with the full name on hover.
        await page.goto("/admin/seasons");
        const noteName = page.getByTestId("season-ready-note").getByTitle(`${FIXTURE} 2041`, { exact: true });
        await expect(noteName).toHaveText(`${FIXTURE} 2041`);
        expect((await measure(noteName)).lines).toBe(1);
        await expect(page.getByTestId("season-ready-note")).toContainText("is ready");
      } finally {
        await removeFixtureSeasons(first.id);
      }
    });

    test("with no season yet, the first one starts from the hub", async ({ page }) => {
      const club = await alpha();
      const saved = savedLabel(websiteState({ slug: club.slug, publicAccess: club.public_access }));
      const first = await original();
      // Set Alpha's only season (and the rows that hang off it) aside; put it back exactly in finally.
      const tables = ["matches", "player_season_stats", "goalkeeper_season_stats"] as const;
      const setAside: Record<string, unknown[]> = {};
      for (const table of tables) {
        setAside[table] = (await sql<{ r: unknown }>(`select to_jsonb(t) r from onzio.${table} t where club_id=$1 and season_id=$2`, [ALPHA, first.id])).map((row) => row.r);
      }
      const [seasonRow] = await sql<{ r: unknown }>("select to_jsonb(s) r from onzio.seasons s where id=$1", [first.id]);
      try {
        for (const table of tables) await sql(`delete from onzio.${table} where club_id=$1 and season_id=$2`, [ALPHA, first.id]);
        await sql("delete from onzio.seasons where id=$1", [first.id]);

        await openHub(page);
        const hub = main(page);
        const empty = page.getByTestId("seasons-empty");
        await expect(empty.getByText("No seasons yet")).toBeVisible();
        await expect(page.getByTestId("season-switcher")).toHaveCount(0);
        await expect(page.getByTestId("season-switcher-static")).toHaveCount(0);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/seasons-empty-${width}.png`, fullPage: true });

        await empty.getByRole("button", { name: "Start your first season" }).click();
        const dialog = page.getByRole("dialog", { name: "Start your first season?" });
        const year = clubToday(club.time_zone).slice(0, 4);
        await expect(dialog.getByLabel("Season name")).toHaveValue(year);
        await expect(dialog.getByText("Suggested from this year. Change it if you like.")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/seasons-first-${width}.png`, fullPage: true });
        await dialog.getByRole("button", { name: "Start season" }).click();
        const ask = page.getByRole("dialog", { name: `Show ${year} on your website now?` });
        await expect(ask.getByText("Your website has no season to show yet.")).toBeVisible();
        await ask.getByRole("button", { name: "Yes, switch" }).click();
        await expect(page.getByTestId("seasons-status")).toHaveText(saved);
        expect((await seasons()).map((season) => [season.label, season.active])).toEqual([[year, true]]);
        await expect(page.getByTestId("seasons-empty")).toHaveCount(0);
        await expect(hub.getByText("Next season", { exact: true })).toBeVisible();
      } finally {
        // Take away what the run made (its seasons and their totals), then put Alpha's own season back.
        const made = `select id from onzio.seasons where club_id=$1 and id<>$2`;
        await sql(`delete from onzio.player_season_stats where club_id=$1 and season_id in (${made})`, [ALPHA, first.id]);
        await sql(`delete from onzio.goalkeeper_season_stats where club_id=$1 and season_id in (${made})`, [ALPHA, first.id]);
        await sql("delete from onzio.seasons where club_id=$1 and id<>$2", [ALPHA, first.id]);
        await sql("insert into onzio.seasons select * from jsonb_populate_record(null::onzio.seasons, $1::jsonb)", [JSON.stringify(seasonRow.r)]);
        for (const table of tables) {
          if (setAside[table].length) {
            await sql(`insert into onzio.${table} select * from jsonb_populate_recordset(null::onzio.${table}, $1::jsonb)`, [JSON.stringify(setAside[table])]);
          }
        }
      }
    });
  });
}
