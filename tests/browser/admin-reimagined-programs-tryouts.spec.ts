import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { clubToday } from "../../lib/club-time";

// ADMIN-RE-12c: "Programs and tryouts" on local Alpha (switched to 'reimagined'
// by admin-reimagined.global-setup.ts; Alpha stands in for Diverse City), at
// phone and laptop width. Fixture forms, sign-ups and tryouts are inserted per
// test (names start "RE-12c") and removed in finally blocks, and once more
// before the file in case a run was interrupted. Alpha's own seeded tryout and
// program stay as they are. Screenshots land in test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

const OPEN_FORM = { id: "12c12c12-0000-4000-8000-000000000001", title: "RE-12c Spring tryouts 2027 Registration" };
const DRAFT_FORM = { id: "12c12c12-0000-4000-8000-000000000002", title: "RE-12c Winter Futsal" };
const PRICES = ["12c12c12-0000-4000-8000-000000000011", "12c12c12-0000-4000-8000-000000000012"];
const SPRING = "RE-12c Spring tryouts";
const FALL = "RE-12c Fall tryouts";
// The worst-case fixture: the 80-character name and 160-character place limits.
const LONG = "RE-12c Eastside United Girls Under-12 Academy Spring Open Tryouts and Evaluation W".slice(0, 80);
const LONG_PLACE = "Riverside Community Athletic Complex, Field 4 (north lot entrance off Old Mill Road), Eastside, past the second roundabout and the water tower on the left side".slice(0, 160);
const HIDDEN = "RE-12c Hidden tryout";
const ADDED = "RE-12c Winter tryouts";
// A paid form opens only with payments connected (create_pending_registration and
// the publish check); Alpha has none, so the file adds a test-mode one of its own.
const CONNECT_FIXTURE = "acct_re12cfixture";

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

async function removeFixtures() {
  const forms = [OPEN_FORM.id, DRAFT_FORM.id];
  await sql("delete from onzio.tryouts where club_id=$1 and headline like 'RE-12c%'", [ALPHA]);
  // An open form must keep a price, so close the fixtures before taking them apart.
  await sql("update onzio.registration_forms set status='closed', closed_at=now() where club_id=$1 and id = any($2::uuid[]) and status <> 'closed'", [ALPHA, forms]);
  await sql("delete from onzio.registrations where club_id=$1 and form_id = any($2::uuid[])", [ALPHA, forms]);
  await sql("delete from onzio.registration_price_options where club_id=$1 and form_id = any($2::uuid[])", [ALPHA, forms]);
  await sql("delete from onzio.registration_form_fields where club_id=$1 and form_id = any($2::uuid[])", [ALPHA, forms]);
  await sql("delete from onzio.registration_forms where club_id=$1 and id = any($2::uuid[])", [ALPHA, forms]);
  await sql("delete from onzio.club_stripe_connect where club_id=$1 and stripe_account_id=$2", [ALPHA, CONNECT_FIXTURE]);
}

