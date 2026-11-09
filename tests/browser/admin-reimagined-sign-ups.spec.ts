import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// ADMIN-RE-08: "See registrations" on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width, with the
// worst-case people from the cd-regs design. Fixture forms and sign-ups are
// inserted per test and removed in finally blocks, and once more before and
// after the file in case a run was interrupted. Screenshots land in
// test-results/admin-reimagined/. Contact details are asserted on screen only,
// never printed.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

const LONG_FORM = { id: "08080808-0808-4808-8808-080808080801", price: "08080808-0808-4808-8808-080808080811" };
const WINTER_FORM = { id: "08080808-0808-4808-8808-080808080802", price: "08080808-0808-4808-8808-080808080812" };
const LONG_FORM_TITLE = "Fall Youth Program Under 12 Girls Competitive Academy 2026-27";
const LONG_NAME = "Christopher Alexander Montgomery III";
const LONG_GUARDIAN = "Aleksandra Wiśniewska-Kowalczyk";
const LONG_PHONE = "+44 (0)20 7946 0958 ext. 12345";
const LONG_EMAIL = "bartholomew.fitzgerald@northwind-industries-holdings.example.com";

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

async function removeFixtures() {
  const ids = [LONG_FORM.id, WINTER_FORM.id];
  await sql("delete from onzio.registrations where club_id=$1 and form_id = any($2::uuid[])", [ALPHA, ids]);
  await sql("delete from onzio.registration_price_options where club_id=$1 and form_id = any($2::uuid[])", [ALPHA, ids]);
  await sql("delete from onzio.registration_forms where club_id=$1 and id = any($2::uuid[])", [ALPHA, ids]);
}

type Person = {
  form: typeof LONG_FORM;
  daysAgo: number;
  cents: number;
  status: "paid" | "refunded";
  participant: "minor" | "adult";
  answers: Record<string, string>;
};

/** Two closed forms and four people, newest first: the worst fixture's names. */
async function seedSignUps() {
  await removeFixtures();
  for (const [form, slug, title] of [
    [LONG_FORM, "re08-long", LONG_FORM_TITLE],
    [WINTER_FORM, "re08-winter", "Winter Tryouts"],
  ] as const) {
    await sql("insert into onzio.registration_forms (id, club_id, slug, title) values ($1, $2, $3, $4)", [form.id, ALPHA, slug, title]);
    await sql(
      "insert into onzio.registration_price_options (id, club_id, form_id, label, amount_cents, active, position) values ($1, $2, $3, 'Fee', 12000, true, 0)",
      [form.price, ALPHA, form.id],
    );
  }
  const people: Person[] = [
    {
      form: LONG_FORM,
      daysAgo: 1,
      cents: 125000,
      status: "paid",
      participant: "minor",
      answers: { player_name: LONG_NAME, guardian_name: LONG_GUARDIAN, guardian_phone: LONG_PHONE, guardian_email: LONG_EMAIL },
    },
    {
      form: WINTER_FORM,
      daysAgo: 2,
      cents: 0,
      status: "paid",
      participant: "adult",
      answers: { registrant_name: "Jo", registrant_phone: "(503) 555-0199", registrant_email: "jo@example.com" },
    },
    {
      form: LONG_FORM,
      daysAgo: 3,
      cents: 12000,
      status: "paid",
      participant: "minor",
      answers: { player_name: "Đặng Thị Ngọc Hân", guardian_name: "Ana Reyes", guardian_phone: "(503) 555-0142", guardian_email: "ana.reyes@example.com" },
    },
    {
      form: WINTER_FORM,
      daysAgo: 4,
      cents: 4000,
      status: "refunded",
      participant: "minor",
      answers: { player_name: "王秀英", guardian_name: "王芳", guardian_phone: "(503) 555-0100", guardian_email: "wang@example.com" },
    },
  ];
  for (const person of people) {
    await sql(
      `insert into onzio.registrations (
         club_id, form_id, status, participant_type, answers, registrant_email, price_option_id, price_label,
         amount_cents, amount_refunded_cents, waiver_accepted_at, status_token_hash,
         submitted_at, expires_at, paid_at, refunded_at)
       select $1, $2, $3, $4, $5::jsonb, 're08-fixture@example.com', $6, 'Fee',
         $7, case when $3 = 'refunded' then $7 else 0 end, s.at, md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
         s.at, s.at + interval '1 day', s.at + interval '1 minute',
         case when $3 = 'refunded' then s.at + interval '1 day' end
       from (select now() - make_interval(days => $8) as at) s`,
      [ALPHA, person.form.id, person.status, person.participant, JSON.stringify(person.answers), person.form.price, person.cents, person.daysAgo],
    );
  }
}

