import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, realpathSync, writeFileSync, closeSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  "base-url": { type: "string" }, output: { type: "string" }, compare: { type: "string" },
  "expected-title": { type: "string" }, "source-sha": { type: "string" },
  "home-kit-only": { type: "boolean", default: false }, help: { type: "boolean", default: false },
} });
if (values.help) {
  console.log("node scripts/check-site-performance.mjs --base-url http://alpha.localhost:PORT --expected-title 'Alpha FC' --output test-results/site-performance/baseline.json [--source-sha SHA] [--compare baseline.json --home-kit-only]");
  process.exit(0);
}

function loopback(hostname) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostname) || hostname.endsWith(".localhost");
}
function inside(path, directory) {
  const child = relative(directory, path);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !child.startsWith(sep);
}
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
assert(values["base-url"] && values.output && values["expected-title"], "base-url, output, and expected-title are required");
let base;
try { base = new URL(values["base-url"]); }
catch { throw new Error("base-url must be a valid loopback HTTP origin"); }
assert(["http:", "https:"].includes(base.protocol) && loopback(base.hostname), "base-url must use HTTP on a loopback host");
assert(!base.username && !base.password && !base.search && !base.hash && base.pathname === "/", "base-url must be an origin without credentials or parameters");
const requestedOutput = resolve(values.output);
let parent = dirname(requestedOutput);
while (!existsSync(parent)) parent = dirname(parent);
const output = resolve(realpathSync(parent), relative(parent, requestedOutput));
assert(output.endsWith(".json") && !existsSync(output), "output must be a new .json file");
const ignored = inside(output, root) && (() => {
  try { execFileSync("git", ["check-ignore", "--quiet", "--", relative(root, output)], { cwd: root }); return true; }
  catch { return false; }
})();
assert(ignored || inside(output, realpathSync(tmpdir())), "output must be in a gitignored repository directory or the system temporary directory");
const sourceSha = values["source-sha"] ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert(/^[a-f0-9]{40}$/.test(sourceSha), "source-sha must be a full commit SHA");
const require = createRequire(resolve(root, "package.json"));
const { chromium } = require("@playwright/test");
const { z } = require("zod");
const count = z.number().finite().nonnegative();
const metric = z.object({ min: count, median: count, max: count });
const summarySchema = z.object({
  fonts: metric, fontBodyBytes: metric, fontTransferBytes: metric,
  scriptBodyBytes: metric, scriptTransferBytes: metric, restReads: metric, ttfbMs: metric,
});
const comparisonSchema = z.object({ schemaVersion: z.literal(3), scenario: z.object({
  originHost: z.string(), expectedTitle: z.string(), route: z.literal("/"), warmups: z.literal(1),
  measuredSamples: z.literal(5), settleMs: z.literal(1800), browser: z.string(), redirects: z.literal("guard-every-hop"), webSockets: z.literal("blocked"),
  viewports: z.array(z.object({ name: z.string(), width: count, height: count })),
}), summary: z.record(z.string(), summarySchema),
  verdict: z.enum(["BASELINE_CAPTURED", "PASS_RESOURCE_GATES"]),
  samples: z.array(z.object({ viewport: z.string(), warmup: z.boolean(), status: z.literal(200),
    pageErrors: z.literal(0), httpErrors: z.literal(0), requestErrors: z.literal(0),
    metrics: z.object({ heading: z.string().min(1), mainTextDigest: z.string().regex(/^[a-f0-9]{64}$/) }),
  })).length(12),
});
let previous = null;
if (values.compare) {
  try { previous = comparisonSchema.parse(JSON.parse(readFileSync(values.compare, "utf8"))); }
  catch { throw new Error("compare must reference a successful site performance report"); }
}
const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "phone", width: 390, height: 844 }];
const report = { schemaVersion: 3, sourceSha, baseOrigin: base.origin, scenario: null, samples: [], summary: {},
  verdict: "INCOMPLETE", limits: ["Loopback synthetic data; external resources and analytics blocked.", "Fresh browser contexts, warm server, no network/CPU throttling.", "TTFB is descriptive; separate captures do not establish a speedup or LCP.", "sourceSha is supplied by the caller; confirm the served production build uses it."] };
