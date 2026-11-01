import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = process.env.SITE07_EVIDENCE_DIR;
const baseUrl = process.env.SITE07_BASE_URL;
const headUrl = process.env.SITE07_HEAD_URL;
const storageState = process.env.HOMEPAGE_STORAGE_STATE;
if (!evidenceDir || !baseUrl || !headUrl || !storageState) {
  throw new Error("Set SITE07_EVIDENCE_DIR, SITE07_BASE_URL, SITE07_HEAD_URL and HOMEPAGE_STORAGE_STATE.");
}
for (const value of [baseUrl, headUrl]) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !url.hostname.endsWith(".localhost") || url.pathname !== "/") {
    throw new Error("SITE-07 capture accepts only HTTP tenant loopback origins.");
  }
}

const builds = [
  { name: "base", sha: "89899eba4109e864288cc2e26c62c0988fa6c656", origin: baseUrl },
  { name: "head", sha: "36674dc511da782bf910e8cd1a8461fcb74377c7", origin: headUrl },
];
const publicRoutes = [
  "/", "/club/about", "/club/logo", "/contact", "/programs",
  "/programs/alpha-academy-pathway", "/roster", "/schedule", "/shop",
  "/sponsors", "/staff", "/stats", "/tryouts",
];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
// This matches the populated synthetic kit fixture in homepage-editor-home-kit.spec.ts.
const shopFixture = {
  source: "tests/browser/homepage-editor-home-kit.spec.ts: Home kit pilot",
  section: {
    id: "home-kit-pilot", club_id: "11111111-1111-4111-8111-111111111111", surface: "shop", kit_variant: "home",
    eyebrow: "Club store", title: "Home kit pilot", description: "The current home kit.",
    bullet_points: ["Club crest", "Match fit"], store_note: "Available from the club store.",
    cta_label: "View home kit", cta_link: "/shop", updated_at: "2026-10-20T00:00:00Z",
  },
  photos: [
    { id: "front", surface: "shop", kit_variant: "home", url: "/images/shop/rosecityshirt1.webp", sort_order: 0, created_at: "2026-10-20T00:00:00Z" },
    { id: "back", surface: "shop", kit_variant: "home", url: "/images/shop/rosecityshirt2.jpeg", sort_order: 1, created_at: "2026-10-20T00:00:00Z" },
  ],
};

