import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import sharp from "sharp";
import { CLUB_IDS } from "../fixtures/entities";
import { savedLabel, websiteState } from "../../lib/save-status";

// ADMIN-RE-15: Sponsors, one list, on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width, light and dark.
// Alpha is an academy site, whose footer shows no sponsors, so it has no
// Footer switch (like Diverse City); one test unpublishes its design to see the
// generic site, whose footer does (like a Rose City-style site). The sponsor
// rows are put back from a snapshot in a finally block, pass or fail. The
// classic page, which Diverse City keeps, is checked at the end on the same
// rows. Screenshots land in test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const ORIGIN = "http://alpha.localhost:3110";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const SEEDED_DOCUMENT = "88888888-8888-4888-8888-888888888804";
const LOGO = "/images/partners/tepitoSponsor.png";

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

async function snapshot(): Promise<unknown[]> {
  return (await sql<{ row: unknown }>("select to_jsonb(t) as row from onzio.site_sponsor_logos t where club_id=$1", [ALPHA])).map(
    (entry) => entry.row,
  );
}

async function restore(rows: unknown[]) {
  await sql("delete from onzio.site_sponsor_logos where club_id=$1", [ALPHA]);
  if (rows.length) {
    await sql("insert into onzio.site_sponsor_logos select * from jsonb_populate_recordset(null::onzio.site_sponsor_logos, $1::jsonb)", [
      JSON.stringify(rows),
    ]);
  }
}

type Seed = { name: string; homepage?: boolean; footer?: boolean; website?: string | null; logo?: string };

async function seed(list: Seed[]) {
  await sql("delete from onzio.site_sponsor_logos where club_id=$1", [ALPHA]);
  for (const [index, sponsor] of list.entries()) {
    await sql(
      `insert into onzio.site_sponsor_logos (club_id,name,logo_url,sort_order,show_on_homepage,show_in_footer,website_url)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [ALPHA, sponsor.name, sponsor.logo ?? LOGO, index, sponsor.homepage ?? true, sponsor.footer ?? false, sponsor.website ?? null],
    );
  }
}

type Saved = { name: string; show_on_homepage: boolean; show_in_footer: boolean; website_url: string | null; media_asset_id: string | null };

async function saved(): Promise<Saved[]> {
  return sql<Saved>(
    "select name, show_on_homepage, show_in_footer, website_url, media_asset_id from onzio.site_sponsor_logos where club_id=$1 order by sort_order",
    [ALPHA],
  );
}

async function alphaSavedText() {
  const [club] = await sql<{ slug: string; public_access: "preview" | "live" | "grace" | "suspended" }>(
    "select slug, public_access from onzio.clubs where id=$1",
    [ALPHA],
  );
  return savedLabel(websiteState({ slug: club.slug, publicAccess: club.public_access }));
}

function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

async function setTheme(context: BrowserContext, theme: "light" | "dark") {
  await context.addCookies([{ name: "onzio-admin-theme", value: theme, url: ORIGIN }]);
}

async function shot(page: Page, name: string, width: number) {
  const height = await page.evaluate(() => Math.min(3600, document.documentElement.scrollHeight));
  await page.setViewportSize({ width, height: Math.max(900, height) });
  await page.screenshot({ path: `${SHOTS}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: 900 });
}

// The Sponsors page sits on the Website tab (ADMIN-RE-24).
async function openSponsors(page: Page) {
  await page.goto("/admin/website");
  // Click once the tab page is interactive; a busy machine can hydrate slowly.
  await page.waitForLoadState("networkidle");
  await main(page).locator('a[href="/admin/sponsors"]').click();
  await expect(page).toHaveURL(/\/admin\/sponsors$/, { timeout: 15_000 });
  await expect(main(page).getByRole("heading", { level: 1, name: "Sponsors" })).toBeVisible();
}

/** A PNG logo of the given size. */
async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 230, g: 230, b: 230, alpha: 1 } } }).png().toBuffer();
}

function cards(page: Page) {
  return page.getByTestId("sponsor-card");
}

async function openMenu(page: Page, index: number) {
  await cards(page).nth(index).getByTestId("sponsor-more").click();
  return page.getByRole("menu");
}

async function setPortal(portal: "classic" | "reimagined") {
  await sql("update onzio.clubs set admin_portal=$2 where id=$1", [ALPHA, portal]);
}

