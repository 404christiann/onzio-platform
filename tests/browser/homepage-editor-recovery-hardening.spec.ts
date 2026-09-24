import { expect, test, type Page } from "@playwright/test";

async function openHeroEditor(page: Page) {
  await page.goto("/admin/homepage");
  const frame = page.frameLocator('iframe[title="Homepage preview"]');
  const heading = frame.locator('[data-homepage-piece="hero.heading"]');
  await expect(heading).toBeVisible();
  await heading.click();
  await heading.click();
  await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
  return { frame, heading };
}

test.describe("homepage editor recovery hardening", () => {
  test("two tabs opened before editing keep the first unsaved recovery copy", async ({ page, context }) => {
    const second = await context.newPage();
    try {
      await openHeroEditor(page);
      await openHeroEditor(second);
      await page.getByLabel("Line one", { exact: true }).fill("First tab unsaved draft");
      await page.waitForTimeout(900);
      await second.getByLabel("Line one", { exact: true }).fill("Second tab unsaved draft");
      await expect(second.getByRole("status").filter({ hasText: "Another tab has newer unsaved work" })).toBeVisible();

      await page.reload();
      await expect(page.frameLocator('iframe[title="Homepage preview"]').locator('[data-homepage-piece="hero.heading"]'))
        .toContainText("First tab unsaved draft");
      await expect(page.getByText("Restored an unsaved draft from before.", { exact: false })).toBeVisible();
    } finally {
      await second.close();
    }
  });

  test("warns when browser storage is unavailable while keeping editing usable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        get() {
          return { open: () => { throw new DOMException("IndexedDB unavailable", "InvalidStateError"); } };
        },
      });
    });

    const { heading } = await openHeroEditor(page);
    await expect(page.getByRole("alert").filter({ hasText: /recovery|storage|survive/i })).toBeVisible();
    await page.getByLabel("Line one", { exact: true }).fill("Storage unavailable still edits");
    await expect(heading).toContainText("Storage unavailable still edits");
    await expect(page.getByRole("status").filter({ hasText: "Not saved yet" })).toBeVisible();
  });

  test("reconciles a response lost after a real commit without a duplicate POST", async ({ page }) => {
    const baseline = await (await page.request.get("/api/admin/homepage")).json();
    const committedText = "Committed despite lost response";
    let postCount = 0;
    let receiptChecks = 0;
    page.on("request", request => { if (request.method() === "GET" && request.url().includes("/api/admin/homepage?operationId=")) receiptChecks += 1; });
    await page.route("**/api/admin/homepage", async route => {
      if (route.request().method() !== "POST") return route.continue();
      postCount += 1;
      if (postCount === 1) {
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
        await route.abort("connectionreset");
        return;
      }
      return route.continue();
    });

    try {
      const { frame } = await openHeroEditor(page);
      await page.getByLabel("Line one", { exact: true }).fill(committedText);
      await page.waitForTimeout(900);
      await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: /confirm|still here|response/i })).toBeVisible();

      await page.reload();
      await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toContainText(committedText);
      await expect(page.getByText("Nothing to save yet.", { exact: true })).toBeVisible();
      await expect(page.getByText(/Restored an unsaved draft|Checked on your last save attempt/i)).toHaveCount(0);
      expect(postCount).toBe(1);
      expect(receiptChecks).toBe(1);
    } finally {
      const current = await (await page.request.get("/api/admin/homepage")).json();
      if (current.content.hero.headline_line_one === committedText) {
        const restore = await page.request.post("/api/admin/homepage", {
          data: {
            operationId: crypto.randomUUID(),
            expectedRevision: current.revision,
            designRevision: current.designRevision,
            sections: { hero: baseline.content.hero },
          },
        });
        expect(restore.ok()).toBe(true);
      }
    }
  });

  test("preserves a newer second-tab draft as an explicit conflict", async ({ page, context }) => {
    const baseline = await (await page.request.get("/api/admin/homepage")).json();
    const firstTabText = "First tab version";
    const secondTabText = "Another version";
    const second = await context.newPage();

    try {
      await openHeroEditor(page);
      await page.getByLabel("Line one", { exact: true }).fill(firstTabText);
      await page.waitForTimeout(900);

      await openHeroEditor(second);
      await second.getByLabel("Line one", { exact: true }).fill(secondTabText);
      await second.waitForTimeout(900);

      await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
      await expect(page.getByText("Saved. Your homepage is updated.", { exact: true })).toBeVisible();

      const afterFirstSave = await (await page.request.get("/api/admin/homepage")).json();
      const newer = await page.request.post("/api/admin/homepage", { data: {
        operationId: crypto.randomUUID(), expectedRevision: afterFirstSave.revision,
        designRevision: afterFirstSave.designRevision, sections: { hero: { intro: "Newer paragraph from another administrator" } },
      } });
      expect(newer.ok()).toBe(true);
      await second.reload();
      await expect(second.getByRole("alert").filter({ hasText: "Another version" })).toContainText("Another version of this homepage was saved. Your recovered draft is kept separately.");
      await expect(second.getByRole("button", { name: "Review recovered draft", exact: true })).toBeVisible();
      await expect(second.getByRole("button", { name: "Discard recovered draft", exact: true })).toBeVisible();
      await second.getByRole("button", { name: "Review recovered draft", exact: true }).click();
      const review = second.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
      await expect(review).toBeVisible();
      await expect(review).toContainText(secondTabText);
      await expect(review).toContainText(firstTabText);
      await review.getByRole("button", { name: "Use recovered changes", exact: true }).click();
      const recoveredPreview = second.frameLocator('iframe[title="Homepage preview"]');
      await expect(recoveredPreview.locator('[data-homepage-piece="hero.heading"]')).toContainText(secondTabText);
      await expect(recoveredPreview.locator('[data-homepage-piece="hero.intro"]')).toHaveText("Newer paragraph from another administrator");
      expect((await (await page.request.get("/api/admin/homepage")).json()).content.hero.headline_line_one).toBe(firstTabText);
    } finally {
      await second.close();
      const current = await (await page.request.get("/api/admin/homepage")).json();
      if (current.content.hero.headline_line_one === firstTabText) {
        const restore = await page.request.post("/api/admin/homepage", {
          data: {
            operationId: crypto.randomUUID(),
            expectedRevision: current.revision,
            designRevision: current.designRevision,
            sections: { hero: baseline.content.hero },
          },
        });
        expect(restore.ok()).toBe(true);
      }
    }
  });
});
