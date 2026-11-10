import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import sharp from "sharp";
import { CLUB_IDS } from "../fixtures/entities";
import { savedLabel, websiteState } from "../../lib/save-status";

// ADMIN-RE-14: "Your club" on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width. Alpha is an
// academy site, which has a Contact page and prints a footer line, so every
// card shows; one test unpublishes its design to see the generic site, which
// has neither (like Rose City). The three tables the page writes are put back
// from a snapshot in a finally block, pass or fail. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const TABLES = ["site_branding", "site_social_links", "contact_profile"] as const;
const SEEDED_DOCUMENT = "88888888-8888-4888-8888-888888888804";

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

type Snapshot = Record<(typeof TABLES)[number], unknown[]>;

async function snapshot(): Promise<Snapshot> {
  const out = {} as Snapshot;
  for (const table of TABLES) {
    out[table] = await sql(`select to_jsonb(t) as row from onzio.${table} t where club_id=$1`, [ALPHA]);
  }
  return out;
}

async function restore(before: Snapshot) {
  for (const table of TABLES) {
    await sql(`delete from onzio.${table} where club_id=$1`, [ALPHA]);
    const rows = (before[table] as { row: unknown }[]).map((entry) => entry.row);
    if (rows.length) {
      await sql(`insert into onzio.${table} select * from jsonb_populate_recordset(null::onzio.${table}, $1::jsonb)`, [
        JSON.stringify(rows),
      ]);
    }
  }
}

