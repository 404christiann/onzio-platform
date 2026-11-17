import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

let server: ViteDevServer | undefined;
let origin: string;
test.beforeAll(async () => {
  const { createServer } = await import("vite");
  server = await createServer({ root: process.cwd(), configFile: false, envDir: false, publicDir: "public",
    cacheDir: resolve(".codex-work/admin-cl-16/vite-cache"), resolve: { alias: { "@": process.cwd() } },
    oxc: { jsx: { runtime: "automatic" } }, define: { "process.env.NODE_ENV": JSON.stringify("development") },
    server: { host: "127.0.0.1", port: 0, ws: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not listen");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });
async function open(page: Page) {
  await page.goto(`${origin}/tests/browser/fixtures/admin-cl-16/`);
  await expect(page.getByRole("heading", { name: "Shop manager options" })).toBeVisible();
}
async function drop(page: Page, count = 1) {
  await page.locator("[data-admin-photo-manager]").evaluate((manager, repeats) => {
    const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
    const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (char) => char.charCodeAt(0));
    for (let n = 0; n < repeats; n++) {
      const transfer = new DataTransfer(); transfer.items.add(new File([bytes], `photo-${n}.png`, { type: "image/png" }));
      manager.querySelector("[class*='drop']")!.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    }
  }, count);
}
test("optional preparation signals balance invalid files, overlap and callback replacement", async ({ page }) => {
  await open(page);
  const input = page.locator("input[type=file]");
  await input.setInputFiles({ name: "wrong.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.locator("[data-events]")).toHaveText("[true,false]");
  await input.setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
  await expect(page.locator("[data-events]")).toHaveText("[true,false,true,false]");
  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
  await expect(page.locator("[data-events]")).toHaveText("[true,false,true,false,true,false]");
  await drop(page, 2);
  await expect(page.locator("[data-uploads]")).toHaveText("2");
  await page.getByRole("button", { name: /^Replace callbacks/ }).click();
  await page.evaluate(() => window.releaseShopUploads(1));
  await expect(page.locator("[data-events]")).toHaveText("[true,false,true,false,true,false,true]");
  await page.evaluate(() => window.releaseShopUploads());
  await expect(page.locator("[data-events]")).toHaveText("[true,false,true,false,true,false,true,false]");
  await expect(page.locator("[data-photo-id]")).toHaveCount(5);
});
test("optional preparation cancels on unmount and chooser cancellation", async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add photos", exact: true }).click();
  await chooser;
  await expect(page.locator("[data-events]")).toHaveText("[true]");
  await page.locator("input[type=file]").dispatchEvent("cancel");
  await expect(page.locator("[data-events]")).toHaveText("[true,false]");
  await drop(page);
  await expect(page.locator("[data-uploads]")).toHaveText("1");
  await page.getByRole("button", { name: "Unmount manager", exact: true }).click();
  await expect(page.locator("[data-events]")).toHaveText("[true,false,true,false]");
  await page.evaluate(() => window.releaseShopUploads());
  await expect(page.locator("[data-photo-id]")).toHaveCount(0);
});
test("Undo signals aggregate removals and retain hidden metadata during reorder", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Remove First", exact: true }).click();
  await page.getByRole("button", { name: "Remove Second", exact: true }).click();
  await expect(page.locator("[data-undo]")).toHaveText("[true]");
  await page.getByRole("button", { name: "Undo: Photo removed", exact: true }).first().click();
  await expect(page.locator("[data-undo]")).toHaveText("[true]");
  await page.getByRole("button", { name: "Undo: Photo removed", exact: true }).last().click();
  await expect(page.locator("[data-undo]")).toHaveText("[true,false]");
  await page.getByRole("button", { name: "Move Third earlier", exact: true }).click();
  const photos = JSON.parse(await page.locator("[data-photos]").innerText());
  expect(photos.map((photo: { id: string }) => photo.id)).toEqual(["First", "Third", "Second"]);
  expect(photos.map((photo: { description: string }) => photo.description)).toEqual(["First metadata", "Third metadata", "Second metadata"]);
  await expect(page.locator("input[type=text]")).toHaveCount(0);
});
