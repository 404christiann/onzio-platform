import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, expect } from "@playwright/test";
import { installPilotProofGuard, proofGet } from "./pilot-proof-network";
import { observePilotProofPage } from "./pilot-proof-page";
import { withPilotProofProxy } from "./pilot-proof-proxy";
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
const result = await withPilotProofServers({ ...roots, acceptedDigest: digest }, async (servers, signal) => {
const endpoints = { baseline: servers.baseline.origin, changed: servers.changed.origin, restored: servers.restored.origin };
return withPilotProofProxy(Object.values(endpoints), async proxy => {
let lateFont: (typeof manifest.files)[number] | undefined;
const browser = await chromium.launch({ proxy: { server: proxy.server, bypass: "" } });
const abort = () => { void browser.close(); };
signal.addEventListener("abort", abort, { once: true });
try {
  signal.throwIfAborted();
  for (const width of [1440, 390]) for (const [label, base] of Object.entries(endpoints)) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, storageState: auth, reducedMotion: "reduce", serviceWorkers: "block", proxy: { server: proxy.server, bypass: "" } });
    try {
      await installPilotProofGuard(context, Object.values(endpoints), proxy, section, photos, routeErrors);
      const page = await context.newPage();
      const finishCapture = observePilotProofPage(page, photos.map(photo => photo.url));
      assert.equal((await page.goto(base))?.status(), 200);
      await expect(page.locator("main h1").first()).toBeVisible();
      const feature = page.locator("section").filter({ has: page.getByRole("heading", { name: section.title, exact: true }) });
      await expect(feature).toBeVisible();
      await expect.poll(() => feature.locator("img").evaluateAll(items => items.length === 2 && items.every(item => item instanceof HTMLImageElement && item.complete && item.naturalWidth > 0))).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle");
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
      assert.equal((await page.goto(`${base}/admin/homepage`))?.status(), 200);
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      const heading = frame.locator('[data-homepage-piece="hero.heading"]');
      await expect(heading).toBeVisible();
      await heading.focus(); await heading.press("Enter"); await expect(heading).toHaveAttribute("aria-pressed", "true");
      await heading.press("Space");
      const input = page.getByLabel("Line one", { exact: true });
      await expect(input).toBeFocused(); await input.fill("Retained draft rehearsal");
      await expect(heading).toContainText("Retained draft rehearsal");
      await frame.locator("html").evaluate(() => document.fonts.ready);
      const preview = await heading.evaluate(element => ({ text: element.textContent, color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize, width: element.ownerDocument.documentElement.clientWidth }));
      const editorShot = join(output, `${label}-${width}-editor.png`);
      await page.screenshot({ path: editorShot, animations: "disabled" }); screenshots.push(editorShot);
      await input.press("Escape");
      await expect(page.getByRole("dialog", { name: "Main heading", exact: true })).toHaveCount(0);
      await expect(heading).toBeFocused();
      const observation = await finishCapture();
      if (label !== "changed") {
        assert(observation.css.length > 0 && observation.css.every(value => retainedHashes.has(value)), "Loaded styles must match retained emitted bytes");
        assert(observation.fonts.length >= 3 && observation.fonts.every(value => retainedHashes.has(value)), "Loaded font bytes must come from retained artifact");
        assert(Object.values(observation.images).every(value => retainedHashes.has(value)), "Loaded image bytes must come from retained artifact");
      }
      captures.push({ label, width, public: publicState, preview, screenshots, ...observation,
        images: photos.map(photo => required(observation.images[photo.url], photo.url)) });
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
  const anonymous = await browser.newContext({ proxy: { server: proxy.server, bypass: "" } });
  try {
    for (const [label, base] of Object.entries(endpoints)) {
      const denied = await proofGet(anonymous, proxy, `${base}/api/admin/homepage`);
      assert.equal(denied.status(), 401);
      assert.equal(denied.headers()["x-pilot-platform-revision"] ?? null, label === "baseline" ? null : "current-platform-b");
    }
  } finally { await anonymous.close(); }
const loadedFonts = new Set(captures.filter(item => item.label !== "changed").flatMap(item => item.fonts));
lateFont = manifest.files.find(item => item.path.startsWith("emitted/static/media/") && item.path.endsWith(".woff2") && !loadedFonts.has(item.sha256));
assert(lateFont, "A previously unloaded retained font is required");
const late = await browser.newContext({ proxy: { server: proxy.server, bypass: "" } });
try {
  const response = await proofGet(late, proxy, `${endpoints.restored}/_next/${lateFont.path.slice(8)}`);
  assert.equal(response.status(), 200);
  assert.equal(hash(await response.body()), lateFont.sha256);
} finally { await late.close(); }
} finally { signal.removeEventListener("abort", abort); await browser.close(); }
assert(lateFont);
assert.deepEqual(routeErrors, []);
return { digest, sourceCommit: manifest.sourceCommit, endpoints, servers, captures, lateFont,
  limits: ["Local retained-source reconstruction, not runtime assignment or original compiled-byte retention.", "Populated home-kit GET data is controlled; no saves occur in this rehearsal.", "External media and analytics are blocked; no latency or LCP claim.", "Current tenant/editor mounting, runtime and build-time font provider remain shared."] };
});
});
const report = { verdict: "PASS", ...result };
writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verdict: "PASS", report: join(output, "report.json") }));

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
