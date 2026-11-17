import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

import {
  checkAdminAlignment,
  checkAdminDialog,
  checkAdminSaveButton,
  checkCompositorAnimations,
  measureSkeletonShift,
} from "./helpers/admin-design-checks";
import { adminClassicEdgeCases } from "./fixtures/admin-classic-edge-cases";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-11/browser");
const baseURL = process.env.ADMIN_CLASSIC_BASE_URL ?? "http://alpha.localhost:3110";
const theme = process.env.ADMIN_CLASSIC_COLOR_SCHEME === "dark" ? "dark" : "light";
let server: ViteDevServer | undefined;
let fixtureOrigin: string;

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo,
    configFile: false,
    envDir: false,
    publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: { "@": repo } },
    oxc: { jsx: { runtime: "automatic" } },
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    server: { host: "127.0.0.1", port: 0, ws: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => { await server?.close(); });

async function localOnly(page: Page) {
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" || host.endsWith(".localhost")
      ? route.continue() : route.abort();
  });
}

async function openFixture(page: Page, packageId: string) {
  await localOnly(page);
  const response = await page.goto(`${fixtureOrigin}/tests/browser/fixtures/${packageId}/?theme=${theme}`);
  expect(response?.status()).toBe(200);
}

test("signed-in Sponsors alignment and unsaved guard dialog", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await localOnly(page);
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, url: baseURL }]);
  const response = await page.goto("/admin/sponsors", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Sponsors", level: 1 })).toBeVisible();
  const sponsor = page.getByPlaceholder("Sponsor 1 name");
  await expect(sponsor).toBeVisible({ timeout: 30000 });
  const alignment = await checkAdminAlignment(page, {
    contentSelector: "[data-admin-page-header] + div",
  });
  expect(alignment).toEqual([]);
  expect(await page.locator("[data-admin-save-button]").count()).toBe(0);

  await sponsor.fill(adminClassicEdgeCases.longClubName.slice(0, 64));
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "Open admin navigation" }).click();
  }
  await page.getByRole("navigation", { name: "Primary admin navigation" })
    .getByRole("button", { name: "Competition" }).click();
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save your changes first?" });
  await expect(dialog).toBeVisible();
  const modal = await checkAdminDialog(page);
  if (testInfo.project.name === "desktop") {
    testInfo.annotations.push({
      type: "known-baseline",
      description: "CL05 unsaved guard desktop footer has a 48px primary and 44px secondary buttons.",
    });
  }
  expect(modal).toEqual(testInfo.project.name === "desktop"
    ? ["Dialog footer button heights differ"] : []);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).not.toBeVisible();
  await page.screenshot({ path: resolve(evidence, `sponsors-${testInfo.project.name}-${theme}.png`), fullPage: true });
  expect(errors).toEqual([]);
});

test("shared Save and dialog fixtures satisfy their geometry checks", async ({ page }) => {
  await openFixture(page, "admin-cl-03");
  await expect(page.getByRole("heading", { name: "Classic admin save" })).toBeVisible();
  await page.getByRole("textbox", { name: "Club short name" }).fill(adminClassicEdgeCases.longClubName);
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
  await expect.poll(() => checkAdminSaveButton(page)).toEqual([]);

  await openFixture(page, "admin-cl-04");
  await expect(page.getByRole("heading", { name: "Classic admin dialogs" })).toBeVisible();
  await page.getByRole("button", { name: "Open md" }).click();
  await expect(page.locator('[data-slot="admin-dialog"][data-open]')).toBeVisible();
  expect(await checkAdminDialog(page)).toEqual([]);
});

test("skeleton shift and compositor checks exercise real primitives", async ({ page }) => {
  await openFixture(page, "admin-cl-07");
  await page.route("**/cl07-data?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        title: index === 0 ? "Season standings" : `Team update ${index + 1}`,
        detail: `Updated by the club · ${index + 1}`,
      }))),
    });
  });
  const shift = await measureSkeletonShift(page, {
    regionSelector: "[data-admin-loading-region]",
    skeletonSelector: "[data-skeleton-card]",
    contentSelector: "[data-real-card]",
    anchorSelector: "[data-footer]",
    trigger: () => page.getByRole("button", { name: "Load in 400 ms" }).click(),
  });
  expect(Math.abs(shift.anchorShift)).toBeLessThanOrEqual(1);
  expect(Math.abs(shift.heightShift)).toBeLessThanOrEqual(1);

  await openFixture(page, "admin-cl-08");
  await expect(page.getByRole("heading", { name: "Classic admin motion primitives" })).toBeVisible();
  await page.getByRole("button", { name: "Replay bars" }).evaluate((button) => (button as HTMLButtonElement).click());
  const reduced = process.env.ADMIN_CLASSIC_REDUCED_MOTION === "1";
  if (reduced) {
    expect(await checkCompositorAnimations(page, "[data-admin-bar-fill]", false)).toEqual([]);
  } else {
    await expect.poll(() => checkCompositorAnimations(page, "[data-admin-bar-fill]"), {
      intervals: [50, 50, 100, 100],
      timeout: 1000,
    }).toEqual([]);
  }
});


