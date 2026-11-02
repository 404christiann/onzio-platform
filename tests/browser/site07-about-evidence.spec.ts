import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import populatedFixture from "./site07-about-populated-fixture.json";

const evidenceDir = process.env.SITE07_ABOUT_EVIDENCE_DIR;
const scenario = process.env.SITE07_ABOUT_SCENARIO ?? "actual-alpha-empty";
if (!["actual-alpha-empty", "populated-fixture"].includes(scenario)) throw new Error("Unknown About evidence scenario.");
const baseUrl = process.env.SITE07_ABOUT_BASE_URL;
const headUrl = process.env.SITE07_ABOUT_HEAD_URL;
const baseSha = process.env.SITE07_ABOUT_BASE_SHA;
const headSha = process.env.SITE07_ABOUT_HEAD_SHA;
if (!evidenceDir || !baseUrl || !headUrl || !baseSha || !headSha) {
  throw new Error("Set SITE07_ABOUT_EVIDENCE_DIR, both loopback URLs, and both revision IDs.");
}

const builds = [
  { name: "base", sha: baseSha, origin: baseUrl },
  { name: "head", sha: headSha, origin: headUrl },
];
for (const build of builds) {
  const url = new URL(build.origin);
  if (url.protocol !== "http:" || !["alpha.localhost", "127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/") {
    throw new Error("SITE-07 About evidence accepts only an HTTP loopback origin.");
  }
}

const routes = ["/club/about"] as const;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

test("capture and compare Academy About at desktop and phone sizes", async ({ browser }) => {
  test.setTimeout(150_000);
  await mkdir(evidenceDir, { recursive: true });
  const records: Array<Record<string, unknown>> = [];
  const baselines = new Map<string, { hash: string; errors: Array<{ status: number; path: string }>; resources: unknown; headerState: unknown; screenshotSha256: string }>();

  for (const build of builds) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block" });
      const blockedRequests: string[] = [];
      await context.routeWebSocket("**/*", socket => socket.close());
      await context.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        const loopback = url.hostname.endsWith(".localhost") || ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
        if ((url.protocol === "http:" || url.protocol === "https:") && (!loopback || !["GET", "HEAD", "OPTIONS"].includes(request.method()))) {
          blockedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      await context.route("**/_vercel/insights/script.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));

      for (const routePath of routes) {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        const resourceErrors: Array<{ status: number; path: string }> = [];
        const restReads: Record<string, number> = {};
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("response", response => {
          if (response.status() >= 400) resourceErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
        });
        page.on("requestfinished", request => {
          const url = new URL(request.url());
          if (request.method() !== "GET") return;
          const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
          if (table) restReads[table] = (restReads[table] ?? 0) + 1;
        });
        const response = await page.goto(new URL(routePath, build.origin).toString(), { waitUntil: "load" });
        expect(response?.status(), `${build.name} ${routePath}`).toBe(200);
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect(page.locator("header").first()).toBeVisible();
        await expect(page.locator("footer").first()).toBeVisible();
        await page.waitForTimeout(1800);
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
        await page.waitForTimeout(1400);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        const headerState = await page.evaluate(async () => {
          await document.fonts.ready;
          let previous = "";
          let stable = 0;
          for (let attempt = 0; attempt < 100; attempt++) {
            const header = document.querySelector("header");
            if (!header) throw new Error("About capture requires the real header.");
            const style = getComputedStyle(header);
            const bounds = header.getBoundingClientRect();
            const current = {
              scrollY: window.scrollY, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
              position: style.position, top: style.top, transform: style.transform, opacity: style.opacity,
              paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, backgroundColor: style.backgroundColor,
            };
            const serialized = JSON.stringify(current);
            const moving = header.getAnimations({ subtree: true }).some(animation => animation.playState === "running");
            stable = window.scrollY === 0 && !moving && serialized === previous ? stable + 1 : 0;
            if (stable >= 4) return current;
            previous = serialized;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          throw new Error("About header did not settle at the top of the page.");
        });
        if (scenario === "populated-fixture") {
          await expect(page.locator("main h1")).toHaveText(populatedFixture.hero_title);
          await expect(page.getByText(populatedFixture.story_paragraphs[0], { exact: true })).toBeVisible();
          await expect(page.getByRole("heading", { name: populatedFixture.values[0].title, exact: true })).toBeVisible();
          await expect(page.getByText(populatedFixture.values[0].description, { exact: true })).toBeVisible();
          await expect(page.locator("main").getByRole("link", { name: populatedFixture.closing_cta_label, exact: true })).toHaveAttribute("href", populatedFixture.closing_cta_href);
        }
        const state = await page.evaluate(() => {
          const markup = (selector: string) => document.querySelector(selector)?.outerHTML ?? "";
          const links = [...document.querySelectorAll("a[href]")].map(link => {
            const url = new URL((link as HTMLAnchorElement).href);
            return { text: (link.textContent ?? "").replace(/\s+/g, " ").trim(), href: url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href };
          }).filter(link => link.text || link.href);
          const fonts = performance.getEntriesByType("resource").filter(
            (item): item is PerformanceResourceTiming => new URL(item.name).pathname.endsWith(".woff2"),
          );
          return {
            header: markup("header"), main: markup("main"), footer: markup("footer"), links,
            fonts: { count: fonts.length, decodedBodyBytes: fonts.reduce((sum, item) => sum + item.decodedBodySize, 0), transferBytes: fonts.reduce((sum, item) => sum + item.transferSize, 0) },
          };
        });
        const appOrigin = new URL(build.origin).origin;
        const comparable = { ...state, header: state.header.replaceAll(appOrigin, "http://alpha.localhost"), main: state.main.replaceAll(appOrigin, "http://alpha.localhost"), footer: state.footer.replaceAll(appOrigin, "http://alpha.localhost") };
        const key = `${routePath}/${viewport.name}`;
        const hash = digest(JSON.stringify({ header: comparable.header, main: comparable.main, footer: comparable.footer, links: state.links }));
        const resources = { fonts: state.fonts, restReads };
        if (build.name !== "base") {
          const baseline = baselines.get(key);
          expect(hash, `${routePath} ${viewport.name} DOM and links`).toBe(baseline?.hash);
          expect(resourceErrors, `${routePath} ${viewport.name} resource errors`).toEqual(baseline?.errors);
          const expected = baseline?.resources as typeof resources | undefined;
          expect(resources.fonts.count, `${routePath} ${viewport.name} font count`).toBeLessThanOrEqual(expected?.fonts.count ?? 0);
          expect(resources.fonts.decodedBodyBytes, `${routePath} ${viewport.name} decoded font bytes`).toBeLessThanOrEqual(expected?.fonts.decodedBodyBytes ?? 0);
          expect(resources.fonts.transferBytes, `${routePath} ${viewport.name} font transfer bytes`).toBeLessThanOrEqual(expected?.fonts.transferBytes ?? 0);
          expect(resources.restReads, `${routePath} ${viewport.name} Supabase reads`).toEqual(expected?.restReads);
          expect(headerState, `${routePath} ${viewport.name} settled header`).toEqual(baseline?.headerState);
        }
        const pageName = "about";
        const screenshot = `${build.name}-${viewport.name}-${pageName}.jpg`;
        const screenshotBytes = await page.screenshot({ path: join(evidenceDir, screenshot), type: "jpeg", quality: 62, fullPage: true, animations: "disabled" });
        const screenshotSha256 = digest(screenshotBytes);
        if (build.name === "base") baselines.set(key, { hash, errors: resourceErrors, resources, headerState, screenshotSha256 });
        else expect(screenshotSha256, `${routePath} ${viewport.name} whole-page screenshot bytes`).toBe(baselines.get(key)?.screenshotSha256);
        records.push({ build: build.name, sha: build.sha, route: routePath, viewport, status: response?.status() ?? null,
          headerDomSha256: digest(comparable.header), mainDomSha256: digest(comparable.main), footerDomSha256: digest(comparable.footer),
          links: state.links, resources, pageErrors, resourceErrors, blockedRequests: [...blockedRequests], headerState, screenshot, screenshotSha256 });
        expect(pageErrors, `${build.name} ${routePath} page errors`).toEqual([]);
        expect(resourceErrors, `${build.name} ${routePath} resource errors`).toEqual([]);
        expect(blockedRequests, `${build.name} ${routePath} blocked requests`).toEqual([]);
        await page.close();
      }
      await context.close();
    }
  }

  await writeFile(join(evidenceDir, "about-capture.json"), `${JSON.stringify({ schemaVersion: 1, scenario, contentFixture: scenario === "populated-fixture" ? { source: "tests/database/about-content-policy.test.ts", fixture: populatedFixture, interception: "Node server preload supplies only exact Alpha loopback GET about_page_content; no database writes" } : null, builds: builds.map(({ name, sha }) => ({ name, sha })), routes, viewports, records,
    limits: ["Local synthetic Alpha tenant and loopback Supabase only.", "External requests, service workers, WebSockets, and non-read HTTP requests are blocked."],
  }, null, 2)}\n`);
});