mkdirSync(dirname(output), { recursive: true });
const descriptor = openSync(output, "wx", 0o600);
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  report.scenario = { originHost: base.hostname, expectedTitle: values["expected-title"], route: "/", warmups: 1,
    measuredSamples: 5, settleMs: 1800, browser: browser.version(), redirects: "guard-every-hop", webSockets: "blocked", viewports };
  if (previous) assert.deepEqual(previous.scenario, report.scenario, "baseline and candidate scenarios differ");
  for (const viewport of viewports) {
    for (let index = 0; index < 6; index++) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block" });
      const sample = { viewport: viewport.name, warmup: index === 0, status: null, pageErrors: 0, httpErrors: 0,
        requestErrors: 0, prefetchCancellations: 0, redirectsBlocked: 0, redirectsFollowed: 0, webSocketsBlocked: 0, excluded: { external: 0, analytics: 0 }, rest: {},
        kits: { shop_kit_section: { home: 0, third: 0, away: 0, unspecified: 0 }, shop_kit_photos: { home: 0, third: 0, away: 0, unspecified: 0 } }, metrics: null };
      report.samples.push(sample);
      await context.routeWebSocket("**/*", socket => { sample.webSocketsBlocked++; return socket.close(); });
      await context.route("**/*", async route => {
        const request = route.request(); const url = new URL(request.url());
        if (!loopback(url.hostname)) { sample.excluded.external++; return route.abort("blockedbyclient"); }
        if (url.pathname.startsWith("/_vercel/insights/")) { sample.excluded.analytics++; return route.abort("blockedbyclient"); }
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) { sample.requestErrors++; return route.abort("blockedbyclient"); }
        let target = url;
        const headers = { ...request.headers() };
        for (let hop = 0; hop <= 20; hop++) {
          const response = await route.fetch({ url: target.href, headers, maxRedirects: 0 });
          if (![301, 302, 303, 307, 308].includes(response.status())) return route.fulfill({ response });
          const location = response.headers().location;
          let next;
          try { next = new URL(location ?? "", target); } catch { next = null; }
          if (!location || !next || !["http:", "https:"].includes(next.protocol) || !loopback(next.hostname) ||
              next.username || next.password || request.method() === "OPTIONS" || hop === 20) {
            sample.redirectsBlocked++;
            return route.abort("blockedbyclient");
          }
          if (next.origin !== target.origin) {
            delete headers.authorization;
            delete headers.cookie;
          }
          sample.redirectsFollowed++;
          target = next;
        }
      });
      const page = await context.newPage();
      const responses = new WeakMap();
      page.on("pageerror", () => sample.pageErrors++);
      page.on("response", response => {
        responses.set(response.request(), response);
        if (response.status() >= 400) sample.httpErrors++;
      });
      page.on("requestfinished", request => {
        const response = responses.get(request);
        const url = new URL(request.url());
        const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
        if (!table || !response || response.status() >= 400) return;
        sample.rest[table] = (sample.rest[table] ?? 0) + 1;
        if (Object.hasOwn(sample.kits, table)) {
          const variant = url.searchParams.get("kit_variant")?.match(/^eq\.(home|third|away)$/)?.[1] ?? "unspecified";
          sample.kits[table][variant]++;
        }
      });
      page.on("requestfailed", request => {
        const url = new URL(request.url());
        if (!loopback(url.hostname) || url.pathname.startsWith("/_vercel/insights/")) return;
        const headers = request.headers();
        if (request.failure()?.errorText === "net::ERR_ABORTED" &&
          (headers["next-router-prefetch"] === "1" || "next-router-segment-prefetch" in headers)) sample.prefetchCancellations++;
        else sample.requestErrors++;
      });
      try {
        const response = await page.goto(base.origin, { waitUntil: "load", timeout: 45000 });
        sample.status = response?.status() ?? null;
        assert.equal(sample.status, 200, "homepage must return HTTP 200");
        await page.waitForFunction(title => document.title === title, values["expected-title"], { timeout: 15000 });
        await page.locator("main h1").first().waitFor({ state: "visible", timeout: 15000 });
        await page.waitForFunction(() => !document.querySelector("[data-academy-hero-loading]"), undefined, { timeout: 15000 });
        await page.waitForTimeout(1800);
        sample.metrics = await page.evaluate(() => {
          const resources = performance.getEntriesByType("resource");
          const navigation = performance.getEntriesByType("navigation")[0];
          const fonts = resources.filter(item => new URL(item.name).pathname.endsWith(".woff2"));
          const scripts = resources.filter(item => new URL(item.name).pathname.endsWith(".js"));
          const bytes = (items, field) => items.reduce((sum, item) => sum + item[field], 0);
          return { heading: document.querySelector("main h1")?.textContent?.trim() ?? "",
            mainText: document.querySelector("main")?.innerText.replace(/\s+/g, " ").trim() ?? "", fonts: fonts.length,
            fontBodyBytes: bytes(fonts, "decodedBodySize"), fontTransferBytes: bytes(fonts, "transferSize"),
            scriptBodyBytes: bytes(scripts, "decodedBodySize"), scriptTransferBytes: bytes(scripts, "transferSize"),
            ttfbMs: navigation.responseStart - navigation.requestStart,
            developmentResources: resources.some(item => /webpack-hmr|\/development\//.test(new URL(item.name).pathname)) };
        });
        sample.metrics.mainTextDigest = createHash("sha256").update(sample.metrics.mainText).digest("hex");
        delete sample.metrics.mainText;
        assert(sample.metrics.heading.length > 0, "hero heading must contain actual content");
        if (previous) {
          const baselineSample = previous.samples.find(item => item.viewport === viewport.name && !item.warmup);
          assert(baselineSample, "baseline viewport samples are missing");
          assert.equal(sample.metrics.heading, baselineSample.metrics.heading, "hero content differs from baseline");
          assert.equal(sample.metrics.mainTextDigest, baselineSample.metrics.mainTextDigest, "visible main content differs from baseline");
        }
        assert(!sample.metrics.developmentResources, "serve a production build for this check");
        assert.equal(sample.pageErrors + sample.httpErrors + sample.requestErrors, 0, "page, HTTP or non-prefetch request errors occurred");
        for (const reads of Object.values(sample.kits)) {
          assert(reads.home > 0, "home kit reads must still occur for the client-loader pilot");
          if (values["home-kit-only"]) assert.equal(reads.third + reads.away + reads.unspecified, 0, "unexpected kit variants were requested");
        }
        console.log(`${viewport.name} ${index === 0 ? "warmup" : `sample ${index}`} PASS`);
      } finally { page.removeAllListeners(); await context.close(); }
    }
  }
  const distribution = entries => {
    const sorted = entries.toSorted((a, b) => a - b);
    return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
  };
  for (const viewport of viewports) {
    const samples = report.samples.filter(sample => sample.viewport === viewport.name && !sample.warmup);
    const metrics = Object.fromEntries(Object.keys(summarySchema.shape).map(key => [key,
      distribution(samples.map(sample => key === "restReads" ? Object.values(sample.rest).reduce((a, b) => a + b, 0) : sample.metrics[key]))]));
    report.summary[viewport.name] = metrics;
    if (previous) {
      const old = previous.summary[viewport.name]; assert(old, "baseline viewport is missing");
      assert(metrics.fonts.max <= old.fonts.min && metrics.fontBodyBytes.max <= old.fontBodyBytes.min, "font count/body bytes grew beyond baseline");
      assert(metrics.restReads.max <= old.restReads.max, "completed browser REST reads exceed baseline");
    }
  }
  report.verdict = previous ? "PASS_RESOURCE_GATES" : "BASELINE_CAPTURED";
  comparisonSchema.parse(report);
  console.log(`${report.verdict}. Timing and LCP improvement remain unproven.`);
} catch (error) {
  report.verdict = "FAIL";
  report.failure = error instanceof assert.AssertionError ? error.message : "The local browser or input check failed; inspect the local run.";
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  await browser?.close();
  writeFileSync(descriptor, JSON.stringify(report, null, 2));
  closeSync(descriptor);
}