test("helper negative probes catch misalignment and misplaced Save status", async ({ page }) => {
  await openFixture(page, "admin-cl-10");
  await expect(page.getByRole("heading", { name: "About", level: 1 })).toBeVisible();
  await page.evaluate(() => {
    const row = document.createElement("div");
    row.id = "negative-control-row";
    row.style.cssText = "display:flex;align-items:flex-start;gap:8px";
    const button = document.createElement("button");
    button.textContent = "Tall action";
    button.style.height = "44px";
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Short input");
    input.style.height = "32px";
    row.append(button, input);
    document.querySelector("[data-admin-page-header]")?.after(row);
  });
  expect(await checkAdminAlignment(page, { controlRowsSelector: "#negative-control-row" }))
    .toContain("Controls in a row do not share a center line");

  await openFixture(page, "admin-cl-03");
  await page.getByRole("textbox", { name: "Club short name" }).fill("Dirty state");
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
  await page.locator("[data-admin-save-status]").evaluate((status) => {
    (status as HTMLElement).style.transform = "translateY(60px)";
  });
  expect(await checkAdminSaveButton(page)).toContain("Save status is not on button center line");
});

test("dialog negative probes catch label placement, button height, and primary order", async ({ page }, testInfo) => {
  await openFixture(page, "admin-cl-04");
  await page.getByRole("button", { name: "Open md" }).click();
  const popup = page.locator('[data-slot="admin-dialog"][data-open]');
  await expect(popup).toBeVisible();
  expect(await checkAdminDialog(page)).toEqual([]);

  await popup.locator('[data-slot="admin-dialog-body"] label').first().evaluate((label) => {
    const element = label as HTMLElement;
    element.style.display = "flex";
    element.style.flexDirection = "row";
    element.style.alignItems = "center";
  });
  expect(await checkAdminDialog(page)).toContain("Dialog label is below its field");

  await page.reload();
  await page.getByRole("button", { name: "Open md" }).click();
  await expect(popup).toBeVisible();
  await popup.locator('[data-slot="admin-dialog-body"]').evaluate((body) => {
    const input = document.createElement("input");
    input.id = "external-negative-field";
    input.style.cssText = "width:100%;height:40px";
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = "External label below field";
    body.append(input, label);
  });
  expect(await checkAdminDialog(page)).toContain("Dialog label is below its field");

  await page.reload();
  await page.getByRole("button", { name: "Open md" }).click();
  await expect(popup).toBeVisible();
  const primary = popup.locator("[data-admin-save-button]");
  await primary.evaluate((button, phone) => {
    (button as HTMLElement).style.order = phone ? "3" : "-1";
  }, testInfo.project.name === "phone");
  expect(await checkAdminDialog(page)).toContain(testInfo.project.name === "phone"
    ? "Dialog primary action is not first on phone"
    : "Dialog primary action is not last on desktop");

  if (testInfo.project.name === "phone") {
    await page.reload();
    await page.getByRole("button", { name: "Open md" }).click();
    await expect(popup).toBeVisible();
    await popup.locator('[data-slot="admin-dialog-footer"] button').first().evaluate((button) => {
      const element = button as HTMLElement;
      element.style.minHeight = "0";
      element.style.height = "40px";
    });
    expect(await checkAdminDialog(page)).toContain("Phone dialog button is under 44px high");
  }

  await page.reload();
  await page.getByRole("button", { name: "Open confirmation" }).click();
  await expect(popup).toBeVisible();
  expect(await checkAdminDialog(page)).toEqual([]);
  await popup.locator("[data-primary]").evaluate((button, phone) => {
    if (phone) button.parentElement?.append(button);
    else button.parentElement?.prepend(button);
  }, testInfo.project.name === "phone");
  expect(await checkAdminDialog(page)).toContain(testInfo.project.name === "phone"
    ? "Dialog primary action is not first on phone"
    : "Dialog primary action is not last on desktop");
});

test("worst-case fixture renders empty and 51-row states without overflow", async ({ page }, testInfo) => {
  await openFixture(page, "admin-classic-edge");
  await expect(page.locator("[data-empty-state]")).toHaveText("No players yet");
  await expect(page.locator("[data-edge-row]")).toHaveCount(0);
  expect(await checkAdminAlignment(page)).toEqual([]);

  await page.getByRole("button", { name: "Show 51 players" }).click();
  await expect(page.locator("[data-empty-state]")).toHaveCount(0);
  await expect(page.locator("[data-edge-row]")).toHaveCount(51);
  await expect(page.locator("[data-edge-row]").first()).toContainText(adminClassicEdgeCases.longPlayerName);
  await expect(page.locator("[data-edge-row]").first()).toContainText(adminClassicEdgeCases.unbreakableEmail);
  expect(await checkAdminAlignment(page, { repeatedRowsSelector: "[data-edge-row]" })).toEqual([]);

  if (testInfo.project.name === "phone") {
    await page.locator("[data-edge-row] span").first().evaluate((email) => {
      (email as HTMLElement).style.cssText = "overflow:visible;white-space:nowrap";
    });
    expect(await checkAdminAlignment(page)).toContainEqual(expect.stringMatching(/^Page scrolls sideways by /));
  }

  await page.getByRole("button", { name: "Clear players" }).click();
  await expect(page.locator("[data-empty-state]")).toHaveText("No players yet");
  await expect(page.locator("[data-edge-row]")).toHaveCount(0);
});
