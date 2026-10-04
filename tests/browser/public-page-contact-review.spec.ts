import { expect, test, type Page } from "@playwright/test";

async function snapshot(page: Page) {
  const response = await page.request.get("/api/admin/contact-editor");
  expect(response.ok()).toBe(true);
  return response.json();
}

async function restore(page: Page, baseline: Awaited<ReturnType<typeof snapshot>>) {
  const current = await snapshot(page);
  const response = await page.request.post("/api/admin/contact-editor", { data: {
    operationId: crypto.randomUUID(), expectedRevision: current.revision,
    profile: baseline.profile ?? { public_email: "", public_phone: "", service_area: "", hours: "" },
    page: baseline.page ?? { eyebrow: "", headline: "", intro: "", hero_media_asset_id: null },
  } });
  expect(response.ok()).toBe(true);
}

for (const failure of ["committed-500", "committed-network-loss", "unavailable-receipt", "not-committed"] as const) {
  test(`Contact reconciles ${failure} using the original save operation`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const baseline = await snapshot(page);
    const marker = `Contact recovery ${crypto.randomUUID().slice(0, 8)}`;
    const submitted: unknown[] = [];
    const receiptChecks: string[] = [];
    await page.route("**/api/admin/contact-editor?operationId=*", async (route) => {
      receiptChecks.push(new URL(route.request().url()).searchParams.get("operationId")!);
      if (failure === "unavailable-receipt" && receiptChecks.length === 1) return route.abort();
      return route.continue();
    });
    await page.route("**/api/admin/contact-editor", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted.push(route.request().postDataJSON());
      if (submitted.length > 1) return route.continue();
      if (failure.startsWith("committed")) {
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
      }
      if (failure === "committed-network-loss") return route.abort();
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: {
        code: "DATABASE_OPERATION_FAILED", message: "We could not confirm the Contact save.",
      } }) });
    });
    try {
      await page.goto("/admin/contact");
      await page.getByLabel("Headline", { exact: true }).fill(marker);
      await page.getByRole("button", { name: "Save page", exact: true }).filter({ visible: true }).click();
      if (!failure.startsWith("committed")) {
        await expect(page.getByLabel("Headline", { exact: true })).toBeDisabled();
        await expect(page.getByLabel("Headline", { exact: true })).toHaveValue(marker);
        await expect(page.locator(".cep-error")).toContainText("exact save");
        const unchanged = await snapshot(page);
        expect(unchanged.page).toEqual(baseline.page);
        expect(unchanged.profile).toEqual(baseline.profile);
        await page.getByRole("button", { name: "Confirm save", exact: true }).filter({ visible: true }).click();
        expect(submitted).toHaveLength(2);
        expect(submitted[1]).toEqual(submitted[0]);
      }
      await expect(page.locator(".cep-savebar")).toContainText("All Contact changes saved");
      await expect(page.getByLabel("Headline", { exact: true })).toBeEnabled();
      await expect(page.locator(".cep-error")).toHaveCount(0);
      expect(receiptChecks).toEqual([(submitted[0] as { operationId: string }).operationId]);
      expect((await snapshot(page)).page.headline).toBe(marker);
      await page.reload();
      await expect(page.getByLabel("Headline", { exact: true })).toHaveValue(marker);
      if (failure.startsWith("committed")) expect(submitted).toHaveLength(1);
    } finally {
      await page.unrouteAll({ behavior: "wait" });
      await restore(page, baseline);
    }
  });
}

test("Contact phone sheet contains focus, restores its trigger, and keeps Branding tappable", async ({ page }, info) => {
  await page.goto("/admin/contact");
  const guide = page.getByRole("navigation", { name: "Contact page sections" });
  const headingTrigger = guide.getByRole("button", { name: "Page heading", exact: true });
  const dialog = page.getByRole("dialog", { name: "Page heading", exact: true });
  await headingTrigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Eyebrow", { exact: true })).toBeFocused();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await headingTrigger.evaluate((element) => (element as HTMLButtonElement).focus());
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(headingTrigger).toBeFocused();

  await headingTrigger.click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(headingTrigger).toBeFocused();
  await headingTrigger.click();
  await page.mouse.click(10, 10);
  await expect(dialog).not.toBeVisible();
  await expect(headingTrigger).toBeFocused();

  const socialTrigger = guide.getByRole("button", { name: "Social links", exact: true });
  await socialTrigger.click();
  const socialDialog = page.getByRole("dialog", { name: "Social links", exact: true });
  const branding = socialDialog.getByRole("link", { name: "Edit social links in Branding" });
  await expect(branding).toBeFocused();
  await expect(branding).toBeInViewport();
  const assertLinkAboveFooter = async () => {
    const linkBox = await branding.boundingBox();
    const footerBox = await socialDialog.locator(".cep-mobile-save").boundingBox();
    expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(footerBox!.y);
    expect(await branding.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
  };
  await assertLinkAboveFooter();
  await page.screenshot({ path: info.outputPath("contact-phone-social.png") });
  await page.setViewportSize({ width: 390, height: 408 });
  await branding.scrollIntoViewIfNeeded();
  await assertLinkAboveFooter();
  await page.screenshot({ path: info.outputPath("contact-phone-short-social.png") });
  await branding.click();
  await expect(page).toHaveURL(/\/admin\/branding$/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/contact");
  await guide.getByRole("button", { name: "Contact details", exact: true }).click();
  await expect(page.getByLabel("Public email", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await guide.getByRole("button", { name: "Page heading", exact: true }).focus();
  await expect(guide.getByRole("button", { name: "Page heading", exact: true })).toBeFocused();
});
