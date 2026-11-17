import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-10/browser");
const fixture = "/tests/browser/fixtures/admin-cl-10/";
let server: ViteDevServer | undefined;
let origin: string;

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
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => { await server?.close(); });

async function open(page: Page, theme: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const response = await page.goto(`${origin}${fixture}?theme=${theme}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "About", level: 1 })).toBeVisible();
  return errors;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("keeps the page frame aligned and phone actions full width", async ({ page }) => {
        const errors = await open(page, theme);
        const geometry = await page.locator("[data-admin-page-header]").evaluate((header) => {
          const crumb = header.querySelector("[data-admin-page-breadcrumb]") as HTMLElement;
          const title = header.querySelector("h1") as HTMLElement;
          const subtitle = header.querySelector("p") as HTMLElement;
          const actions = header.querySelector("[data-admin-page-actions]") as HTMLElement;
          const group = actions.querySelector("[data-admin-page-action-group]") as HTMLElement;
          const statusGroup = actions.querySelector(".fixture-dirty-status") as HTMLElement;
          const button = group.querySelector("button") as HTMLElement;
          const label = group.querySelector("label") as HTMLElement;
          const select = group.querySelector("select") as HTMLElement;
          const statusDot = statusGroup.querySelector("span:first-child") as HTMLElement;
          const status = statusGroup.querySelector("span:last-child") as HTMLElement;
          const rect = (element: HTMLElement) => element.getBoundingClientRect();
          return {
            header: rect(header as HTMLElement).toJSON(),
            crumb: rect(crumb).toJSON(),
            title: rect(title).toJSON(),
            subtitle: rect(subtitle).toJSON(),
            actions: rect(actions).toJSON(),
            group: rect(group).toJSON(),
            button: rect(button).toJSON(),
            label: rect(label).toJSON(),
            select: rect(select).toJSON(),
            breadcrumbTag: crumb.tagName,
            statusGroup: rect(statusGroup).toJSON(),
            statusDot: rect(statusDot).toJSON(),
            status: rect(status).toJSON(),
            titleSize: getComputedStyle(title).fontSize,
            subtitleGap: parseFloat(getComputedStyle(subtitle).marginTop),
          };
        });
        expect(geometry.breadcrumbTag).toBe("DIV");
        await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
        expect(geometry.titleSize).toBe("28px");
        expect(geometry.subtitleGap).toBe(6);
        expect(Math.abs(geometry.crumb.left - geometry.title.left)).toBeLessThan(1);
        expect(Math.abs(geometry.title.left - geometry.subtitle.left)).toBeLessThan(1);
        expect(geometry.status.width).toBeLessThan(160);
        expect(geometry.status.left - geometry.statusDot.right).toBeLessThanOrEqual(8);
        expect(geometry.status.left - geometry.statusDot.right).toBeGreaterThanOrEqual(4);
        if (viewport.width === 1280) {
          expect(Math.abs((geometry.button.top + geometry.button.bottom) / 2 -
            (geometry.status.top + geometry.status.bottom) / 2)).toBeLessThan(1.5);
        }
        if (viewport.width === 390) {
          expect(Math.abs(geometry.actions.width - geometry.header.width)).toBeLessThan(1);
          expect(Math.abs(geometry.group.width - geometry.header.width)).toBeLessThan(1);
          expect(Math.abs(geometry.statusGroup.width - geometry.header.width)).toBeLessThan(1);
          for (const control of [geometry.label, geometry.select, geometry.button]) {
            expect(Math.abs(control.width - geometry.header.width)).toBeLessThan(1);
            expect(Math.abs(control.left - geometry.header.left)).toBeLessThan(1);
          }
        } else {
          expect(Math.abs(geometry.actions.right - geometry.header.right)).toBeLessThan(1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect(errors).toEqual([]);
      });

      test("opens regions by keyboard and pointer, and switches preview size", async ({ page }) => {
        const errors = await open(page, theme);
        const region = page.getByRole("button", { name: "Edit page heading" });
        await region.focus();
        await expect(region).toBeFocused();
        await expect(region.locator("span").last()).toHaveCSS("opacity", "1");
        await page.keyboard.press("Enter");
        await expect(page.locator("[data-edit-opens]")).toHaveText("Editor openings: 1");
        await page.keyboard.press("Space");
        await expect(page.locator("[data-edit-opens]")).toHaveText("Editor openings: 2");
        await region.locator("a").click({ force: true });
        await expect(page.locator("[data-edit-opens]")).toHaveText("Editor openings: 3");
        expect(page.url()).toContain(fixture);
        await page.getByLabel("Headline").fill("Live preview change");
        await expect(region.getByText("Live preview change")).toBeVisible();
        await page.getByRole("group", { name: "Preview size" }).getByRole("button", { name: "Phone" }).click();
        await expect(page.locator("[data-preview-size]")).toHaveAttribute("data-preview-size", "phone");
        await expect(page.getByRole("button", { name: "Phone" })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "false");
        expect(errors).toEqual([]);
      });
    });
  }
}

test.describe("touch preview", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("keeps edit tags visible without hover", async ({ page }) => {
    const errors = await open(page, "light");
    const tag = page.locator("[data-admin-editable-region] span").first();
    await expect(tag).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: "Edit page heading" }).tap();
    await expect(page.locator("[data-edit-opens]")).toHaveText("Editor openings: 1");
    expect(errors).toEqual([]);
  });
});

test("uses a 140ms compositor-only edit tag reveal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = await open(page, "light");
  const region = page.getByRole("button", { name: "Edit page heading" });
  const tag = region.locator("span").last();
  const properties = await tag.evaluate((element) => {
    const style = getComputedStyle(element);
    return { properties: style.transitionProperty, durations: style.transitionDuration, transform: style.transform };
  });
  expect(properties.properties).toBe("opacity, transform");
  expect(properties.durations).toBe("0.14s, 0.14s");
  await region.hover();
  await expect(tag).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
});