async function setPortal(portal: "classic" | "reimagined"): Promise<string> {
  const [row] = await sql<{ admin_portal: string }>(
    "update onzio.clubs c set admin_portal=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
    [ALPHA, portal],
  );
  return row.admin_portal;
}

// Next streams pages in; scope lookups to <main> like the home suite does.
function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

async function rowNames(page: Page) {
  return main(page).getByTestId("sign-up-name").allTextContents();
}

test.beforeAll(removeFixtures);
test.afterAll(removeFixtures);

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test("No sign-ups yet, with the way to the forms and nothing to download", async ({ page }) => {
      await page.goto("/admin/sign-ups");
      await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Registrations");
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("0 new this week");
      await expect(main(page).getByText("Newest first, from all your registration forms")).toBeVisible();
      await expect(main(page).getByTestId("sign-ups-empty")).toHaveText("No sign-ups yet");
      await expect(main(page).locator('[data-tab="all"]')).toHaveText("All0");
      await expect(page.getByRole("button", { name: "Download list" })).toBeDisabled();
      await expect(main(page).getByTestId("sign-up-forms-link")).toHaveAttribute("href", "/admin/registrations");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/sign-ups-empty-${width}.png`, fullPage: true });
    });

    test("the tile opens the list: newest first, long names on two lines, and the tabs", async ({ page }) => {
      try {
        await seedSignUps();
        await page.goto("/admin");
        const tile = main(page).locator('[data-job="see-registrations"]');
        await expect(tile).toContainText("3 new");
        await expect(tile).toHaveAttribute("href", "/admin/sign-ups");
        await tile.click();
        await expect(page).toHaveURL(/\/admin\/sign-ups$/);

        await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("3 new this week");
        expect(await rowNames(page)).toEqual([LONG_NAME, "Jo", "Đặng Thị Ngọc Hân", "王秀英"]);
        const first = main(page).locator("[data-person]").first();
        await expect(first).toContainText("Paid $1,250");
        await expect(first).toContainText(`${LONG_FORM_TITLE} · Yesterday`);
        // A long form name gives way to "…"; the day itself is never cut off.
        const day = await first.getByText("· Yesterday").evaluate((element) => {
          const box = element.getBoundingClientRect();
          return { right: box.right, clipped: element.scrollWidth > element.clientWidth };
        });
        const badge = await first.getByText("Paid $1,250").boundingBox();
        expect(day.clipped).toBe(false);
        expect(day.right).toBeLessThanOrEqual(badge!.x);
        await expect(main(page).locator("[data-person]").nth(1)).toContainText("Paid $0");
        await expect(main(page).locator("[data-person]").nth(3)).toContainText("Refunded $40");

        // Names wrap to two lines at most, with the full name on hover.
        const name = main(page).getByTestId("sign-up-name").first();
        await expect(name).toHaveAttribute("title", LONG_NAME);
        const lines = await name.evaluate((element) =>
          Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)),
        );
        expect(lines).toBeLessThanOrEqual(2);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/sign-ups-list-${width}.png`, fullPage: true });

        await expect(main(page).locator('[data-tab="paid"]')).toHaveText("Paid3");
        await main(page).locator('[data-tab="refunded"]').click();
        await expect(page).toHaveURL(/tab=refunded/);
        await expect(main(page).locator('[data-tab="refunded"]')).toHaveAttribute("aria-current", "page");
        await expect.poll(() => rowNames(page)).toEqual(["王秀英"]);
        await main(page).locator('[data-tab="paid"]').click();
        await expect.poll(() => rowNames(page)).toEqual([LONG_NAME, "Jo", "Đặng Thị Ngọc Hân"]);
        await main(page).locator('[data-tab="all"]').click();
        await expect.poll(() => rowNames(page)).toHaveLength(4);
      } finally {
        await removeFixtures();
      }
    });

    test(width === 390 ? "details are a page of their own on a phone" : "details open beside the list on a laptop", async ({ page }) => {
      try {
        await seedSignUps();
        await page.goto("/admin/sign-ups");
        await main(page).locator("[data-person]").first().click();
        await expect(page).toHaveURL(/person=/);

        const details = main(page).getByTestId("sign-up-details");
        await expect(details.getByRole("heading", { level: 2 })).toHaveText(LONG_NAME);
        await expect(details.getByRole("heading", { name: "Parent or guardian" })).toBeVisible();
        await expect(details.getByText(LONG_GUARDIAN)).toBeVisible();
        await expect(details.getByRole("link", { name: LONG_PHONE })).toHaveAttribute("href", "tel:+4402079460958");
        await expect(details.getByRole("link", { name: LONG_EMAIL })).toHaveAttribute("href", `mailto:${LONG_EMAIL}`);
        await expect(details.getByText(/^\$1,250 on [A-Z][a-z]{2} \d{1,2}$/)).toBeVisible();
        await expect(details.getByText("Card, through Stripe")).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/sign-ups-details-${width}.png`, fullPage: true });

        if (width === 390) {
          // The list steps aside; "‹ Registrations" brings it back.
          await expect(main(page).locator("[data-person]").first()).toBeHidden();
          await details.getByRole("button", { name: "Registrations" }).click();
          await expect(details).toHaveCount(0);
          await expect(main(page).locator("[data-person]").first()).toBeVisible();
        } else {
          // The list stays, with the panel to its right; another person swaps in, Escape closes.
          const row = main(page).locator("[data-person]").first();
          await expect(row).toBeVisible();
          await expect(row).toHaveAttribute("aria-current", "true");
          const [listBox, panelBox] = await Promise.all([row.boundingBox(), details.boundingBox()]);
          expect(panelBox!.x).toBeGreaterThanOrEqual(listBox!.x + listBox!.width);

          await main(page).locator("[data-person]").nth(1).click();
          // The sliding panel shows both people for a moment while Jo slides in.
          await expect(details.getByRole("heading", { level: 2 })).toHaveCount(1);
          await expect(details.getByRole("heading", { level: 2 })).toHaveText("Jo");
          await expect(details.getByRole("heading", { name: "Contact" })).toBeVisible();
          await expect(details.getByRole("link", { name: "jo@example.com" })).toBeVisible();

          await page.keyboard.press("Escape");
          await expect(details).toHaveCount(0);
          await expect(page).not.toHaveURL(/person=/);
        }
      } finally {
        await removeFixtures();
      }
    });

    test("Download list asks which form, then downloads that form's list", async ({ page }) => {
      try {
        await seedSignUps();
        await page.goto("/admin/sign-ups");
        const button = page.getByRole("button", { name: "Download list" });
        await button.click();
        await expect(page.getByText("Which form?")).toBeVisible();
        await expect(page.getByRole("button", { name: /Winter Tryouts/ })).toContainText("2 sign-ups");
        await page.screenshot({ path: `${SHOTS}/sign-ups-download-picker-${width}.png` });

        const downloaded = page.waitForEvent("download");
        await page.getByRole("button", { name: /Winter Tryouts/ }).click();
        const file = await downloaded;
        expect(file.suggestedFilename()).toBe("winter-tryouts.csv");
        const csv = await readFile((await file.path())!, "utf8");
        expect(csv).toContain("Jo");
        expect(csv).not.toContain(LONG_NAME);
        await expect(button).toHaveAttribute("data-state", "done");
      } finally {
        await removeFixtures();
      }
    });
  });
}

test("a club still on the classic admin is sent to the old Registrations page", async ({ page }) => {
  const previous = await setPortal("classic");
  try {
    await page.goto("/admin/sign-ups");
    await expect(page).toHaveURL(/\/admin\/registrations$/);
  } finally {
    await setPortal(previous as "classic" | "reimagined");
  }
});
