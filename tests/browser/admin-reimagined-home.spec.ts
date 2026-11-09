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
        await expect(main(page).getByText("Alpha FC · Club admin", { exact: true })).toBeVisible();
        await expect(main(page).getByText("What do you want to do?", { exact: true })).toBeVisible();
        // The reimagined shell: no sidebar and no Home link on the home itself.
        await expect(page.getByRole("button", { name: "Open admin navigation" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveCount(0);

        await setOwnerName("Andrea Lopez-Whitfield");
        await page.reload();
        await expect(main(page).getByRole("heading", { level: 1, name: "Hi Andrea" })).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-${width}.png`, fullPage: true });
      } finally {
        await setOwnerName(previous);
      }
    });

    test("three jobs then four once a form is open, with Sign-up forms in More", async ({ page }) => {
      await page.goto("/admin");
      expect(await jobIds(page)).toEqual(["enter-score", "add-game", "edit-website"]);
      const more = main(page).getByRole("region", { name: "More" });
      await expect(more.getByRole("link", { name: "Sign-up forms" })).toHaveAttribute("href", "/admin/registrations");
      await expect(more.getByRole("link", { name: "Team roster" })).toHaveAttribute("href", "/admin/roster");
      await expect(more.getByRole("link", { name: "Who can sign in" })).toHaveAttribute("href", "/admin/members");
      await expect(more.getByRole("link", { name: "Payments and plan" })).toHaveAttribute("href", "/admin/payments");
      await expect(more.getByRole("link", { name: "About page" })).toHaveAttribute("href", "/admin/about");
      await expect(more.getByRole("link", { name: "Player numbers" })).toHaveAttribute("href", "/admin/stats");
      // Games is always a row (no job opens it); Homepage only while content changes are paused.
      await expect(more.getByRole("link", { name: "Games", exact: true })).toHaveAttribute("href", "/admin/schedule");
      await expect(more.getByRole("link", { name: "Homepage", exact: true })).toHaveCount(0);
      await expect(main(page).locator('[data-job="enter-score"]')).toHaveAttribute("href", "/admin/score");
      await expect(main(page).locator('[data-job="edit-website"]')).toHaveAttribute("href", "/admin/homepage");

      try {
        await addOpenSignUpForm();
        await page.reload();
        expect(await jobIds(page)).toEqual(["enter-score", "add-game", "see-registrations", "edit-website"]);
        await expect(main(page).locator('[data-job="see-registrations"]')).toHaveAttribute("href", "/admin/sign-ups");
        // ADMIN-RE-08: the forms page stays in More now that the tile opens /admin/sign-ups.
        await expect(more.getByRole("link", { name: "Sign-up forms" })).toHaveAttribute("href", "/admin/registrations");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-four-jobs-${width}.png`, fullPage: true });
      } finally {
        await removeOpenSignUpForm();
      }
    });

    test("the score hint counts unscored games: none, one, twelve", async ({ page }) => {
      const tile = main(page).locator('[data-job="enter-score"]');
      try {
        await page.goto("/admin");
        await expect(tile).toHaveText("Enter a score");

        await addUnscoredGames(1);
        await page.reload();
        await expect(tile).toContainText("1 game needs a score");

        await addUnscoredGames(11);
        await page.reload();
        await expect(tile).toContainText("12 games need a score");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-score-hint-${width}.png`, fullPage: true });
      } finally {
        await removeFixtureGames();
      }
    });

    test("a long club name stays on one line with an ellipsis", async ({ page }) => {
      const previous = await setClubName(WORST_CLUB_NAME);
      try {
        await page.goto("/admin");
        const name = main(page).getByTestId("admin-home-club-name");
        await expect(name).toHaveText(WORST_CLUB_NAME);
        await expect(main(page).getByText("· Club admin", { exact: true })).toBeVisible();
        const box = await name.evaluate((element) => ({
          clipped: element.scrollWidth > element.clientWidth,
          lines: Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)),
        }));
        expect(box.lines).toBe(1);
        if (width === 390) expect(box.clipped).toBe(true);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/home-long-name-${width}.png`, fullPage: true });
      } finally {
        await setClubName(previous);
      }
    });

    test("other pages get the slim top bar back to Home", async ({ page }) => {
      await page.goto("/admin/roster");
      const home = page.getByRole("link", { name: "Home", exact: true });
      await expect(home).toBeVisible();
      await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Team roster");
      // The old roster page still works inside the new shell.
      await expect(page.getByRole("button", { name: "Add player", exact: true })).toBeVisible();
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/roster-top-bar-${width}.png` });
      await home.click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(/^(Hi .+|Welcome back)$/);
    });

    test("Edit my website opens the homepage editor inside the new shell", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/admin");
      await main(page).locator('[data-job="edit-website"]').click();
      await expect(page).toHaveURL(/\/admin\/homepage$/);
      await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
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
