import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, expect, type Request } from "@playwright/test";
import sharp from "sharp";
import { openCoordinationProof } from "../tests/helpers/site-coordination-proof";
import { academyProofDocuments, type AcademyProofDocumentCase } from "./pilot-academy-documents";
import { codeSiteParityInputSchema, compareFocusedCodeSiteSnapshots, selectFocusedCodeSiteDocuments, type FocusedCodeSiteSnapshot } from "./code-site-parity-contract";
import { localPilotProofLogin, type PilotProofStorageState } from "./pilot-proof-login";
import { installAcademyProofGuard, type AcademyProofNetworkObservations } from "./pilot-proof-network";
import { observePilotProofPage } from "./pilot-proof-page";
import { withPilotProofProxy } from "./pilot-proof-proxy";
import { withOwnedPilotServers } from "./pilot-proof-servers";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const fixtureImages = ["/images/shop/rosecityshirt1.webp", "/images/shop/rosecityshirt2.jpeg", "/images/logo/rosecityLogo.png"];
const { values } = parseArgs({ options: { config: { type: "string" } } });
assert(values.config, "--config is required");
const input = codeSiteParityInputSchema.parse(JSON.parse(readFileSync(resolve(values.config), "utf8")));
const roots = { before: realpathSync(input.roots.before), after: realpathSync(input.roots.after) };
assert.notEqual(roots.before, roots.after, "Parity requires distinct genuine build roots");

