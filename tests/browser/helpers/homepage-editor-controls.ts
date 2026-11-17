import { expect, type Page } from "@playwright/test";
import type { PieceId } from "../../../lib/homepage-editor/model";

export const homepageSaveButton = (page: Page) => page.locator("[data-admin-save-button]").first();
export const homepageCanvas = (page: Page) => page.frameLocator(".hc-canvas iframe");
export const homepageSectionDialog = (page: Page) => page.getByRole("dialog", { name: /^(Hero|Our story|Photo slideshow|Video feature)$/ });
export async function closeHomepageEditor(page: Page) {
  const dialog = homepageSectionDialog(page);
  if (await dialog.isVisible()) { await dialog.getByRole("button", { name: "Done", exact: true }).click(); await expect(dialog).not.toBeVisible(); }
}
export async function saveHomepage(page: Page, reopen?: PieceId) {
  await closeHomepageEditor(page);
  await expect(homepageSaveButton(page)).toHaveAttribute("data-state", "dirty");
  await homepageSaveButton(page).click();
  if (reopen) await homepageCanvas(page).locator(`[data-homepage-piece="${reopen}"]`).click();
}
export async function expectHomepageSaved(page: Page) {
  await expect(page.locator(".hp-notification-success")).toContainText("Homepage saved.");
}
export async function expectHomepageClean(page: Page) {
  await expect(homepageSaveButton(page)).toHaveAttribute("data-state", "clean");
  await expect(homepageSaveButton(page)).toHaveAttribute("aria-disabled", "true");
}
export async function navigateHomepageOwner(page: Page, owner: "About" | "Programs" | "Shop") {
  await closeHomepageEditor(page);
  await page.getByRole("button", { name: `Edit in ${owner}`, exact: true }).click();
}
export async function openHomepagePlayback(page: Page) {
  await closeHomepageEditor(page);
  await page.getByRole("button", { name: "Preview of your homepage", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Preview of your homepage", exact: true })).toBeVisible();
  return page.frameLocator(".hc-whole-preview iframe");
}
export async function closeHomepagePlayback(page: Page) {
  const preview = page.getByRole("dialog", { name: "Preview of your homepage", exact: true });
  await preview.getByRole("button", { name: "Done", exact: true }).click(); await expect(preview).not.toBeVisible();
}