async function alpha() {
  const [club] = await sql<{ slug: string; public_access: "preview" | "live" | "grace" | "suspended"; name: string }>(
    "select slug, public_access, name from onzio.clubs where id=$1",
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

/** A picture of the whole page: the window is made as tall as the page, so the bar stays at the top. */
async function shot(page: Page, name: string, width: number) {
  const height = await page.evaluate(() => Math.min(3200, document.documentElement.scrollHeight));
  await page.setViewportSize({ width, height: Math.max(900, height) });
  await page.screenshot({ path: `${SHOTS}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: 900 });
}

async function openYourClub(page: Page) {
  await page.goto("/admin");
  await main(page).locator('a[href="/admin/your-club"]').click();
  await expect(page).toHaveURL(/\/admin\/your-club$/);
  await expect(main(page).getByRole("heading", { level: 1, name: "Your club" })).toBeVisible();
}

async function setPortal(portal: "classic" | "reimagined"): Promise<string> {
  const [row] = await sql<{ admin_portal: string }>(
    "update onzio.clubs c set admin_portal=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
    [ALPHA, portal],
  );
  return row.admin_portal;
}

/** A 400 x 240 PNG with a transparent background, for the logo flow. */
async function logoPng(): Promise<Buffer> {
  const width = 400;
  const height = 240;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = Math.hypot(x - width / 2, y - height / 2) < 100;
      const at = (y * width + x) * 4;
      raw[at] = 200;
      raw[at + 1] = 30;
      raw[at + 2] = 60;
      raw[at + 3] = inside ? 255 : 0;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function saveButton(page: Page): Promise<Locator> {
  return page.getByTestId("your-club-save");
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test("opens from More, shows every card on an academy site, and saves everything at once", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const before = await snapshot();
      const club = await alpha();
      const saved = savedLabel(websiteState({ slug: club.slug, publicAccess: club.public_access }));
      try {
        await openYourClub(page);
        const form = main(page);
        await expect(page.getByTestId("admin-top-bar-title")).toHaveCount(0); // the page's own bar takes over
        await expect(page.getByTestId("your-club-bar").getByText("Your club", { exact: true })).toBeAttached();
        for (const heading of ["Your logo", "How can people reach you?", "Your social pages", "A line for your footer"]) {
          await expect(form.getByRole("heading", { level: 2, name: heading })).toBeVisible();
        }
        await expect(form.getByText("Blank hides it")).toBeVisible();
        await expect(page.getByTestId("your-club-status")).toContainText(/Nothing to save yet|^$/);
        await expect(await saveButton(page)).toBeDisabled();
        await expectNoSideScroll(page, width);
        await shot(page, "your-club-clean", width);

        // Instagram typed: its mark appears in the footer card.
        await form.getByRole("textbox", { name: "Instagram", exact: true }).fill("instagram.com/re14fixture");
        await expect(page.getByTestId("your-club-footer-social").locator('[data-platform="instagram"]')).toBeVisible();
        // Hours changed: the Contact page card follows.
        await form.getByRole("textbox", { name: "Hours", exact: true }).fill("Mon–Fri, 9 am – 5 pm");
        await expect(page.getByTestId("your-club-contact-preview")).toContainText("Mon–Fri, 9 am – 5 pm");
        await form.getByRole("textbox", { name: "Footer line", exact: true }).fill("Every kid, every Saturday.");
        await expect(page.getByTestId("your-club-footer-preview")).toContainText("Every kid, every Saturday.");
        await expect(form.getByText("20/200")).toBeVisible();
        await expect(form.getByText("26/160")).toBeVisible();
        // Three things changed: the footer line, the social page and the contact details.
        await expect(page.getByTestId("your-club-status")).toContainText(/3 changes not saved yet|Not saved yet/);
        await shot(page, "your-club-edited", width);

        const save = await saveButton(page);
        await save.click();
        await expect(save).toHaveText(saved);
        await expect(page.getByRole("status").filter({ hasText: saved })).toBeAttached();
        await expectNoSideScroll(page, width);
        await shot(page, "your-club-saved", width);

        const social = await sql<{ href: string }>("select href from onzio.site_social_links where club_id=$1 and id='instagram'", [ALPHA]);
        expect(social).toEqual([{ href: "https://instagram.com/re14fixture" }]);
        const contact = await sql<{ hours: string }>("select hours from onzio.contact_profile where club_id=$1", [ALPHA]);
        expect(contact).toEqual([{ hours: "Mon–Fri, 9 am – 5 pm" }]);
        const branding = await sql<{ footer_tagline: string }>("select footer_tagline from onzio.site_branding where club_id=$1", [ALPHA]);
        expect(branding).toEqual([{ footer_tagline: "Every kid, every Saturday." }]);

        // A reload shows what was saved, the address without its https://.
        await page.reload();
        await expect(main(page).getByRole("textbox", { name: "Instagram", exact: true })).toHaveValue("instagram.com/re14fixture");
        await expect(main(page).getByRole("textbox", { name: "Hours", exact: true })).toHaveValue("Mon–Fri, 9 am – 5 pm");
        expect(errors).toEqual([]);
      } finally {
        await restore(before);
      }
    });

    test("‹ Club asks first when something is not saved, and a clear page leaves without asking", async ({ page }) => {
      const before = await snapshot();
      try {
        await openYourClub(page);
        // Nothing changed: ‹ Club (ADMIN-RE-24: its tab) just goes.
        await page.getByTestId("your-club-bar").getByRole("link", { name: "Club", exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/club$/);

        await openYourClub(page);
        await main(page).getByRole("textbox", { name: "Hours", exact: true }).fill("Always open");
        await page.getByTestId("your-club-bar").getByRole("link", { name: "Club", exact: true }).click();
        const ask = page.getByRole("dialog", { name: "Save your changes first?" });
        await expect(ask).toBeVisible();
        await expect(ask).toContainText("1 change is not saved yet.");
        await ask.getByRole("button", { name: "Keep editing" }).click();
        await expect(page).toHaveURL(/\/admin\/your-club$/);
        // ADMIN-RE-24: on a laptop the sidebar's tabs ask first too.
        const sideHome = page.getByRole("navigation", { name: "Club admin" }).locator('[data-tab="home"]');
        if (await sideHome.isVisible()) {
          await sideHome.click();
          await expect(ask).toBeVisible();
          await ask.getByRole("button", { name: "Keep editing" }).click();
          await expect(page).toHaveURL(/\/admin\/your-club$/);
        }
        await expect(main(page).getByRole("textbox", { name: "Hours", exact: true })).toHaveValue("Always open");

        await page.getByTestId("your-club-bar").getByRole("link", { name: "Club", exact: true }).click();
        await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Leave without saving" }).click();
        await expect(page).toHaveURL(/\/admin\/club$/);
        const contact = await sql<{ hours: string }>("select hours from onzio.contact_profile where club_id=$1", [ALPHA]);
        expect(contact.every((row) => row.hours !== "Always open")).toBe(true);

        // Save and continue saves, then goes back to Club.
        await openYourClub(page);
        await main(page).getByRole("textbox", { name: "Hours", exact: true }).fill("Always open");
        await page.getByTestId("your-club-bar").getByRole("link", { name: "Club", exact: true }).click();
        await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Save and continue" }).click();
        await expect(page).toHaveURL(/\/admin\/club$/);
        const after = await sql<{ hours: string }>("select hours from onzio.contact_profile where club_id=$1", [ALPHA]);
        expect(after).toEqual([{ hours: "Always open" }]);
      } finally {
        await restore(before);
      }
    });

    test("answers that are too long or are not web addresses are refused with a plain message", async ({ page }) => {
      const before = await snapshot();
      try {
        await openYourClub(page);
        const form = main(page);
        await form.getByRole("textbox", { name: "Email", exact: true }).fill("not-an-email");
        await form.getByRole("textbox", { name: "X", exact: true }).fill("@eastside");
        await (await saveButton(page)).click();
        await expect(form.getByText("Enter a valid email address, or leave it blank.")).toBeVisible();
        await expect(form.getByText("Use a web address, like x.com/yourclub.")).toBeVisible();
        await expect(page.getByTestId("your-club-message")).toHaveText("Fix the highlighted answers, then save.");
        await expect(form.getByRole("textbox", { name: "Email", exact: true })).toBeFocused();
        // Nothing was written.
        expect(await sql("select 1 from onzio.contact_profile where club_id=$1 and public_email='not-an-email'", [ALPHA])).toEqual([]);
        await shot(page, "your-club-errors", width);
      } finally {
        await restore(before);
      }
    });

    test("the worst case fits: a huge address, a 160-character footer line and 200 characters of hours", async ({ page }) => {
      const before = await snapshot();
      try {
        await openYourClub(page);
        const form = main(page);
        const unbroken = `https://instagram.com/${"a".repeat(2048 - "https://instagram.com/".length)}`;
        await form.getByRole("textbox", { name: "Instagram", exact: true }).fill(unbroken);
        await form.getByRole("textbox", { name: "Email", exact: true }).fill(`${"e".repeat(40)}@${"d".repeat(200)}.com`);
        await form.getByRole("textbox", { name: "Hours", exact: true }).fill("h".repeat(260)); // the box stops at 200
        await form.getByRole("textbox", { name: "Footer line", exact: true }).fill("w".repeat(200)); // and this one at 160
        await expect(form.getByRole("textbox", { name: "Hours", exact: true })).toHaveValue("h".repeat(200));
        await expect(form.getByRole("textbox", { name: "Footer line", exact: true })).toHaveValue("w".repeat(160));
        await expect(form.getByText("200/200")).toBeVisible();
        await expect(form.getByText("160/160")).toBeVisible();
        await expect(page.getByTestId("your-club-footer-preview")).toBeVisible();
        await expectNoSideScroll(page, width);
        await shot(page, "your-club-worst", width);
        // 2,048 characters is the most a social address may have, and it saves.
        await (await saveButton(page)).click();
        await expect(page.getByTestId("your-club-save")).toContainText(/Saved/);
        const rows = await sql<{ href: string }>("select href from onzio.site_social_links where club_id=$1 and id='instagram'", [ALPHA]);
        expect(rows[0]?.href).toBe(unbroken);
        expect(unbroken).toHaveLength(2048);
      } finally {
        await restore(before);
      }
    });

    test("a new logo goes through Fit your logo, then saves with everything else", async ({ page }) => {
      const before = await snapshot();
      try {
        await openYourClub(page);
        const form = main(page);
        // JPEG is refused up front, in plain words.
        await page.getByTestId("your-club-logo-input").setInputFiles({
          name: "logo.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]),
        });
        await expect(form.getByText("Choose a PNG or WebP picture.")).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        await page.getByTestId("your-club-logo-input").setInputFiles({ name: "club.png", mimeType: "image/png", buffer: await logoPng() });
        const dialog = page.getByRole("dialog", { name: "Fit your logo" });
        await expect(dialog).toBeVisible();
        for (const label of ["Menu", "Footer", "Browser tab"]) await expect(dialog.getByText(label, { exact: true })).toBeVisible();
        await dialog.getByLabel("Zoom").fill("2");
        await page.screenshot({ path: `${SHOTS}/your-club-fit-${width}.png`, fullPage: false });
        await dialog.getByRole("button", { name: "Use this fit" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(form.getByText("New logo, not saved yet")).toBeVisible();
        await expect(page.getByTestId("your-club-status")).toContainText(/1 change not saved yet|Not saved yet/);

        const save = await saveButton(page);
        await save.click();
        await expect(save).toContainText("Saved", { timeout: 30_000 });
        await expect(form.getByText("New logo, not saved yet")).toHaveCount(0);
        const [branding] = await sql<{ club_logo_path: string; club_logo_asset_id: string | null }>(
          "select club_logo_path, club_logo_asset_id from onzio.site_branding where club_id=$1",
          [ALPHA],
        );
        // The media server normalizes a graphic (PNG in, WebP out), so either ending is right.
        expect(branding.club_logo_path).toMatch(/\/branding\/[0-9a-f-]{36}\.(png|webp)$/);
        expect(branding.club_logo_asset_id).toMatch(/^[0-9a-f-]{36}$/);
        // The saved logo shows, from the public URL (not the preview that was just let go).
        await expect(page.getByTestId("your-club-logo").locator("img")).toHaveAttribute("src", /\/storage\/v1\/object\/public\//);
        await shot(page, "your-club-logo-saved", width);
      } finally {
        await restore(before);
      }
    });

    test("a site without a Contact page or a footer line asks only about the logo and social pages", async ({ page }) => {
      const before = await snapshot();
      await sql("update onzio.presentation_state set published_document_id=null where club_id=$1", [ALPHA]);
      try {
        await openYourClub(page);
        const form = main(page);
        await expect(form.getByRole("heading", { level: 2, name: "Your logo" })).toBeVisible();
        await expect(form.getByRole("heading", { level: 2, name: "Your social pages" })).toBeVisible();
        await expect(form.getByRole("heading", { level: 2, name: "How can people reach you?" })).toHaveCount(0);
        await expect(form.getByRole("heading", { level: 2, name: "A line for your footer" })).toHaveCount(0);
        await expect(page.getByTestId("your-club-contact-preview")).toHaveCount(0);
        await form.getByRole("textbox", { name: "Facebook", exact: true }).fill("facebook.com/re14fixture");
        await (await saveButton(page)).click();
        await expect(page.getByTestId("your-club-save")).toContainText(/Saved/);
        // Only the social page was written.
        expect(await sql("select 1 from onzio.contact_profile where club_id=$1 and hours='Always open'", [ALPHA])).toEqual([]);
        await shot(page, "your-club-generic", width);
      } finally {
        await sql("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [ALPHA, SEEDED_DOCUMENT]);
        await restore(before);
      }
    });

    test("a saved http:// or port address loads clean, and a cleared footer line previews the standard wording", async ({ page }) => {
      const before = await snapshot();
      try {
        await sql("delete from onzio.site_social_links where club_id=$1 and id in ('instagram','facebook')", [ALPHA]);
        await sql(
          `insert into onzio.site_social_links (club_id, id, label, href, icon, sort_order)
           values ($1,'instagram','Instagram','http://instagram.com/re14fixture','/images/logo/instagramLogo.svg',0),
                  ($1,'facebook','Facebook','https://facebook.com:443/re14fixture','/images/logo/facebookLogo.svg',1)`,
          [ALPHA],
        );
        await openYourClub(page);
        const form = main(page);
        await expect(form.getByRole("textbox", { name: "Instagram", exact: true })).toHaveValue("instagram.com/re14fixture");
        await expect(form.getByRole("textbox", { name: "Facebook", exact: true })).toHaveValue("facebook.com:443/re14fixture");
        // Nothing was touched, so nothing is unsaved, and Save has nothing to do.
        await expect(page.getByTestId("your-club-status")).toContainText("Nothing to save yet");
        await expect(await saveButton(page)).toBeDisabled();
        const footer = page.getByTestId("your-club-footer-social");
        await expect(footer.locator('[data-platform="instagram"]')).toBeVisible();
        await expect(footer.locator('[data-platform="facebook"]')).toBeVisible();

        // Saving something else leaves both addresses exactly as they were.
        await form.getByRole("textbox", { name: "Hours", exact: true }).fill("Always open");
        await expect(page.getByTestId("your-club-status")).toContainText(/1 change not saved yet|Not saved yet/);
        await (await saveButton(page)).click();
        await expect(page.getByTestId("your-club-save")).toContainText(/Saved/);
        const rows = await sql<{ id: string; href: string }>(
          "select id, href from onzio.site_social_links where club_id=$1 and id in ('instagram','facebook') order by id",
          [ALPHA],
        );
        expect(rows).toEqual([
          { id: "facebook", href: "https://facebook.com:443/re14fixture" },
          { id: "instagram", href: "http://instagram.com/re14fixture" },
        ]);

        // A cleared footer line puts the standard wording back, on the website and in the preview.
        await form.getByRole("textbox", { name: "Footer line", exact: true }).fill("");
        await expect(page.getByTestId("your-club-footer-preview")).toContainText("One Club. One Community.");
      } finally {
        await restore(before);
      }
    });

    test("a club still on the classic admin is sent to Branding", async ({ page }) => {
      const previous = await setPortal("classic");
      try {
        await page.goto("/admin/your-club");
        await expect(page).toHaveURL(/\/admin\/branding$/);
      } finally {
        await setPortal(previous as "classic" | "reimagined");
      }
    });
  });
}