function assertSource(root: string, expected: string) {
  const actual = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(actual, expected, "Parity root source commit differs from the requested exact head");
  const status = execFileSync("git", ["-C", root, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim();
  assert.equal(status, "", "Parity root has modified tracked source");
}

async function pixelDifference(beforeFile: string, afterFile: string, outputFile: string) {
  const before = sharp(beforeFile), after = sharp(afterFile);
  const [beforeMeta, afterMeta] = await Promise.all([before.metadata(), after.metadata()]);
  if (beforeMeta.width !== afterMeta.width || beforeMeta.height !== afterMeta.height) return { beforeSize: [beforeMeta.width, beforeMeta.height], afterSize: [afterMeta.width, afterMeta.height], pixels: null };
  const { data: a, info } = await before.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await after.ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(a.length);
  let pixels = 0;
  for (let offset = 0; offset < a.length; offset += info.channels) {
    let changed = false;
    for (let channel = 0; channel < info.channels; channel++) {
      const difference = Math.abs(a[offset + channel] - b[offset + channel]);
      diff[offset + channel] = difference;
      changed ||= difference !== 0;
    }
    if (changed) pixels++;
  }
  await sharp(diff, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toFile(outputFile);
  return { beforeSize: [info.width, info.height], afterSize: [info.width, info.height], pixels };
}

async function run() {
  assertSource(roots.before, input.beforeCommit);
  assertSource(roots.after, input.afterCommit);
  mkdirSync(resolve("test-results"), { recursive: true });
  const output = mkdtempSync(resolve("test-results/code-site-parity-"));
  const proof = await openCoordinationProof();
  let primaryFailure: unknown;
  let result: unknown;
  try {
    const parameters = await proof.populateAcademy();
    const documents = selectFocusedCodeSiteDocuments(academyProofDocuments(parameters));
    const initial = await proof.checkpoint();
    const instant = new Date().toISOString();
    result = await withOwnedPilotServers(roots, async scope => {
      assertSource(roots.before, input.beforeCommit);
      assertSource(roots.after, input.afterCommit);
      assert(scope.servers.before.buildId && scope.servers.before.receiptSha256, "Before build identity is missing");
      assert(scope.servers.after.buildId && scope.servers.after.receiptSha256, "After build identity is missing");
      const origins = [scope.servers.before.origin, scope.servers.after.origin];
      const auth = await localPilotProofLogin(origins[0], scope.signal);
      return withPilotProofProxy(origins, async proxy => {
        const browser = await chromium.launch({ args: ["--disable-gpu", "--force-color-profile=srgb"], proxy: { server: proxy.server, bypass: "" } });
        const abort = () => { void browser.close(); };
        scope.signal.addEventListener("abort", abort, { once: true });
        const errors: string[] = [];
        const excludedResources: string[] = [];
        const captures: Record<"before" | "after", FocusedCodeSiteSnapshot[]> = { before: [], after: [] };
        const differences: { id: string; width: number; fields: string[]; pixels: Awaited<ReturnType<typeof pixelDifference>> | null }[] = [];
        async function capture(role: "before" | "after", width: number, item: AcademyProofDocumentCase, storageState: PilotProofStorageState) {
          scope.signal.throwIfAborted();
          const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, storageState,
            reducedMotion: "reduce", serviceWorkers: "block", proxy: { server: proxy.server, bypass: "" } });
          const observations: AcademyProofNetworkObservations = { errors, excludedResources, forwardedDocuments: [], redirects: [] };
          await installAcademyProofGuard(context, origins, proxy,
            { clubId: proof.clubId, documentAllowed: async origin => origins.includes(origin) }, observations);
          try {
            const page = await context.newPage();
            await page.clock.setFixedTime(new Date(instant));
            const finish = observePilotProofPage(page, fixtureImages);
            const reads: Record<string, number> = {};
            page.on("request", (request: Request) => {
              const target = new URL(request.url());
              if (target.pathname.startsWith("/rest/v1/") || target.pathname.startsWith("/api/")) {
                const key = `${request.method()} ${target.pathname}`;
                reads[key] = (reads[key] ?? 0) + 1;
              }
            });
            const base = scope.servers[role].origin;
            const response = await page.goto(`${base}${item.path}`);
            assert.equal(response?.status(), 200, `${role} ${item.id} did not render successfully`);
            assert.equal(new URL(page.url()).pathname, new URL(item.path, base).pathname, `${role} ${item.id} navigated to an unexpected route`);
            if (item.document.kind === "preview") {
              if (item.action && item.document.preview === "programs") {
                const navigation = page.getByRole("navigation", { name: "Program pages", exact: true });
                await expect(navigation).toBeVisible();
                await expect(page.frameLocator('iframe[title$="/programs preview"]').locator("body")).toBeVisible();
                const phoneChooser = navigation.locator("details.program-editor-navigation-phone");
                const phoneVisible = await phoneChooser.isVisible();
                if (phoneVisible) await phoneChooser.locator("summary").click();
                const controls = phoneVisible ? phoneChooser : navigation.locator(".program-editor-navigation-desktop");
                await controls.getByRole("button", { name: item.action, exact: false }).click();
                if (phoneVisible && await phoneChooser.getAttribute("open") !== null) await phoneChooser.locator("summary").click();
              } else if (item.action) {
                const action = page.getByRole("button", { name: item.action, exact: false }).first();
                await action.click();
                await expect(action).toHaveAttribute("aria-current", "page");
              }
              const device = page.getByRole("button", { name: width === 390 ? "Phone" : "Desktop", exact: true });
              if (await device.count()) await device.first().click();
            }
            const ready = item.frame ? page.frameLocator(`iframe[title$=${JSON.stringify(item.frame)}]`).locator("body") : page.locator(item.selector).first();
            await expect(ready).toBeVisible({ timeout: 60_000 });
            const content = item.document.kind === "public" ? page.locator("main").first() : ready;
            if (item.text) await expect(content).toContainText(item.text, { ignoreCase: true, timeout: 30_000 });
            if (item.document.kind === "preview") await expect.poll(async () => (await content.innerText()).trim().length, { timeout: 30_000 }).toBeGreaterThan(10);
            if (item.id === "preview.shop") {
              await expect(content).toContainText("Home kit pilot", { timeout: 30_000 });
              const photos = content.locator('[data-shop-editor-target="photos"] img');
              await expect(photos).toHaveCount(2);
              await photos.evaluateAll(async images => Promise.all(images.map(async image => {
                if (!(image instanceof HTMLImageElement)) throw new Error("Shop photo is not an image");
                await image.decode();
                if (!image.naturalWidth) throw new Error("Shop photo did not decode");
              })));
            }
            await content.evaluate(async element => {
              await element.ownerDocument.fonts.ready;
              for (const image of Array.from(element.querySelectorAll("img"))) {
                if (!image.complete) await new Promise<void>((resolve, reject) => {
                  image.addEventListener("load", () => resolve(), { once: true });
                  image.addEventListener("error", () => reject(new Error("Proof image failed")), { once: true });
                });
                if (!image.naturalWidth) throw new Error("Proof image has no decoded content");
                await image.decode();
              }
              await Promise.all(element.ownerDocument.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
                .map(animation => animation.finished.catch(() => undefined)));
            });
            await finish.waitForIdle();
            if (item.document.kind === "public") {
              await page.evaluate(async () => {
                for (let offset = 0; offset < document.documentElement.scrollHeight; offset += window.innerHeight * 0.75) {
                  window.scrollTo({ top: offset, behavior: "instant" });
                  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
                }
                window.scrollTo({ top: 0, behavior: "instant" });
              });
            }
            await content.scrollIntoViewIfNeeded();
            const settlingStarted = Date.now();
            let previousStyles = "", stableSince = Date.now();
            await expect.poll(async () => {
              const styles = await content.evaluate(element => JSON.stringify(Array.from(element.querySelectorAll<HTMLElement>("[style]"))
                .filter(node => node.style.opacity || node.style.transform)
                .map(node => [getComputedStyle(node).opacity, getComputedStyle(node).transform])));
              if (styles !== previousStyles) { previousStyles = styles; stableSince = Date.now(); }
              return Date.now() - settlingStarted >= 1500 && Date.now() - stableSince >= 300;
            }, { timeout: 10_000, intervals: [100] }).toBe(true);
            await page.mouse.move(0, 0);
            await content.evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView?.requestAnimationFrame(() => element.ownerDocument.defaultView?.requestAnimationFrame(() => resolve()))));
            const state = await content.evaluate(element => ({
              text: (element as HTMLElement).innerText,
              links: Array.from(element.querySelectorAll("a[href]")).filter(link => !!link.getClientRects().length).map(link => [link.textContent, link.getAttribute("href")] as [string | null, string | null]),
              headings: Array.from(element.querySelectorAll("h1,h2,h3")).filter(heading => !!heading.getClientRects().length).map(heading => ({ text: heading.textContent,
                font: getComputedStyle(heading).fontFamily, color: getComputedStyle(heading).color, size: getComputedStyle(heading).fontSize })),
            }));
            const controls = await page.locator("main button, main [role=button]").evaluateAll(elements => elements.filter(element => !!element.getClientRects().length).map(element => ({
              text: (element as HTMLElement).innerText, role: element.getAttribute("role"), current: element.getAttribute("aria-current"), pressed: element.getAttribute("aria-pressed"),
              disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
            })));
            const screenshot = join(output, `${role}-${width}-${item.id}.png`);
            const bytes = await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
            const resource = await finish();
            assert.deepEqual(observations.errors, [], `${role} ${item.id} had guarded route errors`);
            assert.deepEqual(observations.excludedResources.filter(value => !value.includes("/_vercel/insights/") && !/(b-cdn\.net|bunnycdn\.com|mediadelivery\.net)/.test(value)), [], `${role} ${item.id} loaded unexpected external resources`);
            return { id: item.id, width, screenshotSha256: hash(bytes), text: state.text, links: state.links, headings: state.headings, controls, browserReads: reads,
              redirects: observations.redirects.map(redirect => ({ from: new URL(redirect.from).pathname + new URL(redirect.from).search,
                to: new URL(redirect.to).pathname + new URL(redirect.to).search, status: redirect.status })),
              fonts: resource.fonts, css: resource.css, images: resource.images } satisfies FocusedCodeSiteSnapshot;
          } finally { await context.close(); }
        }
        try {
          for (const width of [1440, 390]) for (const item of documents) {
            const storageState = item.document.kind === "public" ? { cookies: [], origins: [] } : auth;
            const before = await capture("before", width, item, storageState);
            const after = await capture("after", width, item, storageState);
            captures.before.push(before);
            captures.after.push(after);
            const fields = compareFocusedCodeSiteSnapshots(before, after);
            if (fields.length) {
              const pixels = fields.includes("screenshotSha256") ? await pixelDifference(join(output, `before-${width}-${item.id}.png`), join(output, `after-${width}-${item.id}.png`), join(output, `diff-${width}-${item.id}.png`)) : null;
              differences.push({ id: item.id, width, fields, pixels });
            }
          }
          assert.deepEqual(errors, [], "Guarded parity network errors");
          await proof.assertPreserved(initial);
          await scope.verify();
          assertSource(roots.before, input.beforeCommit);
          assertSource(roots.after, input.afterCommit);
          const report = { verdict: differences.length ? "FAIL" : "PASS", scope: "focused-code-site-pre-post-parity", source: { before: input.beforeCommit, after: input.afterCommit },
            builds: scope.servers, fixture: { clubId: proof.clubId, recoveryFile: proof.recoveryFile, instant },
            documents: documents.map(item => item.id), widths: [1440, 390], captures, differences,
            excludedResources: [...new Set(excludedResources)].sort(),
            limits: ["Focused anonymous public and owner admin preview parity only; the complete 28-document and role matrix remains separate.",
              "No A/B/A retention, hosted traffic, provider transport, physical-device, or production acceptance claim."] };
          const reportFile = join(output, "report.json");
          writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
          assert.equal(differences.length, 0, `Focused parity differences; inspect ${reportFile}`);
          return { report: reportFile, captures: captures.before.length + captures.after.length };
        } finally { scope.signal.removeEventListener("abort", abort); await browser.close(); }
      });
    }, { hostname: "pilot.localhost" });
    await proof.assertPreserved(initial);
  } catch (error) { primaryFailure = error; throw error; }
  finally {
    try { await proof.close(); } catch (cleanupError) {
      if (primaryFailure !== undefined) throw new AggregateError([primaryFailure, cleanupError], "Code site parity and cleanup failed");
      throw cleanupError;
    }
  }
  console.log(JSON.stringify({ verdict: "PASS", ...result as object }));
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