test("capture guarded SITE-07 Academy shell evidence on base and head", async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(evidenceDir, { recursive: true });
  const records: unknown[] = [];
  const errors: string[] = [];
  const blocked: string[] = [];
  const localAuthRefreshes: string[] = [];
  let readOnlyAdminQueries = 0;

  for (const build of builds) {
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, storageState, serviceWorkers: "block" });
      await context.routeWebSocket("**/*", socket => socket.close());
      await context.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (!url.hostname.endsWith(".localhost") && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
          blocked.push(`${build.name}/${viewport.name}: external ${url.origin}`);
          return route.abort("blockedbyclient");
        }
        if (request.method() === "POST" && url.hostname === "127.0.0.1" &&
            url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
          localAuthRefreshes.push(`${build.name}/${viewport.name}: local Supabase session refresh`);
          return route.continue();
        }
        if (request.method() === "POST" && url.hostname.endsWith(".localhost") && url.pathname === "/api/admin/data") {
          try {
            if (request.postDataJSON()?.operation === "select") {
              readOnlyAdminQueries++;
              return route.continue();
            }
          } catch { /* malformed and mutating requests remain blocked below */ }
        }
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          blocked.push(`${build.name}/${viewport.name}: ${request.method()} ${url.pathname}`);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });

      for (const routePath of publicRoutes) {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        const resourceErrors: { status: number; path: string }[] = [];
        const shopFixtureReads: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("response", response => {
          if (response.status() >= 400) resourceErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
        });
        if (routePath === "/shop") {
          await page.route("**/rest/v1/shop_kit_*", async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (request.method() !== "GET" || url.hostname !== "127.0.0.1") {
              blocked.push(`${build.name}/${viewport.name}: shop fixture refused ${request.method()} ${url.origin}${url.pathname}`);
              return route.abort("blockedbyclient");
            }
            const table = url.pathname.split("/").at(-1);
            const variant = url.searchParams.get("kit_variant");
            if (!(["shop_kit_section", "shop_kit_photos"].includes(table ?? "") &&
              url.searchParams.get("club_id") === "eq.11111111-1111-4111-8111-111111111111" &&
              url.searchParams.get("surface") === "eq.shop" && ["eq.home", "eq.third", "eq.away"].includes(variant ?? ""))) {
              blocked.push(`${build.name}/${viewport.name}: unexpected shop fixture query ${url.pathname}`);
              return route.abort("blockedbyclient");
            }
            shopFixtureReads.push(`${table}:${variant}`);
            const rows = variant === "eq.home"
              ? table === "shop_kit_section" ? [shopFixture.section] : shopFixture.photos
              : [];
            return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(rows) });
          });
        }
        const response = await page.goto(new URL(routePath, build.origin).toString(), { waitUntil: "load" });
        await expect(page.locator("[data-academy-page-loading], [data-academy-hero-loading]")).toHaveCount(0, { timeout: 15_000 });
        await expect(page.locator("main > *:not(style)").first()).toBeVisible({ timeout: 15_000 });
        if (routePath === "/shop") {
          expect(shopFixtureReads.toSorted()).toEqual([
            "shop_kit_photos:eq.away", "shop_kit_photos:eq.home", "shop_kit_photos:eq.third",
            "shop_kit_section:eq.away", "shop_kit_section:eq.home", "shop_kit_section:eq.third",
          ]);
        }
        await expect(page.locator("header").first()).toBeVisible();
        await expect(page.locator("footer").first()).toBeVisible();
        await page.screenshot({ path: join(evidenceDir, `${build.name}-${viewport.name}-${routePath.replaceAll("/", "_") || "home"}.jpg`), type: "jpeg", quality: 58, fullPage: true, animations: "disabled" });
        const shell = await page.evaluate(() => {
          const header = document.querySelector("header");
          const footer = document.querySelector("footer");
          const links = [...document.querySelectorAll("a[href]")].map(link => ({
            text: (link.textContent ?? "").replace(/\s+/g, " ").trim(),
            href: (link as HTMLAnchorElement).href,
          })).filter(link => link.text || link.href);
          const state = (element: Element | null) => element ? {
            background: getComputedStyle(element).backgroundColor,
            color: getComputedStyle(element).color,
            position: getComputedStyle(element).position,
            height: Math.round(element.getBoundingClientRect().height),
          } : null;
          return {
            headerHtml: header?.outerHTML ?? "",
            footerHtml: footer?.outerHTML ?? "",
            headerState: state(header), footerState: state(footer), links,
            title: document.title,
            heading: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          };
        });
        records.push({ build: build.name, sourceSha: build.sha, viewport, path: routePath, status: response?.status() ?? null,
          pageErrors, resourceErrors, headerHash: sha256(shell.headerHtml), footerHash: sha256(shell.footerHtml),
          headerState: shell.headerState, footerState: shell.footerState, links: shell.links,
          title: shell.title, heading: shell.heading, shopFixture: routePath === "/shop" ? shopFixture.source : null,
          shopFixtureReads: routePath === "/shop" ? shopFixtureReads : [],
          screenshot: `${build.name}-${viewport.name}-${routePath.replaceAll("/", "_") || "home"}.jpg` });
        if (response?.status() !== 200) errors.push(`${build.name}/${viewport.name} ${routePath}: HTTP ${response?.status() ?? "no response"}`);
        if (pageErrors.length) errors.push(`${build.name}/${viewport.name} ${routePath}: ${pageErrors.length} page error(s)`);
        await page.close();
      }

      const preview = await context.newPage();
      const previewErrors: string[] = [];
      const previewResourceErrors: { status: number; path: string }[] = [];
      preview.on("pageerror", error => previewErrors.push(error.message));
      preview.on("response", response => {
        if (response.status() >= 400) previewResourceErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
      });
      const previewResponse = await preview.goto(new URL("/admin/homepage", build.origin).toString(), { waitUntil: "domcontentloaded" });
      await expect(preview.getByRole("button", { name: "Playback preview", exact: true })).toBeVisible();
      await preview.getByRole("button", { name: "Playback preview", exact: true }).click();
      await expect(preview.getByRole("button", { name: "Back to editing", exact: true })).toBeVisible();
      const frame = preview.frameLocator('iframe[title="Homepage preview"]');
      await expect(frame.locator("header")).toBeVisible();
      await expect(frame.locator("footer")).toBeVisible();
      await preview.screenshot({ path: join(evidenceDir, `${build.name}-${viewport.name}-editor-preview.jpg`), type: "jpeg", quality: 58, fullPage: true, animations: "disabled" });
      const frameData = await preview.locator('iframe[title="Homepage preview"]').evaluate(frameElement => {
        const document = (frameElement as HTMLIFrameElement).contentDocument!;
        const header = document.querySelector("header");
        const footer = document.querySelector("footer");
        const links = [...document.querySelectorAll("a[href]")].map(link => ({
          text: (link.textContent ?? "").replace(/\s+/g, " ").trim(), href: (link as HTMLAnchorElement).href,
        })).filter(link => link.text || link.href);
        const state = (element: Element | null) => element ? {
          background: getComputedStyle(element).backgroundColor,
          color: getComputedStyle(element).color,
          position: getComputedStyle(element).position,
          height: Math.round(element.getBoundingClientRect().height),
        } : null;
        return { headerHtml: header?.outerHTML ?? "", footerHtml: footer?.outerHTML ?? "",
          headerState: state(header), footerState: state(footer), links };
      });
      records.push({ build: build.name, sourceSha: build.sha, viewport, path: "/admin/homepage (Playback preview)",
        status: previewResponse?.status() ?? null, pageErrors: previewErrors, resourceErrors: previewResourceErrors,
        headerHash: sha256(frameData.headerHtml), footerHash: sha256(frameData.footerHtml),
        headerState: frameData.headerState, footerState: frameData.footerState, links: frameData.links,
        screenshot: `${build.name}-${viewport.name}-editor-preview.jpg` });
      if (previewResponse?.status() !== 200) errors.push(`${build.name}/${viewport.name} editor preview: HTTP ${previewResponse?.status() ?? "no response"}`);
      if (previewErrors.length) errors.push(`${build.name}/${viewport.name} editor preview: ${previewErrors.length} page error(s)`);
      await context.close();
    }
  }

  await writeFile(join(evidenceDir, "academy-shell-capture.json"), JSON.stringify({
    schemaVersion: 1, builds: builds.map(({ name, sha }) => ({ name, sourceSha: sha })),
    viewports: [{ width: 1440, height: 900 }, { width: 390, height: 844 }],
    routes: publicRoutes, blockedExternalAndMutationRequests: blocked, localAuthRefreshes, readOnlyAdminQueries,
    records, errors,
    limits: ["Local synthetic Alpha fixture, loopback Supabase, external requests and mutations blocked.",
      "Screenshots record the current editor playback header appearance; no header behavior was changed."],
  }, null, 2));
  expect(errors, errors.join("\n")).toEqual([]);
});
