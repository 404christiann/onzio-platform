import { expect, test } from "@playwright/test";

test("individual hero selection edits the real preview, then saves once", async ({ page }, info) => {
  // A fixed marker cannot be re-typed once a crashed run leaves it behind:
  // the field would already hold it, nothing would be dirty, and Save would
  // stay disabled forever. Keep every assertion, make the value unique.
  const marker = `Local editor verification ${crypto.randomUUID().slice(0, 8)}`;
  const baselineResponse = await page.request.get("/api/admin/homepage");
  expect(baselineResponse.ok()).toBe(true);
  const baseline = await baselineResponse.json();
  const requests: unknown[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/admin/homepage") && request.method() === "POST") requests.push(request.postDataJSON());
  });
  try {
    await page.goto("/admin/homepage");
    await expect(page.getByText("Preview · Changes appear on your website after you save.")).toBeVisible();
    const frame = page.frameLocator('iframe[title="Homepage preview"]');
    const heading = frame.locator('[data-homepage-piece="hero.heading"]');
    await expect(heading).toBeVisible();
    await heading.click();
    await expect(heading).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: info.outputPath("desktop-selected.png"), fullPage: true });
    await expect(page.getByRole("dialog", { name: "Main heading", exact: true })).toHaveCount(0);
    await heading.click();
    await page.getByLabel("Line one", { exact: true }).fill(marker);
    await expect(heading).toContainText(marker);
    expect(requests).toHaveLength(0);
    const unchanged = await (await page.request.get("/api/admin/homepage")).json();
    expect(unchanged.content.hero).toEqual(baseline.content.hero);
    await expect(page.getByRole("status").filter({ hasText: "Not saved yet: Top of your homepage" })).toBeVisible();
    const panel = page.getByRole("dialog", { name: "Main heading", exact: true });
    await expect(panel.getByRole("button", { name: "Save homepage", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Save homepage", exact: true }).click();
    await expect(page.getByText("Saved. Your homepage is updated.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
    await expect(heading).toHaveAttribute("aria-pressed", "false");
    expect(requests).toHaveLength(1);
    const saved = await (await page.request.get("/api/admin/homepage")).json();
    expect(saved.content.hero.headline_line_one).toBe(marker);
    await page.screenshot({ path: info.outputPath("desktop-saved.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 678 });
    await expect(page.getByRole("button", { name: "Top", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole("button", { name: "Top", exact: true }).click();
    await page.getByRole("button", { name: "Change the words", exact: true }).filter({ visible: true }).click();
    await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("mobile-sheet.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 408 });
    await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: info.outputPath("mobile-short-viewport.png"), fullPage: true });
  } finally {
    const currentResponse = await page.request.get("/api/admin/homepage");
    if (currentResponse.ok()) {
      const current = await currentResponse.json();
      if (current.content.hero.headline_line_one === marker) {
        const restored = await page.request.post("/api/admin/homepage", { data: { operationId: crypto.randomUUID(), expectedRevision: current.revision, designRevision: current.designRevision, sections: { hero: baseline.content.hero } } });
        expect(restored.ok()).toBe(true);
      }
    }
  }
});

test("a failed save preserves the draft and retries the same operation", async ({ page }) => {
  // A fixed marker cannot be re-typed once a crashed run leaves it behind:
  // the field would already hold it, nothing would be dirty, and Save would
  // stay disabled forever. Keep every assertion, make the value unique.
  const marker = `Local retry verification ${crypto.randomUUID().slice(0, 8)}`;
  const baseline = await (await page.request.get("/api/admin/homepage")).json();
  const submitted: { operationId: string; sections: unknown }[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/homepage", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted.push(route.request().postDataJSON());
    if (submitted.length === 1) {
      await held;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SAVE_UNCERTAIN", message: "We could not confirm your save. Your changes are still here." } }) });
    }
    return route.continue();
  });
  try {
    await page.goto("/admin/homepage");
    const frame = page.frameLocator('iframe[title="Homepage preview"]');
    await expect(frame.locator('[data-homepage-piece="photos"]')).toHaveCount(0);
    await expect(frame.locator('[data-homepage-piece="video"]')).toHaveCount(0);
    const heading = frame.locator('[data-homepage-piece="hero.heading"]');
    await heading.click();
    await page.getByRole("button", { name: "Change the words" }).filter({ visible: true }).click();
    await page.getByLabel("Line one", { exact: true }).fill(marker);
    await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
    await expect(page.getByLabel("Line one", { exact: true })).toBeDisabled();
    await expect(page.locator(".hp-notification-saving")).toContainText("Saving your homepage…");
    release();
    await expect(page.locator(".hp-error")).toContainText("Your changes are still here");
    await expect(page.getByLabel("Line one", { exact: true })).toHaveValue(marker);
    await expect(heading).toContainText(marker);
    expect((await (await page.request.get("/api/admin/homepage")).json()).content.hero).toEqual(baseline.content.hero);
    await page.getByRole("button", { name: "Try saving again" }).click();
    await expect(page.getByText("Saved. Your homepage is updated.", { exact: true })).toBeVisible();
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toEqual(submitted[0]);
  } finally {
    release();
    const current = await (await page.request.get("/api/admin/homepage")).json();
    if (current.content.hero.headline_line_one === marker) {
      expect((await page.request.post("/api/admin/homepage", { data: { operationId: crypto.randomUUID(), expectedRevision: current.revision, designRevision: current.designRevision, sections: { hero: baseline.content.hero } } })).ok()).toBe(true);
    }
  }
});

test("story defaults are editable without marking an untouched section dirty", async ({ page }) => {
  await page.goto("/admin/homepage");
  const frame = page.frameLocator('iframe[title="Homepage preview"]');
  const story = frame.locator('[data-homepage-piece="story.text"]');
  await story.click();
  await page.getByRole("button", { name: "Change the words" }).filter({ visible: true }).click();
  const heading = page.getByLabel("Main heading", { exact: true });
  const renderedHeading = (await story.locator("h2").textContent())!.trim();
  await expect(heading).toHaveValue(renderedHeading);
  await expect(page.getByText("Nothing to save yet.", { exact: true })).toBeVisible();
  await heading.fill("A draft story heading");
  await expect(story.locator("h2")).toHaveText("A draft story heading");
  await heading.fill("");
  await expect(heading).toHaveValue("");
  await expect(story.locator("h2")).toHaveText("Developing the next generation");
});

test("keyboard selection opens words and restores focus after closing options", async ({ page }) => {
  await page.goto("/admin/homepage");
  const frame = page.frameLocator('iframe[title="Homepage preview"]');
  const heading = frame.locator('[data-homepage-piece="hero.heading"]');
  await heading.focus();
  await heading.press("Enter");
  await expect(heading).toHaveAttribute("aria-pressed", "true");
  await heading.press("Space");
  const input = page.getByLabel("Line one", { exact: true });
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(page.getByRole("dialog", { name: "Main heading", exact: true })).toHaveCount(0);
  await expect(heading).toBeFocused();
  await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
  await expect(heading).toHaveAttribute("aria-pressed", "false");
  await expect(heading).toBeFocused();
});