async function day(offset: number): Promise<string> {
  const [{ time_zone: zone }] = await sql<{ time_zone: string }>("select time_zone from onzio.clubs where id=$1", [ALPHA]);
  const [year, month, date] = clubToday(zone).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

/** An open form with two prices and three paid sign-ups, a draft form, and four tryouts. */
async function seed() {
  await removeFixtures();
  await sql(`insert into onzio.club_stripe_connect (club_id, stripe_account_id, environment, charges_enabled, details_submitted, payouts_enabled)
    values ($1,$2,'test',true,true,true) on conflict (club_id) do nothing`, [ALPHA, CONNECT_FIXTURE]);
  await sql("insert into onzio.registration_forms (id, club_id, slug, title, participant_mode) values ($1,$2,'re12c-open',$3,'adult_only'), ($4,$2,'re12c-draft',$5,'adult_only')",
    [OPEN_FORM.id, ALPHA, OPEN_FORM.title, DRAFT_FORM.id, DRAFT_FORM.title]);
  // The core questions an adult form needs before it can open (assert_registration_form_publishable).
  const fields = [["registrant_name", "Registrant name", "name", "adult"], ["registrant_email", "Registrant email", "email", "adult"],
    ["registrant_phone", "Registrant phone", "phone", "adult"], ["emergency_contact_name", "Emergency contact name", "name", "all"],
    ["emergency_contact_phone", "Emergency contact phone", "phone", "all"]] as const;
  for (const [position, [key, label, type, scope]] of fields.entries()) {
    await sql(`insert into onzio.registration_form_fields (club_id, form_id, field_key, label, field_type, participant_scope, position, required, is_core)
      values ($1,$2,$3,$4,$5,$6,$7,true,true)`, [ALPHA, OPEN_FORM.id, key, label, type, scope, position]);
  }
  await sql("insert into onzio.registration_price_options (id, club_id, form_id, label, amount_cents, active, position) values ($1,$3,$4,'Player',4000,true,0), ($2,$3,$4,'Sibling',2500,true,1)",
    [PRICES[0], PRICES[1], ALPHA, OPEN_FORM.id]);
  await sql("update onzio.registration_forms set status='open' where club_id=$1 and id=$2", [ALPHA, OPEN_FORM.id]);
  for (let n = 0; n < 3; n++) {
    await sql(`insert into onzio.registrations (club_id, form_id, status, participant_type, answers, registrant_email, price_option_id, price_label,
        amount_cents, waiver_accepted_at, status_token_hash, paid_at)
      values ($1,$2,'paid','adult','{}'::jsonb,'re12c@example.test',$3,'Player',4000,now(), md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), now())`,
    [ALPHA, OPEN_FORM.id, PRICES[0]]);
  }
  const rows: Array<Record<string, unknown>> = [
    { headline: SPRING, event_date: await day(30), location: "Riverside Fields", registration_form_id: OPEN_FORM.id },
    { headline: FALL, event_date: await day(-10), location: "Lincoln Park", cta_label: "Sign up", registration_href: "https://example.test/fall" },
    { headline: LONG, event_date: await day(60), location: LONG_PLACE },
    { headline: HIDDEN, hidden: true },
  ];
  for (const [index, row] of rows.entries()) {
    const keys = Object.keys(row);
    await sql(`insert into onzio.tryouts (club_id, status, sort_order, ${keys.join(",")}) values ($1,'open',${100 + index},${keys.map((_, i) => `$${i + 2}`).join(",")})`,
      [ALPHA, ...Object.values(row)]);
  }
}

async function tryoutRow(headline: string) {
  const [row] = await sql<Record<string, unknown>>("select * from onzio.tryouts where club_id=$1 and headline=$2", [ALPHA, headline]);
  return row;
}

function main(page: Page) {
  return page.getByRole("main");
}

function row(page: Page, name: string) {
  return main(page).getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  // The admin frame clips rather than scrolls, so also check nothing in the
  // page runs past the right edge of the screen.
  const overflow = await main(page).evaluate((root, edge) =>
    [...root.querySelectorAll("input, button, li, p, h1, h2")]
      .filter((element) => element.getBoundingClientRect().right > edge + 1)
      .map((element) => element.outerHTML.slice(0, 80)), width);
  expect(overflow).toEqual([]);
}

async function saved(page: Page) {
  const toast = page.getByRole("status").filter({ hasText: /Saved|Added|Copy made|deleted|Undone/ });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  return toast;
}

test.beforeAll(removeFixtures);
test.afterAll(removeFixtures);

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test("lists tryouts by date and programs, each with its state, price and sign-ups", async ({ page }) => {
      await seed();
      try {
        await page.goto("/admin/programs-and-tryouts");
        await expect(main(page).getByRole("heading", { level: 1, name: /Programs and tryouts/ })).toBeVisible({ timeout: 20_000 });
        await expect(main(page).getByRole("heading", { name: "Tryouts", exact: true })).toBeVisible();
        await expect(main(page).getByRole("heading", { name: "Programs", exact: true })).toBeVisible();

        const spring = row(page, SPRING);
        await expect(spring).toContainText("Taking sign-ups");
        await expect(spring).toContainText("From $25");
        await expect(spring.getByRole("link", { name: "3 signed up" })).toBeVisible();

        const fall = row(page, FALL);
        await expect(fall).toContainText("Closed");
        await expect(fall).toContainText(/Closed after \w{3}, \w{3} \d{1,2}/);
        await expect(fall.getByRole("button", { name: "Reopen" })).toBeVisible();

        await expect(row(page, LONG)).toContainText("Not taking sign-ups yet");
        await expect(row(page, HIDDEN)).toContainText("Hidden from your website");
        await expect(row(page, HIDDEN)).toContainText("not taking sign-ups");
        await expect(row(page, "Alpha Academy Pathway")).toBeVisible();

        // By date: Fall (past), then Spring, then the long one far ahead.
        const names = await main(page).getByRole("listitem").allInnerTexts();
        const order = [FALL, SPRING, LONG].map((name) => names.findIndex((text) => text.includes(name)));
        expect(order).toEqual([...order].sort((a, b) => a - b));

        await expect(main(page).getByRole("link", { name: "Programs page words" })).toHaveAttribute("href", "/admin/programs");
        await expect(main(page).getByRole("link", { name: "Tryouts page words" })).toHaveAttribute("href", "/admin/tryouts");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/programs-tryouts-list-${width}.png`, fullPage: true });

        // "N signed up" opens See registrations for that one form.
        await spring.getByRole("link", { name: "3 signed up" }).click();
        await expect(page).toHaveURL(new RegExp(`/admin/sign-ups\\?form=${OPEN_FORM.id}`));
        await expect(main(page).locator("p", { hasText: "Newest first, from" })).toContainText(OPEN_FORM.title, { timeout: 20_000 });
        await expect(main(page).getByRole("link", { name: "All 3" })).toBeVisible();
        await expect(main(page).getByRole("link", { name: "All forms" })).toBeVisible();
      } finally {
        await removeFixtures();
      }
    });

    test("changing how families sign up, closing, reopening and hiding save at once, with Undo", async ({ page }) => {
      await seed();
      try {
        await page.goto("/admin/programs-and-tryouts");
        const long = row(page, LONG);
        await expect(long).toContainText("Not taking sign-ups yet", { timeout: 20_000 });

        // The pill opens "How should families sign up?"; the draft form says it isn't open yet.
        await long.getByRole("button", { name: `How families sign up for ${LONG}` }).click();
        await expect(page.getByText("How should families sign up?")).toBeVisible();
        await page.getByRole("button", { name: "Sign-up form", exact: true }).click();
        await expect(page.getByText("Which form?")).toBeVisible();
        await expect(page.getByRole("button", { name: new RegExp(DRAFT_FORM.title) })).toContainText("Not open yet");
        await expect(page.getByRole("button", { name: new RegExp(OPEN_FORM.title) })).toContainText(`Used by ${SPRING}`);
        await page.getByRole("button", { name: "Which form?" }).click();
        await page.getByRole("button", { name: "They contact you" }).click();
        await page.getByRole("button", { name: "Done" }).click();
        await saved(page);
        await expect(long).toContainText("Taking sign-ups");
        expect((await tryoutRow(LONG)).sign_up_by_contact).toBe(true);

        // Undo puts it back.
        await page.getByRole("button", { name: "Undo" }).click();
        await expect(long).toContainText("Not taking sign-ups yet", { timeout: 15_000 });
        await expect.poll(async () => (await tryoutRow(LONG)).sign_up_by_contact).toBe(false);

        // Reopen a tryout its date closed: it stays open past the date.
        const fall = row(page, FALL);
        await fall.getByRole("button", { name: "Reopen" }).click();
        await saved(page);
        await expect(fall).toContainText("Taking sign-ups");
        expect((await tryoutRow(FALL)).stays_open_after_date).toBe(true);

        // Close from the ⋯ menu, then hide: the public Tryouts page leaves it out.
        const spring = row(page, SPRING);
        await spring.getByRole("button", { name: `More for ${SPRING}` }).click();
        await page.getByRole("button", { name: "Close sign-ups" }).click();
        await saved(page);
        await expect(spring).toContainText("Closed");
        expect((await tryoutRow(SPRING)).status).toBe("closed");

        await spring.getByRole("button", { name: `More for ${SPRING}` }).click();
        await page.getByRole("button", { name: "Hide from your website" }).click();
        await saved(page);
        await expect(spring).toContainText("Hidden from your website");
        expect((await tryoutRow(SPRING)).hidden).toBe(true);
        await page.screenshot({ path: `${SHOTS}/programs-tryouts-changed-${width}.png`, fullPage: true });

        await page.goto("/tryouts");
        await expect(page.getByText(FALL, { exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(SPRING, { exact: true })).toHaveCount(0);
      } finally {
        await removeFixtures();
      }
    });

    test("make a copy starts hidden without its date; delete asks first", async ({ page }) => {
      await seed();
      try {
        await page.goto("/admin/programs-and-tryouts");
        const fall = row(page, FALL);
        await expect(fall).toBeVisible({ timeout: 20_000 });
        await fall.getByRole("button", { name: `More for ${FALL}` }).click();
        await page.getByRole("button", { name: "Make a copy" }).click();
        await saved(page);
        const copyName = `${FALL} (copy)`;
        const copy = row(page, copyName);
        await expect(copy).toContainText("Hidden from your website", { timeout: 15_000 });
        const stored = await tryoutRow(copyName);
        expect(stored).toMatchObject({ hidden: true, event_date: null, registration_href: "", registration_form_id: null });

        await copy.getByRole("button", { name: `More for ${copyName}` }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText(`Delete ${copyName}?`);
        await dialog.getByRole("button", { name: "Keep it" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(copy).toBeVisible();

        await copy.getByRole("button", { name: `More for ${copyName}` }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
        // The list is hidden from assistive tech while the dialog is open, so
        // wait for the dialog to close and the "deleted" note before looking.
        await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByRole("status").filter({ hasText: `${copyName} deleted` })).toBeVisible({ timeout: 15_000 });
        await expect(copy).toHaveCount(0);
        await expect.poll(async () => tryoutRow(copyName)).toBeUndefined();
      } finally {
        await removeFixtures();
      }
    });

    test("adds a tryout with plain questions and the website shows it", async ({ page }) => {
      await seed();
      try {
        await page.goto("/admin/programs-and-tryouts?add=tryout");
        await expect(main(page).getByRole("heading", { level: 1, name: "Add a tryout" })).toBeVisible({ timeout: 20_000 });
        await expect(main(page).getByText("Families can't sign up until you choose how.")).toBeVisible();
        await main(page).getByLabel("What is it called?").fill(ADDED);
        await main(page).getByLabel("When?").fill(await day(45));
        await main(page).getByRole("button", { name: "Riverside Fields" }).click();
        await expect(main(page).getByLabel("Where?")).toHaveValue("Riverside Fields");
        await main(page).getByText("A link to another site").click();
        await main(page).getByRole("textbox", { name: "Link", exact: true }).fill("https://example.test/winter");
        await main(page).getByLabel("Cost (optional)").fill("$25 at the field");
        await expect(main(page).getByText(/It closes by itself after \w{3}, \w{3} \d{1,2}\./)).toBeVisible();
        await expect(main(page).getByLabel("How the Tryouts page shows it")).toContainText("$25 at the field");
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/programs-tryouts-add-${width}.png`, fullPage: true });

        await main(page).getByRole("button", { name: "Add tryout" }).click();
        await expect(page.getByRole("status").filter({ hasText: /^Added/ })).toBeVisible({ timeout: 15_000 });
        await expect(row(page, ADDED)).toContainText("Taking sign-ups");
        expect(await tryoutRow(ADDED)).toMatchObject({ location: "Riverside Fields", registration_href: "https://example.test/winter", cost_text: "$25 at the field", hidden: false });

        await page.goto("/tryouts");
        await expect(page.getByText(ADDED, { exact: true })).toBeVisible({ timeout: 20_000 });
      } finally {
        await removeFixtures();
      }
    });
  });
}
