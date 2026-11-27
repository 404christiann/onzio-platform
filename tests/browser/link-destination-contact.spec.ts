import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * Link destination normalizer, end to end on a local cinematic@2 tenant: the Contact editor's "Information destination" is typed in the
 * real admin, saved, and read back from the public Contact page. Also posts bad values straight to the route.
 * Config: playwright.link-destination.config.ts (LINK_DEST_STORAGE_STATE, optional LINK_DEST_BASE_URL on a *.localhost host).
 */
const ROUTE = "/api/admin/cinematic-contact";
const ERROR = "That doesn't look like a link or email.";

type Snapshot = { revision: string; designRevision: string; content: { informationHref: string } & Record<string, unknown> };
const snapshot = async (page: Page): Promise<Snapshot> => {
  const response = await page.request.get(ROUTE);
  expect(response.status()).toBe(200);
  return await response.json();
};
const post = async (page: Page, informationHref: string, current?: Snapshot) => {
  const base = current ?? await snapshot(page);
  const rows = base.content.rows as Record<string, Record<string, string>>;
  /** Every request starts the Information button text from "Information", so the byte-identical test always has a change to save. */
  const content = { ...base.content, rows: { ...rows, information: { ...rows.information, action: "Information" } }, informationHref };
  return page.request.post(ROUTE, { data: { operationId: randomUUID(), expectedRevision: base.revision, designRevision: base.designRevision, content } });
};
async function publicHref(page: Page) {
  const visitor = await page.context().newPage();
  try {
    await visitor.goto("/contact", { waitUntil: "domcontentloaded" });
    const row = visitor.locator(".contact-row").filter({ hasText: "General questions" });
    await expect(row).toHaveCount(1);
    /** An empty destination draws "Link pending" with no link at all. */
    const link = row.locator("a");
    return await link.count() ? await link.getAttribute("href") : null;
  } finally { await visitor.close(); }
}
const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
async function openInformation(page: Page) {
  await page.goto("/admin/contact", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit Information section", exact: true }).click();
  await expect(dialog(page).locator('[data-editor-dialog-panel="information"]')).toBeVisible();
}
const destination = (page: Page) => dialog(page).getByLabel("Information destination", { exact: false });
async function typeDestination(page: Page, value: string) {
  await openInformation(page);
  await destination(page).fill(value);
}
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}
async function saveTyped(page: Page, value: string) {
  const before = await snapshot(page);
  await typeDestination(page, value);
  await closeDialog(page);
  await saveButton(page).click();
  await expect.poll(async () => (await snapshot(page)).revision, { timeout: 30_000 }).not.toBe(before.revision);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  page.on("dialog", item => void item.accept());
  const reset = await post(page, "");
  expect(reset.status()).toBe(200);
  expect(await publicHref(page)).toBeNull();
});

for (const [typed, shown] of [
  ["info@club.com", "mailto:info@club.com"],
  ["https://docs.google.com/forms/d/e/1FAIpQLSc-example/viewform", "https://docs.google.com/forms/d/e/1FAIpQLSc-example/viewform"],
  ["/tickets", "/tickets"],
  ["docs.google.com/forms/d/e/abc/viewform", "https://docs.google.com/forms/d/e/abc/viewform"],
  ["http://club.com/join", "https://club.com/join"],
] as const) {
  test(`typing ${typed} saves and the public Contact page links ${shown}`, async ({ page }) => {
    await saveTyped(page, typed);
    await expect.poll(async () => (await snapshot(page)).content.informationHref).toBe(shown);
    expect(await publicHref(page)).toBe(shown);
    await openInformation(page);
    await expect(destination(page)).toHaveValue(shown);
  });
}

test("an existing mailto: value with a query stays byte-identical when another field is saved", async ({ page }) => {
  const keep = "mailto:office@club.com?subject=Hello";
  expect((await post(page, keep)).status()).toBe(200);
  expect(await publicHref(page)).toBe(keep);
  await page.goto("/admin/contact", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit Information section", exact: true }).click();
  await expect(destination(page)).toHaveValue(keep);
  const button = dialog(page).getByLabel("Button text", { exact: true });
  await button.fill("Email us");
  await closeDialog(page);
  await saveButton(page).click();
  await expect.poll(async () => (await snapshot(page)).content.rows).toMatchObject({ information: { action: "Email us" } });
  expect((await snapshot(page)).content.informationHref).toBe(keep);
  expect(await publicHref(page)).toBe(keep);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit Information section", exact: true }).click();
  await expect(destination(page)).toHaveValue(keep);
});

for (const bad of ["javascript:alert(1)", "not a link"]) {
  test(`typing ${bad} shows the error and blocks the save`, async ({ page }) => {
    const previous = "https://docs.google.com/forms/d/e/1FAIpQLSc-example/viewform";
    expect((await post(page, previous)).status()).toBe(200);
    const before = await snapshot(page);
    await typeDestination(page, bad);
    await closeDialog(page);
    await saveButton(page).click();
    /** A refused save reopens the card holding the bad field, with the message beside it. */
    await expect(dialog(page).getByText(ERROR, { exact: true })).toBeVisible();
    await expect(destination(page)).toHaveValue(bad);
    await expect(destination(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Review the highlighted fields before saving.").first()).toBeVisible();
    const after = await snapshot(page);
    expect(after.revision).toBe(before.revision);
    expect(after.content.informationHref).toBe(previous);
    expect(await publicHref(page)).toBe(previous);
  });
}

test("the route refuses dangerous destinations with 400 and saves nothing", async ({ page }) => {
  const before = await snapshot(page);
  for (const bad of ["javascript:alert(1)", "  JaVaScRiPt:alert(1)", "data:text/html,x"]) {
    const response = await post(page, bad, before);
    expect(response.status(), bad).toBe(400);
  }
  const after = await snapshot(page);
  expect(after.revision).toBe(before.revision);
  expect(after.content.informationHref).toBe(before.content.informationHref);
});
