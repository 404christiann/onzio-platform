import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = process.env.SITE07_COMPETITION_EVIDENCE_DIR;
const baseUrl = process.env.SITE07_COMPETITION_BASE_URL;
const headUrl = process.env.SITE07_COMPETITION_HEAD_URL;
const baseSha = process.env.SITE07_COMPETITION_BASE_SHA;
const headSha = process.env.SITE07_COMPETITION_HEAD_SHA;
if (!evidenceDir || !baseUrl || !headUrl || !baseSha || !headSha) {
  throw new Error("Set SITE07_COMPETITION_EVIDENCE_DIR, both loopback URLs, and both revision IDs.");
}

const builds = [
  { name: "base", sha: baseSha, origin: baseUrl },
  { name: "head", sha: headSha, origin: headUrl },
];
for (const build of builds) {
  const url = new URL(build.origin);
  if (url.protocol !== "http:" || !["alpha.localhost", "127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/") {
    throw new Error("SITE-07 competition evidence accepts only an HTTP loopback origin.");
  }
}

const routes = ["/", "/roster", "/schedule"] as const;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

test("capture Academy homepage, roster and schedule before and after the page move", async ({ browser }) => {
  test.setTimeout(150_000);
  await mkdir(evidenceDir, { recursive: true });
  const records: Array<Record<string, unknown>> = [];
  const baselines = new Map<string, { content: string; mainHash: string; links: Array<{ text: string; href: string }>; errors: Array<{ status: number; path: string }>; resources: unknown }>();

  for (const build of builds) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block" });
      const blockedRequests: string[] = [];
      const blockedMediaRequests: string[] = [];
      await context.routeWebSocket("**/*", socket => socket.close());
      await context.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        const loopback = url.hostname.endsWith(".localhost") || ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
        if (request.method() === "GET" && url.protocol === "https:" && url.hostname.endsWith(".b-cdn.net") && /^\/[0-9a-f-]+\/play_720p\.mp4$/i.test(url.pathname)) {
          blockedMediaRequests.push(`${url.hostname}${url.pathname}`);
          return route.abort("blockedbyclient");
        }
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
        await expect(page.locator("header").first()).toBeVisible();
        await expect(page.locator("footer").first()).toBeVisible();
        if (routePath !== "/") await expect(page.locator("main h1").first()).toBeVisible();
        await page.waitForTimeout(1800);
        const state = await page.evaluate(() => {
          const main = document.querySelector("main");
          const content = (main?.innerText ?? "").replace(/\s+/g, " ").trim();
          const mainHtml = main?.outerHTML ?? "";
          const links = [...document.querySelectorAll("main a[href]")].map(link => {
            const url = new URL((link as HTMLAnchorElement).href);
            return { text: (link.textContent ?? "").replace(/\s+/g, " ").trim(), href: url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href };
          }).filter(link => link.text || link.href);
          const fonts = performance.getEntriesByType("resource").filter(
            (item): item is PerformanceResourceTiming => new URL(item.name).pathname.endsWith(".woff2"),
          );
          return {
            content,
            mainHtml,
            links,
            fonts: { count: fonts.length, decodedBodyBytes: fonts.reduce((sum, item) => sum + item.decodedBodySize, 0), transferBytes: fonts.reduce((sum, item) => sum + item.transferSize, 0) },
          };
        });
        const resources = { fonts: state.fonts, restReads };
        const normalizedMain = state.mainHtml.replaceAll(new URL(build.origin).origin, "http://alpha.localhost");
        const mainHash = digest(JSON.stringify({ main: normalizedMain, links: state.links }));
        const key = `${routePath}/${viewport.name}`;
        if (build.name === "base") baselines.set(key, { content: state.content, mainHash, links: state.links, errors: resourceErrors, resources });
        else {
          const baseline = baselines.get(key);
          expect(state.content, `${routePath} ${viewport.name} visible content`).toBe(baseline?.content);
          expect(state.links, `${routePath} ${viewport.name} links`).toEqual(baseline?.links);
          expect(mainHash, `${routePath} ${viewport.name} rendered main markup and links`).toBe(baseline?.mainHash);
          expect(resourceErrors, `${routePath} ${viewport.name} resource errors`).toEqual(baseline?.errors);
          const expected = baseline?.resources as typeof resources | undefined;
          expect(resources.fonts.count, `${routePath} ${viewport.name} font count`).toBeLessThanOrEqual(expected?.fonts.count ?? 0);
          expect(resources.fonts.decodedBodyBytes, `${routePath} ${viewport.name} decoded font bytes`).toBeLessThanOrEqual(expected?.fonts.decodedBodyBytes ?? 0);
          expect(resources.fonts.transferBytes, `${routePath} ${viewport.name} font transfer bytes`).toBeLessThanOrEqual(expected?.fonts.transferBytes ?? 0);
          expect(resources.restReads, `${routePath} ${viewport.name} Supabase reads`).toEqual(expected?.restReads);
        }
        const routeName = routePath === "/" ? "home" : routePath.slice(1);
        const screenshot = `${build.name}-${viewport.name}-${routeName}.jpg`;
        await page.screenshot({ path: join(evidenceDir, screenshot), type: "jpeg", quality: 62, fullPage: true, animations: "disabled" });
        records.push({ build: build.name, sha: build.sha, route: routePath, viewport, status: response?.status() ?? null,
          contentSha256: digest(state.content), mainDomSha256: mainHash, links: state.links, resources, pageErrors, resourceErrors,
          blockedRequests: [...blockedRequests], blockedMediaRequests: [...blockedMediaRequests], screenshot });
        expect(pageErrors, `${build.name} ${routePath} page errors`).toEqual([]);
        expect(resourceErrors, `${build.name} ${routePath} resource errors`).toEqual([]);
        expect(blockedRequests, `${build.name} ${routePath} blocked requests`).toEqual([]);
        await page.close();
      }
      await context.close();
    }
  }

  await writeFile(join(evidenceDir, "competition-pages-capture.json"), `${JSON.stringify({ schemaVersion: 1, builds: builds.map(({ name, sha }) => ({ name, sha })), routes, viewports, records,
    limits: ["Local synthetic Alpha tenant and loopback Supabase only.", "External requests, service workers, WebSockets, and non-read HTTP requests are blocked.", "Known Bunny playback GETs are aborted and recorded as blocked media; no CDN request reaches the network."],
  }, null, 2)}\n`);
});