for (const width of [390, 1440]) {
  test.describe(`Sponsors at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const theme of ["light", "dark"] as const) {
      test(`${theme}: starts empty, adds logos once, and saves names, websites and order`, async ({ page, context }) => {
        const before = await snapshot();
        try {
          await setTheme(context, theme);
          await seed([]);
          await openSponsors(page);
          await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
          await expect(page.getByTestId("sponsors-empty")).toHaveText("No sponsors yet");
          await expect(page.getByTestId("sponsors-counts")).toHaveText("Homepage 0 of 10");
          // An academy footer shows no sponsors: no Footer switch, no Footer count.
          await expect(page.getByTestId("sponsor-footer")).toHaveCount(0);

          // A JPEG is refused in plain words; a big PNG and a small one are added.
          await page.getByTestId("sponsors-file-input").setInputFiles({
            name: "logo.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]),
          });
          await expect(page.getByTestId("sponsors-message")).toContainText("is not a PNG or WebP picture");
          await page.getByTestId("sponsors-file-input").setInputFiles([
            { name: "kims-hardware.png", mimeType: "image/png", buffer: await png(800, 240) },
            { name: "tiny_cafe.png", mimeType: "image/png", buffer: await png(60, 20) },
          ]);
          await expect(cards(page)).toHaveCount(2, { timeout: 30_000 });
          await expect(page.getByTestId("sponsor-name").nth(0)).toHaveValue("kims hardware");
          await expect(page.getByTestId("sponsor-name").nth(1)).toHaveValue("tiny cafe");
          await expect(page.getByTestId("sponsors-counts")).toHaveText("Homepage 2 of 10");
          // Only the small logo gets the gentle note; it never blocks saving.
          await expect(cards(page).nth(1).getByTestId("sponsor-blurry")).toBeVisible();
          await expect(cards(page).nth(0).getByTestId("sponsor-blurry")).toHaveCount(0);

          await page.getByTestId("sponsor-name").nth(0).fill("Kim’s Hardware");
          await page.getByTestId("sponsor-website").nth(0).fill("kimshardware.com");
          // Move the small one first.
          const menu = await openMenu(page, 1);
          await expect(menu.getByTestId("sponsor-move-right")).toHaveAttribute("data-disabled", "");
          await menu.getByTestId("sponsor-move-left").click();
          await expect(page.getByTestId("sponsor-name").nth(0)).toHaveValue("tiny cafe");
          await expect(page.getByTestId("sponsors-status")).toContainText(/2 changes not saved yet|Not saved yet/);
          await expectNoSideScroll(page, width);

          const save = page.getByTestId("sponsors-save");
          await save.click();
          await expect(save).toContainText(await alphaSavedText(), { timeout: 30_000 });
          const rows = await saved();
          expect(rows.map(({ name, show_on_homepage, show_in_footer, website_url }) => ({ name, show_on_homepage, show_in_footer, website_url }))).toEqual([
            { name: "tiny cafe", show_on_homepage: true, show_in_footer: false, website_url: null },
            { name: "Kim’s Hardware", show_on_homepage: true, show_in_footer: false, website_url: "https://kimshardware.com" },
          ]);
          expect(rows.every((row) => /^[0-9a-f-]{36}$/.test(row.media_asset_id ?? ""))).toBe(true);
          // The website shows as its domain until it is edited.
          await expect(page.getByTestId("sponsor-website").nth(1)).toHaveValue("kimshardware.com");
          await expect(page.getByTestId("sponsors-preview-homepage").locator("img")).toHaveCount(2);
          await shot(page, `sponsors-${theme}`, width);
        } finally {
          await restore(before);
        }
      });
    }

    test("a footer that shows sponsors gets the Footer switch, and a full place greys it", async ({ page }) => {
      const before = await snapshot();
      await sql("update onzio.presentation_state set published_document_id=null where club_id=$1", [ALPHA]);
      try {
        await seed([
          { name: "Lakeside Dental", footer: true },
          { name: "Northgate Bakery", footer: true },
          { name: "Harbor Auto", footer: true },
          { name: "Pinecrest Realty", footer: true },
          { name: "Millbrook Pizza", footer: true },
          { name: "Riverside Gym", footer: true },
        ]);
        await openSponsors(page);
        await expect(page.getByTestId("sponsors-counts")).toHaveText("Homepage 6 of 10Footer 6 of 6");
        await page.getByTestId("sponsors-file-input").setInputFiles({ name: "summit-coffee.png", mimeType: "image/png", buffer: await png(800, 240) });
        await expect(cards(page)).toHaveCount(7, { timeout: 30_000 });
        const added = cards(page).nth(6);
        await expect(added.getByTestId("sponsor-homepage")).toHaveAttribute("data-checked", "");
        await expect(added.getByTestId("sponsor-footer")).toHaveAttribute("data-disabled", "");
        await expect(added.getByText("Footer is full (6 of 6)")).toBeVisible();

        // Making room lets it in.
        await cards(page).nth(0).getByTestId("sponsor-footer").click();
        await expect(added.getByTestId("sponsor-footer")).not.toHaveAttribute("data-disabled", "");
        await added.getByTestId("sponsor-footer").click();
        await expect(page.getByTestId("sponsors-counts")).toHaveText("Homepage 7 of 10Footer 6 of 6");

        // A sponsor removed from the page is deleted on Save.
        const menu = await openMenu(page, 1);
        await menu.getByTestId("sponsor-remove").click();
        await expect(cards(page)).toHaveCount(6);
        await page.getByTestId("sponsors-save").click();
        await expect(page.getByTestId("sponsors-save")).toContainText("Saved", { timeout: 30_000 });
        const rows = await saved();
        expect(rows.map((row) => [row.name, row.show_on_homepage, row.show_in_footer])).toEqual([
          ["Lakeside Dental", true, false],
          ["Harbor Auto", true, true],
          ["Pinecrest Realty", true, true],
          ["Millbrook Pizza", true, true],
          ["Riverside Gym", true, true],
          ["summit coffee", true, true],
        ]);
        await shot(page, "sponsors-footer", width);
      } finally {
        await sql("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [ALPHA, SEEDED_DOCUMENT]);
        await restore(before);
      }
    });

    test("the worst case fits, and a website that is not one is refused in plain words", async ({ page }) => {
      const before = await snapshot();
      try {
        await seed([
          { name: "Northwestern Mutual Life Insurance, Greater Chicago Agency", website: `https://northwesternmutual-greaterchicago-financial-services.example.com/sponsors/${"x".repeat(120)}` },
          { name: "Jo’s", logo: "/images/partners/re15-missing-logo.png" },
          { name: "Dr. Aleksandra Wiśniewska-Kowalczyk, Family Dentistry LLC" },
          { name: "東京ラーメン", website: "https://tokyo-ramen.example.jp" },
          { name: "x".repeat(60) },
        ]);
        await openSponsors(page);
        await expect(cards(page)).toHaveCount(5);
        // A logo file that is gone shows a quiet note, not a broken picture.
        await expect(cards(page).nth(1).getByText("Can’t show this logo")).toBeVisible();
        // The preview names it instead of leaving a gap.
        await expect(page.getByTestId("sponsors-preview-homepage").getByText("Jo’s", { exact: true })).toBeVisible();
        await expectNoSideScroll(page, width);
        // The name box holds 60 characters and says so near the end.
        await expect(cards(page).nth(4).getByText("60 of 60")).toBeVisible();
        await page.getByTestId("sponsor-website").nth(1).fill("jo s bakery");
        await page.getByTestId("sponsor-name").nth(2).fill("");
        await page.getByTestId("sponsors-save").click();
        await expect(page.getByTestId("sponsors-message")).toHaveText("Fix the highlighted answers, then save.");
        await expect(cards(page).nth(1).getByText("Use a web address like theirshop.com.")).toBeVisible();
        await expect(cards(page).nth(2).getByText("Give this sponsor a name.")).toBeVisible();
        await expectNoSideScroll(page, width);
        await shot(page, "sponsors-worst", width);
        expect((await saved()).map((row) => row.name)).toContain("Dr. Aleksandra Wiśniewska-Kowalczyk, Family Dentistry LLC");
      } finally {
        await restore(before);
      }
    });

    test("‹ Website asks first when something is not saved", async ({ page }) => {
      const before = await snapshot();
      try {
        await seed([{ name: "Harbor Auto" }]);
        await openSponsors(page);
        await page.getByTestId("sponsor-name").first().fill("Harbor Auto Group");
        await page.getByTestId("sponsors-bar").getByRole("link", { name: /Website/ }).click();
        const dialog = page.getByRole("dialog", { name: "Save your changes first?" });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Keep editing" }).click();
        await expect(page).toHaveURL(/\/admin\/sponsors$/);
        await page.getByTestId("sponsors-bar").getByRole("link", { name: /Website/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Leave without saving" }).click();
        await expect(page).toHaveURL(/\/admin\/website$/);
        expect((await saved()).map((row) => row.name)).toEqual(["Harbor Auto"]);
      } finally {
        await restore(before);
      }
    });

    test("a classic club keeps its own page on the same rows", async ({ page }) => {
      const before = await snapshot();
      await setPortal("classic");
      try {
        await seed([
          { name: "Both places", homepage: true, footer: true },
          { name: "Homepage only", homepage: true, footer: false },
        ]);
        await page.goto("/admin/sponsors");
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("heading", { name: "Sponsors" })).toBeVisible();
        await expect(page.getByTestId("sponsor-card")).toHaveCount(0);
        // Alpha's academy footer shows no sponsors, so only the carousel is edited here.
        await expect(page.getByPlaceholder("Sponsor 1 name")).toHaveValue("Both places");
        await expect(page.getByPlaceholder("Sponsor 2 name")).toHaveValue("Homepage only");
        await expect(page.getByPlaceholder("Sponsor 1 name")).toHaveAttribute("maxlength", "60");
        await page.getByRole("button", { name: "Remove sponsor logo 1" }).click();
        await page.getByRole("button", { name: /Save Carousel Logos/ }).click();
        // Shown in the footer too, so the row stays with Homepage off.
        await expect
          .poll(async () => (await saved()).map((row) => [row.name, row.show_on_homepage, row.show_in_footer]), { timeout: 30_000 })
          .toEqual([
            ["Both places", false, true],
            ["Homepage only", true, false],
          ]);
        await expect(page.getByRole("button", { name: /Save Carousel Logos/ })).toBeDisabled();
        await expect(page.getByPlaceholder("Sponsor 1 name")).toHaveValue("Homepage only");
        await expect(page.getByPlaceholder("Sponsor 2 name")).toHaveCount(0);
        await expectNoSideScroll(page, width);
        await shot(page, "sponsors-classic", width);
      } finally {
        await setPortal("reimagined");
        await restore(before);
      }
    });
  });
}
