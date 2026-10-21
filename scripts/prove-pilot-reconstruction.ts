import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { chromium, expect, type BrowserContext } from "@playwright/test";
import { withPilotProofServers } from "./pilot-proof-servers";
import { verifyPilotSource } from "./pilot-source-package";

const { values } = parseArgs({ options: {
  package: { type: "string" }, digest: { type: "string" }, "baseline-root": { type: "string" },
  "restored-root": { type: "string" }, "changed-root": { type: "string" }, auth: { type: "string" },
} });
function required(value: string | undefined, name: string) { assert(value, `${name} is required`); return value; }
const roots = { baseline: required(values["baseline-root"], "baseline-root"), changed: required(values["changed-root"], "changed-root"), restored: required(values["restored-root"], "restored-root") };
const { manifest, digest } = verifyPilotSource(required(values.package, "package"), required(values.digest, "digest"));
const auth = required(values.auth, "auth");
const retainedHashes = new Set(manifest.files.map(item => item.sha256));
const outputParent = resolve("test-results");
mkdirSync(outputParent, { recursive: true });
const output = mkdtempSync(join(outputParent, "pilot-reconstruction-"));
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const section = {
  id: "retained-home-kit", club_id: "11111111-1111-4111-8111-111111111111", surface: "home", kit_variant: "home",
  eyebrow: "Club store", title: "Home kit pilot", description: "The current home kit.",
  bullet_points: ["Club crest", "Match fit"], store_note: "Available from the club store.", cta_label: "View home kit", cta_link: "/shop", updated_at: "2026-10-20T00:00:00Z",
};
const photos = ["/images/shop/rosecityshirt1.webp", "/images/shop/rosecityshirt2.jpeg"].map((url, index) => ({ id: String(index), surface: "home", kit_variant: "home", url, sort_order: index, created_at: section.updated_at }));
const routeErrors: string[] = [];
const captures: { label: string; width: number; public: unknown; preview: unknown; fonts: string[]; css: string[]; images: string[]; scripts: { path: string; sha256: string }[]; screenshots: string[]; pageErrors: string[]; networkErrors: string[]; consoleErrors: string[]; bodyErrors: string[] }[] = [];
async function main() {
const result = await withPilotProofServers(roots, async (servers, signal) => {
const endpoints = { baseline: servers.baseline.origin, changed: servers.changed.origin, restored: servers.restored.origin };
let lateFont: (typeof manifest.files)[number] | undefined;
const browser = await chromium.launch();
const abort = () => { void browser.close(); };
signal.addEventListener("abort", abort, { once: true });
try {
  signal.throwIfAborted();
  async function guard(context: BrowserContext) {
    await context.routeWebSocket("**/*", socket => socket.close());
    await context.route("**/*", async route => {
      try {
      let url = new URL(route.request().url());
      const local = (target: URL) => target.protocol === "http:" && !target.username && !target.password && ([...Object.values(endpoints), "http://127.0.0.1:54321"].includes(target.origin));
      if (!local(url) || url.pathname.startsWith("/_vercel/insights/")) return route.abort("blockedbyclient");
      if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
        const read = route.request().method() === "POST" && url.pathname === "/api/admin/data" && z.object({ operation: z.literal("select") }).safeParse(route.request().postDataJSON()).success;
        if (!read) { console.error(`Blocked ${route.request().method()} ${url.pathname}`); return route.abort("blockedbyclient"); }
      }
      if (/\/rest\/v1\/shop_kit_(section|photos)$/.test(url.pathname)) {
        assert.equal(url.searchParams.get("club_id"), `eq.${section.club_id}`);
        assert.equal(url.searchParams.get("kit_variant"), "eq.home");
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(url.pathname.endsWith("shop_kit_section") ? [section] : photos) });
      }
      const headers = { ...route.request().headers() };
      for (let hop = 0; hop < 20; hop++) {
        const response = await route.fetch({ url: url.href, headers, maxRedirects: 0 });
        if (![301, 302, 303, 307, 308].includes(response.status())) return route.fulfill({ response });
        const location = response.headers().location;
        assert(location, "Redirect location missing");
        const next = new URL(location, url);
        assert(local(next), "Redirect escaped local rehearsal");
        if (next.origin !== url.origin) { delete headers.authorization; delete headers.cookie; }
        url = next;
      }
      throw new Error("Too many local redirects");
      } catch (error) { routeErrors.push(String(error)); return route.abort("blockedbyclient"); }
    });
  }
  for (const width of [1440, 390]) for (const [label, base] of Object.entries(endpoints)) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, storageState: auth, reducedMotion: "reduce", serviceWorkers: "block" });
    try {
      await guard(context);
      const page = await context.newPage();
      const pageErrors: string[] = [];
      const fonts = new Set<string>(); const css = new Set<string>(); const images = new Map<string, string>();
      const pending: Promise<void>[] = [];
      const bodyErrors: string[] = [];
      const networkErrors: string[] = [];
      const consoleErrors: string[] = [];
      const scripts = new Map<string, string>();
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("console", message => {
        const location = message.location().url;
        if (message.type() === "error" && location && new URL(location).hostname.endsWith(".localhost") && !location.includes("/_vercel/insights/")) consoleErrors.push(message.text());
      });
      page.on("requestfailed", request => {
        const url = new URL(request.url());
        if (url.hostname.endsWith(".localhost") && !url.pathname.startsWith("/_vercel/insights/") && request.failure()?.errorText !== "net::ERR_ABORTED") networkErrors.push(`${url.pathname}: ${request.failure()?.errorText}`);
      });
      page.on("response", response => {
        const path = new URL(response.url()).pathname;
        if (response.status() >= 400) networkErrors.push(`${path}: ${response.status()}`);
        if (response.ok() && (path.endsWith(".woff2") || path.endsWith(".css") || path.startsWith("/_next/") && path.endsWith(".js") || photos.some(photo => photo.url === path))) {
          pending.push(response.body().then(bytes => {
            const digest = hash(bytes);
            if (path.endsWith(".woff2")) fonts.add(digest);
            else if (path.endsWith(".css")) css.add(digest);
            else if (path.endsWith(".js")) scripts.set(path, digest);
            else images.set(path, digest);
          }).catch(error => { bodyErrors.push(String(error)); }));
        }
      });
      assert.equal((await page.goto(base))?.status(), 200);
      await expect(page.locator("main h1").first()).toBeVisible();
      const feature = page.locator("section").filter({ has: page.getByRole("heading", { name: section.title, exact: true }) });
      await expect(feature).toBeVisible();
      await expect.poll(() => feature.locator("img").evaluateAll(items => items.length === 2 && items.every(item => item instanceof HTMLImageElement && item.complete && item.naturalWidth > 0))).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle");
      await Promise.all(pending);
      const publicState = await page.locator("main h1").first().evaluate(element => ({ text: element.textContent, color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
      await expect(page.locator("[data-pilot-mutation]")).toHaveCount(label === "changed" ? 1 : 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const screenshots: string[] = [];
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      const publicShot = join(output, `${label}-${width}-public.png`);
      await page.screenshot({ path: publicShot, animations: "disabled" }); screenshots.push(publicShot);
      await feature.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const kitShot = join(output, `${label}-${width}-kit.png`);
      await feature.screenshot({ path: kitShot, animations: "disabled" }); screenshots.push(kitShot);
      await Promise.all(pending);
      assert.equal((await page.goto(`${base}/admin/homepage`))?.status(), 200);
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      const heading = frame.locator('[data-homepage-piece="hero.heading"]');
      await expect(heading).toBeVisible();
      await heading.focus(); await heading.press("Enter"); await expect(heading).toHaveAttribute("aria-pressed", "true");
      await heading.press("Space");
      const input = page.getByLabel("Line one", { exact: true });
      await expect(input).toBeFocused(); await input.fill("Retained draft rehearsal");
      await expect(heading).toContainText("Retained draft rehearsal");
      const preview = await heading.evaluate(element => ({ text: element.textContent, color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize, width: element.ownerDocument.documentElement.clientWidth }));
      const editorShot = join(output, `${label}-${width}-editor.png`);
      await page.screenshot({ path: editorShot, animations: "disabled" }); screenshots.push(editorShot);
      await input.press("Escape");
      await expect(page.getByRole("dialog", { name: "Main heading", exact: true })).toHaveCount(0);
      await expect(heading).toBeFocused();
      await Promise.all(pending);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(bodyErrors, []);
      assert.deepEqual(networkErrors, []);
      assert.deepEqual(consoleErrors, []);
      if (label !== "changed") {
        assert(css.size > 0 && [...css].every(value => retainedHashes.has(value)), "Loaded styles must match retained emitted bytes");
        assert(fonts.size >= 3 && [...fonts].every(value => retainedHashes.has(value)), "Loaded font bytes must come from retained artifact");
        assert([...images.values()].every(value => retainedHashes.has(value)), "Loaded image bytes must come from retained artifact");
      }
      captures.push({ label, width, public: publicState, preview, fonts: [...fonts].sort(), css: [...css].sort(), images: photos.map(photo => required(images.get(photo.url), photo.url)), screenshots, pageErrors, networkErrors, consoleErrors, bodyErrors, scripts: [...scripts].sort().map(([path, sha256]) => ({ path, sha256 })) });
    } finally { await context.close(); }
  }
  for (const width of [1440, 390]) {
    const baseline = captures.find(item => item.label === "baseline" && item.width === width);
    const restored = captures.find(item => item.label === "restored" && item.width === width);
    const changed = captures.find(item => item.label === "changed" && item.width === width);
    assert(baseline && restored && changed);
    assert.deepEqual(restored.public, baseline.public);
    assert.deepEqual(restored.preview, baseline.preview);
    assert.deepEqual(restored.fonts, baseline.fonts);
    assert.deepEqual(restored.css, baseline.css);
    assert.deepEqual(restored.images, baseline.images);
    assert.notDeepEqual(changed.public, baseline.public);
    assert.notDeepEqual(changed.fonts, baseline.fonts);
    assert.notDeepEqual(changed.images, baseline.images);
    assert(readFileSync(required(restored.screenshots[1], "restored kit")).equals(readFileSync(required(baseline.screenshots[1], "baseline kit"))), "Retained kit screenshot must match baseline");
  }
  const anonymous = await browser.newContext();
  try {
    for (const [label, base] of Object.entries(endpoints)) {
      const denied = await anonymous.request.get(`${base}/api/admin/homepage`, { maxRedirects: 0 });
      assert.equal(denied.status(), 401);
      assert.equal(denied.headers()["x-pilot-platform-revision"] ?? null, label === "baseline" ? null : "current-platform-b");
    }
  } finally { await anonymous.close(); }
const loadedFonts = new Set(captures.filter(item => item.label !== "changed").flatMap(item => item.fonts));
lateFont = manifest.files.find(item => item.path.startsWith("emitted/static/media/") && item.path.endsWith(".woff2") && !loadedFonts.has(item.sha256));
assert(lateFont, "A previously unloaded retained font is required");
const late = await browser.newContext();
try {
  const response = await late.request.get(`${endpoints.restored}/_next/${lateFont.path.slice(8)}`, { maxRedirects: 0 });
  assert.equal(response.status(), 200);
  assert.equal(hash(await response.body()), lateFont.sha256);
} finally { await late.close(); }
} finally { signal.removeEventListener("abort", abort); await browser.close(); }
assert(lateFont);
assert.deepEqual(routeErrors, []);
return { digest, sourceCommit: manifest.sourceCommit, endpoints, servers, captures, lateFont,
  limits: ["Owned generic build receipts do not bind these roots to the accepted package. Accepted-package build identity remains separate.", "Local retained-source reconstruction, not runtime assignment or original compiled-byte retention.", "Populated home-kit GET data is controlled; no saves occur in this rehearsal.", "External media and analytics are blocked; no latency or LCP claim.", "Current tenant/editor mounting, runtime and build-time font provider remain shared."] };
});
const report = { verdict: "PASS", ...result };
writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verdict: "PASS", report: join(output, "report.json") }));

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
