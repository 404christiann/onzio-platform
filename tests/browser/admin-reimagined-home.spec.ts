import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-05: the reimagined home and shell on local Alpha (switched to
// 'reimagined' by admin-reimagined.global-setup.ts), at phone and laptop width.
// Every fixture row is put back in a finally block. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const OWNER = USER_IDS.ownerAal2; // the owner in local-auth.json
const FIXTURE_FORM = "0e050e05-0e05-4e05-8e05-0e050e050e05";
const FIXTURE_OPPONENT = "RE-05 fixture opponent";
const WORST_CLUB_NAME = "Greater Portland Metropolitan Youth Soccer Association";
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

async function setOwnerName(name: string | null): Promise<string | null> {
  const [row] = await sql<{ display_name: string | null }>(
    "update onzio.club_members m set display_name=$3 from onzio.club_members old where m.club_id=$1 and m.user_id=$2 and old.club_id=m.club_id and old.user_id=m.user_id returning old.display_name",
    [ALPHA, OWNER, name],
  );
  return row.display_name;
}

async function setClubName(name: string): Promise<string> {
  const [row] = await sql<{ name: string }>(
    "update onzio.clubs c set name=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.name",
    [ALPHA, name],
  );
  return row.name;
}

async function addUnscoredGames(count: number) {
  if (count === 0) return;
  const [{ id: seasonId }] = await sql<{ id: string }>(
    "select id from onzio.seasons where club_id=$1 and active",
    [ALPHA],
  );
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [year, month, day] = clubToday(zone).split("-").map(Number);
  const threeDaysAgo = new Date(Date.UTC(year, month - 1, day - 3)).toISOString().slice(0, 10);
  await sql(
    `insert into onzio.matches (club_id, season_id, date, time, opponent)
     select $1, $2, $3::date, '10:00', $4 from generate_series(1, $5)`,
    [ALPHA, seasonId, threeDaysAgo, FIXTURE_OPPONENT, count],
  );
}

async function removeFixtureGames() {
  await sql("delete from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, FIXTURE_OPPONENT]);
}

/** An open sign-up form with the core fields and a free price, so it is publishable. */
async function addOpenSignUpForm() {
  await sql("insert into onzio.registration_forms (id, club_id, slug, title) values ($1, $2, 're05-fixture', 'RE-05 fixture form')", [FIXTURE_FORM, ALPHA]);
  await sql(
    `insert into onzio.registration_form_fields (club_id, form_id, field_key, label, field_type, required, is_core, position, participant_scope)
     values ($1,$2,'registrant_name','Name','name',true,true,0,'adult'),
            ($1,$2,'registrant_email','Email','email',true,true,1,'adult'),
            ($1,$2,'registrant_phone','Phone','phone',true,true,2,'adult'),
            ($1,$2,'emergency_contact_name','Emergency contact','name',true,true,3,'all'),
            ($1,$2,'emergency_contact_phone','Emergency phone','phone',true,true,4,'all')`,
    [ALPHA, FIXTURE_FORM],
  );
  await sql("insert into onzio.registration_price_options (club_id, form_id, label, amount_cents, active, position) values ($1,$2,'Free',0,true,0)", [ALPHA, FIXTURE_FORM]);
  await sql("update onzio.registration_forms set status='open' where club_id=$1 and id=$2", [ALPHA, FIXTURE_FORM]);
}

async function removeOpenSignUpForm() {
  // An open form must keep a price, so close it before taking its parts away.
  await sql("update onzio.registration_forms set status='closed' where club_id=$1 and id=$2", [ALPHA, FIXTURE_FORM]);
  await sql("delete from onzio.registration_price_options where club_id=$1 and form_id=$2", [ALPHA, FIXTURE_FORM]);
  await sql("delete from onzio.registration_form_fields where club_id=$1 and form_id=$2", [ALPHA, FIXTURE_FORM]);
  await sql("delete from onzio.registration_forms where club_id=$1 and id=$2", [ALPHA, FIXTURE_FORM]);
}

// Next streams the home in after its placeholder; for a moment the streamed copy
// sits in a hidden node outside <main>. Every lookup is scoped to <main>.
function main(page: Page) {
  return page.getByRole("main");
}

async function jobIds(page: Page) {
  // The home streams in after its placeholder; wait for the real tiles.
  await expect(main(page).locator("[data-job]").first()).toBeVisible();
  return main(page).locator("[data-job]").evaluateAll((links) => links.map((link) => link.getAttribute("data-job")));
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test("greets by first name, or Welcome back without one", async ({ page }) => {
      const previous = await setOwnerName(null);
      try {
        await page.goto("/admin");
        await expect(main(page).getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
        // ADMIN-RE-24b: the club's name is in the frame; the home says what needs you.
        await expect(page.getByText("Alpha FC", { exact: true }).filter({ visible: true }).first()).toBeVisible();
        await expect(main(page).getByTestId("home-summary")).toHaveText(/^(Nothing needs you right now|\d+ things? needs? you)$/);
        // ADMIN-RE-24: no classic drawer; the tabs, with Home the current one.
        await expect(page.getByRole("button", { name: "Open admin navigation" })).toHaveCount(0);
        await expect(
          page.getByRole("navigation", { name: "Club admin" }).locator('[data-tab="home"]'),
        ).toHaveAttribute("aria-current", "page");

        await setOwnerName("Andrea Lopez-Whitfield");
        await page.reload();
        await expect(main(page).getByRole("heading", { level: 1, name: "Hi Andrea" })).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-${width}.png`, fullPage: true });
      } finally {
        await setOwnerName(previous);
      }
    });

    test("three jobs then four once a form is open; the pages sit under the tabs", async ({ page }) => {
      await page.goto("/admin");
      expect(await jobIds(page)).toEqual(["enter-score", "add-game", "edit-website"]);
      // ADMIN-RE-24: the More list is gone; its pages are on each tab's page.
      await expect(main(page).getByRole("region", { name: "More" })).toHaveCount(0);
      await expect(main(page).locator('[data-job="enter-score"]')).toHaveAttribute("href", "/admin/score");
      await expect(main(page).locator('[data-job="edit-website"]')).toHaveAttribute("href", "/admin/homepage");

      try {
        await addOpenSignUpForm();
        await page.reload();
        expect(await jobIds(page)).toEqual(["enter-score", "add-game", "see-registrations", "edit-website"]);
        await expect(main(page).locator('[data-job="see-registrations"]')).toHaveAttribute("href", "/admin/sign-ups");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-four-jobs-${width}.png`, fullPage: true });
      } finally {
        await removeOpenSignUpForm();
      }
    });

    test("the score hint and Needs you count unscored games: none, one, twelve", async ({ page }) => {
      const tile = main(page).locator('[data-job="enter-score"]');
      const need = main(page).locator('[data-need="score"]');
      try {
        await page.goto("/admin");
        await expect(tile).toHaveText("Enter a score");
        await expect(need).toHaveCount(0);

        await addUnscoredGames(1);
        await page.reload();
        await expect(tile).toContainText("1 game needs a score");
        await expect(need).toContainText(`Add the score vs ${FIXTURE_OPPONENT}`);
        await expect(need.getByRole("link", { name: /^Enter score/ })).toHaveAttribute("href", "/admin/score");
        await expect(main(page).getByTestId("home-summary")).toHaveText("1 thing needs you");
        await page.screenshot({ path: `${SHOTS}/home-one-need-${width}.png`, fullPage: true });

        await addUnscoredGames(11);
        await page.reload();
        await expect(tile).toContainText("12 games need a score");
        await expect(need).toContainText("12 games need a score");
        await expect(need).toContainText(`Oldest: vs ${FIXTURE_OPPONENT}`);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-score-hint-${width}.png`, fullPage: true });
      } finally {
        await removeFixtureGames();
      }
    });

    test("At a glance: the season card opens Games, and no website card without Sponsor Insights", async ({ page }) => {
      await page.goto("/admin");
      // ADMIN-RE-10b: website numbers aren't included without the add-on.
      await expect(main(page).getByTestId("glance-season")).toBeVisible();
      await expect(main(page).getByTestId("glance-visits")).toHaveCount(0);
      await expect(main(page)).not.toContainText(/\b0 visits\b|visit numbers/i);
      const season = main(page).getByTestId("glance-season");
      await expect(season).toBeVisible();
      await season.click();
      await expect(page).toHaveURL(/\/admin\/(games|seasons)$/);
    });

    test("a long club name stays on one line in the phone bar, two lines in the sidebar", async ({ page }) => {
      const previous = await setClubName(WORST_CLUB_NAME);
      try {
        await page.goto("/admin");
        // ADMIN-RE-24: the name lives in the frame now.
        const name =
          width === 390
            ? page.getByTestId("admin-shell-club-name")
            : page.locator("aside").getByText(WORST_CLUB_NAME, { exact: true });
        await expect(name).toHaveText(WORST_CLUB_NAME);
        const box = await name.evaluate((element) => ({
          clipped: element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth,
          lines: Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)),
        }));
        expect(box.lines).toBe(width === 390 ? 1 : 2);
        expect(box.clipped).toBe(true);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-long-name-${width}.png`, fullPage: true });
      } finally {
        await setClubName(previous);
      }
    });

    test("other pages get the page bar back to their tab", async ({ page }) => {
      await page.goto("/admin/roster");
      // ADMIN-RE-24: the roster sits under Programs on a programs club like Alpha.
      const back = page.getByRole("banner").getByRole("link", { name: "Programs", exact: true });
      await expect(back).toBeVisible();
      await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Team roster");
      // ADMIN-RE-17: the roster is the new Team roster page inside the new shell.
      await expect(page.getByRole("heading", { level: 1, name: /Your players/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Add a player" }).first()).toBeVisible();
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/roster-top-bar-${width}.png` });
      await back.click();
      await expect(page).toHaveURL(/\/admin\/programs-and-sign-ups$/);
      await page.getByRole("navigation", { name: "Club admin" }).locator('[data-tab="home"]').click();
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(/^(Hi .+|Welcome back)$/);
    });

    test("Edit my website opens the homepage editor inside the new shell", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/admin");
      await main(page).locator('[data-job="edit-website"]').click();
      await expect(page).toHaveURL(/\/admin\/homepage$/);
      await expect(page.getByTestId("admin-edit-bar").getByRole("link", { name: "Website", exact: true })).toBeVisible();
      await expect(main(page).locator(".hp-editor")).toBeVisible();
      await expect(main(page).getByText("We could not load your homepage.")).toHaveCount(0);
      // The editor hides its tools while the sidebar's phone menu is open; the
      // shell provides that state, always closed, so they are never hidden by it.
      const tools = main(page).getByLabel("Homepage tools");
      await expect(tools).not.toHaveAttribute("hidden", /.*/);
      // On phones the editor shows its tools in a bottom bar instead (by design).
      if (width === 1440) {
        await expect(tools).toBeVisible();
        await expect(tools.getByText("Click any words, photo or button in the preview to edit it.")).toBeVisible();
      }
      expect(errors).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/homepage-editor-${width}.png` });
    });
  });
}
