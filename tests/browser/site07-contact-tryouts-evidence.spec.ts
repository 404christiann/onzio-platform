import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = process.env.SITE07_PAGES_EVIDENCE_DIR;
const baseUrl = process.env.SITE07_PAGES_BASE_URL;
const headUrl = process.env.SITE07_PAGES_HEAD_URL;
const baseSha = process.env.SITE07_PAGES_BASE_SHA;
const headSha = process.env.SITE07_PAGES_HEAD_SHA;
if (!evidenceDir || !baseUrl || !headUrl || !baseSha || !headSha) {
  throw new Error("Set the SITE07_PAGES_EVIDENCE_DIR, BASE_URL, HEAD_URL, BASE_SHA, and HEAD_SHA variables.");
}

const builds = [
  { name: "base", sha: baseSha, origin: baseUrl },
  { name: "head", sha: headSha, origin: headUrl },
];
for (const build of builds) {
  const url = new URL(build.origin);
  if (url.protocol !== "http:" || !["alpha.localhost", "127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/") {
    throw new Error("SITE-07 page evidence accepts only an HTTP loopback origin.");
  }
}

const routes = ["/contact", "/tryouts"] as const;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
type PageResources = {
  fonts: { count: number; decodedBodyBytes: number; transferBytes: number };
  restReads: Record<string, number>;
};

test("capture and compare Academy Contact and Tryouts pages at desktop and phone sizes", async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(evidenceDir, { recursive: true });
  const captures: Array<Record<string, unknown>> = [];
  const baseline = new Map<string, { hash: string; errors: Array<{ status: number; path: string }>; resources: PageResources }>();
  const pairResourceErrors = new Map<string, Array<{ status: number; path: string }>>();

  for (const build of builds) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block" });
      const blockedRequests: string[] = [];
      await context.routeWebSocket("**/*", socket => socket.close());
      await context.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        const loopback = url.hostname.endsWith(".localhost") || ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
        if (url.protocol !== "http:" && url.protocol !== "https:") return route.continue();
        if (!loopback || !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          blockedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });

      for (const routePath of routes) {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        const resourceErrors: Array<{ status: number; path: string }> = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("response", response => {
          if (response.status() >= 400) resourceErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
        });
        const restReads: Record<string, number> = {};
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
        const state = await page.evaluate(() => {
          const markup = (selector: string) => document.querySelector(selector)?.outerHTML ?? "";
          const links = [...document.querySelectorAll("a[href]")].map(link => ({
            text: (link.textContent ?? "").replace(/\s+/g, " ").trim(),
            href: (() => {
              const url = new URL((link as HTMLAnchorElement).href);
              return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
            })(),
          })).filter(link => link.text || link.href);
          const fonts = performance.getEntriesByType("resource").filter(
            (item): item is PerformanceResourceTiming => new URL(item.name).pathname.endsWith(".woff2"),
          );
          return {
            header: markup("header"), main: markup("main"), footer: markup("footer"), links,
            fonts: {
              count: fonts.length,
              decodedBodyBytes: fonts.reduce((sum, item) => sum + item.decodedBodySize, 0),
              transferBytes: fonts.reduce((sum, item) => sum + item.transferSize, 0),
            },
          };
        });
        const hashKey = `${routePath}/${viewport.name}`;
        const hash = digest(JSON.stringify({ header: state.header, main: state.main, footer: state.footer, links: state.links }));
        const resources = { fonts: state.fonts, restReads };
        if (build.name === "base") {
          baseline.set(hashKey, { hash, errors: resourceErrors, resources });
        } else {
          const expected = baseline.get(hashKey);
          expect(hash, `${routePath} ${viewport.name} DOM and links`).toBe(expected?.hash);
          expect(resourceErrors, `${routePath} ${viewport.name} resource errors`).toEqual(expected?.errors);
          expect(resources.fonts.count, `${routePath} ${viewport.name} font count`).toBeLessThanOrEqual(expected?.resources.fonts.count ?? 0);
          expect(resources.fonts.decodedBodyBytes, `${routePath} ${viewport.name} font bytes`).toBeLessThanOrEqual(expected?.resources.fonts.decodedBodyBytes ?? 0);
          expect(resources.fonts.transferBytes, `${routePath} ${viewport.name} font transfer`).toBeLessThanOrEqual(expected?.resources.fonts.transferBytes ?? 0);
          expect(resources.restReads, `${routePath} ${viewport.name} Supabase reads`).toEqual(expected?.resources.restReads);
        }
        const screenshot = `${build.name}-${viewport.name}-${routePath.slice(1)}.jpg`;
        await page.screenshot({ path: join(evidenceDir, screenshot), type: "jpeg", quality: 62, fullPage: true, animations: "disabled" });
        captures.push({
          build: build.name,
          sha: build.sha,
          route: routePath,
          viewport,
          status: response?.status() ?? null,
          headerDomSha256: digest(state.header),
          mainDomSha256: digest(state.main),
          footerDomSha256: digest(state.footer),
          linkList: state.links,
          resources,
          pageErrors,
          resourceErrors,
          screenshot,
        });
        expect(pageErrors, `${build.name} ${routePath} page errors`).toEqual([]);
        expect(resourceErrors, `${build.name} ${routePath} resource errors`).toEqual([]);
        expect(blockedRequests, `${build.name} ${routePath} blocked requests`).toEqual([]);
        await page.close();
      }
      await context.close();
    }
  }

  await writeFile(join(evidenceDir, "contact-tryouts-capture.json"), `${JSON.stringify(captures, null, 2)}\n`);
});
