import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// ADMIN-RE-09: Edit my website under the reimagined edit bar, on local Alpha
// (switched to 'reimagined' by admin-reimagined.global-setup.ts), at phone and
// laptop width. Alpha's hero small heading stands in for the demos' date line.
// Every saved change is put back through the editor's own API in a finally
// block. Screenshots land in test-results/admin-reimagined/.

const SHOTS = "test-results/admin-reimagined";

test.describe.configure({ mode: "serial" });

type HomepageSnapshot = {
  revision: string;
  designRevision: string;
  content: { hero: Record<string, string> };
};

async function homepage(request: APIRequestContext): Promise<HomepageSnapshot> {
  const response = await request.get("/api/admin/homepage");
  expect(response.ok()).toBe(true);
  return response.json();
}

/** Puts the hero back when the run left its marker behind. */
async function restoreHero(request: APIRequestContext, baseline: HomepageSnapshot, marker: string) {
  const current = await homepage(request);
  if (current.content.hero.eyebrow !== marker) return;
  const restored = await request.post("/api/admin/homepage", {
    data: {
      operationId: crypto.randomUUID(),
      expectedRevision: current.revision,
      designRevision: current.designRevision,
      sections: { hero: baseline.content.hero },
    },
  });
  expect(restored.ok()).toBe(true);
}

function preview(page: Page) {
  return page.frameLocator('iframe[title="Homepage preview"]');
}

function dateLine(page: Page) {
  return preview(page).locator('[data-homepage-piece="hero.eyebrow"]');
}

function tag(page: Page, which: "hint" | "changed") {
  return dateLine(page).locator(`> .hp-piece-tag [data-tag="${which}"]`);
}

/** Selects the date line and opens its words, the same way at both widths. */
async function changeDateLine(page: Page, words: string) {
  await dateLine(page).click();
  await expect(dateLine(page)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Change the words", exact: true }).filter({ visible: true }).click();
  await page.getByRole("textbox", { name: "Small heading", exact: true }).fill(words);
  await expect(dateLine(page)).toContainText(words);
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    const phone = width < 768;

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: phone ? 844 : 900 });
    });

    test("change the date line, save, and see it on the public page", async ({ page }) => {
      const request = page.request;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Unique, so a crashed run's leftover never makes the field already hold it.
      const marker = `Saturday, Nov 22 · Lincoln Park ${crypto.randomUUID().slice(0, 6)}`;
      const baseline = await homepage(request);
      try {
        await page.goto("/admin/homepage");
        const bar = page.getByTestId("admin-edit-bar");
        await expect(bar).toBeVisible();
        // The edit bar replaces the shell's top bar on this page.
        await expect(page.getByTestId("admin-top-bar-title")).toHaveCount(0);
        await expect(bar.getByRole("heading", { level: 1, name: "You’re editing your site" })).toHaveCount(1);
        await expect(bar.getByRole("link", { name: "Home", exact: true })).toBeVisible();
        const save = bar.getByRole("button", { name: phone ? "Save" : "Save homepage", exact: true });
        await expect(save).toBeDisabled();
        if (!phone) await expect(bar.getByRole("status")).toHaveText("Nothing to save yet");
        // The classic heading and status line are gone in the reimagined admin.
        await expect(page.getByRole("heading", { level: 1, name: "Homepage" })).toHaveCount(0);

        await expect(dateLine(page)).toBeVisible();
        if (!phone) {
          await dateLine(page).hover();
          await expect(tag(page, "hint")).toBeVisible();
          await expect(tag(page, "hint")).toHaveText("Click to change");
          await page.screenshot({ path: `${SHOTS}/website-click-to-change-${width}.png` });
        }

        await changeDateLine(page, marker);
        // The status keeps a short and a long wording; only one shows at each width.
        await expect(bar.getByRole("status").getByText(phone ? "Not saved yet" : "Not saved yet: Hero", { exact: true })).toBeVisible();
        await expect(save).toBeEnabled();
        if (phone) {
          // On a phone the words open in an edit sheet over the page.
          const sheet = page.getByRole("dialog", { name: "Small heading", exact: true });
          await expect(sheet).toBeVisible();
          const box = await sheet.boundingBox();
          expect(box && box.y + box.height).toBeGreaterThan(700);
          await expectNoSideScroll(page, width);
          await page.screenshot({ path: `${SHOTS}/website-edit-sheet-${width}.png` });
          await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
          await expect(sheet).toBeHidden();
        }
        await expect(tag(page, "changed")).toBeVisible();
        await expect(tag(page, "changed")).toHaveText("Changed");

        await save.click();
        const saved = bar.getByRole("button", { name: "Saved · on your website", exact: true });
        await expect(saved).toBeVisible();
        await expect(bar.getByRole("status")).toHaveCount(0);
        await expect(tag(page, "changed")).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/website-saved-${width}.png` });
        expect((await homepage(request)).content.hero.eyebrow).toBe(marker);

        const visitor = await page.context().newPage();
        await visitor.setViewportSize({ width, height: 900 });
        await visitor.goto("/");
        await expect(visitor.getByText(marker, { exact: true })).toBeVisible();
        await visitor.screenshot({ path: `${SHOTS}/website-public-${width}.png` });
        await visitor.close();
        expect(errors).toEqual([]);
      } finally {
        await restoreHero(request, baseline, marker);
      }
    });

    test("‹ Home asks to save first when there are unsaved changes", async ({ page }) => {
      const request = page.request;
      const marker = `Unsaved date line ${crypto.randomUUID().slice(0, 6)}`;
      const baseline = await homepage(request);
      try {
        // With nothing changed, Home goes straight back.
        await page.goto("/admin/homepage");
        const bar = page.getByTestId("admin-edit-bar");
        await bar.getByRole("link", { name: "Home", exact: true }).click();
        await expect(page).toHaveURL(/\/admin$/);

        await page.goto("/admin/homepage");
        await changeDateLine(page, marker);
        if (phone) await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
        await bar.getByRole("link", { name: "Home", exact: true }).click();
        const ask = page.getByRole("dialog", { name: "Save your changes first?" });
        await expect(ask).toBeVisible();
        await expect(ask.getByRole("button", { name: "Save and continue" })).toBeVisible();
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/website-save-first-${width}.png` });

        await ask.getByRole("button", { name: "Keep editing" }).click();
        await expect(ask).toBeHidden();
        await expect(page).toHaveURL(/\/admin\/homepage$/);
        await expect(dateLine(page)).toContainText(marker);

        await bar.getByRole("link", { name: "Home", exact: true }).click();
        await ask.getByRole("button", { name: "Leave without saving" }).click();
        await expect(page).toHaveURL(/\/admin$/);
        expect((await homepage(request)).content.hero.eyebrow).toBe(baseline.content.hero.eyebrow);
      } finally {
        await restoreHero(request, baseline, marker);
      }
    });
  });
}
